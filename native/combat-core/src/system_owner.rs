//! Seven-pack world effects execute against the same resident combat transaction.
//! Lifecycle is owned only by ShipState.systems; Meta retains accepted world state.
use crate::{battle::{Ordnance,SHOT_SPAWNED},lifecycle::{self,Spec,System},motion,projectile::{Delivery,Projectile},random::Random,
    ship_effects as e,ship_state::{self,Notice,ShipState},state::{Body,Handle},system_world as w,weapon_fire::{Emission,EmissionKind}};
use std::collections::BTreeMap;

pub const GLORIANA:u32=1;pub const HYPERION:u32=2;pub const REACTOR:u32=4;pub const FOCUS:u32=8;
pub const CORONA:u32=16;pub const ENGINEERING:u32=32;pub const LOADER:u32=64;
#[derive(Clone)]
pub struct Meta{pub kind:e::Kind,pub input:Option<e::ActivationInput>,pub jump:e::TacticalJump,pub regen:f64}
#[derive(Clone)]
pub struct Launcher{pub damage:f64,pub emp:f64,pub range:f64,pub speed:f64,pub launch_speed:f64,pub speed_bonus:f64,pub weapon_type:u32,pub delivery:Option<Delivery>}
#[derive(Clone)]
pub struct Owned{
    pub flags:u32,pub parent:Option<Handle>,pub carrier:Option<Handle>,pub children:Vec<Handle>,pub expected_children:usize,pub side:i32,
    pub range_multiplier:f64,pub muzzle:Option<[f64;2]>,pub aim:[f64;2],pub previous:[f64;2],pub previous_facing:f64,pub sequence:f64,pub camera:[f64;2],
    pub metas:BTreeMap<u32,Meta>,pub bulkheads:Option<e::Bulkheads>,pub repair:Option<e::FieldRepair>,pub compensation:Option<e::Compensation>,
    pub runtime:Vec<(u32,e::Modifiers)>,pub launcher:Option<Launcher>,
    pub gravity_systems:Vec<u32>,pub gravity_collapsed:Vec<u32>,pub gravity_mounts:Vec<u32>,
}
impl Owned{
    pub fn new(row:&[f64],pose:&[f64;motion::WIDTH])->Self{Self{flags:row[0]as u32,parent:if row[1]==1.0{Some(Handle{slot:row[2]as u32,generation:row[3]as u32})}else{None},
        carrier:if row[4]==1.0{Some(Handle{slot:row[5]as u32,generation:row[6]as u32})}else{None},expected_children:row[7]as usize,children:Vec::new(),side:row[8]as i32,
        range_multiplier:row[9],muzzle:if row[10]==1.0{Some([row[11],row[12]])}else{None},aim:[pose[0],pose[1]],previous:[pose[0],pose[1]],previous_facing:pose[4],sequence:0.0,camera:[0.0;2],
        metas:BTreeMap::new(),bulkheads:None,repair:None,compensation:None,runtime:Vec::new(),launcher:None,gravity_systems:Vec::new(),gravity_collapsed:Vec::new(),gravity_mounts:Vec::new()}}
    pub fn complete(&self,s:&ShipState)->bool{self.children.len()==self.expected_children&&self.metas.len()==s.systems.len()&&s.systems.iter().all(|x|self.metas.contains_key(&x.id))
        &&self.launcher.as_ref().is_none_or(|l|l.delivery.is_some())&&s.combat.as_ref().is_none_or(|c|c.fire.iter().all(|e|e.range_inputs.is_some()))}
    pub fn valid(&self)->bool{self.runtime.iter().all(|(_,m)|m.valid())&&self.metas.values().all(|m|m.regen.is_finite())
        &&self.previous.into_iter().chain([self.previous_facing,self.sequence,self.range_multiplier]).chain(self.camera).chain(self.aim).all(f64::is_finite)
        &&self.metas.values().all(|m|input_words(m.input).into_iter().chain(m.jump.words()).all(f64::is_finite))
        &&self.bulkheads.as_ref().is_none_or(|x|x.words().into_iter().all(f64::is_finite))&&self.repair.as_ref().is_none_or(|x|x.words().into_iter().chain(x.cycles.iter().copied()).all(f64::is_finite))
        &&self.compensation.as_ref().is_none_or(|x|x.words().into_iter().all(f64::is_finite))&&self.launcher.as_ref().is_none_or(|l|[l.damage,l.emp,l.range,l.speed,l.launch_speed,l.speed_bonus].into_iter().all(f64::is_finite))}
    pub fn words(&self,s:&ShipState)->Vec<f64>{let p=self.parent;let c=self.carrier;let b=self.bulkheads.as_ref();let r=self.repair.as_ref();let comp=self.compensation.as_ref();
        let mut out=vec![self.flags as f64,p.is_some()as u32 as f64,p.map_or(0,|h|h.slot)as f64,p.map_or(0,|h|h.generation)as f64,
            c.is_some()as u32 as f64,c.map_or(0,|h|h.slot)as f64,c.map_or(0,|h|h.generation)as f64,self.side as f64,self.range_multiplier,self.muzzle.is_some()as u32 as f64,
            self.muzzle.map_or(0.0,|v|v[0]),self.muzzle.map_or(0.0,|v|v[1]),self.aim[0],self.aim[1],self.previous[0],self.previous[1],self.previous_facing,self.sequence,self.camera[0],self.camera[1],
            self.children.len()as f64,self.metas.len()as f64,self.runtime.len()as f64,b.is_some()as u32 as f64];out.extend(b.map_or([0.0;2],e::Bulkheads::words));
        out.push(r.is_some()as u32 as f64);out.extend(r.map_or([0.0;5],e::FieldRepair::words));out.push(r.map_or(0,|r|r.cycles.len())as f64);
        out.push(comp.is_some()as u32 as f64);out.extend(comp.map_or([0.0;4],e::Compensation::words));out.push(self.launcher.is_some()as u32 as f64);
        if let Some(l)=&self.launcher{out.extend([l.damage,l.emp,l.range,l.speed,l.launch_speed,l.speed_bonus,l.weapon_type as f64]);}else{out.extend([0.0;7]);}
        out.push(s.live.defined_mask()as f64);out.extend(s.live.values());for h in &self.children{out.extend([h.slot as f64,h.generation as f64]);}
        for(id,m)in &self.metas{out.extend([*id as f64,kind_id(m.kind)as f64,m.regen]);out.extend(input_words(m.input));out.extend(m.jump.words());}
        for(id,m)in &self.runtime{out.extend([*id as f64,m.defined_mask()as f64]);out.extend(m.values());}if let Some(r)=r{out.extend(&r.cycles);}out
    }
    fn runtime(&self)->e::Modifiers{let mut m=e::Modifiers::default();for (_,r)in &self.runtime{m.combine(r);}m}
    fn runtime_set(&mut self,id:u32,value:e::Modifiers){if let Some((_,m))=self.runtime.iter_mut().find(|(key,_)|*key==id){*m=value;}else{self.runtime.push((id,value));}}
}
pub fn kind(n:u32)->Option<e::Kind>{Some(match n{0=>e::Kind::None,1=>e::Kind::Eclipse,2=>e::Kind::Edict,3=>e::Kind::Yamato,4=>e::Kind::Jump,
    5=>e::Kind::ArkForge,6=>e::Kind::ArkBarrier,7=>e::Kind::ArkRepair,8=>e::Kind::RocAttitude,9=>e::Kind::RocFire,10=>e::Kind::Zhefeng,
    11=>e::Kind::GravityWell,12=>e::Kind::GravityBattleWell,13=>e::Kind::GravityOther,_=>return None})}
