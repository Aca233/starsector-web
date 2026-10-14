//! One resident flight authority and the actual source ordered ship-step queue.
//! Core owns allocation and complete static-domain admission; every runtime
//! operation below calls the production flight/world/phase services in Rust.
use crate::{battle::Ordnance,flight_owner as o,flight_world as f,lifecycle::Spec,
    phase_runtime as p,random::Random,ship_state::{self,Notice},state::{Body,Handle},
    tactical_ai::Identity,world_owner as w};
use std::{cell::RefCell,collections::BTreeMap,rc::Rc};
fn id(h:Handle)->Identity{Identity{handle:h.slot,generation:h.generation}}
fn handle(h:Identity)->Handle{Handle{slot:h.handle,generation:h.generation}}
fn row(b:&[Body],h:Identity)->Result<usize,f::Error>{b.iter().position(|b|id(b.handle)==h).ok_or(f::Error::StaleIdentity)}
pub fn error(e:f::Error)->u32{match e{f::Error::StaleIdentity=>4,_=>8}}
#[derive(Clone,Copy,PartialEq,Eq,Default)]pub enum Stage{#[default]Closed,Collect,State,Motion,WeaponState,FireQuery,FireCommit,Finish}
#[derive(Clone)]pub enum MissileScope{Captured(Vec<Identity>),Selected(Option<Identity>)}
#[derive(Clone)]pub struct Queued{pub step:o::Step,pub ships:Vec<Identity>,pub missiles:MissileScope}
#[derive(Clone,Default)]pub struct Owned{
    pub owner:o::Owned,pub flights:f::FlightWorld,pub roots:Vec<Identity>,pub drones:Vec<Identity>,
    pub stage:Stage,pub ordinary_roster:Vec<Identity>,pub initial_roster:Vec<Identity>,pub wing_roster:Vec<Identity>,
    pub queue:Vec<Queued>,pub records:Vec<o::Record>,pub wings_collected:bool,
    pub admission:Option<crate::flight_wire::Admission>,
    pub statics:BTreeMap<String,o::StaticShip>,
    pub collation:crate::flight_admission::Collation,
    pub ordinary_missiles:Vec<Identity>,pub wing_missiles:Vec<Identity>,
    pub drone:crate::drone_runtime::Owned,
}
/// The Core implementation must allocate a genuine generation and synchronously
/// admit every actual static tree into terrain/gravity/phase/query/AI/outputs.
/// There is no default implementation and no host callback per simulated rule.
pub trait Authority{
    fn allocate(&mut self,stable:&str)->Result<o::Allocation,f::Error>;
    fn admitted(&mut self,bodies:&mut Vec<Body>,owner:&mut o::Owned,world:&mut w::Owned,specs:&BTreeMap<u32,Spec>,tree:&[Identity])->Result<(),f::Error>;
}
pub struct Context<'a,A:Authority>{
    pub bodies:&'a mut Vec<Body>,pub world:&'a mut w::Owned,
    pub ordnance:&'a mut Ordnance,pub specs:&'a BTreeMap<u32,Spec>,pub random:&'a mut Random,pub visual:&'a mut Random,
    pub notices:&'a mut Vec<(u32,Handle,Notice)>,pub authority:&'a mut A,
}
struct Services<'a,A:Authority>{world:&'a mut w::Owned,specs:&'a BTreeMap<u32,Spec>,notices:&'a mut Vec<(u32,Handle,Notice)>,
    authority:&'a mut A,queue:&'a mut Vec<Queued>,drones:&'a mut Vec<Identity>,scope:&'a[Identity],missiles:&'a[Identity],statics:&'a BTreeMap<String,o::StaticShip>,stage:Stage}
fn missiles(o:&Ordnance,ordinary:bool)->Result<Vec<Identity>,f::Error>{o.projectiles.iter().filter(|p|!ordinary||crate::weapon_world::rocket(p)||p.delivery.spawn_type==4||p.delivery.is_mine||p.guidance.as_ref().is_some_and(|g|g.flare)).map(|p|{
    if p.serial<1.0||p.serial>u32::MAX as f64||p.serial.fract()!=0.0{return Err(f::Error::InvalidIdentity);}Ok(Identity{handle:p.serial as u32,generation:1})}).collect()}
