#[path="../../native/combat-core/src/motion_owner.rs"]mod motion_owner;
#[path="../../native/combat-core/src/gravity_wire.rs"]mod gravity_wire;
#[path="../../native/combat-core/src/scene_prelude.rs"]mod scene_prelude;
#[path="../../native/combat-core/src/flight_static_wire.rs"]mod flight_static_wire;
#[path="../../native/combat-core/src/flight_wire.rs"]mod flight_wire;
#[path="../../native/combat-core/src/flight_admission.rs"]mod flight_admission;
#[path="../../native/combat-core/src/flight_allocator.rs"]mod flight_allocator;
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
#[path="../../native/combat-core/src/flight_owner.rs"]mod flight_owner;
#[path="../../native/combat-core/src/flight_world.rs"]mod flight_world;
#[path="../../native/combat-core/src/navigation_ai.rs"]mod navigation_ai;
#[path="../../native/combat-core/src/tactical_ai.rs"]mod tactical_ai;
#[path="../../native/combat-core/src/defense_ai.rs"]mod defense_ai;
#[path="../../native/combat-core/src/weapon_world.rs"]mod weapon_world;
#[path="../../native/combat-core/src/phase_anchor.rs"]mod phase_anchor;
#[path="../../native/combat-core/src/phase_runtime.rs"]mod phase_runtime;
#[path="../../native/combat-core/src/gravity_terrain.rs"]mod gravity_terrain;
#[path="../../native/combat-core/src/flight_runtime.rs"]mod flight_runtime;
#[path="../../native/combat-core/src/gravity_runtime.rs"]mod gravity_runtime;
#[path="../../native/combat-core/src/aux_world.rs"]mod aux_world;
#[path="../../native/combat-core/src/aux_runtime.rs"]mod aux_runtime;
use std::{cell::RefCell,collections::BTreeMap};
use phase_anchor::State;
#[derive(Clone)]struct World{bodies:Vec<state::Body>,shared:world_owner::Owned,specs:BTreeMap<u32,lifecycle::Spec>,random:random::Random,visual:random::Random,dealt:f64}
fn world(cost:f64,cr:f64)->World{let mut random=random::Random::new(13181);let visual=random::Random::new(17157);let mut specs=BTreeMap::new();specs.insert(1,lifecycle::Spec::new(&[0.0,0.0,0.0,0.0,1.0,-1.0,0.0,0.0,0.0,0.0]));let mut bodies=Vec::new();let mut states=Vec::new();
 for row in 0..3{let mut s=ship_state::ShipState::new(&[500.0,100.0,1.0,1.0,1.0,0.0,1.0,1.0,0.0,0.0,2.0,1.0,0.0,1.0,0.0,0.0,0.0]);s.armor=Some(armor::Armor::new(&[10.0,10.0,15.0,15.0,100.0,-75.0,-75.0,500.0,500.0,1.0,1.0,0.85,1.0,1.0,0.0,0.0,0.0]));
  s.shield=Some(shield::Shield::new(&[3.0,0.0,30.0,1.0,0.0,1.0,1.0,0.5,0.5,2.0,25.0,25.0,1.0,0.0,1.0,0.0,0.0,0.0,0.0]));let mut pose=[0.0;motion::WIDTH];pose[0]=row as f64*100.0;pose[1]=20.0;pose[4]=0.17;
  let mut own=system_owner::Owned::new(&[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,1.0,0.0,0.0,0.0],&pose);own.aim=[0.0;2];for id in 1..=2{s.systems.push(lifecycle::System::new(id,1,&specs[&1]));own.metas.insert(id,system_owner::Meta{kind:ship_effects::Kind::None,input:None,jump:ship_effects::TacticalJump::default(),regen:0.0});}s.world=Some(own);
  let mut c=battle::CombatShip::new(&[(row==2)as u32 as f64,1.0,30.0,0.0,1.0,(row!=2)as u32 as f64]);c.query=Some(fire_query::ShipQuery::new(&[0.0;12]));c.readiness=Some(readiness_owner::Owned::new(&[cr,720.0,1.0,1.0,0.0,0.0,720.0,0.25,1.0],&c,1.0,&mut random));s.combat=Some(c);
  states.push(State::install(&mut s,cost).unwrap());bodies.push(state::Body{id:row as u32+1,handle:state::Handle{slot:row as u32+1,generation:1},order:row as f64,motion:pose,ship:Some(s)});
 }
 let child=bodies[1].handle;let parent=bodies[0].handle;bodies[0].ship.as_mut().unwrap().world.as_mut().unwrap().children.push(child);bodies[1].ship.as_mut().unwrap().world.as_mut().unwrap().parent=Some(parent);
 let mut phase=phase_runtime::Owned::default();for(b,state)in bodies.iter().zip(states){phase.entries.push(phase_runtime::Entry{ship:b.handle,state,pending_cr:0.0});for sys in &b.ship.as_ref().unwrap().systems{phase.install_control(&bodies,b.handle,sys.id,ship_effects::ControlSpec{flags:0,phase:false,vulnerable_up:false,vulnerable_down:false}).unwrap();}}
 {let mut shared=world_owner::Owned::new(explosion_effects::Identity{id:1.0,generation:1},explosion_effects::Identity{id:3.0,generation:1});shared.phase=Some(phase);World{bodies,shared,specs,random,visual,dealt:0.0}}
}
struct Fixture{world:World,input:Vec<f64>,output:Vec<f64>,saved:Option<World>}
thread_local!{static F:RefCell<Fixture>=RefCell::new(Fixture{world:world(0.15,0.7),input:Vec::new(),output:Vec::new(),saved:None});}
fn snapshot(f:&mut Fixture){let w=&f.world;let mut out=vec![w.random.cursor,w.random.ids,w.visual.cursor,w.shared.phase.as_ref().unwrap().encounter.emergency_dive_used as u32 as f64,w.dealt];for(row,b)in w.bodies.iter().enumerate(){let s=b.ship.as_ref().unwrap();let sh=s.shield.as_ref().unwrap();let st=&w.shared.phase.as_ref().unwrap().entries[row].state;let mods=s.world.as_ref().unwrap().runtime.iter().fold(ship_effects::Modifiers::default(),|mut acc,(_,m)|{acc.combine(m);acc});let phase=phase_runtime::phased(&w.shared.phase.as_ref().unwrap(),&w.bodies,row,&w.specs).unwrap();let visual=if s.flags&(ship_state::DOCKED|ship_state::RETREATED)!=0{0.0}else{(1.0-0.75*sh.data[15]).min(st.external_phase().unwrap_or(1.0))};
  out.extend([s.armor.as_ref().unwrap().data[14],s.combat.as_ref().unwrap().readiness.as_ref().unwrap().state.current_cr,w.shared.phase.as_ref().unwrap().entries[row].pending_cr,(s.flags&ship_state::RETREATING!=0)as u32 as f64,(s.flags&ship_state::RETREATED!=0)as u32 as f64,(s.flags&ship_state::DEAD!=0)as u32 as f64,phase as u32 as f64,visual,sh.data[20],sh.data[14],sh.data[15],sh.data[6],sh.data[23],sh.data[25],sh.data[26],sh.data[24],s.flux.venting as u32 as f64,s.flux.soft,s.flux.hard]);out.extend(&b.motion[..6]);out.extend(s.world.as_ref().unwrap().previous);out.extend(&b.motion[7..11]);out.push(s.combat.as_ref().unwrap().query.as_ref().unwrap().trigger as u32 as f64);
  out.extend([mods.defined_mask()as f64]);out.extend(mods.values());out.extend(st.words());out.extend([st.external_phase().is_some()as u32 as f64,st.external_phase().unwrap_or(0.0)]);out.push(s.systems.len()as f64);for sys in &s.systems{out.extend([sys.state as f64,sys.effect,sys.active as u32 as f64,sys.cooling as u32 as f64,sys.active_timer,sys.cooldown_timer,sys.pending_activation,sys.pending_active,sys.stage_timer,sys.out_level]);}}
 out.push(w.shared.phase.as_ref().unwrap().sounds.len()as f64);for(h,s)in &w.shared.phase.as_ref().unwrap().sounds{out.extend([h.slot as f64,*s as u32 as f64]);}f.output=out;}
