//! Source addShip / deploySimulationFleet over the existing whole-Core draft.
//! Static dictionaries, allocator, roots, carriers and both RNGs commit together.
use crate::{ai_resident,battle::Ordnance,contact,flight_admission,flight_owner as fo,
    flight_runtime as fr,flight_static_wire as j,flight_world as fw,lifecycle::Spec,
    random::Random,scene_commands::Outcome,scene_control,scene_owner::{Owned,Root},
    ship_state::{self,Notice},state::{Body,Handle},tactical_ai::Identity,world_owner};
use std::{collections::{BTreeMap,BTreeSet},f64::consts::PI};
struct Descriptor{key:String,carrier:Option<String>,point:Option<f64>,template:u32,cost:Option<f64>}
struct Entry{key:String,cost:f64,radius:f64,station:bool,player:bool,position:Option<[f64;2]>,facing:Option<f64>}
struct Pending{key:String,cost:f64,radius:f64,station:bool,player:bool,team:u32,stable:String,position:[f64;2],facing:f64}
fn text(v:&j::Value)->Result<String,u32>{let s=v.text()?;if s.is_empty()||s.encode_utf16().count()>4096{return Err(2);}Ok(s.to_owned())}
fn row(b:&[Body],h:Handle)->Result<usize,u32>{b.iter().position(|b|b.handle==h).ok_or(4)}
fn handle(h:Identity)->Handle{Handle{slot:h.handle,generation:h.generation}}
fn identity(h:Handle)->Identity{Identity{handle:h.slot,generation:h.generation}}
fn ship(b:&[Body],h:Handle)->Result<&ship_state::ShipState,u32>{b[row(b,h)?].ship.as_ref().ok_or(8)}
fn side(b:&[Body],h:Handle)->Result<bool,u32>{ship(b,h)?.combat.as_ref().and_then(|c|c.player).ok_or(8)}
fn team(b:&[Body],h:Handle)->Result<u32,u32>{Ok(ship(b,h)?.combat.as_ref().ok_or(8u32)?.team)}
fn reject(s:&str)->Outcome{Outcome{accepted:false,reason:Some(s.into())}}
fn next_id(r:&mut Random)->Result<String,u32>{
    if !r.ids.is_finite()||r.ids<0.0||r.ids.fract()!=0.0||r.ids>=9_007_199_254_740_991.0{return Err(5);}
    let mut n=r.next_id()as u64;let mut out=Vec::new();while n>0{let d=(n%36)as u8;out.push(if d<10{(b'0'+d)as char}else{(b'a'+d-10)as char});n/=36;}
    out.reverse();Ok(format!("ship_{}",out.into_iter().collect::<String>()))
}
fn deployment_radius(t:&fo::StaticShip)->f64{t.children.iter().fold(t.footprint.radius,|n,c|n.max(contact::length(c.offset)+deployment_radius(&c.template)))}
fn assembly_radius(t:&fo::StaticShip)->Result<f64,u32>{
    fn visit(t:&fo::StaticShip,p:[f64;2],angle:f64,depth:usize,count:&mut usize)->Result<f64,u32>{
        *count+=1;if depth>8||*count>128{return Err(8);}let mut maximum=contact::length(p)+t.footprint.radius;
        for c in &t.children{let offset=contact::rotate(c.offset,angle);maximum=maximum.max(visit(&c.template,[p[0]+offset[0],p[1]+offset[1]],angle+c.angle,depth+1,count)?);}Ok(maximum)
    }visit(t,[0.0;2],0.0,0,&mut 0)
}
fn geometry_equal(a:f64,b:f64)->bool{(a-b).abs()<=1e-9_f64.max(32.0*f64::EPSILON*a.abs().max(b.abs()).max(1.0))}
fn station(t:&fo::StaticShip)->Result<bool,u32>{Ok(t.spawn_admission.as_ref().ok_or(8u32)?.motion.station)}
fn deployed_points(o:&Owned,b:&[Body],player:bool)->Result<f64,u32>{o.simulation_used(b,player)}
fn same_footprint(a:&fw::Footprint,b:&fw::Footprint)->bool{a.radius==b.radius&&a.width==b.width&&a.height==b.height&&a.pivot_x==b.pivot_x&&a.pivot_y==b.pivot_y&&a.bounds==b.bounds}
fn install_templates(f:&mut fr::Owned,descriptors:&[Descriptor],statics:BTreeMap<String,fo::StaticShip>,specs:&BTreeMap<u32,Spec>)->Result<(),u32>{
    for d in descriptors{let t=statics.get(&d.key).ok_or(8u32)?;
        if f.statics.contains_key(&d.key){return Err(8);}if t.hull_size==0{
            if d.template==0{return Err(8);}if let Some(carrier)=&d.carrier{
                let description=fw::Template{handle:d.template,spec_id:t.spec_id.clone(),fighter:true,role:t.role,footprint:t.footprint.clone()};
                let variant=fo::Variant{carrier_spec:carrier.clone(),point_defense:d.point,ship:t.clone()};
                if let Some(existing)=f.owner.templates.iter_mut().find(|c|c.description.handle==d.template){
                    if existing.description.spec_id!=description.spec_id||existing.description.role!=description.role||!same_footprint(&existing.description.footprint,&description.footprint)
                        ||existing.variants.iter().any(|v|v.carrier_spec==*carrier&&v.point_defense==d.point){return Err(8);}existing.variants.push(variant);
                }else{f.owner.install(fo::CraftTemplate{description,variants:vec![variant]},specs).map_err(fr::error)?;}
            }else if f.owner.templates.iter().any(|c|c.description.spec_id==t.spec_id&&c.description.handle!=d.template){return Err(8);}
        }else if d.template!=0||d.carrier.is_some()||d.point.is_some(){return Err(8);}
    }
    for(key,t)in statics{f.statics.insert(key,t);}Ok(())
}
fn rename_sentinel(o:&mut Owned,b:&mut[Body],w:&mut world_owner::Owned,f:&mut fr::Owned,a:&mut flight_admission::Owned)->Result<(),u32>{
    let h=o.enemy;if o.primary_enemy_deployed||ship(b,h)?.flags&ship_state::DEAD==0||f.roots.contains(&identity(h)){return Err(8);}
    let old=f.owner.ship(identity(h)).map_err(fr::error)?.stable_id.clone();if old!="enemy_ship"{return Err(8);}
    let base=format!("rust-retired-sentinel:{}:{}",h.slot,h.generation);let tree=scene_control::assembly(b,h)?;let mut names=Vec::new();
    for h in &tree{let name=f.owner.ship(identity(*h)).map_err(fr::error)?.stable_id.clone();let suffix=name.strip_prefix(&old).ok_or(8u32)?;
        if !suffix.is_empty()&&!suffix.starts_with(":module:"){return Err(8);}let renamed=format!("{}{}",base,suffix);names.push((name,renamed));}
    let mut all=f.owner.ships.iter().map(|m|m.stable_id.clone()).collect::<Vec<_>>();for name in &mut all{if let Some((_,to))=names.iter().find(|(from,_)|from==name){*name=to.clone();}}a.collation.ranks(&all).map_err(fr::error)?;
    a.allocator.rename(&names).map_err(fr::error)?;
    for(h,(from,to))in tree.iter().zip(&names){let r=row(b,*h)?;b[r].ship.as_mut().ok_or(8u32)?.combat.as_mut().ok_or(8u32)?.death.as_mut().ok_or(8u32)?.strings[3]=to.encode_utf16().collect();
        f.owner.ship_mut(identity(*h)).map_err(fr::error)?.stable_id=to.clone();
        w.terrain.ships.iter_mut().find(|m|m.handle==*h).ok_or(8u32)?.stable_id=to.clone();
        let actor=w.ai.as_mut().ok_or(8u32)?.actor_mut(ai_resident::identity(*h).map_err(|_|4u32)?).map_err(|_|4u32)?;actor.stable_id=to.clone();actor.memory=None;actor.order=None;actor.diagnostics=None;
        w.gravity.as_mut().ok_or(8u32)?.owner.ships.iter_mut().find(|m|m.identity.slot==h.slot&&m.identity.generation==h.generation).ok_or(8u32)?.name=to.clone();
        w.visual.metas.iter_mut().find(|m|m.handle==*h&&m.stable==*from).ok_or(8u32)?.stable=to.clone();
        for born in &mut a.born{if born.ship==*h{born.stable_id=to.clone();}}
    }
    o.roots.retain(|r|r.ship!=h);Ok(())
}
fn initialize_ai(w:&mut world_owner::Owned,h:Handle,target:Handle)->Result<(),u32>{
    w.ai.as_mut().ok_or(8u32)?.actor_mut(ai_resident::identity(h).map_err(|_|4u32)?).map_err(|_|4u32)?
        .initialize_memory(Some(ai_resident::identity(target).map_err(|_|4u32)?)).map_err(|_|8u32)
}
fn visibility(o:&mut Owned,b:&mut[Body],active:&[Handle])->Result<(),u32>{
    let mut teams=BTreeSet::new();for h in active{teams.insert(team(b,*h)?);}for h in active{let r=row(b,*h)?;let s=b[r].ship.as_mut().ok_or(8u32)?;
        let visible=s.flags&(ship_state::DEAD|ship_state::RETREATED|ship_state::DOCKED)==0;let c=s.combat.as_mut().ok_or(8u32)?;let q=c.query.as_mut().ok_or(8u32)?;
        for t in &teams{q.visible.insert(*t,visible||*t==c.team);}q.expected_teams=q.visible.len();o.prelude.as_mut().ok_or(8u32)?.entry_mut(*h)?.public_visible=visible;}
    for h in active{let r=row(b,*h)?;let c=b[r].ship.as_ref().ok_or(8u32)?.combat.as_ref().ok_or(8u32)?;let own=c.team;
        if let Some(target)=c.query.as_ref().ok_or(8u32)?.target{let tc=ship(b,target)?.combat.as_ref().ok_or(8u32)?;if tc.team!=own&&tc.query.as_ref().ok_or(8u32)?.visible.get(&own)!=Some(&true){b[r].ship.as_mut().unwrap().combat.as_mut().unwrap().query.as_mut().unwrap().target=None;}}
    }Ok(())
}
pub fn run(value:&j::Value,o:&mut Owned,b:&mut Vec<Body>,w:&mut world_owner::Owned,ordnance:&mut Ordnance,specs:&mut BTreeMap<u32,Spec>,
    a:&mut flight_admission::Owned,random:&mut Random,visual:&mut Random,events:&mut Vec<(u32,Handle,Notice)>)->Result<Outcome,u32>{
    let mut p=value.object()?;if p.get("version")?.int()!=Ok(1){return Err(8);}let wave=match p.get("kind")?.text()?{"add-ship"=>false,"simulation-wave"=>true,_=>return Err(8)};
    let mut descriptors=Vec::new();let mut raw=BTreeMap::new();for v in p.get("templates")?.array()?{let mut d=v.object()?;
        let key=text(d.get("key")?)?;let carrier=d.optional("carrierSpecKey").map(text).transpose()?;let point=d.optional("pointDefense").map(j::Value::number).transpose()?;
        let template=d.get("template")?.int()?;let cost=d.optional("cost").map(j::Value::number).transpose()?;let constructor=d.get("constructor")?;d.done()?;
        if point.is_some_and(|n|n==0.0)||carrier.is_none()&&point.is_some()||cost.is_some_and(|n|n<=0.0){return Err(2);}
        if raw.insert(key.clone(),constructor).is_some(){return Err(8);}descriptors.push(Descriptor{key,carrier,point,template,cost});}
    if descriptors.is_empty()||descriptors.len()>4096{return Err(8);}let collation=flight_admission::decode_collation(p.get("collation")?)?;
    let mut entries=Vec::new();for v in p.get("entries")?.array()?{let mut e=v.object()?;let out=Entry{key:text(e.get("key")?)?,cost:e.get("cost")?.number()?,radius:e.get("radius")?.number()?,station:e.get("station")?.bool()?,player:e.get("isPlayer")?.bool()?,
        position:e.optional("position").map(j::Value::numbers::<2>).transpose()?,facing:e.optional("facing").map(j::Value::number).transpose()?};e.done()?;entries.push(out);}p.done()?;
    if entries.is_empty(){return Ok(reject("请先选择舰船。"));}if entries.len()>4096||!wave&&entries.len()!=1{return Err(8);}
    if wave&&(!o.simulation||o.result.is_some()){return Ok(reject("当前战斗不能继续部署。"));}
    if entries.iter().any(|e|e.cost<=0.0||e.radius<0.0){return Ok(reject("舰船阵营或部署点无效。"));}
    if w.flight.as_ref().is_none_or(|f|f.stage!=fr::Stage::Closed||f.admission.is_some()){return Err(8);}
    let mut candidate_specs=specs.clone();let mut statics=BTreeMap::new();for d in &descriptors{let t=j::static_ship(&d.key,&raw,&mut candidate_specs,&mut Vec::new())?;
        if t.spawn_admission.is_none(){return Err(8);}statics.insert(d.key.clone(),t);}
    for e in &entries{let d=descriptors.iter().find(|d|d.key==e.key).ok_or(8u32)?;let t=statics.get(&e.key).ok_or(8u32)?;
        // entry.cost is the trusted compiler's deploymentCost certificate;
        // callers never supply a live ship or an independently chosen cost.
        if d.cost.is_some_and(|n|n!=e.cost){return Ok(reject("舰船部署点与内容定义不一致。"));}
        if !geometry_equal(assembly_radius(t)?,e.radius)||station(t)?!=e.station{return Err(8);}}
    let mut counts=[0usize;2];let mut costs=[0.0;2];for e in &entries{let side=(!e.player)as usize;counts[side]+=1;costs[side]+=e.cost;}
    if wave{for i in 0..2{if deployed_points(o,b,i==0)?+costs[i]>o.simulation_limit{return Ok(reject(if i==0{"友军超出部署上限，请减少该方所选舰船。"}else{"敌军超出部署上限，请减少该方所选舰船。"}));}}}
    let initial=wave&&!o.primary_enemy_deployed;let player_pos={let r=row(b,o.player)?;[b[r].motion[0],b[r].motion[1]]};let player_team=team(b,o.player)?;let enemy_team=team(b,o.enemy)?;
    let mut occupied=Vec::new();for h in o.capital(b)?{let s=ship(b,h)?;if s.flags&(ship_state::DEAD|ship_state::RETREATED)==0{let r=row(b,h)?;let root=o.roots.iter().find(|root|root.ship==h).ok_or(8u32)?;occupied.push(([b[r].motion[0],b[r].motion[1]],root.radius,true));}}
    let mut indices=[0usize;2];let mut predicted=random.clone();let mut pending=Vec::new();for e in entries{let i=(!e.player)as usize;let index=indices[i];indices[i]+=1;let team=if wave{if e.player{player_team}else{enemy_team}}else{if e.player{0}else{1}};
        let position=if !wave{e.position.ok_or(8u32)?}else if initial{let columns=counts[i].min(6);let mut pos=[player_pos[0]+((index%columns)as f64-(columns as f64-1.0)/2.0)*1000.0,
            player_pos[1]+(if e.player{1500.0}else{-2600.0})+(if e.player{1.0}else{-1.0})*(index/columns)as f64*1200.0];
            let mut attempts=0;while occupied.iter().any(|(p,r,_)|contact::length([p[0]-pos[0],p[1]-pos[1]])<*r+e.radius+180.0){pos[1]+=if e.player{1200.0}else{-1200.0};attempts+=1;if attempts>16384{return Err(8);}}pos
        }else{o.entry_position(team,e.radius,e.station,&occupied,b)?};
        let facing=if wave{if e.player{-PI/2.0}else{PI/2.0}}else{e.facing.unwrap_or(0.0)};
        let stable=if initial&&!e.player&&index==0{"enemy_ship".into()}else{next_id(&mut predicted)?};let radius=deployment_radius(statics.get(&e.key).ok_or(8u32)?);
        occupied.push((position,radius,true));pending.push(Pending{key:e.key,cost:e.cost,radius,station:e.station,player:e.player,team,stable,position,facing});}
    // Certify all names before changing any live draft dictionary or identity.
    let mut names=w.flight.as_ref().unwrap().owner.ships.iter().map(|m|m.stable_id.clone()).collect::<Vec<_>>();if initial&&pending.iter().any(|e|!e.player){let old="enemy_ship";let base=format!("rust-retired-sentinel:{}:{}",o.enemy.slot,o.enemy.generation);
        for h in scene_control::assembly(b,o.enemy)?{let name=&w.flight.as_ref().unwrap().owner.ship(identity(h)).map_err(fr::error)?.stable_id;let suffix=name.strip_prefix(old).ok_or(8u32)?;let at=names.iter().position(|n|n==name).ok_or(8u32)?;names[at]=format!("{}{}",base,suffix);}}
    fn append_names(t:&fo::StaticShip,id:&str,names:&mut Vec<String>){names.push(id.into());for(i,c)in t.children.iter().enumerate(){append_names(&c.template,&format!("{}:module:{}",id,i),names);}}
    for e in &pending{append_names(&statics[&e.key],&e.stable,&mut names);}collation.ranks(&names).map_err(fr::error)?;
    let mut flight=w.flight.take().ok_or(8u32)?;let result=(||{install_templates(&mut flight,&descriptors,statics,&candidate_specs)?;*specs=candidate_specs;a.collation=collation.clone();flight.collation=collation;
        if initial&&pending.iter().any(|e|!e.player){rename_sentinel(o,b,w,&mut flight,a)?;}
        let mut born=Vec::new();for e in &pending{let stable=if initial&&!e.player&&born.iter().all(|(_,p):&(Handle,bool)|*p){"enemy_ship".into()}else{next_id(random)?};if stable!=e.stable{return Err(8);}
            let t=flight.statics.get(&e.key).ok_or(8u32)?.clone();let initial_team=if e.player{0}else{1};let mut context=fr::Context{bodies:b,world:w,ordnance,specs,random,visual,notices:events,authority:a};
            let h=handle(flight.construct(&mut context,&t,stable,e.position,e.facing,e.player,initial_team,true).map_err(fr::error)?);let r=row(b,h)?;b[r].ship.as_mut().ok_or(8u32)?.combat.as_mut().ok_or(8u32)?.team=e.team;born.push((h,e.player));
            if !wave{let mut context=fr::Context{bodies:b,world:w,ordnance,specs,random,visual,notices:events,authority:a};flight.add_carrier(&mut context,identity(h),None).map_err(fr::error)?;flight.admit_root(b,identity(h)).map_err(fr::error)?;}
        }
        let primary=if initial{born.iter().find(|(_,player)|!*player).map(|(h,_)|*h)}else{None};if let Some(h)=primary{o.enemy=h;initialize_ai(w,h,o.player)?;o.primary_enemy_deployed=true;}
        for((h,player),e)in born.iter().zip(&pending){let root=Root{ship:*h,cost:e.cost,pending:false,station:e.station,radius:e.radius};
            if Some(*h)==primary{let at=o.roots.iter().position(|r|r.ship==o.player).ok_or(8u32)?+1;o.roots.insert(at,root);}else{o.roots.push(root);initialize_ai(w,*h,if *player{o.enemy}else{o.player})?;}
            if wave{if Some(*h)==primary{let at=flight.roots.iter().position(|h|*h==identity(o.player)).ok_or(8u32)?+1;flight.roots.insert(at,identity(*h));}else{flight.admit_root(b,identity(*h)).map_err(fr::error)?;}
                let mut context=fr::Context{bodies:b,world:w,ordnance,specs,random,visual,notices:events,authority:a};flight.add_carrier(&mut context,identity(*h),None).map_err(fr::error)?;o.simulation_costs.push((*h,e.cost));}
        }
        let active=flight.roster(b).map_err(fr::error)?.into_iter().map(handle).collect::<Vec<_>>();w.set_scope(b,active.clone())?;a.query_scope=active.clone();crate::scene_runtime::admit_prelude(o,a)?;
        if wave{visibility(o,b,&active)?;}o.system_read.capture_ordnance(ordnance,w)?;Ok(Outcome{accepted:true,reason:None})
    })();w.flight=Some(flight);result
}
