//! Completed scene read facts. This module does not advance or sample anything.
use crate::{battle,flight_runtime,lifecycle::Spec,phase_runtime,readiness,
    scene_owner::{Kind,Owned,Status,Unit},ship_effects as effects,ship_state,
    state::{Body,Handle},world_owner};
use std::collections::BTreeMap;
fn flag(v:bool)->f64{v as u32 as f64}
fn handle(o:&mut Vec<f64>,h:Handle){o.extend([h.slot as f64,h.generation as f64]);}
fn optional(o:&mut Vec<f64>,h:Option<Handle>){o.push(flag(h.is_some()));if let Some(h)=h{handle(o,h);}}
fn string(o:&mut Vec<f64>,s:&str){let v:Vec<_>=s.encode_utf16().collect();o.push(v.len()as f64);o.extend(v.into_iter().map(|v|v as f64));}
fn record(o:&mut Vec<f64>,count:&mut usize,tag:u32,v:Vec<f64>){o.extend([tag as f64,v.len()as f64]);o.extend(v);*count+=1;}
fn row(b:&[Body],h:Handle)->Result<usize,u32>{b.iter().position(|b|b.handle==h).ok_or(4)}
fn core(h:crate::tactical_ai::Identity)->Handle{Handle{slot:h.handle,generation:h.generation}}
fn contact(b:&Body)->Result<readiness::Contact,u32>{let s=b.ship.as_ref().ok_or(8u32)?;let c=s.combat.as_ref().ok_or(8u32)?;
    Ok(readiness::Contact{identity:[b.handle.slot,b.handle.generation],team:Some(c.team),position:[b.motion[0],b.motion[1]],dead:s.flags&ship_state::DEAD!=0,retreated:s.flags&ship_state::RETREATED!=0,docked:s.flags&ship_state::DOCKED!=0,fighter:c.size==0})}
