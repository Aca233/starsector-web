//! Production PhaseAnchor services over the real Bodies, systems and gravity.
//! Scene state and pending CR belong to the surrounding whole-world transaction.
use crate::{gravity_world, lifecycle::{self,Spec}, phase_anchor as a, shield,
    ship_effects as e,ship_state::{self,Notice},state::{Body,Handle},system_owner,world_owner};
use std::collections::BTreeMap;
use std::{cell::RefCell,collections::HashMap,ops::{Deref,DerefMut},rc::Rc};

#[derive(Clone)]pub struct Entry{pub ship:Handle,pub state:a::State,pub pending_cr:f64}
#[derive(Clone)]pub struct SystemControl{pub ship:Handle,pub system:u32,pub spec:e::ControlSpec}
/// Only topology is indexed. All values stay in the current owned rows, and
/// every mutable Vec operation invalidates the index before exposing them.
#[derive(Clone,Default)]pub struct Controls{
    rows:Vec<SystemControl>,index:RefCell<Option<Rc<HashMap<(u32,u32,u32),usize>>>>,
}
impl Deref for Controls{type Target=Vec<SystemControl>;fn deref(&self)->&Self::Target{&self.rows}}
impl DerefMut for Controls{fn deref_mut(&mut self)->&mut Self::Target{*self.index.get_mut()=None;&mut self.rows}}
impl Controls{
    pub fn find(&self,ship:Handle,system:u32)->Option<&SystemControl>{
        let mut index=self.index.borrow_mut();
        if index.is_none(){let mut rows=HashMap::with_capacity(self.rows.len());
            for(i,c)in self.rows.iter().enumerate(){rows.entry((c.ship.slot,c.ship.generation,c.system)).or_insert(i);}
            *index=Some(Rc::new(rows));}
        index.as_ref().unwrap().get(&(ship.slot,ship.generation,system)).map(|&i|&self.rows[i])
    }
}
#[derive(Clone,Default)]pub struct Owned{
    pub encounter:a::Encounter,pub entries:Vec<Entry>,pub controls:Controls,
    pub sounds:Vec<(Handle,a::Sound)>,
}
fn row(b:&[Body],h:Handle)->Result<usize,u32>{b.iter().position(|b|b.handle==h).ok_or(4)}
fn error(e:a::Failure)->u32{match e{a::Failure::InvalidNumber|a::Failure::Unsupported|a::Failure::Host=>8}}
impl Owned{
    pub fn install(&mut self,bodies:&mut[Body],ship:Handle,cost:f64)->Result<(),u32>{
        if self.entries.iter().any(|e|e.ship==ship){return Err(8);}let r=row(bodies,ship)?;
        let state=a::State::install(bodies[r].ship.as_mut().ok_or(8u32)?,cost).map_err(error)?;
        self.entries.push(Entry{ship,state,pending_cr:0.0});Ok(())
    }
    /// Exact installed definition, including an explicit false for non-phase
    /// systems. Missing metadata is an installation error, never guessed.
    pub fn install_control(&mut self,bodies:&[Body],ship:Handle,system:u32,spec:e::ControlSpec)->Result<(),u32>{
        let r=row(bodies,ship)?;if !bodies[r].ship.as_ref().ok_or(8u32)?.systems.iter().any(|s|s.id==system)
            ||self.controls.iter().any(|c|c.ship==ship&&c.system==system){return Err(8);}
        self.controls.push(SystemControl{ship,system,spec});Ok(())
    }
    pub fn complete(&self,bodies:&[Body],specs:&BTreeMap<u32,Spec>)->bool{
        self.entries.iter().enumerate().all(|(i,e)|e.state.valid()&&e.pending_cr.is_finite()&&e.pending_cr>=0.0
            &&!self.entries[..i].iter().any(|x|x.ship==e.ship)&&row(bodies,e.ship).is_ok())
        &&self.controls.iter().enumerate().all(|(i,c)|!self.controls[..i].iter().any(|x|x.ship==c.ship&&x.system==c.system)
            &&row(bodies,c.ship).ok().and_then(|r|bodies[r].ship.as_ref()).is_some_and(|s|s.systems.iter().any(|s|s.id==c.system)))
        &&bodies.iter().all(|b|b.ship.as_ref().is_some_and(|s|s.systems.iter().all(|s|specs.contains_key(&s.spec)
            &&self.controls.iter().filter(|c|c.ship==b.handle&&c.system==s.id).count()==1)))
    }
    pub fn pending_cr(&self,ship:Handle)->Result<f64,u32>{self.entries.iter().find(|e|e.ship==ship).map(|e|e.pending_cr).ok_or(4)}
    pub fn external_phase(&self,ship:Handle)->Option<f64>{self.entries.iter().find(|e|e.ship==ship).and_then(|e|e.state.external_phase())}
}

