//! Joint resident readiness/component commit. Actions execute before live gates.
use crate::{battle::CombatShip,readiness as r,ship_state::{self,ShipState,Notice},state::{Body,Handle},random::Random};

#[derive(Clone)]
pub struct Owned {pub state:r::Readiness,pub parameters:r::Parameters,pub base_movement:f64,pub base_outgoing:f64,pub base_taken:f64,pub base_critical_taken:f64}
impl Owned {
    pub fn new(row:&[f64],combat:&CombatShip,critical_taken:f64,random:&mut Random)->Self{
        Self{state:r::Readiness::new(row[0],row[1],random),parameters:r::Parameters{fighter:combat.size==0,malfunction_range:row[2],critical_chance_multiplier:row[3],weapon_chance_bonus:row[4],
            critical_chance_bonus:row[5],peak_cr_seconds:row[6],cr_loss_per_second:row[7]},base_movement:row[8],base_outgoing:combat.attrs[11],base_taken:combat.attrs[1],base_critical_taken:critical_taken}
    }
    pub fn valid(&self)->bool{self.state.valid()&&[self.base_movement,self.base_outgoing,self.base_taken,self.base_critical_taken,self.parameters.malfunction_range,
        self.parameters.critical_chance_multiplier,self.parameters.weapon_chance_bonus,self.parameters.critical_chance_bonus,self.parameters.peak_cr_seconds,self.parameters.cr_loss_per_second].iter().all(|v|v.is_finite())}
}
fn components(s:&ShipState)->(Vec<r::Weapon>,Vec<u32>,Vec<r::Engine>,f64){
    let weapons=s.weapons.as_ref().map_or(Vec::new(),|w|w.mounts.iter().enumerate().map(|(i,m)|r::Weapon{id:m.data[0]as u32,hidden:s.components[i].data[2]==2.0,
        permanently_disabled:s.components[i].data[8]==1.0,ammo:m.data[17],max_ammo:if m.data[9]==1.0{m.data[10]}else{f64::INFINITY},ammo_regen:m.data[11]}).collect());
    let members=s.weapons.as_ref().map_or(Vec::new(),|w|w.groups.iter().flat_map(|g|g.members.iter().copied()).collect());
    let engines=s.engines.as_ref().map_or(Vec::new(),|e|e.engines.iter().enumerate().map(|(i,x)|r::Engine{id:i as u32,system_activated:x.data[5]==1.0,contribution:x.data[19]}).collect());
    (weapons,members,engines,s.engines.as_ref().map_or(0.0,|e|e.data[6]))
}
pub fn deploy(s:&mut ShipState,cr:f64,locked:bool,random:&mut Random)->Result<(),u32>{
    let (weapons,members,engines,permanent)=components(s);let c=r::Components{weapons:&weapons,grouped_weapon_ids:&members,engines:&engines,permanently_disabled_fraction:permanent};
    let owned=s.combat.as_mut().and_then(|c|c.readiness.as_mut()).ok_or(8u32)?;owned.state.deploy(cr,locked,owned.parameters,&c,random);Ok(())
}
fn contact(b:&Body)->Option<r::Contact>{let s=b.ship.as_ref()?;let c=s.combat.as_ref()?;Some(r::Contact{identity:[b.handle.slot,b.handle.generation],team:Some(c.team),position:[b.motion[0],b.motion[1]],
    dead:s.flags&ship_state::DEAD!=0,retreated:s.flags&ship_state::RETREATED!=0,docked:s.flags&ship_state::DOCKED!=0,fighter:c.size==0})}
