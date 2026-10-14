//! One-time gravity specification admission; runtime input shares the core transaction.
use crate::{battle::Ordnance,gravity_owner as o,gravity_runtime as r,gravity_world as g,lifecycle::Spec,
    random::Random,ship_state::Notice,state::{Body,Handle},system_world::Identity,world_owner::Owned};
use std::collections::BTreeMap;
fn integer(n:f64)->Result<u32,u32>{if n.is_finite()&&n>=0.0&&n<=u32::MAX as f64&&n.fract()==0.0{Ok(n as u32)}else{Err(2)}}
fn flag(n:f64)->Result<bool,u32>{match n{0.0=>Ok(false),1.0=>Ok(true),_=>Err(2)}}
fn nonnegative(ns:&[f64])->Result<(),u32>{if ns.iter().all(|n|n.is_finite()&&*n>=0.0){Ok(())}else{Err(2)}}
fn identity(b:&Body)->Identity{Identity{slot:b.handle.slot,generation:b.handle.generation}}
fn kind(n:u32)->Result<g::Kind,u32>{Ok(match n{0=>g::Kind::Well,1=>g::Kind::Repulsor,2=>g::Kind::Maneuver,3=>g::Kind::Release,
    4=>g::Kind::BattleWell,5=>g::Kind::Collapse,6=>g::Kind::Polarity,7=>g::Kind::BattleRepulsor,8=>g::Kind::Push,_=>return Err(2)})}
