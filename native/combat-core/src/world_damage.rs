//! Current Web synchronous ship death closure. Host lives in Rust and reads
//! then-live state; the outer world transaction owns rollback and frame output.
use crate::{contact::{self, Point}, explosion_effects::{Allegiance, Collision, Identity, Payload, Spec as ExplosionSpec}, lifecycle, motion, random::Random, ship_state::{self, Notice, ShipState}, state::Body};
use std::{collections::BTreeMap, f64::consts::PI};

pub const FIGHTER:u32=1; pub const FRIGATE:u32=2; pub const DESTROYER:u32=3;
pub const CRUISER:u32=4; pub const CAPITAL:u32=5;

#[derive(Clone)]
pub struct Spec {
    pub id:String, pub size:Option<u32>, pub radius:f64, pub bounds:Vec<Point>,
    pub min_pieces:f64, pub max_pieces:f64, pub mount_slots:Vec<u32>,
    pub explosion_color:[u8;3], pub flash_color:[u8;3], pub debris_color:[u8;3],
}
#[derive(Clone)]
pub struct Ship {
    pub identity:Identity, pub dead:bool, pub attached:bool, pub transient:bool,
    pub player:bool, pub team:u32, pub children:Vec<Identity>,
    pub position:Point, pub velocity:Point, pub shield_center:Point,
    pub facing:f64, pub angular:f64, pub max_flux:f64, pub cr_taken:f64,
    pub explosion_damage:f64, pub explosion_radius:f64, pub break_probability:f64,
    pub decals_suppressed:bool, pub ship_name:String, pub hull_name:String, pub spec:Spec,
}
#[derive(Clone)]
pub struct Puff {pub texture:u32,pub start:f64,pub end:f64,pub rotation:f64,pub offset:Point,pub velocity:Point}
#[derive(Clone)]
pub struct Flash {pub diameter:f64,pub core:Option<f64>,pub color:[u8;3],pub duration:f64,pub velocity:Point}
#[derive(Clone)]
pub struct Flare {pub width:f64,pub height:f64,pub color:[u8;3],pub velocity:Point}
#[derive(Clone)]
pub struct VisualExplosion {
    pub id:f64,pub source_spec:String,pub position:Point,pub diameter:f64,pub duration:f64,
    pub color:[u8;3],pub puffs:Vec<Puff>,pub puff_duration:f64,pub flash:Flash,pub flare:Option<Flare>,
    /// Pure presentation replay descriptor; factory still consumed all samples.
    pub puff_cursor:f64,pub velocity:Point,
}
pub fn explosion_puffs(diameter:f64,random:&mut Random,rings:bool,velocity:Point)->Vec<Puff>{
    let base=20.0+60.0*diameter/500.0;
    let count=(((diameter/2.0/(base*0.66)).powi(2)*6.0).max(5.0)).ceil() as usize;
    let mut puffs=Vec::with_capacity(count);
    for i in 0..count{
        let mut texture=(random.next()*4.0).floor()as u32;
        if texture==3{texture=(random.next()*4.0).floor()as u32;}
        if texture==3&&!rings{texture=(random.next()*3.0).floor()as u32;}
        let mut start=base*(1.0+random.next());let mut end=start*1.25;
        if texture==3{end=start*3.0;start=end/10.0;}
        let angle=random.next()*PI*2.0;let rotation=random.next()*PI*2.0;
        let distance=if texture==3||i<5{0.0}else{diameter/4.0*random.next()};
        let speed=10.0+random.next()*20.0*diameter/500.0;
        puffs.push(Puff{texture,start,end,rotation,offset:[angle.cos()*distance,angle.sin()*distance],
            velocity:if texture==3{velocity}else{[angle.cos()*speed+velocity[0],angle.sin()*speed+velocity[1]]}});
    }puffs
}
pub fn ship_explosion_visual(s:&Ship,random:&mut Random)->VisualExplosion{
    let fighter=s.spec.size==Some(FIGHTER);let scale=match s.spec.size{Some(CAPITAL)=>1.7,Some(CRUISER|DESTROYER)=>1.5,_=>1.0};
    let diameter=s.spec.radius.sqrt()*15.0*if fighter{1.75}else{4.0}*scale;
    let flash=s.spec.radius.sqrt()*60.0*if fighter{0.5}else{1.0}*scale;
    let large=!fighter&&s.spec.size!=Some(FRIGATE);let duration=if fighter{1.5}else if large{2.25}else{2.0};
    let id=random.next();let puff_cursor=random.cursor;let puffs=explosion_puffs(diameter,random,true,s.velocity);
    VisualExplosion{id,source_spec:s.spec.id.clone(),position:s.shield_center,diameter,duration,color:s.spec.explosion_color,
        puffs,puff_cursor,velocity:s.velocity,puff_duration:if fighter{1.0}else{2.0},
        flash:Flash{diameter:flash*3.0,core:if s.spec.size==Some(FRIGATE){Some(flash*0.5)}else{None},color:s.spec.flash_color,duration:1.5,velocity:s.velocity},
        flare:if large{Some(Flare{width:diameter*0.47786722*4.0*scale,height:diameter*0.47786722*1.6*scale,color:s.spec.flash_color,velocity:s.velocity})}else{None}}
}
pub fn ship_explosion_payload(s:&Ship,random:&mut Random)->Option<(Payload,ExplosionSpec)>{
    if s.spec.size==Some(FIGHTER){return None;}
    let damage=s.max_flux*(0.5+0.5*random.next())*s.explosion_damage;
    if !(damage>0.0){return None;}let id=random.next();
    let spec=ExplosionSpec{duration:0.1,radius:s.spec.radius+s.spec.radius.min(200.0)*s.explosion_radius,
        core:s.spec.radius,minimum_fraction:0.0,collision:Collision::ShipsAndAsteroids};
    Some((Payload{identity:Identity{id,generation:s.identity.generation},source_ship:s.identity.id as u32,
        allegiance:Allegiance{team:Some(s.team),player:Some(s.player)},damage,damage_type:2,soft_flux:false,
        position:s.position,previous:s.position,velocity:s.velocity,radius:0.0,range_remaining:0.0,rocket:false,
        flare:false,did_damage:false,moving_ray:false,intercepts_missiles:false,target_projectile:None,
        pass_through_missiles:false,damaged_projectiles:Vec::new(),void_blocked_root:None,source_binding:None},spec))
}
#[derive(Clone)]
pub struct Debris {pub position:Point,pub velocity:Point,pub rotation:f64,pub angular:f64,pub size:f64,pub life:f64,pub color:[u8;3],pub texture:u32,pub glowing:bool}
pub fn debris(position:Point,count:usize,color:[u8;3],speed:f64,random:&mut Random)->Vec<Debris>{
    let mut particles=Vec::with_capacity(count);for _ in 0..count{
        let angle=random.next()*PI*2.0;let speed=(0.35+random.next()*0.65)*speed;
        let size=8.0*(0.8+random.next()*0.4);let glowing=random.next()>0.35;
        let texture=(random.next()*4.0).floor()as u32;
        let color=if glowing{[255,(160.0+random.next()*85.0).floor()as u8,80]}else{color};
        let life=1.4*(0.7+random.next()*0.4);let rotation=random.next()*PI*2.0;let angular=(random.next()-0.5)*8.0;
        particles.push(Debris{position,velocity:[angle.cos()*speed,angle.sin()*speed],size,glowing,texture,color,life,rotation,angular});
    }particles
}
#[derive(Clone)]
pub struct ArmorParticle {pub position:Point,pub velocity:Point,pub size:f64}
pub fn armor_particles(position:Point,damage:f64,random:&mut Random)->Vec<ArmorParticle>{
    if !damage.is_finite()||damage<=0.0{return Vec::new();}let mut damage=damage.min(100.0);
    if damage<10.0&&random.next()*10.0<damage{damage=10.0;}
    let mut particles=Vec::new();for _ in 0..(damage/10.0).floor()as usize{
        let size=(random.next()*3.0+3.0).floor();let angle=random.next()*PI*2.0;let radius=random.next()*10.0;
        let offset=[angle.cos()*radius,angle.sin()*radius];let velocity=[offset[0]*3.0*random.next(),offset[1]*3.0*random.next()];
        particles.push(ArmorParticle{position:[position[0]+offset[0],position[1]+offset[1]],velocity,size});
    }particles
}
#[derive(Clone)]
pub struct Breakup {pub remaining:u32,pub interval:f64,pub elapsed:f64,pub next_interval:f64}
#[derive(Clone)]
pub struct Hulk {pub id:f64,pub source:Identity,pub position:Point,pub velocity:Point,pub facing:f64,pub angular:f64,
    pub bounds:Vec<Point>,pub slots:Vec<u32>,pub radius:f64,pub breakup:Option<Breakup>}
