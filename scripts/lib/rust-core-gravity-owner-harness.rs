//! Uses real resident Body/ShipState/Ordnance and all gravity host methods.
#![allow(dead_code)]
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
#[path="../../native/combat-core/src/ship_state.rs"]mod ship_state;
#[path="../../native/combat-core/src/weapon_fire.rs"]mod weapon_fire;
#[path="../../native/combat-core/src/weapon_effects.rs"]mod weapon_effects;
#[path="../../native/combat-core/src/weapon_effects_owner.rs"]mod weapon_effects_owner;
#[path="../../native/combat-core/src/effect_owner.rs"]mod effect_owner;
#[path="../../native/combat-core/src/missile_guidance.rs"]mod missile_guidance;
#[path="../../native/combat-core/src/missile_owner.rs"]mod missile_owner;
#[path="../../native/combat-core/src/projectile.rs"]mod projectile;
#[path="../../native/combat-core/src/battle.rs"]mod battle;
#[path="../../native/combat-core/src/fire_control.rs"]mod fire_control;
#[path="../../native/combat-core/src/fire_query.rs"]mod fire_query;
#[path="../../native/combat-core/src/readiness.rs"]mod readiness;
#[path="../../native/combat-core/src/readiness_owner.rs"]mod readiness_owner;
#[path="../../native/combat-core/src/ship_effects.rs"]mod ship_effects;
#[path="../../native/combat-core/src/system_world.rs"]mod system_world;
#[path="../../native/combat-core/src/system_owner.rs"]mod system_owner;
#[path="../../native/combat-core/src/gravity_world.rs"]mod gravity_world;
#[path="../../native/combat-core/src/gravity_owner.rs"]mod gravity_owner;
#[path="../../native/combat-core/src/explosion_effects.rs"]mod explosion_effects;
#[path="../../native/combat-core/src/terrain_world.rs"]mod terrain_world;
#[path="../../native/combat-core/src/terrain_owner.rs"]mod terrain_owner;
#[path="../../native/combat-core/src/world_damage.rs"]mod world_damage;
#[path="../../native/combat-core/src/world_owner.rs"]mod world_owner;
mod state{
    #[derive(Clone,Copy,PartialEq,Eq)]pub struct Handle{pub slot:u32,pub generation:u32}
    #[derive(Clone)]pub struct Body{pub id:u32,pub handle:Handle,pub order:f64,pub motion:[f64;crate::motion::WIDTH],pub ship:Option<crate::ship_state::ShipState>}
}
use std::{cell::RefCell,collections::BTreeMap};
use gravity_world::{Host as _,BodyKind,Target};
use system_world::Identity;
fn id(n:u32)->Identity{Identity{slot:n,generation:1}}
fn h(n:u32)->state::Handle{state::Handle{slot:n,generation:1}}
struct F{input:Vec<f64>,output:Vec<f64>,bodies:Vec<state::Body>,owned:gravity_owner::Owned,ordnance:battle::Ordnance,specs:BTreeMap<u32,lifecycle::Spec>,random:random::Random,visual:random::Random,records:Vec<gravity_owner::Record>,destroyed:u32}
thread_local!{static F:RefCell<F>=RefCell::new(F{input:Vec::new(),output:Vec::new(),bodies:Vec::new(),owned:gravity_owner::Owned::default(),ordnance:battle::Ordnance::new(),specs:BTreeMap::new(),random:random::Random::new(821),visual:random::Random::new(1757),records:Vec::new(),destroyed:0});}
#[no_mangle]pub extern "C" fn test_input(n:u32)->u32{F.with_borrow_mut(|f|{f.input.resize(n as usize,0.0);f.input.as_mut_ptr()as u32})}
#[no_mangle]pub extern "C" fn test_reset()->u32{F.with_borrow_mut(|f|{
    let scene=f.input[0]as usize;f.bodies.clear();f.records.clear();f.destroyed=0;f.owned=gravity_owner::Owned::default();f.random=random::Random::new(821);f.visual=random::Random::new(1757);f.ordnance=battle::Ordnance::new();
    let names=["ship-2","Ship_10","ship.1"];
    for i in 0..3{let mut s=ship_state::ShipState::new(&[20000.0,0.0,4.0,1.0,1.0,0.0,1.0,0.0,0.0,0.0,0.0,1.0,0.0,1.0,0.0,0.0,0.0]);
        s.armor=Some(armor::Armor::new(&[9.0,7.0,10.0,10.0,90.0,-45.0,-35.0,5000.0,5000.0,1.0,1.0,0.85,1.0,1.0,0.0,0.0,0.0]));
        s.damage_policy=[1.0,1.13,1.19,1.17,1.09,100.0,1.0,1.0];if i==0&&scene>=4{s.flux.soft=7000.0;}
        for(j,p)in [[3.0,-4.0],[-7.0,6.0],[21.0,9.0]].iter().enumerate(){s.components.push(component::Component::new(&[(j+1)as f64,0.0,if j==1{2.0}else{0.0},p[0],p[1],1.0,1.0],&mut f.random));}
        let mut c=battle::CombatShip::new(&[if i==0{0.0}else{1.0},4.0,45.0,6.0,1.0,if i==0{1.0}else{0.0}]);
        c.bounds=vec![[-45.0,-35.0],[45.0,-35.0],[45.0,-5.0],[5.0,-5.0],[5.0,35.0],[-45.0,35.0]];c.attrs[1]=0.93;c.attrs[11]=1.07;c.attrs[15]=1.2;if i==0&&scene>=4{c.attrs[3..11].copy_from_slice(&[1.0,2.0,1.0,15.0,1.09,13.0,21.0,7.0]);}if i==1&&scene>=4{c.graviton_multiplier=1.08;}
        c.query=Some(fire_query::ShipQuery::new(&[0.0;12]));c.query.as_mut().unwrap().aim=[300.0,80.0];s.combat=Some(c);
        let mut pose=[0.0;motion::WIDTH];pose[0]=if i==0{0.0}else{200.0+(i-1)as f64*70.0};pose[1]=if i==0{0.0}else{50.0};pose[2]=12.0;pose[3]=-7.0;pose[4]=if i==0{0.17}else{0.0};pose[5]=0.23;pose[14]=100.0;
        let mut owned=system_owner::Owned::new(&[0.0;13],&pose);owned.range_multiplier=1.0;if scene>=4{let mut mods=ship_effects::Modifiers::default();if i==0{mods.weapon(ship_effects::ENERGY,ship_effects::DAMAGE,1.11);}else{mods.set(ship_effects::ARMOR_DAMAGE,0.7);mods.set(ship_effects::HULL_DAMAGE,0.8);}owned.runtime.push((91,mods));}let mut repair=ship_effects::FieldRepair::new(&[]);repair.quiet=9.0;repair.tick=0.5;repair.working=true;owned.repair=Some(repair);s.world=Some(owned);
        let mut eng=engine::Controller::new(&[4.0,45.0,1.0,2.0]);eng.install(&[0.0,-11.0,-12.0,25.0,30.0,0.0,0.0,0.0,0.0,0.0],&mut f.random);eng.install(&[1.0,16.0,8.0,25.0,30.0,0.0,0.0,0.0,0.0,0.0],&mut f.random);s.engines=Some(eng);
        if i==1{let sh=shield::Shield::new(&[if scene%4==3{3.0}else{2.0},360.0,70.0,0.8,0.0,0.0,1.0,0.0,0.0,0.0,0.0,1.0,1.0,0.0,0.0,13.0,-9.0,0.0,0.0]);s.shield=Some(sh);
            let sh=s.shield.as_mut().unwrap();sh.data[6]=if scene%4==0||scene%4==3{0.0}else{1.0};sh.data[7]=if scene%4==1{75.0}else{360.0};sh.data[8]=std::f64::consts::PI;
            if scene%4==2{sh.configure_void(&[4.0,80.0,20.0,5.0,3.0]);}if scene>=4{sh.data[40]=1.19;sh.data[41]=1.17;sh.data[42]=1.07;}}
        f.bodies.push(state::Body{id:i as u32+1,handle:h(i as u32+1),order:i as f64,motion:pose,ship:Some(s)});
        f.owned.ships.push(gravity_owner::ShipMeta{identity:id(i as u32+1),name:names[i].into(),mass:if i==2{700.0}else{3000.0},fixed:false,module_hull:i==2,
            module:if i==2{Some(gravity_owner::ModulePose{parent:id(2),offset:[70.0,0.0],angle:0.2,independent_rotation:false})}else{None},children:if i==1{vec![id(3)]}else{Vec::new()},systems:Vec::new(),mounts:Vec::new()});}
    let bounds=vec![[0.0,0.0],[120.0,0.0],[120.0,100.0],[0.0,100.0],[0.0,0.0],[30.0,20.0],[30.0,70.0],[80.0,70.0],[80.0,20.0],[30.0,20.0],[0.0,0.0]];
    f.owned.terrain=Some(vec![gravity_owner::Environment{body:gravity_world::Environment{target:Target{kind:BodyKind::Asteroid,identity:id(50)},numeric_id:50.0,position:[95.0,-50.0],velocity:[1.0,2.0],radius:17.0,mass:400.0,fixed:false,alive:true},facing:0.0,offset:[0.0;2],bounds:Vec::new(),source_mass:0.0,source_bounds:Vec::new(),managed:false},
        gravity_owner::Environment{body:gravity_world::Environment{target:Target{kind:BodyKind::Hulk,identity:id(51)},numeric_id:51.0,position:[300.0,180.0],velocity:[1.0,-2.0],radius:85.0,mass:0.0,fixed:false,alive:true},facing:0.31,offset:[60.0,50.0],bounds,source_mass:3000.0,source_bounds:vec![[-70.0,-55.0],[70.0,-55.0],[70.0,55.0],[-70.0,55.0]],managed:false}]);
    f.owned.collation.keys=(0..f.input[1]as usize).map(|i|{let key=["SHIP:ship-2","SHIP:Ship_10","SHIP:ship.1"][i].to_string();(key,f.input[2+i]as u32)}).collect();
    f.owned.collation.prefixes=["ASTEROID","HULK","PROJECTILE","SHIP"].iter().enumerate().map(|(i,s)|(s.to_string(),f.input[5+i]as u32)).collect();
    f.owned.collation.numeric_alphabet=Some("-.0123456789+e".chars().enumerate().map(|(i,c)|(c,f.input[9+i]as u32)).collect());
    0})}