#[no_mangle]pub extern "C" fn test_input(n:u32)->u32{F.with_borrow_mut(|f|{f.input.resize(n as usize,0.0);f.input.as_mut_ptr()as u32})}
#[no_mangle]pub extern "C" fn test_reset()->u32{F.with_borrow_mut(|f|{f.world=world(f.input[0],f.input[1]);f.saved=None;snapshot(f);f.output.as_ptr()as u32})}
#[no_mangle]pub extern "C" fn test_step()->u32{F.with_borrow_mut(|f|{let p=f.input.clone();let row=p.get(1).copied().unwrap_or(0.0)as usize;let w=&mut f.world;w.shared.phase.as_mut().unwrap().sounds.clear();match p[0]as u32{
 0=>{w.dealt=phase_runtime::hull(&mut w.shared,&mut w.bodies,row,p[2],&w.specs,&mut Vec::new()).unwrap();},
 1=>{phase_runtime::early_world(&mut w.shared,&mut w.bodies,row,p[2],&w.specs,&mut Vec::new()).unwrap();},
 2=>{let b=&mut w.bodies[row];let s=b.ship.as_mut().unwrap();s.shield.as_mut().unwrap().update(p[2],&b.motion,&mut s.flux,false).unwrap();},
 3=>{let b=&mut w.bodies[row];let s=b.ship.as_mut().unwrap();let sh=s.shield.as_mut().unwrap();sh.data[14]=p[2];sh.data[15]=p[3];sh.data[6]=p[4];sh.data[23]=p[5];},
 4=>{let b=&mut w.bodies[row];let s=b.ship.as_mut().unwrap();s.flags=(s.flags&!(ship_state::DEAD|ship_state::RETREATED))|if p[2]==1.0{ship_state::DEAD}else{0}|if p[3]==1.0{ship_state::RETREATED}else{0};},
 5=>{let b=&mut w.bodies[row];b.motion[2]=17.0;b.motion[3]=-8.0;b.motion[7..11].copy_from_slice(&[0.5,1.0,1.0,0.2]);let s=b.ship.as_mut().unwrap();s.flux.soft=100.0;s.flux.start_vent();s.combat.as_mut().unwrap().query.as_mut().unwrap().trigger=true;for sys in &mut s.systems{sys.state=p[2]as u32;sys.effect=p[3];sys.active=p[4]==1.0;sys.stage_timer=0.2;sys.pending_activation=2.0;sys.pending_active=3.0;}},
 6=>{f.saved=Some(w.clone());},7=>{*w=f.saved.clone().unwrap();},8=>{let s=w.bodies[row].ship.as_mut().unwrap();let a=s.armor.as_mut().unwrap();a.data[15]=p[2];a.data[16]=p[3];},_=>{}
 }snapshot(f);f.output.as_ptr()as u32})}