fn kind_id(k:e::Kind)->u32{(0..=13).find(|n|kind(*n)==Some(k)).unwrap_or(u32::MAX)}
fn input_words(i:Option<e::ActivationInput>)->[f64;13]{let Some(i)=i else{return[0.0;13];};[1.0,i.point[0],i.point[1],i.origin[0],i.origin[1],i.velocity[0],i.velocity[1],i.facing,
    i.target.is_some()as u32 as f64,i.target.map_or(0,|h|h.0)as f64,i.target.map_or(0,|h|h.1)as f64,i.gravity_anchor_serial.is_some()as u32 as f64,i.gravity_anchor_serial.unwrap_or(0.0)]}
fn ident(h:Handle)->w::Identity{w::Identity{slot:h.slot,generation:h.generation}}
fn handle(h:w::Identity)->Handle{Handle{slot:h.slot,generation:h.generation}}
fn find(bodies:&[Body],h:Handle)->Result<usize,w::Failure>{bodies.iter().position(|b|b.handle==h).ok_or(w::Failure::StaleIdentity)}
fn root(bodies:&[Body],mut h:Handle)->Result<Handle,w::Failure>{let mut seen=Vec::new();loop{
    if seen.contains(&h){return Err(w::Failure::Host);}seen.push(h);let b=&bodies[find(bodies,h)?];
    if let Some(parent)=owned(b)?.parent{h=parent;}else{return Ok(h);}
}}
fn owned(b:&Body)->Result<&Owned,w::Failure>{b.ship.as_ref().and_then(|s|s.world.as_ref()).ok_or(w::Failure::Host)}
fn system_read(s:&System,m:&Meta)->w::SystemRead{w::SystemRead{id:s.id,kind:m.kind,active:s.active,disabled:s.disabled,charges:s.charges,pending_flux:s.pending_flux}}
pub fn slot(s:&ShipState,h:Handle,id:u32,specs:&BTreeMap<u32,Spec>)->Result<w::Slot,u32>{let life=s.systems.iter().find(|s|s.id==id).ok_or(8u32)?;
    let m=s.world.as_ref().and_then(|x|x.metas.get(&id)).ok_or(8u32)?;Ok(w::Slot{owner:ident(h),kind:m.kind,lifecycle:life.clone(),spec:specs.get(&life.spec).ok_or(8u32)?.clone(),input:m.input,jump:m.jump.clone(),regen:m.regen})}
