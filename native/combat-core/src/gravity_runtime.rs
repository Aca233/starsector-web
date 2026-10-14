//! Shared-world scheduling of resident gravity. No host rule imports.
use crate::{battle::Ordnance,gravity_owner as o,gravity_world as g,lifecycle::Spec,random::Random,
    ship_effects as e,ship_state::{self,Notice},state::{Body,Handle},system_world::Identity,world_owner as w};
use std::collections::BTreeMap;
fn id(h:Handle)->Identity{Identity{slot:h.slot,generation:h.generation}}
fn row(b:&[Body],h:Identity)->Result<usize,u32>{b.iter().position(|b|id(b.handle)==h).ok_or(4)}
pub fn error(e:g::Error)->u32{match e{g::Error::Stale=>4,_=>8}}
#[derive(Clone,Default)]pub struct Owned{pub owner:o::Owned,pub environments:Vec<(g::BodyKind,f64,Identity)>,pub next_environment:u32}
impl Owned{
    pub fn install(world:&w::Owned,bodies:&[Body])->Result<Self,u32>{let mut out=Self::default();
        for m in &world.terrain.ships{let i=world.terrain.row(bodies,m.identity)?;let b=&bodies[i];let c=b.ship.as_ref().and_then(|s|s.combat.as_ref()).ok_or(8u32)?;
            let module=m.module.as_ref().map(|m|{let p=world.terrain.row(bodies,m.parent)?;Ok::<_,u32>(o::ModulePose{parent:id(bodies[p].handle),offset:m.offset,angle:m.angle,independent_rotation:m.independent})}).transpose()?;
            let children=m.children.iter().map(|h|world.terrain.row(bodies,*h).map(|i|id(bodies[i].handle))).collect::<Result<_,_>>()?;
            out.owner.ships.push(o::ShipMeta{identity:id(m.handle),name:m.stable_id.clone(),mass:m.mass,fixed:m.station,module_hull:c.size!=0&&module.is_some(),module,children,systems:Vec::new(),mounts:Vec::new()});
        }out.owner.terrain=Some(Vec::new());out.import_terrain(world,bodies)?;Ok(out)
    }
    fn env_id(&mut self,kind:g::BodyKind,n:f64)->Result<Identity,u32>{if let Some((_,_,h))=self.environments.iter().find(|(k,id,_)|*k==kind&&*id==n){return Ok(*h);}
        self.next_environment=self.next_environment.checked_add(1).ok_or(5u32)?;let h=Identity{slot:self.next_environment,generation:1};self.environments.push((kind,n,h));Ok(h)}
    pub fn import_terrain(&mut self,world:&w::Owned,bodies:&[Body])->Result<(),u32>{let mut out=Vec::new();
        for a in &world.terrain.terrain.asteroids{let h=self.env_id(g::BodyKind::Asteroid,a.id.id)?;out.push(o::Environment{body:g::Environment{target:g::Target{kind:g::BodyKind::Asteroid,identity:h},numeric_id:a.id.id,
            position:a.position,velocity:a.velocity,radius:a.radius,mass:a.mass,fixed:a.fixed,alive:a.hp>0.0},facing:a.facing,offset:[0.0;2],bounds:Vec::new(),source_mass:0.0,source_bounds:Vec::new(),managed:false});}
        for h in &world.terrain.terrain.hulks{let identity=self.env_id(g::BodyKind::Hulk,h.id)?;let m=world.terrain.meta(h.source)?;let r=world.terrain.row(bodies,h.source)?;
            let c=bodies[r].ship.as_ref().and_then(|s|s.combat.as_ref()).ok_or(8u32)?;out.push(o::Environment{body:g::Environment{target:g::Target{kind:g::BodyKind::Hulk,identity},numeric_id:h.id,position:h.position,
                velocity:h.velocity,radius:h.radius,mass:0.0,fixed:h.fixed,alive:true},facing:h.facing,offset:h.offset,bounds:h.bounds.clone(),source_mass:m.mass,source_bounds:c.bounds.clone(),managed:h.managed});}
        self.owner.terrain=Some(out);Ok(())}
    pub fn export_terrain(&self,world:&mut w::Owned)->Result<(),u32>{for e in self.owner.terrain.as_ref().ok_or(8u32)?{match e.body.target.kind{
        g::BodyKind::Asteroid=>{let a=world.terrain.terrain.asteroids.iter_mut().find(|a|a.id.id==e.body.numeric_id).ok_or(4u32)?;a.velocity=e.body.velocity;},
        g::BodyKind::Hulk=>{let h=world.terrain.terrain.hulks.iter_mut().find(|h|h.id==e.body.numeric_id).ok_or(4u32)?;h.velocity=e.body.velocity;h.managed=e.managed;},_=>return Err(8)}}Ok(())}
    pub fn complete(&self,bodies:&[Body],ordnance:&Ordnance)->bool{let col=&self.owner.collation;
        let keys:Vec<_>=self.owner.ships.iter().map(|m|format!("SHIP:{}",m.name)).collect();
        let ranks:Vec<_>=col.keys.iter().map(|(_,r)|*r).collect();
        self.owner.complete(bodies,ordnance)&&keys.iter().all(|key|col.keys.iter().filter(|(k,_)|k==key).count()==1)
        &&ranks.iter().enumerate().all(|(i,r)|!ranks[..i].contains(r))
        &&["ASTEROID","HULK","PROJECTILE","SHIP"].iter().all(|p|col.prefixes.iter().filter(|(k,_)|k==p).count()==1)
        &&col.numeric_alphabet.as_ref().is_some_and(|a|a.len()==14&&"-.0123456789+e".chars().all(|c|a.iter().filter(|(ch,_)|*ch==c).count()==1))
        &&self.owner.ships.iter().all(|m|{
        let Ok(r)=row(bodies,m.identity)else{return false;};let Some(s)=bodies[r].ship.as_ref()else{return false;};
        !m.name.is_empty()&&m.mass.is_finite()&&m.mass>=0.0&&s.world.as_ref().is_some_and(|w|w.gravity_systems.len()==m.systems.len()&&w.gravity_systems.iter().all(|sid|m.systems.iter().any(|m|m.id==*sid))
            &&w.metas.iter().all(|(sid,meta)|!matches!(meta.kind,e::Kind::GravityWell|e::Kind::GravityBattleWell|e::Kind::GravityOther)||w.gravity_systems.contains(sid))
            &&w.gravity_mounts.len()==m.mounts.len()&&w.gravity_mounts.iter().all(|id|m.mounts.iter().any(|m|m.id==*id)))
        &&m.systems.iter().all(|a|!a.name.is_empty()&&match a.kind{g::Kind::Well|g::Kind::Repulsor|g::Kind::Release|g::Kind::BattleWell|g::Kind::BattleRepulsor=>a.field_spec.is_some_and(|f|f.radius>0.0&&f.duration>0.0)
                &&(a.kind!=g::Kind::BattleWell||a.collapse_spec.is_some()&&a.auto.is_some()),g::Kind::Collapse=>a.collapse_spec.is_some(),g::Kind::Maneuver=>a.maneuver_spec.is_some(),g::Kind::Push=>a.push_spec.is_some(),g::Kind::Polarity=>true})
        &&m.mounts.iter().all(|m|!m.name.is_empty()&&(m.tractor_spec.is_some()!=m.deflector_spec.is_some()))})}
}
pub struct Services<'a>{pub world:&'a mut w::Owned,pub specs:&'a BTreeMap<u32,Spec>,pub events:&'a mut Vec<(u32,Handle,Notice)>}
impl o::Destruction for Services<'_>{
    fn roster(&self,bodies:&[Body])->Result<Vec<usize>,u32>{self.world.rows(bodies)}
    fn phased(&self,bodies:&[Body],r:usize,specs:&BTreeMap<u32,Spec>)->Result<bool,u32>{crate::phase_runtime::phased_world(self.world,bodies,r,specs)}
    fn hull(&mut self,bodies:&mut[Body],r:usize,owned:&mut o::Owned,damage:f64,specs:&BTreeMap<u32,Spec>,events:&mut Vec<Notice>)->Result<f64,u32>{
        let mut notices=Vec::new();let result=crate::phase_runtime::hull_gravity(self.world,bodies,owned,r,damage,specs,&mut notices)?;
        events.extend(notices.into_iter().map(|(_,_,n)|n));Ok(result)
    }
    fn apply(&mut self,bodies:&mut[Body],r:usize,_:&mut o::Owned,ordnance:&mut Ordnance,random:&mut Random,visual:&mut Random,_:&mut Vec<o::Record>)->Result<(),u32>{
        let mut host=w::Host{bodies,ordnance,specs:self.specs,owned:self.world,events:self.events};host.destroy(r,random,visual)?;host.finish()}
    fn record(&mut self,bodies:&[Body],event:&o::Record,visual:&mut Random)->Result<(),u32>{match event{
        o::Record::Notice{body,handle,notice}=>{self.world.visual.notices(std::slice::from_ref(notice))?;self.events.push((*body,*handle,notice.clone()));},
        o::Record::Damage{owner,target,area,value}=>{let r=row(bodies,*owner)?;let t=row(bodies,*target)?;let player=bodies[r].ship.as_ref().and_then(|s|s.combat.as_ref()).ok_or(8u32)?.player.unwrap_or(false);
            let target=bodies[t].ship.as_ref().and_then(|s|s.combat.as_ref()).ok_or(8u32)?.player;let layer=match area{0=>crate::world_damage::Layer::Shield,1=>crate::world_damage::Layer::Armor,2=>crate::world_damage::Layer::Hull,_=>return Err(8)};
            self.world.stats.damage(player,0,*value,layer,0.0,target);},
        o::Record::Ripple{point,size}=>self.world.emit(w::Output::Terrain(crate::terrain_world::Output::Ripple{point:*point,radius:*size,color:[65,175,215]})),
        o::Record::Sparks{target,local,armor,particles}=>{let r=row(bodies,*target)?;self.world.particles.extend(particles.iter().map(|_|1.0));self.world.emit(w::Output::Death(crate::world_damage::Output::ArmorParticles{source:w::identity(&bodies[r]),local:*local,damage:*armor,particles:particles.clone()}));},
        o::Record::Floating{point,value}=>crate::weapon_world::floating_damage(self.world,*point,*value,[100,215,235],visual),
    }Ok(())}
}
fn sync_flags(owned:&o::Owned,bodies:&mut[Body])->Result<(),u32>{for m in &owned.ships{let r=row(bodies,m.identity)?;let w=bodies[r].ship.as_mut().and_then(|s|s.world.as_mut()).ok_or(8u32)?;
    w.gravity_collapsed=m.systems.iter().filter(|s|s.field.as_ref().is_some_and(|f|f.kind==g::FieldKind::Collapse)).map(|s|s.id).collect();}Ok(())}