fn read(owned:&Owned,bodies:&[Body],r:usize,specs:&BTreeMap<u32,Spec>,local:Option<(Handle,&a::State)>,seen:&mut Vec<Handle>)->Result<bool,u32>{
    let b=bodies.get(r).ok_or(4u32)?;if seen.contains(&b.handle){return Err(8);}seen.push(b.handle);
    let s=b.ship.as_ref().ok_or(8u32)?;let w=s.world.as_ref().ok_or(8u32)?;
    if let Some(parent)=w.parent{let pr=row(bodies,parent)?;let pw=bodies[pr].ship.as_ref().and_then(|s|s.world.as_ref()).ok_or(8u32)?;
        if !pw.children.contains(&b.handle){return Err(8);}if read(owned,bodies,pr,specs,local,seen)?{return Ok(true);}}
    if s.flags&(ship_state::DOCKED|ship_state::RETREATED)!=0{return Ok(true);}
    if s.shield.as_ref().is_some_and(|sh|sh.kind()==shield::PHASE
        &&(sh.data[14]==1.0||sh.data[14]==2.0||sh.data[14]==3.0&&sh.data[15]>0.5)){return Ok(true);}
    for life in &s.systems{
        let spec=specs.get(&life.spec).ok_or(8u32)?;let control=owned.controls.find(b.handle,life.id).ok_or(8u32)?;
        if spec.flags&lifecycle::AVAILABLE!=0&&life.active&&control.spec.phase&&match life.state{
            lifecycle::IN=>!control.spec.vulnerable_up,lifecycle::OUT=>!control.spec.vulnerable_down,lifecycle::ACTIVE=>true,_=>false}{return Ok(true);}
    }
    Ok(if let Some((h,state))=local.filter(|(h,_)|*h==b.handle){let _=h;state.external_phase().is_some()}else{owned.external_phase(b.handle).is_some()})
}
/// A live reader for every collision, AI, system and fire decision. Alpha is a
/// separate visual value; a present external phase remains real even at zero.
pub fn phased(owned:&Owned,bodies:&[Body],r:usize,specs:&BTreeMap<u32,Spec>)->Result<bool,u32>{read(owned,bodies,r,specs,None,&mut Vec::new())}