fn handles(o:&mut Vec<f64>,v:&[Handle]){o.push(v.len()as f64);for h in v{handle(o,*h);}}
pub fn words(scene:&Owned,b:&[Body],world:&world_owner::Owned,ordnance:&battle::Ordnance,specs:&BTreeMap<u32,Spec>,tick:f64,time:f64,
    births:&BTreeMap<u32,crate::flight_admission::Born>,receipts:&[crate::scene_commands::Outcome])->Result<Vec<f64>,u32>{
    scene.validate(b)?;scene.prelude.as_ref().ok_or(8u32)?.validate(b)?;scene.read.validate(b)?;
    let f=world.flight.as_ref().ok_or(8u32)?;if f.stage!=flight_runtime::Stage::Closed||f.admission.is_some(){return Err(8);}
    let active:Vec<_>=f.roster(b).map_err(flight_runtime::error)?.into_iter().map(core).collect();
    let capital=scene.capital(b)?;let observation=std::rc::Rc::new(crate::system_owner::PublicationObservation::new(b,specs));let mut o=vec![1.0,0.0];let mut n=0;
    let mut header=vec![tick,time];handle(&mut header,scene.player);handle(&mut header,scene.enemy);handle(&mut header,scene.manual_weapon);optional(&mut header,scene.player_target);
    header.extend([flag(scene.enabled),scene.limit,flag(scene.simulation),scene.simulation_limit,flag(scene.primary_enemy_deployed),flag(scene.multi_team),flag(scene.open),scene.cp,scene.recovery,flag(scene.map),flag(scene.autopilot),time+scene.aftermath,flag(scene.result.is_some()&&!world.visual.explosions.iter().any(|e|e.kind==3))]);
    match scene.selected{None=>header.push(0.0),Some(Unit::Fleet)=>header.push(1.0),Some(Unit::Ship(h))=>{header.push(2.0);handle(&mut header,h);}}
    header.push(flag(scene.winning_team.is_some()));if let Some(t)=scene.winning_team{header.push(t as f64);}record(&mut o,&mut n,1,header);
    let mut rosters=Vec::new();handles(&mut rosters,&active);handles(&mut rosters,&capital);handles(&mut rosters,&scene.roots.iter().filter(|r|r.ship!=scene.enemy||scene.primary_enemy_deployed).map(|r|r.ship).collect::<Vec<_>>());
    handles(&mut rosters,&f.flights.fighters.iter().copied().map(core).collect::<Vec<_>>());handles(&mut rosters,&f.flights.bombers.iter().copied().map(core).collect::<Vec<_>>());record(&mut o,&mut n,2,rosters);
    for (r,body) in b.iter().enumerate(){let s=body.ship.as_ref().ok_or(8u32)?;let c=s.combat.as_ref().ok_or(8u32)?;let w=s.world.as_ref().ok_or(8u32)?;let q=c.query.as_ref().ok_or(8u32)?;
        let m=f.owner.ship(crate::tactical_ai::Identity{handle:body.handle.slot,generation:body.handle.generation}).map_err(flight_runtime::error)?;
        let meta=scene.read.get(body.handle)?;let live=observation.modifiers(r)?;let public=scene.prelude.as_ref().unwrap().entry(body.handle)?.public_visible;
        let mut v=vec![body.id as f64];handle(&mut v,body.handle);string(&mut v,&m.stable_id);string(&mut v,births.get(&body.id).map_or("",|b|b.spec_key.as_str()));v.push(c.team as f64);
        optional(&mut v,w.parent);optional(&mut v,w.carrier);v.extend(w.previous);v.push(w.previous_facing);optional(&mut v,if body.handle==scene.player{scene.player_target}else{m.player_target.map(core)});
        v.extend([if public{0x7fff_ffffu32 as f64}else{0.0},flag(public),flag(phase_runtime::phased_world(world,b,r,specs)?)]);string(&mut v,&c.death.as_ref().ok_or(8u32)?.ship_name);
        v.push(flag(m.wing.is_some()));if let Some(wing)=&m.wing{string(&mut v,wing);}let drone=world.aux.as_ref().ok_or(8u32)?.ships.iter().find(|a|a.handle==body.handle).ok_or(8u32)?.drone;
        let sh=s.shield.as_ref().ok_or(8u32)?;let mut alpha=if sh.kind()==crate::shield::PHASE{1.0-0.75*sh.data[15]}else{1.0};
        if let Some(value)=world.phase.as_ref().ok_or(8u32)?.external_phase(body.handle){alpha=alpha.min(value.clamp(0.0,1.0));}alpha=if s.flags&(ship_state::DOCKED|ship_state::RETREATED)!=0{0.0}else{alpha*live.get(effects::VISUAL_ALPHA)};
        let contacts=q.scope.iter().map(|h|contact(&b[observation.row(*h)?])).collect::<Result<Vec<_>,_>>()?;let explicit=q.target.map(|h|contact(&b[observation.row(h)?])).transpose()?;
        v.extend([flag(drone),((3000.0+meta.sight_flat+live.get(effects::SIGHT_FLAT))*(1.0+(meta.sight_percent+live.get(effects::SIGHT_PERCENT))/100.0)).max(0.0),flag(q.trigger),flag(m.recall),meta.weapon_repair,s.engines.as_ref().ok_or(8u32)?.fraction(true).clamp(0.0,1.0),flag(readiness::significant_enemies(contact(body)?,2500.0,explicit,&contacts)),alpha]);v.extend(w.camera);
        let slots=s.systems.iter().filter(|s|!s.defense).map(|s|s.id).collect::<Vec<_>>();let primary=*slots.first().ok_or(8u32)?;v.push(primary as f64);v.push(slots.len()as f64);v.extend(slots.iter().map(|n|*n as f64));let defense=s.systems.iter().find(|s|s.defense).ok_or(8u32)?;v.push(defense.id as f64);
        record(&mut o,&mut n,3,v);
        let mounts=&s.weapons.as_ref().ok_or(8u32)?.mounts;
        if mounts.len()!=m.mounts.len()||mounts.len()!=c.fire.len(){return Err(8);}for(i,mount)in mounts.iter().enumerate(){let mut v=vec![body.id as f64,mount.data[0]];string(&mut v,&m.mounts[i].slot);let e=&c.fire[i];
            v.extend([battle::weapon_geometry(e,mount.data[1]as usize,&live,c.attrs[18]).0]);record(&mut o,&mut n,4,v);}
    }
    for root in &scene.roots{let status=scene.status(b,root)?;let r=row(b,root.ship)?;let mut v=Vec::new();handle(&mut v,root.ship);v.extend([b[r].ship.as_ref().unwrap().combat.as_ref().unwrap().team as f64,root.cost,match status{Status::Reserve=>0.0,Status::Deployed=>1.0,Status::Retreating=>2.0,Status::Retreated=>3.0,Status::Destroyed=>4.0}]);record(&mut o,&mut n,5,v);}
    for(side,wings)in [(0,&f.flights.player_wings),(1,&f.flights.enemy_wings)]{for w in wings{let mut v=vec![side as f64];handle(&mut v,core(w.carrier));string(&mut v,&w.id);string(&mut v,&w.spec.spec_id);string(&mut v,&w.name);v.extend([w.spec.count as f64,w.crr]);record(&mut o,&mut n,6,v);}}
    for(unit,order)in &scene.orders{let mut v=Vec::new();match unit{Unit::Fleet=>v.push(0.0),Unit::Ship(h)=>{v.push(1.0);handle(&mut v,*h);}}string(&mut v,&order.id);v.extend([match order.kind{Kind::Assault=>0.0,Kind::Engage=>1.0,Kind::Avoid=>2.0,Kind::Defend=>3.0,Kind::Escort=>4.0,Kind::Waypoint=>5.0},order.time]);optional(&mut v,order.target);v.push(flag(order.point.is_some()));if let Some(p)=order.point{v.extend(p);}record(&mut o,&mut n,7,v);}
    if let Some(result)=&scene.result{let mut v=vec![flag(result.victory),result.duration];string(&mut v,&result.player_spec);string(&mut v,&result.enemy_spec);v.extend([result.player_hull_damage,result.enemy_hull_damage]);v.extend(result.stats.player);v.extend(result.stats.enemy);record(&mut o,&mut n,8,v);}
    for t in &scene.texts{let mut v=vec![t.id];v.extend(t.position);string(&mut v,&t.text);v.extend(t.color.map(|c|c as f64));v.extend([t.size,t.life,t.max_life]);record(&mut o,&mut n,9,v);}
    for t in &scene.radio{let mut v=vec![t.id];string(&mut v,&t.sender);string(&mut v,&t.faction);string(&mut v,&t.text);v.extend(t.color.map(|c|c as f64));v.push(t.time);record(&mut o,&mut n,10,v);}
    let mut audio=vec![scene.audio_sequence as f64,scene.audio.len()as f64];for a in &scene.audio{audio.push(a.sequence as f64);string(&mut audio,&a.key);audio.push(a.volume);}record(&mut o,&mut n,11,audio);
    record(&mut o,&mut n,12,crate::visual_wire::words(&world.visual,b)?);
    record(&mut o,&mut n,13,crate::scene_system_publication::words_observed(&scene.system_read,world,ordnance,std::rc::Rc::clone(&observation))?);
    let mut results=vec![receipts.len()as f64];for r in receipts{results.extend([flag(r.accepted),flag(r.reason.is_some())]);if let Some(reason)=&r.reason{string(&mut results,reason);}}record(&mut o,&mut n,14,results);
    record(&mut o,&mut n,15,crate::ordnance_publication::words(ordnance,b,world)?);
    let phase=world.phase.as_ref().ok_or(8u32)?;
    let mut settlement=vec![b.len()as f64];for body in b{handle(&mut settlement,body.handle);
        settlement.push(if body.ship.as_ref().ok_or(8u32)?.anchor_installed{phase.pending_cr(body.handle)?}else{0.0});}
    record(&mut o,&mut n,16,settlement);
    record(&mut o,&mut n,17,vec![scene.simulation_used(b,true)?,scene.simulation_used(b,false)?]);
    if let Some(seats)=&scene.seats{record(&mut o,&mut n,18,crate::scene_seat::words(seats,scene,b,world,specs)?);}
    if o.len()>8_000_000||o.iter().any(|n|!n.is_finite()){return Err(7);}o[1]=n as f64;Ok(o)
}
