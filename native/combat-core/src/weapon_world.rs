//! Source weapon hit factories and synchronous world contact helpers.
//! Static Visual is installed once with Delivery. No JavaScript RNG or solver.
use crate::{battle::{Beam,Ordnance},contact::{self,Point},explosion_effects as e,projectile::Projectile,random::Random,state::{Body,Handle},ship_state::Notice,world_owner as w};
use std::{collections::{BTreeMap,BTreeSet},f64::consts::PI};
#[derive(Clone,Debug)]pub struct MissileVisual{pub radius:f64,pub color:[u8;3],pub hit_glow:bool}
#[derive(Clone,Debug)]pub struct Visual{
    pub hit_glow_radius:f64,pub fringe:[u8;4],pub core:[u8;4],pub width:f64,pub texture:u32,pub scroll:f64,pub pixels:f64,
    pub moving_speed:Option<f64>,pub source_move_speed:bool,pub missile:Option<MissileVisual>,
    /// 0=source hit pair, 1=Adun, 2=Ark, 3=Ark solar lance.
    pub custom:u32,pub heavy_torpedo:bool,pub fuse_sound:String,pub fuse_color:[u8;3],
}
impl Default for Visual{fn default()->Self{Self{hit_glow_radius:0.0,fringe:[255;4],core:[255;4],width:0.0,texture:0,scroll:-256.0,pixels:1.0,moving_speed:None,source_move_speed:true,missile:None,custom:0,heavy_torpedo:false,fuse_sound:"flak_explosion".into(),fuse_color:[255,155,125]}}}
impl Visual{pub fn valid(&self)->bool{[self.hit_glow_radius,self.width,self.scroll,self.pixels].into_iter().all(f64::is_finite)&&self.moving_speed.is_none_or(f64::is_finite)&&self.custom<=3&&self.texture<=2&&self.missile.as_ref().is_none_or(|m|m.radius.is_finite())&&!self.fuse_sound.is_empty()}}
#[derive(Clone,Debug)]pub struct Glow{pub id:f64,pub position:Point,pub velocity:Point,pub diameter:f64,pub life:f64,pub alpha:f64,pub color:[u8;3],pub custom:u32}
#[derive(Clone,Debug)]pub struct RayFade{pub id:f64,pub head:Point,pub tail:Point,pub direction:Point,pub speed:f64,pub life:f64,pub elapsed:f64,pub length:f64,pub width:f64,pub texture:u32,pub scroll:f64,pub pixels:f64,pub fringe:[u8;4],pub core:[u8;4]}
#[derive(Clone,Debug)]pub struct MissileExplosion{pub id:f64,pub position:Point,pub radius:f64,pub life:f64,pub rotation:f64,pub color:[u8;3]}
#[derive(Clone,Debug)]pub struct Floating{pub id:f64,pub position:Point,pub velocity:Point,pub text:String,pub color:[u8;3],pub size:f64,pub life:f64,pub maximum_life:f64}
#[derive(Clone)]pub enum Output{Sound{key:String,point:Point,volume:f64},CameraShake{amount:f64,duration:f64},HitGlows(Vec<Glow>),MovingRay(RayFade),MissileExplosion(MissileExplosion),Floating(Floating),Debris{category:u32,particles:Vec<crate::world_damage::Debris>}}
#[derive(Clone,Copy,Default)]pub struct Damage{pub shield:f64,pub armor:f64,pub hull:f64,pub emp:f64}
pub fn duration(d:f64)->f64{if d<50.0{d*0.01}else if d>100.0{0.5+(d-100.0)*0.01}else{0.5}.min(2.0)}
pub fn shield_glow(flux:f64,room:f64,eff:f64)->f64{let over=(flux-room.max(0.0)).max(0.0);if eff>0.0{flux-over/eff+over}else{flux}}
pub fn glow_size(base:f64,damage:f64,kind:u32,r:Damage)->f64{if damage<=0.0||base<=0.0{return base;}let(mut sd,mut ad,mut hd)=(r.shield,r.armor,r.hull);let mut bonus=0.0;
    match kind{1=>sd*=0.5,2=>{ad*=0.5;if ad>0.0{bonus=0.1;}},3=>{if hd>0.0{bonus=0.2*hd/(hd+ad);}sd*=2.0;ad*=2.0;hd*=2.0;},_=>{}}
    let mut total=sd+ad+hd;if total<=0.0{return base;}if total<damage{total=damage.min(total+r.emp);}let minimum=(15.0/base).max(0.67+bonus).min(1.0);base*(total/damage).max(minimum).min(1.5)
}
pub fn rocket(p:&Projectile)->bool{p.delivery.missile||p.guidance.as_ref().is_some_and(|g|g.rocket)}
pub fn hit_glows(p:&Projectile,point:Point,velocity:Point,result:Damage,random:&mut Random)->Vec<Glow>{let v=&p.delivery.visual;let missile=rocket(p)||p.delivery.spawn_type==4;
    if missile&&v.missile.as_ref().is_none_or(|s|!s.hit_glow){return Vec::new();}let mut base=if missile{v.missile.as_ref().unwrap().radius}else{v.hit_glow_radius};
    if !missile&&base==0.0{base=p.delivery.length*if p.delivery.spawn_type==2{0.5}else{2.0};}if !(base>0.0){return Vec::new();}if !missile{base*=1.0+random.next()*0.5;}
    let size=glow_size(base,p.base_damage,p.delivery.damage_type,result);let color=if missile{v.missile.as_ref().unwrap().color}else{v.fringe[..3].try_into().unwrap()};
    let mut make=|diameter:f64,brightness:f64,color:[u8;3]|Glow{id:random.next(),position:point,velocity,diameter,life:duration(diameter),alpha:(255.0*brightness).trunc()/255.0,color,custom:0};
    if v.custom>0{let mut glow=make(size*0.95,0.72,[255;3]);glow.custom=v.custom;glow.life=match v.custom{1=>0.18,2=>0.28,_=>0.48};return vec![glow];}
    vec![make(size*if missile{2.0}else{3.0},if missile{1.0}else{0.4},color),make(size*0.5,1.0,[255;3])]
}
pub fn ray_fade(p:&Projectile,point:Point,random:&mut Random)->Option<RayFade>{let v=&p.delivery.visual;if p.delivery.spawn_type!=2||v.source_move_speed{return None;}let speed=v.moving_speed.unwrap_or_else(||contact::length(p.velocity));let length=p.delivery.length.min(p.elapsed.max(0.0)*speed);
    if p.delivery.fade<=0.0||p.delivery.length<=0.0||speed<=0.0||length<=0.1{return None;}let direction=[p.angle.cos(),p.angle.sin()];Some(RayFade{id:random.next(),head:point,tail:[point[0]-direction[0]*length,point[1]-direction[1]*length],direction,speed,life:p.delivery.fade,elapsed:p.elapsed,length:p.delivery.length,width:if v.width>0.0{v.width}else{p.delivery.radius*2.0},texture:v.texture,scroll:v.scroll,pixels:v.pixels,fringe:v.fringe,core:v.core})}
