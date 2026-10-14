#[path="../../native/combat-core/src/motion_owner.rs"]mod motion_owner;
#[path="../../native/combat-core/src/gravity_wire.rs"]mod gravity_wire;
#[path="../../native/combat-core/src/scene_prelude.rs"]mod scene_prelude;
#[path="../../native/combat-core/src/flight_runtime.rs"]mod flight_runtime;
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
use std::{cell::RefCell,collections::BTreeMap};
use phase_anchor::{State,Encounter,Services,Failure,Sound};
#[derive(Clone)]struct Service{pending:[f64;3],external:[bool;3]}
impl Service{fn phase(&self,b:&[state::Body],row:usize,own:bool)->Result<bool,Failure>{let s=b.get(row).and_then(|b|b.ship.as_ref()).ok_or(Failure::Host)?;if s.flags&(ship_state::DOCKED|ship_state::RETREATED)!=0||own||self.external[row]{return Ok(true);}if let Some(p)=s.world.as_ref().unwrap().parent{let row=b.iter().position(|b|b.handle==p).ok_or(Failure::Host)?;if self.phase(b,row,false)?{return Ok(true);}}let sh=s.shield.as_ref().unwrap();Ok(sh.kind()==shield::PHASE&&(sh.data[14]==1.0||sh.data[14]==2.0||sh.data[14]==3.0&&sh.data[15]>0.5))}}
impl Services for Service{
 fn phased(&self,b:&[state::Body],row:usize,listener:&State)->Result<bool,Failure>{self.phase(b,row,listener.emergency)}
 fn charge_cr_loss(&mut self,_:&mut[state::Body],row:usize,value:f64)->Result<(),Failure>{self.pending[row]+=value;self.external[row]=true;Ok(())}
 fn deactivate_systems(&mut self,b:&mut[state::Body],row:usize,specs:&BTreeMap<u32,lifecycle::Spec>)->Result<(),Failure>{let s=b[row].ship.as_mut().unwrap();for system in &mut s.systems{let meta=s.world.as_mut().unwrap().metas.get_mut(&system.id).ok_or(Failure::Host)?;if meta.kind!=ship_effects::Kind::None{return Err(Failure::Unsupported);}meta.input=None;system.interrupt(specs.get(&system.spec).ok_or(Failure::Host)?);}Ok(())}
 fn retreat(&mut self,b:&mut[state::Body],row:usize,specs:&BTreeMap<u32,lifecycle::Spec>)->Result<(),Failure>{if b[row].ship.as_ref().unwrap().flags&(ship_state::DEAD|ship_state::RETREATED)!=0{return Ok(());}b[row].ship.as_mut().unwrap().flags|=ship_state::RETREATING|ship_state::RETREATED;
  let children=b[row].ship.as_ref().unwrap().world.as_ref().unwrap().children.clone();for child in children{let child=b.iter().position(|b|b.handle==child).ok_or(Failure::Host)?;self.retreat(b,child,specs)?;}
  let body=&mut b[row];body.motion[7..11].fill(0.0);let s=body.ship.as_mut().unwrap();s.combat.as_mut().unwrap().query.as_mut().unwrap().trigger=false;s.shield.as_mut().unwrap().set_active(false,&mut s.flux);s.flux.cancel_vent();self.deactivate_systems(b,row,specs)?;
  b[row].motion[..4].copy_from_slice(&[0.0,-1_000_000.0,0.0,0.0]);b[row].ship.as_mut().unwrap().world.as_mut().unwrap().previous=[0.0,-1_000_000.0];Ok(())}
}
#[derive(Clone)]struct World{bodies:Vec<state::Body>,states:Vec<State>,scene:Encounter,service:Service,specs:BTreeMap<u32,lifecycle::Spec>,random:random::Random,visual:random::Random,sounds:Vec<(state::Handle,Sound)>,dealt:f64}
fn world(cost:f64,cr:f64)->World{let mut random=random::Random::new(13181);let visual=random::Random::new(17157);let mut specs=BTreeMap::new();specs.insert(1,lifecycle::Spec::new(&[0.0,0.0,0.0,0.0,1.0,-1.0,0.0,0.0,0.0,0.0]));let mut bodies=Vec::new();let mut states=Vec::new();
 for row in 0..3{let mut s=ship_state::ShipState::new(&[500.0,100.0,1.0,1.0,1.0,0.0,1.0,1.0,0.0,0.0,2.0,1.0,0.0,1.0,0.0,0.0,0.0]);s.armor=Some(armor::Armor::new(&[10.0,10.0,15.0,15.0,100.0,-75.0,-75.0,500.0,500.0,1.0,1.0,0.85,1.0,1.0,0.0,0.0,0.0]));
  s.shield=Some(shield::Shield::new(&[3.0,0.0,30.0,1.0,0.0,1.0,1.0,0.5,0.5,2.0,25.0,25.0,1.0,0.0,1.0,0.0,0.0,0.0,0.0]));let mut pose=[0.0;motion::WIDTH];pose[0]=row as f64*100.0;pose[1]=20.0;pose[4]=0.17;
  let mut own=system_owner::Owned::new(&[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,1.0,0.0,0.0,0.0],&pose);own.aim=[0.0;2];for id in 1..=2{s.systems.push(lifecycle::System::new(id,1,&specs[&1]));own.metas.insert(id,system_owner::Meta{kind:ship_effects::Kind::None,input:None,jump:ship_effects::TacticalJump::default(),regen:0.0});}s.world=Some(own);
  let mut c=battle::CombatShip::new(&[(row==2)as u32 as f64,1.0,30.0,0.0,1.0,(row!=2)as u32 as f64]);c.query=Some(fire_query::ShipQuery::new(&[0.0;12]));c.readiness=Some(readiness_owner::Owned::new(&[cr,720.0,1.0,1.0,0.0,0.0,720.0,0.25,1.0],&c,1.0,&mut random));s.combat=Some(c);
  states.push(State::install(&mut s,cost).unwrap());bodies.push(state::Body{id:row as u32+1,handle:state::Handle{slot:row as u32+1,generation:1},order:row as f64,motion:pose,ship:Some(s)});
 }
 let child=bodies[1].handle;let parent=bodies[0].handle;bodies[0].ship.as_mut().unwrap().world.as_mut().unwrap().children.push(child);bodies[1].ship.as_mut().unwrap().world.as_mut().unwrap().parent=Some(parent);
 World{bodies,states,scene:Encounter::default(),service:Service{pending:[0.0;3],external:[false;3]},specs,random,visual,sounds:Vec::new(),dealt:0.0}
}
struct Fixture{world:World,input:Vec<f64>,output:Vec<f64>,saved:Option<World>}
thread_local!{static F:RefCell<Fixture>=RefCell::new(Fixture{world:world(0.15,0.7),input:Vec::new(),output:Vec::new(),saved:None});}
fn snapshot(f:&mut Fixture){let w=&f.world;let mut out=vec![w.random.cursor,w.random.ids,w.visual.cursor,w.scene.emergency_dive_used as u32 as f64,w.dealt];for(row,b)in w.bodies.iter().enumerate(){let s=b.ship.as_ref().unwrap();let sh=s.shield.as_ref().unwrap();let st=&w.states[row];let mods=s.world.as_ref().unwrap().runtime.iter().fold(ship_effects::Modifiers::default(),|mut acc,(_,m)|{acc.combine(m);acc});let phase=w.service.phase(&w.bodies,row,st.emergency).unwrap();let visual=if s.flags&(ship_state::DOCKED|ship_state::RETREATED)!=0{0.0}else{(1.0-0.75*sh.data[15]).min(st.external_phase().unwrap_or(1.0))};
  out.extend([s.armor.as_ref().unwrap().data[14],s.combat.as_ref().unwrap().readiness.as_ref().unwrap().state.current_cr,w.service.pending[row],(s.flags&ship_state::RETREATING!=0)as u32 as f64,(s.flags&ship_state::RETREATED!=0)as u32 as f64,(s.flags&ship_state::DEAD!=0)as u32 as f64,phase as u32 as f64,visual,sh.data[20],sh.data[14],sh.data[15],sh.data[6],sh.data[23],sh.data[25],sh.data[26],sh.data[24],s.flux.venting as u32 as f64,s.flux.soft,s.flux.hard]);out.extend(&b.motion[..6]);out.extend(s.world.as_ref().unwrap().previous);out.extend(&b.motion[7..11]);out.push(s.combat.as_ref().unwrap().query.as_ref().unwrap().trigger as u32 as f64);
  out.extend([mods.defined_mask()as f64]);out.extend(mods.values());out.extend(st.words());out.extend([st.external_phase().is_some()as u32 as f64,st.external_phase().unwrap_or(0.0)]);out.push(s.systems.len()as f64);for sys in &s.systems{out.extend([sys.state as f64,sys.effect,sys.active as u32 as f64,sys.cooling as u32 as f64,sys.active_timer,sys.cooldown_timer,sys.pending_activation,sys.pending_active,sys.stage_timer,sys.out_level]);}}
 out.push(w.sounds.len()as f64);for(h,s)in &w.sounds{out.extend([h.slot as f64,*s as u32 as f64]);}f.output=out;}