fn sync_ship_flags(owned:&o::Owned,bodies:&mut[Body],r:usize)->Result<(),u32>{let m=owned.ship(id(bodies[r].handle)).map_err(error)?;
    bodies[r].ship.as_mut().and_then(|s|s.world.as_mut()).ok_or(8u32)?.gravity_collapsed=m.systems.iter().filter(|s|s.field.as_ref().is_some_and(|f|f.kind==g::FieldKind::Collapse)).map(|s|s.id).collect();Ok(())}
pub fn interrupt(world:&mut w::Owned,bodies:&mut[Body],specs:&BTreeMap<u32,Spec>,owner:Handle,sid:Option<u32>,reset:bool)->Result<(),u32>{
    let Some(runtime)=world.gravity.as_mut()else{return Ok(());};let mut c=runtime.owner.hydrate(bodies,specs).map_err(error)?;let h=id(owner);
    for s in c.slots.iter_mut().filter(|s|s.owner==h&&sid.is_none_or(|id|id==s.lifecycle.id)){if reset{s.reset();}else{s.interrupt();}}
    if sid.is_none(){for m in c.mounts.iter_mut().filter(|m|m.owner==h){m.release("牵引中断");}}
    runtime.owner.restore(bodies,c).map_err(error)?;sync_flags(&runtime.owner,bodies)
}
pub fn query_inputs(world:&w::Owned,bodies:&mut[Body])->Result<(),u32>{let Some(runtime)=&world.gravity else{return Ok(());};
    for meta in &runtime.owner.ships{let r=row(bodies,meta.identity)?;let s=bodies[r].ship.as_mut().ok_or(8u32)?;
        for m in &meta.mounts{let i=s.weapons.as_ref().ok_or(8u32)?.mounts.iter().position(|mount|mount.data[0]==m.id as f64).ok_or(8u32)?;
            s.combat.as_mut().ok_or(8u32)?.fire[i].query.as_mut().ok_or(8u32)?.heldcontact=m.tractor.as_ref().filter(|t|t.phase==g::Phase::Hold).map(|t|t.contact);}}
    Ok(())}
