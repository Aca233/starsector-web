//! Resident FlightWorld adapter. Templates contain installation data, never a
//! second evolving ShipState. Entity allocation, stage and death are mandatory
//! synchronous Rust services belonging to the caller's whole-step transaction.
use crate::{armor, battle::{self,CombatShip,FireEntry,Ordnance},component,contact,
    engine,fire_control as fc,fire_query,flight_world as f,lifecycle::{Spec,System},
    motion,random::Random,readiness_owner,shield,ship_effects,ship_state::{self,ShipState},
    state::{Body,Handle},system_owner,tactical_ai::Identity,weapon,weapon_fire,world_owner};
use std::{collections::{BTreeMap,BTreeSet},f64::consts::PI};
type V=[f64;2];
fn id(h:Handle)->Identity{Identity{handle:h.slot,generation:h.generation}}
fn handle(h:Identity)->Handle{Handle{slot:h.handle,generation:h.generation}}
fn vec(v:V)->f::Vec2{f::Vec2{x:v[0],y:v[1]}}
fn point(v:f::Vec2)->V{[v.x,v.y]}
fn find(b:&[Body],h:Identity)->Result<usize,f::Error>{b.iter().position(|b|id(b.handle)==h).ok_or(f::Error::StaleIdentity)}
fn phase(s:&ShipState)->bool{s.flags&(ship_state::DOCKED|ship_state::RETREATED)!=0||s.shield.as_ref().is_some_and(|sh|sh.kind()==3&&(sh.data[14]==1.0||sh.data[14]==2.0||sh.data[14]==3.0&&sh.data[15]>0.5))}
fn finite(v:&[f64])->bool{v.iter().all(|v|v.is_finite())}
fn unit(v:f64)->bool{v==0.0||v==1.0}

