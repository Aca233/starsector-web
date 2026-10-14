#![allow(dead_code)]
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
#[path="../../native/combat-core/src/gravity_world.rs"]mod gravity_world;
#[path="../../native/combat-core/src/gravity_owner.rs"]mod gravity_owner;
#[path="../../native/combat-core/src/gravity_runtime.rs"]mod gravity_runtime;
#[path="../../native/combat-core/src/engine.rs"]mod engine;
#[path="../../native/combat-core/src/lifecycle.rs"]mod lifecycle;
#[path="../../native/combat-core/src/motion.rs"]mod motion;
#[path="../../native/combat-core/src/random.rs"]mod random;
#[path="../../native/combat-core/src/shield.rs"]mod shield;
#[path="../../native/combat-core/src/ship_state.rs"]mod ship_state;
#[path="../../native/combat-core/src/explosion_effects.rs"]mod explosion_effects;
#[path="../../native/combat-core/src/world_damage.rs"]mod world_damage;
#[path="../../native/combat-core/src/terrain_world.rs"]mod terrain_world;
#[path="../../native/combat-core/src/terrain_owner.rs"]mod terrain_owner;
#[path="../../native/combat-core/src/world_owner.rs"]mod world_owner;
#[path="../../native/combat-core/src/weapon_world.rs"]mod weapon_world;
#[path="../../native/combat-core/src/gravity_terrain.rs"]mod gravity_terrain;
mod state{
    #[derive(Clone,Copy,PartialEq,Eq)]pub struct Handle{pub slot:u32,pub generation:u32}
    #[derive(Clone)]pub struct Body{pub id:u32,pub handle:Handle,pub order:f64,pub motion:[f64;crate::motion::WIDTH],pub ship:Option<crate::ship_state::ShipState>}
}
use std::{cell::RefCell,collections::BTreeMap};use state::{Body,Handle};use terrain_owner as o;use terrain_world as t;
fn id(row:usize)->t::Identity{t::Identity{id:row as f64+1.0,generation:1}}
fn rect(x:f64,y:f64)->Vec<[f64;2]>{vec![[-x,-y],[x,-y],[x,y],[-x,y]]}
#[derive(Clone)]struct World{bodies:Vec<Body>,owned:o::Owned,ordnance:battle::Ordnance,world:world_owner::Owned,random:random::Random,visual:random::Random}
fn world(scene:u32)->World{let mut bodies=Vec::new();let mut owned=o::Owned::default();
    for row in 0..3{let mut s=ship_state::ShipState::new(&[if scene==4{100.0}else{100000.0},0.0,1.0,1.0,1.0,0.0,1.0,0.0,0.0,0.0,2.0,1.0,0.0,1.0,0.0,0.0,0.0]);
        s.armor=Some(armor::Armor::new(&[9.0,7.0,10.0,10.0,27.0,-45.0,-35.0,10000.0,10000.0,1.0,1.0,0.85,1.0,1.0,0.0,0.0,0.0]));s.damage_policy=[1.23,1.13,1.19,1.17,1.09,100.0,1.0,1.0];
        if scene==19{s.armor.as_mut().unwrap().data[18]=1.0;}let mut init=random::Random::new(0);s.components.push(component::Component::new(&[1.0,0.0,0.0,23.0,-4.0,1.0,1.0],&mut init));
        let mut c=battle::CombatShip::new(&[row as f64,1.0,30.0,4.0,1.0,(row==0)as u32 as f64]);c.bounds=if row==2{rect(60.0,40.0)}else if scene==7{rect(50.0,2.0)}else if scene==8{vec![[-30.0,-20.0],[30.0,-20.0],[30.0,20.0],[5.0,20.0],[5.0,0.0],[-5.0,0.0],[-5.0,20.0],[-30.0,20.0]]}else{rect(30.0,20.0)};
        if scene==9{c.bounds.reverse();c.bounds.insert(1,c.bounds[0]);}if scene==30&&row==2{c.bounds.clear();}c.expected_bounds=c.bounds.len();c.attrs[1]=if scene==20{1.0}else{1.13};c.attrs[2]=1.11;
        let mut sh=shield::Shield::new(&[if scene==5{1.0}else{2.0},if matches!(scene,5|6){60.0}else{360.0},40.0,0.83,0.0,1.0,1.0,0.5,0.5,2.0,0.0,0.0,1.0,0.0,1.0,4.0,2.0,0.0,0.0]);
        sh.data[6]=matches!(scene,2|3|4|5|6)as u32 as f64;sh.data[7]=if matches!(scene,5|6){60.0}else{360.0};sh.data[8]=if scene==6{std::f64::consts::PI}else{0.0};
        if scene==3{sh.configure_void(&[2.0,50.0,0.0,0.4,1.0]);}s.shield=Some(sh);s.combat=Some(c);if row==2||scene==12&&row==1||scene==15&&row==0{s.flags|=ship_state::DEAD;}
        if scene==16&&row==0{s.flags|=ship_state::RETREATED;}if scene==17&&row==0{s.flags|=ship_state::DOCKED;}if scene==18&&row==0{s.combat.as_mut().unwrap().attrs[0]=1.0;}
        s.sync_shield();let mut pose=[0.0;motion::WIDTH];pose[0]=if row==0{0.0}else{1000.0+row as f64*100.0};pose[2]=if row==0{if scene==13{-40.0}else if scene==14{8.0}else if scene==22{900.0}else{75.0}}else{0.0};pose[3]=if row==0&&scene==21{41.0}else{0.0};pose[4]=if scene==21{0.27}else{0.0};pose[5]=if scene==11{0.17}else{0.0};
        let handle=Handle{slot:row as u32,generation:1};bodies.push(Body{id:row as u32+1,handle,order:row as f64,motion:pose,ship:Some(s)});
        let module=((10..=12).contains(&scene)||scene==28)&&row==1;
        owned.ships.push(o::Meta{identity:id(row),handle,stable_id:format!("gravity-{row}"),mass:if row==0{500.0}else if row==1{200.0}else{300.0},station:matches!(scene,23|27)&&row==0,
            module:if module{Some(o::Module{parent:id(0),offset:[50.0,12.0],angle:0.4,independent:scene==11})}else if scene==28&&row==2{Some(o::Module{parent:id(1),offset:[10.0,4.0],angle:0.2,independent:false})}else{None},children:if((10..=12).contains(&scene)||scene==28)&&row==0{vec![id(1)]}else if scene==28&&row==1{vec![id(2)]}else{Vec::new()},sprite_height:250.0,slots:Vec::new(),terrain_speed:1.0,emergency_phase_used:false,fighter_recall:false});
        if row<2{owned.active.push(id(row));}
    }
    let h=t::Hulk{id:0.731,source:id(2),size:Some(2),sprite_height:250.0,position:if scene==7{[0.0;2]}else if (10..=12).contains(&scene)||scene==28{[80.0,12.0]}else{[30.0,0.0]},velocity:if scene==24{[140.0,0.0]}else{[-12.0,0.0]},facing:if scene==21{0.11}else{0.0},angular:if scene==21{0.08}else{0.0},age:3.0,bounds:if scene==7{rect(2.0,50.0)}else if scene==6{rect(15.0,10.0)}else if scene==29{rect(4.0,4.0)}else if scene==9{let mut p=rect(15.0,40.0);p.reverse();p.insert(1,p[0]);p}else{rect(15.0,40.0)},visual:None,offset:if scene==25{[7.0,-4.0]}else{[0.0;2]},radius:70.0,slots:Vec::new(),sequence:None,fixed:matches!(scene,1|23),managed:scene!=0};
    owned.terrain.hulks.push(h);if scene==26{let mut h=owned.terrain.hulks[0].clone();h.id=0.732;owned.terrain.hulks.push(h);}
    let mut w=World{bodies,owned,ordnance:battle::Ordnance::new(),world:world_owner::Owned::new(id(0),id(1)),random:random::Random::new(8127),visual:random::Random::new(15181)};
    if (10..=12).contains(&scene)||scene==28{let mut notices=Vec::new();let specs=BTreeMap::new();let mut adapter=world_owner::TerrainWorld{world:&mut w.world};let mut host=o::Host::new(&mut w.bodies,&mut w.owned,&mut w.ordnance,&specs,&mut adapter,&mut notices);t::Host::sync_modules(&mut host,id(0)).unwrap();}w
}
struct Fixture{input:Vec<f64>,output:Vec<f64>,world:World,saved:Option<World>}
thread_local!{static F:RefCell<Fixture>=RefCell::new(Fixture{input:Vec::new(),output:Vec::new(),world:world(0),saved:None});}
fn snapshot(f:&mut Fixture){let w=&f.world;let mut out=vec![w.random.cursor,w.random.ids,w.visual.cursor,w.visual.ids];
    for b in &w.bodies{let s=b.ship.as_ref().unwrap();let a=s.armor.as_ref().unwrap();let sh=s.shield.as_ref().unwrap();out.extend(&b.motion[..6]);out.extend([a.data[14],(s.flags&(ship_state::DEAD|ship_state::DOCKED|ship_state::RETREATED)) as f64,s.flux.hard,s.flux.soft,s.flux.overloaded as u32 as f64,s.flux.overload_timer,sh.data[6],sh.data[7],sh.data[28],sh.data[10],sh.data[11]]);out.extend(a.cells.iter().map(|v|*v as f64));out.extend(s.components[0].data);out.extend(sh.void.as_ref().map_or([0.0;19],|v|v.data));out.extend([a.data[12],a.data[19],a.scars.len()as f64]);for scar in &a.scars{out.extend(scar);}}
    out.push(w.owned.terrain.hulks.len()as f64);for h in &w.owned.terrain.hulks{out.extend([h.id,h.source.id,h.source.generation as f64,h.position[0],h.position[1],h.velocity[0],h.velocity[1],h.facing,h.angular,h.age,h.fixed as u32 as f64,h.managed as u32 as f64]);}
    out.push(w.world.output.len()as f64);for event in &w.world.output{match event{
        world_owner::Output::Terrain(t::Output::Ripple{point,radius,color})=>out.extend([0.0,point[0],point[1],*radius,color[0]as f64,color[1]as f64,color[2]as f64]),
        world_owner::Output::Death(world_damage::Output::ArmorParticles{particles,..})=>{out.extend([1.0,particles.len()as f64]);for p in particles{out.extend([p.position[0],p.position[1],p.velocity[0],p.velocity[1],p.size]);}},
        world_owner::Output::Weapon(weapon_world::Output::Floating(p))=>out.extend([2.0,p.id,p.position[0],p.position[1],p.velocity[0],p.velocity[1],p.text.parse().unwrap(),p.size,p.life,p.maximum_life,p.color[0]as f64,p.color[1]as f64,p.color[2]as f64]),_=>panic!("unexpected output"),
    }}
    out.push(w.world.floating.len()as f64);for p in &w.world.floating{out.extend([p.id,p.position[0],p.position[1],p.velocity[0],p.velocity[1],p.text.parse().unwrap(),p.size,p.life,p.maximum_life]);}out.push(w.world.particles.len()as f64);f.output=out;
}
#[no_mangle]pub extern "C" fn test_input(n:u32)->u32{F.with_borrow_mut(|f|{f.input.resize(n as usize,0.0);f.input.as_mut_ptr()as u32})}
#[no_mangle]pub extern "C" fn test_reset()->u32{F.with_borrow_mut(|f|{f.world=world(f.input[0]as u32);f.saved=None;snapshot(f);f.output.as_ptr()as u32})}
#[no_mangle]pub extern "C" fn test_step()->u32{F.with_borrow_mut(|f|{if f.input[0]==1.0{f.saved=Some(f.world.clone());}else if f.input[0]==2.0{f.world=f.saved.clone().unwrap();}else{
    let w=&mut f.world;let mut events=Vec::new();let specs=BTreeMap::new();let mut adapter=world_owner::TerrainWorld{world:&mut w.world};let mut host=o::Host::new(&mut w.bodies,&mut w.owned,&mut w.ordnance,&specs,&mut adapter,&mut events);
    gravity_terrain::advance_owned(f.input[1],&mut host,&mut w.random,&mut w.visual).unwrap();}snapshot(f);f.output.as_ptr()as u32})}
