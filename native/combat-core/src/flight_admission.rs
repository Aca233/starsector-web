//! Actual generated-tree registration. No ShipState mirror or JS rule callback.
//! Core owns the outer clone transaction and publishes/commits Born records.
use crate::{ai_owner as a,ai_resident as ai,aux_world as aux,flight_allocator as alloc,
    flight_owner as f,flight_runtime,flight_static_wire::{Value,integer},flight_world::Error,
    gravity_owner as go,lifecycle::Spec,motion_owner,phase_runtime,scene_prelude,
    ship_effects,state::{Body,Handle},tactical_ai::Identity,terrain_owner as terrain,world_owner};
use std::collections::{BTreeMap,BTreeSet};
#[derive(Clone)]pub struct Phase{pub anchor:Option<f64>,pub controls:Vec<(u32,ship_effects::ControlSpec)>}
#[derive(Clone)]pub struct Actor{pub meta:ai::Actor,pub module_slot:Option<String>,pub module_x:Option<f64>,pub module_y:Option<f64>,pub module_angle:Option<f64>,pub slots:Vec<String>}
#[derive(Clone)]pub struct Aux{pub payloads:[aux::Payload;2],pub stealth:Option<u32>,pub hooks:u32,pub ineligible:bool,pub drone:bool,pub travel:Vec<u32>}
#[derive(Clone)]pub struct PropulsionStatic{pub slots:Vec<Option<usize>>,pub reserves:[f64;3]}
#[derive(Clone)]pub struct SystemRead{pub tactical_count:usize,pub module_slot:Option<String>,pub propulsion:Option<PropulsionStatic>}
impl SystemRead{pub fn valid(&self)->bool{self.tactical_count<=64&&self.module_slot.as_ref().is_none_or(|s|!s.is_empty()&&s.encode_utf16().count()<=4096)
    &&self.propulsion.as_ref().is_none_or(|p|p.slots.len()<=128&&p.reserves.iter().all(|n|n.is_finite()))}}