#[derive(Clone)]pub struct ShieldTemplate{pub install:[f64;19],pub damage:[f64;3],pub void:Option<[f64;5]>}
#[derive(Clone)]pub struct MountTemplate{
    pub slot:String,pub generation:u32,pub component:[f64;7],pub install:[f64;16],pub min_spread:f64,
    pub fire:FireEntry,pub system_only:bool,pub max_ammo_present:bool,pub regen_present:bool,pub guided_speed:Option<f64>,
}
#[derive(Clone)]pub struct GroupTemplate{pub index:u32,pub linked:bool,pub automatic:bool,pub members:Vec<u32>}
#[derive(Clone)]pub struct SystemTemplate{pub id:u32,pub spec:u32,pub defense:bool,pub upkeep:[f64;8],pub kind:ship_effects::Kind}
#[derive(Clone)]pub struct ModuleTemplate{pub template:Box<StaticShip>,pub offset:V,pub angle:f64,pub independent:bool,pub manual:bool}
/// Pure constructor inputs compiled once from the actual installed craft spec
/// and carrier refit. Runtime timers/HP/ammo/tracker states are not accepted.
#[derive(Clone)]pub struct StaticShip{
    pub spec_id:String,pub carrier_spec_key:String,pub footprint:f::Footprint,pub role:f::CraftRole,pub hull_size:u32,
    pub flux:[f64;17],pub armor:[f64;17],pub armor_stats:[f64;15],pub shield:ShieldTemplate,
    pub damage_policy:[f64;8],pub mounts:Vec<MountTemplate>,pub groups:Vec<GroupTemplate>,pub selected:Option<usize>,
    pub weapon_policy:[f64;15],pub systems:Vec<SystemTemplate>,pub children:Vec<ModuleTemplate>,
    pub engine_health:f64,pub engines:Vec<[f64;10]>,pub engine_motion:[f64;21],pub engine_policy:[f64;5],
    pub attrs:[f64;20],pub shield_pierced:f64,pub motion_flags:u32,pub query:[f64;12],pub visible:BTreeMap<u32,bool>,pub readiness:[f64;9],pub death:world_owner::Meta,
    pub world_flags:u32,pub range_multiplier:f64,pub side:i32,pub muzzle:Option<V>,
    pub wings:Vec<f::WingSpec>,pub bays:usize,pub carrier_stats:f::CarrierStats,
    /// Ordered typed installation effects, after readiness's initial draw.
    pub hooks:Vec<InstallHook>,pub hooks_complete:bool,
    /// Production generated-body metadata; the real Authority requires it.
    pub spawn_admission:Option<crate::flight_admission::Template>,
}
#[derive(Clone)]pub enum InstallHook{LockShield,Runtime{id:u32,modifiers:ship_effects::Modifiers}}
#[derive(Clone)]pub struct Variant{pub carrier_spec:String,pub point_defense:Option<f64>,pub ship:StaticShip}
#[derive(Clone)]pub struct CraftTemplate{pub description:f::Template,pub variants:Vec<Variant>}
impl StaticShip{
    pub fn validate(&self,specs:&BTreeMap<u32,Spec>)->Result<(),f::Error>{
        if !self.hooks_complete{return Err(f::Error::Unsupported);}
        if self.spec_id.is_empty()||self.carrier_spec_key.is_empty()||self.hull_size>4||!finite(&self.flux)||!finite(&self.armor)||!finite(&self.armor_stats)
            ||!finite(&self.shield.install)||!finite(&self.shield.damage)||self.shield.void.is_some_and(|v|!finite(&v))
            ||!finite(&self.damage_policy)||!finite(&self.weapon_policy)||!finite(&self.engine_motion)||!finite(&self.engine_policy)
            ||!finite(&self.attrs)||!finite(&self.query)||!finite(&self.readiness)||!self.engine_health.is_finite()||!self.shield_pierced.is_finite()||self.motion_flags>255
            ||!finite(&[self.footprint.radius,self.footprint.width,self.footprint.height,self.footprint.pivot_x,self.footprint.pivot_y])
            ||self.footprint.bounds.iter().any(|p|!finite(&point(*p)))||self.footprint.radius<0.0
            ||!finite(&[self.carrier_stats.range_multiplier,self.carrier_stats.refit_multiplier,self.carrier_stats.rearm_fraction,
                self.carrier_stats.decrease_multiplier,self.carrier_stats.increase_percent,self.carrier_stats.increase_multiplier])
            ||self.carrier_stats.point_defense_skill.is_some_and(|n|!n.is_finite())
            ||!self.range_multiplier.is_finite()||!self.death.complete()||!self.death.valid(){return Err(f::Error::InvalidNumber);}
        // configureVoidShield is an authored constructor effect: fresh void
        // shields start armed and online. Certify its matching flags exactly.
        let initial_shield=self.shield.void.is_some();
        let initial_flags=ship_state::DISSIPATE|if initial_shield{ship_state::SHIELD}else{0};
        if self.flux[0]<0.0||self.flux[8]!=0.0||self.flux[9]!=0.0||self.flux[10]!=initial_flags as f64
            ||self.armor[0]<=0.0||self.armor[1]<=0.0||self.armor[0].fract()!=0.0||self.armor[1].fract()!=0.0
            ||self.armor[7]!=self.armor[8]||self.armor[7]<=0.0||self.visible.len()!=self.query[0]as usize
            ||self.query[1]!=0.0||self.query[0].fract()!=0.0||self.query[2..6].iter().any(|n|!unit(*n))
            ||self.shield.install[17]!=initial_shield as u32 as f64||self.selected.is_some_and(|s|s>=self.groups.len()){return Err(f::Error::InvalidTopology);}
        let mut ids=BTreeSet::new();let mut slots=BTreeSet::new();
        for m in &self.mounts{
            let e=&m.fire;let q=e.query.as_ref().ok_or(f::Error::Unsupported)?;
            if m.generation==0||m.slot.is_empty()||!slots.insert(&m.slot)||!ids.insert(m.install[1]as u32)
                ||m.install[1]!=m.component[0]||m.component[6]!=0.0||!finite(&m.component)||!finite(&m.install)
                ||m.install[1].fract()!=0.0||m.install[1]<=0.0||!m.min_spread.is_finite()
                ||!e.complete()||!e.valid()||e.range_inputs.is_none()||q.memory.is_some()||q.cadence.is_some()
                ||e.state.target_ship.is_some()||e.state.target_projectile.is_some()
                ||e.input.requested||e.input.trigger_held||e.input_target.is_some()||e.cycle_target.is_some()
                ||m.guided_speed.is_some_and(|s|!s.is_finite()||s<0.0){return Err(f::Error::InvalidTopology);}
        }
        for g in &self.groups{if g.members.iter().any(|id|!ids.contains(id)){return Err(f::Error::InvalidTopology);}}
        let mut systems=BTreeSet::new();for s in &self.systems{if !systems.insert(s.id)||!specs.contains_key(&s.spec)||!finite(&s.upkeep){return Err(f::Error::UnknownTemplate);}}
        for e in &self.engines{if !finite(e){return Err(f::Error::InvalidNumber);}}
        for m in &self.children{if !finite(&m.offset)||!m.angle.is_finite(){return Err(f::Error::InvalidNumber);}m.template.validate(specs)?;}
        if let Some(a)=&self.spawn_admission{if a.spec_key.is_empty()||a.phase.controls.len()!=self.systems.len()
            ||a.phase.controls.iter().any(|(sid,_)|!self.systems.iter().any(|s|s.id==*sid))||a.ai.meta.mounts.len()!=self.mounts.len()
            ||a.ai.slots.len()!=self.mounts.len()||a.ai.slots.iter().zip(&self.mounts).any(|(s,m)|*s!=m.slot)||a.ai.meta.systems.len()!=self.systems.len()
            ||a.ai.meta.systems.iter().zip(&self.systems).any(|(a,s)|a.id!=s.id||a.defense!=s.defense)
            ||a.ai.meta.memory.is_some()||a.ai.meta.order.is_some()||a.aux.travel.iter().any(|sid|!self.systems.iter().any(|s|s.id==*sid))
            ||a.aux.payloads.iter().any(|p|!p.valid())||!a.prelude.meta.valid()||a.visual.mounts.len()!=self.mounts.len()
            ||a.visual.mounts.iter().zip(&self.mounts).any(|(v,m)|v.component as f64!=m.component[0]||v.slot!=m.slot)
            ||a.visual.engines.len()!=self.engines.len()||a.visual.fighter!=(self.hull_size==0)||!a.read.valid()||!a.system_read.valid()
            ||a.system_read.module_slot!=a.ai.module_slot||a.system_read.propulsion.as_ref().is_some_and(|p|p.slots.iter().flatten().any(|i|*i>=self.children.len())){return Err(f::Error::InvalidTopology);}}
        Ok(())
    }
}
#[derive(Clone)]pub struct ModulePose{pub parent:Identity,pub offset:V,pub angle:f64,pub independent:bool}
#[derive(Clone)]pub struct MountMeta{pub component:u32,pub slot:String,pub generation:u32,pub system_only:bool,pub max_ammo_present:bool,pub regen_present:bool,pub guided_speed:Option<f64>}
#[derive(Clone)]pub struct ShipMeta{
    pub identity:Identity,pub stable_id:String,pub spec_id:String,pub carrier_spec_key:String,pub role:f::CraftRole,pub footprint:f::Footprint,
    pub module:Option<ModulePose>,pub wing:Option<String>,pub deployed:Vec<Identity>,pub recall:bool,
    pub wings:Vec<f::WingSpec>,pub bays:usize,pub carrier_stats:f::CarrierStats,pub mounts:Vec<MountMeta>,
    pub engine_slots:Vec<V>,pub player_target:Option<Identity>,
    pub spawn_admission:Option<crate::flight_admission::Template>,
}
#[derive(Clone,Default)]pub struct Owned{pub templates:Vec<CraftTemplate>,pub ships:Vec<ShipMeta>,pub fleet_order:Option<f::Order>,pub orders:Vec<(Identity,f::Order)>,pub retired:Vec<Identity>,pub detached:Vec<Identity>}
impl Owned{
    pub fn ship(&self,h:Identity)->Result<&ShipMeta,f::Error>{self.ships.iter().find(|s|s.identity==h).ok_or(f::Error::StaleIdentity)}
    pub fn ship_mut(&mut self,h:Identity)->Result<&mut ShipMeta,f::Error>{self.ships.iter_mut().find(|s|s.identity==h).ok_or(f::Error::StaleIdentity)}
    pub fn install(&mut self,t:CraftTemplate,specs:&BTreeMap<u32,Spec>)->Result<(),f::Error>{
        if t.description.handle==0||!t.description.fighter||t.variants.is_empty()||self.templates.iter().any(|x|x.description.handle==t.description.handle||x.description.spec_id==t.description.spec_id){return Err(f::Error::UnknownTemplate);}
        for(i,v)in t.variants.iter().enumerate(){if v.carrier_spec.is_empty()||v.ship.spec_id!=t.description.spec_id||v.ship.hull_size!=0||v.ship.role!=t.description.role
            ||v.point_defense.is_some_and(|x|!x.is_finite()||x==0.0)||t.variants[..i].iter().any(|x|x.carrier_spec==v.carrier_spec&&x.point_defense==v.point_defense){return Err(f::Error::UnknownTemplate);}v.ship.validate(specs)?;}
        self.templates.push(t);Ok(())
    }
    pub fn root(&self,bodies:&[Body],mut h:Identity)->Result<Identity,f::Error>{let mut seen=Vec::new();loop{if seen.contains(&h){return Err(f::Error::InvalidTopology);}seen.push(h);
        let s=bodies[find(bodies,h)?].ship.as_ref().ok_or(f::Error::HostFailure)?;if let Some(parent)=s.world.as_ref().ok_or(f::Error::HostFailure)?.parent{h=id(parent);}else{return Ok(h);}}}
}
#[derive(Clone)]pub struct Step{pub craft:Identity,pub dt:f64,pub target:Option<Identity>,pub permission:f::FirePermission}
#[derive(Clone,Copy)]pub struct Allocation{pub numeric_id:u32,pub identity:Identity,pub order:f64}
/// No fallback implementations. All effects participate in the same cloned
/// whole-world transaction, including allocator slots and queued stage receipts.
pub trait Services{
    fn allocate(&mut self,stable_id:&str)->Result<Allocation,f::Error>;
    /// Register the constructed real tree in every shared authority domain.
    fn admitted(&mut self,bodies:&mut Vec<Body>,owned:&mut Owned,tree:&[Identity])->Result<(),f::Error>;
    /// Update global query/batch/ordinary-craft membership at the exact source
    /// removal boundary. Docked witnesses retain resources and identities.
    fn removed(&mut self,bodies:&mut Vec<Body>,owned:&mut Owned,craft:Identity,reason:f::Removal)->Result<(),f::Error>;
    fn enqueue(&mut self,step:Step)->Result<(),f::Error>;
    /// Clears held gravity/navigation activations, preserving other targets.
    fn clear_held(&mut self,bodies:&mut[Body],craft:Identity)->Result<(),f::Error>;
    fn destruction_enabled(&self)->bool;
    fn destroy(&mut self,bodies:&mut[Body],ordnance:&mut Ordnance,owned:&mut Owned,craft:Identity,random:&mut Random,visual:&mut Random)->Result<(),f::Error>;
}
#[derive(Clone)]pub struct Contrail{pub craft:Identity,pub pos:V,pub vel:V,pub life:f64,pub max_life:f64,pub size:f64,pub max_size:f64,pub alpha:f64,pub rotation:f64,pub color:[u8;3]}
#[derive(Clone)]pub enum Record{Spawned{tree:Vec<Identity>},Removed{craft:Identity,reason:f::Removal},Contrail(Contrail),Event{craft:Identity,event:f::FlightEvent}}
pub struct Host<'a,S:Services>{pub bodies:&'a mut Vec<Body>,pub owned:&'a mut Owned,pub ordnance:&'a mut Ordnance,pub specs:&'a BTreeMap<u32,Spec>,pub random:&'a mut Random,pub visual:&'a mut Random,pub records:&'a mut Vec<Record>,pub services:&'a mut S}
impl<S:Services> Host<'_,S>{
    /// Initial battle/carrier admission uses the same constructor as rebuilds.
    /// All new domain metadata is admitted atomically by the caller's service.
    pub fn construct_static(&mut self,t:&StaticShip,stable:String,at:V,facing:f64,player:bool,team:u32,manual:bool)->Result<Identity,f::Error>{t.validate(self.specs)?;let mut tree=Vec::new();let h=self.construct(t,stable,at,facing,player,team,None,None,manual,&mut tree)?;self.services.admitted(self.bodies,self.owned,&tree)?;self.records.push(Record::Spawned{tree});Ok(h)}
    fn construct(&mut self,t:&StaticShip,stable:String,at:V,facing:f64,player:bool,team:u32,carrier:Option<Identity>,module:Option<ModulePose>,manual:bool,tree:&mut Vec<Identity>)->Result<Identity,f::Error>{
        let allocation=self.services.allocate(&stable)?;let h=allocation.identity;
        if h.generation==0||allocation.numeric_id==0||!allocation.order.is_finite()
            ||self.bodies.iter().any(|b|id(b.handle)==h||b.id==allocation.numeric_id)||self.owned.ships.iter().any(|m|m.stable_id==stable){return Err(f::Error::InvalidIdentity);}
        tree.push(h);let mut pose=[0.0;motion::WIDTH];pose[..2].copy_from_slice(&at);pose[4]=facing;pose[11]=(t.motion_flags|if t.hull_size==0{128}else{0})as f64;
        let mut s=ShipState::new(&t.flux);s.armor=Some(armor::Armor::new(&t.armor));s.armor.as_mut().unwrap().stats(&t.armor_stats);s.damage_policy=t.damage_policy;
        let mut sh=shield::Shield::new(&t.shield.install);
        // Damage fold is static + live Graviton; external stays a separate read.
        sh.data[40..43].copy_from_slice(&t.shield.damage);
        if let Some(v)=t.shield.void{sh.configure_void(&v);}s.shield=Some(sh);s.sync_shield();
        for d in &t.systems{let mut life=System::new(d.id,d.spec,&self.specs[&d.spec]);life.defense=d.defense;life.upkeep=d.upkeep;s.systems.push(life);}
        let mut w=weapon::Controller::new(&[facing,t.mounts.len()as f64,t.groups.len()as f64,manual as u32 as f64]);w.data[4..19].copy_from_slice(&t.weapon_policy);w.data[22]=t.selected.unwrap_or(0)as f64;
        let mut c=CombatShip::new(&[team as f64,t.hull_size as f64,t.footprint.radius,t.footprint.bounds.len()as f64,1.0,player as u32 as f64]);c.bounds=t.footprint.bounds.iter().map(|v|point(*v)).collect();c.attrs=t.attrs;c.attrs[19]=(!manual)as u32 as f64;c.shield_pierced=t.shield_pierced;
        let mut q=fire_query::ShipQuery::new(&t.query);q.player=player;q.visible=t.visible.clone();q.selected=t.selected;c.query=Some(q);
        for m in &t.mounts{s.components.push(component::Component::new(&m.component,self.random));w.install(&m.install);let n=w.mounts.len()-1;let d=&mut w.mounts[n].data;
            d[15]=facing+m.fire.query.as_ref().unwrap().base*PI/180.0;d[17]=if m.install[10]==1.0{m.install[11]}else{f64::INFINITY};d[35]=(!d[17].is_finite())as u32 as f64;d[31]=m.min_spread;
            if d[14]==1.0{d[32]=1.0;d[33]=if d[17]>=1.0{1.0}else{0.0};d[34]=if d[17]>=2.0{1.0}else{0.0};}w.mounts[n].initialized=true;
            let mut e=m.fire.clone();e.state=weapon_fire::FireMountState::default();let mq=e.query.as_mut().unwrap();mq.salt=fc::tracker_salt(&format!("{}/{}",stable,m.slot));mq.idle=15.1;c.fire.push(e);}
        for g in &t.groups{let mut data=[0.0;weapon::GROUP_WIDTH];data[0]=g.index as f64;data[1]=(!g.linked)as u32 as f64;data[2]=g.automatic as u32 as f64;data[10]=g.members.len()as f64;w.groups.push(weapon::Group{data,members:g.members.clone()});}s.weapons=Some(w);
        let mut world=system_owner::Owned::new(&[t.world_flags as f64,0.0,0.0,0.0,0.0,0.0,0.0,t.children.len()as f64,t.side as f64,t.range_multiplier,0.0,0.0,0.0],&pose);
        world.parent=module.as_ref().map(|m|handle(m.parent));world.carrier=carrier.map(handle);world.muzzle=t.muzzle;world.aim=[0.0;2];
        for d in &t.systems{world.metas.insert(d.id,system_owner::Meta{kind:d.kind,input:None,jump:ship_effects::TacticalJump::default(),regen:0.0});}s.world=Some(world);c.death=Some(t.death.clone());s.combat=Some(c);
        self.owned.ships.push(ShipMeta{identity:h,stable_id:stable.clone(),spec_id:t.spec_id.clone(),carrier_spec_key:t.carrier_spec_key.clone(),role:t.role,footprint:t.footprint.clone(),module,wing:None,deployed:Vec::new(),recall:false,wings:Vec::new(),bays:0,
            carrier_stats:t.carrier_stats,mounts:t.mounts.iter().map(|m|MountMeta{component:m.component[0]as u32,slot:m.slot.clone(),generation:m.generation,system_only:m.system_only,max_ammo_present:m.max_ammo_present,regen_present:m.regen_present,guided_speed:m.guided_speed}).collect(),engine_slots:t.engines.iter().map(|e|[e[1],e[2]]).collect(),player_target:None,spawn_admission:t.spawn_admission.clone()});
        {let meta=self.owned.ship_mut(h)?;meta.wings=t.wings.clone();meta.bays=t.bays;}
        let row=self.bodies.len();self.bodies.push(Body{id:allocation.numeric_id,handle:handle(h),order:allocation.order,motion:pose,ship:Some(s)});
        for(index,m)in t.children.iter().enumerate(){let child=self.construct(&m.template,format!("{}:module:{}",stable,index),at,facing,player,team,None,Some(ModulePose{parent:h,offset:m.offset,angle:m.angle,independent:m.independent}),m.manual,tree)?;
            self.bodies[row].ship.as_mut().unwrap().world.as_mut().unwrap().children.push(handle(child));self.sync_child(child,true)?;self.tree_sync(child,&mut Vec::new())?;}
        // Source creates every recursive child BEFORE parent engines/readiness.
        let mut e=engine::Controller::new(&[t.hull_size as f64,t.footprint.radius,t.engine_health,t.engines.len()as f64]);for slot in &t.engines{e.install(slot,self.random);}e.motion=t.engine_motion;e.data[14..19].copy_from_slice(&t.engine_policy);e.data[19]=1.0;
        let ordinary_engines=e.engines.iter().filter(|e|e.data[5]==0.0).count();let module_count=t.mounts.len()+t.mounts.iter().filter(|m|m.component[2]!=2.0).count()+ordinary_engines;
        let s=self.bodies[row].ship.as_mut().unwrap();s.damage_policy[5]=s.armor.as_ref().unwrap().data[13]/module_count.max(1)as f64*0.75;s.engines=Some(e);let c=s.combat.as_mut().unwrap();c.readiness=Some(readiness_owner::Owned::new(&t.readiness,c,t.damage_policy[7],self.random));
        for hook in &t.hooks{match hook{InstallHook::LockShield=>s.shield.as_mut().unwrap().data[5]=1.0,
            InstallHook::Runtime{id,modifiers}=>s.world.as_mut().unwrap().runtime.push((*id,modifiers.clone()))}}
        s.sync_shield();s.sync_engines();if !s.valid()||!s.world.as_ref().unwrap().complete(s)||!s.combat.as_ref().unwrap().complete(t.mounts.len()){return Err(f::Error::HostFailure);}Ok(h)
    }
    fn sync_child(&mut self,child:Identity,reset:bool)->Result<(),f::Error>{let m=self.owned.ship(child)?.module.clone().ok_or(f::Error::InvalidTopology)?;let row=find(self.bodies,child)?;let parent=find(self.bodies,m.parent)?;
        if self.bodies[row].ship.as_ref().ok_or(f::Error::HostFailure)?.flags&ship_state::DEAD!=0{return Ok(());}let p=self.bodies[parent].motion;let pc=self.bodies[parent].ship.as_ref().unwrap().combat.as_ref().ok_or(f::Error::HostFailure)?;let(team,player)=(pc.team,pc.player);
        let retired=self.bodies[parent].ship.as_ref().unwrap().flags&ship_state::RETREATED!=0;let recall=self.owned.ship(m.parent)?.recall;let offset=contact::rotate(m.offset,p[4]);let b=&mut self.bodies[row];b.motion[0]=p[0]+offset[0];b.motion[1]=p[1]+offset[1];
        if !m.independent||reset{b.motion[4]=p[4]+m.angle;b.motion[5]=p[5];}b.motion[2]=p[2]+-offset[1]*p[5];b.motion[3]=p[3]+offset[0]*p[5];let s=b.ship.as_mut().unwrap();let c=s.combat.as_mut().unwrap();c.team=team;c.player=player;s.combat.as_mut().unwrap().query.as_mut().unwrap().player=player.ok_or(f::Error::HostFailure)?;
        if retired{s.flags|=ship_state::RETREATED;}if reset{let w=s.world.as_mut().unwrap();w.previous=[b.motion[0],b.motion[1]];w.previous_facing=b.motion[4];}self.owned.ship_mut(child)?.recall=recall;Ok(())
    }
    fn tree_sync(&mut self,parent:Identity,seen:&mut Vec<Identity>)->Result<(),f::Error>{if seen.contains(&parent){return Err(f::Error::InvalidTopology);}seen.push(parent);for child in <Self as f::Host>::children(self,parent)?{self.sync_child(child,true)?;self.tree_sync(child,seen)?;}Ok(())}
    fn query(&self,h:Identity)->Result<&fire_query::ShipQuery,f::Error>{self.bodies[find(self.bodies,h)?].ship.as_ref().and_then(|s|s.combat.as_ref()).and_then(|c|c.query.as_ref()).ok_or(f::Error::HostFailure)}
    fn mount(&self,h:Identity,mount:u32,generation:u32)->Result<(usize,usize,&MountMeta),f::Error>{let row=find(self.bodies,h)?;let meta=self.owned.ship(h)?.mounts.iter().find(|m|m.component==mount&&m.generation==generation).ok_or(f::Error::StaleIdentity)?;
        let slot=self.bodies[row].ship.as_ref().and_then(|s|s.weapons.as_ref()).ok_or(f::Error::HostFailure)?.mounts.iter().position(|m|m.data[0]==mount as f64).ok_or(f::Error::StaleIdentity)?;Ok((row,slot,meta))}
}
/// One projection of the actual body. Callers supply their effective motion and
/// phase reads; production does not first build and overwrite a legacy view.
pub fn observe_body(bodies:&[Body],owned:&Owned,r:usize,turn_deceleration:f64,phased:bool)->Result<f::Body,f::Error>{
    let b=bodies.get(r).ok_or(f::Error::StaleIdentity)?;let h=id(b.handle);let s=b.ship.as_ref().ok_or(f::Error::HostFailure)?;let c=s.combat.as_ref().ok_or(f::Error::HostFailure)?;
    let q=c.query.as_ref().ok_or(f::Error::HostFailure)?;let w=s.world.as_ref().ok_or(f::Error::HostFailure)?;let m=owned.ship(h)?;let a=s.armor.as_ref().ok_or(f::Error::HostFailure)?;
    Ok(f::Body{identity:h,id:m.stable_id.clone(),root:owned.root(bodies,h)?,source_carrier:w.carrier.map(id),wing:m.wing.clone(),role:m.role,player:c.player.ok_or(f::Error::HostFailure)?,team:c.team as f64,
        dead:s.flags&ship_state::DEAD!=0,retreated:s.flags&ship_state::RETREATED!=0,docked:s.flags&ship_state::DOCKED!=0,phased,hp:a.data[14],max_hp:a.data[13],flux:s.flux.percent(),overloaded:s.flux.overloaded,venting:s.flux.venting,
        pos:vec([b.motion[0],b.motion[1]]),prev:vec(w.previous),vel:vec([b.motion[2],b.motion[3]]),facing:b.motion[4],angular:b.motion[5],turn_deceleration,spec:m.footprint.clone(),child_count:w.children.len(),recall:m.recall,
        player_target:m.player_target,current_target:q.target.map(id),aim:vec(q.aim),controls:crate::navigation_ai::Controls{turn:b.motion[7],brake:b.motion[8]==1.0,throttle:b.motion[9],strafe:b.motion[10]},hold:q.hold,firing:q.trigger})
}
impl<S:Services> f::Host for Host<'_,S>{
    fn body(&self,h:Identity)->Result<f::Body,f::Error>{let r=find(self.bodies,h)?;let b=&self.bodies[r];let s=b.ship.as_ref().ok_or(f::Error::HostFailure)?;
        let live=system_owner::modifiers(self.bodies,r,self.specs).map_err(|_|f::Error::HostFailure)?;let mut current=b.motion;let eng=s.engines.as_ref().ok_or(f::Error::HostFailure)?;eng.motion_row_live(&mut current,s.flux.boost,s.motion_speed_multiplier(),s.engine_context().extended,&live);
        observe_body(self.bodies,self.owned,r,current[15]*0.5,phase(s))}
    fn template(&self,h:u32)->Result<f::Template,f::Error>{self.owned.templates.iter().find(|t|t.description.handle==h).map(|t|t.description.clone()).ok_or(f::Error::UnknownTemplate)}
    fn carrier_stats(&self,h:Identity)->Result<f::CarrierStats,f::Error>{find(self.bodies,h)?;Ok(self.owned.ship(h)?.carrier_stats)}
    fn sync_modules(&mut self,h:Identity)->Result<(),f::Error>{self.tree_sync(h,&mut Vec::new())}
    fn children(&self,h:Identity)->Result<Vec<Identity>,f::Error>{let s=self.bodies[find(self.bodies,h)?].ship.as_ref().and_then(|s|s.world.as_ref()).ok_or(f::Error::HostFailure)?;Ok(s.children.iter().copied().map(id).collect())}
    fn assembly(&self,root:Identity)->Result<Vec<Identity>,f::Error>{fn visit<S:Services>(host:&Host<'_,S>,h:Identity,out:&mut Vec<Identity>)->Result<(),f::Error>{if out.contains(&h){return Err(f::Error::InvalidTopology);}out.push(h);for c in <Host<'_,S> as f::Host>::children(host,h)?{visit(host,c,out)?;}Ok(())}let mut out=Vec::new();visit(self,root,&mut out)?;Ok(out)}
    fn deployed(&self,h:Identity)->Result<Vec<Identity>,f::Error>{find(self.bodies,h)?;Ok(self.owned.ship(h)?.deployed.clone())}
    fn carrier_wings(&self,h:Identity)->Result<Vec<f::WingSpec>,f::Error>{let m=self.owned.ship(h)?;Ok(m.wings.iter().take(m.bays).cloned().collect())}
    fn formation_templates(&self,h:Identity)->Result<Vec<u32>,f::Error>{Ok(self.owned.ship(h)?.wings.iter().map(|w|w.template).collect())}
    fn random_next(&mut self)->Result<f64,f::Error>{Ok(self.random.next())}
    fn next_id(&mut self,prefix:&str)->Result<String,f::Error>{if self.random.ids>=9_007_199_254_740_991.0||self.random.ids<0.0||self.random.ids.fract()!=0.0{return Err(f::Error::InvalidNumber);}let mut value=self.random.next_id()as u64;let mut chars=Vec::new();while value>0{let digit=(value%36)as u8;chars.push(if digit<10{(b'0'+digit)as char}else{(b'a'+digit-10)as char});value/=36;}chars.reverse();Ok(format!("{}_{}",prefix,chars.into_iter().collect::<String>()))}
    fn spawn(&mut self,spawn:f::Spawn)->Result<Identity,f::Error>{if !finite(&[spawn.pos.x,spawn.pos.y,spawn.facing]){return Err(f::Error::InvalidNumber);}let carrier=self.body(spawn.carrier)?;let key=self.owned.ship(spawn.carrier)?.carrier_spec_key.clone();let t=self.owned.templates.iter().find(|t|t.description.handle==spawn.template).ok_or(f::Error::UnknownTemplate)?;
        let t=t.variants.iter().find(|v|v.carrier_spec==key&&v.point_defense==spawn.point_defense_skill).ok_or(f::Error::UnknownTemplate)?.ship.clone();t.validate(self.specs)?;let mut tree=Vec::new();let craft=self.construct(&t,spawn.id,point(spawn.pos),spawn.facing,carrier.player,carrier.team as u32,Some(spawn.carrier),None,true,&mut tree)?;
        self.services.admitted(self.bodies,self.owned,&tree)?;self.records.push(Record::Spawned{tree});Ok(craft)}
    fn bind_craft(&mut self,craft:Identity,carrier:Identity,wing:&str)->Result<(),f::Error>{let row=find(self.bodies,craft)?;find(self.bodies,carrier)?;if wing.is_empty()||self.owned.ship(carrier)?.deployed.contains(&craft){return Err(f::Error::InvalidTopology);}self.bodies[row].ship.as_mut().unwrap().world.as_mut().ok_or(f::Error::HostFailure)?.carrier=Some(handle(carrier));self.owned.ship_mut(craft)?.wing=Some(wing.into());self.owned.ship_mut(carrier)?.deployed.push(craft);Ok(())}
    fn deployed_remove(&mut self,carrier:Identity,craft:Identity)->Result<(),f::Error>{find(self.bodies,craft)?;self.owned.ship_mut(carrier)?.deployed.retain(|h|*h!=craft);Ok(())}
    fn clear_input(&mut self,craft:Identity)->Result<(),f::Error>{let row=find(self.bodies,craft)?;let b=&mut self.bodies[row];b.motion[7..11].fill(0.0);b.ship.as_mut().and_then(|s|s.combat.as_mut()).and_then(|c|c.query.as_mut()).ok_or(f::Error::HostFailure)?.trigger=false;self.services.clear_held(self.bodies,craft)}
    fn commands(&mut self,craft:Identity,cmd:f::Commands)->Result<(),f::Error>{if !finite(&[cmd.controls.turn,cmd.controls.throttle,cmd.controls.strafe,cmd.aim.x,cmd.aim.y]){return Err(f::Error::InvalidNumber);}if let Some(t)=cmd.target{find(self.bodies,t)?;}let row=find(self.bodies,craft)?;let b=&mut self.bodies[row];b.motion[7]=cmd.controls.turn;b.motion[8]=cmd.controls.brake as u32 as f64;b.motion[9]=cmd.controls.throttle;b.motion[10]=cmd.controls.strafe;let s=b.ship.as_mut().ok_or(f::Error::HostFailure)?;
        s.weapons.as_mut().ok_or(f::Error::HostFailure)?.data[3]=(!cmd.ai)as u32 as f64;let c=s.combat.as_mut().ok_or(f::Error::HostFailure)?;c.attrs[19]=cmd.ai as u32 as f64;let q=c.query.as_mut().ok_or(f::Error::HostFailure)?;q.trigger=cmd.firing;q.hold=cmd.hold;q.aim=point(cmd.aim);q.target=cmd.target.map(handle);let aim=q.aim;s.world.as_mut().ok_or(f::Error::HostFailure)?.aim=aim;s.shield.as_mut().ok_or(f::Error::HostFailure)?.data[31..33].copy_from_slice(&aim);Ok(())}
    fn pose(&mut self,craft:Identity,pos:f::Vec2,previous:f::Vec2,velocity:f::Vec2,docked:bool)->Result<(),f::Error>{if !finite(&[pos.x,pos.y,previous.x,previous.y,velocity.x,velocity.y]){return Err(f::Error::InvalidNumber);}let row=find(self.bodies,craft)?;let b=&mut self.bodies[row];b.motion[..4].copy_from_slice(&[pos.x,pos.y,velocity.x,velocity.y]);let s=b.ship.as_mut().ok_or(f::Error::HostFailure)?;s.flags=(s.flags&!ship_state::DOCKED)|if docked{ship_state::DOCKED}else{0};s.world.as_mut().ok_or(f::Error::HostFailure)?.previous=point(previous);Ok(())}
    fn remove_craft(&mut self,craft:Identity,reason:f::Removal)->Result<(),f::Error>{let row=find(self.bodies,craft)?;let s=self.bodies[row].ship.as_mut().ok_or(f::Error::HostFailure)?;match reason{f::Removal::Recovered=>s.flags|=ship_state::DOCKED,f::Removal::Detached=>{self.owned.ship_mut(craft)?.wing=None;if !self.owned.detached.contains(&craft){self.owned.detached.push(craft);}},f::Removal::ReserveFinished=>{},
        f::Removal::CarrierRetreated=>s.flags|=ship_state::RETREATED,f::Removal::CarrierDestroyed=>{s.flags|=ship_state::DEAD;s.armor.as_mut().ok_or(f::Error::HostFailure)?.data[14]=0.0;}}
        if reason!=f::Removal::Detached&&!self.owned.retired.contains(&craft){self.owned.retired.push(craft);}self.services.removed(self.bodies,self.owned,craft,reason)?;self.records.push(Record::Removed{craft,reason});Ok(())}
    fn heal(&mut self,craft:Identity,amount:f64)->Result<(),f::Error>{if !amount.is_finite()||amount<0.0{return Err(f::Error::InvalidNumber);}let row=find(self.bodies,craft)?;let a=self.bodies[row].ship.as_mut().and_then(|s|s.armor.as_mut()).ok_or(f::Error::HostFailure)?;a.data[14]=(a.data[14]+amount).min(a.data[13]);Ok(())}
    fn rearm(&mut self,craft:Identity,mount:u32,generation:u32,ammo:f64)->Result<(),f::Error>{if !ammo.is_finite()||ammo<0.0{return Err(f::Error::InvalidNumber);}let(row,slot,_)=self.mount(craft,mount,generation)?;let m=&mut self.bodies[row].ship.as_mut().unwrap().weapons.as_mut().unwrap().mounts[slot];m.data[17]=ammo;m.data[18]=0.0;Ok(())}
    fn set_shield(&mut self,craft:Identity,active:bool)->Result<(),f::Error>{let row=find(self.bodies,craft)?;let s=self.bodies[row].ship.as_mut().unwrap();s.shield.as_mut().ok_or(f::Error::HostFailure)?.set_active(active,&mut s.flux);s.sync_shield();Ok(())}
    fn recall_allowed(&self,carrier:Identity)->Result<bool,f::Error>{for h in self.assembly(carrier)?{let b=self.body(h)?;let m=self.owned.ship(h)?;if !b.dead&&!b.retreated&&!b.docked&&b.hp>0.0&&m.bays>0&&(!m.wings.is_empty()||!m.deployed.is_empty()){return Ok(true);}}Ok(false)}
    fn set_recall(&mut self,carrier:Identity,recall:bool)->Result<(),f::Error>{let root=self.owned.root(self.bodies,carrier)?;for h in self.assembly(root)?{self.owned.ship_mut(h)?.recall=recall;}Ok(())}
    fn disable_autofire(&mut self,craft:Identity)->Result<(),f::Error>{let row=find(self.bodies,craft)?;let s=self.bodies[row].ship.as_mut().unwrap();let w=s.weapons.as_mut().ok_or(f::Error::HostFailure)?;for g in &mut w.groups{g.data[2]=0.0;}w.data[3]=1.0;s.combat.as_mut().ok_or(f::Error::HostFailure)?.attrs[19]=0.0;Ok(())}
    fn mounts(&self,craft:Identity)->Result<Vec<f::Mount>,f::Error>{let row=find(self.bodies,craft)?;let s=self.bodies[row].ship.as_ref().unwrap();let c=s.combat.as_ref().ok_or(f::Error::HostFailure)?;let w=s.weapons.as_ref().ok_or(f::Error::HostFailure)?;let live=system_owner::modifiers(self.bodies,row,self.specs).map_err(|_|f::Error::HostFailure)?;
        w.mounts.iter().enumerate().map(|(i,m)|{let e=c.fire.get(i).ok_or(f::Error::HostFailure)?;let q=e.query.as_ref().ok_or(f::Error::HostFailure)?;let meta=self.owned.ship(craft)?.mounts.iter().find(|x|x.component==m.data[0]as u32).ok_or(f::Error::HostFailure)?;
            Ok(f::Mount{handle:m.data[0]as u32,generation:meta.generation,system_only:meta.system_only,pd:q.flags&fc::weapon_flag::PD!=0,strike:q.hints&fc::hint::STRIKE!=0,missile:m.data[1]==3.0,guided:q.flags&fc::weapon_flag::GUIDED!=0,disabled:s.components.get(i).ok_or(f::Error::HostFailure)?.data[7]==1.0,permanent:s.components[i].data[8]==1.0,ammo:m.data[17],max_ammo:if meta.max_ammo_present{Some(m.data[10])}else{None},ammo_regen:if meta.regen_present{Some(m.data[11])}else{None},burst:m.data[20],charging:m.data[23]==1.0,range:battle::weapon_geometry(e,m.data[1]as usize,&live,c.attrs[18]).0,firing_cycle:m.data[26]})}).collect()}
    fn projectiles(&self)->Result<Vec<f::Projectile>,f::Error>{self.ordnance.projectiles.iter().filter(|p|p.delivery.guidance.as_ref().is_some_and(|g|g.rocket||g.flare.is_some())).map(|p|{if p.serial<=0.0||p.serial>u32::MAX as f64||p.serial.fract()!=0.0{return Err(f::Error::InvalidIdentity);}Ok(f::Projectile{identity:Identity{handle:p.serial as u32,generation:1},team:p.team as f64,rocket:p.delivery.guidance.as_ref().is_some_and(|g|g.rocket),disarmed:p.disarmed,flare:p.guidance.as_ref().is_some_and(|g|g.flare),decoy:p.fighter_decoy,collision_disabled:p.collision_disabled,did_damage:p.did_damage,range_remaining:p.range,hitpoints:p.guidance.as_ref().and_then(|g|g.hitpoints),fizzling:p.guidance.as_ref().is_some_and(|g|g.flare_fizzling)||p.fizzle.is_some(),armed_while_fizzling:p.armed==Some(true),pos:vec(p.pos),vel:vec(p.velocity),radius:p.delivery.radius})}).collect()}
    fn order(&self,craft:Option<Identity>)->Result<Option<f::Order>,f::Error>{if let Some(h)=craft{find(self.bodies,h)?;Ok(self.owned.orders.iter().find(|(id,_)|*id==h).map(|(_,o)|o.clone()))}else{Ok(self.owned.fleet_order.clone())}}
    fn cancel_order(&mut self,craft:Identity)->Result<(),f::Error>{find(self.bodies,craft)?;self.owned.orders.retain(|(h,_)|*h!=craft);Ok(())}
    fn hostile(&self,craft:Identity,ordered:Option<Identity>)->Result<Option<Identity>,f::Error>{let own=self.body(craft)?;let mut eligible=Vec::new();for b in self.bodies.iter(){let h=id(b.handle);if self.owned.retired.contains(&h){continue;}let other=self.body(h)?;let q=self.query(h)?;if !q.vast&&!other.dead&&!other.retreated&&other.team!=own.team&&self.visible(h,own.team)?{eligible.push(other);}}
        if let Some(h)=ordered{if eligible.iter().any(|b|b.identity==h){return Ok(Some(h));}}if let Some(h)=own.current_target{if eligible.iter().any(|b|b.identity==h){return Ok(Some(h));}}
        let main=eligible.iter().any(|b|self.bodies[find(self.bodies,b.identity).unwrap()].ship.as_ref().unwrap().combat.as_ref().unwrap().size!=0);let mut best=None;let mut distance=f64::INFINITY;for b in eligible{if main&&self.bodies[find(self.bodies,b.identity)?].ship.as_ref().unwrap().combat.as_ref().unwrap().size==0{continue;}let d=own.pos.sub(b.pos).len();if best.is_none()||d<distance{best=Some(b.identity);distance=d;}}Ok(best)}
    fn visible(&self,target:Identity,team:f64)->Result<bool,f::Error>{if !team.is_finite()||team<0.0||team.fract()!=0.0{return Err(f::Error::InvalidNumber);}let b=&self.bodies[find(self.bodies,target)?];if b.ship.as_ref().unwrap().combat.as_ref().unwrap().team as f64==team{return Ok(true);}self.query(target)?.visible.get(&(team as u32)).copied().ok_or(f::Error::HostFailure)}
    fn aim(&self,craft:Identity,mount:u32,generation:u32,target:f::Target)->Result<f::Aim,f::Error>{let(row,slot,meta)=self.mount(craft,mount,generation)?;solve_aim(self.bodies,self.ordnance,self.specs,row,slot,meta,target)}
    fn target_position(&self,target:f::Target)->Result<f::Vec2,f::Error>{match target{f::Target::Ship(h)=>Ok(self.body(h)?.pos),f::Target::Missile(h)=>self.ordnance.projectiles.iter().find(|p|h.generation==1&&p.serial==h.handle as f64).map(|p|vec(p.pos)).ok_or(f::Error::StaleIdentity)}}
    fn shield_covers(&self,craft:Identity,target:Identity)->Result<bool,f::Error>{let root=self.owned.root(self.bodies,target)?;let s=self.bodies[find(self.bodies,root)?].ship.as_ref().unwrap();if s.shield.as_ref().and_then(|s|s.void.as_ref()).is_some_and(|v|v.data[9]==1.0&&v.data[10]==0.0&&v.data[5]>0.0){return Ok(true);}
        let b=&self.bodies[find(self.bodies,target)?];let s=b.ship.as_ref().unwrap();let Some(sh)=s.shield.as_ref().filter(|sh|sh.active()&&sh.kind()!=0&&sh.kind()!=3&&sh.data[7]>0.0&&!s.flux.venting&&!s.flux.overloaded)else{return Ok(false);};let c=contact::shield_center(sh,&b.motion);let own=self.body(craft)?.pos;let d=[own.x-c[0],own.y-c[1]];let k=sh.data[2]/contact::length(d).max(0.001);Ok(blocked(sh,&b.motion,[c[0]+d[0]*k,c[1]+d[1]*k]))}
    fn fire_roster(&self)->Result<Vec<Identity>,f::Error>{self.bodies.iter().filter(|b|!self.owned.retired.contains(&id(b.handle))&&b.ship.as_ref().is_some_and(|s|s.flags&ship_state::RETREATED==0)).map(|b|Ok(id(b.handle))).collect()}
    fn enqueue_ship_step(&mut self,craft:Identity,dt:f64,target:Option<Identity>,permission:f::FirePermission)->Result<(),f::Error>{find(self.bodies,craft)?;if !dt.is_finite()||dt<0.0{return Err(f::Error::InvalidNumber);}if let Some(h)=target{find(self.bodies,h)?;}if let f::FirePermission::Gloriana{ships,missile}=&permission{for &h in ships{find(self.bodies,h)?;}if let Some(h)=missile{self.target_position(f::Target::Missile(*h))?;}}
        self.services.enqueue(Step{craft,dt,target,permission})}
    fn destruction_enabled(&self)->bool{self.services.destruction_enabled()}
    fn destroy(&mut self,craft:Identity)->Result<(),f::Error>{find(self.bodies,craft)?;self.services.destroy(self.bodies,self.ordnance,self.owned,craft,self.random,self.visual)}
    fn finish_visuals(&mut self,craft:Identity,bomber:bool)->Result<(),f::Error>{let b=self.body(craft)?;if matches!(b.role,f::CraftRole::ArkInterceptor|f::CraftRole::ArkStriker)||b.controls.throttle.abs()<=0.1{return Ok(());}if self.visual.next()>=if bomber{0.65}else{0.6}{return Ok(());}for slot in self.owned.ship(craft)?.engine_slots.clone(){let nozzle=contact::rotate(slot,b.facing);let angle=b.facing+PI+(self.visual.next()-0.5)*if bomber{0.2}else{0.3};let speed=if bomber{35.0}else{30.0};let life=if bomber{0.35}else{0.3}+self.visual.next()*0.2;let size=if bomber{5.0}else{4.0}+self.visual.next()*3.0;let max_size=if bomber{15.0}else{12.0}+self.visual.next()*5.0;let rotation=self.visual.next()*PI*2.0;
            self.records.push(Record::Contrail(Contrail{craft,pos:[b.pos.x+nozzle[0],b.pos.y+nozzle[1]],vel:[angle.cos()*speed+b.vel.x*0.4,angle.sin()*speed+b.vel.y*0.4],life,max_life:if bomber{0.55}else{0.5},size,max_size,alpha:if bomber{0.5}else{0.45},rotation,color:if bomber{[100,180,255]}else{[255,125,25]}}));}Ok(())}
    fn event(&mut self,craft:Identity,event:f::FlightEvent)->Result<(),f::Error>{find(self.bodies,craft)?;self.records.push(Record::Event{craft,event});Ok(())}
}

