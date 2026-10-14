//! Persistent CapitalShipAI owner. Source, ordering and integration limits:
//! docs/rust-combat-ai-owner-plan-2026-10-08.md.
//! All Host methods run synchronously in Rust against the same resident battle.
use crate::{defense_ai as defense, navigation_ai as nav, tactical_ai as tactical};
use tactical::{Identity, OrderKind, Profile, Role, Task};
use tactical::body_flag as B;

#[derive(Clone,Debug,PartialEq)]
pub struct Order { pub id:String, pub kind:OrderKind, pub target:Option<Identity>, pub point:Option<[f64;2]>, pub issued_time:f64 }
#[derive(Clone,Debug,Default,PartialEq)]
pub struct Attachment { pub parent:Option<Identity>, pub slot:Option<String>, pub x:Option<f64>, pub y:Option<f64>, pub angle_deg:Option<f64> }
#[derive(Clone,Debug,Default)]
pub struct AIInput {
    pub identity:Identity, pub tactical_present:bool, pub attached_motion:bool,
    pub attachment:Attachment, pub native_forecast:bool, pub do_not_back_off:f64,
    pub system_mode:Option<String>, pub system_active:bool, pub forces_autofire:bool,
    pub engine_state:String, pub aim:[f64;2],
}
#[derive(Clone,Copy,Debug)]
pub struct Settings { pub multirate:bool, pub compact_forecast_eligible:bool, pub weapon_frame_eligible:bool, pub tactical_interval:f64, pub forecast_interval:f64 }
impl Default for Settings { fn default()->Self { Self {multirate:false,compact_forecast_eligible:false,weapon_frame_eligible:false,tactical_interval:0.05,forecast_interval:0.05} } }
#[derive(Clone,Copy)]
pub struct Observation<'a> {
    pub tactical:tactical::World<'a>, pub navigation:nav::World<'a>, pub defense:defense::World<'a>,
    pub ai:&'a[AIInput], pub assignments:&'a[tactical::Assignment], pub policy:&'a tactical::Policy, pub settings:Settings,
}
/// An immutable planning lease. Construction checks the complete observation;
/// no controls or system writes can occur while its borrowed cache is live.
pub(crate) struct PlanningObservation<'a>{observation:Observation<'a>}
impl<'a> PlanningObservation<'a>{
    pub(crate) fn new(observation:Observation<'a>)->Result<Self,Error>{observation.validate()?;Ok(Self{observation})}
    fn with_settings(&self,settings:Settings)->Result<Observation<'a>,Error>{
        if ![settings.tactical_interval,settings.forecast_interval].iter().all(|n|n.is_finite()&&*n>=0.0){return Err(Error::InvalidTopology);}
        Ok(Observation{settings,..self.observation})
    }
    pub(crate) fn sample(&self,memory:&mut OwnedAI,dt:f64,order:Option<&Order>,settings:Settings)->Result<Option<f64>,Error>{
        memory.sample_decision_inner(dt,order,&self.with_settings(settings)?)
    }
    pub(crate) fn plan(&self,memory:&mut OwnedAI,dt:f64,order:Option<&Order>,settings:Settings,scratch:&mut Scratch)->Result<Intent,Error>{
        memory.plan_inner(dt,order,&self.with_settings(settings)?,scratch)
    }
}
#[derive(Clone,Copy,Debug,PartialEq,Eq)]
pub enum Error { InvalidNumber,InvalidIdentity,InvalidTopology,StaleIdentity,FighterOwner,StaleIntent,WrongStage,UnsupportedSystem,HostFailure }
impl From<tactical::Error> for Error { fn from(e:tactical::Error)->Self { match e { tactical::Error::InvalidNumber=>Self::InvalidNumber,tactical::Error::StaleIdentity=>Self::StaleIdentity,_=>Self::InvalidTopology } } }
impl From<nav::Error> for Error { fn from(e:nav::Error)->Self { match e { nav::Error::InvalidNumber=>Self::InvalidNumber,nav::Error::StaleTarget=>Self::StaleIdentity,_=>Self::InvalidTopology } } }
impl From<defense::Error> for Error { fn from(e:defense::Error)->Self { match e { defense::Error::InvalidNumber=>Self::InvalidNumber,defense::Error::StaleIdentity=>Self::StaleIdentity,_=>Self::InvalidTopology } } }
fn ni(id:Identity)->nav::Identity { nav::Identity {handle:id.handle,generation:id.generation} }
fn di(id:Identity)->defense::Identity { defense::Identity {handle:id.handle,generation:id.generation} }
fn assignment(a:&tactical::Assignment)->nav::Assignment { nav::Assignment {role:match a.role {Role::Line=>nav::Role::Line,Role::Brawler=>nav::Role::Brawler,Role::Artillery=>nav::Role::Artillery,Role::Skirmisher=>nav::Role::Skirmisher,Role::Carrier=>nav::Role::Carrier,Role::Unarmed=>nav::Role::Unarmed},approach_bearing:a.approach_bearing} }
impl Observation<'_> {
    pub fn validate(&self)->Result<(),Error> {
        self.tactical.validate()?;self.defense.validate()?;self.policy.validate()?;
        if ![self.settings.tactical_interval,self.settings.forecast_interval].iter().all(|n|n.is_finite()&&*n>=0.0)
            ||self.ai.len()!=self.tactical.bodies.len()||self.defense.bodies.len()!=self.ai.len(){return Err(Error::InvalidTopology);}
        for (r,b) in self.tactical.bodies.iter().enumerate() {
            let a=&self.ai[r];
            if a.identity!=b.identity||self.navigation.find(ni(b.identity))!=Some(r)||self.defense.find(di(b.identity))!=Some(r){return Err(Error::InvalidTopology);}
            if ![a.do_not_back_off,a.aim[0],a.aim[1]].iter().all(|n|n.is_finite())
                ||[a.attachment.x,a.attachment.y,a.attachment.angle_deg].iter().flatten().any(|n|!n.is_finite()){return Err(Error::InvalidNumber);}
            if a.attachment.parent.is_some_and(|id|self.tactical.find(id).is_none()){return Err(Error::StaleIdentity);}
            if a.attached_motion&&(a.attachment.parent.is_none()||a.attachment.slot.is_none()){return Err(Error::InvalidTopology);}
        }
        for (index,a) in self.assignments.iter().enumerate() {
            if self.tactical.find(a.owner).is_none()||[a.target,a.anchor].iter().flatten().any(|&id|self.tactical.find(id).is_none())
                ||self.assignments[..index].iter().any(|p|p.owner==a.owner){return Err(Error::StaleIdentity);}
        }
        Ok(())
    }
    fn row(&self,id:Identity)->Result<usize,Error> { self.tactical.find(id).ok_or(Error::StaleIdentity) }
    fn stopped(&self,r:usize)->bool { self.tactical.bodies[r].flags&(B::DEAD|B::RETREATED|B::DOCKED)!=0||self.tactical.bodies[r].retreating }
    fn valid_target(&self,r:usize,target:Option<Identity>)->Option<usize> { target.and_then(|id|self.tactical.find(id)).filter(|&i|{let b=&self.tactical.bodies[i];!b.vast&&b.flags&(B::DEAD|B::RETREATED|B::DOCKED)==0&&self.tactical.visible(i,r)&&b.team!=self.tactical.bodies[r].team}) }
    fn horizons(&self,r:usize)->(f64,f64) { let b=&self.defense.bodies[r];let phase=b.shield_type==3;let window=1.0+if phase{b.phase_up_duration}else{0.0};let recovery=2.0+if phase{b.phase_down_duration+b.phase_cooldown_duration}else{b.shield_unfold_duration};(window.max(b.vent_time+recovery),window) }
}
#[derive(Clone,Debug,PartialEq)]
struct StateKey { attachment:Attachment,team:f64,do_not_back_off:f64,mode:Option<String>,active:bool,vent:bool,overload:bool,engine:String }
#[derive(Clone,Copy,Debug,PartialEq)]
struct AssignmentKey { role:Role,task:Task,target:Option<Identity>,anchor:Option<Identity>,no_approach:bool }
#[derive(Clone,Debug,PartialEq)]
struct IntentKey { role:Option<Role>,regroup:Option<Identity>,withdrawing:bool,escort:Option<Identity>,avoiding:bool,point:Option<[f64;2]>,mode:Option<String>,active:bool,vent:bool,overload:bool,engine:String }
#[derive(Clone,Debug,PartialEq)]
struct DecisionKey {mode:Option<String>,vent:bool,overload:bool}
#[derive(Clone,Copy,Debug,PartialEq,Eq)]
enum Stage { Closed,Planned,Controls }
#[derive(Clone,Copy,Debug,Default)]
pub struct PositionMemory {pub reason:Option<tactical::PositionReason>,pub score_gain:Option<f64>,pub clear_fire:Option<f64>}
#[derive(Clone,Debug)]
pub struct OwnedAI {
    pub owner:Identity,pub target_ship:Option<Identity>,pub defense:defense::Controller,pub forecast:defense::Forecast,
    pub withdrawing:bool,pub attached_motion_last:bool,pub tactical_remaining:f64,pub multirate_planning_last:bool,pub multirate_remaining:f64,
    pub tactical_target:Option<Identity>,pub profile:Profile,pub velocity:nav::Velocity,pub facing:f64,pub yielding:bool,pub positioning:PositionMemory,
    pub decision_remaining:f64,pub decision_elapsed:f64,pub decision_target:Option<Identity>,pub tactical_phase:u8,pub multirate_phase:u8,
    tactical_order:Option<Order>,intent_key:Option<IntentKey>,multirate_assignment:Option<AssignmentKey>,multirate_state:Option<StateKey>,
    decision_order:Option<Order>,decision_state:Option<DecisionKey>,sequence:u64,stage:Stage,
}
#[derive(Default)]
pub struct Scratch { pub navigation:nav::Scratch,pub defense:defense::Scratch,pub positioning:tactical::PositionScratch }
#[derive(Clone,Debug)]
struct Effects {
    target:Option<Identity>,threat:defense::Assessment,profile:Profile,assignment:Option<tactical::Assignment>,facing:f64,
    allow_offensive_maneuver:bool,regroup:bool,disengaging:bool,withdrawing:bool,escort:bool,avoiding:bool,defending:bool,waypoint:bool,
    avoiding_collision:bool,yielding:bool,attached_motion:bool,
}
#[derive(Clone,Debug)]
pub struct Intent {owner:Identity,sequence:u64,pub stopped:bool,pub target:Option<Identity>,pub aim:[f64;2],pub hold_offensive_fire:bool,pub movement:nav::Controls,pub roster:Vec<Identity>,effects:Option<Effects>}
#[derive(Clone,Copy,Debug,PartialEq,Eq)]
pub enum Mode { Idle,Engage,Withdraw,Escort,Avoid,Defend,Waypoint }
#[derive(Clone,Debug)]
pub struct Diagnostics {pub role:Option<Role>,pub task:Option<Task>,pub target_score:Option<f64>,pub pressure_ratio:Option<f64>,pub assigned_power:Option<f64>,pub mode:Mode,pub profile:Profile,pub facing:f64,pub positioning:PositionMemory,pub attached_motion:bool,pub avoiding_collision:bool,pub yielding:bool,pub imminent_damage:f64,pub imminent_shield_flux:f64,pub earliest:Option<f64>,pub defense:defense::DefenseResult}

