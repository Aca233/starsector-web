//! Synchronous resident gravity adapter. ShipState.systems owns lifecycle.
//! Owned metadata and typed terrain participate in the caller's whole-step clone.
use crate::{battle::{self,Ordnance},contact,gravity_world as g,lifecycle::Spec,motion,
    random::Random,ship_effects as e,ship_state::{self,Notice,ShipState},state::{Body,Handle},
    system_world::Identity};
use std::{cmp::Ordering,collections::BTreeMap};
pub type V=[f64;2];
fn ident(h:Handle)->Identity{Identity{slot:h.slot,generation:h.generation}}
fn handle(h:Identity)->Handle{Handle{slot:h.slot,generation:h.generation}}
fn find(b:&[Body],h:Identity)->Result<usize,g::Error>{b.iter().position(|b|ident(b.handle)==h).ok_or(g::Error::Stale)}
fn phase(s:&ShipState)->bool{s.flags&(ship_state::DOCKED|ship_state::RETREATED)!=0||s.shield.as_ref().is_some_and(|sh|sh.kind()==3&&(sh.data[14]==1.0||sh.data[14]==2.0||sh.data[14]==3.0&&sh.data[15]>0.5))}
fn add(a:V,b:V)->V{[a[0]+b[0],a[1]+b[1]]}
fn sub(a:V,b:V)->V{[a[0]-b[0],a[1]-b[1]]}

/// No System is stored here: runtime trackers are borrowed from ShipState.
#[derive(Clone)]pub struct SystemMeta{
    pub id:u32,pub kind:g::Kind,pub name:String,pub field_spec:Option<g::FieldSpec>,pub collapse_spec:Option<g::CollapseSpec>,
    pub auto:Option<g::AutoCollapse>,pub maneuver_spec:Option<g::ManeuverSpec>,pub push_spec:Option<g::PushSpec>,
    pub input:Option<e::ActivationInput>,pub field:Option<g::Field>,pub maneuver:Option<g::Maneuver>,pub push:Option<g::Push>,pub polarity:Option<i32>,pub held:bool,pub interrupt_revision:u64,
}
impl SystemMeta{
    pub fn from_slot(s:g::Slot)->Self{Self{id:s.lifecycle.id,kind:s.kind,name:s.name,field_spec:s.field_spec,collapse_spec:s.collapse_spec,auto:s.auto,
        maneuver_spec:s.maneuver_spec,push_spec:s.push_spec,input:s.input,field:s.field,maneuver:s.maneuver,push:s.push,polarity:s.polarity,held:s.held,interrupt_revision:s.interrupt_revision}}
    fn read(&self,s:&ShipState,owner:Identity,specs:&BTreeMap<u32,Spec>)->Result<g::Slot,g::Error>{let l=s.systems.iter().find(|l|l.id==self.id).ok_or(g::Error::Host)?;
        Ok(g::Slot{owner,kind:self.kind,name:self.name.clone(),spec:specs.get(&l.spec).ok_or(g::Error::Host)?.clone(),lifecycle:l.clone(),field_spec:self.field_spec,
            collapse_spec:self.collapse_spec,auto:self.auto,maneuver_spec:self.maneuver_spec,push_spec:self.push_spec,input:self.input,field:self.field.clone(),
            maneuver:self.maneuver,push:self.push.clone(),polarity:self.polarity,held:self.held,interrupt_revision:self.interrupt_revision})}
}
#[derive(Clone)]pub struct ModulePose{pub parent:Identity,pub offset:V,pub angle:f64,pub independent_rotation:bool}
#[derive(Clone)]pub struct ShipMeta{pub identity:Identity,pub name:String,pub mass:f64,pub fixed:bool,pub module_hull:bool,pub module:Option<ModulePose>,pub children:Vec<Identity>,pub systems:Vec<SystemMeta>,pub mounts:Vec<g::Mount>}
#[derive(Clone)]pub struct ProjectileMeta{pub identity:Identity,pub original_source:Option<(u32,Handle)>,pub captured_by:Option<Identity>,pub mass_driver:bool,pub binding:Option<g::Binding>,pub mine:bool,pub hull_explosion:bool}
impl ProjectileMeta{pub fn new(serial:u32)->Self{Self{identity:Identity{slot:serial,generation:1},original_source:None,captured_by:None,mass_driver:false,binding:None,mine:false,hull_explosion:false}}}
#[derive(Clone)]pub struct Environment{pub body:g::Environment,pub facing:f64,pub offset:V,pub bounds:Vec<V>,pub source_mass:f64,pub source_bounds:Vec<V>,pub managed:bool}
impl Environment{pub fn mass(&self)->f64{if self.body.target.kind==g::BodyKind::Hulk{g::hulk_mass(self.source_mass,&self.bounds,&self.source_bounds)}else{self.body.mass}}}
/// Full Intl keys are compiled once for installed IDs. New numeric projectile
/// keys may use an installed character collation table only when the runtime
/// has certified lexicographic comparison for that entire numeric alphabet.
#[derive(Clone,Default)]pub struct Collation{pub keys:Vec<(String,u32)>,pub prefixes:Vec<(String,u32)>,pub numeric_alphabet:Option<Vec<(char,u32)>>}
impl Collation{fn compare(&self,a:&str,b:&str)->Result<Ordering,g::Error>{if a==b{return Ok(Ordering::Equal);}
    if let(Some((_,x)),Some((_,y)))=(self.keys.iter().find(|(k,_)|k==a),self.keys.iter().find(|(k,_)|k==b)){return Ok(x.cmp(y));}
    // Collapse tie-breaks pass raw ship IDs, whereas tractor candidates pass
    // SHIP:<id>. The same literal prefix preserves those suffix comparisons.
    {let ak=format!("SHIP:{}",a);let bk=format!("SHIP:{}",b);if let(Some((_,x)),Some((_,y)))=(self.keys.iter().find(|(k,_)|k==&ak),self.keys.iter().find(|(k,_)|k==&bk)){return Ok(x.cmp(y));}}
    let (ap,an)=a.split_once(':').ok_or(g::Error::Host)?;let (bp,bn)=b.split_once(':').ok_or(g::Error::Host)?;
    if ap!=bp{if let(Some((_,x)),Some((_,y)))=(self.prefixes.iter().find(|(p,_)|p==ap),self.prefixes.iter().find(|(p,_)|p==bp)){return Ok(x.cmp(y));}return Err(g::Error::Host);}
    if let(Some(table),true)=(&self.numeric_alphabet,ap=="PROJECTILE"||ap=="ASTEROID"||ap=="HULK"){
        let rank=|s:&str|s.chars().map(|c|table.iter().find(|(ch,_)|*ch==c).map(|(_,r)|*r).ok_or(g::Error::Host)).collect::<Result<Vec<_>,_>>();
        return Ok(rank(an)?.cmp(&rank(bn)?));}Err(g::Error::Host)}}