#[no_mangle]pub extern "C" fn test_input(n:u32)->u32{F.with_borrow_mut(|f|{f.input.resize(n as usize,0.0);f.input.as_mut_ptr()as u32})}
#[no_mangle]pub extern "C" fn test_reset()->u32{F.with_borrow_mut(|f|{f.world=world(f.input[0],f.input[1]);f.saved=None;snapshot(f);f.output.as_ptr()as u32})}
#[no_mangle]pub extern "C" fn test_step()->u32{F.with_borrow_mut(|f|{let p=f.input.clone();let row=p.get(1).copied().unwrap_or(0.0)as usize;let w=&mut f.world;w.sounds.clear();match p[0]as u32{
 0=>{let st=&mut w.states[row];let stopped=st.before_hull(&mut w.bodies,row,&mut w.scene,p[2],&w.specs,&mut w.service,&mut w.sounds).unwrap();w.dealt=if stopped{0.0}else{w.bodies[row].ship.as_mut().unwrap().apply_hull(p[2],&mut Vec::new()).unwrap()};},
 1=>{w.states[row].advance(&mut w.bodies,row,p[2],&w.specs,&mut w.service,&mut w.sounds).unwrap();},
 2=>{let b=&mut w.bodies[row];let s=b.ship.as_mut().unwrap();s.shield.as_mut().unwrap().update(p[2],&b.motion,&mut s.flux,false).unwrap();},
 3=>{let b=&mut w.bodies[row];let s=b.ship.as_mut().unwrap();let sh=s.shield.as_mut().unwrap();sh.data[14]=p[2];sh.data[15]=p[3];sh.data[6]=p[4];sh.data[23]=p[5];},
 4=>{let b=&mut w.bodies[row];let s=b.ship.as_mut().unwrap();s.flags=(s.flags&!(ship_state::DEAD|ship_state::RETREATED))|if p[2]==1.0{ship_state::DEAD}else{0}|if p[3]==1.0{ship_state::RETREATED}else{0};},
 5=>{let b=&mut w.bodies[row];b.motion[2]=17.0;b.motion[3]=-8.0;b.motion[7..11].copy_from_slice(&[0.5,1.0,1.0,0.2]);let s=b.ship.as_mut().unwrap();s.flux.soft=100.0;s.flux.start_vent();s.combat.as_mut().unwrap().query.as_mut().unwrap().trigger=true;for sys in &mut s.systems{sys.state=p[2]as u32;sys.effect=p[3];sys.active=p[4]==1.0;sys.stage_timer=0.2;sys.pending_activation=2.0;sys.pending_active=3.0;}},
 6=>{f.saved=Some(w.clone());},7=>{*w=f.saved.clone().unwrap();},8=>{let s=w.bodies[row].ship.as_mut().unwrap();let a=s.armor.as_mut().unwrap();a.data[15]=p[2];a.data[16]=p[3];},_=>{}
 }snapshot(f);f.output.as_ptr()as u32})}
#[no_mangle]pub extern "C" fn test_output_words()->u32{F.with_borrow(|f|f.output.len()as u32)}

#[path="../../native/combat-core/src/ai_owner.rs"]mod ai_owner;
#[path="../../native/combat-core/src/ai_resident.rs"]mod ai_resident;

#[path="../../native/combat-core/src/ai_wire.rs"]mod ai_wire;