pub fn apply(tag:u32,row:&[f64],world:&mut Owned,bodies:&mut[Body],ordnance:&mut Ordnance,specs:&BTreeMap<u32,Spec>,own:usize,
    random:&mut Random,visual:&mut Random,events:&mut Vec<(u32,Handle,Notice)>)->Result<(),u32>{
    if tag==94{if world.gravity.is_some(){return Err(8);}let mut owner=r::Owned::install(world,bodies)?;owner.owner.reconcile_projectiles(ordnance).map_err(r::error)?;
        world.gravity=Some(owner);return Ok(());}
    if tag==102{return r::held(world,bodies,ordnance,specs,own,flag(row[0])?,flag(row[1])?,random,visual,events);}
    admit_static(tag,row,world,bodies,specs,own)
}
/// Pure specification registration, shared by startup and actual born trees.
/// These tags never sample RNG or touch ordnance/lifecycle activation.
pub fn admit_static(tag:u32,row:&[f64],world:&mut Owned,bodies:&mut[Body],specs:&BTreeMap<u32,Spec>,own:usize)->Result<(),u32>{
    if row.len()!=22||row.iter().any(|n|!n.is_finite())||own>=bodies.len()||!matches!(tag,95..=101|103){return Err(2);}
    let runtime=world.gravity.as_mut().ok_or(8u32)?;let h=identity(&bodies[own]);
    if tag==101{let rank=integer(row[1])?;let col=&mut runtime.owner.collation;match integer(row[0])?{
        0=>{let m=runtime.owner.ships.iter().find(|m|m.identity==h).ok_or(4u32)?;let key=format!("SHIP:{}",m.name);
            if col.keys.iter().any(|(k,_)|*k==key){return Err(8);}col.keys.push((key,rank));},
        1=>{let names=["ASTEROID","HULK","PROJECTILE","SHIP"];let key=names.get(integer(row[2])?as usize).ok_or(2u32)?.to_string();
            if col.prefixes.iter().any(|(k,_)|*k==key){return Err(8);}col.prefixes.push((key,rank));},
        2=>{let c=char::from_u32(integer(row[2])?).ok_or(2u32)?;if !"-.0123456789+e".contains(c){return Err(2);}
            let alphabet=col.numeric_alphabet.get_or_insert_with(Vec::new);if alphabet.iter().any(|(ch,_)|*ch==c){return Err(8);}alphabet.push((c,rank));},
        _=>return Err(2),}return Ok(());}
    let sid=integer(row[0])?;
    let meta=runtime.owner.ships.iter_mut().find(|m|m.identity==h).ok_or(4u32)?;
    let ship=bodies[own].ship.as_mut().ok_or(8u32)?;
    if tag==95{let k=kind(integer(row[1])?)?;let life=ship.systems.iter().find(|s|s.id==sid).ok_or(8u32)?;
        let model=ship.world.as_mut().ok_or(8u32)?;let m=model.metas.get(&sid).ok_or(8u32)?;
        let expected=match k{g::Kind::Well=>crate::ship_effects::Kind::GravityWell,g::Kind::BattleWell=>crate::ship_effects::Kind::GravityBattleWell,_=>crate::ship_effects::Kind::GravityOther};
        if m.kind!=expected||meta.systems.iter().any(|m|m.id==sid){return Err(8);}let mut slot=g::Slot::new(h,sid,k,String::new(),specs.get(&life.spec).ok_or(8u32)?.clone());slot.lifecycle=life.clone();
        meta.systems.push(o::SystemMeta::from_slot(slot));model.gravity_systems.push(sid);return Ok(());}
    if tag==99||tag==100{if meta.mounts.iter().any(|m|m.id==sid){return Err(8);}let mounts=ship.weapons.as_ref().ok_or(8u32)?;
        let i=mounts.mounts.iter().position(|m|m.data[0]==sid as f64).ok_or(8u32)?;let c=ship.combat.as_ref().ok_or(8u32)?;let fire=c.fire.get(i).ok_or(8u32)?;let q=fire.query.as_ref().ok_or(8u32)?;
        let mut m=g::Mount{owner:h,id:sid,name:String::new(),tractor_spec:None,deflector_spec:None,tractor:None,disabled:false,permitted:true,cooldown:0.0,glow:0.0,trigger:false,
            muzzle:[0.0;2],range:fire.range,base_range:fire.range_inputs.as_ref().ok_or(8u32)?.authored_range,base_angle:q.base.to_radians(),arc:q.arc,
            hardpoint:flag(if tag==99{row[14]}else{row[5]})?,angle:mounts.mounts[i].data[15],turn_rate:q.turn.to_radians(),enabled_group:false,deflection:None};
        if tag==99{nonnegative(&row[1..9])?;m.tractor_spec=Some(g::TractorSpec{capture:row[1],projectile_capture:row[2],hold:row[3],recovery:row[4],anchor_speed:row[5],strength:row[6],damping:row[7],flux_rate:row[8],
            self_tow:flag(row[9])?,tidal_damage:if flag(row[10])?{nonnegative(&row[11..12])?;Some(row[11])}else{None},tidal_flux:if flag(row[12])?{nonnegative(&row[13..14])?;Some(row[13])}else{None}});m.tractor=Some(g::Tractor::default());}
        else{nonnegative(&row[1..5])?;if row[4]==0.0{return Err(2);}m.deflector_spec=Some(g::DeflectorSpec{impulse:row[1],budget:row[2],flux:row[3],interval:row[4]});}
        meta.mounts.push(m);ship.combat.as_mut().ok_or(8u32)?.fire[i].query.as_mut().ok_or(8u32)?.force_kind=if tag==99{1}else{2};
        ship.world.as_mut().ok_or(8u32)?.gravity_mounts.push(sid);return Ok(());}
    if tag==103{let mount=flag(row[1])?;let count=integer(row[3])?as usize;if count>18{return Err(2);}let chars=row[4..4+count].iter().map(|n|integer(*n).and_then(|n|u16::try_from(n).map_err(|_|2u32))).collect::<Result<Vec<_>,_>>()?;
        let name=if mount{&mut meta.mounts.iter_mut().find(|m|m.id==sid).ok_or(8u32)?.name}else{&mut meta.systems.iter_mut().find(|m|m.id==sid).ok_or(8u32)?.name};
        if integer(row[2])?as usize!=name.encode_utf16().count(){return Err(8);}name.push_str(&String::from_utf16(&chars).map_err(|_|2u32)?);return Ok(());}
    let m=meta.systems.iter_mut().find(|m|m.id==sid).ok_or(8u32)?;
    match tag{
        96=>{if m.field_spec.is_some(){return Err(8);}nonnegative(&row[1..17])?;m.field_spec=Some(g::FieldSpec{kind:match integer(row[1])?{0=>g::FieldKind::Well,1=>g::FieldKind::Repulsor,_=>return Err(2)},
            cursor_speed:if flag(row[2])?{Some(row[3])}else{None},linger:if flag(row[4])?{Some(row[5])}else{None},radius:row[6],placement:row[7],duration:row[8],ship_strength:row[9],projectile_strength:row[10],
            ship_budget:row[11],projectile_budget:row[12],max_ships:integer(row[13])?as usize,max_projectiles:integer(row[14])?as usize});},
        97=>{if m.collapse_spec.is_some(){return Err(8);}nonnegative(&row[1..9])?;m.collapse_spec=Some(g::CollapseSpec{radius:row[1],damage:row[2],edge:row[3],max_ships:integer(row[4])?as usize});
            if flag(row[5])?{m.auto=Some(g::AutoCollapse{up:row[6],active:row[7],cost:row[8]});}},
        98=>{nonnegative(&row[2..8])?;match integer(row[1])?{
            0=>{if m.maneuver_spec.is_some(){return Err(8);}m.maneuver_spec=Some(g::ManeuverSpec{duration:row[2],max_turn:row[3],turn_rate:row[4],acceleration:row[5],min_speed:row[6],min_aim:row[7]});},
            1=>{if m.push_spec.is_some(){return Err(8);}m.push_spec=Some(g::PushSpec{range:row[2],ship_strength:row[3],projectile_strength:row[4],flux_rate:row[5]});},_=>return Err(2)}},
        _=>return Err(2),}Ok(())
}
fn boolean(out:&mut Vec<f64>,n:bool){out.push(n as u32 as f64);}
fn string(out:&mut Vec<f64>,s:&str){out.push(s.encode_utf16().count()as f64);out.extend(s.encode_utf16().map(|n|n as f64));}
fn id(out:&mut Vec<f64>,h:Identity){out.extend([h.slot as f64,h.generation as f64]);}
fn optional(out:&mut Vec<f64>,n:Option<f64>){boolean(out,n.is_some());if let Some(n)=n{out.push(n);}}
fn target(out:&mut Vec<f64>,t:g::Target){out.push(match t.kind{g::BodyKind::Ship=>0.0,g::BodyKind::Projectile=>1.0,g::BodyKind::Asteroid=>2.0,g::BodyKind::Hulk=>3.0});id(out,t.identity);}
fn identities(out:&mut Vec<f64>,v:&[Identity]){out.push(v.len()as f64);for h in v{id(out,*h);}}
fn targets(out:&mut Vec<f64>,v:Option<&[g::Target]>){boolean(out,v.is_some());if let Some(v)=v{out.push(v.len()as f64);for t in v{target(out,*t);}}}
pub fn header(runtime:&r::Owned)->Vec<f64>{let mut out=vec![runtime.next_environment as f64,runtime.environments.len()as f64];
    for(kind,n,h)in &runtime.environments{out.push(match kind{g::BodyKind::Asteroid=>2.0,g::BodyKind::Hulk=>3.0,_=>unreachable!()});out.push(*n);id(&mut out,*h);}
    let col=&runtime.owner.collation;for table in [&col.keys,&col.prefixes]{out.push(table.len()as f64);for(k,r)in table{string(&mut out,k);out.push(*r as f64);}}
    boolean(&mut out,col.numeric_alphabet.is_some());if let Some(a)=&col.numeric_alphabet{out.push(a.len()as f64);for(c,r)in a{out.extend([*c as u32 as f64,*r as f64]);}}out}