#[no_mangle]pub extern "C" fn test_output_words()->u32{F.with_borrow(|f|f.output.len()as u32)}

fn hooks_snapshot(f:&mut Fixture){let w=&f.world;let mut out=vec![w.shared.phase.as_ref().unwrap().encounter.emergency_dive_used as u32 as f64,w.dealt,w.random.cursor,w.visual.cursor];
 for(r,b)in w.bodies.iter().enumerate(){let s=b.ship.as_ref().unwrap();let q=s.combat.as_ref().unwrap().query.as_ref().unwrap();let sh=s.shield.as_ref().unwrap();
  out.extend([s.armor.as_ref().unwrap().data[14],w.shared.phase.as_ref().unwrap().entries[r].pending_cr,(s.flags&ship_state::RETREATING!=0)as u32 as f64,(s.flags&ship_state::RETREATED!=0)as u32 as f64,
   phase_runtime::phased(&w.shared.phase.as_ref().unwrap(),&w.bodies,r,&w.specs).unwrap()as u32 as f64,q.trigger as u32 as f64,q.hold as u32 as f64,q.target.map_or(0,|h|h.slot)as f64]);out.extend(q.aim);out.extend(&b.motion[..6]);out.extend(s.world.as_ref().unwrap().previous);out.extend(&b.motion[7..11]);
  out.extend([sh.active()as u32 as f64,s.flux.venting as u32 as f64,s.flux.vent_progress,s.flux.initial_vent]);out.push(s.systems.len()as f64);
  for l in &s.systems{let generic=&s.world.as_ref().unwrap().metas[&l.id];let gm=w.shared.gravity.as_ref().unwrap().owner.ships.iter().find(|m|m.identity.slot==b.handle.slot).unwrap().systems.iter().find(|m|m.id==l.id);
   let input=gm.map_or(generic.input,|m|m.input);out.extend([l.state as f64,l.effect,l.active as u32 as f64,l.pending_activation,l.pending_active,l.stage_timer,l.out_level,
    gm.is_some_and(|m|m.held)as u32 as f64,gm.is_some_and(|m|m.field.is_some())as u32 as f64,gm.is_some_and(|m|m.maneuver.is_some())as u32 as f64,gm.is_some_and(|m|m.push.is_some())as u32 as f64,
    gm.and_then(|m|m.polarity).unwrap_or(0)as f64,input.is_some()as u32 as f64,input.map_or(0.0,|i|i.point[0]),input.map_or(0.0,|i|i.origin[1])]);}
 }f.output=out;
}
#[no_mangle]pub extern "C" fn test_hook_reset()->u32{F.with_borrow_mut(|f|{let p=f.input.clone();let mut w=world(0.15,0.7);w.shared.gravity=Some(gravity_runtime::Owned::default());
 let mut gm=Vec::new();for b in &w.bodies{gm.push(gravity_owner::ShipMeta{identity:system_world::Identity{slot:b.handle.slot,generation:1},name:format!("anchor-{}",b.handle.slot-1),mass:100.0,fixed:false,module_hull:false,module:None,children:Vec::new(),systems:Vec::new(),mounts:Vec::new()});}
 let s=w.bodies[0].ship.as_mut().unwrap();s.systems.clear();s.world.as_mut().unwrap().metas.clear();w.shared.phase.as_mut().unwrap().controls.retain(|c|c.ship.slot!=1);
 let kinds=[gravity_world::Kind::Well,gravity_world::Kind::Repulsor,gravity_world::Kind::Maneuver,gravity_world::Kind::Release,gravity_world::Kind::BattleWell,gravity_world::Kind::Collapse,gravity_world::Kind::Polarity,gravity_world::Kind::BattleRepulsor,gravity_world::Kind::Push];
 for(index,kind)in kinds.into_iter().enumerate(){let sid=index as u32+1;let spec=lifecycle::Spec::new(&p[index*10..index*10+10]);w.specs.insert(sid+1,spec.clone());let mut slot=gravity_world::Slot::new(system_world::Identity{slot:1,generation:1},sid,kind,format!("hook-{}",index),spec);slot.lifecycle.spec=sid+1;
  s.systems.push(slot.lifecycle.clone());s.world.as_mut().unwrap().metas.insert(sid,system_owner::Meta{kind:ship_effects::Kind::GravityOther,input:None,jump:ship_effects::TacticalJump::default(),regen:0.0});s.world.as_mut().unwrap().gravity_systems.push(sid);gm[0].systems.push(gravity_owner::SystemMeta::from_slot(slot));
  w.shared.phase.as_mut().unwrap().controls.push(phase_runtime::SystemControl{ship:state::Handle{slot:1,generation:1},system:sid,spec:ship_effects::ControlSpec{flags:0,phase:false,vulnerable_up:false,vulnerable_down:false}});
 }w.shared.gravity.as_mut().unwrap().owner.ships=gm;f.world=w;f.saved=None;hooks_snapshot(f);f.output.as_ptr()as u32})}
