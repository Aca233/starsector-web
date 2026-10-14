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
#[path="../../native/combat-core/src/gravity_runtime.rs"]mod gravity_runtime;
#[path="../../native/combat-core/src/aux_world.rs"]mod aux_world;
#[path="../../native/combat-core/src/aux_runtime.rs"]mod aux_runtime;
#[path="../../native/combat-core/src/gravity_terrain.rs"]mod gravity_terrain;
#[path="../../native/combat-core/src/phase_anchor.rs"]mod phase_anchor;
#[path="../../native/combat-core/src/phase_runtime.rs"]mod phase_runtime;
#[path="../../native/combat-core/src/flight_runtime.rs"]mod flight_runtime;
use std::{cell::RefCell,collections::BTreeMap};
use flight_world::{Host as _,CraftRole,Vec2};
use flight_owner::{Owned,StaticShip,Host,Services,Step,Allocation,Record};
use tactical_ai::Identity;
fn identity(n:u32)->Identity{Identity{handle:n,generation:1}}
#[derive(Clone)]struct Service{next:u32,world:world_owner::Owned,specs:BTreeMap<u32,lifecycle::Spec>}
impl flight_runtime::Authority for Service{
 fn allocate(&mut self,_:&str)->Result<Allocation,flight_world::Error>{let n=self.next;self.next+=1;Ok(Allocation{numeric_id:n,identity:identity(n),order:(n-1)as f64})}
 fn admitted(&mut self,b:&mut Vec<state::Body>,owned:&mut Owned,world:&mut world_owner::Owned,specs:&BTreeMap<u32,lifecycle::Spec>,tree:&[Identity])->Result<(),flight_world::Error>{
  let scope:Vec<_>=b.iter().map(|b|b.handle).collect();for body in b.iter_mut(){let q=body.ship.as_mut().unwrap().combat.as_mut().unwrap().query.as_mut().unwrap();q.scope=scope.clone();q.expected_scope=q.scope.len();}
  for &h in tree{let r=b.iter().position(|b|b.handle.slot==h.handle&&b.handle.generation==h.generation).ok_or(flight_world::Error::StaleIdentity)?;let body=&b[r];let m=owned.ship(h)?;let s=body.ship.as_ref().unwrap();
   for sys in &s.systems{world.phase.get_or_insert_with(phase_runtime::Owned::default).install_control(b,body.handle,sys.id,ship_effects::ControlSpec{flags:0,phase:false,vulnerable_up:false,vulnerable_down:false}).map_err(|_|flight_world::Error::HostFailure)?;}
   world.terrain.ships.push(terrain_owner::Meta{identity:world_owner::identity(body),handle:body.handle,stable_id:m.stable_id.clone(),mass:100.0,station:false,module:m.module.as_ref().map(|m|terrain_owner::Module{parent:world_owner::identity(b.iter().find(|b|b.handle.slot==m.parent.handle).unwrap()),offset:m.offset,angle:m.angle,independent:m.independent}),children:s.world.as_ref().unwrap().children.iter().map(|h|world_owner::identity(b.iter().find(|b|b.handle==*h).unwrap())).collect(),sprite_height:64.0,slots:vec![],terrain_speed:1.0,emergency_phase_used:false,fighter_recall:false});
   world.terrain.active.push(world_owner::identity(body));
  }world.terrain.validate(b,specs).map_err(|_|flight_world::Error::HostFailure)
 }
}
#[derive(Clone)]struct Fixture{input:Vec<f64>,output:Vec<f64>,bodies:Vec<state::Body>,runtime:flight_runtime::Owned,service:Service,specs:BTreeMap<u32,lifecycle::Spec>,random:random::Random,visual:random::Random,ordnance:battle::Ordnance,notices:Vec<(u32,state::Handle,ship_state::Notice)>}
fn empty()->Fixture{let mut specs=BTreeMap::new();specs.insert(1,lifecycle::Spec::new(&[0.0,0.0,0.0,0.0,1.0,-1.0,0.0,0.0,0.0,0.0]));Fixture{input:Vec::new(),output:Vec::new(),bodies:Vec::new(),runtime:flight_runtime::Owned::default(),service:Service{next:1,world:world_owner::Owned::new(explosion_effects::Identity{id:1.0,generation:1},explosion_effects::Identity{id:2.0,generation:1}),specs:specs.clone()},specs,random:random::Random::new(821),visual:random::Random::new(1757),ordnance:battle::Ordnance::new(),notices:Vec::new()}}
thread_local!{static F:RefCell<Fixture>=RefCell::new(empty());}
thread_local!{static SAVED:RefCell<Option<Fixture>>=const{RefCell::new(None)};}
impl Fixture{
 fn with_runtime<R>(&mut self,op:impl FnOnce(&mut flight_runtime::Owned,&mut flight_runtime::Context<Service>)->Result<R,flight_world::Error>)->Result<R,flight_world::Error>{
  let mut world=self.service.world.clone();let mut c=flight_runtime::Context{bodies:&mut self.bodies,world:&mut world,ordnance:&mut self.ordnance,specs:&self.specs,random:&mut self.random,visual:&mut self.visual,notices:&mut self.notices,authority:&mut self.service};
  let result=op(&mut self.runtime,&mut c);self.service.world=world;result
 }
}
fn craft(role:u32,carrier:bool)->StaticShip{
 let radius=if carrier{90.0}else{30.0};let size=if carrier{1}else{0};let bounds=[[-20.0,-20.0],[20.0,-20.0],[20.0,20.0],[-20.0,20.0]];let mut death=world_owner::Meta::new(&[0.0,30.0,0.0,2.0,3.0,255.0,160.0,50.0,255.0,230.0,150.0,130.0,90.0,60.0,0.0,64.0,0.0,1.0],size,radius,&bounds);
 for(i,value)in ["flight-owner-spec","flight-owner-spec","flight-owner-spec","fixture-sprite"].iter().enumerate(){death.append(i,0,&value.encode_utf16().collect::<Vec<_>>()).unwrap();}death.terrain=Some([100.0,0.0,0.0,64.0,64.0,0.0]);
 let mut attrs=[0.0;20];attrs[1]=1.0;attrs[2]=1.0;attrs[7]=1.0;attrs[11..18].fill(1.0);
 let mut t=StaticShip{carrier_spec_key:"carrier".into(),spec_id:if carrier{"carrier".into()}else{format!("flight-owner-{}",role)},footprint:flight_world::Footprint{radius,width:64.0,height:64.0,pivot_x:32.0,pivot_y:32.0,bounds:bounds.iter().map(|p|Vec2{x:p[0],y:p[1]}).collect()},role:match role{1=>CraftRole::ArkInterceptor,2=>CraftRole::ArkStriker,3=>CraftRole::Fury,4=>CraftRole::Starhawk,5=>CraftRole::Thunderhawk,_=>CraftRole::Ordinary},hull_size:size,
  flux:[500.0,100.0,size as f64,1.0,1.0,0.0,1.0,1.0,0.0,0.0,2.0,1.0,0.0,1.0,0.0,0.0,0.0],armor:[10.0,10.0,15.0,15.0,100.0,-75.0,-75.0,500.0,500.0,1.0,1.0,0.85,1.0,1.0,0.0,0.0,0.0],armor_stats:[1.0,1.0,0.85,1.0,1.0,1.0,1.0,1.0,1.0,1.0,1.0,1.0,0.0,0.0,0.0],shield:flight_owner::ShieldTemplate{install:[0.0,0.0,30.0,1.0,0.0,1.0,1.0,0.5,0.5,0.5,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],damage:[1.0;3],void:None},
  damage_policy:[1.0,1.0,1.0,1.0,1.0,375.0,1.0,1.0],mounts:Vec::new(),groups:Vec::new(),selected:Some(0),weapon_policy:[0.0,0.0,1.0,0.0,0.0,0.0,0.7,1.0,1.0,1.0,1.0,1.0,1.0,1.0,1.0],systems:vec![flight_owner::SystemTemplate{id:1,spec:1,defense:false,upkeep:[0.0,0.0,0.0,0.0,1.0,0.0,0.0,0.0],kind:ship_effects::Kind::None},flight_owner::SystemTemplate{id:2,spec:1,defense:true,upkeep:[0.0,0.0,0.0,0.0,1.0,0.0,0.0,0.0],kind:ship_effects::Kind::None}],children:Vec::new(),
  engine_health:1.0,engines:Vec::new(),engine_motion:[250.0,0.0,1.0,250.0,0.0,1.0,200.0,0.0,1.0,240.0,0.0,1.0,120.0,0.0,1.0,1.0,1.0,250.0,240.0,0.0,1.0],engine_policy:[1.0,1.0,0.0,0.0,0.0],attrs,shield_pierced:1.0,motion_flags:0,query:[2.0,0.0,0.0,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0],visible:BTreeMap::from([(0,true),(1,true)]),readiness:[0.7,720.0,1.0,1.0,0.0,0.0,720.0,0.25,1.0],death,world_flags:0,range_multiplier:1.0,side:0,muzzle:None,wings:Vec::new(),bays:0,carrier_stats:flight_world::CarrierStats{range_multiplier:1.0,refit_multiplier:1.0,rearm_fraction:0.0,decrease_multiplier:1.0,increase_percent:0.0,increase_multiplier:1.0,reserve_deck:false,point_defense_skill:None},hooks:Vec::new(),hooks_complete:true,spawn_admission:None};
 t.groups.push(flight_owner::GroupTemplate{index:0,linked:true,automatic:false,members:if carrier{Vec::new()}else{vec![1,2]}});
 if !carrier{for index in 0..2{let relative=if index==0{[-1.0,-8.0]}else{[2.0,9.0]};let mut e=battle::FireEntry::new(&[index as f64+1.0,1.0,0.0,0.0,7.0,0.0,0.0,0.0,0.001,0.0,0.0,0.0,0.0,relative[0],relative[1],3.0,0.0,0.0,0.0,0.0,if index==0{1.0}else{0.0},1.0]);
   e.configure(&[index as f64+1.0,0.0,0.0,0.0,0.0,0.0,0.0,1500.0,900.0]);e.spec.offsets=vec![[0.0;2]];e.delivery=Some(projectile::Delivery::new(&[1.0,24.0,0.35,1.0,1.0,3.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]));e.query=Some(fire_query::MountQuery::new(&[index as f64+1.0,if index==0{2.0}else{0.0},if index==1{2.0}else{0.0},0.0,360.0,90.0,1.0,0.0,0.0,0.0,0.0,0.0,15.1]));e.range_inputs=Some(battle::RangeInputs{base:1500.0,percent:0.0,multiplier:1.0,flat:0.0,threshold:None,past:1.0,ship_multiplier:1.0,authored_range:1500.0,authored_speed:900.0,speed_bonus:0.0,carrier_flat:0.0});
   t.mounts.push(flight_owner::MountTemplate{slot:format!("W{}",index+1),generation:1,component:[index as f64+1.0,0.0,0.0,relative[0],relative[1],1.0,0.0],install:[0.0,index as f64+1.0,1.0,0.0,0.0,0.3,0.07,0.0,0.0,0.0,if index==1{1.0}else{0.0},if index==1{4.0}else{0.0},0.0,0.0,5.0,0.0],min_spread:0.0,fire:e,system_only:false,max_ammo_present:index==1,regen_present:false,guided_speed:None});}
  t.engines=vec![[0.0,-20.0,-8.0,25.0,30.0,0.0,0.0,0.0,0.0,0.0],[1.0,-20.0,8.0,25.0,30.0,0.0,0.0,0.0,0.0,0.0]];t.damage_policy[5]=500.0/6.0*0.75;}
 if role==7&&!carrier{let mut child=craft(0,false);child.spec_id="flight-owner-child".into();let mut grandchild=craft(0,false);grandchild.spec_id="flight-owner-grandchild".into();child.children.push(flight_owner::ModuleTemplate{template:Box::new(grandchild),offset:[-8.0,2.0],angle:0.3,independent:true,manual:false});t.children.push(flight_owner::ModuleTemplate{template:Box::new(child),offset:[21.0,-9.0],angle:0.4,independent:false,manual:false});}
 if role==8&&!carrier{t.flux[0]=0.0;}t
}
fn setup(f:&mut Fixture,role:u32,seed:u32){let input=std::mem::take(&mut f.input);*f=empty();f.input=input;f.random=random::Random::new(seed);f.visual=random::Random::new(1757);
 let carrier=craft(0,true);f.with_runtime(|w,c|w.construct(c,&carrier,"carrier".into(),[0.0,0.0],0.17,true,0,true)).unwrap();f.with_runtime(|w,c|w.construct(c,&carrier,"enemy".into(),[650.0,80.0],PI,false,1,true)).unwrap();f.runtime.admit_root(&f.bodies,identity(1)).unwrap();f.runtime.admit_root(&f.bodies,identity(2)).unwrap();
 let t=craft(role,false);if role==8{f.with_runtime(|w,c|w.construct(c,&t,"zero-flux".into(),[0.0,0.0],0.17,true,0,true)).unwrap();return;}let description=flight_world::Template{handle:1,spec_id:t.spec_id.clone(),fighter:true,role:t.role,footprint:t.footprint.clone()};f.runtime.owner.install(flight_owner::CraftTemplate{description,variants:vec![flight_owner::Variant{carrier_spec:"carrier".into(),point_defense:None,ship:t}]},&f.specs).unwrap();
 let specs=vec![flight_world::WingSpec{template:1,spec_id:format!("flight-owner-{}",role),role:flight_world::WingRole::Fighter,tags:vec![],count:1,rebuild_seconds:Some(0.8),range:Some(1800.0),special_name:(1..=2).contains(&role)},flight_world::WingSpec{template:1,spec_id:format!("flight-owner-{}",role),role:flight_world::WingRole::Bomber,tags:vec![],count:1,rebuild_seconds:Some(0.8),range:Some(1800.0),special_name:(1..=2).contains(&role)}];
 for m in &mut f.runtime.owner.ships{m.carrier_stats=flight_world::CarrierStats{range_multiplier:1.0,refit_multiplier:1.0,rearm_fraction:0.0,decrease_multiplier:1.0,increase_percent:0.0,increase_multiplier:1.0,reserve_deck:false,point_defense_skill:None};}
 f.runtime.owner.ship_mut(identity(1)).unwrap().wings=specs;f.runtime.owner.ship_mut(identity(1)).unwrap().bays=2;f.with_runtime(|w,c|w.init(c,identity(1),None,None)).unwrap();
}
use std::f64::consts::PI;
fn batch(f:&mut Fixture)->Result<(),u32>{
 let queue=f.runtime.queue.clone();let mut before=Vec::new();let mut prepared=Vec::new();let mut notices=Vec::new();let mut local=Vec::new();
 f.runtime.transition(flight_runtime::Stage::State).map_err(flight_runtime::error)?;
 for entry in &queue{let i=f.bodies.iter().position(|b|b.handle.slot==entry.step.craft.handle&&b.handle.generation==entry.step.craft.generation).ok_or(4u32)?;let dt=entry.step.dt;
  system_owner::early(&mut f.bodies,i,dt)?;phase_runtime::early_world(&mut f.service.world,&mut f.bodies,i,dt,&f.specs,&mut notices)?;
  let live=system_owner::modifiers(&f.bodies,i,&f.specs)?;f.bodies[i].ship.as_mut().unwrap().live=live;
  let q=f.bodies[i].ship.as_mut().unwrap().combat.as_mut().unwrap().query.as_mut().unwrap();q.target=entry.step.target.map(|h|state::Handle{slot:h.handle,generation:h.generation});q.scope=entry.ships.iter().map(|h|state::Handle{slot:h.handle,generation:h.generation}).collect();q.expected_scope=q.scope.len();
  let scope=entry.ships.iter().map(|h|state::Handle{slot:h.handle,generation:h.generation}).collect::<Vec<_>>();readiness_owner::prepare_world(&mut f.service.world,&mut f.bodies,i,dt,&scope,&f.specs,&mut f.random,&mut f.visual,&mut notices)?;system_owner::cancel(&mut f.bodies,i,&f.specs,&mut f.ordnance,dt,false,&mut f.random,&mut notices)?;
  let b=&mut f.bodies[i];before.push(b.motion);prepared.push(b.ship.as_ref().unwrap().can_advance());let s=b.ship.as_mut().unwrap();s.begin_advance(dt,&f.specs,&mut f.random,&mut local)?;
  system_owner::cancel(&mut f.bodies,i,&f.specs,&mut f.ordnance,dt,true,&mut f.random,&mut notices)?;let live=system_owner::modifiers(&f.bodies,i,&f.specs)?;let b=&mut f.bodies[i];let s=b.ship.as_mut().unwrap();s.live=live;s.world.as_mut().unwrap().previous=[b.motion[0],b.motion[1]];s.world.as_mut().unwrap().previous_facing=b.motion[4];if s.can_advance(){s.finish_advance(&f.specs,&mut local)?;}
 }
 f.runtime.transition(flight_runtime::Stage::Motion).map_err(flight_runtime::error)?;
 for(index,entry)in queue.iter().enumerate(){if !prepared[index]{continue;}let b=f.bodies.iter_mut().find(|b|b.handle.slot==entry.step.craft.handle).unwrap();let s=b.ship.as_mut().unwrap();s.engines.as_ref().unwrap().motion_row_live(&mut b.motion,s.flux.boost,s.motion_speed_multiplier(),s.engine_context().extended,&s.live);motion::advance(&mut b.motion,s.clock[5]);s.finish_shield(&b.motion)?;}
 f.runtime.transition(flight_runtime::Stage::WeaponState).map_err(flight_runtime::error)?;
 for entry in &queue{let b=f.bodies.iter_mut().find(|b|b.handle.slot==entry.step.craft.handle).unwrap();let s=b.ship.as_mut().unwrap();if s.can_advance(){s.finish_weapons(b.motion[4],&mut f.random,&mut f.visual,&mut local)?;}}
 f.runtime.transition(flight_runtime::Stage::FireQuery).map_err(flight_runtime::error)?;
 // This fixture contains no missiles/terrain and only queued live gun owners.
 // Each live ship scope comes directly from the production runtime queue.
 fire_query::plan(&mut f.bodies,&f.ordnance,&f.specs)?;
 f.runtime.transition(flight_runtime::Stage::FireCommit).map_err(flight_runtime::error)?;
 f.ordnance.fire(&mut f.bodies,&f.specs,&mut f.random,&mut notices)?;
 f.runtime.transition(flight_runtime::Stage::Finish).map_err(flight_runtime::error)?;
 for(index,entry)in queue.iter().enumerate(){if !prepared[index]{continue;}let b=f.bodies.iter_mut().find(|b|b.handle.slot==entry.step.craft.handle).unwrap();let s=b.ship.as_mut().unwrap();s.finish_damage(entry.step.dt,&mut f.random,&mut f.visual,&mut local);s.finish_engines(&b.motion,&before[index],&mut f.random,&mut f.visual,&mut local)?;}
 f.with_runtime(|w,c|w.finish(c)).map_err(flight_runtime::error)
}