fn blocked(sh:&shield::Shield,pose:&[f64;motion::WIDTH],p:V)->bool{if !sh.active()||sh.data[7]<=5.0||sh.kind()==shield::NONE||sh.kind()==shield::PHASE{return false;}let c=contact::shield_center(sh,pose);let angle=(p[1]-c[1]).atan2(p[0]-c[0]);let facing=if sh.kind()==1{pose[4]}else{sh.data[8]};let mut d=angle-facing;while d>PI{d-=PI*2.0;}while d< -PI{d+=PI*2.0;}d.abs()<=sh.data[7]*PI/360.0}
fn segment(b:&Body,a:V,z:V)->Result<Option<f64>,f::Error>{let s=b.ship.as_ref().ok_or(f::Error::HostFailure)?;let c=s.combat.as_ref().ok_or(f::Error::HostFailure)?;
    let mut hit=if c.bounds.len()>=3{let p=contact::local(a,&b.motion);if contact::contains(p,&c.bounds){Some(0.0)}else{contact::polygon(p,contact::local(z,&b.motion),&c.bounds).map(|(t,_)|t)}}else{fc::circle(a[0],a[1],z[0],z[1],b.motion[0],b.motion[1],c.radius)};
    if let Some(sh)=s.shield.as_ref().filter(|sh|sh.active()&&sh.data[7]>0.0&&sh.kind()!=0&&sh.kind()!=3){let center=contact::shield_center(sh,&b.motion);if let Some(t)=fc::circle(a[0],a[1],z[0],z[1],center[0],center[1],sh.data[2]){if blocked(sh,&b.motion,contact::lerp(a,z,t)){hit=Some(hit.map_or(t,|prior|prior.min(t)));}}}Ok(hit)}