#[no_mangle]pub extern "C" fn test_query()->u32{F.with_borrow_mut(|f|{let d=f.input.clone();let target=Target{kind:match d[0]as u32{0=>BodyKind::Ship,1=>BodyKind::Asteroid,_=>BodyKind::Hulk},identity:id(d[1]as u32)};
    let mut host=gravity_owner::Host{bodies:&mut f.bodies,owned:&mut f.owned,ordnance:&mut f.ordnance,specs:&f.specs,random:&mut f.random,visual:&mut f.visual,records:&mut f.records,
        destruction:|_:&mut[state::Body],_:usize,_:&mut gravity_owner::Owned,_:&mut battle::Ordnance,_:&mut random::Random,_:&mut random::Random,_:&mut Vec<gravity_owner::Record>|Ok(())};
    let obs=host.observe().unwrap();let body=obs.resolve(target).unwrap().unwrap();let start=[d[2],d[3]];let end=[d[4],d[5]];let t=host.segment_entry(target,start,end).unwrap();
    let edge=host.pointer_distance(&body,start).unwrap();let line=host.line_clear(id(1),&body,start).unwrap();let inside=host.owner_contains(id(1),start).unwrap();
    f.output=vec![t.is_some()as u32 as f64,t.unwrap_or(0.0),edge,line as u32 as f64,inside as u32 as f64,body.mass,body.radius];f.output.as_mut_ptr()as u32})}