pub fn missile_explosion(spec:&MissileVisual,point:Point,random:&mut Random)->Option<MissileExplosion>{if spec.radius<=0.0{return None;}Some(MissileExplosion{id:random.next(),position:point,radius:spec.radius,life:duration(spec.radius*2.0),rotation:random.next()*PI*2.0,color:spec.color})}
pub fn emit(world:&mut w::Owned,output:Output){world.emit(w::Output::Weapon(output));}
pub fn sound(world:&mut w::Owned,key:&str,point:Point,volume:f64){emit(world,Output::Sound{key:key.into(),point,volume});}
pub fn shake(world:&mut w::Owned,amount:f64,duration:f64){emit(world,Output::CameraShake{amount,duration});}
pub fn floating_damage(world:&mut w::Owned,point:Point,amount:f64,color:[u8;3],visual:&mut Random){if amount<1.0{return;}for f in &mut world.floating{if f.life>0.15&&f.color==color&&contact::length([f.position[0]-point[0],f.position[1]-point[1]])<75.0{
        let previous=f.text.parse::<f64>().unwrap_or(0.0);let total=previous+amount;f.text=format!("{}",(total+0.5).floor());f.life=(f.life+0.3).min(f.maximum_life);f.size=(11.0+total.sqrt()*0.35).min(22.0);let out=f.clone();emit(world,Output::Floating(out));return;}}
    let f=Floating{id:visual.next(),position:[point[0]+(visual.next()-0.5)*16.0,point[1]+(visual.next()-0.5)*16.0],velocity:[(visual.next()-0.5)*12.0,-32.0-visual.next()*14.0],text:format!("{}",(amount+0.5).floor()),color,size:(11.0+amount.sqrt()*0.35).max(12.0).min(18.0),life:1.35,maximum_life:1.35};world.floating.push(f.clone());emit(world,Output::Floating(f));
}
pub fn floating_text(world:&mut w::Owned,point:Point,text:&str,color:[u8;3],size:f64,life:f64,visual:&mut Random){let f=Floating{id:visual.next(),position:point,velocity:[0.0,-25.0],text:text.into(),color,size,life,maximum_life:life};world.floating.push(f.clone());emit(world,Output::Floating(f));}
pub fn advance_floating(floating:&mut Vec<Floating>,dt:f64){for i in(0..floating.len()).rev(){let f=&mut floating[i];f.life-=dt;f.position[0]+=f.velocity[0]*dt;f.position[1]+=f.velocity[1]*dt;let drag=(1.0-dt*1.1).max(0.0);f.velocity[0]*=drag;f.velocity[1]*=drag;if f.life<=0.0{floating.swap_remove(i);}}}
pub fn debris(world:&mut w::Owned,point:Point,count:usize,color:[u8;3],speed:f64,category:u32,visual:&mut Random){let mut particles=Vec::with_capacity(count);let(size,life)=match category{1=>(12.0,2.2),2=>(16.0,3.0),_=>(8.0,1.4)};for _ in 0..count{
    let angle=visual.next()*PI*2.0;let speed=(0.35+visual.next()*0.65)*speed;let size=size*(0.8+visual.next()*0.4);let glowing=visual.next()>0.35;let texture=(visual.next()*if category==0{4.0}else{2.0}).floor()as u32;
    let color=if glowing{[255,(160.0+visual.next()*85.0).floor()as u8,80]}else{color};let life=life*(0.7+visual.next()*0.4);let rotation=visual.next()*PI*2.0;let angular=(visual.next()-0.5)*8.0;
    particles.push(crate::world_damage::Debris{position:point,velocity:[angle.cos()*speed,angle.sin()*speed],rotation,angular,size,life,color,texture,glowing});
}emit(world,Output::Debris{category,particles});}
pub fn contact_profile(p:&Projectile,shield:bool)->(&'static str,f64,f64){if shield{return("shield_hit",0.45,if p.delivery.visual.heavy_torpedo{4.0}else if rocket(p){3.0}else{2.0});}
    let(key,volume)=if p.damage>=180.0{("armor_hit_heavy",0.7)}else if p.damage>=80.0{("armor_hit_solid",0.6)}else{("armor_hit_light",0.45)};(key,volume,(p.damage*0.04).min(15.0))}
pub fn glows(world:&mut w::Owned,p:&Projectile,point:Point,velocity:Point,result:Damage,visual:&mut Random){let entries=hit_glows(p,point,velocity,result,visual);if !entries.is_empty(){emit(world,Output::HitGlows(entries));}}
pub fn fade(world:&mut w::Owned,p:&Projectile,point:Point,visual:&mut Random){if let Some(f)=ray_fade(p,point,visual){emit(world,Output::MovingRay(f));}}
pub fn missile_visual(world:&mut w::Owned,p:&Projectile,point:Point,color:[u8;3],visual:&mut Random){if let Some(spec)=&p.delivery.visual.missile{if let Some(e)=missile_explosion(spec,point,visual){emit(world,Output::MissileExplosion(e));}}
    else if let Some(e)=crate::terrain_world::impact_explosion(point,35.0,color,true,2.0,[0.0;2],visual){world.emit(w::Output::Impact(e));}}
pub fn store(ord:&mut Ordnance,p:&Projectile)->bool{if let Some(q)=ord.projectiles.iter_mut().find(|q|q.serial==p.serial){*q=p.clone();true}else{false}}
pub fn spawn(host:&mut w::Host<'_>,p:&Projectile,point:Point,ship:Option<e::Identity>,asteroid:Option<e::Identity>,random:&mut Random,visual:&mut Random)->Result<(),u32>{if let Some(spec)=p.delivery.explosion{
    if spec.radius>0.0{let mut explosion=e::Explosion::new(w::payload(p),spec,point,ship,asteroid)?;explosion.referenced_projectile=Some(p.serial);
        let index=host.owned.explosions.len();host.owned.explosions.push(explosion.clone());explosion.apply(host,random,visual)?;host.owned.explosions[index]=explosion;}host.finish()?;}Ok(())}
