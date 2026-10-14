#[path="../../native/combat-core/src/motion_owner.rs"]mod motion_owner;
#[path="../../native/combat-core/src/gravity_wire.rs"]mod gravity_wire;
#[path="../../native/combat-core/src/scene_prelude.rs"]mod scene_prelude;
#[path="../../native/combat-core/src/flight_runtime.rs"]mod flight_runtime;
#[path="../../native/combat-core/src/flight_static_wire.rs"]mod flight_static_wire;
#[path="../../native/combat-core/src/flight_wire.rs"]mod flight_wire;
#[path="../../native/combat-core/src/flight_admission.rs"]mod flight_admission;
#[path="../../native/combat-core/src/flight_allocator.rs"]mod flight_allocator;
#[path="../../native/combat-core/src/flux.rs"]mod flux;
#[path="../../native/combat-core/src/armor.rs"]mod armor;
#[path="../../native/combat-core/src/component.rs"]mod component;
#[path="../../native/combat-core/src/weapon.rs"]mod weapon;
#[path="../../native/combat-core/src/weapon_fire.rs"]mod weapon_fire;
#[path="../../native/combat-core/src/contact.rs"]mod contact;
#[path="../../native/combat-core/src/projectile.rs"]mod projectile;
#[path="../../native/combat-core/src/battle.rs"]mod battle;
#[path="../../native/combat-core/src/fire_control.rs"]mod fire_control;
#[path="../../native/combat-core/src/fire_query.rs"]mod fire_query;
#[path="../../native/combat-core/src/readiness.rs"]mod readiness;
#[path="../../native/combat-core/src/readiness_owner.rs"]mod readiness_owner;
#[path="../../native/combat-core/src/missile_guidance.rs"]mod missile_guidance;
#[path="../../native/combat-core/src/missile_owner.rs"]mod missile_owner;
#[path="../../native/combat-core/src/weapon_effects.rs"]mod weapon_effects;
#[path="../../native/combat-core/src/weapon_effects_owner.rs"]mod weapon_effects_owner;
#[path="../../native/combat-core/src/effect_owner.rs"]mod effect_owner;
#[path="../../native/combat-core/src/ship_effects.rs"]mod ship_effects;
#[path="../../native/combat-core/src/system_world.rs"]mod system_world;
#[path="../../native/combat-core/src/system_owner.rs"]mod system_owner;
#[path="../../native/combat-core/src/engine.rs"]mod engine;
#[path="../../native/combat-core/src/lifecycle.rs"]mod lifecycle;
#[path="../../native/combat-core/src/motion.rs"]mod motion;
#[path="../../native/combat-core/src/random.rs"]mod random;
#[path="../../native/combat-core/src/shield.rs"]mod shield;
#[path="../../native/combat-core/src/ship_state.rs"]mod ship_state;
#[path="../../native/combat-core/src/state.rs"]mod state;
#[path="../../native/combat-core/src/explosion_effects.rs"]mod explosion_effects;
#[path="../../native/combat-core/src/world_damage.rs"]mod world_damage;
#[path="../../native/combat-core/src/terrain_world.rs"]mod terrain_world;
#[path="../../native/combat-core/src/terrain_owner.rs"]mod terrain_owner;
#[path="../../native/combat-core/src/world_owner.rs"]mod world_owner;
use std::{cell::RefCell,collections::BTreeMap};use terrain_owner as o;use terrain_world as t;use contact::Point;use state::{Body,Handle};
fn id(n:u32)->t::Identity{t::Identity{id:n as f64,generation:1}}
#[derive(Clone,Default)]struct World{rows:Vec<Vec<f64>>,particles:u32,blast:bool,audio:Vec<ship_state::Notice>,listener:Option<Point>}
impl o::World for World{
    fn phased(&self,b:&[Body],owned:&o::Owned,_:&BTreeMap<u32,lifecycle::Spec>,target:t::Identity)->Result<bool,u32>{
        let mut id=target;for _ in 0..=owned.ships.len(){let s=b[owned.row(b,id)?].ship.as_ref().ok_or(8u32)?;if s.anchor_installed{return Err(8);}if ship_state::local_phased(s){return Ok(true);}if let Some(m)=&owned.meta(id)?.module{id=m.parent;}else{return Ok(false);}}Err(8)
    }
    fn hull(&mut self,b:&mut[Body],owned:&mut o::Owned,_:&mut battle::Ordnance,_:&BTreeMap<u32,lifecycle::Spec>,target:t::Identity,d:f64,events:&mut Vec<(u32,Handle,ship_state::Notice)>)->Result<f64,u32>{let row=owned.row(b,target)?;let mut notices=Vec::new();let dealt=b[row].ship.as_mut().unwrap().apply_hull(d,&mut notices)?;
        if dealt>0.0{let root=owned.root(target)?;let root=owned.row(b,root)?;if let Some(v)=b[root].ship.as_mut().and_then(|s|s.shield.as_mut()).and_then(|s|s.void.as_mut()){v.data[7]=v.data[3];}}
        events.extend(notices.into_iter().map(|n|(b[row].id,b[row].handle,n)));Ok(dealt)}
    fn retreat(&mut self,_:&mut[Body],_:&mut o::Owned,_:&mut battle::Ordnance,_:&BTreeMap<u32,lifecycle::Spec>,_:t::Identity,_:&mut Vec<(u32,Handle,ship_state::Notice)>)->Result<(),u32>{Err(8)}
    fn armor_sparks(&mut self,p:Point,d:f64,v:&mut random::Random)->Result<(),u32>{let particles=world_damage::armor_particles(p,d,v);self.particles+=particles.len()as u32;self.rows.push(vec![0.0,particles.len()as f64]);Ok(())}
    fn debris(&mut self,p:Point,n:u32,c:[u8;3],s:f64,v:&mut random::Random)->Result<(),u32>{let particles=world_damage::debris(p,n as usize,c,s,v);self.rows.push(vec![1.0,particles.len()as f64]);Ok(())}
    fn sparks(&mut self,p:Point,n:u32,c:[u8;3],v:&mut random::Random)->Result<(),u32>{let particles=t::spark_particles(p,t::spark_count(n,self.particles),c,v);self.particles+=particles.len()as u32;self.rows.push(vec![2.0,particles.len()as f64]);Ok(())}
    fn explosion_visual(&mut self,p:Point,r:f64,c:[u8;3],v:&mut random::Random)->Result<(),u32>{let e=t::impact_explosion(p,r,c,true,2.0,[0.0;2],v).unwrap();self.rows.push(vec![3.0,e.id,e.puffs.len()as f64]);Ok(())}
    fn audio_notices(&mut self,notices:&[ship_state::Notice])->Result<(),u32>{self.audio.extend_from_slice(notices);Ok(())}
    fn audio_listener(&mut self,bodies:&[Body])->Result<(),u32>{let row=bodies.iter().position(|b|b.id==1&&b.handle.generation==1).ok_or(4u32)?;self.listener=Some([bodies[row].motion[motion::X],bodies[row].motion[motion::Y]]);Ok(())}
    fn output(&mut self,e:t::Output){self.rows.push(match e{t::Output::Floating{amount,..}=>vec![4.0,amount],t::Output::Ripple{radius,..}=>vec![5.0,radius],t::Output::Sound{key,volume,..}=>vec![6.0,key as f64,volume],t::Output::Shake{amount,duration}=>vec![7.0,amount,duration],t::Output::Text{..}=>vec![8.0],t::Output::Detach{projectile}=>vec![9.0,projectile]});}
    fn environment_impact(&mut self,b:&mut[Body],owned:&mut o::Owned,ord:&mut battle::Ordnance,specs:&BTreeMap<u32,lifecycle::Spec>,p:o::ProjectileIdentity,point:Point,velocity:Point,_:Option<f64>,r:&mut random::Random,v:&mut random::Random,events:&mut Vec<(u32,Handle,ship_state::Notice)>)->Result<(),u32>{
        let shot=ord.projectiles.iter().find(|s|s.serial==p.serial&&s.id==p.id).ok_or(4u32)?.clone();if shot.pos!=point{return Err(8);}self.rows.push(vec![10.0,point[0],point[1],velocity[0],velocity[1],owned.terrain.asteroids.len()as f64,owned.terrain.hulks.len()as f64]);
        // This fixture exercises the required World boundary with TRUE shared
        // explosion authority, no synthetic damage or JavaScript callback.
        let mut world=world_owner::Owned::new(id(1),id(2));world.terrain=std::mem::take(owned);
        let payload=explosion_effects::Payload{identity:explosion_effects::Identity{id:p.serial,generation:1},source_ship:shot.source,allegiance:explosion_effects::Allegiance{team:Some(shot.team),player:shot.player},
            damage:shot.damage,damage_type:shot.delivery.damage_type,soft_flux:false,position:point,previous:shot.prev,velocity:shot.velocity,radius:shot.delivery.radius,range_remaining:shot.range,
            rocket:false,flare:false,did_damage:false,moving_ray:false,intercepts_missiles:false,target_projectile:None,pass_through_missiles:false,damaged_projectiles:Vec::new(),void_blocked_root:None,source_binding:Some(explosion_effects::SourceBinding{handle:shot.source_handle,weapon_type:shot.delivery.weapon_type,origin:shot.origin,outgoing:shot.outgoing,flux:shot.source_flux,captured:false})};
        let mut host=world_owner::Host{bodies:b,specs,ordnance:ord,owned:&mut world,events};let result=host.spawn(payload,explosion_effects::Spec{duration:0.1,radius:210.0,core:200.0,minimum_fraction:0.0,collision:explosion_effects::Collision::ShipsAndAsteroids},point,None,None,r,v);
        *owned=std::mem::take(&mut world.terrain);self.particles+=world.particles.len()as u32;for e in &world.output{match e{world_owner::Output::Explosion(explosion_effects::Output::FloatingDamage{amount,..})=>self.rows.push(vec![4.0,*amount]),world_owner::Output::Death(world_damage::Output::ArmorParticles{particles,..})=>self.rows.push(vec![0.0,particles.len()as f64]),_=>{}}}
        self.blast=true;result
    }
}
fn fixture(scene:u32)->(Vec<Body>,o::Owned){let mut bodies=Vec::new();let mut owned=o::Owned::default();for i in 0..3u32{
    let mut s=ship_state::ShipState::new(&[if scene==1&&i==0{100.0}else{100000.0},0.0,1.0,1.0,1.0,0.0,1.0,0.0,0.0,0.0,2.0,1.0,0.0,1.0,0.0,0.0,0.0]);
    s.armor=Some(armor::Armor::new(&[9.0,7.0,10.0,10.0,27.0,-45.0,-35.0,10000.0,10000.0,1.0,1.0,0.85,1.0,1.0,0.0,0.0,0.0]));if scene==14{s.armor.as_mut().unwrap().data[18]=1.0;}s.damage_policy=[1.23,1.13,1.19,1.17,1.09,100.0,1.0,1.0];
    let mut init=random::Random::new(0);s.components.push(component::Component::new(&[1.0,0.0,0.0,3.0,-4.0,1.0,1.0],&mut init));
    let mut c=battle::CombatShip::new(&[if i==2{0.0}else{i as f64},1.0,30.0,4.0,1.0,if i==0{1.0}else{0.0}]);c.bounds=vec![[-30.0,-20.0],[30.0,-20.0],[30.0,20.0],[-30.0,20.0]];c.attrs[1]=1.13;c.attrs[2]=1.11;
    let mut sh=shield::Shield::new(&[if scene==4{1.0}else{2.0},if scene==4{80.0}else{360.0},33.0,0.83,0.0,1.0,1.0,0.5,0.5,2.0,0.0,0.0,1.0,0.0,0.0,if i==0{4.0}else{-3.0},2.0,0.0,0.0]);
    sh.data[6]=if scene==0||scene==1||scene==3||scene==4{1.0}else{0.0};sh.data[7]=if scene==4{80.0}else{360.0};sh.data[8]=if i==0{0.1}else{3.2};
    if scene==3{sh.configure_void(&[2.0,50.0,0.0,0.4,1.0]);}
    if scene==13{sh.data[1]=180.0;sh.data[7]=80.0;sh.data[8]=1.4;sh.data[10]=0.35;let spec=lifecycle::Spec::new(&[0.0,0.0,0.0,0.0,1.0,1.0,0.0,0.0,0.0]);
        for id in 1..=2{let mut system=lifecycle::System::new(id,1,&spec);system.state=lifecycle::COOLDOWN;system.cooling=true;system.cooldown_timer=0.4;system.stage_timer=0.4;system.disabled=true;s.systems.push(system);}}
    s.shield=Some(sh);s.combat=Some(c);s.sync_shield();let mut pose=[0.0;motion::WIDTH];pose[motion::X]=if i==0{0.0}else if i==1{24.0}else{300.0};pose[motion::Y]=if i==1{9.0}else{0.0};
    pose[motion::VX]=if i==0{75.0}else{-15.0};pose[motion::VY]=if i==0{3.0}else{-2.0};pose[motion::FACING]=if i==0{0.27}else{-0.37};pose[motion::ANGULAR]=if i==0{0.17}else{0.07};
    let handle=Handle{slot:i,generation:1};bodies.push(Body{id:i+1,handle,order:i as f64,motion:pose,ship:Some(s)});
    owned.ships.push(o::Meta{identity:id(i+1),handle,stable_id:format!("{}",i+1),mass:if i==0{500.0}else{200.0},station:scene==2&&i==1,module:if i==2&&scene>=5{Some(o::Module{parent:id(1),offset:[50.0,12.0],angle:0.4,independent:scene==6})}else{None},children:if i==0&&scene>=5{vec![id(3)]}else{Vec::new()},sprite_height:250.0,slots:vec![(1,[-50.0,0.0]),(2,[50.0,0.0])],terrain_speed:0.3,emergency_phase_used:false,fighter_recall:false});
    owned.active.push(id(i+1));
} (bodies,owned)}
struct Fixture{input:Vec<f64>,output:Vec<f64>}
thread_local!{static F:RefCell<Fixture>=RefCell::new(Fixture{input:Vec::new(),output:Vec::new()});}
#[no_mangle]pub extern "C" fn test_input(n:u32)->u32{F.with_borrow_mut(|f|{f.input.resize(n as usize,0.0);f.input.as_mut_ptr()as u32})}
#[no_mangle]pub extern "C" fn test_run()->u32{F.with_borrow_mut(|f|{let scene=f.input[0]as u32;let(mut b,mut owned)=fixture(scene);let mut ord=battle::Ordnance::new();let mut specs=BTreeMap::new();if scene==13{specs.insert(1,lifecycle::Spec::new(&[0.0,0.0,0.0,0.0,1.0,1.0,0.0,0.0,0.0]));}let mut events=Vec::new();let mut world=World::default();let mut r=random::Random::new(8127);let mut v=random::Random::new(15181);f.output.clear();
    owned.validate(&b,&specs).unwrap();
    if scene<8||scene==14{let mut host=o::Host::new(&mut b,&mut owned,&mut ord,&specs,&mut world,&mut events);host.nebula().unwrap();let result=host.pair(id(1),id(2),&mut r,&mut v).unwrap();f.output.push(result as u32 as f64);}
    else if scene<12{owned.terrain.asteroids.push(t::Asteroid{id:id(1),position:[20.0,0.0],velocity:[-17.0,3.0],facing:0.37,angular:0.13,radius:40.0,mass:1200.0,hp:600.0,max_hp:600.0,sprite:2,fixed:scene==9});let mut host=o::Host::new(&mut b,&mut owned,&mut ord,&specs,&mut world,&mut events);host.asteroid_collisions(&mut r,&mut v).unwrap();}
    else if scene==13{owned.admit_hulk(&b,world_damage::Hulk{id:1.0,source:id(1),position:[20.0,-30.0],velocity:[7.0,-3.0],facing:0.27,angular:0.07,bounds:vec![[-100.0,-70.0],[100.0,-70.0],[100.0,70.0],[-100.0,70.0]],radius:140.0,slots:vec![1,2],
        breakup:Some(world_damage::Breakup{remaining:3,interval:0.11,elapsed:0.0,next_interval:0.08})}).unwrap();let mut host=o::Host::new(&mut b,&mut owned,&mut ord,&specs,&mut world,&mut events);for _ in 0..5{host.advance_hulks(0.13,&mut v).unwrap();}}
    else{owned.terrain.hulks.push(t::Hulk{id:1.0,source:id(1),size:Some(2),sprite_height:250.0,position:[0.0;2],velocity:[2.0,3.0],facing:0.0,angular:0.0,age:0.0,bounds:vec![[-60.0,-30.0],[60.0,-30.0],[60.0,30.0],[-60.0,30.0]],visual:None,offset:[0.0;2],radius:70.0,slots:Vec::new(),sequence:None,fixed:false,managed:false});
        let delivery=projectile::Delivery::new(&[0.0,0.0,0.0,0.0,0.0,3.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]);let emission=weapon_fire::Emission{kind:weapon_fire::EmissionKind::Projectile,id:0.73,component_id:1,cycle_id:0.0,position:[-100.0,0.0],velocity:[300.0,0.0],angle:0.0,barrel_offset:[0.0;2],base_damage:45.0,source_damage_multiplier:1.0,damage:45.0,emp:0.0,range:500.0,duration:0.0,target_ship:None,target_projectile:None,armed_while_fizzling:None,flight_time:None,source_velocity:[0.0;2],recoil_delta:[0.0;2]};
        let mut p=projectile::Projectile::new(1.0,1,b[0].handle,0,delivery,&emission,300.0,b[0].ship.as_ref().unwrap().combat.as_ref().unwrap().outgoing(),0.0);p.pos=[100.0,0.0];p.player=Some(true);let input=o::projectile_input(&p,&[],&[]);ord.projectiles.push(p);
        let hit=owned.terrain.query_hulk(&input).unwrap();let mut host=o::Host::new(&mut b,&mut owned,&mut ord,&specs,&mut world,&mut events);host.hulk_commit(o::ProjectileIdentity{serial:1.0,id:0.73},hit,&mut r,&mut v).unwrap();
    }
    f.output.extend([r.cursor,v.cursor,v.ids]);for(i,b)in b.iter().enumerate(){let s=b.ship.as_ref().unwrap();let a=s.armor.as_ref().unwrap();let sh=s.shield.as_ref().unwrap();f.output.extend(&b.motion[..6]);f.output.extend([a.data[14],s.flux.hard,s.flux.soft,s.flux.overloaded as u32 as f64,s.flux.overload_timer,sh.data[6],sh.data[7],sh.data[28],owned.ships[i].terrain_speed,s.combat.as_ref().unwrap().team as f64,(s.combat.as_ref().unwrap().player==Some(true))as u32 as f64]);
        f.output.extend(a.cells.iter().map(|v|*v as f64));f.output.extend(s.components[0].data);f.output.extend(sh.void.as_ref().map_or([0.0;4],|v|[v.data[5],v.data[7],v.data[8],v.data[11]]));
        if scene==13{f.output.extend([sh.data[8],sh.data[10]]);for system in &s.systems{f.output.extend(system.words());}f.output.extend([a.data[12],a.data[19],a.data[20],a.scars.len()as f64]);for scar in &a.scars{f.output.extend(*scar);}}}
    f.output.push(owned.terrain.asteroids.len()as f64);for a in &owned.terrain.asteroids{f.output.extend([a.position[0],a.position[1],a.velocity[0],a.velocity[1],a.hp]);}f.output.push(owned.terrain.hulks.len()as f64);f.output.push(world.blast as u32 as f64);
    if scene==13{for h in &owned.terrain.hulks{f.output.extend([h.id,h.age,h.position[0],h.position[1],h.velocity[0],h.velocity[1],h.facing,h.angular,h.offset[0],h.offset[1],h.radius,h.sequence.unwrap_or(0)as f64,h.bounds.len()as f64]);for p in &h.bounds{f.output.extend(*p);}f.output.push(h.visual.as_ref().map_or(0,|p|p.len())as f64);if let Some(v)=&h.visual{for p in v{f.output.extend(*p);}}f.output.push(h.slots.len()as f64);for(id,_)in &h.slots{f.output.push(*id as f64);}}}
    f.output.push(world.rows.len()as f64);for row in world.rows{f.output.push(row.len()as f64);f.output.extend(row);}f.output.as_ptr()as u32})}