#[no_mangle]pub extern "C" fn test_damage()->u32{F.with_borrow_mut(|f|{let d=f.input.clone();f.records.clear();let destroyed=&mut f.destroyed;
    let mut host=gravity_owner::Host{bodies:&mut f.bodies,owned:&mut f.owned,ordnance:&mut f.ordnance,specs:&f.specs,random:&mut f.random,visual:&mut f.visual,records:&mut f.records,
        destruction:|b:&mut[state::Body],i:usize,_:&mut gravity_owner::Owned,_:&mut battle::Ordnance,_:&mut random::Random,_:&mut random::Random,_:&mut Vec<gravity_owner::Record>|{b[i].ship.as_mut().unwrap().flags|=ship_state::DEAD;*destroyed+=1;Ok(())}};
    let target=d.get(5).copied().unwrap_or(2.0)as usize;let p=host.tidal_hit(id(1),id(target as u32),[d[0],d[1]],d[2],d[3],d[4]==1.0).unwrap();let s=host.bodies[target-1].ship.as_ref().unwrap();
    f.output=vec![p.is_some()as u32 as f64,p.map_or(0.0,|p|p[0]),p.map_or(0.0,|p|p[1]),s.armor.as_ref().unwrap().data[14],s.flux.soft,s.flux.hard,host.random.cursor,host.visual.cursor];let root_quiet=host.bodies[1].ship.as_ref().unwrap().shield.as_ref().unwrap().void.as_ref().map_or(-1.0,|v|v.data[7]);
    f.output.extend(s.armor.as_ref().unwrap().cells.iter().map(|x|*x as f64));for c in &s.components{f.output.extend([c.data[5],c.data[11],c.data[13],c.data[14]]);}let sh=s.shield.as_ref().unwrap();f.output.extend([sh.data[6],sh.data[7],sh.void.as_ref().map_or(-1.0,|v|v.data[5]),sh.data[28],sh.void.as_ref().map_or(-1.0,|v|v.data[7]),sh.data[40]]);
    f.output.push(f.destroyed as f64);for engine in &s.engines.as_ref().unwrap().engines{f.output.extend([engine.data[10],engine.data[12],engine.data[15],engine.data[16]]);}let repair=s.world.as_ref().unwrap().repair.as_ref().unwrap();f.output.extend([repair.quiet,repair.tick,repair.working as u32 as f64]);f.output.push(root_quiet);
    let particles=f.records.iter().filter_map(|r|if let gravity_owner::Record::Sparks{particles,..}=r{Some(particles)}else{None}).flatten().collect::<Vec<_>>();f.output.push(particles.len()as f64);for p in particles{f.output.extend([p.position[0],p.position[1],p.velocity[0],p.velocity[1],p.size]);}f.output.as_mut_ptr()as u32})}