pub fn environment(host:&mut w::Host<'_>,p:&Projectile,point:Point,velocity:Point,asteroid:Option<e::Identity>,random:&mut Random,visual:&mut Random)->Result<(),u32>{let(key,volume,amount)=contact_profile(p,false);sound(host.owned,key,point,volume);
    glows(host.owned,p,point,velocity,Damage{hull:p.damage,..Damage::default()},visual);fade(host.owned,p,point,visual);
    if rocket(p){e::Host::output(host,e::Output::DetachContrail{target:e::Identity{id:p.serial,generation:1}});if p.delivery.visual.missile.as_ref().is_none_or(|m|!m.hit_glow){missile_visual(host.owned,p,point,[255,160,40],visual);}}
    if let Some(effect)=p.delivery.effect.filter(|e|e.has_environment_hit()){if let Some(impact)=crate::weapon_effects::cosmetic(effect,point,velocity,p.angle,false){if host.owned.visual.listener.is_some(){host.owned.visual.cosmetic(impact.clone(),p.id)?;}host.ordnance.effect_records.push(crate::weapon_effects_owner::Record::Cosmetic(impact));}}
    spawn(host,p,point,None,asteroid,random,visual)?;shake(host.owned,amount,0.1);Ok(())
}
pub fn environment_with_terrain(bodies:&mut[Body],terrain:&mut crate::terrain_owner::Owned,ordnance:&mut Ordnance,specs:&BTreeMap<u32,crate::lifecycle::Spec>,world:&mut w::Owned,p:&Projectile,point:Point,velocity:Point,asteroid:Option<e::Identity>,random:&mut Random,visual:&mut Random,events:&mut Vec<(u32,Handle,Notice)>)->Result<(),u32>{
    std::mem::swap(&mut world.terrain,terrain);let result=environment(&mut w::Host{bodies,specs,ordnance,owned:world,events},p,point,velocity,asteroid,random,visual);std::mem::swap(&mut world.terrain,terrain);result
}
pub fn penetration(p:&Projectile,wreck:bool,radius:f64,hp:f64)->Option<f64>{let cfg=p.delivery.terrain_penetration?;if !radius.is_finite()||radius>cfg[0]||cfg[1]<=0.0{return None;}let cost=cfg[1].max(if wreck{radius*cfg[2]}else{hp});if cost.is_finite()&&p.damage>cost{Some(cost)}else{None}}
pub fn spend(p:&mut Projectile,cost:f64){let remainder=(1.0-cost/p.damage.max(0.001)).max(0.0);p.unfaded_damage*=remainder;p.unfaded_emp*=remainder;p.damage*=remainder;p.emp*=remainder;p.base_damage*=remainder;}
#[derive(Clone,Default)]pub struct BeamVisual{pub recorded:bool,pub was_shortened:bool,pub glow:f64,pub size_mult:f64,pub surface:Option<bool>,pub fx:f64,pub sound:f64,pub glow_written:bool,pub pulse_written:bool}
impl BeamVisual{
    pub fn advance(&mut self,dt:f64,active:bool,brighten:f64){self.glow=if self.was_shortened&&active{if brighten<=0.0{1.0}else{self.glow+dt/brighten}}else{self.glow-dt}.clamp(0.0,1.0);self.was_shortened=false;}
    pub fn shorten(&mut self,brighten:f64){self.was_shortened=true;if brighten<=0.0{self.glow=1.0;}}
    pub fn pulse(&mut self,shield:bool,dt:f64)->bool{self.pulse_written=true;self.fx=(self.fx-dt).max(0.0);self.sound=(self.sound-dt).max(0.0);let change=self.surface!=Some(shield);if change||self.fx<=0.0{self.fx=0.08;}let emit=change||self.sound<=0.0;self.surface=Some(shield);if emit{self.sound=0.18;}emit}
}
pub fn beam_glow(beam:&mut Beam,kind:u32,result:Damage){let radius=if beam.hit_radius>0.0{beam.hit_radius}else{beam.style.width*beam.brightness*3.0};if radius>0.0&&beam.damage_active{beam.visual.glow_written=true;beam.visual.size_mult=glow_size(radius,beam.base_damage*0.1,kind,result)/radius;}}
pub fn visual_output(world:&mut w::Owned,event:e::Output,visual:&mut Random)->Result<(),u32>{match event{
    e::Output::Radio{kind,count}=>{world.message("点防火控","PLAYER",&match kind{0=>format!("双管高射炮近炸拦截成功！引爆 {count} 枚来袭导弹！"),1=>"目标敌机已被双管高射炮破片弹幕彻底凌空撕碎！".into(),_=>return Err(8)},if kind==0{[140,255,180]}else{[120,255,140]},visual)?;world.emit(w::Output::Explosion(e::Output::Radio{kind,count}));}
    e::Output::Sparks{point,count,color}=>world.sparks(point,count,color,visual),
    e::Output::AuthenticExplosion{point,radius,color,..}=>{if let Some(e)=crate::terrain_world::impact_explosion(point,radius,color,true,2.0,[0.0;2],visual){world.emit(w::Output::Impact(e));}},
    e::Output::SourceExplosion{..}=>return Err(8),
    e::Output::FloatingDamage{point,amount,color}=>floating_damage(world,point,amount,color,visual),
    e::Output::FloatingText{point,kind}=>floating_text(world,point,if kind==0{"BURST INTERCEPTED"}else{"BOMBER SPLASHED"},if kind==0{[120,255,160]}else{[255,80,80]},if kind==0{12.0}else{14.0},if kind==0{0.85}else{1.2},visual),
    other=>world.emit(w::Output::Explosion(other)),
}Ok(())}
pub fn terrain_visual(world:&mut w::Owned,event:crate::terrain_world::Output,visual:&mut Random)->Result<(),u32>{match event{
    crate::terrain_world::Output::Floating{point,amount,color}=>floating_damage(world,point,amount,color,visual),
    crate::terrain_world::Output::Text{point}=>floating_text(world,point,"ASTEROID SHATTERED",[210,180,120],13.0,1.4,visual),
    other=>world.emit(w::Output::Terrain(other)),
}Ok(())}
pub fn death_visual(world:&mut w::Owned,event:crate::world_damage::Output,visual:&mut Random)->Result<(),u32>{match event{
    crate::world_damage::Output::Radio{flagship}=>{world.message(if flagship{"损管中控"}else{"战术火控"},if flagship{"HQ"}else{"PLAYER"},if flagship{"警告！旗舰核心动力炉发生灾难性熔毁！全员弃舰！"}else{"目标敌对主力舰已遭毁灭性击沉！正在发生解体殉爆！"},if flagship{[255,50,50]}else{[100,255,140]},visual)?;world.emit(w::Output::Death(crate::world_damage::Output::Radio{flagship}));}
    crate::world_damage::Output::Floating{flagship,position}=>{floating_text(world,position,if flagship{"HULL DESTROYED"}else{"TARGET DESTROYED"},if flagship{[255,45,45]}else{[120,255,160]},if flagship{22.0}else{20.0},if flagship{3.0}else{2.5},visual);world.emit(w::Output::Death(crate::world_damage::Output::Floating{flagship,position}));}
    other=>world.emit(w::Output::Death(other)),
}Ok(())}
pub fn ship_query(bodies:&[Body],p:&Projectile,world:&w::Owned,specs:&BTreeMap<u32,crate::lifecycle::Spec>)->Result<Option<(usize,contact::Hit)>,u32>{let mut best=None;
    for row in world.rows(bodies)?{let b=&bodies[row];let Some(s)=b.ship.as_ref().filter(|s|s.can_advance())else{continue;};let Some(c)=&s.combat else{continue;};
        if b.id==p.source||p.damaged_ships.contains(&w::identity(b))||p.player.is_some()&&c.team==p.team||c.collisionless(b)||crate::phase_runtime::phased_world(world,bodies,row,specs)?||s.live.get(crate::ship_effects::COLLISION_DISABLED)>0.0{continue;}
        if let Some(h)=contact::projectile(p.prev,p.pos,&b.motion,c.radius,&c.bounds,s.shield.as_ref()){if best.is_none_or(|(_,prior):(_,contact::Hit)|h.t<prior.t){best=Some((row,h));}}
    }Ok(best)
}
/// The default source collision frame retains its original cell membership.
/// Damage callbacks change the bodies used by narrowphase, never this grid.
pub struct ShipIndex{rows:Vec<usize>,cells:BTreeMap<(i64,i64),Vec<usize>>}
impl ShipIndex{
    pub fn capture(bodies:&[Body],world:&w::Owned,specs:&BTreeMap<u32,crate::lifecycle::Spec>)->Result<Self,u32>{
        let rows=world.rows(bodies)?;let mut cells:BTreeMap<(i64,i64),Vec<usize>>=BTreeMap::new();
        for(ordinal,&row)in rows.iter().enumerate(){if !ship_collidable(bodies,world,specs,row)?{continue;}let b=&bodies[row];let s=b.ship.as_ref().ok_or(8u32)?;let c=s.combat.as_ref().ok_or(8u32)?;
            let hull=c.bounds.iter().fold(c.radius,|r,p|r.max(p[0].hypot(p[1])));
            let shield=s.shield.as_ref().map_or(0.0,|sh|sh.data[29].hypot(sh.data[30])+sh.data[2].max(0.0));let radius=hull.max(shield);
            let min_x=cell(b.motion[0]-radius)?;let max_x=cell(b.motion[0]+radius)?;let min_y=cell(b.motion[1]-radius)?;let max_y=cell(b.motion[1]+radius)?;
            for y in min_y..=max_y{for x in min_x..=max_x{cells.entry((y,x)).or_default().push(ordinal);}}
        }Ok(Self{rows,cells})
    }
    fn broadphase(&self,p:&Projectile)->Result<Vec<usize>,u32>{let pad=p.delivery.radius.max(0.0);let min_x=cell(p.prev[0].min(p.pos[0])-pad)?;let max_x=cell(p.prev[0].max(p.pos[0])+pad)?;
        let min_y=cell(p.prev[1].min(p.pos[1])-pad)?;let max_y=cell(p.prev[1].max(p.pos[1])+pad)?;let mut touched=BTreeSet::new();
        // Range only occupied rows; roster ordinals restore the source tie order.
        for(&(y,x),bucket)in self.cells.range((min_y,i64::MIN)..=(max_y,i64::MAX)){if y>=min_y&&x>=min_x&&x<=max_x{touched.extend(bucket.iter().copied());}}
        Ok(touched.into_iter().map(|i|self.rows[i]).collect())
    }
    fn candidates(&self,host:&w::Host<'_>,p:&Projectile)->Result<Vec<usize>,u32>{let mut rows=Vec::new();for row in self.broadphase(p)?{let b=&host.bodies[row];let Some(c)=b.ship.as_ref().and_then(|s|s.combat.as_ref())else{continue;};
        if b.id!=p.source&&!p.damaged_ships.contains(&w::identity(b))&&!(p.player.is_some()&&c.team==p.team)&&ship_collidable(host.bodies,host.owned,host.specs,row)?{rows.push(row);}
    }Ok(rows)}
    pub fn query(&self,host:&w::Host<'_>,p:&Projectile)->Result<Option<(usize,contact::Hit)>,u32>{Ok(query_rows(host.bodies,p,&self.candidates(host,p)?))}
}
fn cell(v:f64)->Result<i64,u32>{let c=(v/384.0).floor();if !c.is_finite()||c<=i64::MIN as f64||c>=i64::MAX as f64{return Err(7);}Ok(c as i64)}
fn ship_collidable(bodies:&[Body],world:&w::Owned,specs:&BTreeMap<u32,crate::lifecycle::Spec>,row:usize)->Result<bool,u32>{let b=&bodies[row];let Some(s)=&b.ship else{return Ok(false);};let Some(c)=&s.combat else{return Ok(false);};
    Ok(s.flags&crate::ship_state::DEAD==0&&!c.collisionless(b)&&!crate::phase_runtime::phased_world(world,bodies,row,specs)?&&s.live.get(crate::ship_effects::COLLISION_DISABLED)<=0.0)
}
fn query_rows(bodies:&[Body],p:&Projectile,rows:&[usize])->Option<(usize,contact::Hit)>{let mut best=None;for &row in rows{let b=&bodies[row];let s=b.ship.as_ref()?;let c=s.combat.as_ref()?;
    if let Some(hit)=contact::projectile(p.prev,p.pos,&b.motion,c.radius,&c.bounds,s.shield.as_ref()){if best.is_none_or(|(_,prior):(_,contact::Hit)|hit.t<prior.t){best=Some((row,hit));}}
}best}
pub fn can_batch(p:&Projectile)->bool{p.delivery.batch_ship_contacts&&!rocket(p)&&p.delivery.fuse.is_none()&&p.delivery.explosion.is_none()&&!p.delivery.pass_fighters&&!p.guidance.as_ref().is_some_and(|g|g.flare)}
#[derive(Default)]pub struct ProjectileBatch{pending:Vec<Projectile>,expired:BTreeSet<u32>}
impl ProjectileBatch{
    pub fn push(&mut self,p:&Projectile,expired:bool){self.pending.push(p.clone());if expired{self.expired.insert(p.serial as u32);}}
    pub fn flush(&mut self,host:&mut w::Host<'_>,index:&ShipIndex,random:&mut Random,visual:&mut Random)->Result<(),u32>{
        if self.pending.is_empty(){return Ok(());}
        // Every candidate list and hit is frozen before the first damage commit.
        let mut queries=Vec::with_capacity(self.pending.len());for snapshot in self.pending.drain(..){let p=retained_projectile(host,&snapshot);let rows=index.candidates(host,&p)?;let hit=query_rows(host.bodies,&p,&rows);queries.push((p,rows,hit));}
        let mut consumed=BTreeSet::new();for(snapshot,rows,mut hit)in queries{let mut p=retained_projectile(host,&snapshot);
            if let Some((row,h))=hit{let shield_active=host.bodies[row].ship.as_ref().and_then(|s|s.shield.as_ref()).is_some_and(|sh|sh.active()&&sh.data[7]>5.0&&sh.data[2]>0.0&&sh.kind()!=crate::shield::NONE&&sh.kind()!=crate::shield::PHASE);
                if !ship_collidable(host.bodies,host.owned,host.specs,row)?||h.surface==contact::Surface::Shield&&!shield_active{let mut surviving=Vec::new();for row in rows{if ship_collidable(host.bodies,host.owned,host.specs,row)?{surviving.push(row);}}hit=query_rows(host.bodies,&p,&surviving);}
            }
            if let Some((row,h))=hit{let end=p.pos;let mut used=ship_contact(host,&mut p,row,h,random,visual)?;
                if !used&&h.surface==contact::Surface::Shield&&host.bodies[row].ship.as_ref().and_then(|s|s.shield.as_ref()).is_some_and(|sh|sh.void.is_some()){p.pos=end;used=projectile_ship_contacts_indexed(host,&mut p,index,random,visual)?;}
                store_retained(host,&p);if used{consumed.insert(p.serial as u32);}
            }
        }
        // Source impact remnants are created after ALL FIFO commits. Actual list
        // removal is reverse order and cannot resurrect an externally retired shot.
        for i in(0..host.ordnance.projectiles.len()).rev(){let serial=host.ordnance.projectiles[i].serial as u32;if !consumed.contains(&serial)&&!self.expired.contains(&serial){continue;}
            let p=&mut host.ordnance.projectiles[i];if consumed.contains(&serial)&&p.impact(p.pos){continue;}let p=host.ordnance.projectiles.remove(i);
            if rocket(&p){host.owned.emit(w::Output::Explosion(e::Output::DetachContrail{target:e::Identity{id:p.serial,generation:1}}));}
            host.events.push((p.source,p.source_handle,Notice{system:p.component,kind:crate::battle::SHOT_RETIRED,value:p.serial,detail:[p.id,0.0]}));host.owned.retired_projectiles.push(p);
        }self.expired.clear();host.finish()
    }
}
fn retained_projectile(host:&w::Host<'_>,snapshot:&Projectile)->Projectile{host.ordnance.projectiles.iter().chain(host.owned.retired_projectiles.iter()).find(|p|p.serial==snapshot.serial).unwrap_or(snapshot).clone()}
fn store_retained(host:&mut w::Host<'_>,p:&Projectile){if !store(host.ordnance,p){if let Some(q)=host.owned.retired_projectiles.iter_mut().find(|q|q.serial==p.serial){*q=p.clone();}}}
pub fn projectile_contacts(host:&mut w::Host<'_>,p:&mut Projectile,random:&mut Random,visual:&mut Random)->Result<bool,u32>{
    if projectile_precontacts(host,p,random,visual)?{return Ok(true);}
    if projectile_terrain_contacts(host,p,None,random,visual,&mut |_,_,_|Ok(()))?{return Ok(true);}
    projectile_ship_contacts(host,p,random,visual)
}
pub fn projectile_precontacts(host:&mut w::Host<'_>,p:&mut Projectile,random:&mut Random,visual:&mut Random)->Result<bool,u32>{
    store(host.ordnance,p);
    if let Some(fuse)=p.delivery.fuse{let payload=w::payload(p);let candidates=e::Host::missiles(host);if e::fuse_trigger(&payload,fuse,&candidates,host){
        if let Some(spec)=fuse.source_explosion{let mut source=payload.clone();source.velocity=[0.0;2];host.spawn(source,spec,p.pos,None,None,random,visual)?;
            sound(host.owned,&p.delivery.visual.fuse_sound,p.pos,0.6);if let Some(e)=missile_explosion(&MissileVisual{radius:spec.radius,color:p.delivery.visual.fuse_color,hit_glow:false},p.pos,visual){emit(host.owned,Output::MissileExplosion(e));}
        }else{e::fuse_commit_with_spawn(&payload,fuse,host,random,visual,&mut |host,p,s,point,r,v|host.spawn(p,s,point,None,None,r,v))?;}host.finish()?;
        if rocket(p){e::Host::output(host,e::Output::DetachContrail{target:payload.identity});}return Ok(true);
    }}
    for _ in 0..host.ordnance.projectiles.len(){let mut payload=w::payload(p);let Some(hit)=e::interception_query(&payload,host)else{break;};
        let result=e::interception_commit_with_spawn(&mut payload,hit,host,p.delivery.explosion,random,visual,&mut |host,p,s,point,r,v|host.spawn(p,s,point,None,None,r,v))?;
        p.pos=payload.position;let added=payload.damaged_projectiles.iter().filter(|id|!p.damaged_projectiles.contains(&id.id)).copied().collect::<Vec<_>>();
        for id in added{let target=host.ordnance.projectiles.iter().chain(host.owned.retired_projectiles.iter()).find(|q|q.serial==id.id).ok_or(4u32)?;p.birth.hit(0,id.id,id.generation,target.id)?;}
        p.damaged_projectiles=payload.damaged_projectiles.iter().map(|id|id.id).collect();store(host.ordnance,p);
        if result.destroyed{if host.ordnance.projectiles.iter().any(|q|q.serial==result.target.id){e::Host::remove_missile(host,result.target)?;}}
        if !host.ordnance.projectiles.iter().any(|q|q.serial==p.serial){return Ok(true);}if result.consumes{return Ok(true);}
    }
    host.finish()?;Ok(false)
}
pub fn projectile_terrain_contacts<F>(host:&mut w::Host<'_>,p:&mut Projectile,index:Option<&ShipIndex>,random:&mut Random,visual:&mut Random,flush:&mut F)->Result<bool,u32>
where F:FnMut(&mut w::Host<'_>,&mut Random,&mut Random)->Result<(),u32>{
    loop{
        let input=crate::terrain_owner::projectile_input(p,&p.damaged_asteroids,&p.damaged_hulks);let wreck=host.owned.terrain.terrain.query_hulk(&input);let rock=host.owned.terrain.terrain.query_projectile(&input);
        if wreck.is_none()&&rock.is_none(){break;}
        // Source flushes on the existence of a terrain query before deciding
        // whether a ship is closer, then recomputes terrain against true damage.
        flush(host,random,visual)?;
        let wreck=host.owned.terrain.terrain.query_hulk(&input);let rock=host.owned.terrain.terrain.query_projectile(&input);
        let ship_t=match index{Some(index)=>index.query(host,p)?,None=>ship_query(host.bodies,p,host.owned,host.specs)?}.map_or(f64::INFINITY,|(_,h)|h.t);let end=p.pos;
        let mut cost;let remember;
        if let Some(hit)=wreck.filter(|h|h.t<=ship_t.min(rock.map_or(f64::INFINITY,|r|r.t))){cost=penetration(p,true,hit.radius,0.0);remember=Some((true,hit.id));p.pos=hit.point;store(host.ordnance,p);
            environment(host,p,hit.point,hit.velocity,None,random,visual)?;host.owned.sparks(hit.point,10,[255,160,60],visual);let d=crate::world_damage::debris(hit.point,1,[80,75,70],50.0,visual);host.owned.emit(w::Output::Death(crate::world_damage::Output::Debris(d)));
        }else if let Some(hit)=rock.filter(|r|r.t<=ship_t){let asteroid=host.owned.terrain.terrain.asteroids.get(hit.index).filter(|a|a.id==hit.identity).cloned().ok_or(4u32)?;
            cost=penetration(p,false,asteroid.radius,asteroid.hp);remember=Some((false,asteroid.id.id));p.pos=hit.point;store(host.ordnance,p);
            let mut terrain=std::mem::take(&mut host.owned.terrain);let result={let mut adapter=w::TerrainWorld{world:host.owned};let mut th=crate::terrain_owner::Host::new(host.bodies,&mut terrain,host.ordnance,host.specs,&mut adapter,host.events);th.asteroid_commit(&input,hit,true,random,visual)};host.owned.terrain=terrain;result?;
            if host.owned.terrain.terrain.asteroids.iter().any(|a|a.id==asteroid.id&&a.hp>0.0){cost=None;}
            environment(host,p,hit.point,asteroid.velocity,Some(asteroid.id),random,visual)?;
        }else{break;}
        if let(Some(cost),Some((wreck,id)))=(cost,remember){if wreck{p.damaged_hulks.push(id);}else{p.damaged_asteroids.push(id);}p.birth.hit(if wreck{2}else{1},id,1,id)?;spend(p,cost);p.prev=p.pos;p.pos=end;store(host.ordnance,p);continue;}
        return Ok(true);
    }
    host.finish()?;Ok(false)
}
pub fn projectile_ship_contacts(host:&mut w::Host<'_>,p:&mut Projectile,random:&mut Random,visual:&mut Random)->Result<bool,u32>{
    let end=p.pos;
    for _ in 0..host.bodies.len(){let Some((row,hit))=ship_query(host.bodies,p,host.owned,host.specs)?else{break;};let consumed=ship_contact(host,p,row,hit,random,visual)?;store(host.ordnance,p);if consumed{return Ok(true);}p.pos=end;
        let b=&host.bodies[row];if !(hit.surface==contact::Surface::Shield&&b.ship.as_ref().and_then(|s|s.shield.as_ref()).is_some_and(|sh|sh.void.is_some()&&!sh.active()))&&!p.damaged_ships.contains(&w::identity(b)){break;}
    }host.finish()?;Ok(false)
}
pub fn projectile_ship_contacts_indexed(host:&mut w::Host<'_>,p:&mut Projectile,index:&ShipIndex,random:&mut Random,visual:&mut Random)->Result<bool,u32>{let end=p.pos;
    for _ in 0..index.rows.len(){let Some((row,hit))=index.query(host,p)?else{break;};let used=ship_contact(host,p,row,hit,random,visual)?;store_retained(host,p);if used{return Ok(true);}p.pos=end;
        let b=&host.bodies[row];if !(hit.surface==contact::Surface::Shield&&b.ship.as_ref().and_then(|s|s.shield.as_ref()).is_some_and(|sh|sh.void.is_some()&&!sh.active()))&&!p.damaged_ships.contains(&w::identity(b)){break;}
    }host.finish()?;Ok(false)
}
fn ship_contact(host:&mut w::Host<'_>,p:&mut Projectile,row:usize,hit:contact::Hit,random:&mut Random,visual:&mut Random)->Result<bool,u32>{let target=w::identity(&host.bodies[row]);let source=host.bodies.iter().find(|b|b.id==p.source&&b.handle==p.source_handle).and_then(|b|b.ship.as_ref());
    let out=source.and_then(|s|s.combat.as_ref()).map_or(p.outgoing,|c|c.outgoing());let flux=source.map_or(p.source_flux,|s|s.flux.percent());let source_components=source.map_or([1.0;2],|s|[s.damage_policy[3],s.damage_policy[4]]);
    host.refresh(row)?;let s=host.bodies[row].ship.as_ref().ok_or(8u32)?;let c=s.combat.as_ref().ok_or(8u32)?;let size=c.size;let cr=c.attrs[1];let impact=p.damage*if p.gravity_captured.is_some(){1.0}else{crate::battle::outgoing_multiplier(out,size,p.delivery.weapon_type,Some(p.origin),hit.point,flux)};p.pos=hit.point;
    if !p.void_hit_recorded{host.owned.stats.shot_hit(p.player.unwrap_or(false));}let shield=hit.surface==contact::Surface::Shield;
    let damage;
    if shield{let center=contact::shield_center(s.shield.as_ref().ok_or(8u32)?,&host.bodies[row].motion);let taken=impact*c.attrs[2]*s.live.get(crate::ship_effects::SHIELD_DAMAGE)*cr;
        let is_void=s.shield.as_ref().unwrap().void.is_some();if is_void{p.void_hit_recorded=true;}let room=s.flux.max-s.flux.total();let efficiency=s.shield.as_ref().unwrap().data[3];
        let absorption=e::Host::absorb(host,target,taken,p.delivery.damage_type,(hit.point[1]-center[1]).atan2(hit.point[0]-center[0]))?;let(flux,absorbed,left)=(absorption.flux,absorption.absorbed,absorption.remainder);
        host.owned.stats.damage(p.player.unwrap_or(false),p.delivery.damage_type,absorbed,crate::world_damage::Layer::Shield,0.0,None);
        damage=Damage{shield:if is_void{absorbed}else{shield_glow(flux,room,efficiency)},..Damage::default()};e::Host::shield_flux(host,target,flux,!p.soft)?;
        floating_damage(host.owned,hit.point,absorbed,[80,200,255],visual);let(key,volume,amount)=contact_profile(p,true);sound(host.owned,key,hit.point,volume);
        let velocity=[host.bodies[row].motion[2],host.bodies[row].motion[3]];glows(host.owned,p,hit.point,velocity,damage,visual);
        if left>0.0{p.damage*=left;p.base_damage*=left;p.emp*=left;return Ok(false);}if is_void{p.void_blocked=Some(host.root(target)?);}
        fade(host.owned,p,hit.point,visual);store(host.ordnance,p);if let Some(effect)=p.delivery.effect{crate::effect_owner::hit_world(host,row,p,effect,hit.point,true,source_components,random,visual)?;}
        spawn(host,p,hit.point,Some(target),None,random,visual)?;shake(host.owned,amount,0.1);
    }else{let applied=host.armor_damage(target,hit.local,impact*cr,p.delivery.damage_type,Some(impact),false,visual)?;let r=[applied.armor,applied.hull];host.armor_particles(target,hit.local,r[0],visual)?;
        if r[0]>0.0{host.owned.stats.damage(p.player.unwrap_or(false),p.delivery.damage_type,r[0],crate::world_damage::Layer::Armor,p.emp,None);}if r[1]>0.0{host.owned.stats.damage(p.player.unwrap_or(false),p.delivery.damage_type,r[1],crate::world_damage::Layer::Hull,0.0,None);}
        host.hull_damage(target,r[1])?;let mut notices=Vec::new();host.bodies[row].ship.as_mut().unwrap().propagate(hit.local,[r[0],r[1]],p.emp,source_components,random,&mut notices)?;record(host,row,notices);
        let(key,volume,amount)=contact_profile(p,false);sound(host.owned,key,hit.point,volume);if r[0]>0.0{floating_damage(host.owned,hit.point,r[0],[255,175,40],visual);}if r[1]>0.0{floating_damage(host.owned,hit.point,r[1],[255,55,45],visual);}
        damage=Damage{armor:r[0],hull:r[1],..Damage::default()};let velocity=[host.bodies[row].motion[2],host.bodies[row].motion[3]];glows(host.owned,p,hit.point,velocity,damage,visual);fade(host.owned,p,hit.point,visual);
        if p.damage>=150.0{let color=host.bodies[row].ship.as_ref().and_then(|s|s.combat.as_ref()).and_then(|c|c.death.as_ref()).map_or([100,130,160],|m|m.spec.debris_color);let count=if p.damage>=450.0{3}else if p.damage>=280.0{2}else{1};debris(host.owned,hit.point,count,color,100.0,if p.damage>=450.0{1}else{0},visual);}
        store(host.ordnance,p);if let Some(effect)=p.delivery.effect{crate::effect_owner::hit_world(host,row,p,effect,hit.point,false,source_components,random,visual)?;}spawn(host,p,hit.point,Some(target),None,random,visual)?;shake(host.owned,amount,0.15);
        let dead=host.bodies[row].ship.as_ref().and_then(|s|s.armor.as_ref()).is_some_and(|a|a.data[14]<=0.0);if dead{host.destroy(row,random,visual)?;}
        if p.delivery.pass_fighters&&size==0&&(!p.delivery.pass_fighters_destroyed||dead){p.damaged_ships.push(target);p.birth.hit(3,target.id,target.generation,target.id)?;return Ok(false);}
    }let b=&host.bodies[row];host.events.push((b.id,b.handle,Notice{system:p.component,kind:crate::battle::SHOT_CONTACT,value:p.serial,detail:[p.source as f64,shield as u32 as f64]}));if rocket(p){e::Host::output(host,e::Output::DetachContrail{target:e::Identity{id:p.serial,generation:1}});}host.finish()?;Ok(true)
}
fn record(host:&mut w::Host<'_>,row:usize,events:Vec<Notice>){let b=&host.bodies[row];host.events.extend(events.into_iter().map(|n|(b.id,b.handle,n)));}
pub fn beam_rows(bodies:&[Body],world:&w::Owned,specs:&BTreeMap<u32,crate::lifecycle::Spec>,source:u32,team:u32,player:Option<bool>)->Result<Vec<usize>,u32>{
    let mut rows=Vec::new();for row in world.rows(bodies)?{let b=&bodies[row];let Some(s)=b.ship.as_ref()else{continue;};let Some(c)=s.combat.as_ref()else{continue;};
        if b.id==source||!s.can_advance()||c.collisionless(b)||crate::phase_runtime::phased_world(world,bodies,row,specs)?||s.live.get(crate::ship_effects::COLLISION_DISABLED)>0.0||player.is_some()&&c.team==team{continue;}rows.push(row);
    }Ok(rows)
}
pub fn beam_contacts(host:&mut w::Host<'_>,beam:&mut Beam,sample:Option<crate::projectile::BeamSample>,kind:u32,weapon_type:u32,hard:bool,outgoing:[f64;8],source_flux:f64,component_source:[f64;2],active:bool,dt:f64,random:&mut Random,visual:&mut Random)->Result<(),u32>{
    let end=beam.end;let mut remainder=1.0;let mut effect_target=None;let mut contacted=false;let beam_player=if beam.player_known{Some(beam.player)}else{None};
    let ids=beam_rows(host.bodies,host.owned,host.specs,beam.source,beam.team,beam_player)?;
    let distance=|row:usize,end:Point|{let b=&host.bodies[row];let s=b.ship.as_ref().unwrap();let c=s.combat.as_ref().unwrap();contact::beam_distance(beam.start,end,&b.motion,c.radius,&c.bounds,s.shield.as_ref()).unwrap_or(f64::INFINITY)};
    let nearest=ids.iter().map(|&row|distance(row,end)).fold(f64::INFINITY,f64::min);let mut missile=None;
    for(index,p)in host.ordnance.projectiles.iter().enumerate(){if p.collision_disabled||!rocket(p)||p.source==beam.source||beam_player.is_some()&&p.team==beam.team{continue;}
        if let Some(t)=e::segment_circle(beam.start,end,p.pos,p.delivery.radius){if t<nearest&&missile.is_none_or(|(_,prior):(_,f64)|t<prior){missile=Some((index,t));}}
    }
    if let Some((index,t))=missile{let shot=host.ordnance.projectiles[index].clone();beam.end=contact::lerp(beam.start,end,t);beam.hitting=beam.damage_active;contacted=true;beam.visual.shorten(beam.hit_brighten);
        if let Some(sample)=sample.filter(|s|s.damage>0.0&&beam.damage_active){if !beam.visual.recorded{host.owned.stats.shot_hit(beam.player);beam.visual.recorded=true;}
            let raw=sample.damage*crate::battle::outgoing_multiplier(outgoing,5,weapon_type,Some(beam.start),beam.end,source_flux);
            let source=host.bodies.iter().find(|b|b.id==beam.source&&b.handle==beam.source_handle).and_then(|b|b.ship.as_ref()).and_then(|s|s.combat.as_ref());let damage=if shot.fighter_decoy{source.map_or(raw,|c|raw*(1.0+(c.attrs[6]+if c.attrs[3]>0.0{50.0}else{0.0})/100.0)*c.attrs[7])}else{source.and_then(|c|c.death.as_ref()).map_or(raw,|m|raw*(1.0+m.missile_percent/100.0)*m.missile_multiplier)};
            let hp=shot.hp();e::Host::subtract_missile_hp(host,e::Identity{id:shot.serial,generation:1},damage)?;beam_glow(beam,kind,Damage{hull:hp.min(damage),..Damage::default()});
            if hp-damage<=0.0{e::Host::output(host,e::Output::DetachContrail{target:e::Identity{id:shot.serial,generation:1}});host.owned.stats.intercepted(beam.player);
                if shot.delivery.visual.missile.is_some(){missile_visual(host.owned,&shot,shot.pos,[255,160,40],visual);}sound(host.owned,"missile_explosion",shot.pos,0.5);e::Host::remove_missile(host,e::Identity{id:shot.serial,generation:1})?;}
        }
    }else{
        for _ in 0..ids.len()+1{let mut best=None;for &row in &ids{let b=&host.bodies[row];let s=b.ship.as_ref().unwrap();let c=s.combat.as_ref().unwrap();if let Some(t)=contact::beam_distance(beam.start,beam.end,&b.motion,c.radius,&c.bounds,s.shield.as_ref()){if best.is_none_or(|(_,prior):(_,f64)|t<prior){best=Some((row,t));}}}
            let Some((row,_))=best else{break;};host.refresh(row)?;let b=&host.bodies[row];let s=b.ship.as_ref().unwrap();let c=s.combat.as_ref().unwrap();let Some(hit)=contact::beam(beam.start,beam.end,&b.motion,c.radius,&c.bounds,s.shield.as_ref())else{break;};let target=w::identity(b);let cr=c.attrs[1];let mult=crate::battle::outgoing_multiplier(outgoing,c.size,weapon_type,Some(beam.start),hit.point,source_flux);
            beam.end=hit.point;beam.hitting=beam.damage_active;effect_target=Some(row);contacted=true;beam.visual.shorten(beam.hit_brighten);if !beam.damage_active{break;}
            if hit.surface==contact::Surface::Shield{let mut left=0.0;if let Some(sample)=sample.filter(|s|s.damage>0.0){if !beam.visual.recorded{host.owned.stats.shot_hit(beam.player);beam.visual.recorded=true;}
                let taken=sample.damage*mult*remainder*c.attrs[2]*s.live.get(crate::ship_effects::SHIELD_DAMAGE)*cr;let center=contact::shield_center(s.shield.as_ref().unwrap(),&b.motion);let room=s.flux.max-s.flux.total();let sh=s.shield.as_ref().unwrap();let is_void=sh.void.is_some();let eff=sh.data[3];
                let absorption=e::Host::absorb(host,target,taken,kind,(hit.point[1]-center[1]).atan2(hit.point[0]-center[0]))?;let(flux,absorbed)=(absorption.flux,absorption.absorbed);left=absorption.remainder;
                beam_glow(beam,kind,Damage{shield:if is_void{absorbed}else{shield_glow(flux,room,eff)},..Damage::default()});e::Host::shield_flux(host,target,flux,hard)?;host.owned.stats.damage(beam.player,kind,absorbed,crate::world_damage::Layer::Shield,0.0,None);
            }if left>0.0{remainder*=left;beam.end=end;continue;}if active&&beam.visual.pulse(true,dt){sound(host.owned,"shield_hit",hit.point,0.22);}break;
            }else{
                if let Some(sample)=sample.filter(|s|s.damage>0.0){if !beam.visual.recorded{host.owned.stats.shot_hit(beam.player);beam.visual.recorded=true;}
                    let damage=sample.damage*mult*remainder*cr;let emp=sample.emp*remainder;let strength=sample.effective_dps*mult*cr*remainder;let applied=host.armor_damage(target,hit.local,damage,kind,Some(strength),true,visual)?;let r=[applied.armor,applied.hull];
                    beam_glow(beam,kind,Damage{armor:r[0],hull:r[1],..Damage::default()});host.armor_particles(target,hit.local,r[0],visual)?;
                    if r[0]>0.0{host.owned.stats.damage(beam.player,kind,r[0],crate::world_damage::Layer::Armor,emp,None);}if r[1]>0.0{host.owned.stats.damage(beam.player,kind,r[1],crate::world_damage::Layer::Hull,if r[0]>0.0&&emp>0.0{0.0}else{emp},None);}
                    host.hull_damage(target,r[1])?;let mut notices=Vec::new();host.bodies[row].ship.as_mut().unwrap().propagate(hit.local,[r[0],r[1]],emp,component_source,random,&mut notices)?;record(host,row,notices);
                }if active&&beam.visual.pulse(false,dt){sound(host.owned,"beam_hit",hit.point,0.35);}if host.bodies[row].ship.as_ref().and_then(|s|s.armor.as_ref()).is_some_and(|a|a.data[14]<=0.0){host.destroy(row,random,visual)?;}break;
            }
        }
    }
    if !contacted{beam.visual.surface=None;}if beam.damage_active{crate::effect_owner::beam_world(host,effect_target,beam,component_source,random,visual)?;}host.finish()
}