pub fn restore(s:&mut ShipState,slot:w::Slot)->Result<(),u32>{let life=s.systems.iter_mut().find(|s|s.id==slot.lifecycle.id).ok_or(8u32)?;
    let m=s.world.as_mut().and_then(|x|x.metas.get_mut(&life.id)).ok_or(8u32)?;*life=slot.lifecycle;m.input=slot.input;m.jump=slot.jump;m.regen=slot.regen;Ok(())}
fn views_iter<'a>(s:&'a ShipState,specs:&'a BTreeMap<u32,Spec>)->impl Iterator<Item=e::SystemView>+DoubleEndedIterator+ExactSizeIterator+Clone+'a{s.systems.iter().map(|life|{
    let d=&specs[&life.spec];let m=s.world.as_ref().and_then(|w|w.metas.get(&life.id));e::SystemView{kind:m.map_or(e::Kind::None,|m|m.kind),state:life.state,level:life.effect,
        retained:if life.state==lifecycle::OUT{life.out_level}else{life.effect},active:life.active,available:d.flags&lifecycle::AVAILABLE!=0,disabled:life.disabled,
        cooldown:life.cooldown_timer,max_cooldown:d.cooldown,jump_origin:m.is_some_and(|m|m.jump.visual.is_some_and(|v|v.origin.is_some())),gravity_collapse:s.world.as_ref().is_some_and(|w|w.gravity_collapsed.contains(&life.id)),
        locked_side:m.and_then(|m|m.input).map_or(0,|i|e::broadside(i.point,i.origin,i.facing))}})}
pub fn views(s:&ShipState,specs:&BTreeMap<u32,Spec>)->Vec<e::SystemView>{views_iter(s,specs).collect()}
pub fn local_owner(s:&ShipState,engineering:bool,corona:bool,phased:bool)->e::Owner{e::Owner{hp:s.armor.as_ref().map_or(1.0,|a|a.data[14]),dead:s.flags&ship_state::DEAD!=0,
    retreated:s.flags&ship_state::RETREATED!=0,retreating:s.flags&ship_state::RETREATING!=0,docked:s.flags&ship_state::DOCKED!=0,phased,flux_percent:s.flux.percent(),
    venting:s.flux.venting,overloaded:s.flux.overloaded,disable_systems:if s.flags&ship_state::DISABLED!=0{1.0}else{0.0},engineering_online:engineering,corona}}
fn phase(s:&ShipState)->bool{s.flags&(ship_state::DOCKED|ship_state::RETREATED)!=0||s.shield.as_ref().is_some_and(|sh|sh.kind()==crate::shield::PHASE&&(sh.data[14]==1.0||sh.data[14]==2.0||sh.data[14]==3.0&&sh.data[15]>0.5))}
fn engineering(bodies:&[Body],w:&Owned)->Result<bool,w::Failure>{for h in &w.children{let b=&bodies[find(bodies,*h)?];let c=owned(b)?;
    if c.flags&ENGINEERING!=0&&b.ship.as_ref().is_some_and(|s|local_owner(s,true,false,phase(s)).alive()){return Ok(true);}}Ok(false)}
/// A single complete publication holds these exact rows and specifications
/// immutably. Only identity and this original short-circuit engineering read
/// are reused; callers still calculate their complete modifier values.
pub(crate) struct PublicationObservation<'a>{bodies:&'a[Body],specs:&'a BTreeMap<u32,Spec>,
    rows:std::cell::RefCell<Option<std::collections::HashMap<(u32,u32),usize>>>,
    engineering:std::cell::RefCell<Vec<Option<Result<bool,w::Failure>>>>}
impl<'a> PublicationObservation<'a>{
    pub(crate) fn new(bodies:&'a[Body],specs:&'a BTreeMap<u32,Spec>)->Self{Self{bodies,specs,
        rows:std::cell::RefCell::new(None),engineering:std::cell::RefCell::new(Vec::new())}}
    pub(crate) fn bodies(&self)->&'a[Body]{self.bodies}
    pub(crate) fn specs(&self)->&'a BTreeMap<u32,Spec>{self.specs}
    pub(crate) fn row(&self,h:Handle)->Result<usize,u32>{self.find(h).map_err(error)}
    fn find(&self,h:Handle)->Result<usize,w::Failure>{let mut index=self.rows.borrow_mut();if index.is_none(){let mut rows=std::collections::HashMap::with_capacity(self.bodies.len());
        for(i,b)in self.bodies.iter().enumerate(){rows.entry((b.handle.slot,b.handle.generation)).or_insert(i);}*index=Some(rows);}
        index.as_ref().unwrap().get(&(h.slot,h.generation)).copied().ok_or(w::Failure::StaleIdentity)}
    fn engineering(&self,row:usize,w:&Owned)->Result<bool,w::Failure>{if let Some(Some(value))=self.engineering.borrow().get(row){return *value;}
        let value=(||{for h in &w.children{let b=&self.bodies[self.find(*h)?];let c=owned(b)?;
            if c.flags&ENGINEERING!=0&&b.ship.as_ref().is_some_and(|s|local_owner(s,true,false,phase(s)).alive()){return Ok(true);}}Ok(false)})();
        let mut cache=self.engineering.borrow_mut();if cache.is_empty(){cache.resize(self.bodies.len(),None);}cache[row]=Some(value);value}
    pub(crate) fn modifiers(&self,row:usize)->Result<e::Modifiers,u32>{modifiers_observed(self.bodies,row,self.specs,Some(self))}
}
pub struct Reader{systems:Vec<e::SystemView>,owner:e::Owner,capacity:f64,runtime:e::Modifiers,parent:Vec<e::SystemView>,module:Option<e::Module>}
impl Reader{pub fn read(&self,flux:&crate::flux::Flux)->e::Modifiers{let mut o=self.owner;o.flux_percent=flux.percent();o.venting=flux.venting;o.overloaded=flux.overloaded;
    let mut module=self.module;if let Some(m)=&mut module{m.child=o;}
    e::compose(&self.systems,Some(o),self.capacity,true,&self.runtime,&self.parent,module)}}