#[derive(Clone)]pub struct Template{
    pub spec_key:String,pub phase:Phase,pub ai:Actor,pub aux:Aux,pub motion:motion_owner::Meta,
    pub gravity_rows:Vec<[f64;23]>,pub prelude:scene_prelude::Entry,pub visual:crate::combat_visuals::VisualMeta,pub read:crate::scene_read::Meta,pub system_read:SystemRead,
}
#[derive(Clone)]pub struct Born{pub ship:Handle,pub stable_id:String,pub spec_key:String,pub prelude:scene_prelude::Entry,pub read:crate::scene_read::Meta,pub system_read:crate::scene_system_publication::Meta}
#[derive(Clone)]pub struct Namespace{pub prefix:String,pub rank:u32,pub dynamic:bool}
#[derive(Clone,Default)]pub struct Collation{pub namespaces:Vec<Namespace>,pub alphabet:Vec<(char,u32)>,pub mounts:Vec<(String,u32)>}
impl Collation{
    fn key(&self,s:&str)->Result<(u32,Vec<u32>),Error>{
        let mut found=None;for n in &self.namespaces{let suffix=if n.dynamic{s.strip_prefix(&n.prefix)}else{(s==n.prefix).then_some("")};
            if let Some(suffix)=suffix{if found.is_some(){return Err(Error::InvalidTopology);}let key=if n.dynamic{
                let(counter,modules)=suffix.split_once(':').map_or((suffix,None),|(c,m)|(c,Some(m)));
                if counter.is_empty()||counter.len()>11||!counter.chars().all(|c|c.is_ascii_digit()||c.is_ascii_lowercase())
                    ||modules.is_some_and(|m|{let p=m.split(':').collect::<Vec<_>>();p.len()>64||p.chunks(2).any(|p|p.len()!=2||p[0]!="module"||p[1].is_empty()||p[1].len()>10||!p[1].chars().all(|c|c.is_ascii_digit()))}){return Err(Error::InvalidIdentity);}
                suffix.chars().map(|c|self.alphabet.iter().find(|(ch,_)|*ch==c).map(|(_,r)|*r).ok_or(Error::Unsupported)).collect::<Result<Vec<_>,_>>()?
            }else{Vec::new()};found=Some((n.rank,key));}}
        found.ok_or(Error::Unsupported)
    }
    pub fn ranks(&self,ids:&[String])->Result<BTreeMap<String,u32>,Error>{
        let mut rows=ids.iter().map(|s|Ok((self.key(s)?,s.clone()))).collect::<Result<Vec<_>,Error>>()?;rows.sort_by(|a,b|a.0.cmp(&b.0));
        if rows.windows(2).any(|w|w[0].0==w[1].0||w[0].1==w[1].1){return Err(Error::InvalidIdentity);}
        rows.into_iter().enumerate().map(|(i,(_,s))|Ok((s,u32::try_from(i).map_err(|_|Error::InvalidIdentity)?))).collect()
    }
}
#[derive(Clone)]pub struct Owned{pub allocator:alloc::Owned,pub collation:Collation,pub query_scope:Vec<Handle>,pub born:Vec<Born>}
fn core(h:Identity)->Handle{Handle{slot:h.handle,generation:h.generation}}
fn row(b:&[Body],h:Handle)->Result<usize,Error>{b.iter().position(|b|b.handle==h).ok_or(Error::StaleIdentity)}
fn err(_:u32)->Error{Error::HostFailure}
impl Owned{
    pub fn new(allocator:alloc::Owned,collation:Collation,query_scope:Vec<Handle>,bodies:&[Body])->Result<Self,Error>{
        for(i,h)in query_scope.iter().enumerate(){row(bodies,*h)?;if query_scope[..i].contains(h){return Err(Error::InvalidIdentity);}}
        Ok(Self{allocator,collation,query_scope,born:Vec::new()})
    }
}
impl flight_runtime::Authority for Owned{
    fn allocate(&mut self,stable:&str)->Result<f::Allocation,Error>{self.collation.key(stable)?;self.allocator.allocate(stable)}
    fn admitted(&mut self,bodies:&mut Vec<Body>,owner:&mut f::Owned,world:&mut world_owner::Owned,specs:&BTreeMap<u32,Spec>,tree:&[Identity])->Result<(),Error>{
        if tree.is_empty()||world.phase.is_none()||world.ai.is_none()||world.aux.is_none()||world.motion.is_none(){return Err(Error::HostFailure);}
        let mut seen=BTreeSet::new();let mut entries=Vec::new();
        for h in tree{let handle=core(*h);if !seen.insert((handle.slot,handle.generation))||self.born.iter().any(|b|b.ship==handle){return Err(Error::InvalidIdentity);}
            let r=row(bodies,handle)?;let meta=owner.ship(*h)?;let template=meta.spawn_admission.as_ref().ok_or(Error::Unsupported)?.clone();
            if template.spec_key.is_empty()||!self.allocator.born.iter().any(|b|b.allocation.identity==*h&&b.stable_id==meta.stable_id){return Err(Error::InvalidIdentity);}
            if meta.mounts.len()!=template.ai.slots.len()||meta.mounts.iter().zip(&template.ai.slots).any(|(m,s)|m.slot!=*s)
                ||template.visual.mounts.len()!=meta.mounts.len()||template.visual.mounts.iter().zip(&meta.mounts).any(|(v,m)|v.slot!=m.slot||v.component!=m.component)
                ||template.ai.meta.memory.is_some()||template.ai.meta.order.is_some(){return Err(Error::InvalidTopology);}
            let ship=bodies[r].ship.as_ref().ok_or(Error::HostFailure)?;
            if template.phase.controls.len()!=ship.systems.len()||template.phase.controls.iter().any(|(id,_)|!ship.systems.iter().any(|s|s.id==*id))
                ||template.aux.travel.iter().any(|id|!ship.systems.iter().any(|s|s.id==*id))||template.aux.hooks>2||template.aux.stealth.is_some()!=(template.aux.hooks>0){return Err(Error::InvalidTopology);}
            if let Some(m)=&meta.module{if template.ai.module_slot.is_none()||template.ai.module_x.is_none()||template.ai.module_y.is_none()||template.ai.module_angle.is_none_or(|a|a*std::f64::consts::PI/180.0!=m.angle)
                    ||template.motion.independent!=m.independent{return Err(Error::InvalidTopology);}}
            else if template.ai.module_slot.is_some()||template.ai.module_x.is_some()||template.ai.module_y.is_some()||template.ai.module_angle.is_some(){return Err(Error::InvalidTopology);}
            entries.push((r,meta.clone(),template));}
        // All topology is present before any consumer receives the new tree.
        for(r,meta,_)in &entries{
            {let s=bodies[*r].ship.as_mut().ok_or(Error::HostFailure)?;let death=s.combat.as_mut().ok_or(Error::HostFailure)?.death.as_mut().ok_or(Error::HostFailure)?;
                death.strings[3]=meta.stable_id.encode_utf16().collect();let cfg=death.terrain.as_mut().ok_or(Error::HostFailure)?;
                if let Some(m)=&meta.module{cfg[2..4].copy_from_slice(&m.offset);cfg[4]=m.angle;cfg[5]=m.independent as u32 as f64;}else{cfg[2..].fill(0.0);}}
            let b=&bodies[*r];let s=b.ship.as_ref().ok_or(Error::HostFailure)?;let w=s.world.as_ref().ok_or(Error::HostFailure)?;let death=s.combat.as_ref().ok_or(Error::HostFailure)?.death.as_ref().ok_or(Error::HostFailure)?;let cfg=death.terrain.ok_or(Error::HostFailure)?;
            let identity=terrain::identity(b);let module=meta.module.as_ref().map(|m|{let p=&bodies[row(bodies,core(m.parent))?];Ok(terrain::Module{parent:terrain::identity(p),offset:m.offset,angle:m.angle,independent:m.independent})}).transpose()?;
            let children=w.children.iter().map(|h|row(bodies,*h).map(|r|terrain::identity(&bodies[r]))).collect::<Result<Vec<_>,_>>()?;
            if world.terrain.ships.iter().any(|m|m.handle==b.handle){return Err(Error::InvalidIdentity);}
            world.terrain.ships.push(terrain::Meta{identity,handle:b.handle,stable_id:meta.stable_id.clone(),mass:cfg[0],station:cfg[1]==1.0,module,children,sprite_height:death.sprite_height,slots:death.slot_positions.clone(),terrain_speed:1.0,emergency_phase_used:false,fighter_recall:meta.recall});
        }
        for(r,meta,t)in &entries{let h=bodies[*r].handle;let phase=world.phase.as_mut().ok_or(Error::HostFailure)?;
            if let Some(cost)=t.phase.anchor{phase.install(bodies,h,cost).map_err(err)?;}
            for(sid,c)in &t.phase.controls{phase.install_control(bodies,h,*sid,*c).map_err(err)?;}
            let mut actor=t.ai.meta.clone();actor.identity=ai::identity(h).map_err(|_|Error::InvalidIdentity)?;actor.stable_id=meta.stable_id.clone();
            actor.attachment=a::Attachment{parent:meta.module.as_ref().map(|m|ai::identity(core(m.parent))).transpose().map_err(|_|Error::InvalidIdentity)?,slot:t.ai.module_slot.clone(),x:t.ai.module_x,y:t.ai.module_y,angle_deg:t.ai.module_angle};
            actor.order=None;actor.memory=None;actor.diagnostics=None;actor.defense_facing=None;world.ai.as_mut().ok_or(Error::HostFailure)?.actors.push(actor);
            let aux=world.aux.as_mut().ok_or(Error::HostFailure)?;aux.install_ship(aux::ShipMeta{identity:world_owner::identity(&bodies[*r]),handle:h,payloads:t.aux.payloads,stealth:t.aux.stealth,ineligible:t.aux.ineligible,drone:t.aux.drone,travel_systems:t.aux.travel.clone()}).map_err(err)?;
            aux.hooks.push((h,t.aux.hooks));let mut motion=t.motion.clone();motion.ship=h;world.motion.as_mut().ok_or(Error::HostFailure)?.ships.push(motion);
            let terrain=world.terrain.meta(terrain::identity(&bodies[*r])).map_err(err)?;
            if let Some(gravity)=world.gravity.as_mut(){let identity=crate::system_world::Identity{slot:h.slot,generation:h.generation};
                gravity.owner.ships.push(go::ShipMeta{identity,name:meta.stable_id.clone(),mass:terrain.mass,fixed:terrain.station,module_hull:bodies[*r].ship.as_ref().unwrap().combat.as_ref().unwrap().size!=0&&meta.module.is_some(),
                    module:meta.module.as_ref().map(|m|go::ModulePose{parent:crate::system_world::Identity{slot:m.parent.handle,generation:m.parent.generation},offset:m.offset,angle:m.angle,independent_rotation:m.independent}),
                    children:bodies[*r].ship.as_ref().unwrap().world.as_ref().unwrap().children.iter().map(|h|crate::system_world::Identity{slot:h.slot,generation:h.generation}).collect(),systems:Vec::new(),mounts:Vec::new()});
                for words in &t.gravity_rows{crate::gravity_wire::admit_static(integer(words[0]).map_err(err)?,&words[1..],world,bodies,specs,*r).map_err(err)?;}
            }else if !t.gravity_rows.is_empty(){return Err(Error::HostFailure);}
            if let Some(g)=world.gravity.as_ref(){let h=bodies[*r].handle;let m=g.owner.ships.iter().find(|m|m.identity.slot==h.slot&&m.identity.generation==h.generation).ok_or(Error::HostFailure)?;
                let s=bodies[*r].ship.as_ref().unwrap();let w=s.world.as_ref().unwrap();
                if w.metas.iter().any(|(sid,meta)|matches!(meta.kind,ship_effects::Kind::GravityWell|ship_effects::Kind::GravityBattleWell|ship_effects::Kind::GravityOther)&&!w.gravity_systems.contains(sid))
                    ||m.systems.iter().any(|a|a.name.is_empty()||match a.kind{crate::gravity_world::Kind::Well|crate::gravity_world::Kind::Repulsor|crate::gravity_world::Kind::Release|crate::gravity_world::Kind::BattleWell|crate::gravity_world::Kind::BattleRepulsor=>a.field_spec.is_none_or(|f|f.radius<=0.0||f.duration<=0.0)
                        ||a.kind==crate::gravity_world::Kind::BattleWell&&(a.collapse_spec.is_none()||a.auto.is_none()),crate::gravity_world::Kind::Collapse=>a.collapse_spec.is_none(),crate::gravity_world::Kind::Maneuver=>a.maneuver_spec.is_none(),crate::gravity_world::Kind::Push=>a.push_spec.is_none(),crate::gravity_world::Kind::Polarity=>false})
                    ||m.mounts.iter().any(|m|m.name.is_empty()||m.tractor_spec.is_some()==m.deflector_spec.is_some()){return Err(Error::InvalidTopology);}}
            world.visual.admit(h,meta.stable_id.clone(),t.visual.clone(),bodies).map_err(err)?;
            let mut prelude=t.prelude.clone();prelude.meta.ship=h;let mut read=t.read.clone();read.ship=h;
            let children=&bodies[*r].ship.as_ref().ok_or(Error::HostFailure)?.world.as_ref().ok_or(Error::HostFailure)?.children;
            let propulsion=t.system_read.propulsion.as_ref().map(|p|{let slots=p.slots.iter().map(|slot|slot.map(|i|children.get(i).copied().ok_or(Error::InvalidTopology)).transpose()).collect::<Result<Vec<_>,_>>()?;
                for child in slots.iter().flatten(){if bodies[row(bodies,*child)?].ship.as_ref().and_then(|s|s.world.as_ref()).is_none_or(|w|w.parent!=Some(h)){return Err(Error::InvalidTopology);}}
                Ok(crate::scene_system_publication::Propulsion{slots,reserves:p.reserves})}).transpose()?;
            let system_read=crate::scene_system_publication::Meta{ship:h,tactical_count:t.system_read.tactical_count,module_slot:t.system_read.module_slot.clone(),propulsion};
            if !system_read.valid()||system_read.module_slot!=t.ai.module_slot{return Err(Error::InvalidTopology);}
            if let Some(p)=&system_read.propulsion{world.motion.as_mut().ok_or(Error::HostFailure)?.admit_propulsion(h,p.clone()).map_err(err)?;}
            self.born.push(Born{ship:h,stable_id:meta.stable_id.clone(),spec_key:t.spec_key.clone(),prelude,read,system_read});
        }
        let ranks=self.collation.ranks(&owner.ships.iter().map(|m|m.stable_id.clone()).collect::<Vec<_>>())?;
        for actor in &mut world.ai.as_mut().ok_or(Error::HostFailure)?.actors{actor.locale_rank=*ranks.get(&actor.stable_id).ok_or(Error::HostFailure)?;
            let h=ai::core_handle(actor.identity).map_err(|_|Error::InvalidIdentity)?;let ship=owner.ship(Identity{handle:h.slot,generation:h.generation})?;
            for mount in &mut actor.mounts{let slot=&ship.mounts.iter().find(|m|m.component==mount.component).ok_or(Error::InvalidTopology)?.slot;
                mount.locale_rank=self.collation.mounts.iter().find(|(s,_)|s==slot).map(|(_,r)|*r).ok_or(Error::Unsupported)?;}}
        for meta in &owner.ships{let r=row(bodies,core(meta.identity))?;let q=bodies[r].ship.as_mut().unwrap().combat.as_mut().unwrap().query.as_mut().ok_or(Error::HostFailure)?;
            q.tie=*ranks.get(&meta.stable_id).ok_or(Error::HostFailure)?;}
        for(r,_,_)in &entries{let q=bodies[*r].ship.as_mut().unwrap().combat.as_mut().unwrap().query.as_mut().ok_or(Error::HostFailure)?;q.scope=self.query_scope.clone();q.expected_scope=q.scope.len();}
        if let Some(g)=world.gravity.as_mut(){g.owner.collation.keys.retain(|(k,_)|!k.starts_with("SHIP:"));g.owner.collation.keys.extend(ranks.iter().map(|(s,r)|(format!("SHIP:{}",s),*r)));}
        world.terrain.validate(bodies,specs).map_err(err)?;if !world.phase.as_ref().unwrap().complete(bodies,specs){return Err(Error::HostFailure);}
        world.ai.as_ref().unwrap().validate(bodies,specs).map_err(|_|Error::HostFailure)?;world.motion.as_ref().unwrap().validate(bodies).map_err(err)?;
        Ok(())
    }
}

