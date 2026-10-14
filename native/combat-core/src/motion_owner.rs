//! Source Ship.syncModulePose/updateMotion, using one installed static contract.
use crate::{contact,engine,lifecycle::Spec,motion,phase_runtime,ship_effects as e,
    ship_state::{self,Notice},state::{Body,Handle},world_owner};
use std::collections::BTreeMap;
#[derive(Clone)]pub struct Meta{pub ship:Handle,pub station:bool,pub axial:bool,pub independent:bool,pub inherit:bool,pub turn_acceleration:f64,pub max_turn:f64}
#[derive(Clone,Default)]pub struct Owned{pub ships:Vec<Meta>,pub expected:Option<usize>,pub propulsion:Vec<(Handle,crate::scene_system_publication::Propulsion)>}
impl Owned{
    /// One verified source metadata binding, retained by whole-world clones.
    pub fn bind_propulsion(&mut self,read:&crate::scene_system_publication::Owned)->Result<(),u32>{
        if !self.propulsion.is_empty(){return Err(8);}for m in &read.ships{if let Some(p)=&m.propulsion{self.admit_propulsion(m.ship,p.clone())?;}}Ok(())
    }
    pub fn admit_propulsion(&mut self,h:Handle,p:crate::scene_system_publication::Propulsion)->Result<(),u32>{
        if self.expected.is_some()||!self.ships.iter().any(|m|m.ship==h)||self.propulsion.iter().any(|(ship,_)|*ship==h)||p.slots.len()>128||!p.reserves.iter().all(|v|v.is_finite()){return Err(8);}
        self.propulsion.push((h,p));Ok(())
    }
    pub fn validate(&self,b:&[Body])->Result<(),u32>{if self.expected.is_some()||self.ships.len()!=b.len(){return Err(8);}
        for(i,m)in self.ships.iter().enumerate(){if !b.iter().any(|b|b.handle==m.ship)||self.ships[..i].iter().any(|p|p.ship==m.ship)
            ||![m.turn_acceleration,m.max_turn].iter().all(|v|v.is_finite()&&*v>=0.0){return Err(8);}}
        for(i,(h,p))in self.propulsion.iter().enumerate(){if self.propulsion[..i].iter().any(|(other,_)|other==h)||!b.iter().any(|b|b.handle==*h)||p.slots.len()>128||!p.reserves.iter().all(|v|v.is_finite()){return Err(8);}
            for child in p.slots.iter().flatten(){if b.iter().find(|b|b.handle==*child).and_then(|b|b.ship.as_ref()).and_then(|s|s.world.as_ref()).is_none_or(|w|w.parent!=Some(*h)){return Err(8);}}}Ok(())}
}
#[derive(Clone,Copy)]pub struct PropulsionState{pub online:usize,pub total:usize,pub level:f64,pub factors:[f64;3]}
/// Same ordered slot denominator and live engine contribution as the actual
/// ModulePropulsion authority query. Missing authored slots remain in total.
pub fn sample_propulsion(world:Option<&world_owner::Owned>,b:&[Body],h:Handle)->Result<Option<PropulsionState>,u32>{
    let Some(m)=world.and_then(|w|w.motion.as_ref())else{return Ok(None);};let Some((_,p))=m.propulsion.iter().find(|(ship,_)|*ship==h)else{return Ok(None);};
    let mut power=0.0;let mut online=0;
    for child in p.slots.iter().flatten(){let s=b.iter().find(|b|b.handle==*child).and_then(|b|b.ship.as_ref()).ok_or(4u32)?;
        if s.world.as_ref().ok_or(8u32)?.parent!=Some(h){return Err(8);}let meta=m.ships.iter().find(|m|m.ship==*child).ok_or(8u32)?;let engine=s.engines.as_ref().ok_or(8u32)?;
        if s.flags&(ship_state::DEAD|ship_state::RETREATED|ship_state::DOCKED)!=0||s.armor.as_ref().ok_or(8u32)?.data[14]<=0.0||!meta.inherit||engine.engines.is_empty()||engine.data[4]!=engine::READY{continue;}
        let contribution=engine.multiplier();power+=contribution;if contribution>0.0{online+=1;}
    }
    let total=p.slots.len();let level=if total==0{0.0}else{power/total as f64};let factors=p.reserves.map(|reserve|reserve+(1.0-reserve)*level);
    Ok(Some(PropulsionState{online,total,level,factors}))
}
pub fn stats(world:Option<&world_owner::Owned>,b:&[Body],r:usize,pose:&mut[f64;motion::WIDTH],live:&e::Modifiers)->Result<(),u32>{
    let body=b.get(r).ok_or(4u32)?;let s=body.ship.as_ref().ok_or(8u32)?;let factors=sample_propulsion(world,b,body.handle)?.map_or([1.0;3],|p|p.factors);
    s.engines.as_ref().ok_or(8u32)?.motion_row_propulsion(pose,s.flux.boost,s.motion_speed_multiplier(),s.engine_context().extended,live,factors);Ok(())
}
fn int(n:f64)->Result<u32,u32>{if n.is_finite()&&n>=0.0&&n<=u32::MAX as f64&&n.fract()==0.0{Ok(n as u32)}else{Err(2)}}
pub fn install(tag:u32,v:&[f64],world:&mut world_owner::Owned,b:&[Body],own:usize)->Result<(),u32>{
    match tag{
        166=>{if world.motion.is_some()||v[1..].iter().any(|n|*n!=0.0){return Err(8);}let count=int(v[0])?as usize;if count!=b.len(){return Err(8);}world.motion=Some(Owned{ships:Vec::new(),expected:Some(count),propulsion:Vec::new()});}
        167=>{if v[3..].iter().any(|n|*n!=0.0){return Err(2);}let flags=int(v[0])?;if flags>15||v[1]<0.0||v[2]<0.0{return Err(2);}let o=world.motion.as_mut().ok_or(8u32)?;let count=o.expected.ok_or(8u32)?;let ship=b.get(own).ok_or(4u32)?.handle;
            if o.ships.len()>=count||o.ships.iter().any(|m|m.ship==ship){return Err(8);}o.ships.push(Meta{ship,station:flags&1!=0,axial:flags&2!=0,independent:flags&4!=0,inherit:flags&8!=0,turn_acceleration:v[1],max_turn:v[2]});}
        168=>{if v.iter().any(|n|*n!=0.0){return Err(2);}let o=world.motion.as_mut().ok_or(8u32)?;if o.expected.take()!=Some(o.ships.len()){return Err(8);}o.validate(b)?;}
        _=>return Err(2)
    }Ok(())
}
/// Dynamic control reads never rewrite held input; the numeric packet is the
/// accepted motion only. Auxiliaries contribute their exact installed flags.
pub fn gate(world:Option<&world_owner::Owned>,s:&ship_state::ShipState,h:Handle,specs:&BTreeMap<u32,Spec>,pose:&mut[f64;motion::WIDTH])->Result<(),u32>{
    let mut bits=0;let controls=world.and_then(|w|w.phase.as_ref());
    for life in &s.systems{let spec=specs.get(&life.spec).ok_or(8u32)?;
        if let Some(o)=controls{let c=o.controls.find(h,life.id).ok_or(8u32)?;
            if life.active&&!(life.state==crate::lifecycle::OUT&&c.spec.flags&e::RELEASE_ON_OUT!=0){bits|=c.spec.flags;}}
        else if spec.flags&crate::lifecycle::AVAILABLE!=0&&s.anchor_installed{return Err(8);}
    }
    if s.live.get(e::DISABLE_MOTION)>0.0{bits|=e::BLOCK_ACCELERATION|e::BLOCK_STRAFING|e::LOCK_TURNING;}
    let mut flags=if controls.is_some(){pose[motion::FLAGS]as u32&!(2|4|32|64)}else{pose[motion::FLAGS]as u32};
    if bits&e::FORCE_FORWARD!=0{flags|=2;}if bits&e::LOCK_TURNING!=0||s.flux.overloaded{flags|=4;}
    if bits&e::BLOCK_ACCELERATION!=0{flags|=32;}if bits&e::BLOCK_STRAFING!=0{flags|=64;}
    pose[motion::FLAGS]=flags as f64;Ok(())
}
/// Called after prepare captures interpolation and again just before motion.
pub fn sync(world:&mut world_owner::Owned,b:&mut[Body],r:usize,specs:&BTreeMap<u32,Spec>,notices:&mut Vec<(u32,Handle,Notice)>)->Result<(),u32>{
    let s=b.get(r).and_then(|b|b.ship.as_ref()).ok_or(8u32)?;if s.flags&ship_state::DEAD!=0{return Ok(());}let Some(parent)=s.world.as_ref().and_then(|w|w.parent)else{return Ok(());};
    let pr=b.iter().position(|b|b.handle==parent).ok_or(4u32)?;let meta=world.terrain.meta(crate::terrain_owner::identity(&b[r]))?;
    let m=meta.module.as_ref().ok_or(8u32)?;if m.parent!=crate::terrain_owner::identity(&b[pr]){return Err(8);}let offset=contact::rotate(m.offset,b[pr].motion[4]);let p=b[pr].motion;
    let ps=b[pr].ship.as_ref().ok_or(8u32)?;let c=ps.combat.as_ref().ok_or(8u32)?;let(team,player,retreated)=(c.team,c.player,ps.flags&ship_state::RETREATED!=0);
    let independent=m.independent;let angle=m.angle;let(pm,recall)={let m=world.terrain.meta(crate::terrain_owner::identity(&b[pr]))?;(m.emergency_phase_used,m.fighter_recall)};
    b[r].motion[0]=p[0]+offset[0];b[r].motion[1]=p[1]+offset[1];if !independent{b[r].motion[4]=p[4]+angle;b[r].motion[5]=p[5];}
    b[r].motion[2]=p[2]+ -offset[1]*p[5];b[r].motion[3]=p[3]+offset[0]*p[5];let cs=b[r].ship.as_mut().and_then(|s|s.combat.as_mut()).ok_or(8u32)?;cs.team=team;cs.player=player;if let Some(query)=cs.query.as_mut(){query.player=player.ok_or(8u32)?;}
    let identity=crate::terrain_owner::identity(&b[r]);let m=world.terrain.ships.iter_mut().find(|m|m.identity==identity).ok_or(4u32)?;m.emergency_phase_used=pm;m.fighter_recall=recall;
    if retreated{phase_runtime::retreat(world,b,r,specs,notices)?;}Ok(())
}
pub fn advance(world:Option<&world_owner::Owned>,b:&mut[Body],r:usize,specs:&BTreeMap<u32,Spec>,dt:f64)->Result<(),u32>{
    let body=b.get(r).ok_or(4u32)?;let s=body.ship.as_ref().ok_or(8u32)?;let parent=s.world.as_ref().and_then(|w|w.parent);
    let m=world.and_then(|w|w.motion.as_ref()).and_then(|o|o.ships.iter().find(|m|m.ship==body.handle));
    let station=if let Some(m)=m{m.station}else if let Some(w)=world{w.terrain.meta(crate::terrain_owner::identity(body))?.station}else{false};
    if station||parent.is_some(){let m=m.ok_or(8u32)?;let mut thrust=[false;2];
        if m.inherit{if let Some(parent)=parent{let p=b.iter().find(|b|b.handle==parent).ok_or(4u32)?;let ps=p.ship.as_ref().ok_or(8u32)?;
            if ps.flags&(ship_state::DEAD|ship_state::RETREATED)==0&&ps.engines.as_ref().is_some_and(|e|e.data[4]==engine::READY){let mut pose=p.motion;gate(world,ps,p.handle,specs,&mut pose)?;let f=pose[11]as u32;let burn=f&2!=0;
                let brake=f&16!=0||(!burn&&f&32==0&&pose[8]!=0.0);let throttle=if brake||f&32!=0{0.0}else if burn{1.0}else{pose[9]};
                thrust=[throttle>0.01,brake||throttle< -0.01||!brake&&!burn&&f&64==0&&pose[10].abs()>0.01];}}}
        let pose=&mut b[r].motion;pose[6]=dt;pose[19]=thrust[0]as u32 as f64;pose[20]=thrust[1]as u32 as f64;
        if station||m.independent{let input=if m.axial{1.0}else{pose[7]};pose[5]=motion::advance_angular(pose[5],input,dt,m.turn_acceleration,m.max_turn);pose[4]+=pose[5]*dt;}
        if station{pose[2]=0.0;pose[3]=0.0;}return Ok(());
    }
    let mut pose=body.motion;gate(world,s,body.handle,specs,&mut pose)?;motion::advance(&mut pose,dt);b[r].motion=pose;Ok(())
}