#[no_mangle]pub extern "C" fn test_module_setup(){F.with_borrow_mut(|f|{
    let source=f.bodies[0].ship.as_mut().unwrap();source.flux.soft=if source.combat.as_ref().unwrap().attrs[5]>0.0{7000.0}else{0.0};source.flux.hard=0.0;
    let root=f.bodies[1].ship.as_mut().unwrap().shield.as_mut().unwrap();root.configure_void(&[4.0,80.0,20.0,5.0,3.0]);root.data[6]=0.0;root.data[7]=0.0;
    let mut child=shield::Shield::new(&[2.0,360.0,70.0,0.8,0.0,0.0,1.0,0.0,0.0,0.0,0.0,1.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0]);child.configure_void(&[2.0,40.0,10.0,7.0,2.0]);child.data[6]=0.0;child.data[7]=0.0;f.bodies[2].ship.as_mut().unwrap().shield=Some(child);
})}
#[no_mangle]pub extern "C" fn test_sync()->u32{F.with_borrow_mut(|f|{let mut host=gravity_owner::Host{bodies:&mut f.bodies,owned:&mut f.owned,ordnance:&mut f.ordnance,specs:&f.specs,random:&mut f.random,visual:&mut f.visual,records:&mut f.records,
    destruction:|_:&mut[state::Body],_:usize,_:&mut gravity_owner::Owned,_:&mut battle::Ordnance,_:&mut random::Random,_:&mut random::Random,_:&mut Vec<gravity_owner::Record>|Ok(())};host.sync_modules(id(2)).unwrap();f.output=host.bodies[2].motion[..6].to_vec();f.output.as_mut_ptr()as u32})}