fn read_live(scene:Option<&Owned>,bodies:&[Body],r:usize,specs:&BTreeMap<u32,Spec>,detached:Option<(usize,&ship_state::ShipState)>,listener:Option<(Handle,&a::State)>,seen:&mut Vec<Handle>)->Result<bool,u32>{
    let b=bodies.get(r).ok_or(4u32)?;if seen.contains(&b.handle){return Err(8);}seen.push(b.handle);
    let s=detached.filter(|(i,_)|*i==r).map(|(_,s)|s).or(b.ship.as_ref()).ok_or(8u32)?;
    if s.anchor_installed&&scene.is_none(){return Err(8);}
    if let Some(parent)=s.world.as_ref().and_then(|w|w.parent){let pr=row(bodies,parent)?;
        let ps=detached.filter(|(i,_)|*i==pr).map(|(_,s)|s).or(bodies[pr].ship.as_ref()).ok_or(8u32)?;
        if ps.world.as_ref().is_none_or(|w|!w.children.contains(&b.handle)){return Err(8);}
        if read_live(scene,bodies,pr,specs,detached,listener,seen)?{return Ok(true);}}
    if ship_state::local_phased(s){return Ok(true);}
    if let Some(owned)=scene{for life in &s.systems{let spec=specs.get(&life.spec).ok_or(8u32)?;
        let control=owned.controls.find(b.handle,life.id).ok_or(8u32)?;
        if spec.flags&lifecycle::AVAILABLE!=0&&life.active&&control.spec.phase&&match life.state{
            lifecycle::IN=>!control.spec.vulnerable_up,lifecycle::OUT=>!control.spec.vulnerable_down,lifecycle::ACTIVE=>true,_=>false}{return Ok(true);}}
        if let Some((_,state))=listener.filter(|(h,_)|*h==b.handle){return Ok(state.external_phase().is_some());}
        return Ok(owned.external_phase(b.handle).is_some());}
    Ok(false)
}
/// Shared live reader. A production installation has a complete scene; old
/// standalone non-anchor callers retain their shield/parent-only contract.
pub fn phased_world(world:&world_owner::Owned,bodies:&[Body],r:usize,specs:&BTreeMap<u32,Spec>)->Result<bool,u32>{
    read_live(world.phase.as_ref(),bodies,r,specs,None,None,&mut Vec::new())
}
pub fn world_phased(world:&world_owner::Owned,bodies:&[Body],r:usize,specs:&BTreeMap<u32,Spec>)->Result<bool,u32>{phased_world(world,bodies,r,specs)}
/// Ship.system.isPhased: only the installed primary system, rather than the
/// ship's combined shield/parent/external phase observation.
pub fn world_system_phased(world:&world_owner::Owned,bodies:&[Body],r:usize,specs:&BTreeMap<u32,Spec>)->Result<bool,u32>{
    let b=bodies.get(r).ok_or(4u32)?;let s=b.ship.as_ref().ok_or(8u32)?;let Some(life)=s.systems.iter().find(|l|!l.defense)else{return Ok(false);};
    let spec=specs.get(&life.spec).ok_or(8u32)?;let Some(scene)=world.phase.as_ref()else{return if s.anchor_installed{Err(8)}else{Ok(false)};};
    let control=scene.controls.find(b.handle,life.id).ok_or(8u32)?;
    Ok(spec.flags&lifecycle::AVAILABLE!=0&&life.active&&control.spec.phase&&match life.state{
        lifecycle::IN=>!control.spec.vulnerable_up,lifecycle::OUT=>!control.spec.vulnerable_down,lifecycle::ACTIVE=>true,_=>false})
}

fn deactivate_ship(gravity:Option<&mut crate::gravity_owner::Owned>,ship:&mut ship_state::ShipState,h:Handle,specs:&BTreeMap<u32,Spec>)->Result<(),u32>{
    let ids:Vec<_>=ship.systems.iter().map(|s|s.id).collect();let gravity_ids=ship.world.as_ref().map_or(Vec::new(),|w|w.gravity_systems.clone());let mut gravity=gravity;
    for sid in ids{if gravity_ids.contains(&sid){let owner=gravity.as_deref_mut().ok_or(8u32)?;
            owner.interrupt_ship(ship,h,sid,specs).map_err(crate::gravity_runtime::error)?;
        }else{let mut slot=system_owner::slot(ship,h,sid,specs)?;
            if matches!(slot.kind,e::Kind::GravityWell|e::Kind::GravityBattleWell|e::Kind::GravityOther){return Err(8);}slot.interrupt();system_owner::restore(ship,slot)?;}}
    Ok(())
}