fn output(f:&mut Fixture){let mut out=vec![0.0,f.random.cursor,f.random.ids,f.visual.cursor,f.bodies.len()as f64,f.ordnance.projectiles.len()as f64,f.service.next as f64];
 for b in &f.bodies{let s=b.ship.as_ref().unwrap();let c=s.combat.as_ref().unwrap();let q=c.query.as_ref().unwrap();let w=s.world.as_ref().unwrap();let a=s.armor.as_ref().unwrap();let m=f.runtime.owner.ship(identity(b.handle.slot)).unwrap();out.extend([b.handle.slot as f64,b.handle.generation as f64,s.flags as f64,a.data[14],s.flux.soft,s.flux.hard,w.carrier.map_or(0,|h|h.slot)as f64,m.recall as u32 as f64]);out.extend(&b.motion[..6]);out.extend(w.previous);out.extend([b.motion[7],b.motion[8],b.motion[9],b.motion[10],q.aim[0],q.aim[1],q.trigger as u32 as f64,q.hold as u32 as f64,q.target.map_or(0,|h|h.slot)as f64,c.attrs[19],s.shield.as_ref().unwrap().active()as u32 as f64]);out.extend(c.readiness.as_ref().unwrap().state.words());
  out.push(s.components.len()as f64);for component in &s.components{out.extend(component.data);}let w=s.weapons.as_ref().unwrap();for mount in &w.mounts{out.extend(mount.data);}out.push(w.groups.len()as f64);for g in &w.groups{out.extend(g.data);}let e=s.engines.as_ref().unwrap();out.push(e.engines.len()as f64);for e in &e.engines{out.extend(e.data);}out.push(a.cells.len()as f64);out.extend(a.cells.iter().map(|x|*x as f64));}
 for p in &f.ordnance.projectiles{out.extend([p.source as f64,p.component as f64,p.cycle,p.id,p.damage,p.emp,p.pos[0],p.pos[1],p.velocity[0],p.velocity[1],p.angle,p.range]);}
 for list in [&f.runtime.flights.fighters,&f.runtime.flights.bombers]{out.push(list.len()as f64);out.extend(list.iter().map(|h|h.handle as f64));}for modes in [&f.runtime.flights.fighter_modes,&f.runtime.flights.bomber_modes]{out.push(modes.len()as f64);for m in modes{out.extend([m.craft.handle as f64,m.state.mode as u32 as f64,m.state.timer,m.state.target.map_or(0,|h|h.handle)as f64,m.state.has_payload as u32 as f64]);}}
 out.push(f.runtime.records.len()as f64);for r in &f.runtime.records{match r{Record::Contrail(c)=>{out.extend([3.0,c.craft.handle as f64,c.pos[0],c.pos[1],c.vel[0],c.vel[1],c.life,c.max_life,c.size,c.max_size,c.alpha,c.rotation]);},Record::Spawned{tree}=>{out.extend([0.0,tree.len()as f64]);out.extend(tree.iter().map(|h|h.handle as f64));},Record::Removed{craft,reason}=>out.extend([1.0,craft.handle as f64,*reason as u32 as f64]),Record::Event{craft,event}=>out.extend([2.0,craft.handle as f64,*event as u32 as f64])}}
 fn string(out:&mut Vec<f64>,text:&str){let units=text.encode_utf16().collect::<Vec<_>>();out.push(units.len()as f64);out.extend(units.into_iter().map(|n|n as f64));}
 for wings in [&f.runtime.flights.player_wings,&f.runtime.flights.enemy_wings]{out.push(wings.len()as f64);for w in wings{string(&mut out,&w.id);string(&mut out,&w.name);string(&mut out,&w.spec.spec_id);out.extend([w.carrier.handle as f64,(w.spec.role==flight_world::WingRole::Bomber)as u32 as f64,w.player as u32 as f64,w.team,w.spec.count as f64,w.crr,w.spec.rebuild_seconds.is_some()as u32 as f64,w.spec.rebuild_seconds.unwrap_or(0.0),w.spec.range.is_some()as u32 as f64,w.spec.range.unwrap_or(0.0),w.spec.tags.len()as f64]);for tag in &w.spec.tags{string(&mut out,tag);}out.push(w.rebuild.len()as f64);for item in &w.rebuild{string(&mut out,&item.id);out.extend([item.timer,item.max_timer]);}out.push(w.recovered.len()as f64);for item in &w.recovered{out.extend([item.timer,item.reserve_remaining.is_some()as u32 as f64,item.reserve_remaining.unwrap_or(0.0)]);}}}
 for list in [&f.runtime.flights.carriers,&f.runtime.flights.reserve_deck_used,&f.runtime.flights.docked_reserve]{out.push(list.len()as f64);out.extend(list.iter().map(|h|h.handle as f64));}out.push(f.runtime.flights.reserve.len()as f64);for(h,left)in &f.runtime.flights.reserve{out.extend([h.handle as f64,*left]);}
 for b in &f.bodies{let m=f.runtime.owner.ship(identity(b.handle.slot)).unwrap();string(&mut out,m.wing.as_deref().unwrap_or(""));out.push(m.deployed.len()as f64);out.extend(m.deployed.iter().map(|h|h.handle as f64));}f.output=out;
}
#[no_mangle]pub extern "C" fn test_input(n:u32)->u32{F.with_borrow_mut(|f|{f.input.resize(n as usize,0.0);f.input.as_mut_ptr()as u32})}
#[no_mangle]pub extern "C" fn test_reset()->u32{F.with_borrow_mut(|f|{setup(f,f.input[0]as u32,f.input[1]as u32);output(f);f.output.as_ptr()as u32})}
#[no_mangle]pub extern "C" fn test_step()->u32{F.with_borrow_mut(|f|{let p=f.input.clone();match p[0]as u32{
 0=>{let dt=p[1];f.runtime.begin(&f.bodies).unwrap();for h in f.runtime.ordinary_roster.clone(){f.runtime.enqueue_ordinary(&f.bodies,h,dt,None).unwrap();}f.with_runtime(|w,c|w.collect_wings(c,dt,identity(1),identity(2))).unwrap();batch(f).unwrap();},
 3=>{f.runtime.records.clear();f.with_runtime(|w,c|w.toggle_recall(c,identity(1))).unwrap();},
 4=>{f.runtime.records.clear();f.with_runtime(|w,c|w.recover(c,identity(1),identity(p[1]as u32))).unwrap();},
 6=>{f.runtime.records.clear();f.with_runtime(|w,c|w.reserve(c,identity(1))).unwrap();},
 8=>{f.runtime.records.clear();f.with_runtime(|w,c|w.detach(c,identity(1),identity(p[1]as u32))).unwrap();},
 9=>{let dt=p[1];f.runtime.begin(&f.bodies).unwrap();for h in f.runtime.ordinary_roster.clone(){f.runtime.enqueue_ordinary(&f.bodies,h,dt,None).unwrap();}f.with_runtime(|w,c|w.collect_wings(c,dt,identity(1),identity(2))).unwrap();},
 10=>{SAVED.with_borrow_mut(|saved|*saved=Some(f.clone()));},11=>{*f=SAVED.with_borrow(|saved|saved.clone().unwrap());},
 _=>{}
 }output(f);f.output.as_ptr()as u32})}