#[no_mangle]pub extern "C" fn test_nested()->u32{F.with_borrow_mut(|f|{f.bodies.truncate(3);f.owned.ships.truncate(3);let mut b=f.bodies[2].clone();b.id=4;b.handle=h(4);b.order=3.0;b.motion[4]=0.77;b.motion[5]=-0.16;let s=b.ship.as_mut().unwrap();s.flags&=!ship_state::DEAD;s.armor.as_mut().unwrap().data[14]=5000.0;s.combat.as_mut().unwrap().team=99;s.combat.as_mut().unwrap().player=Some(true);f.bodies.push(b);
    let mut meta=f.owned.ships[2].clone();meta.identity=id(4);meta.name="nested-leaf".into();meta.children.clear();meta.module=Some(gravity_owner::ModulePose{parent:id(3),offset:[f.input[1],f.input[2]],angle:f.input[3],independent_rotation:f.input[0]==1.0});f.owned.ships[2].children=vec![id(4)];f.owned.ships.push(meta);
    let mut host=gravity_owner::Host{bodies:&mut f.bodies,owned:&mut f.owned,ordnance:&mut f.ordnance,specs:&f.specs,random:&mut f.random,visual:&mut f.visual,records:&mut f.records,destruction:|_:&mut[state::Body],_:usize,_:&mut gravity_owner::Owned,_:&mut battle::Ordnance,_:&mut random::Random,_:&mut random::Random,_:&mut Vec<gravity_owner::Record>|Ok(())};host.sync_modules(id(2)).unwrap();let leaf=&host.bodies[3];let c=leaf.ship.as_ref().unwrap().combat.as_ref().unwrap();f.output=leaf.motion[..6].to_vec();f.output.extend([c.team as f64,c.player.unwrap_or(false)as u32 as f64]);f.output.as_mut_ptr()as u32
})}
#[no_mangle]pub extern "C" fn test_capture()->u32{F.with_borrow_mut(|f|{let d=f.input.clone();let mut delivery=projectile::Delivery::new(&[1.0,23.0,0.15,1.0,2.0,1.3,0.0,0.0,0.0,0.0,0.0,0.0,1.0,0.2,0.0,0.0,0.0,0.0,0.0,0.0]);
    delivery.guidance=Some(missile_owner::Spec::new(&[1.0,1.0,0.0,0.0,0.0,1.0,200.0,1.0,700.0,1.0,2.0,1.0,5.0,0.0,0.0,0.0,0.0,0.0,0.0]));
    let emission=weapon_fire::Emission{kind:weapon_fire::EmissionKind::Projectile,id:123.0,component_id:1,cycle_id:1.0,position:[25.0,0.0],velocity:[-300.0,20.0],angle:std::f64::consts::PI,barrel_offset:[0.0;2],base_damage:180.0,source_damage_multiplier:1.0,damage:180.0,emp:0.0,range:2000.0,duration:0.0,target_ship:Some(2),target_projectile:Some(21),armed_while_fizzling:None,flight_time:None,source_velocity:[0.0;2],recoil_delta:[0.0;2]};
    f.ordnance.projectiles.clear();f.owned.projectiles.clear();let mut p=projectile::Projectile::new(20.0,2,h(2),1,delivery,&emission,700.0,[0.0;8],0.0);p.target_handle=Some(h(2));missile_owner::initialize(&mut p,1.0,&[(2,h(2))]);f.ordnance.projectiles.push(p);f.owned.projectile_spawned(20.0).unwrap();
    let mut host=gravity_owner::Host{bodies:&mut f.bodies,owned:&mut f.owned,ordnance:&mut f.ordnance,specs:&f.specs,random:&mut f.random,visual:&mut f.visual,records:&mut f.records,
        destruction:|_:&mut[state::Body],_:usize,_:&mut gravity_owner::Owned,_:&mut battle::Ordnance,_:&mut random::Random,_:&mut random::Random,_:&mut Vec<gravity_owner::Record>|Ok(())};
    host.capture_projectile(id(20),id(1)).unwrap();host.capture_projectile(id(20),id(1)).unwrap();host.binding(id(20),gravity_world::Binding{owner:id(1),serial:4.0,age:0.1,turn:0.2}).unwrap();host.velocity(Target{kind:BodyKind::Projectile,identity:id(20)},[50.0,60.0],true,Some(0.37)).unwrap();
    let p=&host.ordnance.projectiles[0];let spec=p.delivery.guidance.as_ref().unwrap();let state=p.guidance.as_ref().unwrap();let meta=&host.owned.projectiles[0];
    f.output=vec![p.source as f64,p.source_handle.slot as f64,p.team as f64,p.player.unwrap_or(false)as u32 as f64,p.guided as u32 as f64,spec.inertial as u32 as f64,spec.acceleration.unwrap(),spec.speed.is_some()as u32 as f64,p.gravity_deflected as u32 as f64,
        p.target_ship.is_some()as u32 as f64,p.target_projectile.is_some()as u32 as f64,meta.original_source.unwrap().0 as f64,meta.captured_by.unwrap().slot as f64,meta.mass_driver as u32 as f64,state.source.handle as f64,state.guided as u32 as f64,state.acceleration.unwrap(),state.max_speed.is_some()as u32 as f64,state.target_ship.is_some()as u32 as f64,state.target_projectile.is_some()as u32 as f64,p.damage,p.base_damage,p.range,p.velocity[0],p.velocity[1],p.angle,meta.binding.unwrap().age,meta.binding.unwrap().turn];let _=d;f.output.as_mut_ptr()as u32})}