pub struct DetachedHull<'a>{world:&'a mut world_owner::Owned,bodies:&'a mut[Body],row:usize,specs:&'a BTreeMap<u32,Spec>,gravity:Option<&'a mut crate::gravity_owner::Owned>}
impl ship_state::HullServices for DetachedHull<'_>{
    fn phased(&self,s:&ship_state::ShipState)->Result<bool,u32>{read_live(self.world.phase.as_ref(),self.bodies,self.row,self.specs,Some((self.row,s)),None,&mut Vec::new())}
    fn before_hull(&mut self,s:&mut ship_state::ShipState,damage:f64,_events:&mut Vec<Notice>)->Result<bool,u32>{
        let h=self.bodies[self.row].handle;let Some(scene)=self.world.phase.as_ref()else{return if s.anchor_installed{Err(8)}else{Ok(false)};};
        let Some(i)=scene.entries.iter().position(|e|e.ship==h)else{return if s.anchor_installed{Err(8)}else{Ok(false)};};
        let state=&scene.entries[i].state;if !state.valid()||!damage.is_finite(){return Err(8);}if state.emergency{return Ok(true);}
        let hp=s.armor.as_ref().ok_or(8u32)?.data[14];let cr=s.combat.as_ref().and_then(|c|c.readiness.as_ref()).ok_or(8u32)?.state.current_cr;
        if damage<hp||scene.encounter.emergency_dive_used||cr<state.deployment_cr_cost{return Ok(false);}
        let phased=read_live(Some(scene),self.bodies,self.row,self.specs,Some((self.row,s)),None,&mut Vec::new())?;
        let scene=self.world.phase.as_mut().unwrap();let entry=&mut scene.entries[i];scene.encounter.emergency_dive_used=true;
        s.armor.as_mut().unwrap().data[14]=1.0;s.flags|=ship_state::RETREATING;entry.pending_cr+=entry.state.deployment_cr_cost;
        if !entry.pending_cr.is_finite(){return Err(7);}entry.state.emergency=true;if !phased{scene.sounds.push((h,a::Sound::Activate));}
        let runtime=&mut s.world.as_mut().ok_or(8u32)?.runtime;let mut immune=e::Modifiers::default();immune.set(e::HULL_DAMAGE,0.0);
        if let Some((_,mods))=runtime.iter_mut().find(|(id,_)|*id==a::EMERGENCY){*mods=immune;}else{runtime.push((a::EMERGENCY,immune));}
        let gravity=self.gravity.as_deref_mut().or_else(||self.world.gravity.as_mut().map(|g|&mut g.owner));
        deactivate_ship(gravity,s,h,self.specs)?;Ok(true)
    }
}
/// Split borrow without duplicating the physical authority. The same ship is
/// put back after success or failure; the caller rolls back the whole world.
pub fn with_ship<T,F>(world:&mut world_owner::Owned,bodies:&mut[Body],r:usize,specs:&BTreeMap<u32,Spec>,notices:&mut Vec<(u32,Handle,Notice)>,op:F)->Result<T,u32>
where F:FnOnce(&mut ship_state::ShipState,&mut DetachedHull<'_>,&mut Vec<Notice>)->Result<T,u32>{
    with_ship_gravity(world,bodies,None,r,specs,notices,op)
}
pub fn with_ship_gravity<T,F>(world:&mut world_owner::Owned,bodies:&mut[Body],gravity:Option<&mut crate::gravity_owner::Owned>,r:usize,specs:&BTreeMap<u32,Spec>,notices:&mut Vec<(u32,Handle,Notice)>,op:F)->Result<T,u32>
where F:FnOnce(&mut ship_state::ShipState,&mut DetachedHull<'_>,&mut Vec<Notice>)->Result<T,u32>{
    let b=bodies.get_mut(r).ok_or(4u32)?;let mut ship=b.ship.take().ok_or(8u32)?;let mut events=Vec::new();
    let result={let mut hull=DetachedHull{world,bodies,row:r,specs,gravity};op(&mut ship,&mut hull,&mut events)};
    let b=&mut bodies[r];b.ship=Some(ship);
    if result.is_ok(){world.visual.notices(&events)?;}
    notices.extend(events.into_iter().map(|n|(b.id,b.handle,n)));result
}
pub fn hull(world:&mut world_owner::Owned,bodies:&mut[Body],r:usize,damage:f64,specs:&BTreeMap<u32,Spec>,notices:&mut Vec<(u32,Handle,Notice)>)->Result<f64,u32>{
    with_ship(world,bodies,r,specs,notices,|s,h,n|s.apply_hull_with(damage,n,h))
}
pub fn hull_gravity(world:&mut world_owner::Owned,bodies:&mut[Body],gravity:&mut crate::gravity_owner::Owned,r:usize,damage:f64,specs:&BTreeMap<u32,Spec>,notices:&mut Vec<(u32,Handle,Notice)>)->Result<f64,u32>{
    with_ship_gravity(world,bodies,Some(gravity),r,specs,notices,|s,h,n|s.apply_hull_with(damage,n,h))
}
pub fn early_world(world:&mut world_owner::Owned,bodies:&mut[Body],r:usize,dt:f64,specs:&BTreeMap<u32,Spec>,notices:&mut Vec<(u32,Handle,Notice)>)->Result<(),u32>{
    let Some(mut scene)=world.phase.take()else{return if bodies.get(r).and_then(|b|b.ship.as_ref()).is_some_and(|s|s.anchor_installed){Err(8)}else{Ok(())};};
    let result=early(&mut scene,world,bodies,r,dt,specs,notices);world.phase=Some(scene);result
}