#[no_mangle]pub extern "C" fn test_output_words()->u32{F.with_borrow(|f|f.output.len()as u32)}
#[no_mangle]pub extern "C" fn test_contracts()->u32{F.with_borrow_mut(|f|{
    let(mut b,mut owned)=fixture(0);let mut ord=battle::Ordnance::new();let specs=BTreeMap::new();let mut events=Vec::new();let mut world=World::default();let mut r=random::Random::new(8127);let mut v=random::Random::new(15181);f.output.clear();
    let stale=t::Identity{id:1.0,generation:2};let pose=b[0].motion;
    let result=o::Host::new(&mut b,&mut owned,&mut ord,&specs,&mut world,&mut events).pair(stale,id(2),&mut r,&mut v);f.output.push((result==Err(4)&&b[0].motion==pose&&r.cursor==8127.0&&v.cursor==15181.0&&world.rows.is_empty())as u32 as f64);
    let mut malformed=owned.clone();malformed.ships[0].module=Some(o::Module{parent:stale,offset:[0.0;2],angle:0.0,independent:false});f.output.push((malformed.validate(&b,&specs)==Err(4))as u32 as f64);
    let spec=lifecycle::Spec::new(&[0.0,0.0,0.0,0.0,1.0,1.0,0.0,0.0,0.0]);b[0].ship.as_mut().unwrap().systems.push(lifecycle::System::new(1,9,&spec));f.output.push((owned.validate(&b,&specs)==Err(8))as u32 as f64);b[0].ship.as_mut().unwrap().systems.clear();
    let mut duplicate=owned.clone();duplicate.ships.push(duplicate.ships[0].clone());f.output.push((duplicate.validate(&b,&specs)==Err(8))as u32 as f64);
    let mut cycle=owned.clone();cycle.ships[0].module=Some(o::Module{parent:id(2),offset:[0.0;2],angle:0.0,independent:false});cycle.ships[1].children.push(id(1));cycle.ships[1].module=Some(o::Module{parent:id(1),offset:[0.0;2],angle:0.0,independent:false});cycle.ships[0].children.push(id(2));f.output.push((cycle.validate(&b,&specs)==Err(8))as u32 as f64);
    owned.terrain.asteroids.push(t::Asteroid{id:id(99),position:[1000.0;2],velocity:[0.0;2],facing:0.0,angular:0.0,radius:40.0,mass:1200.0,hp:600.0,max_hp:600.0,sprite:2,fixed:false});owned.active.push(stale);
    let result=o::Host::new(&mut b,&mut owned,&mut ord,&specs,&mut world,&mut events).asteroid_collisions(&mut r,&mut v);f.output.push((result==Err(4)&&owned.terrain.asteroids.len()==1&&owned.terrain.asteroids[0].id==id(99)&&owned.terrain.asteroids[0].hp==600.0)as u32 as f64);owned.active.pop();
    owned.terrain.hulks.push(t::Hulk{id:13.0,source:stale,size:Some(2),sprite_height:250.0,position:[0.0;2],velocity:[0.0;2],facing:0.0,angular:0.0,age:0.0,bounds:vec![[-60.0,-30.0],[60.0,-30.0],[60.0,30.0],[-60.0,30.0]],visual:None,offset:[0.0;2],radius:70.0,slots:Vec::new(),sequence:Some(4),fixed:false,managed:false});owned.terrain.sequences.insert(4,t::Sequence{remaining:2,interval:1.0,elapsed:0.0,next:1.0});owned.terrain.next_sequence=5;
    let result=o::Host::new(&mut b,&mut owned,&mut ord,&specs,&mut world,&mut events).advance_hulks(0.1,&mut v);f.output.push((result==Err(4)&&owned.terrain.hulks.len()==1&&owned.terrain.hulks[0].id==13.0&&owned.terrain.sequences.contains_key(&4)&&owned.terrain.next_sequence==5&&owned.terrain.asteroids.len()==1)as u32 as f64);
    let result=o::Host::new(&mut b,&mut owned,&mut ord,&specs,&mut world,&mut events).impact(o::ProjectileIdentity{serial:2.0,id:0.73},[99.0,98.0],[0.0;2],None,&mut r,&mut v);f.output.push((result==Err(4)&&world.rows.is_empty()&&r.cursor==8127.0&&v.cursor==15181.0)as u32 as f64);
    b[0].ship.as_mut().unwrap().armor.as_mut().unwrap().data[18]=1.0;let result=t::Host::armor_sparks(&mut o::Host::new(&mut b,&mut owned,&mut ord,&specs,&mut world,&mut events),id(1),[0.0;2],100.0,&mut v);f.output.push((result==Ok(())&&world.rows.is_empty()&&v.cursor==15181.0)as u32 as f64);
    f.output.as_ptr()as u32
})}
