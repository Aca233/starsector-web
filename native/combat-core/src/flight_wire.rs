//! Tick-zero complete flight authority. Root enforces tick and rolls back every
//! rejected command batch; incomplete admission can never enter simulation.
use crate::{flight_static_wire as j,flight_runtime as r,flight_owner as o,flight_world as f,lifecycle::Spec,state::{Body,Handle},tactical_ai::Identity,world_owner};
use std::collections::{BTreeMap,BTreeSet};
#[derive(Clone)]pub struct Admission{length:usize,count:usize,units:Vec<u16>}
fn pad(v:&[f64],used:usize)->Result<(),u32>{if v.len()!=22||v.iter().any(|v|!v.is_finite())||v[used..].iter().any(|v|*v!=0.0){Err(2)}else{Ok(())}}
fn id(v:&j::Value,bodies:&[Body])->Result<Identity,u32>{let mut p=v.object()?;let h=Handle{slot:p.get("slot")?.int()?,generation:p.get("generation")?.int()?};p.done()?;
    if h.generation==0||!bodies.iter().any(|b|b.handle==h){return Err(4);}Ok(Identity{handle:h.slot,generation:h.generation})}
fn body(bodies:&[Body],h:Identity)->Result<&Body,u32>{bodies.iter().find(|b|b.handle.slot==h.handle&&b.handle.generation==h.generation).ok_or(4)}
fn ids(v:&j::Value,bodies:&[Body])->Result<Vec<Identity>,u32>{let mut out=Vec::new();for v in v.array()?{let h=id(v,bodies)?;if out.contains(&h){return Err(8);}out.push(h);}Ok(out)}
fn optional_id(v:Option<&j::Value>,bodies:&[Body])->Result<Option<Identity>,u32>{v.map(|v|id(v,bodies)).transpose()}
fn nonempty(v:&j::Value)->Result<String,u32>{let s=v.text()?;if s.is_empty(){Err(8)}else{Ok(s.to_owned())}}
fn wings(v:&j::Value)->Result<Vec<f::WingSpec>,u32>{v.array()?.iter().map(j::wing).collect()}
fn mode(v:&j::Value)->Result<f::Mode,u32>{Ok(match v.text()?{"ESCORT"=>f::Mode::Escort,"ATTACK"=>f::Mode::Attack,"INTERCEPT"=>f::Mode::Intercept,"DOGFIGHT"=>f::Mode::Dogfight,"ATTACK_RUN"=>f::Mode::AttackRun,"RETURN_TO_REARM"=>f::Mode::ReturnToRearm,"DOCKED"=>f::Mode::Docked,_=>return Err(8)})}

pub fn apply(tag:u32,v:&[f64],world:&mut world_owner::Owned,bodies:&[Body],specs:&mut BTreeMap<u32,Spec>,own:usize)->Result<(),u32>{
    if own>=bodies.len(){return Err(4);}if tag==133{pad(v,3)?;if world.flight.is_some()||v[0]!=1.0{return Err(8);}let length=j::integer(v[1])?as usize;let count=j::integer(v[2])?as usize;
        if length==0||length>16_000_000||count!=bodies.len(){return Err(2);}world.flight=Some(r::Owned{admission:Some(Admission{length,count,units:Vec::new()}),..Default::default()});return Ok(());}
    if tag==134{let offset=j::integer(v[0])?as usize;let count=j::integer(v[1])?as usize;if count==0||count>20{return Err(2);}pad(v,2+count)?;
        let draft=world.flight.as_mut().and_then(|f|f.admission.as_mut()).ok_or(8u32)?;if offset!=draft.units.len()||offset+count>draft.length{return Err(8);}
        for n in &v[2..2+count]{draft.units.push(u16::try_from(j::integer(*n)?).map_err(|_|2u32)?);}return Ok(());}
    if tag!=135{return Err(2);}pad(v,0)?;let draft=world.flight.as_ref().and_then(|f|f.admission.as_ref()).ok_or(8u32)?;
    if draft.units.len()!=draft.length||bodies.len()!=draft.count{return Err(8);}let value=j::parse(&draft.units)?;let installed=install(&value,bodies,specs)?;world.flight=Some(installed);Ok(())
}