impl OwnedAI {
    pub fn new(owner:Identity,id:&str,target:Option<Identity>)->Result<Self,Error> {
        if owner.handle==0||owner.generation==0||id.is_empty(){return Err(Error::InvalidIdentity);}
        let mut hash=2166136261u32;for unit in id.encode_utf16(){hash=(hash^unit as u32).wrapping_mul(16777619);}
        Ok(Self {owner,target_ship:target,defense:defense::Controller::default(),forecast:defense::Forecast::default(),withdrawing:false,attached_motion_last:false,
            tactical_remaining:-1.0,multirate_planning_last:false,multirate_remaining:-1.0,tactical_target:None,profile:Profile::default(),velocity:nav::Velocity::default(),facing:0.0,yielding:false,positioning:PositionMemory::default(),
            decision_remaining:-1.0,decision_elapsed:0.0,decision_target:None,tactical_phase:(hash%3)as u8,multirate_phase:(hash%6)as u8,
            tactical_order:None,intent_key:None,multirate_assignment:None,multirate_state:None,decision_order:None,decision_state:None,sequence:0,stage:Stage::Closed})
    }
    /// Caller enables sampling only for the original admitted whole-decision profile.
    /// None means held controls; physical simulation must still run its normal tick.
    pub fn sample_decision(&mut self,dt:f64,order:Option<&Order>,v:&Observation<'_>)->Result<Option<f64>,Error> {
        v.validate()?;self.sample_decision_inner(dt,order,v)
    }
    fn sample_decision_inner(&mut self,dt:f64,order:Option<&Order>,v:&Observation<'_>)->Result<Option<f64>,Error> {
        let r=v.row(self.owner)?;let b=&v.tactical.bodies[r];let a=&v.ai[r];
        if !(dt>0.0)||!dt.is_finite()||b.flags&B::MANUAL!=0||!a.tactical_present||v.stopped(r){self.decision_remaining=-1.0;self.decision_elapsed=0.0;return Ok(Some(dt));}
        let state=DecisionKey {mode:a.system_mode.clone(),vent:b.flags&B::VENTING!=0,overload:b.flags&B::OVERLOADED!=0};
        let invalid=b.current_target.is_some()&&v.valid_target(r,b.current_target).is_none();let first=self.decision_remaining<0.0;
        self.decision_elapsed+=dt;self.decision_remaining-=dt;let scheduled=first||self.decision_remaining<=1e-9;
        // JS % keeps the dividend's sign, as does Rust %.
        if scheduled{self.decision_remaining=if first{(self.tactical_phase as f64+1.0)/60.0}else{0.05+(self.decision_remaining%0.05).min(0.0)};}
        if !scheduled&&self.decision_order.as_ref()==order&&self.decision_state.as_ref()==Some(&state)&&self.decision_target==b.current_target&&!invalid&&!self.attached_motion_last{return Ok(None);}
        self.decision_order=order.cloned();self.decision_state=Some(state);self.decision_target=b.current_target;let elapsed=self.decision_elapsed;self.decision_elapsed=0.0;Ok(Some(elapsed))
    }
    fn reset_clocks(&mut self){self.tactical_remaining=-1.0;self.multirate_remaining=-1.0;self.forecast.remaining=-1.0;}
    fn update_withdrawal(&mut self,b:&tactical::Body,a:&AIInput,target:Option<Identity>,profile:Profile,assigned:Option<tactical::Assignment>){
        if b.flux>=0.9||profile.weapons==0&&assigned.is_none_or(|p|p.role!=Role::Carrier){self.withdrawing=target.is_some();}else if b.flux<=0.65{self.withdrawing=false;}
        if a.do_not_back_off!=0.0&&b.flags&B::VENTING==0{self.withdrawing=false;}if a.system_mode.as_deref()==Some("ASSAULT"){self.withdrawing=false;}if a.system_mode.as_deref()==Some("EXTRACT"){self.withdrawing=true;}
    }
    fn intent(&mut self,v:&Observation<'_>,stopped:bool,target:Option<Identity>,aim:[f64;2],hold:bool,movement:nav::Controls,effects:Option<Effects>)->Result<Intent,Error>{
        self.sequence=self.sequence.checked_add(1).ok_or(Error::WrongStage)?;self.stage=Stage::Planned;
        Ok(Intent {owner:self.owner,sequence:self.sequence,stopped,target,aim,hold_offensive_fire:hold,movement,roster:v.tactical.bodies.iter().map(|b|b.identity).collect(),effects})
    }
    pub fn plan(&mut self,dt:f64,order:Option<&Order>,v:&Observation<'_>,scratch:&mut Scratch)->Result<Intent,Error>{
        if !dt.is_finite()||dt<0.0||order.is_some_and(|o|!o.issued_time.is_finite()||o.point.is_some_and(|p|p.iter().any(|n|!n.is_finite()))){return Err(Error::InvalidNumber);}
        v.validate()?;self.plan_inner(dt,order,v,scratch)
    }
    fn plan_inner(&mut self,dt:f64,order:Option<&Order>,v:&Observation<'_>,scratch:&mut Scratch)->Result<Intent,Error>{
        if !dt.is_finite()||dt<0.0||order.is_some_and(|o|!o.issued_time.is_finite()||o.point.is_some_and(|p|p.iter().any(|n|!n.is_finite()))){return Err(Error::InvalidNumber);}
        let r=v.row(self.owner)?;let b=&v.tactical.bodies[r];let a=&v.ai[r];let multirate=v.settings.multirate;
        if b.flags&B::FIGHTER!=0{return Err(Error::FighterOwner);}
        if multirate!=self.multirate_planning_last{self.multirate_planning_last=multirate;self.reset_clocks();self.multirate_assignment=None;self.multirate_state=None;}
        if b.flags&B::MANUAL!=0||!a.tactical_present{self.defense.reset();self.withdrawing=false;self.reset_clocks();}
        if v.stopped(r){self.reset_clocks();return self.intent(v,true,None,a.aim,false,nav::Controls::default(),None);}
        let attached=a.attached_motion;let motion_changed=attached!=self.attached_motion_last;self.attached_motion_last=attached;
        let ordered=order.filter(|o|matches!(o.kind,OrderKind::Engage|OrderKind::Avoid)).and_then(|o|o.target).filter(|&id|v.tactical.find(id).is_some());
        let preselection=tactical::hostile_at_barrier(&v.tactical,self.owner,ordered)?;if preselection.is_some(){self.target_ship=preselection;}
        let assigned=v.assignments.iter().find(|a|a.owner==self.owner).copied();
        let scheduled=if multirate{cadence(&mut self.multirate_remaining,dt,0.1,self.multirate_phase,6)}else{cadence(&mut self.tactical_remaining,dt,v.settings.tactical_interval,self.tactical_phase,3)};
        let mut target=b.current_target;let mut decide=scheduled||self.tactical_order.as_ref()!=order||target!=self.tactical_target||target.is_some()&&v.valid_target(r,target).is_none();self.tactical_order=order.cloned();
        if multirate{
            let key=assigned.map(|a|AssignmentKey {role:a.role,task:a.task,target:a.target,anchor:a.anchor,no_approach:a.approach_bearing.is_none()});
            let state=StateKey {attachment:a.attachment.clone(),team:b.team,do_not_back_off:a.do_not_back_off,mode:a.system_mode.clone(),active:a.system_active,vent:b.flags&B::VENTING!=0,overload:b.flags&B::OVERLOADED!=0,engine:a.engine_state.clone()};
            decide|=motion_changed||key!=self.multirate_assignment||self.multirate_state.as_ref()!=Some(&state);self.multirate_assignment=key;self.multirate_state=Some(state);
        }
        if decide{target=v.valid_target(r,ordered).map(|i|v.tactical.bodies[i].identity).or_else(||v.valid_target(r,assigned.and_then(|a|a.target)).map(|i|v.tactical.bodies[i].identity));
            if target.is_none()&&assigned.is_none(){target=v.valid_target(r,preselection.or(self.target_ship)).map(|i|v.tactical.bodies[i].identity);}self.tactical_target=target;}
        let (horizon,window)=v.horizons(r);let step=self.forecast.begin(dt,horizon,window,v.ai.len(),v.settings.compact_forecast_eligible,a.native_forecast,v.settings.forecast_interval)?;
        let mut threat=defense::Assessment::default();defense::assess_into_at_barrier(&v.defense,di(self.owner),horizon,window,step.weapon_horizon,v.settings.weapon_frame_eligible,&mut threat,&mut scratch.defense)?;
        self.forecast.finish(step,&mut threat,window,v.ai.len(),self.tactical_phase,v.settings.forecast_interval)?;self.defense.observe(dt,&threat)?;
        if decide{self.profile=tactical::profile_at_barrier(&v.tactical,self.owner,target,assigned.as_ref(),v.policy)?;}let mut profile=self.profile;self.update_withdrawal(b,a,target,profile,assigned);
        let order=if matches!(a.system_mode.as_deref(),Some("ASSAULT"|"EXTRACT")){None}else{order};
        let mut regroup=if order.is_none()&&assigned.is_some_and(|p|p.task==Task::Regroup)&&a.do_not_back_off==0.0&&!matches!(a.system_mode.as_deref(),Some("ASSAULT"|"EXTRACT")){assigned.and_then(|p|p.anchor)}else{None};
        regroup=regroup.filter(|&id|v.tactical.find(id).is_some_and(|i|{let t=&v.tactical.bodies[i];t.flags&(B::DEAD|B::RETREATED)==0&&t.team==b.team}));
        let disengaging=order.is_none()&&assigned.is_some_and(|p|p.task==Task::Disengage)&&a.do_not_back_off==0.0&&!matches!(a.system_mode.as_deref(),Some("ASSAULT"|"EXTRACT"));
        let mut withdrawing=self.withdrawing||disengaging;let mut hold=self.withdrawing&&b.flux>0.65&&!a.forces_autofire;
        let escort=order.filter(|o|o.kind==OrderKind::Escort).and_then(|o|o.target).filter(|&id|id!=self.owner&&v.tactical.find(id).is_some_and(|i|{let t=&v.tactical.bodies[i];t.flags&B::DEAD==0&&t.team==b.team}));
        let defending=order.is_some_and(|o|o.kind==OrderKind::Defend);let avoiding=order.is_some_and(|o|o.kind==OrderKind::Avoid);let waypoint=order.filter(|o|matches!(o.kind,OrderKind::Defend|OrderKind::Waypoint)).and_then(|o|o.point);
        let make_key=|withdrawing|IntentKey {role:assigned.map(|p|p.role),regroup,withdrawing,escort,avoiding,point:waypoint,mode:a.system_mode.clone(),active:a.system_active,vent:b.flags&B::VENTING!=0,overload:b.flags&B::OVERLOADED!=0,engine:a.engine_state.clone()};
        let mut intent_key=make_key(withdrawing);let intent_changed=self.intent_key.as_ref()!=Some(&intent_key);
        if multirate&&intent_changed&&!decide{self.profile=tactical::profile_at_barrier(&v.tactical,self.owner,target,assigned.as_ref(),v.policy)?;profile=self.profile;self.update_withdrawal(b,a,target,profile,assigned);withdrawing=self.withdrawing||disengaging;hold=self.withdrawing&&b.flux>0.65&&!a.forces_autofire;intent_key=make_key(withdrawing);}
        decide|=intent_changed;self.intent_key=Some(intent_key);let t=target.and_then(|id|v.tactical.find(id));
        if attached{self.velocity=nav::Velocity::default();self.facing=b.facing;self.yielding=false;self.positioning=PositionMemory::default();}
        else if decide||motion_changed{
            let mut facing=b.facing;let target_facing=||{let target=&v.tactical.bodies[t.unwrap()];(target.y-b.y).atan2(target.x-b.x)-profile.relative_bearing};let mut positioning=None;
            let desired=if let Some(anchor)=regroup{let desired=nav::regroup_velocity(&v.navigation,r,v.row(anchor)?,t)?;if t.is_some(){facing=target_facing();}desired}
            else if let Some(escort)=escort{let i=v.row(escort)?;let e=&v.tactical.bodies[i];let distance=b.radius+e.radius+220.0;facing=if t.is_some(){target_facing()}else{e.facing};nav::position_velocity(&v.navigation,r,e.x+-e.facing.cos()*distance,e.y+-e.facing.sin()*distance,nav::Velocity{x:e.vx,y:e.vy},120.0)?}
            else if avoiding&&t.is_some(){let target=&v.tactical.bodies[t.unwrap()];let(mut x,mut y)=(b.x-target.x,b.y-target.y);if nav::length(x,y)<1.0{x=-1.0;y=0.0;}let k=b.max_speed/nav::length(x,y);facing=target_facing();nav::Velocity{x:x*k,y:y*k}}
            else if let Some([x,y])=waypoint{if defending&&t.is_some(){facing=target_facing();}else if nav::length(x-b.x,y-b.y)>8.0{facing=(y-b.y).atan2(x-b.x);}nav::position_velocity(&v.navigation,r,x,y,nav::Velocity::default(),8.0)?}
            else if let Some(t)=t{facing=target_facing();let mut desired=nav::approach_velocity(&v.navigation,r,t,profile.range,withdrawing,if order.is_some(){None}else{assigned.as_ref().map(assignment)})?;
                if order.is_none()&&!withdrawing&&assigned.is_none_or(|p|p.role!=Role::Carrier)&&a.system_mode.is_none(){let p=tactical::position_at_barrier(&v.tactical,self.owner,target.unwrap(),tactical::Velocity{x:desired.x,y:desired.y},profile,v.assignments,&mut scratch.positioning)?;desired=nav::Velocity{x:p.velocity.x,y:p.velocity.y};positioning=Some(p);}desired}
            else{if nav::length(b.x,b.y)>8.0{facing=(-b.y).atan2(-b.x);}nav::position_velocity(&v.navigation,r,0.0,0.0,nav::Velocity::default(),8.0)?};
            let cooperation=if waypoint.is_some()||escort.is_some()||avoiding||withdrawing||regroup.is_some()||positioning.is_some_and(|p|p.adjusted){nav::Yield{velocity:desired,..nav::Yield::default()}}else{nav::yield_fire_lane_assembly(&v.navigation,r,desired)?};
            self.velocity=cooperation.velocity;self.facing=facing;self.yielding=cooperation.yielding;self.positioning=positioning.map_or(PositionMemory::default(),|p|PositionMemory{reason:Some(p.reason),score_gain:Some(p.score_gain),clear_fire:Some(p.clear_fire)});
        }
        let avoidance=if attached{nav::Avoidance{velocity:self.velocity,..nav::Avoidance::default()}}else{nav::avoid_collisions(&v.navigation,r,self.velocity,&mut scratch.navigation)?};
        let movement=if attached{nav::Controls::default()}else{nav::steering(&v.navigation,r,avoidance.velocity,self.facing)?};
        let aim=target.and_then(|id|v.tactical.find(id)).map_or(a.aim,|i|[v.tactical.bodies[i].x,v.tactical.bodies[i].y]);
        let effects=Effects {target,threat,profile,assignment:assigned,facing:self.facing,allow_offensive_maneuver:regroup.is_none()&&!withdrawing&&escort.is_none()&&!avoiding&&waypoint.is_none(),regroup:regroup.is_some(),disengaging,withdrawing,escort:escort.is_some(),avoiding,defending,waypoint:waypoint.is_some(),avoiding_collision:avoidance.avoiding,yielding:self.yielding,attached_motion:attached};
        self.intent(v,false,target,aim,hold,movement,Some(effects))
    }
    fn check(&self,intent:&Intent,expected:Stage)->Result<(),Error>{if intent.owner!=self.owner||intent.sequence!=self.sequence{return Err(Error::StaleIntent);}if self.stage!=expected{return Err(Error::WrongStage);}Ok(())}
    pub fn commit_controls<H:Host>(&mut self,intent:&Intent,host:&mut H)->Result<(),Error>{
        self.check(intent,Stage::Planned)?;if host.identity()!=self.owner{return Err(Error::InvalidIdentity);}self.stage=Stage::Controls;
        let stopped=intent.stopped||host.live_ship().stopped();host.commit_controls(intent,stopped)?;if !stopped&&intent.target.is_some(){self.target_ship=intent.target;}Ok(())
    }
    pub fn commit_effects<H:Host>(&mut self,intent:&mut Intent,host:&mut H,scratch:&mut Scratch)->Result<(),Error>{
        self.check(intent,Stage::Controls)?;if host.identity()!=self.owner{return Err(Error::InvalidIdentity);}self.stage=Stage::Closed;let program=intent.effects.take();
        if intent.stopped||host.live_ship().stopped(){return Ok(());}let mut p=program.ok_or(Error::WrongStage)?;admit_systems(host)?;
        if let Some(target)=p.target{
            let ship=host.live_ship();if !ship.venting&&!ship.overloaded{let count=host.systems().len();
                for index in 0..count{if host.systems()[index].defense&&!ship.right_click_system{continue;}self.run_system(host,index,target,&p,scratch,false)?;}}
            if !host.live_ship().right_click_system{let index=host.systems().iter().position(|s|s.defense).ok_or(Error::InvalidTopology)?;self.run_system(host,index,target,&p,scratch,true)?;}
        }
        let owner=self.owner;let mut refreshed=None;
        let mut refresh=|host:&mut H|->Result<defense::Assessment,defense::Error>{let v=host.observation().map_err(|_|defense::Error::InvalidTopology)?;let r=v.tactical.find(owner).ok_or(defense::Error::StaleIdentity)?;let(horizon,window)=v.horizons(r);let mut threat=defense::Assessment::default();defense::assess_into(&v.defense,di(owner),horizon,window,horizon,false,&mut threat,&mut scratch.defense)?;refreshed=Some(threat.clone());Ok(threat)};
        let result=self.defense.update(host,&p.threat,Some(&mut refresh))?;if let Some(threat)=refreshed{p.threat=threat;self.forecast.invalidate_after_live_refresh();}
        let assignment=p.assignment;let task=if p.regroup{Some(Task::Regroup)}else if p.disengaging{Some(Task::Disengage)}else{assignment.map(|a|if matches!(a.task,Task::Regroup|Task::Disengage){if p.target.is_some(){Task::Pressure}else{Task::Search}}else{a.task})};
        host.publish(Diagnostics {role:assignment.map(|a|a.role),task,target_score:assignment.map(|a|a.score),pressure_ratio:assignment.map(|a|a.pressure_ratio),assigned_power:assignment.map(|a|a.assigned_power),mode:if p.regroup{Mode::Withdraw}else if p.escort{Mode::Escort}else if p.avoiding{Mode::Avoid}else if p.defending{Mode::Defend}else if p.waypoint{Mode::Waypoint}else if p.target.is_none(){Mode::Idle}else if p.withdrawing{Mode::Withdraw}else{Mode::Engage},profile:p.profile,facing:p.facing,positioning:self.positioning,attached_motion:p.attached_motion,avoiding_collision:p.avoiding_collision,yielding:p.yielding,imminent_damage:p.threat.imminent_damage,imminent_shield_flux:p.threat.imminent_shield_flux,earliest:if p.threat.earliest.is_finite(){Some(p.threat.earliest)}else{None},defense:result})?;Ok(())
    }
    fn run_system<H:Host>(&self,host:&mut H,index:usize,target:Identity,p:&Effects,scratch:&mut Scratch,independent_defense:bool)->Result<(),Error>{
        let system=host.systems().get(index).ok_or(Error::InvalidTopology)?.clone();if system.ai==SystemAI::None{return Ok(());}
        let ship=host.live_ship();let target_body=host.target_body(target)?;
        let needs_forward=!matches!(system.ai,SystemAI::Eclipse|SystemAI::Special(SpecialAI::GlorianaEdict|SpecialAI::HyperionYamato|SpecialAI::HyperionJump));
        let forward=if independent_defense{Some(true)}else if needs_forward{let speed=(ship.spec_speed+host.active_speed_flat(index)?).max(nav::length(ship.vx,ship.vy));let v=host.observation()?;let r=v.row(self.owner)?;Some(nav::forward_path_clear(&v.navigation,r,speed,3.0f64.max(system.charge_up+system.charge_down),&mut scratch.navigation)?)}else{None};
        let context=SystemContext {target,distance:nav::length(ship.x-target_body.x,ship.y-target_body.y),angle_diff:nav::signed_angle(p.facing-ship.facing),planned_facing:p.facing,allow_offensive_maneuver:p.allow_offensive_maneuver,desired_range:p.profile.range,withdrawing:p.withdrawing||p.regroup,waypoint:p.waypoint,avoiding_collision:p.avoiding_collision||!independent_defense&&p.yielding,forward_clear:forward,quiet_for:self.defense.quiet_for,threat:&p.threat};
        advance_system(host,index,&context)
    }
}
fn cadence(clock:&mut f64,dt:f64,interval:f64,phase:u8,buckets:u8)->bool {let first=*clock<0.0;*clock-=dt.max(0.0);let scheduled=first||*clock<=1e-9||interval==0.0;if scheduled{*clock=if interval==0.0{0.0}else if first{(phase as f64+1.0)*interval/buckets as f64}else{interval+(*clock%interval).min(0.0)};}scheduled}