fn enqueue(queue:&mut Vec<Queued>,stage:Stage,scope:&[Identity],missiles:&[Identity],step:o::Step)->Result<(),f::Error>{
    if stage!=Stage::Collect||queue.iter().any(|q|q.step.craft==step.craft){return Err(f::Error::WrongStage);}
    if !step.dt.is_finite()||step.dt<0.0{return Err(f::Error::InvalidNumber);}let(ships,missiles)=match &step.permission{
        f::FirePermission::World=>(scope.to_vec(),MissileScope::Captured(missiles.to_vec())),
        f::FirePermission::Gloriana{ships,missile}=>(ships.clone(),MissileScope::Selected(*missile)),
    };queue.push(Queued{step,ships,missiles});Ok(())
}
impl<A:Authority> o::Services for Services<'_,A>{
    fn allocate(&mut self,stable:&str)->Result<o::Allocation,f::Error>{self.authority.allocate(stable)}
    fn admitted(&mut self,bodies:&mut Vec<Body>,owner:&mut o::Owned,tree:&[Identity])->Result<(),f::Error>{self.authority.admitted(bodies,owner,self.world,self.specs,tree)}
    fn removed(&mut self,bodies:&mut Vec<Body>,_:&mut o::Owned,craft:Identity,reason:f::Removal)->Result<(),f::Error>{row(bodies,craft)?;
        if reason==f::Removal::Detached{if !self.drones.contains(&craft){self.drones.push(craft);}}else{self.drones.retain(|h|*h!=craft);}Ok(())}
    fn enqueue(&mut self,step:o::Step)->Result<(),f::Error>{enqueue(self.queue,self.stage,self.scope,self.missiles,step)}
    fn clear_held(&mut self,bodies:&mut[Body],craft:Identity)->Result<(),f::Error>{let r=row(bodies,craft)?;p::clear_held(self.world,bodies,r,self.specs).map_err(|_|f::Error::HostFailure)}
    fn destruction_enabled(&self)->bool{!self.world.suppressed}
    fn destroy(&mut self,bodies:&mut[Body],ordnance:&mut Ordnance,_:&mut o::Owned,craft:Identity,random:&mut Random,visual:&mut Random)->Result<(),f::Error>{
        let r=row(bodies,craft)?;let mut host=w::Host{bodies,ordnance,specs:self.specs,owned:self.world,events:self.notices};
        host.destroy(r,random,visual).map_err(|_|f::Error::HostFailure)?;host.finish().map_err(|_|f::Error::HostFailure)
    }
}
struct Host<'a,A:Authority>{inner:o::Host<'a,Services<'a,A>>,bodies:RefCell<BTreeMap<u32,Rc<f::Body>>>,rows:RefCell<Option<(usize,BTreeMap<(u32,u32),usize>)>>}
impl<A:Authority> Host<'_,A>{
    fn row(&self,h:Identity)->Result<usize,f::Error>{let mut rows=self.rows.borrow_mut();if rows.as_ref().is_none_or(|(len,_)|*len!=self.inner.bodies.len()){
        let mut index=BTreeMap::new();for(i,b)in self.inner.bodies.iter().enumerate(){index.entry((b.handle.slot,b.handle.generation)).or_insert(i);}*rows=Some((self.inner.bodies.len(),index));}
        if let Some(&r)=rows.as_ref().unwrap().1.get(&(h.handle,h.generation)){if self.inner.bodies.get(r).is_some_and(|b|id(b.handle)==h){return Ok(r);}}
        row(self.inner.bodies,h)
    }
}
macro_rules! delegate{
    ()=>{};
    (fn $name:ident(&self $(,$arg:ident:$ty:ty)*)->$ret:ty;$($rest:tt)*)=>{fn $name(&self $(,$arg:$ty)*)->$ret{f::Host::$name(&self.inner $(,$arg)*)}delegate!{$($rest)*}};
    (fn $name:ident(&mut self $(,$arg:ident:$ty:ty)*)->$ret:ty;$($rest:tt)*)=>{fn $name(&mut self $(,$arg:$ty)*)->$ret{self.bodies.get_mut().clear();*self.rows.get_mut()=None;f::Host::$name(&mut self.inner $(,$arg)*)}delegate!{$($rest)*}};
}
impl<A:Authority> f::Host for Host<'_,A>{
    fn team(&self,h:Identity)->Result<f64,f::Error>{Ok(self.inner.bodies[self.row(h)?].ship.as_ref().and_then(|s|s.combat.as_ref()).ok_or(f::Error::HostFailure)?.team as f64)}
    fn body(&self,h:Identity)->Result<f::Body,f::Error>{Ok((*f::Host::body_shared(self,h)?).clone())}
    fn body_shared(&self,h:Identity)->Result<Rc<f::Body>,f::Error>{if let Some(body)=self.bodies.borrow().get(&h.handle).filter(|b|b.identity==h){return Ok(Rc::clone(body));}
        let r=self.row(h)?;let mut pose=self.inner.bodies[r].motion;let live=crate::system_owner::modifiers(self.inner.bodies,r,self.inner.specs).map_err(|_|f::Error::HostFailure)?;
        crate::motion_owner::stats(Some(self.inner.services.world),self.inner.bodies,r,&mut pose,&live).map_err(|_|f::Error::HostFailure)?;
        let phased=p::phased_world(self.inner.services.world,self.inner.bodies,r,self.inner.specs).map_err(|_|f::Error::HostFailure)?;
        let body=Rc::new(o::observe_body(self.inner.bodies,self.inner.owned,r,pose[crate::motion::TURN_ACCELERATION]*0.5,phased)?);self.bodies.borrow_mut().insert(h.handle,Rc::clone(&body));Ok(body)}
    fn commands(&mut self,craft:Identity,cmd:f::Commands)->Result<(),f::Error>{let cached=cmd.clone();f::Host::commands(&mut self.inner,craft,cmd)?;
        if let Some(body)=self.bodies.get_mut().get_mut(&craft.handle).filter(|b|b.identity==craft){let body=Rc::make_mut(body);body.controls=cached.controls;body.aim=cached.aim;body.hold=cached.hold;body.firing=cached.firing;body.current_target=cached.target;}Ok(())}
    fn pose(&mut self,craft:Identity,pos:f::Vec2,previous:f::Vec2,velocity:f::Vec2,docked:bool)->Result<(),f::Error>{self.bodies.get_mut().remove(&craft.handle);f::Host::pose(&mut self.inner,craft,pos,previous,velocity,docked)}
    fn rearm(&mut self,craft:Identity,mount:u32,generation:u32,ammo:f64)->Result<(),f::Error>{self.bodies.get_mut().remove(&craft.handle);f::Host::rearm(&mut self.inner,craft,mount,generation,ammo)}
    fn clear_input(&mut self,craft:Identity)->Result<(),f::Error>{let r=self.row(craft)?;let world=self.inner.bodies[r].ship.as_ref().and_then(|s|s.world.as_ref()).ok_or(f::Error::HostFailure)?;
        let gravity=!world.gravity_systems.is_empty();if gravity{self.bodies.get_mut().clear();}f::Host::clear_input(&mut self.inner,craft)?;
        if !gravity{if let Some(body)=self.bodies.get_mut().get_mut(&craft.handle).filter(|b|b.identity==craft){let body=Rc::make_mut(body);body.controls=crate::navigation_ai::Controls::default();body.firing=false;}}Ok(())}
    fn set_shield(&mut self,craft:Identity,active:bool)->Result<(),f::Error>{let r=self.row(craft)?;let shield=self.inner.bodies[r].ship.as_ref().and_then(|s|s.shield.as_ref()).ok_or(f::Error::HostFailure)?;
        if shield.kind()==crate::shield::PHASE{self.bodies.get_mut().clear();}f::Host::set_shield(&mut self.inner,craft,active)}
    fn disable_autofire(&mut self,craft:Identity)->Result<(),f::Error>{f::Host::disable_autofire(&mut self.inner,craft)}
    fn deployed_remove(&mut self,carrier:Identity,craft:Identity)->Result<(),f::Error>{f::Host::deployed_remove(&mut self.inner,carrier,craft)}
    fn heal(&mut self,craft:Identity,amount:f64)->Result<(),f::Error>{let result=f::Host::heal(&mut self.inner,craft,amount);if result.is_ok(){self.bodies.get_mut().remove(&craft.handle);}result}
    fn enqueue_ship_step(&mut self,craft:Identity,dt:f64,target:Option<Identity>,permission:f::FirePermission)->Result<(),f::Error>{f::Host::enqueue_ship_step(&mut self.inner,craft,dt,target,permission)}
    fn event(&mut self,craft:Identity,event:f::FlightEvent)->Result<(),f::Error>{
        let r=self.row(craft)?;let b=&self.inner.bodies[r];let position=[b.motion[0],b.motion[1]];
        let s=b.ship.as_ref().ok_or(f::Error::HostFailure)?;let player=s.combat.as_ref().and_then(|c|c.player).ok_or(f::Error::HostFailure)?;let carrier=s.world.as_ref().and_then(|w|w.carrier);
        let world=&mut self.inner.services.world;let visual=&mut self.inner.visual;
        match event{
            f::FlightEvent::Rearmed=>{crate::weapon_world::floating_text(world,position,"REARMED & LAUNCHING",[100,220,255],13.0,1.8,visual);if world.visual.listener.is_some(){world.visual.play("fighter_deploy",0.6,1.0,Some(position),true).map_err(|_|f::Error::HostFailure)?;}},
            f::FlightEvent::PayloadAway=>crate::weapon_world::floating_text(world,position,"PAYLOAD AWAY - RETURNING",[255,140,40],14.0,2.0,visual),
            f::FlightEvent::Rebuilt=>{world.stats.fighter_rebuilt(player);let carrier=carrier.ok_or(f::Error::HostFailure)?;let b=&self.inner.bodies[row(self.inner.bodies,id(carrier))?];if world.visual.listener.is_some(){world.visual.play("fighter_deploy",0.6,1.0,Some([b.motion[0],b.motion[1]]),true).map_err(|_|f::Error::HostFailure)?;}},
            f::FlightEvent::FighterDestroyedFriendly=>world.message("编队损管","PLAYER","注意！友方阔剑战机被凌空击坠！机库准备重构！",[255,120,80],visual).map_err(|_|f::Error::HostFailure)?,
            f::FlightEvent::FighterDestroyedEnemy=>world.message("点防火控","PLAYER","敌方拦截机已被击坠！目标已消灭！",[120,255,160],visual).map_err(|_|f::Error::HostFailure)?,
        }
        f::Host::event(&mut self.inner,craft,event)
    }
    fn random_next(&mut self)->Result<f64,f::Error>{f::Host::random_next(&mut self.inner)}
    fn next_id(&mut self,prefix:&str)->Result<String,f::Error>{f::Host::next_id(&mut self.inner,prefix)}
    fn cancel_order(&mut self,craft:Identity)->Result<(),f::Error>{f::Host::cancel_order(&mut self.inner,craft)}
    fn finish_visuals(&mut self,craft:Identity,bomber:bool)->Result<(),f::Error>{f::Host::finish_visuals(&mut self.inner,craft,bomber)}
    fn fire_roster(&self)->Result<Vec<Identity>,f::Error>{for h in self.inner.services.scope{self.row(*h)?;}Ok(self.inner.services.scope.to_vec())}
    fn visible(&self,target:Identity,team:f64)->Result<bool,f::Error>{
        if !team.is_finite()||team<0.0||team.fract()!=0.0{return Err(f::Error::InvalidNumber);}let b=&self.inner.bodies[self.row(target)?];
        let combat=b.ship.as_ref().unwrap().combat.as_ref().unwrap();if combat.team as f64==team{return Ok(true);}
        combat.query.as_ref().ok_or(f::Error::HostFailure)?.visible.get(&(team as u32)).copied().ok_or(f::Error::HostFailure)
    }
    fn hostile(&self,craft:Identity,ordered:Option<Identity>)->Result<Option<Identity>,f::Error>{
        let own=f::Host::body_shared(self,craft)?;let mut eligible=Vec::new();for &h in self.inner.services.scope{let r=self.row(h)?;
            let s=self.inner.bodies[r].ship.as_ref().ok_or(f::Error::HostFailure)?;let c=s.combat.as_ref().ok_or(f::Error::HostFailure)?;let q=c.query.as_ref().ok_or(f::Error::HostFailure)?;
            if q.vast||s.flags&(ship_state::DEAD|ship_state::RETREATED)!=0||c.team as f64==own.team||!f::Host::visible(self,h,own.team)?{continue;}eligible.push(r);}
        // Source findHostile retains lock/current before nearest hull priority;
        // FlightWorld's hostile gate subsequently rejects phased/zero HP.
        if let Some(h)=ordered{if eligible.iter().any(|r|id(self.inner.bodies[*r].handle)==h){return Ok(Some(h));}}
        if let Some(h)=own.current_target{if eligible.iter().any(|r|id(self.inner.bodies[*r].handle)==h){return Ok(Some(h));}}
        let main=eligible.iter().any(|r|self.inner.bodies[*r].ship.as_ref().unwrap().combat.as_ref().unwrap().size!=0);
        let mut best=None;let mut distance=f64::INFINITY;for r in eligible{let b=&self.inner.bodies[r];if main&&b.ship.as_ref().unwrap().combat.as_ref().unwrap().size==0{continue;}
            let d=own.pos.sub(f::Vec2{x:b.motion[0],y:b.motion[1]}).len();if best.is_none()||d<distance{best=Some(id(b.handle));distance=d;}}Ok(best)
    }
    delegate!{
        fn template(&self,h:u32)->Result<f::Template,f::Error>;
        fn carrier_stats(&self,h:Identity)->Result<f::CarrierStats,f::Error>;
        fn sync_modules(&mut self,h:Identity)->Result<(),f::Error>;
        fn children(&self,h:Identity)->Result<Vec<Identity>,f::Error>;
        fn assembly(&self,h:Identity)->Result<Vec<Identity>,f::Error>;
        fn deployed(&self,h:Identity)->Result<Vec<Identity>,f::Error>;
        fn carrier_wings(&self,h:Identity)->Result<Vec<f::WingSpec>,f::Error>;
        fn formation_templates(&self,h:Identity)->Result<Vec<u32>,f::Error>;
        fn spawn(&mut self,spawn:f::Spawn)->Result<Identity,f::Error>;
        fn bind_craft(&mut self,craft:Identity,carrier:Identity,wing:&str)->Result<(),f::Error>;
        fn remove_craft(&mut self,craft:Identity,reason:f::Removal)->Result<(),f::Error>;
        fn recall_allowed(&self,carrier:Identity)->Result<bool,f::Error>;
        fn set_recall(&mut self,carrier:Identity,recall:bool)->Result<(),f::Error>;
        fn mounts(&self,craft:Identity)->Result<Vec<f::Mount>,f::Error>;
        fn projectiles(&self)->Result<Vec<f::Projectile>,f::Error>;
        fn order(&self,craft:Option<Identity>)->Result<Option<f::Order>,f::Error>;
        fn aim(&self,craft:Identity,mount:u32,generation:u32,target:f::Target)->Result<f::Aim,f::Error>;
        fn target_position(&self,target:f::Target)->Result<f::Vec2,f::Error>;
        fn shield_covers(&self,craft:Identity,target:Identity)->Result<bool,f::Error>;
        fn destruction_enabled(&self)->bool;
        fn destroy(&mut self,craft:Identity)->Result<(),f::Error>;
    }
}
impl Owned{
    pub fn admit_root(&mut self,bodies:&[Body],h:Identity)->Result<(),f::Error>{let r=row(bodies,h)?;
        if self.owner.ship(h)?.module.is_some()||bodies[r].ship.as_ref().and_then(|s|s.world.as_ref()).ok_or(f::Error::HostFailure)?.parent.is_some()||self.roots.contains(&h){return Err(f::Error::InvalidTopology);}
        self.roots.push(h);Ok(())}
    fn tree(&self,bodies:&[Body],h:Identity,out:&mut Vec<Identity>)->Result<(),f::Error>{if out.contains(&h){return Err(f::Error::InvalidTopology);}let r=row(bodies,h)?;let s=bodies[r].ship.as_ref().ok_or(f::Error::HostFailure)?;out.push(h);
        for &child in &s.world.as_ref().ok_or(f::Error::HostFailure)?.children{let c=id(child);if self.owner.ship(c)?.module.as_ref().is_none_or(|m|m.parent!=h){return Err(f::Error::InvalidTopology);}self.tree(bodies,c,out)?;}Ok(())}
    pub fn ordinary(&self,bodies:&[Body])->Result<Vec<Identity>,f::Error>{let mut out=Vec::new();for &h in &self.roots{let r=row(bodies,h)?;if bodies[r].ship.as_ref().ok_or(f::Error::HostFailure)?.flags&ship_state::RETREATED==0{self.tree(bodies,h,&mut out)?;}}
        Ok(out.into_iter().filter(|h|bodies[row(bodies,*h).unwrap()].ship.as_ref().unwrap().flags&ship_state::RETREATED==0).collect())}
    pub fn roster(&self,bodies:&[Body])->Result<Vec<Identity>,f::Error>{let mut out=self.ordinary(bodies)?;for &h in self.flights.fighters.iter().chain(&self.flights.bombers).chain(&self.drones){let r=row(bodies,h)?;
            if bodies[r].ship.as_ref().ok_or(f::Error::HostFailure)?.flags&ship_state::RETREATED==0{if out.contains(&h){return Err(f::Error::InvalidTopology);}out.push(h);}}Ok(out)}
    pub fn begin(&mut self,bodies:&[Body])->Result<(),f::Error>{if self.stage!=Stage::Closed||self.flights.pending_receipts()!=0{return Err(f::Error::WrongStage);}
        self.ordinary_roster=self.ordinary(bodies)?;self.initial_roster=self.roster(bodies)?;self.ordinary_missiles.clear();self.wing_missiles.clear();self.wing_roster.clear();self.queue.clear();self.records.clear();self.wings_collected=false;self.stage=Stage::Collect;Ok(())}
    pub fn begin_with_ordnance(&mut self,bodies:&[Body],ordnance:&Ordnance)->Result<(),f::Error>{let ordinary=missiles(ordnance,true)?;self.begin(bodies)?;self.ordinary_missiles=ordinary;Ok(())}
    pub fn enqueue_ordinary(&mut self,bodies:&[Body],craft:Identity,dt:f64,target:Option<Identity>)->Result<(),f::Error>{row(bodies,craft)?;if !self.ordinary_roster.contains(&craft){return Err(f::Error::WrongStage);}if let Some(h)=target{row(bodies,h)?;}
        enqueue(&mut self.queue,self.stage,&self.initial_roster,&self.ordinary_missiles,o::Step{craft,dt,target,permission:f::FirePermission::World})}
    /// Drone collection is after wings and uses the new actual source roster.
    pub fn enqueue_drone(&mut self,bodies:&[Body],craft:Identity,dt:f64,target:Option<Identity>)->Result<(),f::Error>{row(bodies,craft)?;if !self.wings_collected||!self.drones.contains(&craft){return Err(f::Error::WrongStage);}if let Some(h)=target{row(bodies,h)?;}
        let scope=self.roster(bodies)?;enqueue(&mut self.queue,self.stage,&scope,&self.wing_missiles,o::Step{craft,dt,target,permission:f::FirePermission::World})}
    pub fn enqueue_drone_with_ordnance(&mut self,bodies:&[Body],ordnance:&Ordnance,craft:Identity,dt:f64,target:Option<Identity>)->Result<(),f::Error>{
        row(bodies,craft)?;if !self.wings_collected||!self.drones.contains(&craft){return Err(f::Error::WrongStage);}if let Some(h)=target{row(bodies,h)?;}let scope=self.roster(bodies)?;let missiles=missiles(ordnance,false)?;
        enqueue(&mut self.queue,self.stage,&scope,&missiles,o::Step{craft,dt,target,permission:f::FirePermission::World})}
    fn with_host<A:Authority,R>(&mut self,c:&mut Context<A>,scope:&[Identity],op:impl FnOnce(&mut f::FlightWorld,&mut Host<A>)->Result<R,f::Error>)->Result<R,f::Error>{
        let first_record=self.records.len();
        let result={let missiles=missiles(c.ordnance,false)?;let mut service=Services{world:c.world,specs:c.specs,notices:c.notices,authority:c.authority,queue:&mut self.queue,drones:&mut self.drones,scope,missiles:&missiles,statics:&self.statics,stage:self.stage};
        let mut host=Host{inner:o::Host{bodies:c.bodies,owned:&mut self.owner,ordnance:c.ordnance,specs:c.specs,random:c.random,visual:c.visual,records:&mut self.records,services:&mut service},bodies:RefCell::new(BTreeMap::new()),rows:RefCell::new(None)};
        op(&mut self.flights,&mut host)?};
        for record in &self.records[first_record..]{c.world.visual.flight(record).map_err(|_|f::Error::HostFailure)?;}
        Ok(result)
    }
    pub fn construct<A:Authority>(&mut self,c:&mut Context<A>,template:&o::StaticShip,stable:String,at:[f64;2],facing:f64,player:bool,team:u32,manual:bool)->Result<Identity,f::Error>{
        if self.stage!=Stage::Closed&&self.stage!=Stage::Collect{return Err(f::Error::WrongStage);}self.with_host(c,&[],|_,h|h.inner.construct_static(template,stable,at,facing,player,team,manual))}
    pub fn init<A:Authority>(&mut self,c:&mut Context<A>,player:Identity,enemy:Option<Identity>,scenario:Option<(Vec<f::WingSpec>,Vec<f::WingSpec>)>)->Result<(),f::Error>{if self.stage!=Stage::Closed{return Err(f::Error::WrongStage);}let scope=self.roster(c.bodies)?;self.with_host(c,&scope,|f,h|f.init(h,player,enemy,scenario))}
    pub fn add_carrier<A:Authority>(&mut self,c:&mut Context<A>,carrier:Identity,scenario:Option<Vec<f::WingSpec>>)->Result<(),f::Error>{if self.stage!=Stage::Closed&&self.stage!=Stage::Collect{return Err(f::Error::WrongStage);}let scope=self.roster(c.bodies)?;self.with_host(c,&scope,|f,h|f.add_carrier(h,carrier,scenario))}
    pub fn collect_wings<A:Authority>(&mut self,c:&mut Context<A>,dt:f64,player:Identity,enemy:Identity)->Result<(),f::Error>{if self.stage!=Stage::Collect||self.wings_collected{return Err(f::Error::WrongStage);}
        let before=self.roster(c.bodies)?;self.with_host(c,&before,|f,h|f.update_decks(h,dt))?;self.wing_roster=self.roster(c.bodies)?;let scope=self.wing_roster.clone();
        self.wing_missiles=missiles(c.ordnance,false)?;self.with_host(c,&scope,|f,h|{f.update_fighters(h,dt,player,enemy)?;f.update_bombers(h,dt,player,enemy)})?;self.wings_collected=true;Ok(())}
    pub fn update_decks<A:Authority>(&mut self,c:&mut Context<A>,dt:f64)->Result<(),f::Error>{self.command_allowed()?;
        let scope=self.roster(c.bodies)?;self.with_host(c,&scope,|f,h|f.update_decks(h,dt))}
    pub fn transition(&mut self,next:Stage)->Result<(),f::Error>{let valid=matches!((self.stage,next),(Stage::Collect,Stage::State)|(Stage::State,Stage::Motion)|(Stage::Motion,Stage::WeaponState)|(Stage::WeaponState,Stage::FireQuery)|(Stage::FireQuery,Stage::FireCommit)|(Stage::FireCommit,Stage::Finish));
        if !valid{return Err(f::Error::WrongStage);}self.stage=next;Ok(())}
    /// Invoke after every queued actual Ship.finishStep has run. Receipts run
    /// in queue order; reserve returns are correctly skipped, not fabricated.
    pub fn finish<A:Authority>(&mut self,c:&mut Context<A>)->Result<(),f::Error>{if self.stage!=Stage::Finish{return Err(f::Error::WrongStage);}let scope=self.roster(c.bodies)?;let queue=self.queue.clone();
        self.with_host(c,&scope,|f,h|{for q in &queue{if f.has_receipt(q.step.craft){f.finish_ship(h,q.step.craft)?;}}if f.pending_receipts()!=0{return Err(f::Error::WrongStage);}Ok(())})?;self.stage=Stage::Closed;Ok(())}
    fn command_allowed(&self)->Result<(),f::Error>{if self.stage==Stage::Closed||self.stage==Stage::Collect{Ok(())}else{Err(f::Error::WrongStage)}}
    pub fn toggle_recall<A:Authority>(&mut self,c:&mut Context<A>,carrier:Identity)->Result<bool,f::Error>{self.command_allowed()?;let scope=self.roster(c.bodies)?;self.with_host(c,&scope,|f,h|f.toggle_recall(h,carrier))}
    pub fn reserve<A:Authority>(&mut self,c:&mut Context<A>,carrier:Identity)->Result<(),f::Error>{self.command_allowed()?;let scope=self.roster(c.bodies)?;self.with_host(c,&scope,|f,h|f.deploy_reserve(h,carrier))}
    pub fn recover<A:Authority>(&mut self,c:&mut Context<A>,carrier:Identity,craft:Identity)->Result<(),f::Error>{self.command_allowed()?;let scope=self.roster(c.bodies)?;self.with_host(c,&scope,|f,h|f.recover(h,carrier,craft))}
    pub fn detach<A:Authority>(&mut self,c:&mut Context<A>,carrier:Identity,craft:Identity)->Result<bool,f::Error>{self.command_allowed()?;let scope=self.roster(c.bodies)?;self.with_host(c,&scope,|f,h|f.detach(h,carrier,craft))}
    /// Source DroneSystem.update; detached wing craft are roster witnesses but
    /// receive no launcher update that the Web source never schedules.
    pub fn collect_drones<A:Authority>(&mut self,c:&mut Context<A>,dt:f64)->Result<(),f::Error>{
        if self.stage!=Stage::Collect||!self.wings_collected{return Err(f::Error::WrongStage);}let scope=self.roster(c.bodies)?;let mut drone=std::mem::take(&mut self.drone);
        let result=self.with_host(c,&scope,|_,h|drone.collect(h,dt));self.drone=drone;result?;
        let mut kept=Vec::new();for &h in &self.drones{let s=c.bodies[row(c.bodies,h)?].ship.as_ref().ok_or(f::Error::HostFailure)?;
            if s.flags&(ship_state::DEAD|ship_state::DOCKED)==0{kept.push(h);}}self.drones=kept;Ok(())
    }
    pub fn advance_drone_launcher<A:Authority>(&mut self,c:&mut Context<A>,carrier:Identity,system:u32,dt:f64)->Result<(),f::Error>{
        self.command_allowed()?;let scope=self.roster(c.bodies)?;let mut drone=std::mem::take(&mut self.drone);
        let result=self.with_host(c,&scope,|_,h|drone.advance(h,carrier,system,dt));self.drone=drone;result
    }
    /// Consumes precisely this system's source pending activation counts. Call
    /// instead of generic system dispatch for an admitted launcher at status.
    pub fn dispatch_drone<A:Authority>(&mut self,c:&mut Context<A>,carrier:Identity,system:u32,dt:f64)->Result<(),f::Error>{
        self.command_allowed()?;let r=row(c.bodies,carrier)?;let s=c.bodies[r].ship.as_mut().ok_or(f::Error::HostFailure)?;
        let life=s.systems.iter_mut().find(|s|s.id==system).ok_or(f::Error::UnknownTemplate)?;
        let starts=life.pending_activation;life.pending_activation=0.0;life.pending_active=0.0;
        if c.specs.get(&life.spec).ok_or(f::Error::UnknownTemplate)?.flags&crate::lifecycle::AVAILABLE==0{return Ok(());}
        if !starts.is_finite()||starts<0.0||starts.fract()!=0.0||starts>crate::combat_visuals::LIMIT as f64{return Err(f::Error::InvalidNumber);}
        for _ in 0..starts as usize{self.drone.activate(carrier,system)?;}self.advance_drone_launcher(c,carrier,system,dt)
    }
    pub fn drone_ai<A:Authority>(&mut self,c:&mut Context<A>,carrier:Identity,system:u32,distance:f64,withdrawing:bool)->Result<(),f::Error>{
        self.command_allowed()?;let scope=self.roster(c.bodies)?;let mut drone=std::mem::take(&mut self.drone);
        let result=self.with_host(c,&scope,|_,h|drone.ai(h,carrier,system,distance,withdrawing));self.drone=drone;result
    }
    pub fn reset_drone<A:Authority>(&mut self,c:&mut Context<A>,carrier:Identity,system:u32)->Result<(),f::Error>{
        self.command_allowed()?;let scope=self.roster(c.bodies)?;let mut drone=std::mem::take(&mut self.drone);
        let result=self.with_host(c,&scope,|_,h|drone.reset(h,carrier,system));self.drone=drone;result
    }
}
impl<A:Authority> crate::drone_runtime::Host for Host<'_,A>{
    fn drone_read(&self,h:Identity)->Result<crate::drone_runtime::Read,f::Error>{
        use f::Host;let body=self.body(h)?;let r=self.row(h)?;let b=&self.inner.bodies[r];let s=b.ship.as_ref().ok_or(f::Error::HostFailure)?;
        let combat=s.combat.as_ref().ok_or(f::Error::HostFailure)?;let shield=s.shield.as_ref().ok_or(f::Error::HostFailure)?;
        let defense=combat.readiness.as_ref().ok_or(f::Error::HostFailure)?.state.effects(combat.readiness.as_ref().unwrap().parameters).defense_disabled;
        Ok(crate::drone_runtime::Read{body,fighter:combat.size==0,acceleration:s.engines.as_ref().ok_or(f::Error::HostFailure)?.motion[17],
            range:self.mounts(h)?.iter().fold(0.0_f64,|n,m|n.max(m.range)),center:{let p=crate::contact::shield_center(shield,&b.motion);f::Vec2{x:p[0],y:p[1]}},
            shield_radius:shield.data[2],shield_active:shield.active(),can_shield:shield.kind()!=crate::shield::NONE&&s.control_flags()&1==0&&!defense&&!s.flux.overloaded&&!s.flux.venting&&s.flags&(ship_state::DEAD|ship_state::RETREATING)==0})
    }
    fn stock(&self,carrier:Identity,system:u32)->Result<crate::drone_runtime::Stock,f::Error>{let s=self.inner.bodies[self.row(carrier)?].ship.as_ref().ok_or(f::Error::HostFailure)?;
        let life=s.systems.iter().find(|s|s.id==system).ok_or(f::Error::UnknownTemplate)?;let spec=self.inner.specs.get(&life.spec).ok_or(f::Error::UnknownTemplate)?;
        Ok(crate::drone_runtime::Stock{maximum:spec.max_charges,charges:life.charges,disabled:life.disabled,available:spec.flags&crate::lifecycle::AVAILABLE!=0})
    }
    fn stock_set(&mut self,carrier:Identity,system:u32,charges:f64)->Result<(),f::Error>{if !charges.is_finite(){return Err(f::Error::InvalidNumber);}let r=self.row(carrier)?;let s=self.inner.bodies[r].ship.as_mut().ok_or(f::Error::HostFailure)?;
        s.systems.iter_mut().find(|s|s.id==system).ok_or(f::Error::UnknownTemplate)?.charges=charges;Ok(())}
    fn drone_spawn(&mut self,carrier:Identity,config:&crate::drone_runtime::Config,slot:&crate::drone_runtime::Slot)->Result<Identity,f::Error>{
        use f::Host;let b=self.body_shared(carrier)?;let cr=self.inner.bodies[self.row(carrier)?].ship.as_ref().and_then(|s|s.combat.as_ref()).and_then(|c|c.readiness.as_ref()).ok_or(f::Error::HostFailure)?.state.current_cr;
        let stable=self.inner.next_id(&format!("{}_drone",b.id))?;let facing=b.facing+slot.angle*std::f64::consts::PI/180.0;let pos=b.pos.add(slot.position.rotate(b.facing));
        let mut template=self.inner.services.statics.get(&config.template).ok_or(f::Error::UnknownTemplate)?.clone();
        let admission=template.spawn_admission.as_mut().ok_or(f::Error::Unsupported)?;admission.aux.drone=true;admission.ai.meta.system_drone=true;
        let craft=self.inner.construct_static(&template,stable,[pos.x,pos.y],facing,b.player,b.team as u32,false)?;
        let r=self.row(craft)?;let body=&mut self.inner.bodies[r];body.motion[2]=b.vel.x+facing.cos()*config.speed;body.motion[3]=b.vel.y+facing.sin()*config.speed;
        body.ship.as_mut().and_then(|s|s.combat.as_mut()).and_then(|c|c.readiness.as_mut()).ok_or(f::Error::HostFailure)?.state.current_cr=cr;
        if self.inner.services.drones.contains(&craft){return Err(f::Error::InvalidTopology);}self.inner.services.drones.push(craft);
        let v=&mut self.inner.services.world.visual;if v.audio.len()>=crate::combat_visuals::LIMIT{return Err(f::Error::HostFailure);}
        v.emit_audio(crate::combat_visuals::Audio::Play{key:"drone_launch".into(),volume:1.0,rate:1.0,position:Some([pos.x,pos.y]),listener:Some([b.pos.x,b.pos.y]),maximum:Some(2800.0)}).map_err(|_|f::Error::HostFailure)?;Ok(craft)
    }
    fn drone_missiles(&self)->Result<Vec<crate::drone_runtime::Missile>,f::Error>{let mut out=Vec::new();for h in self.inner.services.missiles{
        let p=self.inner.ordnance.projectiles.iter().find(|p|p.serial==h.handle as f64&&h.generation==1).ok_or(f::Error::StaleIdentity)?;
        out.push(crate::drone_runtime::Missile{identity:*h,team:p.team,player:p.player,rocket:crate::weapon_world::rocket(p),flare:p.guidance.as_ref().is_some_and(|g|g.flare),
            hp:p.guidance.as_ref().and_then(|g|g.hitpoints).or(p.hitpoints).unwrap_or(1.0),disarmed:p.disarmed,remaining:p.flight.unwrap_or(p.range),pos:f::Vec2{x:p.pos[0],y:p.pos[1]},radius:p.delivery.radius});}Ok(out)
    }
    fn orphan(&mut self,h:Identity)->Result<(),f::Error>{let r=self.row(h)?;self.inner.bodies[r].ship.as_mut().and_then(|s|s.armor.as_mut()).ok_or(f::Error::HostFailure)?.data[14]=0.0;Ok(())}
    fn dock(&mut self,h:Identity)->Result<(),f::Error>{let r=self.row(h)?;self.inner.bodies[r].ship.as_mut().ok_or(f::Error::HostFailure)?.flags|=ship_state::DOCKED;Ok(())}
    fn current_target(&mut self,h:Identity,target:Option<Identity>)->Result<(),f::Error>{if let Some(t)=target{self.row(t)?;}
        let r=self.row(h)?;self.inner.bodies[r].ship.as_mut().and_then(|s|s.combat.as_mut()).and_then(|c|c.query.as_mut()).ok_or(f::Error::HostFailure)?.target=target.map(handle);Ok(())}
    fn autofire(&mut self,h:Identity,on:bool)->Result<(),f::Error>{let r=self.row(h)?;let s=self.inner.bodies[r].ship.as_mut().ok_or(f::Error::HostFailure)?;
        for group in &mut s.weapons.as_mut().ok_or(f::Error::HostFailure)?.groups{group.data[2]=on as u32 as f64;}Ok(())}
    fn sensor(&mut self,h:Identity,count:f64)->Result<(),f::Error>{const KEY:u32=0xfffb0001;if !count.is_finite(){return Err(f::Error::InvalidNumber);}let r=self.row(h)?;let runtime=&mut self.inner.bodies[r].ship.as_mut().and_then(|s|s.world.as_mut()).ok_or(f::Error::HostFailure)?.runtime;
        if count>0.0{let mut m=crate::ship_effects::Modifiers::default();m.set(crate::ship_effects::SIGHT_PERCENT,25.0*count);m.weapon(crate::ship_effects::BALLISTIC,crate::ship_effects::RANGE,15.0*count);m.weapon(crate::ship_effects::ENERGY,crate::ship_effects::RANGE,15.0*count);
            if let Some((_,old))=runtime.iter_mut().find(|(key,_)|*key==KEY){*old=m;}else{runtime.push((KEY,m));}}
        else{runtime.retain(|(key,_)|*key!=KEY);}Ok(())}
}