#[no_mangle]pub extern "C" fn test_queue()->u32{F.with_borrow_mut(|f|{let r=&f.runtime;let mut out=vec![r.stage as u32 as f64,r.queue.len()as f64];for q in &r.queue{out.extend([q.step.craft.handle as f64,q.step.dt,q.step.target.map_or(0,|h|h.handle)as f64,q.ships.len()as f64]);out.extend(q.ships.iter().map(|h|h.handle as f64));match &q.missiles{flight_runtime::MissileScope::Captured(_)=>out.extend([0.0,0.0]),flight_runtime::MissileScope::Selected(h)=>out.extend([1.0,h.map_or(0,|h|h.handle)as f64])}}f.output=out;f.output.as_ptr()as u32})}
#[no_mangle]pub extern "C" fn test_output_words()->u32{F.with_borrow(|f|f.output.len()as u32)}
#[no_mangle]pub extern "C" fn test_contracts()->u32{F.with_borrow_mut(|f|{let original=f.clone();let mut n=0u32;
 assert!(f.runtime.enqueue_ordinary(&f.bodies,identity(1),0.1,None).is_err());n+=1;
 f.runtime.begin(&f.bodies).unwrap();assert!(f.runtime.begin(&f.bodies).is_err());n+=1;
 f.runtime.enqueue_ordinary(&f.bodies,identity(1),0.1,None).unwrap();assert!(f.runtime.enqueue_ordinary(&f.bodies,identity(1),0.1,None).is_err());n+=1;
 assert!(f.runtime.enqueue_ordinary(&f.bodies,Identity{handle:1,generation:8},0.1,None).is_err());n+=1;
 assert!(f.runtime.enqueue_ordinary(&f.bodies,identity(2),-0.1,None).is_err());n+=1;
 assert!(f.runtime.enqueue_ordinary(&f.bodies,f.runtime.flights.fighters[0],0.1,None).is_err());n+=1;
 assert!(f.runtime.transition(flight_runtime::Stage::FireCommit).is_err());n+=1;
 f.runtime.transition(flight_runtime::Stage::State).unwrap();assert!(f.with_runtime(|w,c|w.toggle_recall(c,identity(1))).is_err());n+=1;
 assert!(f.with_runtime(|w,c|w.finish(c)).is_err());n+=1;
 let w=f.bodies[0].ship.as_mut().unwrap().world.as_mut().unwrap();w.children.push(state::Handle{slot:1,generation:1});assert!(f.runtime.roster(&f.bodies).is_err());n+=1;
 let mut formation=flight_world::Formation::default();formation.install(&[],&[]).unwrap();assert!(formation.install(&[],&[]).is_err());n+=1;
 let zero=Identity{handle:0,generation:1};let mut formation=flight_world::Formation::default();formation.install(&[(zero,zero,0)],&[(zero,25.0)]).unwrap();assert!(formation.install(&[],&[]).is_err());n+=1;
 let mut formation=flight_world::Formation::default();assert!(formation.install(&[(Identity{handle:0,generation:0},zero,0)],&[]).is_err());formation.install(&[],&[]).unwrap();n+=1;
 *f=original;f.output=vec![n as f64];f.output.as_ptr()as u32})}