#[derive(Clone,Default)]pub struct Owned{pub ships:Vec<ShipMeta>,pub projectiles:Vec<ProjectileMeta>,pub terrain:Option<Vec<Environment>>,pub collation:Collation}
impl Owned{
    /// Synchronous listener interruption while this exact owner is taken out
    /// of world.gravity by its stage. No second runtime is installed.
    pub fn interrupt_ship(&mut self,ship:&mut ShipState,h:Handle,sid:u32,specs:&BTreeMap<u32,Spec>)->Result<(),g::Error>{
        let meta=self.ships.iter_mut().find(|m|m.identity==ident(h)).and_then(|m|m.systems.iter_mut().find(|m|m.id==sid)).ok_or(g::Error::Host)?;
        let mut slot=meta.read(ship,ident(h),specs)?;slot.interrupt();slot.interrupt_revision=meta.interrupt_revision.checked_add(1).ok_or(g::Error::Host)?;
        let life=ship.systems.iter_mut().find(|l|l.id==sid).ok_or(g::Error::Host)?;*life=slot.lifecycle.clone();*meta=SystemMeta::from_slot(slot);
        let w=ship.world.as_mut().ok_or(g::Error::Host)?;w.gravity_collapsed.retain(|id|*id!=sid);Ok(())
    }
    pub(crate) fn ship(&self,id:Identity)->Result<&ShipMeta,g::Error>{self.ships.iter().find(|s|s.identity==id).ok_or(g::Error::Stale)}
    fn root(&self,id:Identity)->Result<Identity,g::Error>{let mut h=id;for _ in 0..=self.ships.len(){match &self.ship(h)?.module{Some(m)=>h=m.parent,None=>return Ok(h)}}Err(g::Error::Host)}
    /// Called at admission, after all actual ships and terrain are installed.
    /// Unknown/missing metadata and attachment cycles are never empty worlds.
    pub fn complete(&self,bodies:&[Body],ordnance:&Ordnance)->bool{
        if self.terrain.is_none()||self.ships.iter().enumerate().any(|(i,m)|self.ships[..i].iter().any(|p|p.identity==m.identity))||self.projectiles.iter().enumerate().any(|(i,m)|self.projectiles[..i].iter().any(|p|p.identity==m.identity)){return false;}
        bodies.iter().all(|b|{let Some(s)=&b.ship else{return false;};let Ok(m)=self.ship(ident(b.handle))else{return false;};self.root(m.identity).is_ok()
            &&m.systems.iter().all(|meta|s.systems.iter().any(|life|life.id==meta.id))
            &&m.children.iter().all(|h|self.ship(*h).is_ok_and(|c|c.module.as_ref().is_some_and(|p|p.parent==m.identity)))
            &&m.mounts.iter().all(|m|s.weapons.as_ref().is_some_and(|w|w.mounts.iter().any(|x|x.data[0]==m.id as f64)))})
            &&ordnance.projectiles.iter().all(|p|p.serial>=1.0&&p.serial<=u32::MAX as f64&&p.serial.fract()==0.0&&self.projectiles.iter().any(|m|m.identity==Identity{slot:p.serial as u32,generation:1}))
    }
    pub fn hydrate(&self,bodies:&[Body],specs:&BTreeMap<u32,Spec>)->Result<g::Controllers,g::Error>{
        self.hydrate_with(bodies,specs,|r|{let s=bodies[r].ship.as_ref().ok_or(g::Error::Host)?;if s.anchor_installed{Err(g::Error::Host)}else{Ok(phase(s))}})
    }
    pub fn hydrate_world(&self,world:&crate::world_owner::Owned,bodies:&[Body],specs:&BTreeMap<u32,Spec>)->Result<g::Controllers,g::Error>{
        let mut c=self.hydrate_read_world(world,bodies,specs)?;
        c.slots.retain(|s|bodies.iter().find(|b|ident(b.handle)==s.owner).is_some_and(|b|world.contains(b)));
        c.mounts.retain(|s|bodies.iter().find(|b|ident(b.handle)==s.owner).is_some_and(|b|world.contains(b)));Ok(c)
    }
    /// HUD/command readiness also reads registered reserve hulls. Keep their
    /// facts available without admitting them into live simulation scope.
    pub fn hydrate_read_world(&self,world:&crate::world_owner::Owned,bodies:&[Body],specs:&BTreeMap<u32,Spec>)->Result<g::Controllers,g::Error>{
        self.hydrate_with(bodies,specs,|r|crate::phase_runtime::phased_world(world,bodies,r,specs).map_err(|_|g::Error::Host))
    }
    /// Preparation consumes only this lifecycle, never other ships' slots or
    /// weapon trackers. Read it again after readiness may interrupt the slot.
    pub fn read_slot(&self,bodies:&[Body],r:usize,sid:u32,specs:&BTreeMap<u32,Spec>)->Result<Option<g::Slot>,g::Error>{
        let b=bodies.get(r).ok_or(g::Error::Stale)?;let s=b.ship.as_ref().ok_or(g::Error::Host)?;let meta=self.ship(ident(b.handle))?;
        meta.systems.iter().find(|m|m.id==sid).map(|m|m.read(s,meta.identity,specs)).transpose()
    }
    fn hydrate_with<F:Fn(usize)->Result<bool,g::Error>>(&self,bodies:&[Body],specs:&BTreeMap<u32,Spec>,phased:F)->Result<g::Controllers,g::Error>{let mut out=g::Controllers::default();
        for b in bodies{let s=b.ship.as_ref().ok_or(g::Error::Host)?;let meta=self.ship(ident(b.handle))?;
            for life in &s.systems{if let Some(m)=meta.systems.iter().find(|m|m.id==life.id){out.slots.push(m.read(s,meta.identity,specs)?);}}
            for m in &meta.mounts{let mut m=m.clone();let w=s.weapons.as_ref().ok_or(g::Error::Host)?;let i=w.mounts.iter().position(|x|x.data[0]==m.id as f64).ok_or(g::Error::Host)?;
                let live=&w.mounts[i].data;let c=s.combat.as_ref().ok_or(g::Error::Host)?;let f=c.fire.get(i).ok_or(g::Error::Host)?;let q=f.query.as_ref().ok_or(g::Error::Host)?;
                let mods=crate::system_owner::modifiers(bodies,find(bodies,meta.identity)?,specs).map_err(|_|g::Error::Host)?;
                let views=crate::system_owner::views(s,specs);let controls=e::Controls{bits:if s.control_flags()&64!=0||mods.get(e::DISABLE_WEAPONS)>0.0{e::BLOCK_WEAPONS}else{0},phased:phased(find(bodies,meta.identity)?)?};
                m.owner=meta.identity;m.disabled=s.components.get(i).ok_or(g::Error::Host)?.data[7]==1.0;m.permitted=q.system_allows&&e::can_fire(&views,controls,f.spec.point_defense);m.cooldown=live[16];m.glow=live[29];m.trigger=live[25]==1.0;m.angle=live[15];m.range=battle::weapon_geometry(f,live[1]as usize,&mods,c.attrs[18]).0;
                m.enabled_group=w.groups.iter().enumerate().any(|(j,g)|g.members.contains(&m.id)&&(g.data[2]==1.0||c.query.as_ref().is_some_and(|q|q.selected==Some(j))));out.mounts.push(m);}}
        Ok(out)}
    pub fn restore(&mut self,bodies:&mut[Body],c:g::Controllers)->Result<(),g::Error>{
        for slot in c.slots{let row=find(bodies,slot.owner)?;let s=bodies[row].ship.as_mut().ok_or(g::Error::Host)?;let life=s.systems.iter_mut().find(|x|x.id==slot.lifecycle.id).ok_or(g::Error::Host)?;
            let m=self.ships.iter_mut().find(|x|x.identity==slot.owner).and_then(|x|x.systems.iter_mut().find(|x|x.id==slot.lifecycle.id)).ok_or(g::Error::Host)?;
            if slot.interrupt_revision<m.interrupt_revision{continue;}*life=slot.lifecycle.clone();*m=SystemMeta::from_slot(slot);}
        for m in c.mounts{let row=find(bodies,m.owner)?;let s=bodies[row].ship.as_mut().ok_or(g::Error::Host)?;let w=s.weapons.as_mut().ok_or(g::Error::Host)?;let i=w.mounts.iter().position(|x|x.data[0]==m.id as f64).ok_or(g::Error::Host)?;
            let d=&mut w.mounts[i].data;d[15]=m.angle;d[16]=m.cooldown;d[29]=m.glow;d[25]=m.trigger as u32 as f64;
            let state=self.ships.iter_mut().find(|s|s.identity==m.owner).and_then(|s|s.mounts.iter_mut().find(|x|x.id==m.id)).ok_or(g::Error::Host)?;*state=m;}
        Ok(())}
    pub fn projectile_spawned(&mut self,serial:f64)->Result<(),g::Error>{if serial<1.0||serial>u32::MAX as f64||serial.fract()!=0.0{return Err(g::Error::Host);}let id=serial as u32;
        if self.projectiles.iter().any(|m|m.identity.slot==id){return Err(g::Error::Host);}self.projectiles.push(ProjectileMeta::new(id));Ok(())}
    pub fn projectile_retired(&mut self,id:Identity){self.projectiles.retain(|p|p.identity!=id);}
    /// Commit immediately after this slot's event at its original allSystems
    /// position so later world queries see its accepted state and lifecycle.
    pub fn restore_slot(&mut self,bodies:&mut[Body],slot:g::Slot)->Result<(),g::Error>{self.restore(bodies,g::Controllers{slots:vec![slot],mounts:Vec::new()})}
    /// Foreign ordnance may spawn during weapon/system/missile stages. Reconcile
    /// before gravity observes them, while preserving capture/binding metadata.
    pub fn reconcile_projectiles(&mut self,ordnance:&Ordnance)->Result<(),g::Error>{
        let mut rows=std::collections::BTreeMap::new();for(i,m)in self.projectiles.iter().enumerate(){rows.entry(m.identity.slot).or_insert(i);}
        let mut present=std::collections::BTreeSet::new();
        for p in &ordnance.projectiles{let key=if p.serial>=0.0&&p.serial<=u32::MAX as f64&&p.serial.fract()==0.0{Some(p.serial as u32)}else{None};
            let r=if let Some(r)=key.and_then(|k|rows.get(&k).copied()){r}else{self.projectile_spawned(p.serial)?;let r=self.projectiles.len()-1;rows.insert(self.projectiles[r].identity.slot,r);r};
            present.insert(self.projectiles[r].identity.slot);let m=&mut self.projectiles[r];m.mine=p.delivery.is_mine;m.mass_driver|=p.birth.kind==0&&p.delivery.mass_driver;}
        self.projectiles.retain(|m|present.contains(&m.identity.slot));Ok(())}
}