#[no_mangle]pub extern "C" fn test_contract()->u32{F.with_borrow_mut(|f|{let mut bits=0;let saved=f.owned.terrain.take();{
    let host=gravity_owner::Host{bodies:&mut f.bodies,owned:&mut f.owned,ordnance:&mut f.ordnance,specs:&f.specs,random:&mut f.random,visual:&mut f.visual,records:&mut f.records,
        destruction:|_:&mut[state::Body],_:usize,_:&mut gravity_owner::Owned,_:&mut battle::Ordnance,_:&mut random::Random,_:&mut random::Random,_:&mut Vec<gravity_owner::Record>|Ok(())};if host.observe().is_err(){bits|=1;}}
    f.owned.terrain=saved;
    let d=lifecycle::Spec::new(&[0.2,2.0,0.1,3.0,1.0,1.0,0.0,100.0,1.0]);f.specs.insert(1,d.clone());let s=f.bodies[0].ship.as_mut().unwrap();s.systems.push(lifecycle::System::new(100,1,&d));s.world.as_mut().unwrap().metas.insert(100,system_owner::Meta{kind:ship_effects::Kind::None,input:None,jump:ship_effects::TacticalJump::default(),regen:0.0});
    let mut slot=gravity_world::Slot::new(id(1),100,gravity_world::Kind::Well,"WEB_GRAVITY_WELL".into(),d);slot.lifecycle.serial=999.0;f.owned.ships[0].systems.push(gravity_owner::SystemMeta::from_slot(slot));
    let mut c=f.owned.hydrate(&f.bodies,&f.specs).unwrap();if c.slots[0].lifecycle.serial==0.0{bits|=2;}c.slots[0].lifecycle.serial=7.0;c.slots[0].held=true;f.owned.restore(&mut f.bodies,c).unwrap();if f.bodies[0].ship.as_ref().unwrap().systems[0].serial==7.0&&f.owned.ships[0].systems[0].held{bits|=4;}
    let checkpoint=(f.bodies.clone(),f.owned.clone(),f.ordnance.clone(),f.random.clone(),f.visual.clone());{
    let mut host=gravity_owner::Host{bodies:&mut f.bodies,owned:&mut f.owned,ordnance:&mut f.ordnance,specs:&f.specs,random:&mut f.random,visual:&mut f.visual,records:&mut f.records,
        destruction:|_:&mut[state::Body],_:usize,_:&mut gravity_owner::Owned,_:&mut battle::Ordnance,_:&mut random::Random,_:&mut random::Random,_:&mut Vec<gravity_owner::Record>|Ok(())};host.velocity(Target{kind:BodyKind::Ship,identity:id(1)},[666.0,777.0],false,None).unwrap();if host.velocity(Target{kind:BodyKind::Ship,identity:Identity{slot:2,generation:2}},[1.0,2.0],false,None)==Err(gravity_world::Error::Stale){bits|=8;}}
    f.bodies=checkpoint.0;f.owned=checkpoint.1;f.ordnance=checkpoint.2;f.random=checkpoint.3;f.visual=checkpoint.4;if f.bodies[0].motion[2]==12.0{bits|=16;}bits})}