pub fn choose_piece_count(min:f64,max:f64,random:&mut Random)->u32{
    let gaussian=(-2.0*(1.0-random.next()).max(1e-12).ln()).sqrt()*(2.0*PI*random.next()).cos();
    let unit=(gaussian*0.2+0.5).clamp(0.0,1.0);(min+unit*(max-min)+0.5).floor().max(1.0)as u32
}
#[derive(Clone)]
pub struct Loss {pub identity:Identity,pub ship_name:String,pub hull_name:String,pub team:u32,pub time:f64}
#[derive(Clone,Default)]pub struct Losses{pub entries:Vec<Loss>}
impl Losses{pub fn push(&mut self,loss:Loss){self.entries.push(loss);if self.entries.len()>64{self.entries.remove(0);}}}
#[derive(Clone)]
pub enum Output{
    ExplosionSound{source:Identity,position:Point,volume:f64},LargeDisabledSound{source:Identity,position:Point},
    Explosion(VisualExplosion),Radio{flagship:bool},Floating{flagship:bool,position:Point},
    Debris(Vec<Debris>),CameraShake{amount:f64,duration:f64},Hulk(Hulk),
    ArmorParticles{source:Identity,local:Point,damage:f64,particles:Vec<ArmorParticle>},
}
/// Mutations are synchronous Rust calls. Source records must survive removal
/// from the active roster. Every Result error rolls back the whole outer step.
pub trait Host{
    fn ship(&self,id:Identity)->Option<Ship>;
    fn suppressed(&self)->bool;
    fn player_ship(&self)->Identity;fn enemy_ship(&self)->Identity;
    fn time(&self)->f64;
    fn mark_dead(&mut self,id:Identity)->Result<(),u32>;
    fn force_hull_zero(&mut self,id:Identity)->Result<(),u32>;
    /// Includes clearInput gravity onInterrupt, vent cancel, shield down,
    /// ordered allSystems onInterrupt + real system disabled flags.
    fn shutdown(&mut self,id:Identity)->Result<(),u32>;
    fn loss(&mut self,loss:Loss);fn fighter_kill(&mut self,player_attacker:bool);
    /// MUST apply immediately, including recursive destroy calls. Recording a
    /// deferred damage event is not a valid implementation of this contract.
    fn spawn_explosion(&mut self,p:Payload,spec:ExplosionSpec,exclude:Identity,random:&mut Random,visual:&mut Random)->Result<(),u32>;
    fn prepare_hulk(&mut self,id:Identity,bounds:&[Point],visual:&mut Random)->Result<(),u32>;
    fn armor_disable(&mut self,id:Identity,local:Point,raw:f64,cr:f64,visual:&mut Random)->Result<f64,u32>;
    fn output(&mut self,event:Output);
    fn visual_output(&mut self,event:Output,_visual:&mut Random)->Result<(),u32>{self.output(event);Ok(())}
}
pub fn create_hulk<H:Host>(s:&Ship,host:&mut H,visual:&mut Random)->Result<Option<Hulk>,u32>{
    if s.spec.size==Some(FIGHTER)&&visual.next()>=0.5{return Ok(None);}
    let breaks=visual.next()<s.break_probability;
    let remaining=if breaks{choose_piece_count(s.spec.min_pieces,s.spec.max_pieces,visual)-1}else{0};
    let interval=if remaining>0{0.33/remaining as f64}else{0.0};
    if remaining>0{host.prepare_hulk(s.identity,&s.spec.bounds,visual)?;}
    let id=visual.next_id();let breakup=if remaining>0{Some(Breakup{remaining,interval,elapsed:0.0,next_interval:interval*(0.5+0.5*visual.next())})}else{None};
    let mut slots=Vec::new();for &slot in &s.spec.mount_slots{if !slots.contains(&slot){slots.push(slot);}}
    Ok(Some(Hulk{id,source:s.identity,position:s.position,velocity:s.velocity,facing:s.facing,angular:s.angular,
        bounds:s.spec.bounds.clone(),slots,radius:s.spec.radius,breakup}))
}
pub fn disable_hulk<H:Host>(s:&Ship,host:&mut H,visual:&mut Random)->Result<(),u32>{
    if !s.dead||s.decals_suppressed{return Ok(());}let ordinal=s.spec.size.unwrap_or(FRIGATE);if ordinal<=FRIGATE{return Ok(());}
    let apply=|host:&mut H,visual:&mut Random,local:Point,raw:f64|->Result<(),u32>{
        let damage=host.armor_disable(s.identity,local,raw,s.cr_taken,visual)?;
        let offset=contact::rotate(local,s.facing);let point=[s.position[0]+offset[0],s.position[1]+offset[1]];
        let particles=armor_particles(point,damage,visual);host.output(Output::ArmorParticles{source:s.identity,local,damage,particles});Ok(())
    };
    apply(host,visual,[0.0;2],2000.0)?;
    for _ in 0..10{
        let raw=ordinal as f64*500.0*(0.5+0.5*visual.next());
        let world=[s.spec.radius*(visual.next()-0.5),s.spec.radius*(visual.next()-0.5)];
        apply(host,visual,contact::rotate(world,-s.facing),raw)?;
    }Ok(())
}
pub fn destroy<H:Host>(id:Identity,host:&mut H,random:&mut Random,visual:&mut Random)->Result<bool,u32>{
    let s=host.ship(id).ok_or(4u32)?;if s.dead||host.suppressed(){return Ok(false);}
    host.mark_dead(id)?;
    for child in s.children{let child_ship=host.ship(child).ok_or(4u32)?;if !child_ship.dead{host.force_hull_zero(child)?;destroy(child,host,random,visual)?;}}
    host.shutdown(id)?;
    let s=host.ship(id).ok_or(4u32)?;let fighter=s.spec.size==Some(FIGHTER);
    if !fighter&&!s.attached&&!s.transient{
        host.loss(Loss{identity:id,ship_name:s.ship_name.clone(),hull_name:s.hull_name.split(" (").next().unwrap_or("").to_owned(),team:s.team,time:host.time()});
    }
    host.output(Output::ExplosionSound{source:id,position:s.position,volume:if fighter{0.45}else{0.95}});
    if s.spec.radius>80.0{host.output(Output::LargeDisabledSound{source:id,position:s.position});}
    host.output(Output::Explosion(ship_explosion_visual(&s,visual)));
    if id==host.player_ship(){host.visual_output(Output::Radio{flagship:true},visual)?;host.visual_output(Output::Floating{flagship:true,position:s.position},visual)?;}
    else if id==host.enemy_ship(){host.visual_output(Output::Radio{flagship:false},visual)?;host.visual_output(Output::Floating{flagship:false,position:s.position},visual)?;}
    else if fighter{host.fighter_kill(!s.player);}
    if let Some((payload,spec))=ship_explosion_payload(&s,random){host.spawn_explosion(payload,spec,id,random,visual)?;}
    host.output(Output::Debris(debris(s.position,if fighter{8}else{45},s.spec.debris_color,if fighter{100.0}else{220.0},visual)));
    if !fighter{host.output(Output::CameraShake{amount:25.0,duration:0.8});}
    // Read again after the chain; root callbacks can mutate retained dead hulls.
    let s=host.ship(id).ok_or(4u32)?;
    if let Some(hulk)=create_hulk(&s,host,visual)?{host.output(Output::Hulk(hulk));disable_hulk(&s,host,visual)?;}
    Ok(true)
}