#[derive(Clone)]pub enum Record{Notice{body:u32,handle:Handle,notice:Notice},Damage{owner:Identity,target:Identity,area:u32,value:f64},Ripple{point:V,size:f64},Sparks{target:Identity,local:V,armor:f64,particles:Vec<crate::world_damage::ArmorParticle>},Floating{point:V,value:f64}}
/// Destruction runs synchronously in Rust and owns the full original world
/// death/module/debris/flightdeck behavior. This adapter never substitutes flags.
pub trait Destruction{fn apply(&mut self,bodies:&mut[Body],row:usize,owned:&mut Owned,ordnance:&mut Ordnance,random:&mut Random,visual:&mut Random,records:&mut Vec<Record>)->Result<(),u32>;
    fn roster(&self,bodies:&[Body])->Result<Vec<usize>,u32>{Ok((0..bodies.len()).collect())}
    fn phased(&self,bodies:&[Body],row:usize,specs:&BTreeMap<u32,Spec>)->Result<bool,u32>;
    fn hull(&mut self,bodies:&mut[Body],row:usize,owned:&mut Owned,damage:f64,specs:&BTreeMap<u32,Spec>,notices:&mut Vec<Notice>)->Result<f64,u32>;
    fn record(&mut self,_bodies:&[Body],_record:&Record,_visual:&mut Random)->Result<(),u32>{Ok(())}}
