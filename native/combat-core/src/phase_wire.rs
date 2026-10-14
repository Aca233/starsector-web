//! Startup metadata for the one resident phase scene.
use crate::{lifecycle::Spec,phase_runtime,ship_effects,state::Body,world_owner};
use std::collections::BTreeMap;
fn int(v:f64)->Result<u32,u32>{if v.is_finite()&&v>=0.0&&v<=u32::MAX as f64&&v.fract()==0.0{Ok(v as u32)}else{Err(2)}}
fn flag(v:f64)->Result<bool,u32>{match v{0.0=>Ok(false),1.0=>Ok(true),_=>Err(2)}}
pub fn apply(tag:u32,data:&[f64],world:&mut world_owner::Owned,bodies:&mut[Body],specs:&BTreeMap<u32,Spec>,r:usize)->Result<(),u32>{
    match tag{
        118=>{if world.phase.is_some()||data.iter().any(|v|*v!=0.0){return Err(8);}world.phase=Some(phase_runtime::Owned::default());},
        119=>{if data[1..].iter().any(|v|*v!=0.0)||!data[0].is_finite()||!(0.0..=1.0).contains(&data[0]){return Err(2);}
            let h=bodies.get(r).ok_or(4u32)?.handle;world.phase.as_mut().ok_or(8u32)?.install(bodies,h,data[0])?;},
        120=>{if data[5..].iter().any(|v|*v!=0.0){return Err(2);}let sid=int(data[0])?;let flags=int(data[1])?;if flags>1023{return Err(2);}
            let b=bodies.get(r).ok_or(4u32)?;let s=b.ship.as_ref().ok_or(8u32)?;
            let l=s.systems.iter().find(|l|l.id==sid).ok_or(4u32)?;if !specs.contains_key(&l.spec){return Err(8);}
            let control=ship_effects::ControlSpec{flags,phase:flag(data[2])?,vulnerable_up:flag(data[3])?,vulnerable_down:flag(data[4])?};
            world.phase.as_mut().ok_or(8u32)?.install_control(bodies,b.handle,sid,control)?;},
        _=>return Err(2)
    }Ok(())
}
