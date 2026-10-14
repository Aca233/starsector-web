//! CapitalShipAI over the real resident Body/ShipState/Ordnance authorities.
//! Plan and source contracts: docs/rust-combat-ai-resident-plan-2026-10-08.md.
//! One phase scratch lease, refreshed after actual resource/system writes.
use crate::{ai_owner as a, battle::{self,Ordnance}, contact, defense_ai as d,
    fire_control as f, fire_query, gravity_owner as go, gravity_world as g,
    lifecycle::{self,Spec}, navigation_ai as n, random::Random,
    ship_effects as e, ship_state::{self,Notice,ShipState}, state::{Body,Handle},
    system_owner as so, system_world as sw, tactical_ai as t, terrain_owner};
use std::{collections::BTreeMap,f64::consts::PI};
pub type Error=a::Error;
pub type Identity=t::Identity;
/// AI identities reserve zero for absent targets; Core slots start at zero.
/// This is only an internal key codec. Publication/commands retain the Core Handle.
pub fn identity(h:Handle)->Result<Identity,Error>{if h.generation==0{return Err(Error::InvalidIdentity);}Ok(Identity{handle:h.slot.checked_add(1).ok_or(Error::InvalidIdentity)?,generation:h.generation})}
pub fn core_handle(h:Identity)->Result<Handle,Error>{if h.generation==0{return Err(Error::InvalidIdentity);}Ok(Handle{slot:h.handle.checked_sub(1).ok_or(Error::InvalidIdentity)?,generation:h.generation})}
fn id(h:Handle)->Identity{identity(h).expect("admitted Core handle")}
fn handle(h:Identity)->Handle{core_handle(h).expect("admitted AI identity")}
fn wi(h:Identity)->sw::Identity{let h=handle(h);sw::Identity{slot:h.slot,generation:h.generation}}
fn di(h:Identity)->d::Identity{d::Identity{handle:h.handle,generation:h.generation}}
fn ni(h:Identity)->n::Identity{n::Identity{handle:h.handle,generation:h.generation}}
fn fi(h:Identity)->f::Identity{let h=handle(h);f::Identity{handle:h.slot,generation:h.generation}}
fn row(b:&[Body],h:Identity)->Result<usize,Error>{b.iter().position(|b|id(b.handle)==h).ok_or(Error::StaleIdentity)}
fn host_error(_:u32)->Error{Error::HostFailure}
fn live(s:&ShipState)->bool{s.can_advance()&&s.flags&(ship_state::DOCKED|ship_state::RETREATED)==0}
fn sub(x:[f64;2],y:[f64;2])->[f64;2]{[x[0]-y[0],x[1]-y[1]]}
fn add(x:[f64;2],y:[f64;2])->[f64;2]{[x[0]+y[0],x[1]+y[1]]}
fn scale(x:[f64;2],k:f64)->[f64;2]{[x[0]*k,x[1]*k]}
fn normalize(x:[f64;2])->[f64;2]{let l=n::length(x[0],x[1]);if l>0.00001{[x[0]/l,x[1]/l]}else{x}}
fn same_words<const N:usize>(a:&[f64;N],b:&[f64;N])->bool{a.iter().zip(b).all(|(a,b)|a.to_bits()==b.to_bits())}
#[derive(Clone,Copy,Debug,PartialEq,Eq)]pub enum RoleCertificate{None,PointDefense,Axial}
#[derive(Clone)]pub struct MountMeta{
    pub component:u32,pub locale_rank:u32,pub dps:f64,pub authored_max_speed:f64,
    pub position_turn_rate:f64,pub forecast_turn_rate:f64,pub fixed:bool,
    pub beam_duration:Option<f64>,pub role:RoleCertificate,pub original_point_defense:bool,pub stage_flags:u32,pub stage_hints:u32,
}
#[derive(Clone)]pub struct SystemMeta{pub id:u32,pub ai:a::SystemAI,pub defense:bool,pub active_speed_flat:f64}
#[derive(Clone)]pub struct Wing{pub count:f64,pub range:Option<f64>}
#[derive(Clone)]pub struct Actor{
    pub identity:Identity,pub stable_id:String,pub locale_rank:u32,pub spec_speed:f64,pub spec_armor:f64,pub spec_hp:f64,
    pub attachment:a::Attachment,pub attached_motion:bool,pub tactical_present:bool,pub native_forecast:bool,
    pub do_not_back_off:f64,pub system_drone:bool,pub prevents_ai_venting:bool,pub training_action:i32,pub system_mode:Option<String>,
    pub fighter_bays:usize,pub wings:Vec<Wing>,pub wing_range_multiplier:f64,
    pub mounts:Vec<MountMeta>,pub systems:Vec<SystemMeta>,pub order:Option<a::Order>,
    pub memory:Option<a::OwnedAI>,pub diagnostics:Option<a::Diagnostics>,pub defense_facing:Option<f64>,
}
impl Actor{
    pub fn initialize_memory(&mut self,target:Option<Identity>)->Result<(),Error>{
        if self.memory.is_some(){return Err(Error::WrongStage);}self.memory=Some(a::OwnedAI::new(self.identity,&self.stable_id,target)?);Ok(())
    }
}
#[derive(Clone,Default)]pub struct Owned{pub actors:Vec<Actor>,pub assignments:Vec<t::Assignment>,pub policy:t::Policy,pub admission:Option<crate::ai_wire::Admission>}
impl Owned{
    pub fn actor(&self,h:Identity)->Result<&Actor,Error>{self.actors.iter().find(|m|m.identity==h).ok_or(Error::StaleIdentity)}
    pub fn actor_mut(&mut self,h:Identity)->Result<&mut Actor,Error>{self.actors.iter_mut().find(|m|m.identity==h).ok_or(Error::StaleIdentity)}
    pub fn validate(&self,bodies:&[Body],specs:&BTreeMap<u32,Spec>)->Result<(),Error>{
        if self.admission.is_some(){return Err(Error::WrongStage);}
        self.policy.validate()?;
        for b in bodies{identity(b.handle)?;}
        for(i,m)in self.actors.iter().enumerate(){
            if m.identity.handle==0||m.identity.generation==0||m.stable_id.is_empty()||self.actors[..i].iter().any(|p|p.identity.handle==m.identity.handle||p.stable_id==m.stable_id){return Err(Error::InvalidIdentity);}
            if ![m.spec_speed,m.spec_armor,m.spec_hp,m.do_not_back_off,m.wing_range_multiplier].iter().all(|n|n.is_finite())
                ||m.wings.iter().any(|w|!w.count.is_finite()||w.count<0.0||w.range.is_some_and(|r|!r.is_finite())){return Err(Error::InvalidNumber);}
            let b=&bodies[row(bodies,m.identity)?];let s=b.ship.as_ref().ok_or(Error::InvalidTopology)?;
            let c=s.combat.as_ref().ok_or(Error::InvalidTopology)?;let q=c.query.as_ref().ok_or(Error::InvalidTopology)?;
            if !q.complete()||s.armor.is_none()||s.engines.is_none()||m.mounts.len()!=c.fire.len()||m.systems.len()!=s.systems.len(){return Err(Error::InvalidTopology);}
            if m.attachment.parent!=s.world.as_ref().and_then(|w|w.parent).map(id){return Err(Error::InvalidTopology);}
            let mounts=s.weapons.as_ref().ok_or(Error::InvalidTopology)?;
            for(j,meta)in m.mounts.iter().enumerate(){
                if meta.component as f64!=mounts.mounts[j].data[0]||![meta.dps,meta.authored_max_speed,meta.position_turn_rate,meta.forecast_turn_rate].iter().all(|n|n.is_finite())
                    ||meta.beam_duration.is_some_and(|n|!n.is_finite())||c.fire[j].query.is_none(){return Err(Error::InvalidTopology);}
            }
            if m.systems.iter().filter(|x|x.defense).count()!=1||m.systems.last().is_none_or(|x|!x.defense){return Err(Error::InvalidTopology);}
            for(j,meta)in m.systems.iter().enumerate(){
                if meta.id!=s.systems[j].id||meta.defense!=s.systems[j].defense||!specs.contains_key(&s.systems[j].spec)||!meta.active_speed_flat.is_finite(){return Err(Error::InvalidTopology);}
                if meta.ai==a::SystemAI::Unknown||matches!(meta.ai,a::SystemAI::Special(a::SpecialAI::NativeTargeted|a::SpecialAI::NativeMineStrike|a::SpecialAI::NativeOther)){return Err(Error::UnsupportedSystem);}
            }
        }
        if bodies.iter().any(|b|self.actor(id(b.handle)).is_err()){return Err(Error::InvalidTopology);}Ok(())
    }
}
/// Explicit engine AI phase membership and cadence, retaining source roster order.
#[derive(Clone,Copy)]pub struct Entry{pub owner:Identity,pub dt:f64,pub sample_decision:bool,pub settings:a::Settings}
/// Root authority supplies its real playerTargetId; firing/aim and module
/// topology are captured from the same resident bodies before AI controls.
#[derive(Clone,Copy)]pub struct Manual{pub owner:Identity,pub player_target:Option<Handle>}
pub struct Resident<'a>{
    pub bodies:&'a mut[Body],pub ordnance:&'a mut Ordnance,pub specs:&'a BTreeMap<u32,Spec>,
    pub world:&'a mut crate::world_owner::Owned,
    pub random:&'a mut Random,pub visual:&'a mut Random,pub events:&'a mut Vec<(u32,Handle,Notice)>,
}
#[derive(Default)]pub struct Scratch{pub owner:a::Scratch,pub fleet:t::FleetScratch}
impl Owned{
    /// Caller wraps this with the complete battle transaction, including both RNGs.
    /// All plans see one read barrier; all controls precede every effect callback.
    pub fn phase(&mut self,r:&mut Resident<'_>,entries:&[Entry],fleet:bool,scratch:&mut Scratch)->Result<(),Error>{
        let active:Vec<_>=r.bodies.iter().map(|b|b.handle).collect();self.phase_active(r,entries,&active,fleet,scratch)
    }
    /// The production caller supplies actual CombatEngine.ships order. Reserve
    /// metadata stays installed, without entering observation or fleet planning.
    pub fn phase_active(&mut self,r:&mut Resident<'_>,entries:&[Entry],active:&[Handle],fleet:bool,scratch:&mut Scratch)->Result<(),Error>{
        self.phase_controlled(r,entries,active,&[],fleet,scratch)
    }
    pub fn phase_controlled(&mut self,r:&mut Resident<'_>,entries:&[Entry],active:&[Handle],manual:&[Manual],fleet:bool,scratch:&mut Scratch)->Result<(),Error>{
        let excluded:Vec<_>=active.iter().copied().filter(|h|r.bodies.iter().find(|b|b.handle==*h).is_some_and(|b|b.ship.as_ref().is_some_and(|s|s.world.as_ref().is_some_and(|w|w.parent.is_none())&&s.combat.as_ref().is_some_and(|c|c.attrs[19]!=1.0)))).collect();
        self.phase_with_fleet(r,entries,active,manual,&excluded,fleet,scratch)
    }
    /// AIBatch's fleet exclusion is player-manual plus externallyControlled IDs,
    /// independent of each module's current MANUAL/AI weapon ownership.
    pub fn phase_with_fleet(&mut self,r:&mut Resident<'_>,entries:&[Entry],active:&[Handle],manual:&[Manual],fleet_manual:&[Handle],fleet:bool,scratch:&mut Scratch)->Result<(),Error>{
        self.validate(r.bodies,r.specs)?;
        for(i,h)in active.iter().enumerate(){if active[..i].contains(h){return Err(Error::InvalidIdentity);}row(r.bodies,id(*h))?;}
        for(i,h)in fleet_manual.iter().enumerate(){if fleet_manual[..i].contains(h)||!active.contains(h){return Err(Error::InvalidTopology);}}
        for(i,entry)in entries.iter().enumerate(){if !entry.dt.is_finite()||entry.dt<0.0||entries[..i].iter().any(|x|x.owner==entry.owner)||!active.contains(&handle(entry.owner)){return Err(Error::InvalidTopology);}self.actor(entry.owner)?;}
        let mut restore=Vec::new();for(i,m)in manual.iter().enumerate(){if manual[..i].iter().any(|p|p.owner==m.owner)||!entries.iter().any(|e|e.owner==m.owner){return Err(Error::InvalidTopology);}
            let physical=row(r.bodies,m.owner)?;let b=&r.bodies[physical];let s=b.ship.as_ref().ok_or(Error::InvalidTopology)?;let c=s.combat.as_ref().ok_or(Error::InvalidTopology)?;let q=c.query.as_ref().ok_or(Error::InvalidTopology)?;
            let root=r.world.terrain.root(terrain_owner::identity(b)).map_err(host_error)?;let pr=r.world.terrain.row(r.bodies,root).map_err(host_error)?;let ps=r.bodies[pr].ship.as_ref().ok_or(Error::InvalidTopology)?;
            if physical==pr||c.attrs[19]==1.0||ps.combat.as_ref().ok_or(Error::InvalidTopology)?.attrs[19]==1.0||!live(s)||!live(ps){return Err(Error::InvalidTopology);}
            let independent=r.world.terrain.meta(terrain_owner::identity(b)).map_err(host_error)?.module.as_ref().ok_or(Error::InvalidTopology)?.independent;
            if m.player_target.is_some_and(|h|!r.bodies.iter().any(|b|b.handle==h)){return Err(Error::StaleIdentity);}restore.push((*m,q.trigger,q.aim,independent));
        }
        // CombatEngine creates module/player controllers only on their first
        // actual AI call. The initial target is the engine enemy, even for an
        // enemy-owned attached module; creation consumes no random samples.
        let initial=r.bodies.iter().find(|b|terrain_owner::identity(b)==r.world.enemy).map(|b|id(b.handle)).ok_or(Error::StaleIdentity)?;
        for entry in entries{let actor=self.actor_mut(entry.owner)?;if actor.memory.is_none(){actor.initialize_memory(Some(initial))?;}}
        synchronize_live(r.bodies,r.specs)?;
        let mut cache=Cache::build(self,r.bodies,r.ordnance,r.specs,r.world,active)?;
        self.assignments.retain(|a|cache.tactical().find(a.owner).is_some()&&[a.target,a.anchor].iter().flatten().all(|h|cache.tactical().find(*h).is_some()));
        if fleet{let orders:Vec<_>=self.actors.iter().filter(|m|active.contains(&handle(m.identity))).filter_map(|m|m.order.as_ref().map(|o|t::Order{owner:Some(m.identity),kind:o.kind,target:o.target.filter(|h|cache.tactical().find(*h).is_some()),point:o.point})).collect();
            let mut bodies=cache.tactical_bodies.clone();for b in &mut bodies{b.manual=fleet_manual.contains(&handle(b.identity));}
            let observed=cache.tactical();t::fleet(&t::World{bodies:&bodies,..observed},&orders,&mut self.assignments,&mut scratch.fleet)?;}
        let mut planned=Vec::new();
        if let Some(first)=entries.first(){
        let assignments=self.assignments.clone();let policy=self.policy.clone();
        let planning=a::PlanningObservation::new(cache.observation_with(&assignments,&policy,first.settings)?)?;
        for entry in entries{
            let actor=self.actor(entry.owner)?;let mut memory=actor.memory.clone().ok_or(Error::InvalidTopology)?;let order=actor.order.clone();
            let dt=if entry.sample_decision{planning.sample(&mut memory,entry.dt,order.as_ref(),entry.settings)?}else{Some(entry.dt)};
            if let Some(dt)=dt{let intent=planning.plan(&mut memory,dt,order.as_ref(),entry.settings,&mut scratch.owner)?;planned.push((*entry,intent));}
            self.actor_mut(entry.owner)?.memory=Some(memory);
        }}
        for(entry,intent)in &planned{
            let mut memory=self.actor_mut(entry.owner)?.memory.take().ok_or(Error::WrongStage)?;
            let result={let mut host=Host::new(self,r,entry.owner,entry.settings,active,&mut cache)?;memory.commit_controls(intent,&mut host).and_then(|_|host.finish())};
            self.actor_mut(entry.owner)?.memory=Some(memory);result?;
        }
        for(entry,intent)in &mut planned{
            let mut memory=self.actor_mut(entry.owner)?.memory.take().ok_or(Error::WrongStage)?;
            let result={let mut host=Host::new(self,r,entry.owner,entry.settings,active,&mut cache)?;memory.commit_effects(intent,&mut host,&mut scratch.owner).and_then(|_|host.finish())};
            self.actor_mut(entry.owner)?.memory=Some(memory);result?;
            if let Some((manual,trigger,aim,independent))=restore.iter().find(|(m,_,_,_)|m.owner==entry.owner){
                let physical=row(r.bodies,manual.owner)?;let observer=r.bodies[physical].ship.as_ref().ok_or(Error::InvalidTopology)?.combat.as_ref().ok_or(Error::InvalidTopology)?.team;
                let target=manual.player_target.filter(|h|active.contains(h)).filter(|h|r.bodies.iter().find(|b|b.handle==*h).is_some_and(|b|b.ship.as_ref().is_some_and(|s|live(s)&&s.combat.as_ref().is_some_and(|c|c.team!=observer&&c.query.as_ref().is_some_and(|q|!q.vast&&q.visible.get(&observer)==Some(&true))))));
                let mods=so::modifiers(r.bodies,physical,r.specs).map_err(host_error)?;let mut pose=r.bodies[physical].motion;
                if *independent{crate::motion_owner::stats(Some(r.world),r.bodies,physical,&mut pose,&mods).map_err(host_error)?;}
                let b=&mut r.bodies[physical];let s=b.ship.as_mut().ok_or(Error::InvalidTopology)?;let c=s.combat.as_mut().ok_or(Error::InvalidTopology)?;c.attrs[19]=0.0;
                s.weapons.as_mut().ok_or(Error::InvalidTopology)?.data[3]=1.0;
                let q=c.query.as_mut().ok_or(Error::InvalidTopology)?;q.trigger=*trigger;q.aim=*aim;q.target=target;q.hold=false;if let Some(w)=&mut s.world{w.aim=*aim;}if let Some(sh)=&mut s.shield{sh.data[31..33].copy_from_slice(aim);}
                if *independent{
                    b.motion[7]=if s.control_flags()&4!=0||s.flux.overloaded{0.0}else{n::cursor_turn_command(b.motion[4],b.motion[5],(aim[1]-b.motion[1]).atan2(aim[0]-b.motion[0]),pose[15]*0.5)};}
                cache.controls(self,r.bodies,manual.owner)?;
            }
        }Ok(())
    }
}
fn synchronize_live(bodies:&mut[Body],specs:&BTreeMap<u32,Spec>)->Result<(),Error>{
    let mods=bodies.iter().enumerate().map(|(i,_)|so::modifiers(bodies,i,specs).map_err(host_error)).collect::<Result<Vec<_>,_>>()?;
    for(b,m)in bodies.iter_mut().zip(mods){b.ship.as_mut().ok_or(Error::InvalidTopology)?.live=m;}Ok(())
}
#[derive(Default)]struct Cache{
    handles:Vec<Handle>,
    tactical_bodies:Vec<t::Body>,tactical_weapons:Vec<t::Weapon>,asteroids:Vec<t::Asteroid>,
    navigation_bodies:Vec<n::Body>,navigation_weapons:Vec<n::Weapon>,obstacles:Vec<n::Obstacle>,
    defense_bodies:Vec<d::Body>,defense_weapons:Vec<d::Weapon>,projectiles:Vec<d::Projectile>,beams:Vec<d::Beam>,
    fire_bodies:Vec<f::Body>,fire_weapons:Vec<f::Weapon>,fire_projectiles:Vec<f::Projectile>,fire_asteroids:Vec<f::Asteroid>,
    teams:Vec<f64>,visibility:Vec<u8>,ai:Vec<a::AIInput>,starts:Vec<usize>,missile_scope:Vec<u8>,scope:Vec<u8>,budget_rows:Vec<Vec<usize>>,
}
impl Cache{
    fn index(&self,h:Handle)->Result<usize,Error>{self.handles.iter().position(|x|*x==h).ok_or(Error::StaleIdentity)}
    /// These writes cannot change pose, life, ordnance, geometry or modifiers.
    /// Read the committed owner, retaining precisely the same target filtering.
    fn controls(&mut self,o:&Owned,bodies:&[Body],owner:Identity)->Result<(),Error>{
        let r=self.index(handle(owner))?;let s=bodies[row(bodies,owner)?].ship.as_ref().ok_or(Error::InvalidTopology)?;
        let c=s.combat.as_ref().ok_or(Error::InvalidTopology)?;let q=c.query.as_ref().ok_or(Error::InvalidTopology)?;
        let target=q.target.filter(|h|self.handles.contains(h));let manual=c.attrs[19]!=1.0;
        let fire=&mut self.fire_bodies[r];fire.current_target=target.map(|h|fi(id(h)));fire.autonomous=!manual;fire.main_trigger=q.trigger;fire.aim_x=q.aim[0];fire.aim_y=q.aim[1];
        fire.flags=(fire.flags&!f::body_flag::HOLD_FIRE)|if q.hold{f::body_flag::HOLD_FIRE}else{0};
        let flags=(self.tactical_bodies[r].flags&!(t::body_flag::MANUAL|f::body_flag::HOLD_FIRE))
            |if manual{t::body_flag::MANUAL}else{0}|if q.hold{f::body_flag::HOLD_FIRE}else{0};
        let body=&mut self.tactical_bodies[r];body.flags=flags;body.manual=manual;body.current_target=target.map(id);
        body.previous_task=o.actor(owner)?.diagnostics.as_ref().and_then(|d|d.task);
        self.navigation_bodies[r].flags=flags;self.defense_bodies[r].flags=flags;
        self.ai[r].aim=q.aim;self.ai[r].tactical_present=o.actor(owner)?.tactical_present;Ok(())
    }
    fn tactical(&self)->t::World<'_>{t::World{bodies:&self.tactical_bodies,weapons:&self.tactical_weapons,asteroids:&self.asteroids,teams:&self.teams,visibility:&self.visibility}}
    fn observation<'a>(&'a self,o:&'a Owned,settings:a::Settings)->Result<a::Observation<'a>,Error>{self.observation_with(&o.assignments,&o.policy,settings)}
    fn observation_with<'a>(&'a self,assignments:&'a[t::Assignment],policy:&'a t::Policy,settings:a::Settings)->Result<a::Observation<'a>,Error>{Ok(a::Observation{
        tactical:self.tactical(),navigation:n::World::new(&self.navigation_bodies,&self.navigation_weapons,&self.obstacles)?,
        defense:d::World{bodies:&self.defense_bodies,weapons:&self.defense_weapons,projectiles:&self.projectiles,beams:&self.beams,teams:&self.teams,visibility:&self.visibility},
        ai:&self.ai,assignments,policy,settings})}
    fn fire(&self)->f::World<'_>{f::World{bodies:&self.fire_bodies,weapons:&self.fire_weapons,projectiles:&self.fire_projectiles,asteroids:&self.fire_asteroids,
        teams:&self.teams,visibility:&self.visibility,scope:&self.scope,missile_scope:&self.missile_scope,budget_scope:&self.scope,budget_rows:&self.budget_rows,
        budget_present:false,native_budget:true,budget_complete:true,adaptive_budget:false}}
    fn build(o:&Owned,bodies:&[Body],ordnance:&Ordnance,specs:&BTreeMap<u32,Spec>,world:&crate::world_owner::Owned,active:&[Handle])->Result<Self,Error>{
        let terrain=&world.terrain;
        let mut out=Self{handles:active.to_vec(),..Default::default()};
        for (r,h)in active.iter().enumerate(){let physical=row(bodies,id(*h))?;let b=&bodies[physical];let m=o.actor(id(b.handle))?;let s=b.ship.as_ref().ok_or(Error::InvalidTopology)?;let c=s.combat.as_ref().ok_or(Error::InvalidTopology)?;
            let q=c.query.as_ref().ok_or(Error::InvalidTopology)?;let a=s.armor.as_ref().ok_or(Error::InvalidTopology)?;let sh=s.shield.as_ref();
            let mods=so::modifiers(bodies,physical,specs).map_err(host_error)?;let mut observed=fire_query::observe_ship(b,r).map_err(host_error)?;
            let phased=crate::phase_runtime::world_phased(world,bodies,physical,specs).map_err(host_error)?;
            if phased{observed.flags|=f::body_flag::PHASED|f::body_flag::COLLISIONLESS;}else{observed.flags&=!f::body_flag::PHASED;
                if c.attrs[0]<=0.0{observed.flags&=!f::body_flag::COLLISIONLESS;}}
            let root=terrain.root(terrain_owner::identity(b)).map_err(host_error)?;let root_row=terrain.row(bodies,root).map_err(host_error)?;observed.assembly_root=out.index(bodies[root_row].handle)?;
            observed.current_target=observed.current_target.filter(|target|active.iter().any(|h|fi(id(*h))==*target));
            if observed.shield_type==1{observed.shield_facing=b.motion[4];}out.fire_bodies.push(observed.clone());
            let mut pose=b.motion;crate::motion_owner::stats(Some(world),bodies,physical,&mut pose,&mods).map_err(host_error)?;
            let first=out.fire_weapons.len();out.starts.push(first);fire_query::observe_weapons(b,r,&mut out.fire_weapons).map_err(host_error)?;
            let mut flags=observed.flags;if s.flags&ship_state::RETREATED!=0{flags|=t::body_flag::RETREATED;}if s.flags&ship_state::DOCKED!=0{flags|=t::body_flag::DOCKED;}
            if s.control_flags()&64!=0{flags|=t::body_flag::WEAPONS_BLOCKED;}if c.attrs[19]!=1.0{flags|=t::body_flag::MANUAL;}
            let mut wing_power=0.0;let mut carrier_range=f64::INFINITY;
            let recalled=terrain.meta(terrain_owner::identity(b)).map_err(host_error)?.fighter_recall;
            if !recalled&&m.wing_range_multiplier>0.0{for wing in m.wings.iter().take(m.fighter_bays).filter(|w|w.count>0.0&&w.range.unwrap_or(f64::INFINITY)>0.0){wing_power+=wing.count*80.0;carrier_range=carrier_range.min(wing.range.unwrap_or(2500.0));}}
            if wing_power==0.0{carrier_range=0.0;}else{carrier_range*=m.wing_range_multiplier*0.75;}
            let raw=sh.is_some_and(|s|s.active());let shield_phased=sh.is_some_and(|s|s.kind()==3&&(s.data[14]==1.0||s.data[14]==2.0||s.data[14]==3.0&&s.data[15]>0.5));
            let system_phased=crate::phase_runtime::world_system_phased(world,bodies,physical,specs).map_err(host_error)?;
            let locks=s.control_flags()&4!=0;
            out.tactical_bodies.push(t::Body{identity:m.identity,parent:s.world.as_ref().and_then(|w|w.parent).map(id),id:m.stable_id.clone(),locale_rank:m.locale_rank,team:c.team as f64,flags,x:pose[0],y:pose[1],vx:pose[2],vy:pose[3],facing:pose[4],radius:c.radius,
                hp:a.data[14],max_hp:a.data[13],flux:s.flux.percent(),size:c.size as u8,max_speed:pose[14],max_turn_rate:pose[16],acceleration:pose[12],deceleration:pose[13],spec_speed:m.spec_speed,spec_armor:m.spec_armor,
                wing_power,carrier_range,strafe_multiplier:pose[18],shield_radius:sh.map_or(0.0,|s|s.data[2]),shield_raw_active:raw,shield_void:sh.is_some_and(|s|s.void.is_some()),shield_phased,system_phased,system_locks_turning:locks,
                vast:q.vast,retreating:s.flags&ship_state::RETREATING!=0,system_drone:m.system_drone,player:c.player.unwrap_or(false),manual:c.attrs[19]!=1.0,do_not_back_off:m.do_not_back_off!=0.0,
                current_target:q.target.filter(|h|active.contains(h)).map(id),previous_task:m.diagnostics.as_ref().and_then(|d|d.task),training_action:m.training_action,weapon_first:first,weapon_count:m.mounts.len()});
            out.navigation_bodies.push(n::Body{identity:ni(m.identity),assembly_root:ni(id(bodies[root_row].handle)),x:pose[0],y:pose[1],vx:pose[2],vy:pose[3],facing:pose[4],angular_velocity:pose[5],radius:c.radius,team:c.team as f64,flags,
                max_speed:pose[14],acceleration:pose[12],deceleration:pose[13],strafe_multiplier:pose[18],turn_deceleration:pose[15]*0.5,shield_type:sh.map_or(0,|s|s.kind())as u8,shield_radius:sh.map_or(0.0,|s|s.data[2]),
                raw_shield_active:raw,shield_void:sh.is_some_and(|s|s.void.is_some()),system_locks_turning:locks,weapon_first:first,weapon_count:m.mounts.len()});
            let recovery=if s.control_flags()&64!=0{m.systems.first().and_then(|m|s.systems.iter().find(|s|s.id==m.id)).and_then(|s|specs.get(&s.spec)).map_or(0.0,|s|s.down)}else{0.0};
            out.defense_bodies.push(d::Body{identity:di(m.identity),team:c.team as f64,flags,vx:pose[2],vy:pose[3],radius:c.radius,shield_x:observed.shield_x,shield_y:observed.shield_y,shield_radius:observed.shield_radius,shield_type:observed.shield_type,
                shield_efficiency:sh.map_or(1.0,|s|s.data[3]),shield_damage_multiplier:sh.map_or(1.0,|s|s.data[40]*s.data[42]),shield_energy_multiplier:sh.map_or(1.0,|s|s.data[41]),shield_half_arc:sh.map_or(0.0,|s|s.data[1]*PI/360.0),
                phase_down_duration:sh.map_or(0.0,|s|s.data[18]),phase_up_duration:sh.map_or(0.0,|s|s.data[17]),phase_cooldown_duration:sh.map_or(0.0,|s|s.data[19]),shield_unfold_duration:sh.map_or(0.0,|s|s.data[1]/(100.0*180.0/(PI*s.data[2].max(1.0))*if s.kind()==1{2.0}else{1.0}*s.data[12])),
                overload_timer:s.flux.overload_timer,vent_time:observed.vent_time,system_recovery:recovery,max_speed:pose[14],max_turn_rate:pose[16],weapon_first:first,weapon_count:m.mounts.len()});
            let primary=s.systems.first();out.ai.push(a::AIInput{identity:m.identity,tactical_present:m.tactical_present,attached_motion:m.attached_motion,attachment:m.attachment.clone(),native_forecast:m.native_forecast,do_not_back_off:m.do_not_back_off,
                system_mode:m.system_mode.clone(),system_active:primary.is_some_and(|s|s.active),forces_autofire:s.control_flags()&128!=0,engine_state:s.engines.as_ref().map_or("READY",|eng|if eng.data[4]==1.0{"FLAMING_OUT"}else if eng.data[4]==2.0{"DISABLED"}else{"READY"}).into(),aim:q.aim});
            if !out.teams.contains(&(c.team as f64)){out.teams.push(c.team as f64);}
            let mounts=s.weapons.as_ref().ok_or(Error::InvalidTopology)?;
            for(j,meta)in m.mounts.iter().enumerate(){let data=&mounts.mounts[j].data;let e=&c.fire[j];let mq=e.query.as_ref().ok_or(Error::InvalidTopology)?;
                let (range,speed)=battle::weapon_geometry(e,data[1]as usize,&mods,c.attrs[18]);out.fire_weapons[first+j].effective_range=range;out.fire_weapons[first+j].speed=if mq.flags&f::weapon_flag::GUIDED!=0{meta.authored_max_speed}else{speed};
                let w=&out.fire_weapons[first+j];let pivot=contact::rotate(e.spec.relative_pos,pose[4]);let barrel=if e.spec.offsets.is_empty(){[0.0;2]}else{e.spec.offsets[(data[30]%e.spec.offsets.len()as f64)as usize]};
                let muzzle=add(add([pose[0],pose[1]],pivot),contact::rotate(barrel,data[15]));
                let profile_delay=if data[23]==1.0{data[24].max(0.0)}else if data[23]==0.0&&data[20]<=0.0{if data[2]==1.0{e.spec.beam_chargeup}else{data[5]}}else{0.0};
                out.tactical_weapons.push(t::Weapon{owner:m.identity,locale_rank:meta.locale_rank,disabled:w.disabled,ammo:w.ammo,dps:meta.dps,flags:meta.stage_flags,hints:meta.stage_hints,effective_range:range,speed:w.speed,
                    muzzle_x:muzzle[0],muzzle_y:muzzle[1],relative_x:e.spec.relative_pos[0],relative_y:e.spec.relative_pos[1],local_base_angle:mq.base*PI/180.0,angle:data[15],authored_half_arc:mq.arc*PI/360.0,fixed:meta.fixed,profile_delay,position_turn_rate:meta.position_turn_rate});
                let blocked=if mq.decision==f::Decision::FriendlyBlocked{mq.memory.as_ref().filter(|m|m.target.kind==1).map(|m|id(Handle{slot:m.target.identity.handle,generation:m.target.identity.generation}))}else{None};
                out.navigation_weapons.push(n::Weapon{owner:ni(m.identity),relative_x:e.spec.relative_pos[0],relative_y:e.spec.relative_pos[1],blocked_lane_target:blocked.map(ni)});
                out.defense_weapons.push(d::Weapon{owner:di(m.identity),disabled:w.disabled,ammo:w.ammo,dps:meta.dps,flags:meta.stage_flags,muzzle_x:muzzle[0],muzzle_y:muzzle[1],effective_range:range,max_speed:meta.authored_max_speed,
                    base_angle:pose[4]+mq.base*PI/180.0,angle:data[15],fixed:meta.fixed,authored_half_arc:mq.arc*PI/360.0,turn_rate:meta.forecast_turn_rate,
                    readiness:if data[20]>0.0{data[21]}else{data[16].max(0.0)+w.charge_delay},burst_size:e.spec.burst_size,damage:e.spec.damage_per_shot,damage_type:w.damage_type,beam_duration:meta.beam_duration.unwrap_or(f64::INFINITY)});
            }
        }
        for h in active{let b=&bodies[row(bodies,id(*h))?];let q=b.ship.as_ref().unwrap().combat.as_ref().unwrap().query.as_ref().unwrap();for &team in &out.teams{out.visibility.push(*q.visible.get(&(team as u32)).ok_or(Error::InvalidTopology)?as u8);}}
        for p in &ordnance.projectiles{let source=bodies.iter().find(|b|b.id==p.source&&b.handle==p.source_handle&&active.contains(&b.handle)).map(|b|id(b.handle));let target=p.target_handle.filter(|h|active.contains(h)).map(id);
            let guidance=p.delivery.guidance.as_ref();let flag=(if p.guided{d::projectile_flag::GUIDED}else{0})|(if p.guidance.as_ref().is_some_and(|m|m.flare){d::projectile_flag::FLARE}else{0})|(if p.collision_disabled{d::projectile_flag::NO_COLLISION}else{0})|(if p.disarmed{d::projectile_flag::DISARMED}else{0});
            let source_missile=p.delivery.missile&&flag&d::projectile_flag::FLARE==0&&!p.delivery.is_mine&&p.delivery.system_fuse.is_none()&&p.delivery.effect!=Some(crate::weapon_effects::Effect::Mote);
            // initializeSourceProjectile supplies sourceMoveSpeed only for its
            // actual source-lifecycle predicate; ordinary shots use world speed.
            let life=d::remaining_lifetime(d::Lifetime{source_missile,flameout_time:p.delivery.flameout,fizzle_time:p.fizzle,flight_time:p.flight,range_remaining:Some(p.range),source_move_speed:if p.delivery.source(){Some(p.source_speed)}else{None},vx:p.velocity[0],vy:p.velocity[1],fade_time:p.delivery.fade,fade_progress:p.fade});
            // StageAIProducer reads the actual dynamic fields only. Authored
            // guidance speed/turn defaults must not be substituted here.
            let speed=p.guidance.as_ref().and_then(|s|s.max_speed).unwrap_or_else(||n::length(p.velocity[0],p.velocity[1]));let turn=p.guidance.as_ref().and_then(|s|s.max_turn_rate).unwrap_or(0.0)*PI/180.0;
            out.projectiles.push(d::Projectile{source:source.map(di),explicit_team:Some(p.team as f64),flags:flag,did_damage:p.did_damage,damage:p.damage,damage_type:[2,0,1,3][p.delivery.damage_type as usize],remaining_life:life,
                x:p.pos[0],y:p.pos[1],vx:p.velocity[0],vy:p.velocity[1],radius:p.delivery.radius,fuse:p.delivery.fuse.as_ref().map_or(0.0,|f|f.range),target:target.map(di),facing:p.angle,max_speed:speed,turn_rate:turn});
            if p.serial<1.0||p.serial>u32::MAX as f64||p.serial.fract()!=0.0{return Err(Error::InvalidIdentity);}
            out.fire_projectiles.push(f::Projectile{identity:f::Identity{handle:p.serial as u32,generation:1},x:p.pos[0],y:p.pos[1],vx:p.velocity[0],vy:p.velocity[1],radius:p.delivery.radius,
                source:source.and_then(|h|out.index(handle(h)).ok()),flags:(if p.guided{f::projectile_flag::GUIDED}else{0})|(if p.collision_disabled{f::projectile_flag::NO_COLLISION}else{0}),damage:p.damage,damage_type:[2,0,1,3][p.delivery.damage_type as usize],
                range_remaining:p.range,hp:p.guidance.as_ref().and_then(|g|g.hitpoints).unwrap_or(0.0),decoy:guidance.and_then(|g|g.flare.as_ref()).is_some_and(|g|g.mode==crate::missile_guidance::FlareMode::Jammer),
                flare:flag&d::projectile_flag::FLARE!=0,flight_life:life,flight_life_present:true,team:p.team as f64,explicit_team:p.team as f64,..f::Projectile::default()});
            out.missile_scope.push(((p.delivery.missile||p.delivery.is_mine||guidance.is_some_and(|s|s.rocket))&&flag&d::projectile_flag::FLARE==0&&!p.did_damage&&!p.disarmed)as u8);
        }
        for b in &ordnance.beams{let physical=bodies.iter().position(|s|s.id==b.source&&s.handle==b.source_handle).ok_or(Error::StaleIdentity)?;let source=out.index(bodies[physical].handle).ok();
            let s=bodies[physical].ship.as_ref().ok_or(Error::InvalidTopology)?;let local=s.weapons.as_ref().ok_or(Error::InvalidTopology)?.mounts.iter().position(|m|m.data[0]==b.component as f64).ok_or(Error::InvalidTopology)?;
            let damage_type=[2,0,1,3][s.combat.as_ref().ok_or(Error::InvalidTopology)?.fire[local].delivery.as_ref().ok_or(Error::InvalidTopology)?.damage_type as usize];
            let mount=source.map(|r|out.starts[r]+local);
            out.beams.push(d::Beam{source:source.map(|r|di(id(active[r]))),mount,damage_active:b.damage_active,duration:b.duration,start_x:b.start[0],start_y:b.start[1],end_x:b.end[0],end_y:b.end[1],dps:b.damage,damage_type});}
        for rock in terrain.terrain.asteroids.iter().filter(|a|a.hp>0.0){out.asteroids.push(t::Asteroid{x:rock.position[0],y:rock.position[1],vx:rock.velocity[0],vy:rock.velocity[1],radius:rock.radius});out.obstacles.push(n::Obstacle{x:rock.position[0],y:rock.position[1],vx:rock.velocity[0],vy:rock.velocity[1],radius:rock.radius});out.fire_asteroids.push(f::Asteroid{x:rock.position[0],y:rock.position[1],vx:rock.velocity[0],vy:rock.velocity[1],radius:rock.radius,hp:rock.hp});}
        for h in terrain.terrain.hulks.iter().filter(|h|h.managed||h.fixed){out.obstacles.push(n::Obstacle{x:h.position[0],y:h.position[1],vx:h.velocity[0],vy:h.velocity[1],radius:h.radius});}
        out.scope=vec![1;active.len()];out.budget_rows=vec![Vec::new();active.len()];Ok(out)
    }
}
struct Host<'a,'b>{owned:&'a mut Owned,resident:&'a mut Resident<'b>,owner:Identity,settings:a::Settings,
    active:&'a[Handle],cache:&'a mut Cache,systems:Vec<a::System>,weapons:Vec<a::SystemWeapon>,repair:bool,error:Option<Error>}
