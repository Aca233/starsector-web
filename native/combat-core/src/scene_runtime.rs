//! Source CombatEngine and ShipStepBatch barriers over the sole Rust world.
//! Core commits this draft, its allocator, and both RNGs together on success.
use crate::{ai_resident,battle::{self,Ordnance},contact,engine,fire_query,
    flight_runtime::{self as flight,Context,Stage,MissileScope},flight_admission,lifecycle::Spec,
    motion,motion_owner,random::Random,scene_control,scene_owner::Owned,
    ship_effects,ship_state::{self,Notice},state::{Body,Handle},tactical_ai,world_owner};
use std::collections::BTreeMap;
fn row(b:&[Body],h:Handle)->Result<usize,u32>{b.iter().position(|b|b.handle==h).ok_or(4)}
fn handle(h:tactical_ai::Identity)->Handle{Handle{slot:h.handle,generation:h.generation}}
fn identity(h:Handle)->tactical_ai::Identity{tactical_ai::Identity{handle:h.slot,generation:h.generation}}
pub fn flush_audio(o:&mut Owned,w:&mut world_owner::Owned)->Result<(),u32>{
    for a in o.audio.drain(..){w.visual.play(&a.key,a.volume,1.0,None,false)?;}Ok(())
}
fn roster(f:&flight::Owned,b:&[Body])->Result<Vec<Handle>,u32>{Ok(f.roster(b).map_err(flight::error)?.into_iter().map(handle).collect())}
fn target(b:&[Body],h:Handle,scope:&[Handle])->Result<Option<Handle>,u32>{
    let r=row(b,h)?;let s=b[r].ship.as_ref().ok_or(8u32)?;let c=s.combat.as_ref().ok_or(8u32)?;let q=c.query.as_ref().ok_or(8u32)?;
    let eligible=|h:Handle|->Result<bool,u32>{let other=b[row(b,h)?].ship.as_ref().ok_or(8u32)?;let oc=other.combat.as_ref().ok_or(8u32)?;
        Ok(other.flags&ship_state::DEAD==0&&oc.team!=c.team&&oc.query.as_ref().ok_or(8u32)?.visible.get(&c.team)==Some(&true)&&!oc.query.as_ref().unwrap().vast)};
    if c.attrs[19]!=1.0{return q.target.filter(|h|scope.contains(h)).map_or(Ok(None),|h|Ok(if eligible(h)?{Some(h)}else{None}));}
    if let Some(h)=q.target{let other=b[row(b,h)?].ship.as_ref().ok_or(8u32)?;let oc=other.combat.as_ref().ok_or(8u32)?;
        if other.flags&ship_state::DEAD==0&&oc.query.as_ref().ok_or(8u32)?.visible.get(&c.team)==Some(&true){return Ok(Some(h));}}
    let mut candidates=Vec::new();for h in scope{if eligible(*h)?{candidates.push(*h);}}
    let main=candidates.iter().any(|h|b[row(b,*h).unwrap()].ship.as_ref().unwrap().combat.as_ref().unwrap().size!=0);
    let mut best=None;let mut distance=f64::INFINITY;for h in candidates{let other=&b[row(b,h)?];if main&&other.ship.as_ref().unwrap().combat.as_ref().unwrap().size==0{continue;}
        let d=contact::length([other.motion[0]-b[r].motion[0],other.motion[1]-b[r].motion[1]]);if best.is_none()||d<distance{best=Some(h);distance=d;}}Ok(best)
}
fn ai(o:&Owned,b:&mut[Body],w:&mut world_owner::Owned,ordnance:&mut Ordnance,specs:&BTreeMap<u32,Spec>,dt:f64,random:&mut Random,visual:&mut Random,events:&mut Vec<(u32,Handle,Notice)>)->Result<(),u32>{
    let active=scene_control::active(w,b)?;let capitals=o.capital(b)?;
    let mut roots=Vec::new();if capitals.contains(&o.enemy){roots.push(o.enemy);}roots.extend(capitals.iter().copied().filter(|h|*h!=o.enemy&&*h!=o.player));
    let compact=roots.len()>=4;let mut entries=Vec::new();let mut manual=Vec::new();
    for h in roots{if !o.externally_controlled.contains(&h){entries.push(scene_control::entry(o,b,w,h,dt,compact,active.len()>=8)?);}}
    for root in &capitals{for h in scene_control::assembly(b,*root)?.into_iter().skip(1){
        if !active.contains(&h){continue;}entries.push(scene_control::entry(o,b,w,h,dt,false,active.len()>=8)?);
        let s=b[row(b,h)?].ship.as_ref().ok_or(8u32)?;
        if o.seats.is_none()&&*root==o.player&&h==o.manual_weapon&&s.can_advance()&&s.combat.as_ref().ok_or(8u32)?.attrs[19]!=1.0{
            manual.push(ai_resident::Manual{owner:ai_resident::identity(h).map_err(|_|4u32)?,player_target:o.player_target});}
    }}
    let mut excluded:Vec<_>=o.externally_controlled.iter().copied().filter(|h|active.contains(h)).collect();
    if let Some(seats)=&o.seats{manual=seats.manual(b)?;}
    if o.seats.is_none()&&active.contains(&o.player)&&b[row(b,o.player)?].ship.as_ref().ok_or(8u32)?.combat.as_ref().ok_or(8u32)?.attrs[19]!=1.0&&!excluded.contains(&o.player){excluded.push(o.player);}
    let mut ai=w.ai.take().ok_or(8u32)?;let result=(||{o.sync_ai_orders(b,&mut ai)?;
        ai.phase_with_fleet(&mut ai_resident::Resident{bodies:b,ordnance,specs,world:w,random,visual,events},&entries,&active,&manual,&excluded,true,&mut ai_resident::Scratch::default()).map_err(|_|8u32)
    })();w.ai=Some(ai);result
}
struct Prepared{row:usize,before:[f64;motion::WIDTH],integrated:[f64;motion::WIDTH],dt:f64,ready:bool}
fn prepare(o:&Owned,b:&mut[Body],w:&mut world_owner::Owned,ordnance:&mut Ordnance,specs:&BTreeMap<u32,Spec>,q:&flight::Queued,random:&mut Random,visual:&mut Random,events:&mut Vec<(u32,Handle,Notice)>)->Result<Prepared,u32>{
    let r=row(b,handle(q.step.craft))?;let dt=q.step.dt;
    if let Some(c)=b[r].ship.as_mut().and_then(|s|s.combat.as_mut()){c.graviton_multiplier=c.graviton.advance(dt).unwrap_or(1.0);}
    // Maneuver jets measure from the listener boundary, before hullmods and
    // deployment criticals. Render interpolation has a later pose boundary.
    let before=b[r].motion;
    crate::phase_runtime::early_world(w,b,r,dt,specs,events)?;crate::system_owner::early(b,r,dt)?;
    let mods=crate::system_owner::modifiers(b,r,specs)?;b[r].ship.as_mut().ok_or(8u32)?.live=mods;
    let scope:Vec<_>=q.ships.iter().copied().map(handle).collect();
    // Deployment listener comes before the live/dead gate. Once the source
    // prepares a ship its captured target and scope are used throughout.
    crate::readiness_owner::deployment_world(w,b,r,dt,specs,random,visual,events)?;
    let initially_live=b[r].ship.as_ref().ok_or(8u32)?.can_advance();
    if initially_live{let target=q.step.target.map(handle);let previous=b[r].motion;let s=b[r].ship.as_mut().unwrap();
        let sw=s.world.as_mut().ok_or(8u32)?;sw.previous=[previous[0],previous[1]];sw.previous_facing=previous[4];
        let query=s.combat.as_mut().and_then(|c|c.query.as_mut()).ok_or(8u32)?;query.target=target;query.scope=scope.clone();query.expected_scope=scope.len();}
    crate::system_owner::cancel(b,r,specs,ordnance,dt,false,random,events)?;
    let ready=b[r].ship.as_ref().ok_or(8u32)?.can_advance();
    if ready{motion_owner::sync(w,b,r,specs,events)?;
        crate::readiness_owner::peak_world(b,r,dt,&scope)?;
        w.visual.ship_prepare(b[r].handle,dt,b[r].ship.as_ref().unwrap().flux.boost)?;
        crate::gravity_runtime::prepare(w,b,ordnance,r,specs,dt,random,visual,events)?;
        crate::system_owner::cancel(b,r,specs,ordnance,dt,true,random,events)?;
        let mods=crate::system_owner::modifiers(b,r,specs)?;b[r].ship.as_mut().unwrap().live=mods;
        o.prelude.as_ref().ok_or(8u32)?.prepare_ship(b,r)?;
        let mut notices=Vec::new();b[r].ship.as_mut().unwrap().finish_advance(specs,&mut notices)?;
        w.visual.notices(&notices)?;events.extend(notices.into_iter().map(|n|(b[r].id,b[r].handle,n)));}
    Ok(Prepared{row:r,before,integrated:b[r].motion,dt,ready})
}
fn motion_stage(b:&mut[Body],w:&mut world_owner::Owned,specs:&BTreeMap<u32,Spec>,p:&mut Prepared,events:&mut Vec<(u32,Handle,Notice)>)->Result<(),u32>{
    if !p.ready{return Ok(());}let r=p.row;motion_owner::sync(w,b,r,specs,events)?;
    let s=b[r].ship.as_ref().ok_or(8u32)?;let effective=s.clock[5];
    let e=s.engines.as_ref().ok_or(8u32)?;if e.data[19]!=1.0{return Err(8);}
    let ready=e.data[4]==engine::READY;let mut pose=b[r].motion;
    motion_owner::stats(Some(w),b,r,&mut pose,&s.live)?;
    pose[motion::FLAGS]=((pose[motion::FLAGS]as u32&!1)|if ready{0}else{1})as f64;b[r].motion=pose;
    motion_owner::advance(Some(w),b,r,specs,effective)?;
    // Source integrateStep captures this before any weapon recoil or later
    // module synchronization. Finish consumes the same accepted motion sample.
    p.integrated=b[r].motion;b[r].ship.as_mut().unwrap().finish_shield(&b[r].motion)
}
fn synchronize(o:&Owned,b:&mut[Body],w:&mut world_owner::Owned,specs:&BTreeMap<u32,Spec>,events:&mut Vec<(u32,Handle,Notice)>)->Result<(),u32>{
    for root in o.capital(b)?{for h in scene_control::assembly(b,root)?.into_iter().skip(1){motion_owner::sync(w,b,row(b,h)?,specs,events)?;}}Ok(())
}
fn fire_cadence(o:&Owned,b:&mut[Body],w:&world_owner::Owned,queue:&[fire_query::Queued])->Result<(),u32>{
    let player_root=w.terrain.root(crate::terrain_owner::identity(&b[row(b,o.player)?]))?;
    for entry in queue{let r=row(b,entry.owner)?;let root=w.terrain.root(crate::terrain_owner::identity(&b[r]))?;let rr=w.terrain.row(b,root)?;
        let root_ai=b[rr].ship.as_ref().and_then(|s|s.combat.as_ref()).ok_or(8u32)?.attrs[19]==1.0;
        let root_handle=b[rr].handle;let full_rate=o.full_rate.contains(&root_handle)||o.full_rate.contains(&entry.owner)
            ||o.multirate&&(o.externally_controlled.contains(&root_handle)||o.externally_controlled.contains(&entry.owner));
        let s=b[r].ship.as_mut().ok_or(8u32)?;let guns=s.weapons.as_ref().ok_or(8u32)?;let c=s.combat.as_mut().ok_or(8u32)?;
        let sample=(o.multirate||o.profile==2)&&entry.dt>0.0&&guns.data[19]!=1.0&&c.attrs[19]==1.0&&root!=player_root&&root_ai&&!full_rate&&c.size!=0;
        for e in &mut c.fire{let q=e.query.as_mut().ok_or(8u32)?;let delivery=e.delivery.as_ref().ok_or(8u32)?;
            q.cadence=if sample&&(q.sample_native||o.multirate&&o.seats.is_some())&&!e.spec.rocket&&delivery.spawn_type!=4&&q.flags&(16|32)==0&&(o.multirate||q.sample_hz20){
                Some(if o.multirate{crate::fire_control::CadenceMode::Multirate}else{crate::fire_control::CadenceMode::Hz20})}else{None};
        }
    }Ok(())
}
/// Return exact elapsed combat time. An aftermath tick consumes its sample but
/// advances no battle time, rules RNG, weapons/resources, AI or statistics.
pub fn advance(o:&mut Owned,b:&mut Vec<Body>,w:&mut world_owner::Owned,ordnance:&mut Ordnance,specs:&BTreeMap<u32,Spec>,input_dt:f64,random:&mut Random,visual:&mut Random,events:&mut Vec<(u32,Handle,Notice)>,authority:&mut flight_admission::Owned)->Result<f64,u32>{
    o.validate(b)?;o.prelude.as_ref().ok_or(8u32)?.validate(b)?;
    let active=scene_control::active(w,b)?;w.set_scope(b,active)?;w.output.clear();w.retired_projectiles.clear();ordnance.effect_records.clear();
    w.visual.begin_frame([b[row(b,o.player)?].motion[0],b[row(b,o.player)?].motion[1]])?;
    if let Some(mut seats)=o.seats.take(){let result=crate::scene_seat::pre_tick(&mut seats,o,b,ordnance,w,specs,random,visual,events);o.seats=Some(seats);result?;}
    else{scene_control::pre_tick(o,b,ordnance,w,specs,input_dt,random,visual,events)?;}
    if o.result.is_some(){o.aftermath(b,w,ordnance,specs,input_dt)?;w.visual.advance(input_dt,b,visual)?;
        w.advance_particles(input_dt);crate::weapon_world::advance_floating(&mut w.floating,input_dt);w.hulk_stage(b,ordnance,specs,input_dt,visual,events)?;
        w.visual.advance_trails(input_dt)?;w.visual.shake*=0.02f64.powf(input_dt);return Ok(0.0);}
    let pr=row(b,o.player)?;let multiplier=if b[pr].ship.as_ref().ok_or(8u32)?.flags&ship_state::DEAD!=0{1.0}else{crate::system_owner::modifiers(b,pr,specs)?.get(ship_effects::TIME)};
    if !multiplier.is_finite()||multiplier<=0.0{return Err(7);}let dt=input_dt/multiplier;if !dt.is_finite(){return Err(7);}w.time+=dt;w.visual.decay_shake(dt)?;
    let active=scene_control::active(w,b)?;o.prelude.as_mut().unwrap().observe(b,&active)?;ai(o,b,w,ordnance,specs,dt,random,visual,events)?;o.advance_cp(b,dt)?;
    let capitals=o.capital(b)?;o.prelude.as_mut().unwrap().shared_flux(b,&capitals)?;scene_control::sync_flight_orders(o,w)?;
    if let Some(seats)=&o.seats{seats.sync_targets(w)?;}
    let mut f=w.flight.take().ok_or(8u32)?;
    let result:Result<(),u32>=(||{
        f.begin_with_ordnance(b,ordnance).map_err(flight::error)?;let ordinary=f.ordinary_roster.clone();
        for h in ordinary{let h=handle(h);o.navigate_retreat(b,w,specs,h,events)?;
            let current=roster(&f,b)?;let t=target(b,h,&current)?;if h==o.manual_weapon&&t.is_none(){o.player_target=None;}
            if let Some(seats)=&mut o.seats{seats.observe_target(h,t);}
            f.enqueue_ordinary(b,identity(h),dt,t.map(identity)).map_err(flight::error)?;}
        o.complete_orders(b,w.time,visual)?;flush_audio(o,w)?;
        {let mut c=Context{bodies:b,world:w,ordnance,specs,random,visual,notices:events,authority};f.collect_wings(&mut c,dt,identity(o.player),identity(o.enemy)).map_err(flight::error)?;}
        admit_prelude(o,authority)?;
        {let mut c=Context{bodies:b,world:w,ordnance,specs,random,visual,notices:events,authority};f.collect_drones(&mut c,dt).map_err(flight::error)?;}
        admit_prelude(o,authority)?;
        let active=roster(&f,b)?;w.set_scope(b,active.clone())?;let queue=f.queue.clone();f.transition(Stage::State).map_err(flight::error)?;
        let mut prepared=Vec::new();for q in &queue{prepared.push(prepare(o,b,w,ordnance,specs,q,random,visual,events)?);}
        f.transition(Stage::Motion).map_err(flight::error)?;for p in &mut prepared{motion_stage(b,w,specs,p,events)?;}synchronize(o,b,w,specs,events)?;
        let listener=row(b,o.player)?;w.visual.begin_frame([b[listener].motion[0],b[listener].motion[1]])?;
        f.transition(Stage::WeaponState).map_err(flight::error)?;
        for p in &prepared{if p.ready&&b[p.row].ship.as_ref().unwrap().can_advance(){let facing=b[p.row].motion[4];crate::phase_runtime::with_ship(w,b,p.row,specs,events,|s,h,n|s.finish_weapons_with(facing,random,visual,n,h))?;}}
        f.transition(Stage::FireQuery).map_err(flight::error)?;crate::gravity_runtime::query_inputs(w,b)?;
        let mut queries=Vec::new();for(q,p)in queue.iter().zip(&prepared){if !p.ready||!b[p.row].ship.as_ref().unwrap().can_advance(){continue;}
            let missiles=match &q.missiles{MissileScope::Captured(captured)=>captured.iter().map(|h|crate::fire_control::Identity{handle:h.handle,generation:h.generation}).collect(),
                MissileScope::Selected(h)=>h.iter().map(|h|crate::fire_control::Identity{handle:h.handle,generation:h.generation}).collect()};
            queries.push(fire_query::Queued{owner:b[p.row].handle,dt:b[p.row].ship.as_ref().unwrap().clock[5],ships:q.ships.iter().copied().map(handle).collect(),missiles});}
        fire_cadence(o,b,w,&queries)?;fire_query::plan_queued(b,ordnance,specs,Some(w),&queries,&active)?;f.transition(Stage::FireCommit).map_err(flight::error)?;
        for p in &prepared{if !p.ready||!b[p.row].ship.as_ref().unwrap().can_advance(){continue;}let h=b[p.row].handle;let dt=b[p.row].ship.as_ref().unwrap().clock[5];
            let mounts:Vec<_>=b[p.row].ship.as_ref().unwrap().weapons.as_ref().ok_or(8u32)?.mounts.iter().map(|m|m.data[0]as u32).collect();
            for component in mounts{let start=events.len();let gravity=b[p.row].ship.as_ref().unwrap().world.as_ref().ok_or(8u32)?.gravity_mounts.contains(&component);
                if gravity{crate::gravity_runtime::weapons_selected(w,b,ordnance,specs,dt,Some((h,component)),random,visual,events)?;}else{ordnance.fire_selected_visual(b,specs,&[(h,Some(component))],random,events,&mut w.visual,visual)?;}
                for (_,owner,n)in &events[start..]{if matches!(n.kind,battle::SHOT_SPAWNED|battle::BEAM_SPAWNED){let s=b[row(b,*owner)?].ship.as_ref().ok_or(8u32)?;w.stats.shot_fired(s.combat.as_ref().ok_or(8u32)?.player.ok_or(8u32)?);}}
            }}
        f.transition(Stage::Finish).map_err(flight::error)?;for p in &prepared{if !p.ready{continue;}let pose=b[p.row].motion;
            crate::phase_runtime::with_ship(w,b,p.row,specs,events,|s,h,n|{s.finish_damage(p.dt,random,visual,n);s.finish_engines_with(&p.integrated,&p.before,random,visual,n,h)})?;
            let sh=b[p.row].ship.as_ref().unwrap().shield.as_ref().ok_or(8u32)?;
            let phase_engaged=sh.kind()==crate::shield::PHASE&&(sh.data[14]==1.0||sh.data[14]==2.0||sh.data[14]==3.0);
            let surface=crate::combat_visuals::surface(&w.visual,b,b[p.row].handle,specs)?;
            w.visual.ship_finish(b[p.row].handle,[pose[0],pose[1]],pose[4],phase_engaged,surface)?;
            let body=&mut b[p.row];let s=body.ship.as_ref().unwrap();if let Some(e)=&s.engines{body.motion[motion::FLAGS]=((body.motion[motion::FLAGS]as u32&!1)|if e.data[4]!=engine::READY{1}else{0})as f64;}}
        {let mut c=Context{bodies:b,world:w,ordnance,specs,random,visual,notices:events,authority};f.finish(&mut c).map_err(flight::error)?;}
        o.complete_orders(b,w.time,visual)?;flush_audio(o,w)?;Ok(())
    })();w.flight=Some(f);result?;
    w.set_scope(b,scene_control::active(w,b)?)?;w.nebula_stage(b,ordnance,specs,events)?;
    let capitals:Vec<_>=o.capital(b)?.into_iter().map(|h|scene_control::assembly(b,h)).collect::<Result<Vec<_>,_>>()?.into_iter().flatten().collect();
    let mut radio=crate::combat_visuals::status_capitals(w,b,&capitals,o.player,specs,w.time,visual)?;
    radio.extend(crate::gravity_runtime::dispatch_with_flight(w,b,ordnance,specs,dt,o.player,random,visual,events,authority)?);
    admit_prelude(o,authority)?;
    for r in w.rows(b)?{let mods=crate::system_owner::modifiers(b,r,specs)?;b[r].ship.as_mut().unwrap().live=mods;}
    w.drain_radio(o);o.radio.extend(radio);if o.radio.len()>8{o.radio.drain(..o.radio.len()-8);}
    crate::gravity_runtime::fields(w,b,ordnance,specs,dt,random,visual,events)?;w.terrain_stage(b,ordnance,specs,dt,random,visual,events)?;synchronize(o,b,w,specs,events)?;
    let listener=row(b,o.player)?;w.visual.begin_frame([b[listener].motion[0],b[listener].motion[1]])?;
    {let mut host=world_owner::Host{bodies:b,specs,ordnance,owned:w,events};host.advance_explosions(dt,random,visual)?;host.finish()?;}
    ordnance.advance_projectiles(b,specs,Some(w),dt,random,visual,events)?;w.sync_explosion_projectiles(ordnance);ordnance.advance_beams(b,specs,Some(w),dt,random,visual,events)?;
    w.visual.advance_trails(dt)?;crate::aux_runtime::advance(w,b,ordnance,specs,dt,random,visual,events)?;w.visual.advance(dt,b,visual)?;
    w.advance_particles(dt);crate::weapon_world::advance_floating(&mut w.floating,dt);w.hulk_stage(b,ordnance,specs,dt,visual,events)?;o.advance_texts(dt);
    for h in scene_control::active(w,b)?{let r=row(b,h)?;let s=b[r].ship.as_ref().unwrap();if s.flags&ship_state::DEAD==0&&s.armor.as_ref().ok_or(8u32)?.data[14]<=0.0{
        let mut host=world_owner::Host{bodies:b,specs,ordnance,owned:w,events};host.destroy(r,random,visual)?;host.finish()?;}}
    // Evaluate later vital roots against any destruction caused by earlier ones.
    for h in o.capital(b)?{if o.prelude.as_ref().unwrap().is_doomed(b,w,h)?{let r=row(b,h)?;b[r].ship.as_mut().unwrap().armor.as_mut().unwrap().data[14]=0.0;
        let mut host=world_owner::Host{bodies:b,specs,ordnance,owned:w,events};host.destroy(r,random,visual)?;host.finish()?;}}
    w.drain_radio(o);let deployed=o.automatic_wave(b,w.time)?;deploy(o,b,w,ordnance,specs,&deployed,random,visual,events,authority)?;
    o.resolve_result(b,w,w.time)?;flush_audio(o,w)?;o.system_read.capture_ordnance(ordnance,w)?;
    if let Some(seats)=&mut o.seats{seats.observe(b)?;seats.sync_targets(w)?;}
    crate::effect_owner::drain_notices(ordnance,events);Ok(dt)
}
pub fn admit_prelude(o:&mut Owned,authority:&flight_admission::Owned)->Result<(),u32>{let p=o.prelude.as_mut().ok_or(8u32)?;
    for born in &authority.born{
        if !p.entries.iter().any(|e|e.meta.ship==born.ship){p.admit(born.prelude.clone())?;}
        if !o.read.ships.iter().any(|e|e.ship==born.ship){o.read.admit(born.read.clone())?;}
        if !o.system_read.ships.iter().any(|e|e.ship==born.ship){o.system_read.admit(born.system_read.clone())?;}
    }Ok(())}
pub fn deploy(o:&mut Owned,b:&mut Vec<Body>,w:&mut world_owner::Owned,ordnance:&mut Ordnance,specs:&BTreeMap<u32,Spec>,roots:&[Handle],random:&mut Random,visual:&mut Random,events:&mut Vec<(u32,Handle,Notice)>,authority:&mut flight_admission::Owned)->Result<(),u32>{
    if roots.is_empty(){return Ok(());}let mut f=w.flight.take().ok_or(8u32)?;let result=(||{for h in roots{f.admit_root(b,identity(*h)).map_err(flight::error)?;
        synchronize(o,b,w,specs,events)?;w.set_scope(b,roster(&f,b)?)?;
        let mut c=Context{bodies:b,world:w,ordnance,specs,random,visual,notices:events,authority};f.add_carrier(&mut c,identity(*h),None).map_err(flight::error)?;}
        w.set_scope(b,roster(&f,b)?)?;admit_prelude(o,authority)?;Ok(())})();w.flight=Some(f);result
}