fn install(value:&j::Value,bodies:&[Body],specs:&mut BTreeMap<u32,Spec>)->Result<r::Owned,u32>{let mut p=value.object()?;if p.get("version")?.int()!=Ok(1){return Err(8);}let _initialize_wings=p.get("initializeWings")?.bool()?;
    let collation=crate::flight_admission::decode_collation(p.get("collation")?)?;
    let mut raws=BTreeMap::new();let mut descriptors=Vec::new();for v in p.get("templates")?.array()?{let mut t=v.object()?;let key=nonempty(t.get("key")?)?;let carrier=t.optional("carrierSpecKey").map(nonempty).transpose()?;
        let point=t.optional("pointDefense").map(j::Value::number).transpose()?;if point.is_some_and(|v|v==0.0)||carrier.is_none()&&point.is_some(){return Err(8);}let template=t.get("template")?.int()?;
        let constructor=t.get("constructor")?;t.done()?;if raws.insert(key.clone(),constructor).is_some(){return Err(8);}descriptors.push((key,carrier,point,template));}
    let mut installed=r::Owned{collation,..Default::default()};let mut templates:BTreeMap<u32,o::CraftTemplate>=BTreeMap::new();let mut spec_handles=BTreeMap::new();
    for(key,carrier,point,template)in descriptors{let static_ship=j::static_ship(&key,&raws,specs,&mut Vec::new())?;
        if static_ship.hull_size==0{if template==0{return Err(8);}if spec_handles.get(&static_ship.spec_id).is_some_and(|n|*n!=template){return Err(8);}spec_handles.insert(static_ship.spec_id.clone(),template);
            if let Some(carrier)=carrier{let description=f::Template{handle:template,spec_id:static_ship.spec_id.clone(),fighter:true,role:static_ship.role,footprint:static_ship.footprint.clone()};
                let t=templates.entry(template).or_insert_with(||o::CraftTemplate{description:description.clone(),variants:Vec::new()});
                if t.description.spec_id!=description.spec_id||t.description.role!=description.role||!same_footprint(&t.description.footprint,&description.footprint){return Err(8);}t.variants.push(o::Variant{carrier_spec:carrier,point_defense:point,ship:static_ship.clone()});}
        }else if template!=0||carrier.is_some(){return Err(8);}installed.statics.insert(key,static_ship);
    }
    for(_,t)in templates{installed.owner.install(t,specs).map_err(r::error)?;}
    for v in p.get("ships")?.array()?{let meta=ship(v,bodies)?;if installed.owner.ships.iter().any(|m|m.identity==meta.identity||m.stable_id==meta.stable_id){return Err(8);}installed.owner.ships.push(meta);}
    if installed.owner.ships.len()!=bodies.len(){return Err(8);}for b in bodies{let h=Identity{handle:b.handle.slot,generation:b.handle.generation};installed.owner.ship(h).map_err(r::error)?;}
    installed.roots=ids(p.get("roots")?,bodies)?;installed.flights.carriers=ids(p.get("carrierOrder")?,bodies)?;
    for h in &installed.roots{if installed.owner.ship(*h).map_err(r::error)?.module.is_some()||body(bodies,*h)?.ship.as_ref().and_then(|s|s.world.as_ref()).is_none_or(|w|w.carrier.is_some()){return Err(8);}}
    let mut ids_used=BTreeSet::new();for v in p.get("wings")?.array()?{let mut w=v.object()?;let carrier=id(w.get("carrier")?,bodies)?;let wid=nonempty(w.get("id")?)?;if !ids_used.insert(wid.clone())||!installed.flights.carriers.contains(&carrier){return Err(8);}
        let name=nonempty(w.get("name")?)?;let player=w.get("player")?.bool()?;let team=w.get("team")?.int()?as f64;let crr=w.get("crr")?.number()?;if !(0.0..=1.0).contains(&crr){return Err(2);}let spec=j::wing(w.get("spec")?)?;let crafts=ids(w.get("crafts")?,bodies)?;w.done()?;
        let c=body(bodies,carrier)?.ship.as_ref().and_then(|s|s.combat.as_ref()).ok_or(8u32)?;if c.team as f64!=team||c.player!=Some(player){return Err(8);}check_wing(&installed.owner,&spec,carrier)?;
        for h in crafts{let craft=installed.owner.ship(h).map_err(r::error)?;if craft.wing.as_deref()!=Some(&wid)||body(bodies,h)?.ship.as_ref().and_then(|s|s.world.as_ref()).is_none_or(|w|w.carrier!=Some(Handle{slot:carrier.handle,generation:carrier.generation})){return Err(8);}
            if installed.flights.fighters.contains(&h)||installed.flights.bombers.contains(&h){return Err(8);}let list=if spec.role==f::WingRole::Bomber{&mut installed.flights.bombers}else{&mut installed.flights.fighters};list.push(h);}
        let wing=f::Wing{id:wid,carrier,name,spec,player,team,crr,rebuild:Vec::new(),recovered:Vec::new()};if player{installed.flights.player_wings.push(wing);}else{installed.flights.enemy_wings.push(wing);}
    }
    for v in p.get("craftModes")?.array()?{let mut m=v.object()?;let craft=id(m.get("craft")?,bodies)?;let state=f::AIState{mode:mode(m.get("state")?)?,timer:m.get("timer")?.number()?,target:optional_id(m.optional("target"),bodies)?,has_payload:m.get("hasPayload")?.bool()?};let bomber=m.get("bomber")?.bool()?;m.done()?;
        if state.timer<0.0||if bomber{!installed.flights.bombers.contains(&craft)}else{!installed.flights.fighters.contains(&craft)}{return Err(8);}let modes=if bomber{&mut installed.flights.bomber_modes}else{&mut installed.flights.fighter_modes};if modes.iter().any(|m|m.craft==craft){return Err(8);}modes.push(f::ModeRow{craft,state});}
    if installed.flights.fighter_modes.len()!=installed.flights.fighters.len()||installed.flights.bomber_modes.len()!=installed.flights.bombers.len(){return Err(8);}
    // Mode maps retain FighterSystem's actual insertion order across teams;
    // playerWings/enemyWings grouping must never reorder the runtime craft lists.
    installed.flights.fighters=installed.flights.fighter_modes.iter().map(|m|m.craft).collect();
    installed.flights.bombers=installed.flights.bomber_modes.iter().map(|m|m.craft).collect();
    let mut formation=p.get("formation")?.object()?;let mut slots=Vec::new();for v in formation.get("slots")?.array()?{let mut s=v.object()?;let craft=id(s.get("craft")?,bodies)?;let root=id(s.get("root")?,bodies)?;let index=s.get("index")?.int()?as usize;s.done()?;
        let b=body(bodies,craft)?;let source=b.ship.as_ref().and_then(|s|s.world.as_ref()).and_then(|w|w.carrier).ok_or(8u32)?;if installed.owner.root(bodies,Identity{handle:source.slot,generation:source.generation}).map_err(r::error)?!=root{return Err(8);}slots.push((craft,root,index));}
    let mut footprints=Vec::new();for v in formation.get("footprints")?.array()?{let mut fp=v.object()?;let root=id(fp.get("root")?,bodies)?;let radius=fp.get("radius")?.number()?;fp.done()?;if installed.owner.root(bodies,root).map_err(r::error)?!=root{return Err(8);}footprints.push((root,radius));}formation.done()?;
    installed.flights.formation.install(&slots,&footprints).map_err(r::error)?;
    installed.drone=crate::drone_runtime::decode(p.get("drone")?,bodies,&installed.statics,specs)?;p.done()?;
    for m in &installed.owner.ships{installed.owner.root(bodies,m.identity).map_err(r::error)?;for w in &m.wings{check_wing(&installed.owner,w,m.identity)?;}
        for h in &m.deployed{let craft=installed.owner.ship(*h).map_err(r::error)?;if body(bodies,*h)?.ship.as_ref().and_then(|s|s.world.as_ref()).is_none_or(|w|w.carrier!=Some(Handle{slot:m.identity.handle,generation:m.identity.generation}))||craft.wing.is_none(){return Err(8);}}
        if m.wing.is_some()&&!installed.flights.fighters.contains(&m.identity)&&!installed.flights.bombers.contains(&m.identity){return Err(8);}}
    installed.collation.ranks(&installed.owner.ships.iter().map(|s|s.stable_id.clone()).collect::<Vec<_>>()).map_err(r::error)?;
    installed.roster(bodies).map_err(r::error)?;installed.drone.validate(bodies,&installed.statics).map_err(r::error)?;Ok(installed)
}
fn same_footprint(a:&f::Footprint,b:&f::Footprint)->bool{a.radius==b.radius&&a.width==b.width&&a.height==b.height&&a.pivot_x==b.pivot_x&&a.pivot_y==b.pivot_y&&a.bounds==b.bounds}
fn check_wing(owner:&o::Owned,w:&f::WingSpec,carrier:Identity)->Result<(),u32>{let t=owner.templates.iter().find(|t|t.description.handle==w.template).ok_or(8u32)?;let c=owner.ship(carrier).map_err(r::error)?;
    if t.description.spec_id!=w.spec_id||!t.variants.iter().any(|v|v.carrier_spec==c.carrier_spec_key&&v.point_defense==c.carrier_stats.point_defense_skill.filter(|v|*v!=0.0)){return Err(8);}Ok(())}