#[no_mangle]pub extern "C" fn test_hook_step()->u32{F.with_borrow_mut(|f|{let p=f.input.clone();let w=&mut f.world;let r=p.get(1).copied().unwrap_or(0.0)as usize;match p[0]as u32{
 0=>{let body=&mut w.bodies[r];body.motion[2]=17.0;body.motion[3]=-8.0;body.motion[7..11].copy_from_slice(&[0.5,1.0,1.0,0.2]);let s=body.ship.as_mut().unwrap();s.flux.soft=100.0;s.flux.start_vent();let q=s.combat.as_mut().unwrap().query.as_mut().unwrap();q.trigger=true;q.hold=true;q.target=Some(state::Handle{slot:3,generation:1});q.aim=[657.0,83.0];
  for l in &mut s.systems{l.state=p[2]as u32;l.effect=p[3];l.active=p[4]==1.0;l.stage_timer=0.2;l.pending_activation=2.0;l.pending_active=3.0;let input=ship_effects::ActivationInput{point:[71.0,72.0],origin:[73.0,74.0],velocity:[2.0,3.0],facing:0.3,target:None,gravity_anchor_serial:None};s.world.as_mut().unwrap().metas.get_mut(&l.id).unwrap().input=Some(input);
   if let Some(m)=w.shared.gravity.as_mut().unwrap().owner.ships[r].systems.iter_mut().find(|m|m.id==l.id){m.held=true;m.input=Some(input);m.polarity=if m.kind==gravity_world::Kind::Polarity{Some(-1)}else{None};
    if matches!(m.kind,gravity_world::Kind::Well|gravity_world::Kind::Repulsor|gravity_world::Kind::Release|gravity_world::Kind::BattleWell|gravity_world::Kind::BattleRepulsor|gravity_world::Kind::Collapse){m.field=Some(gravity_world::Field{kind:gravity_world::FieldKind::Well,serial:Some(1.0),polarity:None,cursor:None,linger:None,position:[7.0,8.0],age:0.0,duration:Some(1.0),radius:25.0,ship_budget:20.0,projectile_budget:30.0,environment_budget:None,ship_hits:Vec::new(),projectile_hits:Vec::new(),environment_hits:None,releases:None,collapsed:None});}
    if m.kind==gravity_world::Kind::Maneuver{m.maneuver=Some(gravity_world::Maneuver{target_angle:0.3,age:0.2,turn_remaining:0.1});}
    if m.kind==gravity_world::Kind::Push{m.push=Some(gravity_world::Push{target:None,position:[7.0,8.0],radius:5.0,direction:[1.0,0.0],age:0.0,status:"fixture".into()});}
   }}},
 1=>{phase_runtime::deactivate(&mut w.shared,&mut w.bodies,r,&w.specs).unwrap();},
 2=>{phase_runtime::clear_held(&mut w.shared,&mut w.bodies,r,&w.specs).unwrap();},
 3=>{phase_runtime::retreat(&mut w.shared,&mut w.bodies,r,&w.specs,&mut Vec::new()).unwrap();},
 4=>{w.dealt=phase_runtime::hull(&mut w.shared,&mut w.bodies,r,p[2],&w.specs,&mut Vec::new()).unwrap();},
 5=>{f.saved=Some(w.clone());},6=>{*w=f.saved.clone().unwrap();},
 7=>{let l=&mut w.bodies[r].ship.as_mut().unwrap().systems[0];l.state=p[2]as u32;l.active=p[3]==1.0;let d=w.specs.get_mut(&l.spec).unwrap();d.flags=if p[4]==1.0{lifecycle::AVAILABLE}else{0};let h=w.bodies[r].handle;
   let c=w.shared.phase.as_mut().unwrap().controls.iter_mut().find(|c|c.ship==h&&c.system==1).unwrap();c.spec.phase=p[5]==1.0;c.spec.vulnerable_up=p[6]==1.0;c.spec.vulnerable_down=p[7]==1.0;
   let sh=w.bodies[r].ship.as_mut().unwrap().shield.as_mut().unwrap();sh.data[14]=p[8];sh.data[15]=p[9];},
 8=>{let s=w.bodies[r].ship.as_mut().unwrap();s.armor.as_mut().unwrap().data[14]=p[2];s.damage_policy[5]=375.0;},
 9=>{let mut events=Vec::new();phase_runtime::with_ship(&mut w.shared,&mut w.bodies,r,&w.specs,&mut events,|s,h,n|s.critical_damage_with([0.0;2],&mut w.random,&mut w.visual,n,h)).unwrap();w.dealt=0.0;},
 10=>{let mut events=Vec::new();phase_runtime::with_ship(&mut w.shared,&mut w.bodies,r,&w.specs,&mut events,|s,h,n|s.armor_impact_with(&[0.0,0.0,p[2],0.0,1.0,p[2],0.0,1.0],&mut w.visual,n,h)).unwrap();w.dealt=0.0;},
 11=>{let mut ordnance=battle::Ordnance::new();let mut events=Vec::new();let id=world_owner::identity(&w.bodies[r]);let mut host=world_owner::Host{bodies:&mut w.bodies,ordnance:&mut ordnance,specs:&w.specs,owned:&mut w.shared,events:&mut events};host.hull_damage(id,p[2]).unwrap();w.dealt=0.0;},
 12=>{let mut owner=w.shared.gravity.take().unwrap();let prior=owner.owner.hydrate_world(&w.shared,&w.bodies,&w.specs).unwrap();let mut events=Vec::new();phase_runtime::hull_gravity(&mut w.shared,&mut w.bodies,&mut owner.owner,r,p[2],&w.specs,&mut events).unwrap();owner.owner.restore(&mut w.bodies,prior).unwrap();w.shared.gravity=Some(owner);w.dealt=0.0;},
 13=>{let mut owner=w.shared.gravity.take().unwrap();let prior=owner.owner.hydrate_world(&w.shared,&w.bodies,&w.specs).unwrap();let mut ordnance=battle::Ordnance::new();let mut events=Vec::new();let mut records=Vec::new();
     let mut host=gravity_owner::Host{bodies:&mut w.bodies,ordnance:&mut ordnance,owned:&mut owner.owner,specs:&w.specs,random:&mut w.random,visual:&mut w.visual,records:&mut records,destruction:gravity_runtime::Services{world:&mut w.shared,specs:&w.specs,events:&mut events}};
     use gravity_world::Host;host.tidal_hit(system_world::Identity{slot:3,generation:1},system_world::Identity{slot:1,generation:1},[200.0,20.0],p[2],p[2],false).unwrap();owner.owner.restore(&mut w.bodies,prior).unwrap();w.shared.gravity=Some(owner);w.dealt=0.0;},
 14=>{let mut ordnance=battle::Ordnance::new();let mut events=Vec::new();let mut host=world_owner::Host{bodies:&mut w.bodies,ordnance:&mut ordnance,specs:&w.specs,owned:&mut w.shared,events:&mut events};let mut sink=effect_owner::WorldSink{host:&mut host,components:[1.0;2],player:false,error:None};use weapon_effects::Sink;sink.hull((r+1)as u32,p[2]);assert!(sink.error.is_none());w.dealt=0.0;},
 15=>{w.shared.phase.as_mut().unwrap().entries[r].state.alpha=0.0;},_=>{}
 }hooks_snapshot(f);f.output.as_ptr()as u32})}