/// A geometry-only caller still performs every fallible Reader observation in
/// its original order, without allocating modifier values it never consumes.
pub fn validate_modifier_observation(bodies:&[Body],row:usize,specs:&BTreeMap<u32,Spec>)->Result<(),u32>{
    let s=bodies[row].ship.as_ref().ok_or(8u32)?;let Some(w)=&s.world else{return Ok(());};
    let _=local_owner(s,engineering(bodies,w).map_err(error)?,w.flags&CORONA!=0,phase(s));
    for life in &s.systems{let _=&specs[&life.spec];}
    if let Some(h)=w.parent{let parent=&bodies[find(bodies,h).map_err(error)?];let ps=parent.ship.as_ref().ok_or(8u32)?;let pw=owned(parent).map_err(error)?;
        let _=local_owner(ps,engineering(bodies,pw).map_err(error)?,pw.flags&CORONA!=0,phase(ps));
        for life in &ps.systems{let _=&specs[&life.spec];}
        // Keep the original indexing and short-circuit order even for malformed
        // components; this is an observation check, not a fail-open shortcut.
        let _=s.weapons.as_ref().is_some_and(|c|c.mounts.iter().enumerate().any(|(i,m)|m.data[1]==1.0&&m.data[17]!=0.0&&s.components[i].data[7]==0.0));
    }Ok(())
}
pub fn reader(bodies:&[Body],row:usize,specs:&BTreeMap<u32,Spec>)->Result<Reader,u32>{let s=bodies[row].ship.as_ref().ok_or(8u32)?;
    let Some(w)=&s.world else{return Ok(Reader{systems:Vec::new(),owner:e::Owner::default(),capacity:s.flux.max,runtime:e::Modifiers::default(),parent:Vec::new(),module:None});};
    let owner=local_owner(s,engineering(bodies,w).map_err(error)?,w.flags&CORONA!=0,phase(s));let systems=views(s,specs);let mut parent_views=Vec::new();let mut module=None;
    if let Some(h)=w.parent{let parent=&bodies[find(bodies,h).map_err(error)?];let ps=parent.ship.as_ref().ok_or(8u32)?;let pw=owned(parent).map_err(error)?;
        let po=local_owner(ps,engineering(bodies,pw).map_err(error)?,pw.flags&CORONA!=0,phase(ps));parent_views=views(ps,specs);
        let usable=s.weapons.as_ref().is_some_and(|c|c.mounts.iter().enumerate().any(|(i,m)|m.data[1]==1.0&&m.data[17]!=0.0&&s.components[i].data[7]==0.0));
        module=Some(e::Module{child:owner,parent:po,direct:true,listed:pw.children.contains(&bodies[row].handle),battery_side:w.side,
            usable_battery:owner.alive()&&!owner.venting&&!owner.overloaded&&s.control_flags()&64==0&&usable,loader:w.flags&LOADER!=0});
    }
    Ok(Reader{systems,owner,capacity:s.flux.max,runtime:w.runtime(),parent:parent_views,module})}