#[no_mangle]pub extern "C" fn test_output_words()->u32{F.with_borrow(|f|f.output.len()as u32)}
#[no_mangle]pub extern "C" fn test_contracts()->u32{F.with_borrow_mut(|f|{use gravity_terrain::Host;let mut w=world(10);let specs=BTreeMap::new();let mut events=Vec::new();let mut adapter=world_owner::TerrainWorld{world:&mut w.world};let mut host=o::Host::new(&mut w.bodies,&mut w.owned,&mut w.ordnance,&specs,&mut adapter,&mut events);let mut result=Vec::new();
    result.push((host.assembly_mass(id(0))==Ok(700.0))as u32 as f64);host.bodies[1].ship.as_mut().unwrap().flags|=ship_state::DEAD;result.push((host.assembly_mass(id(0))==Ok(700.0))as u32 as f64);
    result.push((host.hulk_source(t::Identity{id:3.0,generation:2}).is_err())as u32 as f64);host.owned.ships[0].children.push(id(1));result.push((host.assembly_mass(id(0))==Err(8))as u32 as f64);host.owned.ships[0].children.pop();host.owned.ships[1].module.as_mut().unwrap().parent=id(2);result.push((host.assembly_mass(id(0))==Err(8))as u32 as f64);
    host.owned.ships[1].module.as_mut().unwrap().parent=id(0);host.bodies[0].ship.as_mut().unwrap().combat=None;result.push((host.live_ship(id(0)).is_err())as u32 as f64);
    host.owned.terrain.hulks[0].source=t::Identity{id:3.0,generation:2};let h=host.owned.terrain.hulks[0].clone();let result_call=gravity_terrain::advance_owned(0.0,&mut host,&mut w.random,&mut w.visual);result.push((result_call==Err(4)&&host.owned.terrain.hulks.len()==1&&host.owned.terrain.hulks[0].id==h.id&&w.random.cursor==8127.0&&w.visual.cursor==15181.0)as u32 as f64);
    let result_call=gravity_terrain::advance_owned(f64::NAN,&mut host,&mut w.random,&mut w.visual);result.push((result_call==Err(7)&&host.owned.terrain.hulks.len()==1&&host.owned.terrain.hulks[0].id==h.id)as u32 as f64);
    f.output=result;f.output.as_ptr()as u32})}

#[path="../../native/combat-core/src/tactical_ai.rs"]mod tactical_ai;
#[path="../../native/combat-core/src/navigation_ai.rs"]mod navigation_ai;
#[path="../../native/combat-core/src/defense_ai.rs"]mod defense_ai;
#[path="../../native/combat-core/src/ai_owner.rs"]mod ai_owner;
#[path="../../native/combat-core/src/ai_resident.rs"]mod ai_resident;

#[path="../../native/combat-core/src/ai_wire.rs"]mod ai_wire;