impl<'a,'b> Host<'a,'b>{
    fn new(owned:&'a mut Owned,resident:&'a mut Resident<'b>,owner:Identity,settings:a::Settings,active:&'a[Handle],cache:&'a mut Cache)->Result<Self,Error>{
        let mut host=Self{owned,resident,owner,settings,active,cache,systems:Vec::new(),weapons:Vec::new(),repair:false,error:None};host.refresh_owner()?;Ok(host)
    }
    fn index(&self)->usize{self.resident.bodies.iter().position(|b|id(b.handle)==self.owner).expect("admitted AI generation")}
    fn cache_index(&self)->usize{self.cache.index(handle(self.owner)).expect("admitted active AI generation")}
    fn ship(&self)->&ShipState{self.resident.bodies[self.index()].ship.as_ref().expect("admitted AI ship")}
    fn refresh(&mut self)->Result<(),Error>{
        synchronize_live(self.resident.bodies,self.resident.specs)?;
        *self.cache=Cache::build(self.owned,self.resident.bodies,self.resident.ordnance,self.resident.specs,self.resident.world,self.active)?;
        self.refresh_owner()
    }
    fn refresh_owner(&mut self)->Result<(),Error>{
        let meta=self.owned.actor(self.owner)?;let s=self.ship();self.systems=meta.systems.iter().zip(&s.systems).map(|(m,l)|{let spec=&self.resident.specs[&l.spec];a::System{ai:m.ai,defense:m.defense,
            available:spec.flags&lifecycle::AVAILABLE!=0,disabled:l.disabled,active:l.active,cooling:l.cooling,toggle:spec.flags&lifecycle::TOGGLE!=0,state:match l.state{1=>a::SystemState::In,2=>a::SystemState::Active,3=>a::SystemState::Out,4=>a::SystemState::Cooldown,_=>a::SystemState::Idle},flux_cost:spec.flux_cost,charge_up:spec.up,charge_down:spec.down}}).collect();
        let s=self.ship();let c=s.combat.as_ref().unwrap();let ws=s.weapons.as_ref().unwrap();let start=self.cache.starts[self.cache_index()];
        self.weapons=ws.mounts.iter().enumerate().map(|(i,m)|{let fire=&c.fire[i];let w=&self.cache.fire_weapons[start+i];a::SystemWeapon{weapon_type:match m.data[1]{1.0=>a::WeaponType::Ballistic,2.0=>a::WeaponType::Energy,_=>a::WeaponType::Missile},
            disabled:w.disabled,ammo:w.ammo,max_ammo:if m.data[10].is_finite(){Some(m.data[10])}else{None},cooldown:m.data[16],burst_remaining:m.data[20],damage_shot:fire.spec.damage_per_shot,damage_second:fire.spec.damage_per_second,
            relative_x:fire.spec.relative_pos[0],relative_y:fire.spec.relative_pos[1],angle:m.data[15],range:w.effective_range}}).collect();
        let root=self.resident.world.terrain.root(terrain_owner::identity(&self.resident.bodies[self.index()])).map_err(host_error)?;
        self.repair=self.resident.bodies.iter().any(|b|self.resident.world.terrain.root(terrain_owner::identity(b)).is_ok_and(|r|r==root)&&b.ship.as_ref().is_some_and(|s|live(s)&&s.armor.as_ref().is_some_and(|a|a.data[14]<a.data[13]*0.65)));Ok(())
    }
    fn finish(&self)->Result<(),Error>{self.error.map_or(Ok(()),Err)}
    fn notices(&mut self,events:Vec<Notice>){let b=&self.resident.bodies[self.index()];self.resident.events.extend(events.into_iter().map(|n|(b.id,b.handle,n)));}
    fn input(&self)->e::ActivationInput{let b=&self.resident.bodies[self.index()];let q=self.ship().combat.as_ref().unwrap().query.as_ref().unwrap();e::ActivationInput{point:q.aim,origin:[b.motion[0],b.motion[1]],velocity:[b.motion[2],b.motion[3]],facing:b.motion[4],target:q.target.map(|h|(h.slot,h.generation)),gravity_anchor_serial:None}}
    fn slot_id(&self,index:usize)->Result<u32,Error>{self.owned.actor(self.owner)?.systems.get(index).map(|s|s.id).ok_or(Error::InvalidTopology)}
    fn gravity_index(&self,c:&g::Controllers,index:usize)->Result<Option<usize>,Error>{let slot=self.slot_id(index)?;Ok(c.slots.iter().position(|s|s.owner==wi(self.owner)&&s.lifecycle.id==slot))}
    fn denied(error:sw::Failure)->Result<bool,Error>{match error{sw::Failure::StaleIdentity=>Err(Error::StaleIdentity),sw::Failure::Unsupported=>Err(Error::UnsupportedSystem),sw::Failure::Host=>Err(Error::HostFailure),_=>Ok(false)}}
    fn gravity_denied(error:g::Error)->Result<bool,Error>{match error{g::Error::Stale=>Err(Error::StaleIdentity),g::Error::Unsupported=>Err(Error::UnsupportedSystem),g::Error::Host=>Err(Error::HostFailure),_=>Ok(false)}}
    fn reason(&mut self,index:usize)->Result<bool,Error>{
        let slot_id=self.slot_id(index)?;let r=self.index();let kind=self.ship().world.as_ref().and_then(|w|w.metas.get(&slot_id)).ok_or(Error::InvalidTopology)?.kind;
        if matches!(kind,e::Kind::GravityWell|e::Kind::GravityBattleWell|e::Kind::GravityOther){
            let c=self.resident.world.gravity.as_ref().ok_or(Error::InvalidTopology)?.owner.hydrate_world(self.resident.world,self.resident.bodies,self.resident.specs).map_err(|_|Error::InvalidTopology)?;let i=self.gravity_index(&c,index)?.ok_or(Error::InvalidTopology)?;
            let mut records=Vec::new();let phased=self.resident.bodies.iter().enumerate().map(|(r,_)|crate::phase_runtime::world_phased(self.resident.world,self.resident.bodies,r,self.resident.specs).map_err(host_error)).collect::<Result<Vec<_>,_>>()?;
            let h=go::Host{bodies:self.resident.bodies,ordnance:self.resident.ordnance,owned:&mut self.resident.world.gravity.as_mut().unwrap().owner,specs:self.resident.specs,random:self.resident.random,visual:self.resident.visual,records:&mut records,destruction:ReadOnlyDestruction{phased}};
            return match c.reason(i,&h){Ok(())=>Ok(true),Err(e)=>Self::gravity_denied(e)};
        }
        if kind==e::Kind::None{let s=self.ship();let l=&s.systems[index];let spec=&self.resident.specs[&l.spec];let reserved=s.systems.iter().fold(0.0,|sum,s|sum+s.pending_flux);
            return Ok(spec.flags&lifecycle::AVAILABLE!=0&&s.can_advance()&&s.flags&(ship_state::DOCKED|ship_state::DISABLED)==0&&s.live.get(e::DISABLE_SYSTEMS)<=0.0&&!l.disabled&&!l.cooling&&l.state!=lifecycle::COOLDOWN
                &&if l.active{spec.flags&lifecycle::TOGGLE!=0&&l.state!=lifecycle::OUT}else{s.flags&ship_state::RETREATING==0&&!s.flux.overloaded&&!s.flux.venting&&!(s.flux.total()+spec.flux_cost+reserved>s.flux.max)&&(spec.flags&lifecycle::CHARGES==0||l.charges>0.0)});
        }
        let slot=so::slot(self.resident.bodies[r].ship.as_ref().unwrap(),handle(self.owner),slot_id,self.resident.specs).map_err(host_error)?;
        let h=so::Host{bodies:self.resident.bodies,specs:self.resident.specs,ordnance:self.resident.ordnance,random:self.resident.random,events:self.resident.events,asteroids:Some(&self.resident.world.terrain.terrain.asteroids)};match slot.activation_reason(&h){Ok(())=>Ok(true),Err(e)=>Self::denied(e)}
    }
    fn activate_real(&mut self,index:usize,defense_entry:bool)->Result<bool,Error>{
        if !self.reason(index)?{return Ok(false);}if defense_entry&&!self.live_ship().right_click_system&&!self.systems[index].active&&self.ship().control_flags()&1!=0{return Ok(false);}
        let slot_id=self.slot_id(index)?;let r=self.index();let input=self.input();let kind=self.ship().world.as_ref().and_then(|w|w.metas.get(&slot_id)).ok_or(Error::InvalidTopology)?.kind;
        if matches!(kind,e::Kind::GravityWell|e::Kind::GravityBattleWell|e::Kind::GravityOther){
            // Source advanceAI invokes ShipSystem.activate(), while the shared
            // command wrapper also sets the user's cursor hold. Preserve the
            // actual pre-activation hold across this AI-only command path.
            let held=self.resident.world.gravity.as_ref().ok_or(Error::InvalidTopology)?.owner.ships.iter().find(|m|m.identity==wi(self.owner))
                .and_then(|m|m.systems.iter().find(|s|s.id==slot_id)).ok_or(Error::InvalidTopology)?.held;
            if !crate::gravity_runtime::command(self.resident.world,self.resident.bodies,self.resident.ordnance,self.resident.specs,r,slot_id,input,self.resident.random,self.resident.visual,self.resident.events).map_err(host_error)?{return Ok(false);}
            self.resident.world.gravity.as_mut().unwrap().owner.ships.iter_mut().find(|m|m.identity==wi(self.owner)).unwrap().systems.iter_mut().find(|s|s.id==slot_id).unwrap().held=held;
        }else if kind==e::Kind::None{let spec_id=self.ship().systems[index].spec;self.resident.bodies[r].ship.as_mut().unwrap().systems[index].activate(&self.resident.specs[&spec_id]);}
        else{let mut slot=so::slot(self.resident.bodies[r].ship.as_ref().unwrap(),handle(self.owner),slot_id,self.resident.specs).map_err(host_error)?;
            let result={let h=so::Host{bodies:self.resident.bodies,specs:self.resident.specs,ordnance:self.resident.ordnance,random:self.resident.random,events:self.resident.events,asteroids:Some(&self.resident.world.terrain.terrain.asteroids)};slot.activate(&h,input)};
            if let Err(e)=result{return Self::denied(e);}so::restore(self.resident.bodies[r].ship.as_mut().unwrap(),slot).map_err(host_error)?;
        }self.refresh()?;Ok(true)
    }
    fn deactivate_real(&mut self,index:usize)->Result<(),Error>{
        let slot_id=self.slot_id(index)?;let r=self.index();
        let gravity=self.resident.world.gravity.as_ref().is_some_and(|g|g.owner.ships.iter().find(|m|m.identity==wi(self.owner)).is_some_and(|m|m.systems.iter().any(|s|s.id==slot_id)));
        if gravity{crate::gravity_runtime::interrupt(self.resident.world,self.resident.bodies,self.resident.specs,handle(self.owner),Some(slot_id),false).map_err(host_error)?;}
        else{let s=self.resident.bodies[r].ship.as_mut().unwrap();let life=s.systems.iter_mut().find(|s|s.id==slot_id).ok_or(Error::InvalidTopology)?;
            if self.owned.actor(self.owner)?.systems[index].ai==a::SystemAI::Special(a::SpecialAI::RocinanteLocalFireControl)&&life.state==lifecycle::IN{return Ok(());}life.interrupt(&self.resident.specs[&life.spec]);}
        self.refresh()
    }
    fn with_aim(&mut self,index:usize,point:[f64;2])->Result<(),Error>{let r=self.index();let before=self.ship().combat.as_ref().unwrap().query.as_ref().unwrap().aim;
        self.resident.bodies[r].ship.as_mut().unwrap().combat.as_mut().unwrap().query.as_mut().unwrap().aim=point;
        if let Some(w)=self.resident.bodies[r].ship.as_mut().unwrap().world.as_mut(){w.aim=point;}
        let result=self.activate_real(index,false);self.resident.bodies[r].ship.as_mut().unwrap().combat.as_mut().unwrap().query.as_mut().unwrap().aim=before;
        if let Some(w)=self.resident.bodies[r].ship.as_mut().unwrap().world.as_mut(){w.aim=before;}
        self.cache.controls(self.owned,self.resident.bodies,self.owner)?;result.map(|_|())
    }
    fn query(&self,mount:usize,target:f::Target,predict:bool)->Result<Option<[f64;2]>,Error>{let r=self.cache_index();let v=self.cache.fire();let mut program=f::Program::new(r);program.configure_mount(&v,self.cache.starts[r]+mount,0.0).map_err(|_|Error::HostFailure)?;
        if predict{program.predict_unconstrained(&v,target).map_err(|_|Error::HostFailure)}else{program.reachable(&v,target).map(|v|if v{Some([0.0;2])}else{None}).map_err(|_|Error::HostFailure)}
    }
    fn mount_available(&self,i:usize)->bool{let s=self.ship();let m=&s.weapons.as_ref().unwrap().mounts[i];let f=&s.combat.as_ref().unwrap().fire[i];s.components[i].data[7]!=1.0&&m.data[17]>=1.0&&so::can_fire(s,f.spec.point_defense)}
}
// reason()/activate() are read-only world queries followed by accepted slot writes.
// They cannot dispatch damage; an accidental dispatch fails rather than dropping it.
struct ReadOnlyDestruction{phased:Vec<bool>}
impl go::Destruction for ReadOnlyDestruction{
    fn apply(&mut self,_:&mut[Body],_:usize,_:&mut go::Owned,_:&mut Ordnance,_:&mut Random,_:&mut Random,_:&mut Vec<go::Record>)->Result<(),u32>{Err(8)}
    fn phased(&self,bodies:&[Body],r:usize,_:&BTreeMap<u32,Spec>)->Result<bool,u32>{if bodies.len()!=self.phased.len(){return Err(8);}self.phased.get(r).copied().ok_or(4)}
    fn hull(&mut self,_:&mut[Body],_:usize,_:&mut go::Owned,_:f64,_:&BTreeMap<u32,Spec>,_:&mut Vec<Notice>)->Result<f64,u32>{Err(8)}
}
use a::Host as _;
impl a::Host for Host<'_, '_>{
    fn identity(&self)->Identity{self.owner}
    fn observation(&self)->Result<a::Observation<'_>,Error>{self.finish()?;self.cache.observation(self.owned,self.settings)}
    fn live_ship(&self)->a::LiveShip{let r=self.cache_index();let b=&self.resident.bodies[self.index()];let s=self.ship();let armor=s.armor.as_ref().unwrap();let meta=self.owned.actor(self.owner).unwrap();
        a::LiveShip{flags:self.cache.tactical_bodies[r].flags,retreating:s.flags&ship_state::RETREATING!=0,right_click_system:s.shield.as_ref().is_some_and(|s|s.data[43]==1.0),x:b.motion[0],y:b.motion[1],vx:b.motion[2],vy:b.motion[3],facing:b.motion[4],spec_speed:meta.spec_speed,
            deceleration:self.cache.tactical_bodies[r].deceleration,hp:armor.data[14],max_hp:armor.data[13],total_flux:s.flux.total(),max_flux:s.flux.max,flux_percent:s.flux.percent(),venting:s.flux.venting,overloaded:s.flux.overloaded,phased:self.cache.fire_bodies[r].flags&f::body_flag::PHASED!=0,blocks_weapons:s.control_flags()&64!=0,
            flameout:s.engines.as_ref().map_or(0.0,|e|e.fraction(true)),controls:n::Controls{turn:b.motion[7],brake:b.motion[8]==1.0,throttle:b.motion[9],strafe:b.motion[10]}}
    }
    fn target_body(&self,target:Identity)->Result<t::Body,Error>{self.cache.tactical_bodies.get(self.cache.index(handle(target))?).cloned().ok_or(Error::StaleIdentity)}
    fn commit_controls(&mut self,intent:&a::Intent,stopped:bool)->Result<(),Error>{let r=self.index();let b=&mut self.resident.bodies[r];let s=b.ship.as_mut().unwrap();s.weapons.as_mut().ok_or(Error::InvalidTopology)?.data[3]=0.0;let c=s.combat.as_mut().unwrap();c.attrs[19]=1.0;let q=c.query.as_mut().unwrap();q.trigger=false;
        q.scope=intent.roster.iter().copied().map(handle).collect();q.expected_scope=q.scope.len();
        if stopped{b.motion[7..11].fill(0.0);q.hold=false;self.owned.actor_mut(self.owner)?.diagnostics=None;self.owned.actor_mut(self.owner)?.tactical_present=false;self.owned.actor_mut(self.owner)?.defense_facing=None;
            if let Some(sh)=s.shield.as_mut(){sh.data[33]=0.0;}if self.resident.world.gravity.is_some(){crate::gravity_runtime::held(self.resident.world,self.resident.bodies,self.resident.ordnance,self.resident.specs,r,false,false,self.resident.random,self.resident.visual,self.resident.events).map_err(host_error)?;}
        }else{q.target=intent.target.map(handle);if intent.target.is_some(){q.aim=intent.aim;if let Some(w)=s.world.as_mut(){w.aim=intent.aim;}if let Some(sh)=s.shield.as_mut(){sh.data[31..33].copy_from_slice(&intent.aim);}}
            q.hold=intent.hold_offensive_fire;b.motion[7]=intent.movement.turn;b.motion[8]=intent.movement.brake as u8 as f64;b.motion[9]=intent.movement.throttle;b.motion[10]=intent.movement.strafe;}
        if stopped{self.refresh()}else{self.cache.controls(self.owned,self.resident.bodies,self.owner)}
    }
    fn systems(&self)->&[a::System]{&self.systems}
    fn active_speed_flat(&self,index:usize)->Result<f64,Error>{self.owned.actor(self.owner)?.systems.get(index).map(|s|s.active_speed_flat).ok_or(Error::InvalidTopology)}
    fn weapons(&self)->&[a::SystemWeapon]{&self.weapons}
    fn assembly_needs_repair(&self)->bool{self.repair}
    fn activate(&mut self,index:usize,defense_entry:bool)->Result<bool,Error>{self.activate_real(index,defense_entry)}
    fn deactivate(&mut self,index:usize)->Result<(),Error>{self.deactivate_real(index)}
    fn publish(&mut self,diagnostics:a::Diagnostics)->Result<(),Error>{let m=self.owned.actor_mut(self.owner)?;m.diagnostics=Some(diagnostics);m.tactical_present=true;self.cache.controls(self.owned,self.resident.bodies,self.owner)}
    fn supports_special(&self,kind:a::SpecialAI)->bool{!matches!(kind,a::SpecialAI::NativeTargeted|a::SpecialAI::NativeMineStrike|a::SpecialAI::NativeOther)}
    fn advance_special(&mut self,index:usize,kind:a::SpecialAI,c:&a::SystemContext<'_>)->Result<(),Error>{match kind{
        a::SpecialAI::GlorianaEdict=>self.edict(index,c),a::SpecialAI::HyperionYamato=>self.yamato(index,c),a::SpecialAI::HyperionJump=>self.jump(index,c),
        a::SpecialAI::RocinanteAttitude=>self.attitude(index,c),a::SpecialAI::RocinanteLocalFireControl=>self.local_fire(index,c),a::SpecialAI::Zhefeng=>self.zhefeng(index,c),
        a::SpecialAI::GravityPush|a::SpecialAI::GravityManeuver|a::SpecialAI::GravityField|a::SpecialAI::GravityCollapse=>self.gravity_ai(index,c),_=>Err(Error::UnsupportedSystem)}}
}
impl d::DefenseHost for Host<'_, '_>{
    fn defense_state(&self)->d::DefenseState{let s=self.ship();let sh=s.shield.as_ref();let meta=self.owned.actor(self.owner).unwrap();let committed=s.weapons.as_ref().is_some_and(|ws|ws.mounts.iter().any(|m|m.data[20]>0.0||m.data[23]==1.0||m.data[2]==1.0&&m.data[3]==1.0&&m.data[23]==2.0));
        d::DefenseState{committed_fire:committed,base_dissipation:s.flux.base,prevents_ai_venting:meta.prevents_ai_venting,venting:s.flux.venting,flux_percent:s.flux.percent(),phase_engaged:sh.is_some_and(|s|s.kind()==3&&(1.0..=3.0).contains(&s.data[14])),
            overloaded:s.flux.overloaded,can_use_shields:sh.is_some_and(|s|s.kind()!=0)&&s.control_flags()&1==0&&sh.is_none_or(|s|s.data[35]!=1.0)&&!s.flux.overloaded&&!s.flux.venting&&s.flags&(ship_state::DEAD|ship_state::RETREATING)==0,
            toggle_locked:sh.is_some_and(|s|s.locked()),max_flux:s.flux.max,total_flux:s.flux.total(),shield_type:sh.map_or(0,|s|s.kind())as u8,shield_active:sh.is_some_and(|s|s.active()),
            phase_activation_cost:sh.map_or(0.0,|s|s.data[20]),phase_upkeep:sh.map_or(0.0,|s|s.data[21]),phase_down_duration:sh.map_or(0.0,|s|s.data[18]),system_shield_damage_multiplier:s.live.get(e::SHIELD_DAMAGE),
            shield_upkeep:sh.map_or(0.0,|s|s.data[4]),system_shield_upkeep_multiplier:s.live.get(e::SHIELD_UPKEEP),hull_hp:s.armor.as_ref().unwrap().data[14]}
    }
    fn set_defense_facing(&mut self,facing:Option<f64>){let r=self.index();if let Some(sh)=self.resident.bodies[r].ship.as_mut().unwrap().shield.as_mut(){sh.data[33]=facing.is_some()as u8 as f64;sh.data[34]=facing.unwrap_or(0.0);}
        if let Ok(m)=self.owned.actor_mut(self.owner){m.defense_facing=facing;}}
    fn set_shield_active(&mut self,active:bool){let r=self.index();let s=self.resident.bodies[r].ship.as_mut().unwrap();
        let before=s.shield.as_ref().map(|sh|(sh.data,sh.void.as_ref().map(|v|v.data),s.flux.words()));
        if let Some(sh)=s.shield.as_mut(){sh.set_active(active,&mut s.flux);s.sync_shield();}
        let changed=match(before,s.shield.as_ref()){
            (Some((data,void,flux)),Some(sh))=>!same_words(&data,&sh.data)||void!=sh.void.as_ref().map(|v|v.data)||!same_words(&flux,&s.flux.words()),
            (None,None)=>false,_=>true};
        if changed{if let Err(e)=self.refresh(){self.error=Some(e);}}}
    fn start_venting(&mut self)->bool{let r=self.index();let s=&self.resident.bodies[r].ship.as_ref().unwrap();
        if !s.can_advance()||s.flags&(ship_state::DOCKED|ship_state::RETREATING)!=0||s.shield.as_ref().is_some_and(|s|s.locked())||s.control_flags()&8!=0||s.flux.vent_mult<=0.0||s.flux.overloaded||s.flux.venting||s.flux.total()<=5.0{return false;}
        let right=s.shield.as_ref().is_some_and(|s|s.data[43]==1.0);let mut notices=Vec::new();
        if let Some(sh)=self.resident.bodies[r].ship.as_mut().unwrap().shield.as_mut(){if let Some(v)=sh.void.as_mut(){v.data[10]=1.0;sh.data[6]=0.0;sh.data[7]=0.0;}
            else if sh.requested()&&(sh.kind()!=3||sh.phase_upkeep()){let phase=sh.kind()==3;let s=self.resident.bodies[r].ship.as_mut().unwrap();s.shield.as_mut().unwrap().set_active(false,&mut s.flux);notices.push(Notice{system:0,kind:if phase{ship_state::PHASE_DEACTIVATE}else{ship_state::SHIELD_DOWN},value:if phase{0.9}else{0.7},detail:[0.0;2]});}}
        let count=self.systems.len();for i in 0..count{if !self.systems[i].defense||right{if let Err(e)=self.deactivate_real(i){self.error=Some(e);return false;}}}
        let s=self.resident.bodies[r].ship.as_mut().unwrap();let started=s.flux.start_vent();s.sync_shield();if started{notices.push(Notice{system:0,kind:ship_state::VENT_AUDIO,value:0.9,detail:[0.0;2]});notices.push(Notice{system:0,kind:ship_state::VENT_LOOP_START,value:0.65,detail:[0.0;2]});}self.notices(notices);
        if let Err(e)=self.refresh(){self.error=Some(e);}started
    }
}
impl Host<'_, '_>{
    fn edict(&mut self,index:usize,c:&a::SystemContext<'_>)->Result<(),Error>{let r=self.index();let b=&self.resident.bodies[r];let s=self.ship();let sys=&self.systems[index];let target=&self.resident.bodies[row(self.resident.bodies,c.target)?];let ts=target.ship.as_ref().ok_or(Error::InvalidTopology)?;
        if sys.active||sys.cooling||sys.disabled||!live(s)||!live(ts)||self.cache.fire_bodies[self.cache.index(handle(c.target))?].flags&f::body_flag::PHASED!=0||c.withdrawing||c.waypoint||c.avoiding_collision||s.flux.total()+sys.flux_cost>s.flux.max*0.65{return Ok(());}
        let pose=[b.motion[0],b.motion[1]];let aim=s.combat.as_ref().unwrap().query.as_ref().unwrap().aim;let side=e::broadside(aim,pose,b.motion[4]);if side==0||side!=e::broadside([target.motion[0],target.motion[1]],pose,b.motion[4]){return Ok(());}
        let children=s.world.as_ref().ok_or(Error::InvalidTopology)?.children.clone();let charge=sys.charge_up;let mut useful=false;
        for child in children{let rr=row(self.resident.bodies,id(child))?;let ship=&self.resident.bodies[rr];let cs=ship.ship.as_ref().ok_or(Error::InvalidTopology)?;let world=cs.world.as_ref().ok_or(Error::InvalidTopology)?;
            if world.parent!=Some(handle(self.owner))||world.side!=side||!live(cs)||cs.flux.venting||cs.flux.overloaded||cs.control_flags()&64!=0||cs.flux.percent()>=0.6{continue;}
            let w=cs.weapons.as_ref().ok_or(Error::InvalidTopology)?;let cb=cs.combat.as_ref().unwrap();
            for(i,m)in w.mounts.iter().enumerate(){if m.data[1]!=1.0||cs.components[i].data[7]==1.0||m.data[17]==0.0||m.data[16]>charge{continue;}
                let delta=sub([target.motion[0],target.motion[1]],add([ship.motion[0],ship.motion[1]],contact::rotate(cb.fire[i].spec.relative_pos,ship.motion[4])));let distance=n::length(delta[0],delta[1]);
                let range=self.cache.fire_weapons[self.cache.starts[self.cache.index(child)?]+i].effective_range;let radius=ts.combat.as_ref().unwrap().radius;
                if distance<=range+radius&&n::signed_angle(delta[1].atan2(delta[0])-m.data[15]).abs()<0.2+(radius/distance.max(1.0)).min(1.0).asin(){useful=true;break;}}
            if useful{break;}}
        if useful{self.activate_real(index,false)?;}Ok(())
    }
    fn yamato(&mut self,index:usize,c:&a::SystemContext<'_>)->Result<(),Error>{let sys=&self.systems[index];let s=self.ship();let target=&self.resident.bodies[row(self.resident.bodies,c.target)?];let ts=target.ship.as_ref().ok_or(Error::InvalidTopology)?;
        if sys.active||sys.cooling||!live(s)||s.flux.overloaded||s.flux.venting||sys.disabled||ts.flags&ship_state::DEAD!=0||self.cache.fire_bodies[self.cache.index(handle(c.target))?].flags&f::body_flag::PHASED!=0||s.flux.percent()>0.65
            ||s.armor.as_ref().unwrap().data[14]<self.owned.actor(self.owner)?.spec_hp*0.4||c.withdrawing||c.waypoint{return Ok(());}
        let range=s.world.as_ref().and_then(|w|w.launcher.as_ref()).ok_or(Error::InvalidTopology)?.range;
        if c.distance<450.0||c.distance>range-50.0{return Ok(());}let b=&self.resident.bodies[self.index()];let delta=sub([target.motion[0],target.motion[1]],[b.motion[0],b.motion[1]]);
        if n::signed_angle(delta[1].atan2(delta[0])-b.motion[4]).abs()>0.1{return Ok(());}self.with_aim(index,[target.motion[0],target.motion[1]])
    }
    fn jump(&mut self,index:usize,c:&a::SystemContext<'_>)->Result<(),Error>{let sys=&self.systems[index];let s=self.ship();let tr=row(self.resident.bodies,c.target)?;
        if sys.active||sys.cooling||!live(s)||s.flux.overloaded||s.flux.venting||sys.disabled||self.resident.bodies[tr].ship.as_ref().unwrap().flags&ship_state::DEAD!=0||c.waypoint{return Ok(());}
        let b=&self.resident.bodies[self.index()];let position=[b.motion[0],b.motion[1]];let target=[self.resident.bodies[tr].motion[0],self.resident.bodies[tr].motion[1]];let away=normalize(sub(position,target));
        let retreat=c.withdrawing||s.armor.as_ref().unwrap().data[14]<self.owned.actor(self.owner)?.spec_hp*0.4||s.flux.percent()>0.7;
        let approach=!retreat&&c.allow_offensive_maneuver&&c.distance>c.desired_range+900.0;if !retreat&&!approach{return Ok(());}
        let mut desired=if retreat{add(position,scale(away,1500.0))}else{add(target,scale(away,c.desired_range.max(800.0)))};
        let delta=sub(desired,position);let range=1800.0*s.world.as_ref().ok_or(Error::InvalidTopology)?.range_multiplier;if n::length(delta[0],delta[1])>range{desired=add(position,scale(normalize(delta),range));}self.with_aim(index,desired)
    }
    fn drift_clear(&self)->Result<bool,Error>{let own=&self.cache.fire_bodies[self.cache_index()];let radius=own.radius+12.0;
        for(other,h)in self.active.iter().enumerate(){let b=&self.resident.bodies[row(self.resident.bodies,id(*h))?];if other==self.cache_index()||self.cache.fire_bodies[other].assembly_root==own.assembly_root||!live(b.ship.as_ref().unwrap())||self.cache.fire_bodies[other].flags&f::body_flag::COLLISIONLESS!=0{continue;}
            let end=[own.x+(own.vx-b.motion[2])*1.5,own.y+(own.vy-b.motion[3])*1.5];if d::circle_entry(own.x,own.y,end[0],end[1],b.motion[0],b.motion[1],radius+self.cache.fire_bodies[other].radius).is_some(){return Ok(false);}}
        for rock in &self.cache.fire_asteroids{if d::circle_entry(own.x,own.y,own.x+own.vx*1.5,own.y+own.vy*1.5,rock.x,rock.y,radius+rock.radius).is_some(){return Ok(false);}}Ok(true)
    }
    fn attitude(&mut self,index:usize,c:&a::SystemContext<'_>)->Result<(),Error>{if self.systems[index].active{if c.withdrawing||c.waypoint||c.avoiding_collision{self.deactivate_real(index)?;}return Ok(());}
        let target=self.cache.index(handle(c.target))?;let ts=self.resident.bodies[row(self.resident.bodies,c.target)?].ship.as_ref().unwrap();let own=self.cache.fire_bodies[self.cache_index()].clone();let enemy=self.cache.fire_bodies[target].clone();
        if !c.allow_offensive_maneuver||c.withdrawing||c.waypoint||c.avoiding_collision||c.threat.actual_damage>0.0||c.threat.imminent_damage>self.ship().armor.as_ref().unwrap().data[13]*0.05
            ||!live(ts)||enemy.team==own.team||!self.cache.tactical().visible(target,self.cache_index())||!self.reason(index)?||!self.drift_clear()?{return Ok(());}
        let count=self.owned.actor(self.owner)?.mounts.len();for i in 0..count{if self.owned.actor(self.owner)?.mounts[i].role!=RoleCertificate::Axial||!self.mount_available(i)||self.weapons[i].cooldown>1.3{continue;}
            if let Some(point)=self.query(i,f::Target{kind:1,identity:fi(c.target)},true)?{let w=&self.cache.tactical_weapons[self.cache.starts[self.cache_index()]+i];let delta=[point[0]-w.muzzle_x,point[1]-w.muzzle_y];
                if n::length(delta[0],delta[1])>w.effective_range+enemy.radius{continue;}let error=n::signed_angle(delta[1].atan2(delta[0])-own.facing-w.local_base_angle).abs();
                if error>25.0*PI/180.0&&error<145.0*PI/180.0{self.activate_real(index,false)?;break;}}}Ok(())
    }
    fn local_fire(&mut self,index:usize,c:&a::SystemContext<'_>)->Result<(),Error>{let sys=&self.systems[index];if !live(self.ship())||self.ship().combat.as_ref().unwrap().attrs[19]!=1.0||matches!(sys.state,a::SystemState::In|a::SystemState::Out){return Ok(());}
        let mounts:Vec<_>=self.owned.actor(self.owner)?.mounts.iter().enumerate().filter(|(i,m)|m.role==RoleCertificate::PointDefense&&self.mount_available(*i)).map(|(i,_)|i).collect();let mut intercept=false;
        'outer:for &i in &mounts{for(p,missile)in self.cache.fire_projectiles.iter().enumerate(){if self.cache.missile_scope[p]!=0&&self.query(i,f::Target{kind:2,identity:missile.identity},false)?.is_some(){intercept=true;break 'outer;}}
            for ship in &self.cache.fire_bodies{if ship.size==0&&self.query(i,f::Target{kind:1,identity:ship.identity},false)?.is_some(){intercept=true;break 'outer;}}}
        let sys=&self.systems[index];let heat=self.ship().flux.total()/self.ship().flux.max.max(1.0);let heat_ready=heat<if matches!(sys.state,a::SystemState::Active){0.72}else{0.45};
        let target=self.ship().combat.as_ref().unwrap().query.as_ref().unwrap().target.map(id);let mut suppress=false;
        if heat_ready&&!intercept&&!c.withdrawing&&c.quiet_for>=0.6{if let Some(target)=target{let r=self.cache.index(handle(target))?;if self.cache.fire_bodies[r].size!=0{for i in mounts{if self.query(i,f::Target{kind:1,identity:fi(target)},false)?.is_some(){suppress=true;break;}}}}}
        if suppress&&matches!(self.systems[index].state,a::SystemState::Idle)||!suppress&&matches!(self.systems[index].state,a::SystemState::Active){self.activate_real(index,false)?;}Ok(())
    }
    fn zhefeng(&mut self,index:usize,c:&a::SystemContext<'_>)->Result<(),Error>{if !matches!(self.systems[index].state,a::SystemState::Idle)||!self.reason(index)?||self.resident.bodies[row(self.resident.bodies,c.target)?].ship.as_ref().unwrap().flags&ship_state::DEAD!=0
            ||c.withdrawing||c.waypoint||c.avoiding_collision||self.ship().flux.percent()>0.45{return Ok(());}
        for i in 0..self.owned.actor(self.owner)?.mounts.len(){let s=self.ship();if s.components[i].data[7]==1.0||self.owned.actor(self.owner)?.mounts[i].original_point_defense{continue;}
            if self.query(i,f::Target{kind:1,identity:fi(c.target)},false)?.is_some(){self.activate_real(index,false)?;break;}}Ok(())
    }
    fn gravity_ai(&mut self,index:usize,c:&a::SystemContext<'_>)->Result<(),Error>{let controllers=self.resident.world.gravity.as_ref().ok_or(Error::InvalidTopology)?.owner.hydrate_world(self.resident.world,self.resident.bodies,self.resident.specs).map_err(|_|Error::InvalidTopology)?;
        let slot=&controllers.slots[self.gravity_index(&controllers,index)?.ok_or(Error::InvalidTopology)?];let kind=slot.kind;let s=self.ship();let own=&self.cache.fire_bodies[self.cache_index()];let tr=self.cache.index(handle(c.target))?;let ts=self.resident.bodies[row(self.resident.bodies,c.target)?].ship.as_ref().unwrap();let target=&self.cache.fire_bodies[tr];
        if slot.lifecycle.state!=lifecycle::IDLE{return Ok(());}
        match kind{
            g::Kind::Well|g::Kind::BattleWell=>{if !live(ts)||target.flags&f::body_flag::PHASED!=0||own.team==target.team||c.withdrawing||c.waypoint||s.flux.percent()>0.55{return Ok(());}
                self.with_aim(index,add([target.x,target.y],scale(normalize([own.x-target.x,own.y-target.y]),140.0)))},
            g::Kind::Maneuver=>{if !live(ts)||target.flags&f::body_flag::PHASED!=0||own.team==target.team||!c.withdrawing||c.waypoint||s.flux.percent()>0.6{return Ok(());}self.with_aim(index,[own.x+(own.x-target.x),own.y+(own.y-target.y)])},
            g::Kind::Release|g::Kind::Collapse=>{let well=controllers.slots.iter().find(|s|s.owner==wi(self.owner)&&s.field.as_ref().is_some_and(|f|f.kind==g::FieldKind::Well));let Some(well)=well else{return Ok(());};let field=well.field.as_ref().unwrap();
                if well.lifecycle.state!=lifecycle::ACTIVE||s.flux.percent()>0.65||kind==g::Kind::Collapse&&field.age<0.8{return Ok(());}let distance=d::frame_length(target.x-field.position[0],target.y-field.position[1]);
                if if kind==g::Kind::Release{distance<350.0&&(c.withdrawing||well.lifecycle.active_timer<1.2)}else{distance<400.0||well.lifecycle.active_timer<0.8}{self.activate_real(index,false)?;}Ok(())},
            g::Kind::Polarity=>{if slot.polarity==Some(-1)&&!s.flux.overloaded&&!s.flux.venting{self.activate_real(index,false)?;}Ok(())},
            g::Kind::Repulsor|g::Kind::BattleRepulsor=>{if c.waypoint||s.flux.percent()>0.7{return Ok(());}let battle=kind==g::Kind::BattleRepulsor;let mut close=0;let mut danger=false;
                for(i,h)in self.active.iter().enumerate(){let body=&self.resident.bodies[row(self.resident.bodies,id(*h))?];let other=&self.cache.fire_bodies[i];if other.assembly_root!=i||other.team==own.team||!live(body.ship.as_ref().unwrap())||other.flags&f::body_flag::PHASED!=0{continue;}let distance=n::length(own.x-other.x,own.y-other.y);
                    if battle{let gap=distance-own.radius-other.radius;if gap<80.0||gap<180.0&&(c.withdrawing||s.flux.percent()>0.45){danger=true;}}else if distance<450.0{close+=1;}}
                let mut barrage=0;for p in &self.resident.ordnance.projectiles{if p.team as f64==own.team||p.did_damage||p.collision_disabled||p.delivery.spawn_type==2{continue;}
                    let relative=[p.pos[0]-own.x,p.pos[1]-own.y];let velocity=[p.velocity[0]-own.vx,p.velocity[1]-own.vy];let dot=relative[0]*velocity[0]+relative[1]*velocity[1];
                    if battle{let meta=self.resident.world.gravity.as_ref().ok_or(Error::InvalidTopology)?.owner.projectiles.iter().find(|m|m.identity.slot as f64==p.serial).ok_or(Error::InvalidTopology)?;let rocket=p.delivery.guidance.as_ref().is_some_and(|s|s.rocket);
                        if p.delivery.is_mine||meta.mine||meta.hull_explosion||p.guidance.as_ref().is_some_and(|s|s.flare)||!rocket&&p.delivery.spawn_type!=1&&p.delivery.spawn_type!=3{continue;}
                        let seconds= -dot/(velocity[0]*velocity[0]+velocity[1]*velocity[1]).max(1.0);if seconds>=0.0&&seconds<0.65&&n::length(relative[0]+velocity[0]*seconds,relative[1]+velocity[1]*seconds)<own.radius+p.delivery.radius+25.0{barrage+=1;}
                    }else if n::length(relative[0],relative[1])<430.0&&dot<0.0{barrage+=1;}}
                if if battle{danger||barrage>=5}else{close>=2||barrage>=5||close>0&&(c.withdrawing||s.flux.percent()>0.45)}{self.activate_real(index,false)?;}Ok(())},
            g::Kind::Push=>Err(Error::UnsupportedSystem),
        }
    }
}