/// Generation-safe helpers for a Host backed by actual resident Body/ShipState.
pub fn body_index(bodies:&[Body],id:Identity)->Result<usize,u32>{
    bodies.iter().position(|b|b.id as f64==id.id&&b.handle.generation==id.generation).ok_or(4)
}
pub fn mark_body_dead(body:&mut Body)->Result<(),u32>{body.ship.as_mut().ok_or(8u32)?.flags|=ship_state::DEAD;Ok(())}
pub fn force_body_hull_zero(body:&mut Body)->Result<(),u32>{body.ship.as_mut().ok_or(8u32)?.armor.as_mut().ok_or(8u32)?.data[14]=0.0;Ok(())}
pub fn clear_motion(body:&mut Body){for index in [motion::TURN,motion::BRAKE,motion::THROTTLE,motion::STRAFE]{body.motion[index]=0.0;}}
/// Caller performs the two onInterrupt boundaries (clearInput gravity systems,
/// then each allSystems entry) at the matching lifecycle::interrupt invocation.
/// Fire/group/control input sidecars belong to Host; clear them before this call.
pub fn shutdown_resources<F>(ship:&mut ShipState,specs:&BTreeMap<u32,lifecycle::Spec>,events:&mut Vec<Notice>,mut interrupt:F)->Result<(),u32>
where F:FnMut(&mut lifecycle::System)->Result<(),u32>{
    if ship.flux.venting{ship.flux_operation(8,0.0,false,events);}
    if let Some(shield)=&mut ship.shield{shield.set_active(false,&mut ship.flux);}ship.sync_shield();
    for system in &mut ship.systems{
        let spec=specs.get(&system.spec).ok_or(8u32)?;interrupt(system)?;
        system.interrupt(spec);system.disabled=true;
        events.push(Notice{system:system.id,kind:ship_state::INTERRUPT,value:0.0,detail:[0.0;2]});
    }Ok(())
}
pub fn prepare_resident_hulk(ship:&mut ShipState,bounds:&[Point],visual:&mut Random)->Result<(),u32>{
    let armor=ship.armor.as_mut().ok_or(8u32)?;
    for c in 0..armor.data[0]as i64{for r in 0..armor.data[1]as i64{
        let center=[armor.data[5]+(c as f64+0.5)*armor.data[2],armor.data[6]+(r as f64+0.5)*armor.data[3]];
        // Shared wreck query has the actual doubled-bridge/boundary tolerance.
        let mut touches=false;for dx in [-0.6,0.0,0.6]{for dy in [-0.6,0.0,0.6]{
            let p=[center[0]+dx*armor.data[2],center[1]+dy*armor.data[2]];
            if crate::explosion_effects::wreck_hit(p,p,bounds)==Some(0.0){touches=true;break;}
        }if touches{break;}}
        if touches{armor.set_cell(c,r,0.0);}
    }}armor.sync_scars(visual);Ok(())
}
pub fn resident_armor_disable(ship:&mut ShipState,point:Point,raw:f64,cr:f64,visual:&mut Random,notices:&mut Vec<Notice>)->Result<f64,u32>{
    // Do not apply hull, components, flux or combat stats to this dead hull.
    let result=ship.armor_impact(&[point[0],point[1],raw*cr,2.0,1.0,raw,0.0,0.0],visual,notices)?;Ok(result[0])
}