pub fn modifiers(bodies:&[Body],row:usize,specs:&BTreeMap<u32,Spec>)->Result<e::Modifiers,u32>{modifiers_observed(bodies,row,specs,None)}
fn modifiers_observed(bodies:&[Body],row:usize,specs:&BTreeMap<u32,Spec>,observation:Option<&PublicationObservation<'_>>)->Result<e::Modifiers,u32>{let s=bodies[row].ship.as_ref().ok_or(8u32)?;
    let Some(w)=&s.world else{return Ok(e::Modifiers::default());};
    let owner=local_owner(s,observation.map_or_else(||engineering(bodies,w),|o|o.engineering(row,w)).map_err(error)?,w.flags&CORONA!=0,phase(s));
    // Preserve views()' eager specification checks before parent resolution.
    for life in &s.systems{let _=&specs[&life.spec];}
    let mut parent_ship=None;let mut module=None;
    if let Some(h)=w.parent{let parent_row=observation.map_or_else(||find(bodies,h),|o|o.find(h)).map_err(error)?;let parent=&bodies[parent_row];let ps=parent.ship.as_ref().ok_or(8u32)?;let pw=owned(parent).map_err(error)?;
        let po=local_owner(ps,observation.map_or_else(||engineering(bodies,pw),|o|o.engineering(parent_row,pw)).map_err(error)?,pw.flags&CORONA!=0,phase(ps));
        for life in &ps.systems{let _=&specs[&life.spec];}parent_ship=Some(ps);
        let usable=s.weapons.as_ref().is_some_and(|c|c.mounts.iter().enumerate().any(|(i,m)|m.data[1]==1.0&&m.data[17]!=0.0&&s.components[i].data[7]==0.0));
        module=Some(e::Module{child:owner,parent:po,direct:true,listed:pw.children.contains(&bodies[row].handle),battery_side:w.side,
            usable_battery:owner.alive()&&!owner.venting&&!owner.overloaded&&s.control_flags()&64==0&&usable,loader:w.flags&LOADER!=0});
    }
    Ok(e::compose_iter(views_iter(s,specs),Some(owner),s.flux.max,true,&w.runtime(),parent_ship.into_iter().flat_map(|p|views_iter(p,specs)),module))
}
pub fn local_modifiers(s:&ShipState,specs:&BTreeMap<u32,Spec>)->e::Modifiers{let Some(w)=&s.world else{return e::Modifiers::default();};
    e::compose(&views(s,specs),Some(local_owner(s,true,w.flags&CORONA!=0,phase(s))),s.flux.max,true,&w.runtime(),&[],None)}
pub fn compensation_eligible(s:&ShipState)->bool{s.can_advance()&&!s.flux.overloaded&&!s.flux.venting&&s.engines.as_ref().is_some_and(|eng|eng.data[4]==crate::engine::READY&&eng.fraction(true)==0.0&&eng.engines.iter().all(|x|x.data[12]==0.0))}
pub fn can_fire(s:&ShipState,pd:bool)->bool{s.control_flags()&64==0&&s.world.as_ref().is_none_or(|w|s.systems.iter().all(|x|x.state!=lifecycle::IN||w.metas.get(&x.id).is_none_or(|m|m.kind!=e::Kind::Zhefeng)||pd))}
pub fn autofire(s:&ShipState,pd:bool,specs:&BTreeMap<u32,Spec>)->Option<crate::fire_control::Policy>{
    views(s,specs).into_iter().find_map(|v|e::rocinante_policy(v,Some(local_owner(s,true,false,phase(s))),pd))
        .map(|p|crate::fire_control::Policy{priority:if p.suppress{crate::fire_control::Priority::Suppress}else{crate::fire_control::Priority::Escort},suspended:p.suspended})
}
pub fn early(bodies:&mut [Body],row:usize,dt:f64)->Result<(),u32>{let s=bodies[row].ship.as_ref().ok_or(8u32)?;let Some(w)=&s.world else{return Ok(());};
    let available=local_owner(s,true,false,phase(s)).alive()&&w.parent.map_or(Ok(true),|h|{let i=find(bodies,h).map_err(error)?;let ps=bodies[i].ship.as_ref().ok_or(8u32)?;Ok::<bool,u32>(local_owner(ps,true,false,phase(ps)).alive())})?;
    let eligible=compensation_eligible(s);let reserved=s.systems.iter().fold(0.0,|sum,x|sum+x.pending_flux);let a=s.armor.as_ref().ok_or(8u32)?;let(hp,max)=(a.data[14],a.data[13]);
    let b=&mut bodies[row];let s=b.ship.as_mut().unwrap();let w=s.world.as_mut().unwrap();
    if let Some(seal)=&mut w.bulkheads{seal.advance(dt,available,hp,max,reserved,&mut s.flux);if seal.remaining>0.0{let value=seal.modifiers();w.runtime_set(1,value);}else{w.runtime.retain(|(id,_)|*id!=1);}}
    if let Some(c)=&mut w.compensation{let mut vel=[b.motion[2],b.motion[3]];c.advance(dt,eligible,&mut vel);b.motion[2]=vel[0];b.motion[3]=vel[1];}Ok(())}
pub fn recoil(s:&mut ShipState,railgun:bool,dx:f64,dy:f64){let eligible=compensation_eligible(s);let attitude=s.world.as_ref().is_some_and(|w|s.systems.iter().any(|x|x.active&&w.metas.get(&x.id).is_some_and(|m|m.kind==e::Kind::RocAttitude)));
    if let Some(c)=s.world.as_mut().and_then(|w|w.compensation.as_mut()){c.on_recoil(railgun,eligible,attitude,dx,dy,&mut s.flux);}}