#[no_mangle]pub extern "C" fn test_contracts()->u32{F.with_borrow_mut(|f|{let original=f.world.clone();let w=&mut f.world;let mut n=0u32;
 let h=w.bodies[0].handle;assert!(w.shared.phase.as_mut().unwrap().install(&mut w.bodies,h,0.2).is_err());n+=1;
 let stale=state::Handle{slot:1,generation:9};assert!(w.shared.phase.as_mut().unwrap().install(&mut w.bodies,stale,0.2).is_err());n+=1;
 w.shared.phase.as_mut().unwrap().controls.retain(|c|c.ship!=h);assert!(!w.shared.phase.as_ref().unwrap().complete(&w.bodies,&w.specs));n+=1;assert!(phase_runtime::phased(&w.shared.phase.as_ref().unwrap(),&w.bodies,0,&w.specs).is_err());n+=1;
 *w=original.clone();let child=w.bodies[1].handle;w.bodies[0].ship.as_mut().unwrap().world.as_mut().unwrap().parent=Some(child);w.bodies[1].ship.as_mut().unwrap().world.as_mut().unwrap().children.push(h);
 assert!(phase_runtime::phased(&w.shared.phase.as_ref().unwrap(),&w.bodies,0,&w.specs).is_err());n+=1;
 *w=original.clone();assert!(phase_runtime::early_world(&mut w.shared,&mut w.bodies,0,-1.0,&w.specs,&mut Vec::new()).is_err());n+=1;
 *w=original.clone();w.shared.phase=None;assert!(weapon_world::beam_rows(&w.bodies,&w.shared,&w.specs,3,1,Some(false)).is_err());n+=1;
 *w=original.clone();w.shared.phase.as_mut().unwrap().controls.retain(|c|c.ship!=h);assert!(weapon_world::beam_rows(&w.bodies,&w.shared,&w.specs,3,1,Some(false)).is_err());n+=1;
 *w=original;f.output=vec![n as f64];f.output.as_ptr()as u32})}
