//! Isolated actual resident world, including synchronous chain damage.
#[path="../../native/combat-core/src/random.rs"]mod random;
#[path="../../native/combat-core/src/motion.rs"]mod motion;
#[path="../../native/combat-core/src/flux.rs"]mod flux;
#[path="../../native/combat-core/src/lifecycle.rs"]mod lifecycle;
#[path="../../native/combat-core/src/shield.rs"]mod shield;
#[path="../../native/combat-core/src/armor.rs"]mod armor;
#[path="../../native/combat-core/src/component.rs"]mod component;
#[path="../../native/combat-core/src/weapon.rs"]mod weapon;
#[path="../../native/combat-core/src/engine.rs"]mod engine;
#[path="../../native/combat-core/src/contact.rs"]mod contact;
#[path="../../native/combat-core/src/readiness.rs"]mod readiness;
#[path="../../native/combat-core/src/readiness_owner.rs"]mod readiness_owner;
#[path="../../native/combat-core/src/ship_state.rs"]mod ship_state;
#[path="../../native/combat-core/src/ship_effects.rs"]mod ship_effects;
#[path="../../native/combat-core/src/explosion_effects.rs"]mod explosion_effects;
#[path="../../native/combat-core/src/world_damage.rs"]mod world_damage;
mod battle{
    #[derive(Clone)]pub struct CombatShip{pub size:u32,pub team:u32,pub attrs:[f64;20],pub readiness:Option<crate::readiness_owner::Owned>,pub query:Option<Query>}
    #[derive(Clone)]pub struct Query{pub target:Option<crate::state::Handle>}
    impl CombatShip{pub fn valid(&self)->bool{true}}
}
// This death fixture has no ship-system world extension (world=None); actual
// ShipState live modifiers use their real default. Any unexpected extension
// damage hook fails rather than replacing gameplay with a record-only service.
mod system_owner{
    #[derive(Clone)]pub struct Meta{pub kind:crate::ship_effects::Kind,pub regen:f64}
    #[derive(Clone)]pub struct Owned{pub metas:std::collections::BTreeMap<u32,Meta>}
    impl Owned{pub fn valid(&self)->bool{true}}
    pub fn damage(s:&mut crate::ship_state::ShipState,_:f64){assert!(s.world.is_none());}
}
mod state{
    #[derive(Clone,Copy,PartialEq,Eq)]pub struct Handle{pub slot:u32,pub generation:u32}
    #[derive(Clone)]pub struct Body{pub id:u32,pub handle:Handle,pub order:f64,pub motion:[f64;crate::motion::WIDTH],pub ship:Option<crate::ship_state::ShipState>}
}
use std::{cell::RefCell,collections::BTreeMap};use world_damage as w;use explosion_effects as e;
struct World{bodies:Vec<state::Body>,meta:Vec<w::Ship>,records:Vec<Vec<f64>>,stats:w::Stats,losses:w::Losses,
    exps:Vec<e::Explosion>,specs:BTreeMap<u32,lifecycle::Spec>,suppress:bool}