#[no_mangle]pub extern "C" fn test_source_scope()->u32{F.with_borrow_mut(|f|{let p=f.input.clone();let r=p[0]as usize;let target=identity(p[1]as u32);f.runtime.owner.ship_mut(identity(r as u32+1)).unwrap().player_target=Some(target);f.output=vec![];f.output.as_ptr()as u32})}
#[no_mangle]pub extern "C" fn test_missile()->u32{F.with_borrow_mut(|f|{let mut d=projectile::Delivery::new(&[4.0,0.0,0.3,5.0,0.0,10.0,0.0,0.0,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]);
 d.guidance=Some(missile_owner::Spec::new(&[1.0,0.0,0.0,1.0,100.0,0.0,0.0,1.0,200.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]));
 let e=weapon_fire::Emission{kind:weapon_fire::EmissionKind::Projectile,id:0.777,component_id:1,cycle_id:0.0,position:[300.0,0.0],velocity:[-200.0,0.0],angle:PI,barrel_offset:[0.0;2],base_damage:10.0,source_damage_multiplier:1.0,damage:10.0,emp:0.0,range:2000.0,duration:0.0,target_ship:None,target_projectile:None,armed_while_fizzling:None,flight_time:Some(100.0),source_velocity:[0.0;2],recoil_delta:[0.0;2]};
 f.ordnance.serial+=1.0;let mut projectile=projectile::Projectile::new(f.ordnance.serial,2,state::Handle{slot:2,generation:1},1,d,&e,200.0,[1.0;8],0.0);projectile.player=Some(false);missile_owner::initialize(&mut projectile,1.0,&[(1,state::Handle{slot:1,generation:1}),(2,state::Handle{slot:2,generation:1})]);f.ordnance.projectiles.push(projectile);f.output=vec![];f.output.as_ptr()as u32})}

#[path="../../native/combat-core/src/ai_owner.rs"]mod ai_owner;
#[path="../../native/combat-core/src/ai_resident.rs"]mod ai_resident;

#[path="../../native/combat-core/src/ai_wire.rs"]mod ai_wire;