fn text(v:&Value)->Result<String,u32>{let s=v.text()?;if s.is_empty(){Err(8)}else{Ok(s.to_owned())}}
fn optional(v:Option<&Value>)->Result<Option<f64>,u32>{v.map(Value::number).transpose()}
pub fn decode_collation(v:&Value)->Result<Collation,u32>{let mut p=v.object()?;let mut namespaces=Vec::new();let mut alphabet=Vec::new();let mut mounts=Vec::new();
    for v in p.get("namespaces")?.array()?{let mut n=v.object()?;let prefix=text(n.get("prefix")?)?;let rank=n.get("rank")?.int()?;let dynamic=n.get("dynamic")?.bool()?;n.done()?;
        if namespaces.iter().any(|n:&Namespace|n.prefix==prefix||n.rank==rank)||rank as usize!=namespaces.len(){return Err(8);}namespaces.push(Namespace{prefix,rank,dynamic});}
    for v in p.get("alphabet")?.array()?{let mut c=v.object()?;let code=c.get("code")?.int()?;let rank=c.get("rank")?.int()?;c.done()?;let ch=char::from_u32(code).ok_or(2u32)?;
        if !":0123456789abcdefghijklmnopqrstuvwxyz".contains(ch)||alphabet.iter().any(|(c,r)|*c==ch||*r==rank)||rank as usize!=alphabet.len(){return Err(8);}alphabet.push((ch,rank));}
    for v in p.get("mounts")?.array()?{let mut m=v.object()?;let slot=text(m.get("slot")?)?;let rank=m.get("rank")?.int()?;m.done()?;
        if mounts.iter().any(|(s,r)|*s==slot||*r==rank)||rank as usize!=mounts.len(){return Err(8);}mounts.push((slot,rank));}
    p.done()?;if alphabet.len()!=37{return Err(8);}Ok(Collation{namespaces,alphabet,mounts})
}
pub fn decode(v:&Value)->Result<Template,u32>{
    let mut p=v.object()?;let spec_key=text(p.get("specKey")?)?;let mut ph=p.get("phase")?.object()?;
    let anchor=optional(ph.optional("anchorCRCost"))?;if anchor.is_some_and(|n|n<0.0){return Err(2);}let mut controls=Vec::new();
    for v in ph.get("controls")?.array()?{let mut c=v.object()?;let id=c.get("systemId")?.int()?;let flags=c.get("flags")?.int()?;if flags>1023||controls.iter().any(|(sid,_)|*sid==id){return Err(8);}
        let spec=ship_effects::ControlSpec{flags,phase:c.get("phase")?.bool()?,vulnerable_up:c.get("vulnerableUp")?.bool()?,vulnerable_down:c.get("vulnerableDown")?.bool()?};c.done()?;controls.push((id,spec));}ph.done()?;
    let actor=decode_actor(p.get("ai")?)?;let mut au=p.get("aux")?.object()?;let payload=au.get("payloads")?.array()?;if payload.len()!=2{return Err(2);}let mut payloads=[aux::Payload{damage:0.0,launch_speed:0.0,hp:0.0,flight:0.0};2];
    for(i,v)in payload.iter().enumerate(){let mut a=v.object()?;payloads[i]=aux::Payload{damage:a.get("damage")?.number()?,launch_speed:a.get("launchSpeed")?.number()?,hp:a.get("hp")?.number()?,flight:a.get("flight")?.number()?};a.done()?;}
    let stealth=au.optional("stealth").map(Value::int).transpose()?;let hooks=au.get("stealthHooks")?.int()?;if stealth.is_some_and(|n|!matches!(n,1|2))||hooks>2{return Err(2);}
    let auxiliary=Aux{payloads,stealth,hooks,ineligible:au.get("ineligible")?.bool()?,drone:au.get("drone")?.bool()?,travel:au.get("travelSystems")?.array()?.iter().map(Value::int).collect::<Result<_,_>>()?};au.done()?;
    let mut mo=p.get("motion")?.object()?;let motion=motion_owner::Meta{ship:Handle{slot:0,generation:0},station:mo.get("station")?.bool()?,axial:mo.get("axial")?.bool()?,independent:mo.get("independent")?.bool()?,inherit:mo.get("inherit")?.bool()?,turn_acceleration:mo.get("turnAcceleration")?.number()?,max_turn:mo.get("maxTurn")?.number()?};mo.done()?;
    if motion.turn_acceleration<0.0||motion.max_turn<0.0{return Err(2);}let gravity_rows=p.get("gravityRows")?.array()?.iter().map(Value::numbers::<23>).collect::<Result<Vec<_>,_>>()?;
    for r in &gravity_rows{let tag=integer(r[0])?;let used=match tag{95=>2,96=>15,97=>9,98=>match integer(r[2])?{0=>8,1=>6,_=>return Err(2)},99=>15,100=>6,
            103=>{let count=integer(r[4])?as usize;if count==0||count>18{return Err(2);}4+count},_=>return Err(8)};
        if r[1+used..].iter().any(|n|*n!=0.0){return Err(2);}}
    let mut pr=p.get("prelude")?.object()?;let prelude=scene_prelude::Entry{meta:scene_prelude::Meta{ship:Handle{slot:0,generation:0},station_module:pr.get("stationModule")?.bool()?,combat_module:pr.get("combatModule")?.bool()?,shared_flux:pr.get("sharedFlux")?.bool()?,ecm:pr.get("ecm")?.number()?,nav:pr.get("nav")?.number()?,penalty_multiplier:pr.get("penaltyMultiplier")?.number()?,speed_percent:pr.get("speedPercent")?.number()?,dissipation:pr.get("dissipation")?.number()?,hard_fraction:pr.get("hardFraction")?.number()?},
        module_bonus:pr.get("moduleBonus")?.number()?,module_hard:pr.get("moduleHard")?.number()?,public_visible:pr.get("publicVisible")?.bool()?,fleet_speed:0.0,ecm_penalty:0.0};pr.done()?;
    let visual=crate::visual_wire::decode_meta(p.get("visual")?)?;let mut re=p.get("read")?.object()?;
    let read=crate::scene_read::Meta{ship:Handle{slot:0,generation:1},sight_flat:re.get("sightFlat")?.number()?,sight_percent:re.get("sightPercent")?.number()?,weapon_repair:re.get("weaponRepair")?.number()?};re.done()?;
    let mut sr=p.get("systemRead")?.object()?;let tactical_count=sr.get("tacticalCount")?.int()?as usize;let module_slot=sr.optional("moduleSlot").map(text).transpose()?;
    let propulsion=sr.optional("propulsion").map(|v|{let mut p=v.object()?;let slots=p.get("slots")?.array()?.iter().map(|v|match v{Value::Null=>Ok(None),_=>v.int().map(|n|Some(n as usize))}).collect::<Result<Vec<_>,u32>>()?;
        let reserves=p.get("reserves")?.numbers()?;p.done()?;Ok::<_,u32>(PropulsionStatic{slots,reserves})}).transpose()?;sr.done()?;
    let system_read=SystemRead{tactical_count,module_slot,propulsion};
    p.done()?;if !prelude.meta.valid()||!read.valid()||!system_read.valid(){return Err(2);}Ok(Template{spec_key,phase:Phase{anchor,controls},ai:actor,aux:auxiliary,motion,gravity_rows,prelude,visual,read,system_read})
}
fn decode_actor(v:&Value)->Result<Actor,u32>{let mut p=v.object()?;let mut mounts=Vec::new();let mut slots=Vec::new();
    for v in p.get("mounts")?.array()?{let mut m=v.object()?;slots.push(text(m.get("slot")?)?);let meta=ai::MountMeta{component:m.get("component")?.int()?,locale_rank:m.get("localeRank")?.int()?,dps:m.get("dps")?.number()?,authored_max_speed:m.get("authoredMaxSpeed")?.number()?,position_turn_rate:m.get("positionTurnRate")?.number()?,forecast_turn_rate:m.get("forecastTurnRate")?.number()?,fixed:m.get("fixed")?.bool()?,beam_duration:optional(m.optional("beamDuration"))?,role:match m.get("role")?.text()?{"NONE"=>ai::RoleCertificate::None,"POINT_DEFENSE"=>ai::RoleCertificate::PointDefense,"AXIAL"=>ai::RoleCertificate::Axial,_=>return Err(8)},original_point_defense:m.get("originalPointDefense")?.bool()?,stage_flags:m.get("stageFlags")?.int()?,stage_hints:m.get("stageHints")?.int()?};m.done()?;mounts.push(meta);}
    let mut systems=Vec::new();for v in p.get("systems")?.array()?{let mut s=v.object()?;let kind=match s.get("ai")?.text()?{"NONE"=>a::SystemAI::None,"ECLIPSE"=>a::SystemAI::Eclipse,"ADUN_FORGE"=>a::SystemAI::AdunForge,"ADUN_BARRIER"=>a::SystemAI::AdunBarrier,"ADUN_REPAIR"=>a::SystemAI::AdunRepair,
        name=>a::SystemAI::Special(match name{"GLORIANA_EDICT"=>a::SpecialAI::GlorianaEdict,"HYPERION_YAMATO"=>a::SpecialAI::HyperionYamato,"HYPERION_JUMP"=>a::SpecialAI::HyperionJump,"ROCINANTE_ATTITUDE"=>a::SpecialAI::RocinanteAttitude,"ROCINANTE_FIRE"=>a::SpecialAI::RocinanteLocalFireControl,"ZHEFENG"=>a::SpecialAI::Zhefeng,"GRAVITY_MANEUVER"=>a::SpecialAI::GravityManeuver,"GRAVITY_FIELD"=>a::SpecialAI::GravityField,"GRAVITY_COLLAPSE"=>a::SpecialAI::GravityCollapse,_=>return Err(8)})};
        systems.push(ai::SystemMeta{id:s.get("id")?.int()?,ai:kind,defense:s.get("defense")?.bool()?,active_speed_flat:s.get("activeSpeedFlat")?.number()?});s.done()?;}
    let wings=p.get("wings")?.array()?.iter().map(|v|{let mut w=v.object()?;let wing=ai::Wing{count:w.get("count")?.number()?,range:optional(w.optional("range"))?};w.done()?;Ok(wing)}).collect::<Result<_,u32>>()?;
    let meta=ai::Actor{identity:Identity{handle:0,generation:0},stable_id:String::new(),locale_rank:0,spec_speed:p.get("specSpeed")?.number()?,spec_armor:p.get("specArmor")?.number()?,spec_hp:p.get("specHp")?.number()?,attachment:a::Attachment{parent:None,slot:None,x:None,y:None,angle_deg:None},attached_motion:p.get("attachedMotion")?.bool()?,tactical_present:p.get("tacticalPresent")?.bool()?,native_forecast:p.get("nativeForecast")?.bool()?,do_not_back_off:p.get("doNotBackOff")?.number()?,system_drone:p.get("systemDrone")?.bool()?,prevents_ai_venting:p.get("preventsAIVenting")?.bool()?,training_action:if p.get("trainingAction")?.number()? == -1.0{-1}else{return Err(8)},system_mode:p.optional("systemMode").map(text).transpose()?,fighter_bays:p.get("fighterBays")?.int()?as usize,wings,wing_range_multiplier:p.get("wingRangeMultiplier")?.number()?,mounts,systems,order:None,memory:None,diagnostics:None,defense_facing:None};
    let module_slot=p.optional("moduleSlot").map(text).transpose()?;let module_x=optional(p.optional("moduleX"))?;let module_y=optional(p.optional("moduleY"))?;let module_angle=optional(p.optional("moduleAngleDeg"))?;p.done()?;Ok(Actor{meta,module_slot,module_x,module_y,module_angle,slots})
}
