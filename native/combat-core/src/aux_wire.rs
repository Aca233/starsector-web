//! Typed one-time admission for actual retained Mine/Stealth content.
use crate::{aux_world as a,battle::Ordnance,lifecycle::Spec,random::Random,
    ship_state::Notice,state::{Body,Handle},world_owner as w};
use std::collections::BTreeMap;
fn int(v:f64)->Result<u32,u32>{if v.is_finite()&&v>=0.0&&v<=u32::MAX as f64&&v.fract()==0.0{Ok(v as u32)}else{Err(2)}}
fn flag(v:f64)->Result<bool,u32>{match v{0.0=>Ok(false),1.0=>Ok(true),_=>Err(2)}}
pub fn apply(tag:u32,data:&[f64],world:&mut w::Owned,bodies:&mut[Body],ordnance:&mut Ordnance,specs:&BTreeMap<u32,Spec>,r:usize,random:&mut Random,visual:&mut Random,events:&mut Vec<(u32,Handle,Notice)>)->Result<(),u32>{
    if tag==105{if world.aux.is_some()||data.iter().any(|v|*v!=0.0){return Err(8);}world.aux=Some(a::Owned::default());return Ok(());}
    if tag==109{return crate::aux_runtime::deploy(world,bodies,ordnance,specs,r,[data[0],data[1]],data[2],random,visual,events);}
    let aux=world.aux.as_mut().ok_or(8u32)?;let b=bodies.get(r).ok_or(4u32)?;
    match tag{
        106=>{if data[19..].iter().any(|v|*v!=0.0){return Err(2);}aux.install_spec(a::MineSpec::new(&data[..19])?)?;},
        107=>{let stealth=int(data[0])?;let hooks=int(data[3])?;
            if stealth>2||hooks>2||(stealth>0)!=(hooks>0)||data[12..].iter().any(|v|*v!=0.0){return Err(2);}
            let payloads=[a::Payload{damage:data[4],launch_speed:data[5],hp:data[6],flight:data[7]},a::Payload{damage:data[8],launch_speed:data[9],hp:data[10],flight:data[11]}];
            aux.install_ship(a::ShipMeta{identity:w::identity(b),handle:b.handle,payloads,stealth:if stealth>0{Some(stealth)}else{None},ineligible:flag(data[1])?,drone:flag(data[2])?,travel_systems:Vec::new()})?;
            aux.hooks.push((b.handle,hooks));},
        108=>{let sid=int(data[0])?;if data[1..].iter().any(|v|*v!=0.0)||!b.ship.as_ref().ok_or(8u32)?.systems.iter().any(|s|s.id==sid){return Err(8);}
            let m=aux.ships.iter_mut().find(|m|m.handle==b.handle).ok_or(8u32)?;if m.travel_systems.contains(&sid){return Err(8);}m.travel_systems.push(sid);},
        _=>return Err(2)
    }Ok(())
}