pub fn damage(s:&mut ShipState,value:f64){if let Some(r)=s.world.as_mut().and_then(|w|w.repair.as_mut()){r.on_damage(value);}}
pub fn repair_mounts(s:&ShipState)->Vec<e::RepairMount>{s.weapons.as_ref().map_or(Vec::new(),|w|w.mounts.iter().map(|m|e::RepairMount{cycle:m.data[26],idle:m.data[23]==0.0,trigger:m.data[25]==1.0}).collect())}
pub fn repair(s:&mut ShipState,dt:f64){let mounts=repair_mounts(s);let online=local_owner(s,true,false,phase(s)).online()&&!phase(s);let any=s.systems.iter().any(|x|x.active);
    let core=s.world.as_ref().and_then(|w|s.systems.iter().position(|x|w.metas.get(&x.id).is_some_and(|m|m.kind==e::Kind::Yamato)));
    let main=s.combat.as_ref().and_then(|c|c.query.as_ref()).is_some_and(|q|q.trigger);let age=s.shield.as_ref().map_or(f64::INFINITY,|sh|sh.data[28]);
    let enabled=core.is_some_and(|i|!s.systems[i].disabled)&&s.world.as_ref().is_some_and(|w|w.flags&REACTOR!=0);
    let Some(r)=s.world.as_mut().and_then(|w|w.repair.as_mut())else{return;};let Some(a)=s.armor.as_mut()else{return;};let mut absent=0.0;
    let stock=core.map_or(&mut absent,|i|&mut s.systems[i].charges);r.advance(dt,online,enabled,main,any,age,&mounts,a.data[13],&mut a.data[14],stock);}
pub fn error(f:w::Failure)->u32{match f{w::Failure::StaleIdentity=>4,w::Failure::Unsupported|w::Failure::Host=>8,_=>8}}