#[derive(Clone,Default)]pub struct Stats{pub player:[f64;18],pub enemy:[f64;18]}
#[derive(Clone,Copy)]pub enum Layer{Shield,Armor,Hull}
impl Stats{
    fn side(&mut self,player:bool)->&mut[f64;18]{if player{&mut self.player}else{&mut self.enemy}}
    pub fn shot_fired(&mut self,player:bool){self.side(player)[9]+=1.0;}
    pub fn shot_hit(&mut self,player:bool){self.side(player)[10]+=1.0;}
    pub fn damage(&mut self,player:bool,kind:u32,amount:f64,layer:Layer,emp:f64,target:Option<bool>){
        let attacker=self.side(player);attacker[0]+=amount;if emp>0.0{attacker[11]+=emp;}
        if let Some(field)=match kind{0=>Some(3),1=>Some(1),2=>Some(2),3=>Some(4),_=>None}{attacker[field]+=amount;}
        match layer{Layer::Shield=>self.side(target.unwrap_or(!player))[5]+=amount,
            Layer::Armor=>self.side(target.unwrap_or(!player))[6]+=amount,
            Layer::Hull=>{self.side(player)[7]+=amount;self.side(target.unwrap_or(!player))[8]+=amount;}}
    }
    pub fn intercepted(&mut self,player:bool){self.side(player)[12]+=1.0;}
    pub fn fighter_kill(&mut self,player:bool){self.side(player)[13]+=1.0;self.side(!player)[14]+=1.0;}
    pub fn fighter_rebuilt(&mut self,player:bool){self.side(player)[15]+=1.0;}
    pub fn overload(&mut self,player:bool){self.side(player)[16]+=1.0;self.side(!player)[17]+=1.0;}
    pub fn reset(&mut self){self.player.fill(0.0);self.enemy.fill(0.0);}
    pub fn finalize(&self,victory:bool,duration:f64,player_spec:String,enemy_spec:String,player_ratio:f64,enemy_ratio:f64)->ResultStats{
        ResultStats{victory,duration,player_spec,enemy_spec,player_hull_damage:(1.0-player_ratio).clamp(0.0,1.0),
            enemy_hull_damage:(1.0-enemy_ratio).clamp(0.0,1.0),stats:self.clone()}
    }
}
#[derive(Clone)]pub struct ResultStats{pub victory:bool,pub duration:f64,pub player_spec:String,pub enemy_spec:String,pub player_hull_damage:f64,pub enemy_hull_damage:f64,pub stats:Stats}