fn ship(v:&j::Value,bodies:&[Body])->Result<o::ShipMeta,u32>{let mut p=v.object()?;let identity=id(p.get("handle")?,bodies)?;let b=body(bodies,identity)?;if p.get("id")?.int()?!=b.id{return Err(4);}let stable_id=nonempty(p.get("stableId")?)?;let spec_id=nonempty(p.get("specId")?)?;let carrier_spec_key=nonempty(p.get("carrierSpecKey")?)?;
    let role=j::role(p.get("role")?)?;let footprint=j::footprint(p.get("footprint")?)?;let carrier=optional_id(p.optional("sourceCarrier"),bodies)?;let module=p.optional("module").map(|v|{let mut m=v.object()?;let out=o::ModulePose{parent:id(m.get("parent")?,bodies)?,offset:m.get("offset")?.numbers()?,angle:m.get("angle")?.number()?,independent:m.get("independent")?.bool()?};m.done()?;Ok::<_,u32>(out)}).transpose()?;
    let wing=p.optional("wing").map(nonempty).transpose()?;let deployed=ids(p.get("deployed")?,bodies)?;let recall=p.get("recall")?.bool()?;let wings=wings(p.get("wings")?)?;let bays=p.get("bays")?.int()?as usize;let carrier_stats=j::stats(p.get("carrierStats")?)?;
    let mut mounts=Vec::new();for v in p.get("mounts")?.array()?{let mut m=v.object()?;let out=o::MountMeta{component:m.get("component")?.int()?,slot:nonempty(m.get("slot")?)?,generation:m.get("generation")?.int()?,system_only:m.get("systemOnly")?.bool()?,max_ammo_present:m.get("maxAmmoPresent")?.bool()?,regen_present:m.get("regenPresent")?.bool()?,guided_speed:m.optional("guidedSpeed").map(j::Value::number).transpose()?};m.done()?;
        if out.generation==0||out.component==0||out.guided_speed.is_some_and(|v|v<0.0)||mounts.iter().any(|m:&o::MountMeta|m.component==out.component){return Err(8);}mounts.push(out);}
    let engine_slots=p.get("engineSlots")?.array()?.iter().map(j::Value::numbers::<2>).collect::<Result<Vec<_>,_>>()?;p.done()?;
    let s=b.ship.as_ref().ok_or(8u32)?;let c=s.combat.as_ref().ok_or(8u32)?;let w=s.world.as_ref().ok_or(8u32)?;let death=c.death.as_ref().filter(|d|d.complete()).ok_or(8u32)?;
    if death.spec.id!=spec_id||String::from_utf16(&death.strings[3]).map_err(|_|2u32)?!=stable_id||c.radius!=footprint.radius||c.bounds.len()!=footprint.bounds.len()||c.bounds.iter().zip(&footprint.bounds).any(|(a,b)|*a!=[b.x,b.y])
        ||w.parent!=module.as_ref().map(|m|Handle{slot:m.parent.handle,generation:m.parent.generation})||w.carrier!=carrier.map(|h|Handle{slot:h.handle,generation:h.generation})||mounts.len()!=s.components.len()||mounts.iter().zip(&s.components).any(|(m,c)|m.component as f64!=c.data[0])
        ||engine_slots.len()!=s.engines.as_ref().ok_or(8u32)?.engines.len()||engine_slots.iter().zip(&s.engines.as_ref().unwrap().engines).any(|(p,e)|*p!=[e.data[1],e.data[2]]){return Err(8);}
    if let Some(m)=&module{let cfg=death.terrain.ok_or(8u32)?;if [cfg[2],cfg[3]]!=m.offset||cfg[4]!=m.angle||(cfg[5]==1.0)!=m.independent{return Err(8);}}
    Ok(o::ShipMeta{identity,stable_id,spec_id,carrier_spec_key,role,footprint,module,wing,deployed,recall,wings,bays,carrier_stats,mounts,engine_slots,player_target:c.query.as_ref().ok_or(8u32)?.target.map(|h|Identity{handle:h.slot,generation:h.generation}),spawn_admission:None})
}