#[no_mangle]pub extern "C" fn test_consumers()->u32{F.with_borrow_mut(|f|{let w=&mut f.world;let mut out=Vec::new();let mut terrain=terrain_owner::Owned::default();
 for b in &w.bodies{let s=b.ship.as_ref().unwrap();let own=s.world.as_ref().unwrap();terrain.ships.push(terrain_owner::Meta{identity:world_owner::identity(b),handle:b.handle,stable_id:format!("anchor-{}",b.id-1),mass:50.0,station:false,
  module:own.parent.map(|h|terrain_owner::Module{parent:world_owner::identity(w.bodies.iter().find(|b|b.handle==h).unwrap()),offset:[100.0,0.0],angle:0.0,independent:false}),children:own.children.iter().map(|h|world_owner::identity(w.bodies.iter().find(|b|b.handle==*h).unwrap())).collect(),sprite_height:64.0,slots:Vec::new(),terrain_speed:1.0,emergency_phase_used:false,fighter_recall:false});}
 let mut ordnance=battle::Ordnance::new();let mut notices=Vec::new();{let mut adapter=world_owner::TerrainWorld{world:&mut w.shared};let host=terrain_owner::Host::new(&mut w.bodies,&mut terrain,&mut ordnance,&w.specs,&mut adapter,&mut notices);
  for b in host.bodies.iter(){out.push(host.read(world_owner::identity(b)).unwrap().collisionless as u32 as f64);}}
 {let host=world_owner::Host{bodies:&mut w.bodies,ordnance:&mut ordnance,specs:&w.specs,owned:&mut w.shared,events:&mut notices};for b in host.bodies.iter(){out.push(host.explosion_ship(world_owner::identity(b)).unwrap().collisionless as u32 as f64);}}
 let delivery=projectile::Delivery::new(&[0.0,0.0,0.0,0.0,0.0,3.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]);
 let emission=weapon_fire::Emission{kind:weapon_fire::EmissionKind::Projectile,id:0.731,component_id:1,cycle_id:0.0,position:[400.0,20.0],velocity:[-300.0,0.0],angle:0.0,barrel_offset:[0.0;2],base_damage:1.0,source_damage_multiplier:1.0,damage:1.0,emp:0.0,range:500.0,duration:0.0,target_ship:None,target_projectile:None,armed_while_fizzling:None,flight_time:None,source_velocity:[0.0;2],recoil_delta:[0.0;2]};
 let mut p=projectile::Projectile::new(1.0,3,w.bodies[2].handle,1,delivery,&emission,300.0,[1.0;8],0.0);p.prev=[400.0,20.0];p.pos=[-100.0,20.0];p.player=Some(false);
 let hit=weapon_world::ship_query(&w.bodies,&p,&w.shared,&w.specs).unwrap();out.push(hit.map_or(0.0,|(row,_)|w.bodies[row].id as f64));
 let beams=weapon_world::beam_rows(&w.bodies,&w.shared,&w.specs,3,1,Some(false)).unwrap();out.push(beams.len()as f64);out.extend(beams.iter().map(|&row|w.bodies[row].id as f64));f.output=out;f.output.as_ptr()as u32})}

#[path="../../native/combat-core/src/ai_owner.rs"]mod ai_owner;
#[path="../../native/combat-core/src/ai_resident.rs"]mod ai_resident;

#[path="../../native/combat-core/src/ai_wire.rs"]mod ai_wire;