fn identity(index:usize)->e::Identity{e::Identity{id:(index+1)as f64,generation:1}}
fn id_index(id:e::Identity)->usize{id.id as usize-1}
impl World{
    fn index(&self,id:e::Identity)->Result<usize,u32>{w::body_index(&self.bodies,id)}
    fn record(&mut self,row:Vec<f64>){self.records.push(row);}
    fn build(scene:u32)->Self{
        let mut specs=BTreeMap::new();let spec=lifecycle::Spec::new(&[0.1,1.0,0.2,0.7,2.0,2.0,0.0,0.0,1.0]);specs.insert(1,spec.clone());
        let mut bodies=Vec::new();let mut meta=Vec::new();let mut initialization=random::Random::new(9173);
        for i in 0..4{
            let size=if i==0{scene%5+1}else if i==1{w::FRIGATE}else if i==2{w::CRUISER}else{w::FIGHTER};
            let radius=if i==0{if scene%3==0{90.0}else{35.0}}else{20.0};let x=if i==0{0.0}else if i==1{10.0}else if i==2{50.0}else{80.0};
            let capacity=if scene%6==0{0.0}else if i==0{1500.0}else{600.0};
            let mut ship=ship_state::ShipState::new(&[capacity,0.0,1.0,1.0,1.0,0.0,1.0,0.0,0.0,0.0,2.0,1.0,0.0,1.0,0.0,0.0,0.0]);
            ship.armor=Some(armor::Armor::new(&[9.0,7.0,10.0,10.0,27.0,-45.0,-35.0,120.0,if i==0{0.0}else{120.0},1.0,1.0,0.85,1.0,1.0,if scene%11==0{1.0}else{0.0},0.0,0.0]));
            ship.damage_policy=[1.23,1.13,1.19,1.17,1.09,100.0,1.0,1.0];
            ship.flux.venting=i%2==0;ship.flux.vent_progress=0.4;
            for j in 0..2{let mut system=lifecycle::System::new(j+1,1,&spec);system.activate(&spec);system.update(&spec,0.15);ship.systems.push(system);}
            ship.components.push(component::Component::new(&[1.0,0.0,0.0,3.0,-4.0,1.0,1.0],&mut initialization));
            let mut pose=[0.0;motion::WIDTH];pose[motion::X]=x;pose[motion::Y]=-5.0;pose[motion::VX]=7.0;pose[motion::VY]=-3.0;
            pose[motion::FACING]=0.27;pose[motion::ANGULAR]=0.07;pose[motion::THROTTLE]=1.0;pose[motion::BRAKE]=1.0;pose[motion::TURN]=0.7;pose[motion::STRAFE]=-0.5;
            bodies.push(state::Body{id:(i+1)as u32,handle:state::Handle{slot:i as u32,generation:1},order:i as f64,motion:pose,ship:Some(ship)});
            meta.push(w::Ship{identity:identity(i),dead:false,attached:i==1||i==0&&scene%8==0,transient:i==0&&scene%7==0,
                player:i%2==0,team:(i%2)as u32,children:if i==0&&scene%2==0{vec![identity(1)]}else{Vec::new()},
                position:[x,-5.0],velocity:[7.0,-3.0],shield_center:[x+3.0,-2.0],facing:0.27,angular:0.07,max_flux:capacity,cr_taken:1.13,
                explosion_damage:if scene%9==0{0.0}else{1.0},explosion_radius:1.17,break_probability:if scene%3==0{1.0}else if scene%3==1{0.0}else{0.25},
                decals_suppressed:scene%11==0,ship_name:format!("Ship {}",i+1),hull_name:format!("Hull {} (test)",i+1),
                spec:w::Spec{id:format!("fixture_{}",i+1),size:Some(size),radius,bounds:vec![[-18.0,-13.0],[18.0,-13.0],[18.0,13.0],[-18.0,13.0]],
                    min_pieces:if scene%4==0{1.0}else{2.0},max_pieces:if scene%4==0{1.0}else{4.0},mount_slots:vec![1,1,2,3],
                    explosion_color:[231,132,91],flash_color:[247,164,31],debris_color:[100,130,160]}});
        }
        Self{bodies,meta,records:Vec::new(),stats:w::Stats::default(),losses:w::Losses{entries:(0..64).map(|i|w::Loss{identity:e::Identity{id:(100+i)as f64,generation:1},ship_name:String::new(),hull_name:String::new(),team:0,time:0.0}).collect()},exps:Vec::new(),specs,suppress:scene==13}
    }
}
impl w::Host for World{
    fn ship(&self,id:e::Identity)->Option<w::Ship>{let i=self.index(id).ok()?;let mut s=self.meta[i].clone();s.dead=self.bodies[i].ship.as_ref()?.flags&ship_state::DEAD!=0;Some(s)}
    fn suppressed(&self)->bool{self.suppress}fn player_ship(&self)->e::Identity{identity(0)}fn enemy_ship(&self)->e::Identity{identity(2)}fn time(&self)->f64{42.5}
    fn mark_dead(&mut self,id:e::Identity)->Result<(),u32>{let i=self.index(id)?;w::mark_body_dead(&mut self.bodies[i])?;self.record(vec![0.0,id.id]);Ok(())}
    fn force_hull_zero(&mut self,id:e::Identity)->Result<(),u32>{let i=self.index(id)?;w::force_body_hull_zero(&mut self.bodies[i])?;self.record(vec![1.0,id.id]);Ok(())}
    fn shutdown(&mut self,id:e::Identity)->Result<(),u32>{let i=self.index(id)?;w::clear_motion(&mut self.bodies[i]);let vent=self.bodies[i].ship.as_ref().unwrap().flux.venting;
        w::shutdown_resources(self.bodies[i].ship.as_mut().unwrap(),&self.specs,&mut Vec::new(),|_|Ok(()))?;self.record(vec![2.0,id.id,vent as u32 as f64]);Ok(())}
    fn loss(&mut self,loss:w::Loss){self.record(vec![3.0,loss.identity.id,loss.team as f64,loss.time]);self.losses.push(loss);}
    fn fighter_kill(&mut self,p:bool){self.stats.fighter_kill(p);self.record(vec![4.0,p as u32 as f64]);}
    fn spawn_explosion(&mut self,p:e::Payload,spec:e::Spec,exclude:e::Identity,r:&mut random::Random,v:&mut random::Random)->Result<(),u32>{
        self.record(vec![5.0,p.identity.id,p.source_ship as f64,p.damage,spec.radius,spec.core,spec.duration]);
        // Reserve before apply exactly as the TS world, so nested death retains
        // the outer explosion ahead of any recursively spawned children.
        let mut exp=e::Explosion::new(p,spec,self.meta[id_index(exclude)].position,Some(exclude),None)?;
        let index=self.exps.len();self.exps.push(exp.clone());exp.apply(self,r,v)?;self.exps[index]=exp;Ok(())}
    fn prepare_hulk(&mut self,id:e::Identity,b:&[contact::Point],v:&mut random::Random)->Result<(),u32>{let i=self.index(id)?;w::prepare_resident_hulk(self.bodies[i].ship.as_mut().unwrap(),b,v)}
    fn armor_disable(&mut self,id:e::Identity,p:contact::Point,raw:f64,cr:f64,v:&mut random::Random)->Result<f64,u32>{let i=self.index(id)?;w::resident_armor_disable(self.bodies[i].ship.as_mut().unwrap(),p,raw,cr,v,&mut Vec::new())}
    fn output(&mut self,event:w::Output){let row=match event{
        w::Output::ExplosionSound{source,position,volume}=>vec![6.0,source.id,position[0],position[1],volume],
        w::Output::LargeDisabledSound{source,position}=>vec![7.0,source.id,position[0],position[1]],
        w::Output::Explosion(s)=>{let mut a=vec![8.0,s.id,s.position[0],s.position[1],s.diameter,s.duration,s.puff_duration,s.flash.diameter,s.flash.core.unwrap_or(-1.0),s.puffs.len()as f64];
            a.extend(if let Some(f)=s.flare{vec![f.width,f.height]}else{vec![-1.0,-1.0]});
            for p in s.puffs{a.extend([p.texture as f64,p.start,p.end,p.rotation,p.offset[0],p.offset[1],p.velocity[0],p.velocity[1]]);}a},
        w::Output::Radio{flagship}=>vec![9.0,flagship as u32 as f64],w::Output::Floating{flagship,position}=>vec![10.0,flagship as u32 as f64,position[0],position[1]],
        w::Output::Debris(p)=>{let mut a=vec![11.0,p.len()as f64];for d in p{a.extend([d.position[0],d.position[1],d.velocity[0],d.velocity[1],d.rotation,d.angular,d.size,d.life,d.color[0]as f64,d.color[1]as f64,d.color[2]as f64,d.texture as f64,d.glowing as u32 as f64]);}a},
        w::Output::CameraShake{amount,duration}=>vec![12.0,amount,duration],
        w::Output::Hulk(h)=>{let mut a=vec![13.0,h.id,h.source.id,h.position[0],h.position[1],h.velocity[0],h.velocity[1],h.facing,h.angular,h.radius];
            a.extend(if let Some(b)=h.breakup{vec![b.remaining as f64,b.interval,b.elapsed,b.next_interval]}else{vec![0.0;4]});a.push(h.slots.len()as f64);a.extend(h.slots.iter().map(|s|*s as f64));a},
        w::Output::ArmorParticles{source,local,damage,particles}=>{let mut a=vec![14.0,source.id,local[0],local[1],damage,particles.len()as f64];for p in particles{a.extend([p.position[0],p.position[1],p.velocity[0],p.velocity[1],p.size]);}a},
    };self.record(row);}
}
impl e::Host for World{
    fn ships(&self)->Vec<e::Identity>{(0..4).map(identity).collect()}fn fighters(&self)->Vec<e::Identity>{vec![identity(3)]}fn capitals(&self)->Vec<e::Identity>{vec![identity(0),identity(2)]}
    fn ship(&self,id:e::Identity)->Option<e::Ship>{let s=w::Host::ship(self,id)?;Some(e::Ship{identity:id,root:if id==identity(1)&&self.meta[0].children.contains(&id){identity(0)}else{id},
        allegiance:e::Allegiance{team:Some(s.team),player:Some(s.player)},dead:s.dead,collisionless:false,fighter:s.spec.size==Some(w::FIGHTER),
        position:s.position,facing:s.facing,radius:s.spec.radius,bounds:s.spec.bounds,shield:e::ShieldGeometry{active:false,kind:2,center:s.shield_center,facing:0.0,arc:360.0,radius:32.0,void:false},cr_taken:s.cr_taken,system_shield:1.0,shield_taken:[1.0;4]})}
    fn missiles(&self)->Vec<e::Identity>{Vec::new()}fn missile(&self,_:e::Identity)->Option<e::Missile>{None}
    fn asteroids(&self)->Vec<e::Identity>{Vec::new()}fn asteroid(&self,_:e::Identity)->Option<e::Asteroid>{None}
    fn outgoing(&self,_:&e::Payload,_:Option<e::Identity>,_:contact::Point)->f64{1.0}fn missile_damage(&self,_:&e::Payload,_:&e::Missile,d:f64)->f64{d}
    fn absorb(&mut self,_:e::Identity,_:f64,_:u32,_:f64)->Result<e::Absorption,u32>{Err(8)}fn shield_flux(&mut self,_:e::Identity,_:f64,_:bool)->Result<(),u32>{Err(8)}
    fn armor(&mut self,id:e::Identity,p:contact::Point,d:f64,kind:u32,strength:Option<f64>,v:&mut random::Random)->Result<e::Damage,u32>{let i=self.index(id)?;let result=self.bodies[i].ship.as_mut().unwrap().armor_impact(&[p[0],p[1],d,kind as f64,strength.is_some()as u32 as f64,strength.unwrap_or(0.0),0.0,0.0],v,&mut Vec::new())?;Ok(e::Damage{armor:result[0],hull:result[1]})}
    fn hull(&mut self,id:e::Identity,d:f64)->Result<(),u32>{let i=self.index(id)?;let s=self.bodies[i].ship.as_mut().unwrap();s.armor.as_mut().unwrap().apply_hull(d,s.flags&ship_state::DEAD!=0,&mut s.shield);Ok(())}
    fn components(&mut self,id:e::Identity,p:contact::Point,d:e::Damage,_:f64,_:u32,r:&mut random::Random)->Result<(),u32>{let i=self.index(id)?;self.bodies[i].ship.as_mut().unwrap().propagate(p,[d.armor,d.hull],0.0,[1.17,1.09],r,&mut Vec::new())}
    fn armor_sparks(&mut self,id:e::Identity,p:contact::Point,damage:f64,v:&mut random::Random)->Result<(),u32>{
        let s=w::Host::ship(self,id).ok_or(4u32)?;if s.decals_suppressed{return Ok(());}
        let offset=contact::rotate(p,s.facing);let point=[s.position[0]+offset[0],s.position[1]+offset[1]];
        let particles=w::armor_particles(point,damage,v);w::Host::output(self,w::Output::ArmorParticles{source:id,local:p,damage,particles});Ok(())
    }
    fn destroy_if_dead(&mut self,id:e::Identity,r:&mut random::Random,v:&mut random::Random)->Result<bool,u32>{let i=self.index(id)?;if self.bodies[i].ship.as_ref().unwrap().armor.as_ref().unwrap().data[14]<=0.0{w::destroy(id,self,r,v)}else{Ok(false)}}
    fn subtract_missile_hp(&mut self,_:e::Identity,_:f64)->Result<f64,u32>{Err(8)}fn remove_missile(&mut self,_:e::Identity)->Result<(),u32>{Err(8)}
    fn asteroid_impact(&mut self,_:&e::Payload,_:e::Identity,_:f64,_:contact::Point,_:&mut random::Random,_:&mut random::Random)->Result<(),u32>{Err(8)}
    fn missile_visual(&mut self,_:e::Identity,_:contact::Point,_:[u8;3],_:&mut random::Random)->Result<(),u32>{Err(8)}
    fn interception_effect(&mut self,_:&e::Payload,_:e::Identity,_:contact::Point,_:&mut random::Random,_:&mut random::Random)->Result<(),u32>{Err(8)}
    fn ship_obstruction(&self,_:&e::Payload)->Option<f64>{None}fn asteroid_obstruction(&self,_:&e::Payload)->Option<f64>{None}fn wrecks(&self)->Vec<e::Wreck>{Vec::new()}fn player_id(&self)->u32{1}
    fn output(&mut self,event:e::Output){match event{
        e::Output::Damage{player,kind,layer,amount,emp,target_player}=>{self.stats.damage(player,kind,amount,match layer{e::Layer::Shield=>w::Layer::Shield,e::Layer::Armor=>w::Layer::Armor,e::Layer::Hull=>w::Layer::Hull},emp,target_player);self.record(vec![15.0,player as u32 as f64,kind as f64,match layer{e::Layer::Shield=>0.0,e::Layer::Armor=>1.0,e::Layer::Hull=>2.0},amount,emp,target_player.unwrap_or(!player)as u32 as f64]);},
        e::Output::ArmorSparks{target,local,damage}=>{self.record(vec![16.0,target.id,local[0],local[1],damage]);},
        e::Output::FloatingDamage{point,amount,color}=>self.record(vec![17.0,point[0],point[1],amount,color[0]as f64,color[1]as f64,color[2]as f64]),_=>{} }
    }
}
struct Fixture{input:Vec<f64>,output:Vec<f64>}
thread_local!{static F:RefCell<Fixture>=RefCell::new(Fixture{input:Vec::new(),output:Vec::new()});}
#[no_mangle]pub extern "C" fn test_input(n:u32)->u32{F.with_borrow_mut(|f|{f.input.resize(n as usize,0.0);f.input.as_mut_ptr()as u32})}
#[no_mangle]pub extern "C" fn test_run()->u32{F.with_borrow_mut(|f|{
    let scene=f.input[0]as u32;let mut world=World::build(scene);let mut random=random::Random::new(8127);let mut visual=random::Random::new(15181);
    for id in [identity(0),identity(0),identity(3)]{if w::destroy(id,&mut world,&mut random,&mut visual).is_err(){return 0;}}
    // Exercise all independent counter/layer/default-defender branches.
    for i in 0..8{let p=i%2==0;world.stats.shot_fired(p);world.stats.shot_hit(p);world.stats.intercepted(p);world.stats.fighter_rebuilt(p);world.stats.overload(p);
        world.stats.damage(p,i%4,i as f64-2.0,match i%3{0=>w::Layer::Shield,1=>w::Layer::Armor,_=>w::Layer::Hull},if i%2==0{3.0}else{-1.0},if i%3==0{Some(p)}else{None});}
    f.output.clear();f.output.extend([random.cursor,visual.cursor,visual.ids]);f.output.extend(world.stats.player);f.output.extend(world.stats.enemy);
    f.output.push(world.losses.entries.len()as f64);for l in &world.losses.entries{f.output.extend([l.identity.id,l.team as f64,l.time]);}
    for b in &world.bodies{let s=b.ship.as_ref().unwrap();let a=s.armor.as_ref().unwrap();f.output.extend([s.flags as f64,a.data[14],s.flux.venting as u32 as f64,s.flux.vent_progress]);
        for i in [motion::THROTTLE,motion::BRAKE,motion::STRAFE,motion::TURN]{f.output.push(b.motion[i]);}f.output.extend([a.data[12],a.data[19],a.data[20]]);
        f.output.extend(a.cells.iter().map(|n|*n as f64));f.output.push(a.scars.len()as f64);for scar in &a.scars{f.output.extend(*scar);}
        for system in &s.systems{f.output.extend(system.words());}for c in &s.components{f.output.extend(c.data);}
    }
    f.output.push(world.exps.len()as f64);for exp in &world.exps{f.output.extend([exp.payload.source_ship as f64,exp.payload.identity.id,exp.payload.damage,exp.life,exp.ships.len()as f64]);for s in &exp.ships{f.output.push(s.id);}}
    f.output.push(world.records.len()as f64);for row in &world.records{f.output.push(row.len()as f64);f.output.extend(row);}
    let before=world.records.len();let stale=w::destroy(e::Identity{id:1.0,generation:2},&mut world,&mut random,&mut visual).err().unwrap_or(0);
    let finalized=world.stats.finalize(scene%2==0,42.5,String::from("player"),String::from("enemy"),scene as f64%3.0-0.5,scene as f64%4.0/2.0);
    world.stats.reset();f.output.extend([stale as f64,(world.records.len()-before)as f64,finalized.player_hull_damage,finalized.enemy_hull_damage,finalized.stats.player[0],world.stats.player[0],world.stats.enemy[0]]);
    f.output.as_ptr()as u32
})}
#[no_mangle]pub extern "C" fn test_output_words()->u32{F.with_borrow(|f|f.output.len()as u32)}