impl<F> Destruction for F where F:FnMut(&mut[Body],usize,&mut Owned,&mut Ordnance,&mut Random,&mut Random,&mut Vec<Record>)->Result<(),u32>{fn apply(&mut self,b:&mut[Body],i:usize,o:&mut Owned,p:&mut Ordnance,r:&mut Random,v:&mut Random,e:&mut Vec<Record>)->Result<(),u32>{self(b,i,o,p,r,v,e)}
    fn phased(&self,b:&[Body],i:usize,_:&BTreeMap<u32,Spec>)->Result<bool,u32>{let s=b.get(i).and_then(|b|b.ship.as_ref()).ok_or(8u32)?;if s.anchor_installed{Err(8)}else{Ok(phase(s))}}
    fn hull(&mut self,b:&mut[Body],i:usize,_:&mut Owned,damage:f64,_:&BTreeMap<u32,Spec>,notices:&mut Vec<Notice>)->Result<f64,u32>{b.get_mut(i).and_then(|b|b.ship.as_mut()).ok_or(8u32)?.apply_hull(damage,notices)}}
pub struct Host<'a,D>{pub bodies:&'a mut[Body],pub ordnance:&'a mut Ordnance,pub owned:&'a mut Owned,pub specs:&'a BTreeMap<u32,Spec>,pub random:&'a mut Random,pub visual:&'a mut Random,pub records:&'a mut Vec<Record>,pub destruction:D}
fn circle(a:V,b:V,p:V,r:f64)->Option<f64>{let d=sub(b,a);let f=sub(a,p);let c=f[0]*f[0]+f[1]*f[1]-r*r;if c<=0.0{return Some(0.0);}let k=d[0]*d[0]+d[1]*d[1];if k<=1e-12{return None;}let n=2.0*(f[0]*d[0]+f[1]*d[1]);let disc=n*n-4.0*k*c;if disc<0.0{return None;}let t=(-n-disc.sqrt())/(2.0*k);if t>=0.0&&t<=1.0{Some(t)}else{None}}
fn blocked(s:&crate::shield::Shield,pose:&[f64;motion::WIDTH],point:V)->bool{if !s.active()||s.data[7]<=5.0||s.kind()==0||s.kind()==3{return false;}let p=contact::shield_center(s,pose);let facing=if s.kind()==1{pose[4]}else{s.data[8]};let mut diff=(point[1]-p[1]).atan2(point[0]-p[0])-facing;while diff>std::f64::consts::PI{diff-=std::f64::consts::TAU;}while diff< -std::f64::consts::PI{diff+=std::f64::consts::TAU;}diff.abs()<=s.data[7]*std::f64::consts::PI/360.0}
fn ship_entry(b:&Body,a:V,z:V)->Result<Option<f64>,g::Error>{let s=b.ship.as_ref().ok_or(g::Error::Host)?;let c=s.combat.as_ref().ok_or(g::Error::Host)?;
    let mut t=if c.bounds.len()>=3{let p=contact::local(a,&b.motion);if contact::contains(p,&c.bounds){Some(0.0)}else{contact::polygon(p,contact::local(z,&b.motion),&c.bounds).map(|(t,_)|t)}}else{circle(a,z,[b.motion[0],b.motion[1]],c.radius)};
    if let Some(sh)=s.shield.as_ref().filter(|sh|sh.active()&&sh.data[7]>0.0&&sh.kind()!=0&&sh.kind()!=3){if let Some(hit)=circle(a,z,contact::shield_center(sh,&b.motion),sh.data[2]){if blocked(sh,&b.motion,contact::lerp(a,z,hit)){t=Some(t.map_or(hit,|prior|prior.min(hit)));}}}Ok(t)}