pub fn system(owner:Identity,m:&o::SystemMeta)->Vec<f64>{let mut out=Vec::new();id(&mut out,owner);out.extend([m.id as f64,match m.kind{g::Kind::Well=>0.0,g::Kind::Repulsor=>1.0,g::Kind::Maneuver=>2.0,g::Kind::Release=>3.0,
    g::Kind::BattleWell=>4.0,g::Kind::Collapse=>5.0,g::Kind::Polarity=>6.0,g::Kind::BattleRepulsor=>7.0,g::Kind::Push=>8.0}]);string(&mut out,&m.name);
    boolean(&mut out,m.field_spec.is_some());if let Some(f)=m.field_spec{out.push(match f.kind{g::FieldKind::Well=>0.0,g::FieldKind::Repulsor=>1.0,g::FieldKind::Collapse=>2.0});optional(&mut out,f.cursor_speed);optional(&mut out,f.linger);
        out.extend([f.radius,f.placement,f.duration,f.ship_strength,f.projectile_strength,f.ship_budget,f.projectile_budget,f.max_ships as f64,f.max_projectiles as f64]);}
    boolean(&mut out,m.collapse_spec.is_some());if let Some(c)=m.collapse_spec{out.extend([c.radius,c.damage,c.edge,c.max_ships as f64]);}
    boolean(&mut out,m.auto.is_some());if let Some(a)=m.auto{out.extend([a.up,a.active,a.cost]);}
    boolean(&mut out,m.maneuver_spec.is_some());if let Some(s)=m.maneuver_spec{out.extend([s.duration,s.max_turn,s.turn_rate,s.acceleration,s.min_speed,s.min_aim]);}
    boolean(&mut out,m.push_spec.is_some());if let Some(s)=m.push_spec{out.extend([s.range,s.ship_strength,s.projectile_strength,s.flux_rate]);}
    boolean(&mut out,m.input.is_some());if let Some(i)=m.input{out.extend(i.point);out.extend(i.origin);out.extend(i.velocity);out.push(i.facing);boolean(&mut out,i.target.is_some());if let Some((s,g))=i.target{out.extend([s as f64,g as f64]);}optional(&mut out,i.gravity_anchor_serial);}
    boolean(&mut out,m.field.is_some());if let Some(f)=&m.field{out.push(match f.kind{g::FieldKind::Well=>0.0,g::FieldKind::Repulsor=>1.0,g::FieldKind::Collapse=>2.0});optional(&mut out,f.serial);optional(&mut out,f.polarity.map(|n|n as f64));optional(&mut out,f.cursor.map(|b|b as u32 as f64));optional(&mut out,f.linger);
        out.extend(f.position);out.push(f.age);optional(&mut out,f.duration);out.extend([f.radius,f.ship_budget,f.projectile_budget]);optional(&mut out,f.environment_budget);identities(&mut out,&f.ship_hits);identities(&mut out,&f.projectile_hits);
        targets(&mut out,f.environment_hits.as_deref());targets(&mut out,f.releases.as_deref());optional(&mut out,f.collapsed.map(|b|b as u32 as f64));}
    boolean(&mut out,m.maneuver.is_some());if let Some(s)=m.maneuver{out.extend([s.target_angle,s.age,s.turn_remaining]);}
    boolean(&mut out,m.push.is_some());if let Some(s)=&m.push{boolean(&mut out,s.target.is_some());if let Some(t)=s.target{target(&mut out,t);}out.extend(s.position);out.push(s.radius);out.extend(s.direction);out.push(s.age);string(&mut out,&s.status);}
    optional(&mut out,m.polarity.map(|n|n as f64));boolean(&mut out,m.held);out}