#[no_mangle]pub extern "C" fn test_number()->u32{F.with_borrow_mut(|f|{f.output=gravity_owner::number_key(f.input[0]).bytes().map(|b|b as f64).collect();f.output.as_mut_ptr()as u32})}
#[no_mangle]pub extern "C" fn test_compare()->u32{F.with_borrow_mut(|f|{use std::cmp::Ordering;let a=["SHIP:ship-2","SHIP:Ship_10","SHIP:ship.1","PROJECTILE:0.1","PROJECTILE:0.12","PROJECTILE:0.2","PROJECTILE:0.0001","PROJECTILE:1e-7","PROJECTILE:12","PROJECTILE:2","PROJECTILE:1.2e+21","PROJECTILE:1.2e-8","ASTEROID:50","HULK:51"];
    let host=gravity_owner::Host{bodies:&mut f.bodies,owned:&mut f.owned,ordnance:&mut f.ordnance,specs:&f.specs,random:&mut f.random,visual:&mut f.visual,records:&mut f.records,
        destruction:|_:&mut[state::Body],_:usize,_:&mut gravity_owner::Owned,_:&mut battle::Ordnance,_:&mut random::Random,_:&mut random::Random,_:&mut Vec<gravity_owner::Record>|Ok(())};
    let r=host.locale_compare(a[f.input[0]as usize],a[f.input[1]as usize]).unwrap();match r{Ordering::Less=>0,Ordering::Equal=>1,Ordering::Greater=>2}})}
#[no_mangle]pub extern "C" fn test_output_words()->u32{F.with_borrow(|f|f.output.len()as u32)}


#[path="../../native/combat-core/src/tactical_ai.rs"]mod tactical_ai;
#[path="../../native/combat-core/src/navigation_ai.rs"]mod navigation_ai;
#[path="../../native/combat-core/src/defense_ai.rs"]mod defense_ai;
#[path="../../native/combat-core/src/ai_owner.rs"]mod ai_owner;
#[path="../../native/combat-core/src/ai_resident.rs"]mod ai_resident;

#[path="../../native/combat-core/src/ai_wire.rs"]mod ai_wire;