pub fn prepare(world:&mut w::Owned,bodies:&mut[Body],ordnance:&mut Ordnance,r:usize,specs:&BTreeMap<u32,Spec>,dt:f64,random:&mut Random,visual:&mut Random,events:&mut Vec<(u32,Handle,Notice)>)->Result<(),u32>{
    let Some(mut owned)=world.gravity.take()else{return Err(8);};let result=(||{
        let effective=bodies[r].ship.as_mut().ok_or(8u32)?.begin_clock(dt)?;if !bodies[r].ship.as_ref().unwrap().can_advance(){return Ok(());}
        let h=id(bodies[r].handle);let ids:Vec<_>=bodies[r].ship.as_ref().unwrap().systems.iter().map(|s|s.id).collect();let gravity=!owned.owner.ship(h).map_err(error)?.systems.is_empty();
        if gravity{owned.import_terrain(world,bodies)?;owned.owner.reconcile_projectiles(ordnance).map_err(error)?;}
        let mut records=Vec::new();
        for (index,sid) in ids.iter().copied().enumerate(){if let Some(mut slot)=owned.owner.read_slot(bodies,r,sid,specs).map_err(error)?{
            let mut host=o::Host{bodies,ordnance,owned:&mut owned.owner,specs,random,visual,records:&mut records,destruction:Services{world,specs,events}};
            let ship=host.observe_ship(r).map_err(error)?;slot.cancel_before_update(&ship,dt);slot.update(&mut host,effective).map_err(error)?;
            host.owned.restore_slot(host.bodies,slot).map_err(error)?;
        }else{let mut notices=Vec::new();bodies[r].ship.as_mut().unwrap().begin_system(index,specs,&mut notices)?;world.visual.notices(&notices)?;let b=&bodies[r];events.extend(notices.into_iter().map(|n|(b.id,b.handle,n)));}}
        if gravity{sync_ship_flags(&owned.owner,bodies,r)?;}let mut notices=Vec::new();bodies[r].ship.as_mut().unwrap().begin_readiness(specs,random,&mut notices)?;world.visual.notices(&notices)?;let b=&bodies[r];events.extend(notices.into_iter().map(|n|(b.id,b.handle,n)));
        if gravity{let flamed=bodies[r].ship.as_ref().unwrap().flags&ship_state::FLAMED!=0;let ship={let host=o::Host{bodies,ordnance,owned:&mut owned.owner,specs,random,visual,records:&mut records,destruction:Services{world,specs,events}};host.observe_ship(r).map_err(error)?};
            for sid in ids{if let Some(mut slot)=owned.owner.read_slot(bodies,r,sid,specs).map_err(error)?{if slot.lifecycle.disabled{slot.interrupt();}slot.cancel_after_readiness(&ship,flamed);owned.owner.restore_slot(bodies,slot).map_err(error)?;}}
            sync_ship_flags(&owned.owner,bodies,r)?;}Ok(())
    })();world.gravity=Some(owned);result
}
pub fn dispatch(world:&mut w::Owned,bodies:&mut[Body],ordnance:&mut Ordnance,specs:&BTreeMap<u32,Spec>,dt:f64,random:&mut Random,visual:&mut Random,events:&mut Vec<(u32,Handle,Notice)>)->Result<(),u32>{
    let mut owned=world.gravity.take();let result=(||{if let Some(g)=&mut owned{g.import_terrain(world,bodies)?;g.owner.reconcile_projectiles(ordnance).map_err(error)?;}
        for r in world.rows(bodies)?{let s=bodies[r].ship.as_ref().ok_or(8u32)?;if s.flags&(ship_state::DEAD|ship_state::RETREATED|ship_state::DOCKED)!=0{continue;}let effective=dt*s.subjective_multiplier();let h=id(bodies[r].handle);let ids:Vec<_>=s.systems.iter().map(|s|s.id).collect();
            for sid in ids{let gravity=owned.as_ref().is_some_and(|g|g.owner.ships.iter().any(|m|m.identity==h&&m.systems.iter().any(|m|m.id==sid)));
                if gravity{let g=owned.as_mut().unwrap();let mut c=g.owner.hydrate_world(world,bodies,specs).map_err(error)?;let k=c.slots.iter().position(|s|s.owner==h&&s.lifecycle.id==sid).ok_or(8u32)?;
                    let mut records=Vec::new();let mut host=o::Host{bodies,ordnance,owned:&mut g.owner,specs,random,visual,records:&mut records,destruction:Services{world,specs,events}};
                    c.dispatch_slot(k,&mut host).map_err(error)?;host.owned.restore(host.bodies,c).map_err(error)?;
                }else{let mut slot=crate::system_owner::slot(bodies[r].ship.as_ref().unwrap(),bodies[r].handle,sid,specs)?;let event_start=events.len();let mut host=crate::system_owner::Host{bodies,specs,ordnance,random,events,asteroids:Some(&world.terrain.terrain.asteroids)};slot.dispatch(&mut host,effective).map_err(crate::system_owner::error)?;world.visual.system_notices(&events[event_start..])?;crate::system_owner::restore(bodies[r].ship.as_mut().unwrap(),slot)?;}}
            crate::system_owner::repair(bodies[r].ship.as_mut().unwrap(),dt);
            // Source status dispatches this ship's hullmods before the next ship.
            // Put the sole gravity owner back while Aux synchronously registers mine identities.
            world.gravity=owned.take();let status=crate::aux_runtime::status(world,bodies,ordnance,specs,r,dt,random,visual,events);owned=world.gravity.take();status?;
        }if let Some(g)=&owned{sync_flags(&g.owner,bodies)?;g.export_terrain(world)?;}Ok(())
    })();world.gravity=owned;result
}
/// Production status barrier: captured component order, each source system and
/// hullmod, then that same ship's damage/weapon/engine feedback. New drones are
/// synchronously admitted but never appended to this captured component list.
pub fn dispatch_with_flight(world:&mut w::Owned,bodies:&mut Vec<Body>,ordnance:&mut Ordnance,specs:&BTreeMap<u32,Spec>,dt:f64,
    player:Handle,random:&mut Random,visual:&mut Random,events:&mut Vec<(u32,Handle,Notice)>,authority:&mut crate::flight_admission::Owned)->Result<Vec<crate::scene_owner::Radio>,u32>{
    if !dt.is_finite()||dt<0.0{return Err(7);}let components=world.rows(bodies)?.into_iter().map(|r|bodies[r].handle).collect::<Vec<_>>();
    let mut radio=Vec::new();for handle in components{let r=row(bodies,id(handle))?;let s=bodies[r].ship.as_ref().ok_or(8u32)?;
        if s.flags&ship_state::DOCKED!=0{continue;}
        if s.flags&(ship_state::DEAD|ship_state::RETREATED)==0{
            let ids=s.systems.iter().map(|s|s.id).collect::<Vec<_>>();for sid in ids{
                // Source evaluates subjectiveTimeMultiplier at each dispatch,
                // after any earlier system's real runtime modifier changes.
                let mods=crate::system_owner::modifiers(bodies,r,specs)?;bodies[r].ship.as_mut().unwrap().live=mods;
                let effective=dt*bodies[r].ship.as_ref().unwrap().subjective_multiplier();if !effective.is_finite()||effective<0.0{return Err(7);}
                let carrier=crate::tactical_ai::Identity{handle:handle.slot,generation:handle.generation};
                if world.flight.as_ref().ok_or(8u32)?.drone.has(carrier,sid){
                    let mut flight=world.flight.take().ok_or(8u32)?;let mut c=crate::flight_runtime::Context{bodies,world,ordnance,specs,random,visual,notices:events,authority};
                    let result=flight.dispatch_drone(&mut c,carrier,sid,effective).map_err(crate::flight_runtime::error);world.flight=Some(flight);result?;
                }else if world.gravity.as_ref().is_some_and(|g|g.owner.ships.iter().any(|m|m.identity==id(handle)&&m.systems.iter().any(|m|m.id==sid))){
                    let mut owned=world.gravity.take().ok_or(8u32)?;let result=(||{
                        owned.import_terrain(world,bodies)?;owned.owner.reconcile_projectiles(ordnance).map_err(error)?;
                        let mut c=owned.owner.hydrate_world(world,bodies,specs).map_err(error)?;
                        let k=c.slots.iter().position(|s|s.owner==id(handle)&&s.lifecycle.id==sid).ok_or(8u32)?;let mut records=Vec::new();
                        let mut host=o::Host{bodies,ordnance,owned:&mut owned.owner,specs,random,visual,records:&mut records,destruction:Services{world,specs,events}};
                        c.dispatch_slot(k,&mut host).map_err(error)?;host.owned.restore(host.bodies,c).map_err(error)?;
                        sync_flags(&owned.owner,bodies)?;owned.export_terrain(world)
                    })();world.gravity=Some(owned);result?;
                }else{
                    let mut slot=crate::system_owner::slot(bodies[r].ship.as_ref().unwrap(),handle,sid,specs)?;
                    let event_start=events.len();
                    let mut host=crate::system_owner::Host{bodies,specs,ordnance,random,events,asteroids:Some(&world.terrain.terrain.asteroids)};
                    slot.dispatch(&mut host,effective).map_err(crate::system_owner::error)?;world.visual.system_notices(&events[event_start..])?;crate::system_owner::restore(bodies[r].ship.as_mut().unwrap(),slot)?;
                }
            }
            crate::system_owner::repair(bodies[r].ship.as_mut().unwrap(),dt);
            crate::aux_runtime::status(world,bodies,ordnance,specs,r,dt,random,visual,events)?;
        }
        let mods=crate::system_owner::modifiers(bodies,r,specs)?;bodies[r].ship.as_mut().unwrap().live=mods;
        radio.extend(crate::combat_visuals::status_components(world,bodies,&[handle],player,events,world.time,visual)?);
    }
    Ok(radio)
}
pub fn fields(world:&mut w::Owned,bodies:&mut[Body],ordnance:&mut Ordnance,specs:&BTreeMap<u32,Spec>,dt:f64,random:&mut Random,visual:&mut Random,events:&mut Vec<(u32,Handle,Notice)>)->Result<(),u32>{
    let Some(mut owned)=world.gravity.take()else{return Ok(());};let result=(||{owned.import_terrain(world,bodies)?;owned.owner.reconcile_projectiles(ordnance).map_err(error)?;let mut c=owned.owner.hydrate_world(world,bodies,specs).map_err(error)?;let mut records=Vec::new();
        let mut host=o::Host{bodies,ordnance,owned:&mut owned.owner,specs,random,visual,records:&mut records,destruction:Services{world,specs,events}};
        c.advance_fields(&mut host,dt).map_err(error)?;host.owned.restore(host.bodies,c.clone()).map_err(error)?;
        // With no live slots and no tidal weapon spec, this pass only builds
        // observations: no loop body can write a controller, world fact or RNG.
        if !c.slots.is_empty()||c.mounts.iter().any(|m|m.tractor_spec.is_some_and(|s|s.tidal_damage.is_some_and(|n|n!=0.0))){c.advance_damage(&mut host,dt).map_err(error)?;}
        host.owned.restore(host.bodies,c).map_err(error)?;
        sync_flags(&owned.owner,bodies)?;owned.export_terrain(world)
    })();world.gravity=Some(owned);result
}
pub fn weapons(world:&mut w::Owned,bodies:&mut[Body],ordnance:&mut Ordnance,specs:&BTreeMap<u32,Spec>,dt:f64,random:&mut Random,visual:&mut Random,events:&mut Vec<(u32,Handle,Notice)>)->Result<(),u32>{
    weapons_selected(world,bodies,ordnance,specs,dt,None,random,visual,events)
}
pub fn weapons_selected(world:&mut w::Owned,bodies:&mut[Body],ordnance:&mut Ordnance,specs:&BTreeMap<u32,Spec>,dt:f64,selected:Option<(Handle,u32)>,random:&mut Random,visual:&mut Random,events:&mut Vec<(u32,Handle,Notice)>)->Result<(),u32>{
    let Some(mut owned)=world.gravity.take()else{return Ok(());};let result=(||{owned.import_terrain(world,bodies)?;owned.owner.reconcile_projectiles(ordnance).map_err(error)?;let mut c=owned.owner.hydrate_world(world,bodies,specs).map_err(error)?;
        for i in 0..c.mounts.len(){if c.mounts[i].tractor_spec.is_none(){continue;}let r=row(bodies,c.mounts[i].owner)?;let s=bodies[r].ship.as_ref().ok_or(8u32)?;if !s.can_advance(){continue;}
            if selected.is_some_and(|(h,id)|bodies[r].handle!=h||c.mounts[i].id!=id){continue;}
            let mount=s.weapons.as_ref().ok_or(8u32)?.mounts.iter().position(|m|m.data[0]==c.mounts[i].id as f64).ok_or(8u32)?;
            let trigger=s.combat.as_ref().ok_or(8u32)?.fire.get(mount).ok_or(8u32)?.input.requested;let effective=s.clock[5];let mut records=Vec::new();let mut host=o::Host{bodies,ordnance,owned:&mut owned.owner,specs,random,visual,records:&mut records,destruction:Services{world,specs,events}};
            c.tractor_input(i,&mut host,effective,trigger).map_err(error)?;host.owned.restore(host.bodies,c.clone()).map_err(error)?;
        }owned.export_terrain(world)
    })();world.gravity=Some(owned);let _=dt;result
}
pub fn command(world:&mut w::Owned,bodies:&mut[Body],ordnance:&mut Ordnance,specs:&BTreeMap<u32,Spec>,r:usize,sid:u32,input:e::ActivationInput,random:&mut Random,visual:&mut Random,events:&mut Vec<(u32,Handle,Notice)>)->Result<bool,u32>{
    let Some(mut owned)=world.gravity.take()else{return Err(8);};let result=(||{owned.import_terrain(world,bodies)?;owned.owner.reconcile_projectiles(ordnance).map_err(error)?;let mut c=owned.owner.hydrate_world(world,bodies,specs).map_err(error)?;
        let k=c.slots.iter().position(|s|s.owner==id(bodies[r].handle)&&s.lifecycle.id==sid).ok_or(8u32)?;let mut records=Vec::new();let mut host=o::Host{bodies,ordnance,owned:&mut owned.owner,specs,random,visual,records:&mut records,destruction:Services{world,specs,events}};
        let accepted=match c.command(k,&host,input){Ok(())=>true,Err(g::Error::Stale|g::Error::Host|g::Error::Unsupported)=>return Err(8),Err(_)=>false};host.owned.restore(host.bodies,c).map_err(error)?;sync_flags(&owned.owner,bodies)?;Ok(accepted)
    })();world.gravity=Some(owned);result
}
pub fn held(world:&mut w::Owned,bodies:&mut[Body],ordnance:&mut Ordnance,specs:&BTreeMap<u32,Spec>,r:usize,hold:bool,push:bool,random:&mut Random,visual:&mut Random,events:&mut Vec<(u32,Handle,Notice)>)->Result<(),u32>{
    let Some(mut owned)=world.gravity.take()else{return Err(8);};let result=(||{owned.import_terrain(world,bodies)?;owned.owner.reconcile_projectiles(ordnance).map_err(error)?;let mut c=owned.owner.hydrate_world(world,bodies,specs).map_err(error)?;let h=id(bodies[r].handle);
        let manual=bodies[r].ship.as_ref().and_then(|s|s.combat.as_ref()).ok_or(8u32)?.attrs[19]!=1.0;c.control_hold(h,hold,manual);let mut records=Vec::new();let host=o::Host{bodies,ordnance,owned:&mut owned.owner,specs,random,visual,records:&mut records,destruction:Services{world,specs,events}};
        c.push_hold(h,push,manual,&host).map_err(error)?;host.owned.restore(host.bodies,c).map_err(error)?;sync_flags(&owned.owner,bodies)
    })();world.gravity=Some(owned);result
}