/// Source clearInput clears held on every system, but interrupts only push.
/// This operation deliberately keeps targets, activation inputs and hold fire.
pub fn clear_held(world:&mut world_owner::Owned,bodies:&mut[Body],r:usize,specs:&BTreeMap<u32,Spec>)->Result<(),u32>{
    let b=bodies.get(r).ok_or(4u32)?;let w=b.ship.as_ref().and_then(|s|s.world.as_ref()).ok_or(8u32)?;
    if w.gravity_systems.is_empty(){return Ok(());}let h=b.handle;let ids=w.gravity_systems.clone();
    let owned=world.gravity.as_mut().ok_or(8u32)?;
    for sid in ids{let ident=crate::system_world::Identity{slot:h.slot,generation:h.generation};let meta=owned.owner.ships.iter_mut().find(|m|m.identity==ident).and_then(|m|m.systems.iter_mut().find(|s|s.id==sid)).ok_or(8u32)?;
        meta.held=false;let push=meta.kind==gravity_world::Kind::Push;if push{owned.owner.interrupt_ship(bodies[r].ship.as_mut().unwrap(),h,sid,specs).map_err(crate::gravity_runtime::error)?;}}
    Ok(())
}
/// All actual installed onInterrupt hooks, in allSystems order. Generic typed
/// definitions currently have no custom interrupt hook; gravity does.
pub fn deactivate(world:&mut world_owner::Owned,bodies:&mut[Body],r:usize,specs:&BTreeMap<u32,Spec>)->Result<(),u32>{
    let b=bodies.get_mut(r).ok_or(4u32)?;deactivate_ship(world.gravity.as_mut().map(|g|&mut g.owner),b.ship.as_mut().ok_or(8u32)?,b.handle,specs)
}
fn retreat_tree(world:&mut world_owner::Owned,bodies:&mut[Body],r:usize,specs:&BTreeMap<u32,Spec>,notices:&mut Vec<(u32,Handle,Notice)>,seen:&mut Vec<Handle>)->Result<(),u32>{
    let b=bodies.get(r).ok_or(4u32)?;if seen.contains(&b.handle){return Err(8);}seen.push(b.handle);let s=b.ship.as_ref().ok_or(8u32)?;
    if s.flags&(ship_state::DEAD|ship_state::RETREATED)!=0{return Ok(());}let children=s.world.as_ref().ok_or(8u32)?.children.clone();
    bodies[r].ship.as_mut().unwrap().flags|=ship_state::RETREATING|ship_state::RETREATED;
    for child in children{let cr=row(bodies,child)?;if bodies[cr].ship.as_ref().and_then(|s|s.world.as_ref()).ok_or(8u32)?.parent!=Some(bodies[r].handle){return Err(8);}
        retreat_tree(world,bodies,cr,specs,notices,seen)?;}
    bodies[r].motion[7..11].fill(0.0);bodies[r].ship.as_mut().and_then(|s|s.combat.as_mut()).and_then(|c|c.query.as_mut()).ok_or(8u32)?.trigger=false;
    clear_held(world,bodies,r,specs)?;let b=&mut bodies[r];let s=b.ship.as_mut().unwrap();let mut events=Vec::new();
    s.shield.as_mut().ok_or(8u32)?.set_active(false,&mut s.flux);s.sync_shield();
    s.flux_operation(8,0.0,false,&mut events);notices.extend(events.into_iter().map(|n|(b.id,b.handle,n)));
    deactivate(world,bodies,r,specs)?;let b=&mut bodies[r];b.motion[..4].copy_from_slice(&[0.0,-1_000_000.0,0.0,0.0]);
    b.ship.as_mut().unwrap().world.as_mut().ok_or(8u32)?.previous=[0.0,-1_000_000.0];Ok(())
}
pub fn retreat(world:&mut world_owner::Owned,bodies:&mut[Body],r:usize,specs:&BTreeMap<u32,Spec>,notices:&mut Vec<(u32,Handle,Notice)>)->Result<(),u32>{retreat_tree(world,bodies,r,specs,notices,&mut Vec::new())}