pub fn mount(m:&g::Mount)->Vec<f64>{let mut out=Vec::new();id(&mut out,m.owner);out.push(m.id as f64);string(&mut out,&m.name);
    boolean(&mut out,m.tractor_spec.is_some());if let Some(s)=m.tractor_spec{out.extend([s.capture,s.projectile_capture,s.hold,s.recovery,s.anchor_speed,s.strength,s.damping,s.flux_rate]);boolean(&mut out,s.self_tow);optional(&mut out,s.tidal_damage);optional(&mut out,s.tidal_flux);}
    boolean(&mut out,m.deflector_spec.is_some());if let Some(s)=m.deflector_spec{out.extend([s.impulse,s.budget,s.flux,s.interval]);}
    boolean(&mut out,m.tractor.is_some());if let Some(s)=&m.tractor{out.push(match s.phase{g::Phase::Idle=>0.0,g::Phase::Capture=>1.0,g::Phase::Hold=>2.0});optional(&mut out,s.polarity.map(|n|n as f64));boolean(&mut out,s.target.is_some());if let Some(t)=s.target{target(&mut out,t);}out.extend([s.capture,s.age]);out.extend(s.anchor);out.extend(s.contact);optional(&mut out,s.radius);boolean(&mut out,s.wait_release);string(&mut out,&s.status);optional(&mut out,s.damage_clock);}
    boolean(&mut out,m.disabled);boolean(&mut out,m.permitted);out.extend([m.cooldown,m.glow]);boolean(&mut out,m.trigger);out.extend(m.muzzle);out.extend([m.range,m.base_range,m.base_angle,m.arc]);boolean(&mut out,m.hardpoint);out.extend([m.angle,m.turn_rate]);boolean(&mut out,m.enabled_group);
    boolean(&mut out,m.deflection.is_some());if let Some((p,age))=m.deflection{out.extend(p);out.push(age);}out}
pub fn projectile(m:&o::ProjectileMeta)->Vec<f64>{let mut out=Vec::new();id(&mut out,m.identity);boolean(&mut out,m.original_source.is_some());if let Some((n,h))=m.original_source{out.extend([n as f64,h.slot as f64,h.generation as f64]);}
    boolean(&mut out,m.captured_by.is_some());if let Some(h)=m.captured_by{id(&mut out,h);}boolean(&mut out,m.mass_driver);boolean(&mut out,m.mine);boolean(&mut out,m.hull_explosion);boolean(&mut out,m.binding.is_some());
    if let Some(b)=m.binding{id(&mut out,b.owner);out.extend([b.serial,b.age,b.turn]);}out}