#[derive(Clone,Copy,Debug,Default)]
pub struct LiveShip {pub flags:u32,pub retreating:bool,pub right_click_system:bool,pub x:f64,pub y:f64,pub vx:f64,pub vy:f64,pub facing:f64,pub spec_speed:f64,pub deceleration:f64,pub hp:f64,pub max_hp:f64,pub total_flux:f64,pub max_flux:f64,pub flux_percent:f64,pub venting:bool,pub overloaded:bool,pub phased:bool,pub blocks_weapons:bool,pub flameout:f64,pub controls:nav::Controls}
impl LiveShip {fn stopped(self)->bool{self.flags&(B::DEAD|B::RETREATED|B::DOCKED)!=0||self.retreating}fn alive(self)->bool{self.flags&B::DEAD==0&&self.hp>0.0}}
#[derive(Clone,Copy,Debug,PartialEq,Eq)]
pub enum WeaponType {Ballistic,Energy,Missile}
#[derive(Clone,Copy,Debug,Default)]
pub enum SystemState {#[default]Idle,In,Active,Out,Cooldown}
#[derive(Clone,Copy,Debug,PartialEq,Eq)]
pub enum SpecialAI {GlorianaEdict,HyperionYamato,HyperionJump,RocinanteAttitude,RocinanteLocalFireControl,Zhefeng,GravityPush,GravityManeuver,GravityField,GravityCollapse,NativeTargeted,NativeMineStrike,NativeOther}
#[derive(Clone,Copy,Debug,PartialEq,Eq)]
pub enum SystemAI {None,BurnDrive,Jets,WeaponBoost(WeaponType),Eclipse,SolarForge,Defensive,Drive,DynamicStabilizer,TemporalShell,ReloadMissiles{cooldown_only:bool},AdunForge,AdunBarrier,AdunRepair,Special(SpecialAI),Unknown}
#[derive(Clone,Debug)]
pub struct System {pub ai:SystemAI,pub defense:bool,pub available:bool,pub disabled:bool,pub active:bool,pub cooling:bool,pub toggle:bool,pub state:SystemState,pub flux_cost:f64,pub charge_up:f64,pub charge_down:f64}
#[derive(Clone,Copy,Debug)]
pub struct SystemWeapon {pub weapon_type:WeaponType,pub disabled:bool,pub ammo:f64,pub max_ammo:Option<f64>,pub cooldown:f64,pub burst_remaining:f64,pub damage_shot:f64,pub damage_second:f64,pub relative_x:f64,pub relative_y:f64,pub angle:f64,pub range:f64}
pub struct SystemContext<'a> {pub target:Identity,pub distance:f64,pub angle_diff:f64,pub planned_facing:f64,pub allow_offensive_maneuver:bool,pub desired_range:f64,pub withdrawing:bool,pub waypoint:bool,pub avoiding_collision:bool,pub forward_clear:Option<bool>,pub quiet_for:f64,pub threat:&'a defense::Assessment}
/// No function-pointer/JS hooks. Implement on the Rust resident battle, with its
/// real activation, defense/vent, target queries and transaction-owned effects.
pub trait Host:defense::DefenseHost {
    fn identity(&self)->Identity;
    fn observation(&self)->Result<Observation<'_>,Error>;
    fn live_ship(&self)->LiveShip;
    fn target_body(&self,target:Identity)->Result<tactical::Body,Error>;
    fn commit_controls(&mut self,intent:&Intent,stopped:bool)->Result<(),Error>;
    fn systems(&self)->&[System];
    fn active_speed_flat(&self,index:usize)->Result<f64,Error>;
    fn weapons(&self)->&[SystemWeapon];
    fn assembly_needs_repair(&self)->bool;
    fn activate(&mut self,index:usize,defense_entry:bool)->Result<bool,Error>;
    fn deactivate(&mut self,index:usize)->Result<(),Error>;
    fn publish(&mut self,diagnostics:Diagnostics)->Result<(),Error>;
    fn supports_special(&self,_kind:SpecialAI)->bool{false}
    fn advance_special(&mut self,_index:usize,_kind:SpecialAI,_context:&SystemContext<'_>)->Result<(),Error>{Err(Error::UnsupportedSystem)}
}
pub fn admit_systems<H:Host>(host:&H)->Result<(),Error>{let systems=host.systems();if systems.iter().filter(|s|s.defense).count()!=1||systems.last().is_none_or(|s|!s.defense){return Err(Error::InvalidTopology);}for s in systems{if s.ai==SystemAI::Unknown||matches!(s.ai,SystemAI::Special(kind) if !host.supports_special(kind)){return Err(Error::UnsupportedSystem);}if ![s.flux_cost,s.charge_up,s.charge_down].iter().all(|n|n.is_finite()&&*n>=0.0){return Err(Error::InvalidNumber);}}Ok(())}
fn offensive(c:&SystemContext<'_>)->bool{c.allow_offensive_maneuver&&!c.withdrawing&&!c.waypoint&&!c.avoiding_collision&&c.forward_clear!=Some(false)}
fn can_activate(ship:LiveShip,system:&System)->bool{system.available&&!system.disabled&&!system.active&&!system.cooling&&ship.alive()&&!ship.phased&&!ship.overloaded&&!ship.venting}
fn ready(ship:LiveShip,system:&System)->bool{ship.alive()&&!ship.overloaded&&!ship.venting&&!system.active&&ship.total_flux+system.flux_cost<ship.max_flux*0.95}
fn weapon_boost<H:Host>(host:&mut H,index:usize,c:&SystemContext<'_>,kind:WeaponType)->Result<(),Error>{let ship=host.live_ship();let system=host.systems()[index].clone();if !can_activate(ship,&system){return Ok(());}let target=host.target_body(c.target)?;
    if target.flags&B::DEAD!=0||target.flags&B::PHASED!=0||c.withdrawing||c.waypoint||ship.blocks_weapons||ship.total_flux+system.flux_cost>ship.max_flux*0.8{return Ok(());}
    let useful=host.weapons().iter().any(|w|{if w.weapon_type!=kind||w.disabled||w.ammo<1.0||w.cooldown>system.charge_up||w.damage_shot<=0.0&&w.damage_second<=0.0{return false;}let cos=ship.facing.cos();let sin=ship.facing.sin();let dx=target.x-(ship.x+(w.relative_x*cos-w.relative_y*sin));let dy=target.y-(ship.y+(w.relative_x*sin+w.relative_y*cos));let distance=nav::length(dx,dy);if distance>w.range+target.radius{return false;}let tolerance=0.15+(target.radius/distance.max(1.0)).min(1.0).asin();nav::signed_angle(dy.atan2(dx)-w.angle).abs()<=tolerance});
    if useful{host.activate(index,false)?;}Ok(())}
fn jets<H:Host>(host:&mut H,index:usize,c:&SystemContext<'_>)->Result<(),Error>{let ship=host.live_ship();if !can_activate(ship,&host.systems()[index])||ship.flameout>=1.0{return Ok(());}let maneuver=ship.controls.turn.abs()>0.1||ship.controls.strafe.abs()>0.1||ship.controls.brake;let closing=c.forward_clear==Some(true)&&!c.avoiding_collision&&ship.controls.throttle>0.1&&c.distance>c.desired_range+100.0;let target=host.target_body(c.target)?;if c.withdrawing&&(maneuver||ship.controls.throttle.abs()>0.1)||target.flags&B::DEAD==0&&(closing||maneuver&&(c.angle_diff.abs()>0.2||c.threat.imminent_damage>0.0)){host.activate(index,false)?;}Ok(())}
fn defensive<H:Host>(host:&mut H,index:usize,c:&SystemContext<'_>)->Result<(),Error>{let ship=host.live_ship();let s=host.systems()[index].clone();let threatened=c.threat.imminent_damage>0.0;if s.toggle&&s.active{if !threatened&&c.quiet_for>1.0||ship.flux_percent>0.9{host.deactivate(index)?;}}else if threatened&&ship.alive()&&!ship.overloaded&&!ship.venting{if s.defense{host.activate(index,true)?;}else if ready(ship,&s){host.activate(index,false)?;}}Ok(())}
pub fn advance_system<H:Host>(host:&mut H,index:usize,c:&SystemContext<'_>)->Result<(),Error>{let s=host.systems().get(index).ok_or(Error::InvalidTopology)?.clone();let ship=host.live_ship();match s.ai{
    SystemAI::None=>Ok(()),SystemAI::Unknown=>Err(Error::UnsupportedSystem),SystemAI::Special(kind)=>{if !host.supports_special(kind){return Err(Error::UnsupportedSystem);}host.advance_special(index,kind,c)},
    SystemAI::Jets=>jets(host,index,c),SystemAI::WeaponBoost(kind)=>weapon_boost(host,index,c,kind),SystemAI::Eclipse=>if ship.flux_percent<0.2||ship.flux_percent>0.65{Ok(())}else{weapon_boost(host,index,c,WeaponType::Energy)},SystemAI::SolarForge=>if ship.flux_percent>=0.45{Ok(())}else{weapon_boost(host,index,c,WeaponType::Energy)},
    SystemAI::Defensive=>defensive(host,index,c),SystemAI::DynamicStabilizer=>{weapon_boost(host,index,c,WeaponType::Ballistic)?;weapon_boost(host,index,c,WeaponType::Energy)?;jets(host,index,c)},SystemAI::TemporalShell=>{weapon_boost(host,index,c,WeaponType::Ballistic)?;weapon_boost(host,index,c,WeaponType::Energy)?;defensive(host,index,c)},
    SystemAI::BurnDrive=>{let target=host.target_body(c.target)?;let speed=ship.spec_speed+200.0;let stopping=speed*speed/(2.0*ship.deceleration)+speed*s.charge_down;let aligned=nav::signed_angle((target.y-ship.y).atan2(target.x-ship.x)-ship.facing).abs()<0.1;let safe=offensive(c)&&c.threat.imminent_damage==0.0&&c.distance-c.desired_range>stopping;if s.active{if !safe&&!matches!(s.state,SystemState::Out){host.deactivate(index)?;}}else if safe&&aligned&&!s.cooling{host.activate(index,false)?;}Ok(())},
    SystemAI::Drive=>{let target=host.target_body(c.target)?;let useful=target.flags&B::DEAD==0&&target.hp>0.0&&offensive(c)&&c.angle_diff.abs()<0.2&&ship.flameout<1.0&&c.distance>c.desired_range+200.0;if s.active&&s.toggle{if !useful{host.deactivate(index)?;}}else if useful&&ready(ship,&s){host.activate(index,false)?;}Ok(())},
    SystemAI::ReloadMissiles{cooldown_only}=>{let target=host.target_body(c.target)?;if !ready(ship,&s)||target.flags&B::DEAD!=0||target.hp<=0.0||target.flags&B::PHASED!=0||c.waypoint{return Ok(());}let mut weapons=0;let mut useful=0;for w in host.weapons(){if w.weapon_type==WeaponType::Missile&&w.ammo.is_finite()&&w.max_ammo.is_some()&&!w.disabled{weapons+=1;if if cooldown_only{w.ammo>0.0&&w.burst_remaining==0.0&&w.cooldown>s.charge_up}else{w.ammo<w.max_ammo.unwrap()*0.5}{useful+=1;}}}if useful>0&&useful as f64>=weapons as f64*0.5{host.activate(index,false)?;}Ok(())},
    SystemAI::AdunForge=>{if host.target_body(c.target)?.flags&B::DEAD==0&&c.distance<2400.0&&ship.flux_percent<0.45{host.activate(index,false)?;}Ok(())},
    SystemAI::AdunBarrier=>{if c.distance<2000.0&&ship.flux_percent>0.45&&ship.flux_percent<0.85{host.activate(index,false)?;}Ok(())},
    SystemAI::AdunRepair=>{if ship.flux_percent<0.45&&host.assembly_needs_repair(){host.activate(index,false)?;}Ok(())},
}}