struct Services<'a>{owned:&'a Owned,world:&'a mut world_owner::Owned,specs:&'a BTreeMap<u32,Spec>,ship:Handle,pending:&'a mut f64,notices:&'a mut Vec<(u32,Handle,Notice)>}
impl a::Services for Services<'_>{
    fn phased(&self,bodies:&[Body],r:usize,state:&a::State)->Result<bool,a::Failure>{read(self.owned,bodies,r,self.specs,Some((self.ship,state)),&mut Vec::new()).map_err(|_|a::Failure::Host)}
    fn charge_cr_loss(&mut self,bodies:&mut[Body],r:usize,amount:f64)->Result<(),a::Failure>{if bodies.get(r).is_none_or(|b|b.handle!=self.ship)||!amount.is_finite()||amount<0.0{return Err(a::Failure::Host);}
        *self.pending+=amount;if !self.pending.is_finite(){return Err(a::Failure::InvalidNumber);}Ok(())}
    fn deactivate_systems(&mut self,bodies:&mut[Body],r:usize,specs:&BTreeMap<u32,Spec>)->Result<(),a::Failure>{deactivate(self.world,bodies,r,specs).map_err(|_|a::Failure::Host)}
    fn retreat(&mut self,bodies:&mut[Body],r:usize,specs:&BTreeMap<u32,Spec>)->Result<(),a::Failure>{retreat(self.world,bodies,r,specs,self.notices).map_err(|_|a::Failure::Host)}
}

/// Call synchronously after the real applyHullDamage eligibility check and
/// before HP write, including critical malfunction and armor-generated damage.
pub fn before_hull(owned:&mut Owned,world:&mut world_owner::Owned,bodies:&mut[Body],r:usize,damage:f64,specs:&BTreeMap<u32,Spec>,notices:&mut Vec<(u32,Handle,Notice)>)->Result<bool,u32>{
    let ship=bodies.get(r).ok_or(4u32)?.handle;let Some(i)=owned.entries.iter().position(|e|e.ship==ship)else{return Ok(false);};
    let mut state=owned.entries[i].state.clone();let mut pending=owned.entries[i].pending_cr;let mut encounter=owned.encounter;let mut sounds=Vec::new();
    let mut host=Services{owned,world,specs,ship,pending:&mut pending,notices};
    let result=state.before_hull(bodies,r,&mut encounter,damage,specs,&mut host,&mut sounds).map_err(error);
    // Always restore the taken listener bookkeeping; the whole-world caller
    // restores physical/resource writes too if any synchronous service failed.
    owned.entries[i].state=state;owned.entries[i].pending_cr=pending;owned.encounter=encounter;owned.sounds.extend(sounds);result
}
/// Early hullmod listener clock uses the exact source world dt supplied for
/// this queued ship, before its readiness/system/live-modifier state advance.
pub fn early(owned:&mut Owned,world:&mut world_owner::Owned,bodies:&mut[Body],r:usize,dt:f64,specs:&BTreeMap<u32,Spec>,notices:&mut Vec<(u32,Handle,Notice)>)->Result<(),u32>{
    if !dt.is_finite()||dt<0.0{return Err(8);}let ship=bodies.get(r).ok_or(4u32)?.handle;
    let Some(i)=owned.entries.iter().position(|e|e.ship==ship)else{return Ok(());};
    let mut state=owned.entries[i].state.clone();let mut pending=owned.entries[i].pending_cr;let mut sounds=Vec::new();
    let mut host=Services{owned,world,specs,ship,pending:&mut pending,notices};
    let result=state.advance(bodies,r,dt,specs,&mut host,&mut sounds).map_err(error);
    owned.entries[i].state=state;owned.entries[i].pending_cr=pending;owned.sounds.extend(sounds);result
}