pub fn prepare(bodies:&mut [Body],own:usize,dt:f64,random:&mut Random,visual:&mut Random,events:&mut Vec<Notice>)->Result<(),u32>{
    if bodies[own].ship.as_ref().and_then(|s|s.combat.as_ref()).is_none_or(|c|c.readiness.is_none()){return Ok(());}
    let owner=contact(&bodies[own]).ok_or(8u32)?;
    let s=bodies[own].ship.as_mut().unwrap();let owned=deployment(s,dt,random,visual,events,&mut ship_state::LocalHull)?;
    finish(bodies,own,owner,owned,dt,None)
}
/// Production deployment criticals use the synchronous scene damage service;
/// PPT only reads this queued ship's captured source fireWorld.ships roster.
pub fn prepare_world(world:&mut crate::world_owner::Owned,bodies:&mut[Body],own:usize,dt:f64,ships:&[Handle],specs:&std::collections::BTreeMap<u32,crate::lifecycle::Spec>,random:&mut Random,visual:&mut Random,events:&mut Vec<(u32,Handle,Notice)>)->Result<(),u32>{
    let b=bodies.get(own).ok_or(4u32)?;if b.ship.as_ref().and_then(|s|s.combat.as_ref()).is_none_or(|c|c.readiness.is_none()){return Ok(());}
    if ships.iter().enumerate().any(|(i,h)|ships[..i].contains(h)||!bodies.iter().any(|b|b.handle==*h)){return Err(8);}
    let owner=contact(b).ok_or(8u32)?;let owned=crate::phase_runtime::with_ship(world,bodies,own,specs,events,|s,h,n|deployment(s,dt,random,visual,n,h))?;
    finish(bodies,own,owner,owned,dt,Some(ships))
}
/// Source deployment listener runs before the live gate and before the new
/// target/roster is installed. Its sole readiness instance remains resident.
pub fn deployment_world(world:&mut crate::world_owner::Owned,bodies:&mut[Body],own:usize,dt:f64,specs:&std::collections::BTreeMap<u32,crate::lifecycle::Spec>,random:&mut Random,visual:&mut Random,events:&mut Vec<(u32,Handle,Notice)>)->Result<(),u32>{
    let b=bodies.get(own).ok_or(4u32)?;if b.ship.as_ref().and_then(|s|s.combat.as_ref()).is_none_or(|c|c.readiness.is_none()){return Err(8);}
    let owned=crate::phase_runtime::with_ship(world,bodies,own,specs,events,|s,h,n|deployment(s,dt,random,visual,n,h))?;
    bodies[own].ship.as_mut().ok_or(8u32)?.combat.as_mut().ok_or(8u32)?.readiness=Some(owned);Ok(())
}
/// Called only after prev-pose/module sync and the actual queued target/scope.
pub fn peak_world(bodies:&mut[Body],own:usize,dt:f64,ships:&[Handle])->Result<(),u32>{
    let b=bodies.get(own).ok_or(4u32)?;
    if ships.iter().enumerate().any(|(i,h)|ships[..i].contains(h)||!bodies.iter().any(|b|b.handle==*h)){return Err(8);}
    let owner=contact(b).ok_or(8u32)?;
    let owned=bodies[own].ship.as_mut().ok_or(8u32)?.combat.as_mut().ok_or(8u32)?.readiness.take().ok_or(8u32)?;
    finish(bodies,own,owner,owned,dt,Some(ships))
}
fn deployment<H:ship_state::HullServices>(s:&mut ShipState,dt:f64,random:&mut Random,visual:&mut Random,events:&mut Vec<Notice>,hull:&mut H)->Result<Owned,u32>{
    let mut owned=s.combat.as_mut().and_then(|c|c.readiness.take()).ok_or(8u32)?;
    let (weapons,members,engines,permanent)=components(s);let c=r::Components{weapons:&weapons,grouped_weapon_ids:&members,engines:&engines,permanently_disabled_fraction:permanent};
    let hp=s.armor.as_ref().ok_or(8u32)?.data[14];let action=owned.state.advance_deployment(dt,s.flags&ship_state::DEAD!=0,hp,owned.parameters,&c,random);
    if let Some(target)=action{
        let point=match target{
            r::Target::Weapon(id)=>{let i=s.components.iter().position(|m|m.data[0]==id as f64).ok_or(8u32)?;
                s.disable_weapon(i,true,random,events);s.weapons.as_mut().ok_or(8u32)?.finalize(i);[s.components[i].data[3],s.components[i].data[4]]},
            r::Target::Engine(id)=>{let context=s.engine_context();let e=s.engines.as_mut().ok_or(8u32)?;let i=id as usize;if i>=e.engines.len(){return Err(8);}
                e.malfunction(i,context,true);[e.engines[i].data[1],e.engines[i].data[2]]}
        };
        // Critical side damage uses the current CR before any PPT loss this step.
        s.damage_policy[7]=owned.base_critical_taken*(1.0+owned.state.effects(owned.parameters).damage_taken_percent/100.0);
        // The listener reads then-current CR. Keep that sole readiness instance
        // resident while the actual nested critical hull hook executes.
        s.combat.as_mut().unwrap().readiness=Some(owned);
        s.critical_damage_with(point,random,visual,events,hull)?;s.sync_engines();
        owned=s.combat.as_mut().unwrap().readiness.take().ok_or(8u32)?;
    }
    owned.state.finish_deployment(dt,s.flags&ship_state::DEAD!=0,s.armor.as_ref().unwrap().data[14]);
    Ok(owned)
}
fn finish(bodies:&mut[Body],own:usize,owner:r::Contact,mut owned:Owned,dt:f64,scope:Option<&[Handle]>)->Result<(),u32>{
    let s=bodies[own].ship.as_ref().ok_or(8u32)?;let alive=s.can_advance();
    let target=s.combat.as_ref().unwrap().query.as_ref().and_then(|q|q.target);
    // Release own mutable borrow before observing the then-live whole roster.
    if alive{
        let world:Vec<r::Contact>=bodies.iter().filter(|b|scope.is_none_or(|h|h.contains(&b.handle))).filter_map(contact).collect();
        let explicit=target.and_then(|h|bodies.iter().find(|b|b.handle==h)).and_then(contact);
        let significant=r::significant_enemies(owner,2500.0,explicit,&world);
        owned.state.advance_peak(dt,significant,owned.parameters);
    }
    let s=bodies[own].ship.as_mut().unwrap();let effects=owned.state.effects(owned.parameters);
    if let Some(w)=&mut s.weapons{w.data[8]=effects.weapon_chance;w.data[9]=effects.critical_chance;w.data[10]=owned.state.current_cr;}
    if let Some(e)=&mut s.engines{e.data[17]=effects.engine_chance;e.data[18]=effects.critical_chance;}
    s.damage_policy[7]=owned.base_critical_taken*(1.0+effects.damage_taken_percent/100.0);
    let c=s.combat.as_mut().unwrap();c.attrs[11]=owned.base_outgoing*(1.0+effects.damage_percent/100.0);c.attrs[1]=owned.base_taken*(1.0+effects.damage_taken_percent/100.0);
    if let Some(e)=&mut s.engines{e.motion[16]=owned.base_movement*(1.0+effects.movement_percent/100.0);}
    c.readiness=Some(owned);Ok(())
}
pub const WIDTH:usize=31;
pub fn words(owned:&Owned,offset:usize)->[f64;WIDTH]{
    let mut out=[0.0;WIDTH];out[..8].copy_from_slice(&owned.state.words());out[8..17].copy_from_slice(&owned.state.effects(owned.parameters).words());
    if let Some(sequence)=&owned.state.deployment_sequence{out[17..27].copy_from_slice(&sequence.words());}
    out[27]=offset as f64;out[28]=owned.state.deployment_sequence.as_ref().map_or(0,|s|s.targets.len())as f64;
    out[29]=owned.parameters.peak_cr_seconds;out[30]=owned.parameters.cr_loss_per_second;out
}