/// Pure current-source FlightTactics aim. It deliberately omits the optional
/// prepared-query conservative bound, exactly as the legacy TS flight caller.
pub fn solve_aim(bodies:&[Body],ordnance:&Ordnance,specs:&BTreeMap<u32,Spec>,row:usize,slot:usize,meta:&MountMeta,target:f::Target)->Result<f::Aim,f::Error>{
    let own=bodies.get(row).ok_or(f::Error::StaleIdentity)?;let s=own.ship.as_ref().ok_or(f::Error::HostFailure)?;let c=s.combat.as_ref().ok_or(f::Error::HostFailure)?;let m=s.weapons.as_ref().and_then(|w|w.mounts.get(slot)).ok_or(f::Error::StaleIdentity)?;let e=c.fire.get(slot).ok_or(f::Error::HostFailure)?;let q=e.query.as_ref().ok_or(f::Error::HostFailure)?;let delivery=e.delivery.as_ref().ok_or(f::Error::HostFailure)?;let guided=q.flags&fc::weapon_flag::GUIDED!=0;let beam=m.data[2]==1.0;
    let live=system_owner::modifiers(bodies,row,specs).map_err(|_|f::Error::HostFailure)?;let(range,speed)=battle::weapon_geometry(e,m.data[1]as usize,&live,c.attrs[18]);let speed=if guided{meta.guided_speed.unwrap_or(speed)}else{speed};
    let pivot=contact::rotate(e.spec.relative_pos,own.motion[4]);let offset=if e.spec.offsets.is_empty(){[0.0;2]}else{e.spec.offsets[(m.data[30]%e.spec.offsets.len()as f64)as usize]};let offset=contact::rotate(offset,m.data[15]);let origin=[own.motion[0]+pivot[0]+offset[0],own.motion[1]+pivot[1]+offset[1]];
    let delay=if m.data[23]==1.0{m.data[24].max(0.0)}else if m.data[23]==0.0&&m.data[20]<=0.0{if beam{e.spec.beam_chargeup}else{m.data[5]}}else{0.0};
    let(x,y,vx,vy,radius,life,ship)=match target{f::Target::Ship(h)=>{let b=&bodies[find(bodies,h)?];let s=b.ship.as_ref().ok_or(f::Error::HostFailure)?;let c=s.combat.as_ref().ok_or(f::Error::HostFailure)?;let radius=if let Some(sh)=s.shield.as_ref().filter(|sh|sh.active()&&sh.kind()!=0&&sh.kind()!=3){let center=contact::shield_center(sh,&b.motion);c.radius.max(sh.data[2]+contact::length([center[0]-b.motion[0],center[1]-b.motion[1]]))}else{c.radius};(b.motion[0],b.motion[1],b.motion[2]-own.motion[2],b.motion[3]-own.motion[3],radius,None,Some(b))},
        f::Target::Missile(h)=>{let p=ordnance.projectiles.iter().find(|p|h.generation==1&&p.serial==h.handle as f64).ok_or(f::Error::StaleIdentity)?;(p.pos[0],p.pos[1],p.velocity[0]-own.motion[2],p.velocity[1]-own.motion[3],p.delivery.radius,p.flight,None)}};
    let px=x-origin[0]+vx*delay;let py=y-origin[1]+vy*delay;let Some(time)= (if beam{Some(0.0)}else{fc::intercept_time(px,py,vx,vy,speed)})else{return Ok(f::Aim::default());};let predicted=[origin[0]+px+vx*time,origin[1]+py+vy*time];if !finite(&predicted){return Ok(f::Aim::default());}
    let mut out=f::Aim{predicted:Some(vec(predicted)),solved:None};let d=[predicted[0]-origin[0],predicted[1]-origin[1]];let distance=crate::gravity_world::hypot(d);if distance>range+radius{return Ok(out);}let base=own.motion[4]+q.base*PI/180.0;let half=(radius/distance.max(1.0)).min(1.0).asin();let angle=d[1].atan2(d[0]);let free=guided&&(q.flags&fc::weapon_flag::ALWAYS_FIRE!=0||q.hints&(fc::hint::DO_NOT_AIM|fc::hint::GUIDED_POOR)!=0);
    if !free&&q.arc<360.0&&fc::signed_angle(angle-base).abs()>q.arc*PI/360.0+half{return Ok(out);}if !guided{let horizon=if beam{0.0}else{range/speed.max(1e-6)};let start=[origin[0]+-vx*delay,origin[1]+-vy*delay];let end=[start[0]+angle.cos()*range+-vx*horizon,start[1]+angle.sin()*range+-vy*horizon];let contact=if let Some(b)=ship{segment(b,start,end)?}else{fc::circle(start[0],start[1],end[0],end[1],x,y,radius+delivery.radius+q.proximity.unwrap_or(0.0))};let Some(t)=contact else{return Ok(out);};if life.is_some_and(|life|delay+horizon*t>life){return Ok(out);}}
    out.solved=out.predicted;Ok(out)
}