pub struct Host<'a>{pub bodies:&'a mut [Body],pub specs:&'a BTreeMap<u32,Spec>,pub ordnance:&'a mut Ordnance,pub random:&'a mut Random,pub events:&'a mut Vec<(u32,Handle,Notice)>,pub asteroids:Option<&'a[crate::terrain_world::Asteroid]>}
impl w::Host for Host<'_>{
    fn ship(&self,id:w::Identity)->Result<w::ShipRead,w::Failure>{let row=find(self.bodies,handle(id))?;let b=&self.bodies[row];let s=b.ship.as_ref().ok_or(w::Failure::Host)?;let world=owned(b)?;
        let m=modifiers(self.bodies,row,self.specs).map_err(|_|w::Failure::Host)?;let mut owner=local_owner(s,engineering(self.bodies,world)?,world.flags&CORONA!=0,phase(s));owner.disable_systems+=m.get(e::DISABLE_SYSTEMS);
        let c=s.combat.as_ref().ok_or(w::Failure::Host)?;let a=s.armor.as_ref().ok_or(w::Failure::Host)?;
        Ok(w::ShipRead{identity:id,owner,maximum_hp:a.data[13],position:[b.motion[0],b.motion[1]],velocity:[b.motion[2],b.motion[3]],facing:b.motion[4],radius:c.radius,
            shield_radius:s.shield.as_ref().map_or(0.0,|sh|sh.data[2]),shield_active:s.shield.as_ref().is_some_and(|sh|sh.active()),attached:world.parent.is_some(),gloriana:world.flags&GLORIANA!=0,
            parent:world.parent.map(ident),carrier_root:world.carrier.map(|h|root(self.bodies,h).map(ident)).transpose()?,module_side:world.side,blocks_weapons:s.control_flags()&64!=0||m.get(e::DISABLE_WEAPONS)>0.0,
            hyperion:world.flags&HYPERION!=0,reactor_installed:world.flags&REACTOR!=0,focus:world.flags&FOCUS!=0,current_total_flux:s.flux.total(),max_flux:s.flux.max,
            brake:b.motion[motion::BRAKE]==1.0,flameout_ratio:s.engines.as_ref().map_or(0.0,|eng|eng.fraction(true)),controller_flamed:s.engine_flame_flag(),
            controller_disabled:s.engines.as_ref().is_some_and(|eng|eng.data[4]==crate::engine::DISABLED),compensating:world.compensation.as_ref().is_some_and(e::Compensation::active),
            weapons:s.weapons.as_ref().map_or(Vec::new(),|ws|ws.mounts.iter().enumerate().map(|(i,x)|w::WeaponRead{weapon_type:if x.data[1]==0.0{usize::MAX}else{x.data[1]as usize-1},
                disabled:s.components[i].data[7]==1.0,ammo:x.data[17],point_defense:c.fire.get(i).is_some_and(|x|x.spec.point_defense)}).collect()),
            aim:c.query.as_ref().map_or(world.aim,|q|q.aim),range_multiplier:world.range_multiplier,manual:c.attrs[19]!=1.0,yamato_muzzle:world.muzzle})}
    fn systems(&self,id:w::Identity)->Result<Vec<w::SystemRead>,w::Failure>{let b=&self.bodies[find(self.bodies,handle(id))?];let s=b.ship.as_ref().ok_or(w::Failure::Host)?;let world=owned(b)?;
        s.systems.iter().map(|x|Ok(system_read(x,world.metas.get(&x.id).ok_or(w::Failure::Host)?))).collect()}
    fn assembly(&self,id:w::Identity)->Result<Vec<w::Identity>,w::Failure>{let mut root=handle(id);let mut count=0;while let Some(p)=owned(&self.bodies[find(self.bodies,root)?])?.parent{root=p;count+=1;if count>self.bodies.len(){return Err(w::Failure::Host);}}
        fn visit(bodies:&[Body],h:Handle,out:&mut Vec<w::Identity>)->Result<(),w::Failure>{if out.contains(&ident(h)){return Err(w::Failure::Host);}out.push(ident(h));for c in &owned(&bodies[find(bodies,h)?])?.children{visit(bodies,*c,out)?;}Ok(())}
        let mut result=Vec::new();visit(self.bodies,root,&mut result)?;Ok(result)}
    fn children(&self,id:w::Identity)->Result<Vec<w::Identity>,w::Failure>{Ok(owned(&self.bodies[find(self.bodies,handle(id))?])?.children.iter().copied().map(ident).collect())}
    fn roster(&self)->Vec<w::Identity>{self.bodies.iter().map(|b|ident(b.handle)).collect()}
    fn stock(&self,id:w::Identity,kind:e::Kind)->Result<Option<w::SystemRead>,w::Failure>{Ok(self.systems(id)?.into_iter().find(|x|x.kind==kind))}
    fn spend_stock(&mut self,id:w::Identity,kind:e::Kind,amount:f64)->Result<(),w::Failure>{let row=find(self.bodies,handle(id))?;let s=self.bodies[row].ship.as_mut().ok_or(w::Failure::Host)?;let world=s.world.as_ref().ok_or(w::Failure::Host)?;
        let x=s.systems.iter_mut().find(|x|world.metas.get(&x.id).is_some_and(|m|m.kind==kind)).ok_or(w::Failure::Host)?;x.charges-=amount;Ok(())}
    fn set_regen(&mut self,id:w::Identity,slot:u32,rate:f64)->Result<(),w::Failure>{let row=find(self.bodies,handle(id))?;self.bodies[row].ship.as_mut().and_then(|s|s.world.as_mut()).and_then(|w|w.metas.get_mut(&slot)).ok_or(w::Failure::Host)?.regen=rate;Ok(())}
    fn heal(&mut self,id:w::Identity,amount:f64)->Result<(),w::Failure>{let row=find(self.bodies,handle(id))?;let a=self.bodies[row].ship.as_mut().and_then(|s|s.armor.as_mut()).ok_or(w::Failure::Host)?;a.data[14]=a.data[13].min(a.data[14]+amount);Ok(())}
    fn spawn_yamato(&mut self,spawn:w::SpawnYamato)->Result<(),w::Failure>{let row=find(self.bodies,handle(spawn.source))?;let b=&self.bodies[row];let s=b.ship.as_ref().ok_or(w::Failure::Host)?;let c=s.combat.as_ref().ok_or(w::Failure::Host)?;
        let l=s.world.as_ref().and_then(|w|w.launcher.as_ref()).ok_or(w::Failure::Host)?;let d=l.delivery.as_ref().ok_or(w::Failure::Host)?.clone();let m=modifiers(self.bodies,row,self.specs).map_err(|_|w::Failure::Host)?;
        let mult=c.attrs[11]*if l.weapon_type==0{1.0}else{c.attrs[13+l.weapon_type as usize]*m.weapon_value(l.weapon_type as usize-1,e::DAMAGE)};
        let speed=l.speed*(1.0+(l.speed_bonus+if l.weapon_type==0{0.0}else{m.weapon_value(l.weapon_type as usize-1,e::PROJECTILE_SPEED)})/100.0)/(1.0+l.speed_bonus/100.0);
        let launch=l.launch_speed;let velocity=[spawn.facing.cos()*launch+spawn.velocity[0],spawn.facing.sin()*launch+spawn.velocity[1]];let id=self.random.next();
        let emission=Emission{kind:EmissionKind::Projectile,id,component_id:0,cycle_id:0.0,position:spawn.position,velocity,angle:spawn.facing,barrel_offset:[0.0;2],base_damage:l.damage,
            source_damage_multiplier:mult,damage:l.damage*mult,emp:l.emp,range:l.range,duration:0.0,target_ship:None,target_projectile:None,armed_while_fizzling:None,flight_time:d.flight,source_velocity:spawn.velocity,recoil_delta:[0.0;2]};
        self.ordnance.serial+=1.0;if self.ordnance.serial>u32::MAX as f64{return Err(w::Failure::Host);}let mut p=Projectile::new(self.ordnance.serial,b.id,b.handle,c.team,d,&emission,speed,c.outgoing(),s.flux.percent());
        p.player=c.player;let sid=s.systems.iter().find(|x|s.world.as_ref().unwrap().metas.get(&x.id).is_some_and(|m|m.kind==e::Kind::Yamato)).ok_or(w::Failure::Host)?.id;
        p.birth.system(sid,"web_sc2_hyperion_yamato_shot".into(),None);let handles:Vec<_>=self.bodies.iter().map(|b|(b.id,b.handle)).collect();crate::missile_owner::initialize(&mut p,mult,&handles);
        self.events.push((b.id,b.handle,Notice{system:0,kind:SHOT_SPAWNED,value:p.serial,detail:[p.id,0.0]}));self.ordnance.projectiles.push(p);Ok(())}
    fn play_yamato(&mut self,id:w::Identity)->Result<(),w::Failure>{let b=&self.bodies[find(self.bodies,handle(id))?];let player=b.ship.as_ref().and_then(|s|s.combat.as_ref()).ok_or(w::Failure::Host)?.player.unwrap_or(false);self.events.push((b.id,b.handle,Notice{system:0,kind:43,value:if player{0.9}else{0.5},detail:[0.75,0.0]}));Ok(())}
    fn jump_obstacles(&self)->Result<(Vec<e::JumpObstacle>,Option<Vec<e::JumpAsteroid>>),w::Failure>{let mut result=Vec::new();for b in self.bodies.iter(){let s=b.ship.as_ref().ok_or(w::Failure::Host)?;let c=s.combat.as_ref().ok_or(w::Failure::Host)?;
        result.push(e::JumpObstacle{identity:b.handle.slot,position:[b.motion[0],b.motion[1]],radius:c.radius,fighter:c.size==0});}
        Ok((result,self.asteroids.map(|rocks|rocks.iter().map(|a|e::JumpAsteroid{position:a.position,radius:a.radius,hp:Some(a.hp)}).collect())))}
    fn jump_pose(&self,id:w::Identity)->Result<e::JumpPose,w::Failure>{let b=&self.bodies[find(self.bodies,handle(id))?];let w=owned(b)?;Ok(e::JumpPose{position:[b.motion[0],b.motion[1]],previous:w.previous,
        velocity:[b.motion[2],b.motion[3]],facing:b.motion[4],previous_facing:w.previous_facing,sequence:w.sequence,camera_offset:w.camera})}
    fn apply_jump_pose(&mut self,id:w::Identity,p:e::JumpPose)->Result<(),w::Failure>{let row=find(self.bodies,handle(id))?;let b=&mut self.bodies[row];let w=b.ship.as_mut().and_then(|s|s.world.as_mut()).ok_or(w::Failure::Host)?;
        b.motion[..5].copy_from_slice(&[p.position[0],p.position[1],p.velocity[0],p.velocity[1],p.facing]);w.previous=p.previous;w.previous_facing=p.previous_facing;w.sequence=p.sequence;w.camera=p.camera_offset;Ok(())}
}
pub fn dispatch(bodies:&mut [Body],specs:&BTreeMap<u32,Spec>,ordnance:&mut Ordnance,dt:f64,random:&mut Random,events:&mut Vec<(u32,Handle,Notice)>)->Result<(),u32>{
    for row in 0..bodies.len(){let Some(s)=bodies[row].ship.as_ref()else{continue;};if s.flags&(ship_state::DEAD|ship_state::RETREATED|ship_state::DOCKED)!=0{continue;}if s.world.is_none(){continue;}
        let effective=dt*s.subjective_multiplier();let ids:Vec<u32>=s.systems.iter().map(|s|s.id).collect();
        for id in ids{if bodies[row].ship.as_ref().and_then(|s|s.world.as_ref()).is_some_and(|w|w.gravity_systems.contains(&id)){continue;}let mut slot=slot(bodies[row].ship.as_ref().unwrap(),bodies[row].handle,id,specs)?;let mut host=Host{bodies,specs,ordnance,random,events,asteroids:None};slot.dispatch(&mut host,effective).map_err(error)?;
            restore(bodies[row].ship.as_mut().unwrap(),slot)?;}
        repair(bodies[row].ship.as_mut().unwrap(),dt);
    }Ok(())}
pub fn cancel(bodies:&mut [Body],row:usize,specs:&BTreeMap<u32,Spec>,ordnance:&mut Ordnance,dt:f64,after:bool,random:&mut Random,events:&mut Vec<(u32,Handle,Notice)>)->Result<(),u32>{
    let Some(s)=bodies[row].ship.as_ref()else{return Ok(());};if s.world.is_none(){return Ok(());}let ids:Vec<_>=s.systems.iter().map(|s|s.id).collect();
    for id in ids{if bodies[row].ship.as_ref().and_then(|s|s.world.as_ref()).is_some_and(|w|w.gravity_systems.contains(&id)){continue;}let mut slot=slot(bodies[row].ship.as_ref().unwrap(),bodies[row].handle,id,specs)?;let host=Host{bodies,specs,ordnance,random,events,asteroids:None};
        if after{slot.cancel_after_readiness(&host).map_err(error)?;}else{slot.cancel_before_update(&host,dt).map_err(error)?;}restore(bodies[row].ship.as_mut().unwrap(),slot)?;}Ok(())}
pub fn rate(s:&ShipState,kind:usize)->f64{if kind==0{1.0}else{s.live.weapon_value(kind-1,e::RATE)}}