fn local_env(p:V,e:&Environment)->V{add(contact::rotate(sub(p,e.body.position),-e.facing),e.offset)}
fn edge_distance(p:V,poly:&[V])->f64{let mut best=f64::INFINITY;for i in 0..poly.len(){let a=poly[(i+poly.len()-1)%poly.len()];let b=poly[i];let d=sub(b,a);let n=d[0]*d[0]+d[1]*d[1];let t=((p[0]-a[0])*d[0]+(p[1]-a[1])*d[1])/(if n==0.0{1.0}else{n});let t=t.clamp(0.0,1.0);best=best.min(g::hypot([p[0]-a[0]-t*d[0],p[1]-a[1]-t*d[1]]));}best}
pub fn number_key(n:f64)->String{if n==0.0{return "0".into();}let s=n.to_string();if n.abs()>=1e-6&&n.abs()<1e21{return s;}let neg=n<0.0;let s=s.trim_start_matches('-');let dot=s.find('.').unwrap_or(s.len())as i32;let digits=s.replace('.',"");let first=digits.find(|c:char|c!='0').unwrap_or(0);let exponent=dot-first as i32-1;let mut digits=digits[first..].trim_end_matches('0').to_string();if digits.is_empty(){digits.push('0');}let rest=if digits.len()>1{format!(".{}",&digits[1..])}else{String::new()};format!("{}{}{}e{}{}",if neg{"-"}else{""},&digits[..1],rest,if exponent>=0{"+"}else{""},exponent)}
impl<D:Destruction> Host<'_,D>{
    /// The same live facts as observe(), without materializing unrelated
    /// projectiles, environments and ship bounds for local cancellation gates.
    pub fn observe_ship(&self,row:usize)->Result<g::Ship,g::Error>{let b=self.bodies.get(row).ok_or(g::Error::Stale)?;let s=b.ship.as_ref().ok_or(g::Error::Host)?;let c=s.combat.as_ref().ok_or(g::Error::Host)?;let m=self.owned.ship(ident(b.handle))?;
        let q=c.query.as_ref().ok_or(g::Error::Host)?;let phased=self.destruction.phased(self.bodies,row,self.specs).map_err(|_|g::Error::Host)?;
        let mut owner=crate::system_owner::local_owner(s,true,false,phased);owner.disable_systems+=crate::system_owner::modifiers(self.bodies,row,self.specs).map_err(|_|g::Error::Host)?.get(e::DISABLE_SYSTEMS);
        Ok(g::Ship{id:m.identity,name:m.name.clone(),root:self.owned.root(m.identity)?,owner,team:Some(c.team as f64),player:c.player.unwrap_or(false),position:[b.motion[0],b.motion[1]],
            previous:s.world.as_ref().ok_or(g::Error::Host)?.previous,velocity:[b.motion[2],b.motion[3]],facing:b.motion[4],angular_velocity:b.motion[5],radius:c.radius,mass:m.mass,max_speed:b.motion[14],
            fixed:m.fixed,attached:m.module.is_some(),module_hull:m.module_hull,bounds:c.bounds.clone(),aim:q.aim,manual:c.attrs[19]!=1.0,trigger:q.trigger,brake:b.motion[8]==1.0,target:q.target.map(ident),
            total_flux:s.flux.total(),max_flux:s.flux.max,range_multiplier:s.world.as_ref().unwrap().range_multiplier})
    }
    fn record(&mut self,event:Record)->Result<(),g::Error>{self.destruction.record(self.bodies,&event,self.visual).map_err(|_|g::Error::Host)?;self.records.push(event);Ok(())}
    /// Use only at the source end-of-world destruction barrier, never after each
    /// gravity packet. The closure handles child recursion/vital modules/debris.
    pub fn finish_deaths(&mut self)->Result<(),g::Error>{for row in 0..self.bodies.len(){let s=self.bodies[row].ship.as_ref().ok_or(g::Error::Host)?;
        if s.flags&ship_state::DEAD==0&&s.armor.as_ref().ok_or(g::Error::Host)?.data[14]<=0.0{self.destruction.apply(self.bodies,row,self.owned,self.ordnance,self.random,self.visual,self.records).map_err(|_|g::Error::Host)?;}}Ok(())}
    fn env(&self,t:g::Target)->Result<&Environment,g::Error>{self.owned.terrain.as_ref().ok_or(g::Error::Host)?.iter().find(|e|e.body.target==t).ok_or(g::Error::Stale)}
    fn projectile_row(&self,id:Identity)->Result<usize,g::Error>{let meta=self.owned.projectiles.iter().find(|m|m.identity==id).ok_or(g::Error::Stale)?;
        self.ordnance.projectiles.iter().position(|p|p.serial==meta.identity.slot as f64).ok_or(g::Error::Stale)}
    fn notices(&mut self,row:usize,events:Vec<Notice>)->Result<(),g::Error>{let b=&self.bodies[row];let id=b.id;let handle=b.handle;
        for notice in events{self.record(Record::Notice{body:id,handle,notice})?;}Ok(())}
    fn sync_tree(&mut self,parent:Identity,visited:&mut Vec<Identity>)->Result<(),g::Error>{if visited.contains(&parent){return Err(g::Error::Host);}visited.push(parent);
        let children=self.owned.ship(parent)?.children.clone();for child in children{let meta=self.owned.ship(child)?;let mount=meta.module.as_ref().ok_or(g::Error::Host)?.clone();if mount.parent!=parent{return Err(g::Error::Host);}
            let row=find(self.bodies,child)?;let source=find(self.bodies,parent)?;let s=self.bodies[row].ship.as_ref().ok_or(g::Error::Host)?;
            if s.flags&ship_state::DEAD==0{let p=self.bodies[source].motion;let pc=self.bodies[source].ship.as_ref().and_then(|s|s.combat.as_ref()).ok_or(g::Error::Host)?;let team=pc.team;let player=pc.player;let retired=self.bodies[source].ship.as_ref().unwrap().flags&ship_state::RETREATED!=0;
                let offset=contact::rotate(mount.offset,p[4]);let b=&mut self.bodies[row];b.motion[0]=p[0]+offset[0];b.motion[1]=p[1]+offset[1];
                if !mount.independent_rotation{b.motion[4]=p[4]+mount.angle;b.motion[5]=p[5];}
                b.motion[2]=p[2]+-offset[1]*p[5];b.motion[3]=p[3]+offset[0]*p[5];let s=b.ship.as_mut().unwrap();let c=s.combat.as_mut().ok_or(g::Error::Host)?;c.team=team;c.player=player;
                if retired{return Err(g::Error::Unsupported);} // root's retirement world action must run before this barrier.
            }self.sync_tree(child,visited)?;}Ok(())}
}
impl<D:Destruction> g::Host for Host<'_,D>{
    fn observe(&self)->Result<g::Observation,g::Error>{let mut ships=Vec::new();for row in self.destruction.roster(self.bodies).map_err(|_|g::Error::Host)?{ships.push(self.observe_ship(row)?);}
        let mut projectiles=Vec::new();for p in &self.ordnance.projectiles{if p.serial<1.0||p.serial>u32::MAX as f64||p.serial.fract()!=0.0{return Err(g::Error::Host);}
            let id=Identity{slot:p.serial as u32,generation:1};let m=self.owned.projectiles.iter().find(|m|m.identity==id).ok_or(g::Error::Host)?;let spec=p.delivery.guidance.as_ref();
            projectiles.push(g::Projectile{id,numeric_id:p.id,position:p.pos,velocity:p.velocity,facing:p.angle,angular_velocity:p.guidance.as_ref().and_then(|s|s.turn_velocity).or(if p.delivery.angular!=0.0{Some(p.delivery.angular)}else{None}),radius:p.delivery.radius,
                damage:p.damage,base_damage:Some(p.base_damage),rocket:spec.is_some_and(|s|s.rocket),ballistic:p.delivery.spawn_type==1,plasma:p.delivery.spawn_type==3,ballistic_beam:p.delivery.spawn_type==2,
                damaged:p.did_damage,collision_disabled:p.collision_disabled,mine:m.mine,flare:spec.is_some_and(|s|s.flare.is_some()),hull_explosion:m.hull_explosion,range:p.range,fade:p.fade,
                team:Some(p.team as f64),source:Some(ident(p.source_handle)),mass_driver:m.mass_driver,binding:m.binding});}
        let environments=self.owned.terrain.as_ref().ok_or(g::Error::Host)?.iter().map(|e|{let mut body=e.body.clone();body.mass=e.mass();body}).collect();Ok(g::Observation{ships,projectiles,environments})}
    fn reservations(&self,owner:Identity)->Result<Vec<(u32,f64)>,g::Error>{let s=self.bodies[find(self.bodies,owner)?].ship.as_ref().ok_or(g::Error::Host)?;Ok(s.systems.iter().map(|s|(s.id,s.pending_flux)).collect())}
    fn locale_compare(&self,a:&str,b:&str)->Result<Ordering,g::Error>{self.owned.collation.compare(a,b)}
    fn segment_entry(&self,t:g::Target,a:V,b:V)->Result<Option<f64>,g::Error>{match t.kind{g::BodyKind::Ship=>ship_entry(&self.bodies[find(self.bodies,t.identity)?],a,b),
        g::BodyKind::Projectile=>{let p=&self.ordnance.projectiles[self.projectile_row(t.identity)?];Ok(circle(a,b,p.pos,p.delivery.radius))},_=>{let e=self.env(t)?;Ok(if t.kind==g::BodyKind::Hulk{g::hulk_segment(local_env(a,e),local_env(b,e),&e.bounds)}else{circle(a,b,e.body.position,e.body.radius)})}}}
    fn pointer_distance(&self,body:&g::Body,p:V)->Result<f64,g::Error>{match body.target.kind{g::BodyKind::Ship=>{let mut best=f64::INFINITY;
        let observation=self.observe()?;for ship in observation.ships.iter().filter(|s|s.root==body.target.identity&&s.live()){let b=&self.bodies[find(self.bodies,ship.id)?];let poly=&b.ship.as_ref().unwrap().combat.as_ref().unwrap().bounds;let local=contact::local(p,&b.motion);
            if poly.len()<3{best=best.min((g::length(local)-ship.radius).max(0.0));}else{if contact::contains(local,poly){return Ok(0.0);}best=best.min(edge_distance(local,poly));}}Ok(best)},
        g::BodyKind::Hulk=>{let e=self.env(body.target)?;let local=local_env(p,e);Ok(if g::point_in_hulk(local,&e.bounds){0.0}else{edge_distance(local,&e.bounds)})},_=>Ok((g::length(sub(p,body.position))-body.radius).max(0.0))}}
    fn owner_contains(&self,owner:Identity,p:V)->Result<bool,g::Error>{let b=&self.bodies[find(self.bodies,owner)?];Ok(contact::contains(contact::local(p,&b.motion),&b.ship.as_ref().and_then(|s|s.combat.as_ref()).ok_or(g::Error::Host)?.bounds))}
    fn line_clear(&self,owner:Identity,body:&g::Body,muzzle:V)->Result<bool,g::Error>{let limit=self.segment_entry(body.target,muzzle,body.position)?.unwrap_or(1.0);let obs=self.observe()?;let root=self.owned.root(owner)?;
        for ship in &obs.ships{if ship.root==root||body.target.kind==g::BodyKind::Ship&&ship.root==self.owned.root(body.target.identity)?||!ship.live(){continue;}
            if self.segment_entry(g::Target{kind:g::BodyKind::Ship,identity:ship.id},muzzle,body.position)?.is_some_and(|t|t<limit-1e-5){return Ok(false);}}
        for kind in [g::BodyKind::Asteroid,g::BodyKind::Hulk]{for e in self.owned.terrain.as_ref().ok_or(g::Error::Host)?.iter().filter(|e|e.body.target.kind==kind){if e.body.target==body.target||!e.body.alive{continue;}
            if self.segment_entry(e.body.target,muzzle,body.position)?.is_some_and(|t|t<limit-1e-5){return Ok(false);}}}Ok(true)}
    fn muzzle(&self,owner:Identity,mount:u32,angle:f64)->Result<V,g::Error>{let b=&self.bodies[find(self.bodies,owner)?];let s=b.ship.as_ref().ok_or(g::Error::Host)?;let w=s.weapons.as_ref().ok_or(g::Error::Host)?;let i=w.mounts.iter().position(|m|m.data[0]==mount as f64).ok_or(g::Error::Host)?;
        let spec=&s.combat.as_ref().ok_or(g::Error::Host)?.fire.get(i).ok_or(g::Error::Host)?.spec;let mut p=add(contact::rotate(spec.relative_pos,b.motion[4]),[b.motion[0],b.motion[1]]);
        if !spec.offsets.is_empty(){let barrel=w.mounts[i].data[30]%spec.offsets.len()as f64;let offset=if barrel>=0.0&&barrel.fract()==0.0{spec.offsets[barrel as usize]}else{[0.0;2]};p=add(p,contact::rotate(offset,angle));}Ok(p)}
    fn target_key(&self,t:g::Target)->Result<String,g::Error>{Ok(match t.kind{g::BodyKind::Ship=>format!("SHIP:{}",self.owned.ship(t.identity)?.name),
        g::BodyKind::Projectile=>format!("PROJECTILE:{}",number_key(self.ordnance.projectiles[self.projectile_row(t.identity)?].id)),g::BodyKind::Asteroid=>format!("ASTEROID:{}",number_key(self.env(t)?.body.numeric_id)),g::BodyKind::Hulk=>format!("HULK:{}",number_key(self.env(t)?.body.numeric_id))})}
    fn increase_flux(&mut self,owner:Identity,amount:f64)->Result<(),g::Error>{let row=find(self.bodies,owner)?;let s=self.bodies[row].ship.as_mut().ok_or(g::Error::Host)?;if !amount.is_finite()||amount<0.0{return Err(g::Error::Host);}
        let mut events=Vec::new();s.flux_operation(1,amount,false,&mut events);self.notices(row,events)}
    fn velocity(&mut self,t:g::Target,v:V,deflected:bool,facing:Option<f64>)->Result<(),g::Error>{if !v.iter().all(|n|n.is_finite())||facing.is_some_and(|n|!n.is_finite()){return Err(g::Error::Host);}match t.kind{
        g::BodyKind::Ship=>{let b=&mut self.bodies[find(self.bodies,t.identity)?];b.motion[2]=v[0];b.motion[3]=v[1];},g::BodyKind::Projectile=>{let i=self.projectile_row(t.identity)?;let p=&mut self.ordnance.projectiles[i];p.velocity=v;if deflected{p.gravity_deflected=true;}if let Some(f)=facing{p.angle=f;}
            if let Some(g)=&mut p.guidance{g.velocity=v;if let Some(f)=facing{g.facing=Some(f);}}},_=>{self.owned.terrain.as_mut().ok_or(g::Error::Host)?.iter_mut().find(|e|e.body.target==t).ok_or(g::Error::Stale)?.body.velocity=v;}}Ok(())}
    fn sync_modules(&mut self,root:Identity)->Result<(),g::Error>{self.sync_tree(root,&mut Vec::new())}
    fn capture_projectile(&mut self,target:Identity,owner:Identity)->Result<(),g::Error>{let row=find(self.bodies,owner)?;let s=self.bodies[row].ship.as_ref().ok_or(g::Error::Host)?;let c=s.combat.as_ref().ok_or(g::Error::Host)?;let source=self.bodies[row].id;let outgoing=c.outgoing();let source_flux=s.flux.percent();let team=c.team;let player=c.player;
        let i=self.projectile_row(target)?;let p=&mut self.ordnance.projectiles[i];let m=self.owned.projectiles.iter_mut().find(|m|m.identity==target).ok_or(g::Error::Stale)?;m.original_source.get_or_insert((p.source,p.source_handle));m.captured_by=Some(owner);m.mass_driver=true;
        p.source=source;p.source_handle=handle(owner);p.gravity_captured=Some(handle(owner));p.team=team;p.player=player;p.guided=false;p.gravity_deflected=true;p.target_ship=None;p.target_handle=None;p.target_projectile=None;p.target_numeric=None;p.outgoing=outgoing;p.source_flux=source_flux;
        if p.delivery.guidance.is_some(){let spec=std::rc::Rc::make_mut(&mut p.delivery).guidance.as_mut().unwrap();spec.guided=false;spec.inertial=true;spec.acceleration=Some(0.0);spec.speed=None;}
        if let Some(g)=&mut p.guidance{g.source=crate::missile_owner::identity(handle(owner));g.allegiance=crate::missile_guidance::Allegiance{team:Some(team),is_player:player};g.guided=false;g.acceleration=Some(0.0);g.max_speed=None;g.target_ship=None;g.target_projectile=None;}Ok(())}
    fn binding(&mut self,target:Identity,binding:g::Binding)->Result<(),g::Error>{self.projectile_row(target)?;find(self.bodies,binding.owner)?;self.owned.projectiles.iter_mut().find(|m|m.identity==target).ok_or(g::Error::Stale)?.binding=Some(binding);Ok(())}
    fn hulk_managed(&mut self,target:Identity)->Result<(),g::Error>{self.owned.terrain.as_mut().ok_or(g::Error::Host)?.iter_mut().find(|e|e.body.target.kind==g::BodyKind::Hulk&&e.body.target.identity==target).ok_or(g::Error::Stale)?.managed=true;Ok(())}
    fn tidal_hit(&mut self,owner:Identity,target:Identity,from:V,raw:f64,strength:f64,continuous:bool)->Result<Option<V>,g::Error>{let source=find(self.bodies,owner)?;let row=find(self.bodies,target)?;
        let s=self.bodies[source].ship.as_ref().ok_or(g::Error::Host)?;let src=s.combat.as_ref().ok_or(g::Error::Host)?;let target_ship=self.bodies[row].ship.as_ref().ok_or(g::Error::Host)?;let tc=target_ship.combat.as_ref().ok_or(g::Error::Host)?;
        if raw<=0.0||!target_ship.can_advance()||self.destruction.phased(self.bodies,row,self.specs).map_err(|_|g::Error::Host)?||src.team==tc.team{return Ok(None);}let Some(t)=ship_entry(&self.bodies[row],from,[self.bodies[row].motion[0],self.bodies[row].motion[1]])?else{return Ok(None);};
        let point=contact::lerp(from,[self.bodies[row].motion[0],self.bodies[row].motion[1]],t);let local=contact::local(point,&self.bodies[row].motion);
        let weapon=src.attrs[15]*crate::system_owner::modifiers(self.bodies,source,self.specs).map_err(|_|g::Error::Host)?.weapon_value(e::ENERGY,e::DAMAGE);let out=battle::outgoing_multiplier(src.outgoing(),tc.size,2,Some(from),point,s.flux.percent());
        let mut damage=raw*weapon*src.attrs[11]*out*tc.attrs[1];let component_source=[s.damage_policy[3],s.damage_policy[4]];
        if !damage.is_finite()||!strength.is_finite(){return Err(g::Error::Host);}let pose=self.bodies[row].motion;
        let shield_hit=target_ship.shield.as_ref().is_some_and(|sh|blocked(sh,&pose,point));let graviton=tc.graviton_multiplier;
        let root=find(self.bodies,self.owned.root(target)?)?;let target_live=crate::system_owner::modifiers(self.bodies,row,self.specs).map_err(|_|g::Error::Host)?;let mut notices=Vec::new();let ship=self.bodies[row].ship.as_mut().unwrap();ship.live=target_live;
        if shield_hit{let sh=ship.shield.as_mut().unwrap();let center=contact::shield_center(sh,&pose);let base=sh.data[40];
            // Installed data40 is the ordered static Map fold. The live Graviton
            // listener follows it, before external and ENERGY multipliers. Void
            // shields deliberately read only external damage in Shield.impact.
            if sh.void.is_none(){sh.data[40]=base*graviton;}
            let (flux,absorbed,left)=sh.impact(damage,0,(point[1]-center[1]).atan2(point[0]-center[0]));sh.data[40]=base;
            ship.flux_operation(0,flux,true,&mut notices);ship.sync_shield();damage*=left;self.record(Record::Damage{owner,target,area:0,value:absorbed})?;self.record(Record::Ripple{point,size:if continuous{12.0}else{45.0}})?;}
        if damage>0.0{
            // Armor's native standalone callback contacts its own shield. A
            // module instead contacts its assembly root, including armor-cell
            // damage with no hull overflow. Preserve its separate void state.
            let ship=self.bodies[row].ship.as_mut().unwrap();let own_void=if root!=row{ship.shield.as_mut().and_then(|sh|sh.void.take())}else{None};
            let result=ship.armor_impact(&[local[0],local[1],damage,0.0,1.0,strength,continuous as u32 as f64,0.0],self.visual,&mut notices).map_err(|_|g::Error::Host)?;
            ship.propagate(local,[result[0],result[1]],0.0,component_source,self.random,&mut notices).map_err(|_|g::Error::Host)?;
            let suppressed=ship.armor.as_ref().ok_or(g::Error::Host)?.data[18]==1.0;
            let dealt=self.destruction.hull(self.bodies,row,self.owned,result[1],self.specs,&mut notices).map_err(|_|g::Error::Host)?;
            if let Some(v)=own_void{self.bodies[row].ship.as_mut().and_then(|s|s.shield.as_mut()).ok_or(g::Error::Host)?.void=Some(v);}
            self.record(Record::Damage{owner,target,area:1,value:result[0]})?;self.record(Record::Damage{owner,target,area:2,value:dealt})?;
            if !suppressed{let offset=contact::rotate(local,pose[4]);let particles=crate::world_damage::armor_particles([pose[0]+offset[0],pose[1]+offset[1]],result[0],self.visual);
                self.record(Record::Sparks{target,local,armor:result[0],particles})?;}
            if dealt>0.0{self.record(Record::Floating{point,value:dealt})?;}
            if root!=row&&(result[0]>0.0||dealt>0.0){
                if let Some(v)=self.bodies[root].ship.as_mut().and_then(|s|s.shield.as_mut()).and_then(|sh|sh.void.as_mut()){v.data[7]=v.data[3];}}
        }
        // GravityDamage does not dispatch destruction here. The original world's
        // destruction sweep runs after terrain, collisions and projectile work.
        self.notices(row,notices)?;Ok(Some(point))}
}

