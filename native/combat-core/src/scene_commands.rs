//! Paused edge commands. Legitimate rejection preserves source aim; only Err
//! asks the caller to roll back the complete Core transaction.
use crate::{battle::Ordnance,lifecycle::Spec,random::Random,scene_control as control,scene_owner::{Owned,Text},scene_system_read as read,ship_effects as e,ship_state::{self,Notice},state::{Body,Handle},system_owner as so,system_world as w,world_owner};
use std::collections::BTreeMap;
#[derive(Clone,Debug,PartialEq)]pub struct Outcome{pub accepted:bool,pub reason:Option<String>}
fn int(n:f64)->Result<u32,u32>{if n.is_finite()&&n>=0.0&&n<=u32::MAX as f64&&n.fract()==0.0{Ok(n as u32)}else{Err(2)}}
fn state(v:&[f64],at:usize,width:usize)->Result<u32,u32>{let s=int(v[at])?;if s>2||s!=1&&v[at+1..at+1+width].iter().any(|n|*n!=0.0){return Err(2);}Ok(s)}
fn aim(b:&mut[Body],h:Handle,p:[f64;2])->Result<(),u32>{let r=read::row(b,h)?;let s=b[r].ship.as_mut().ok_or(8u32)?;s.world.as_mut().ok_or(8u32)?.aim=p;s.combat.as_mut().and_then(|c|c.query.as_mut()).ok_or(8u32)?.aim=p;
    let sh=s.shield.as_mut().ok_or(8u32)?;sh.data[31]=p[0];sh.data[32]=p[1];Ok(())}
fn input(b:&[Body],h:Handle)->Result<e::ActivationInput,u32>{let r=read::row(b,h)?;let p=b[r].motion;let q=read::ship(b,h)?.combat.as_ref().and_then(|c|c.query.as_ref()).ok_or(8u32)?;Ok(e::ActivationInput{point:q.aim,origin:[p[0],p[1]],velocity:[p[2],p[3]],facing:p[4],target:q.target.map(|h|(h.slot,h.generation)),gravity_anchor_serial:None})}
fn activate(o:&mut Owned,b:&mut[Body],world:&mut world_owner::Owned,ordnance:&mut Ordnance,specs:&BTreeMap<u32,Spec>,r:usize,sid:u32,random:&mut Random,visual:&mut Random,events:&mut Vec<(u32,Handle,Notice)>)->Result<bool,u32>{
    let h=b[r].handle;let i=input(b,h)?;let s=b[r].ship.as_ref().ok_or(8u32)?;if s.world.as_ref().ok_or(8u32)?.gravity_systems.contains(&sid){return crate::gravity_runtime::command(world,b,ordnance,specs,r,sid,i,random,visual,events);}
    let mut slot=so::slot(s,h,sid,specs)?;let reason=slot.activate(&read::Reader::new(b,world,specs),i);match reason{Ok(())=>{},Err(w::Failure::StaleIdentity)=>return Err(4),Err(w::Failure::Host|w::Failure::Unsupported)=>return Err(8),Err(_)=>return Ok(false)}so::restore(b[r].ship.as_mut().unwrap(),slot)?;let _=o;Ok(true)
}
pub fn apply(tag:u32,v:&[f64],o:&mut Owned,b:&mut[Body],world:&mut world_owner::Owned,ordnance:&mut Ordnance,specs:&BTreeMap<u32,Spec>,own:usize,random:&mut Random,visual:&mut Random,events:&mut Vec<(u32,Handle,Notice)>)->Result<Outcome,u32>{
    apply_inner(tag,v,o,b,world,ordnance,specs,own,random,visual,events,true)
}
/// LAN calls dispatchShipCommand directly: there is no local jump-ghost
/// precheck or floating failure factory at this boundary.
pub fn dispatch(tag:u32,v:&[f64],o:&mut Owned,b:&mut[Body],world:&mut world_owner::Owned,ordnance:&mut Ordnance,specs:&BTreeMap<u32,Spec>,own:usize,random:&mut Random,visual:&mut Random,events:&mut Vec<(u32,Handle,Notice)>)->Result<Outcome,u32>{
    apply_inner(tag,v,o,b,world,ordnance,specs,own,random,visual,events,false)
}
fn apply_inner(tag:u32,v:&[f64],o:&mut Owned,b:&mut[Body],world:&mut world_owner::Owned,ordnance:&mut Ordnance,specs:&BTreeMap<u32,Spec>,own:usize,random:&mut Random,visual:&mut Random,events:&mut Vec<(u32,Handle,Notice)>,local_wrapper:bool)->Result<Outcome,u32>{
    if v.len()!=22||v.iter().any(|n|!n.is_finite())||v[7..].iter().any(|n|*n!=0.0)||!(160..=164).contains(&tag){return Err(2);}let action=int(v[0])?;let value=int(v[1])?;let a=state(v,2,2)?;let f=state(v,5,1)?;
    if tag!=163&&value!=0||tag==161&&action>2||tag==163&&action>2||tag==164&&action>1{return Err(2);}let body=b.get(own).ok_or(4u32)?;let h=body.handle;if h!=o.player||o.admission.is_some()||o.list.is_some(){return Err(8);}
    crate::scene_wire::flush_audio(o,world)?;let mut reason=None;let mut accepted=false;
    // Upper control wrapper validates facing before dispatch (and before aim).
    if f==2{reason=Some("跃迁朝向无效".into());}
    let system=if tag==160&&(action as usize)<o.system_read.get(h)?.tactical_count{read::ship(b,h)?.systems.iter().filter(|s|!s.defense).nth(action as usize).map(|s|s.id)}else{None};
    let jump=system.is_some_and(|sid|read::ship(b,h).ok().and_then(|s|s.world.as_ref()).and_then(|w|w.metas.get(&sid)).is_some_and(|m|m.kind==e::Kind::Jump));
    // A failed landing precheck does not enter dispatch or change the aim.
    if local_wrapper&&reason.is_none()&&jump{if a==0{reason=Some("请选择跃迁落点".into());}else if a==2{reason=Some("落点坐标无效".into());}else{let reader=read::Reader::new(b,world,specs);let s=w::Host::ship(&reader,read::id(h)).map_err(so::error)?;let(ships,rocks)=w::Host::jump_obstacles(&reader).map_err(so::error)?;
        reason=e::jump_failure(e::JumpObstacle{identity:h.slot,position:s.position,radius:s.radius,fighter:false},[v[3],v[4]],1800.0*s.range_multiplier,Some(&e::JumpWorld{ships:&ships,asteroids:rocks.as_deref()})).map(read::jump_reason);}}
    if reason.is_none(){if a==1{aim(b,h,[v[3],v[4]])?;}let s=read::ship(b,h)?;
        if s.flags&ship_state::DEAD!=0||s.armor.as_ref().ok_or(8u32)?.data[14]<=0.0{reason=Some("舰船已失去战斗能力".into());}
        else if s.flags&(ship_state::DOCKED|ship_state::RETREATED)!=0{reason=Some("舰船不在战场".into());}
        else{let reader=read::Reader::new(b,world,specs);reason=match tag{
            160=>match system{Some(sid)=>reader.system_reason(h,sid)?,None=>Some("该技能槽为空或不存在".into())},
            161=>match action{0=>reader.defense_reason(h)?,1=>reader.hull_shield_reason(h)?,2=>reader.vent_reason(h)?,_=>return Err(2)},
            162=>{let tree=control::assembly(b,h)?;match tree.get(action as usize).filter(|_|action<128){None=>Some("该模块已失效或不属于本舰".into()),Some(&part)=>{
                if !read::live(read::ship(b,part)?){Some("该模块已失效或不属于本舰".into())}else if part!=h&&s.combat.as_ref().ok_or(8u32)?.attrs[19]==1.0{Some("请先关闭自动驾驶".into())}else if part!=h&&read::ship(b,part)?.weapons.as_ref().ok_or(8u32)?.mounts.is_empty(){Some("该模块没有可手操的武器".into())}else{None}}}},
            163=>if read::ship(b,o.manual_weapon)?.weapons.as_ref().ok_or(8u32)?.groups.iter().any(|g|g.data[0]==value as f64&&!g.members.is_empty()){None}else{Some("该武器组不存在或没有武器".into())},
            164 if action==0=>{let mut allow=false;let flight=world.flight.as_ref().ok_or(8u32)?;for part in control::assembly(b,h)?{let m=flight.owner.ship(crate::tactical_ai::Identity{handle:part.slot,generation:part.generation}).map_err(crate::flight_runtime::error)?;
                if read::live(read::ship(b,part)?)&&m.bays>0&&(!m.wings.is_empty()||!m.deployed.is_empty()){allow=true;}}if allow{None}else{Some("本舰及存活模块没有舰载联队".into())}},
            164=>if a==1{None}else{Some("请将鼠标移到要锁定的敌舰上".into())},_=>return Err(2)};
            if reason.is_none(){accepted=match tag{
                160=>{let sid=system.ok_or(8u32)?;let ok=activate(o,b,world,ordnance,specs,own,sid,random,visual,events)?;if ok&&jump&&f==1{let facing=v[6].sin().atan2(v[6].cos());let m=b[own].ship.as_mut().unwrap().world.as_mut().unwrap().metas.get_mut(&sid).ok_or(8u32)?;
                    let i=m.input.as_mut().ok_or(8u32)?;i.facing=facing;m.jump.input=Some(*i);}ok},
                161=>{let defense=b[own].ship.as_ref().unwrap().systems.iter().find(|s|s.defense).ok_or(8u32)?.id;let nonnone=b[own].ship.as_ref().unwrap().world.as_ref().unwrap().metas[&defense].kind!=e::Kind::None;
                    if action==0&&nonnone{activate(o,b,world,ordnance,specs,own,defense,random,visual,events)?}else{let mut notices=Vec::new();let s=b[own].ship.as_mut().unwrap();let cached=s.live.clone();let runtime=read::runtime(s)?;
                        for key in [e::DISABLE_WEAPONS,e::DISABLE_DEFENSE,e::DISABLE_VENTING]{s.live.set_field(key,runtime.field(key));}
                        let operation=s.shield_operation(if action==2{4}else{3},specs,&mut notices);s.live=cached;operation?;
                        let ok=notices.iter().rev().find(|n|n.kind==ship_state::SHIELD_RESULT).ok_or(8u32)?.value==1.0;
                        if ok&&action==2{let ids=notices.iter().filter(|n|n.kind==ship_state::INTERRUPT).map(|n|n.system).collect::<Vec<_>>();for sid in ids{crate::gravity_runtime::interrupt(world,b,specs,h,Some(sid),false)?;}}
                        world.visual.notices(&notices)?;events.extend(notices.into_iter().map(|n|(b[own].id,h,n)));ok}},
                162=>control::select_module(o,b,world,specs,action as usize)?,163=>control::weapon_group(o,b,action,value)?,
                164 if action==0=>{let key=crate::tactical_ai::Identity{handle:h.slot,generation:h.generation};let flight=world.flight.as_mut().ok_or(8u32)?;let recall=!flight.owner.ship(key).map_err(crate::flight_runtime::error)?.recall;
                    for part in control::assembly(b,h)?{if read::live(read::ship(b,part)?){flight.owner.ship_mut(crate::tactical_ai::Identity{handle:part.slot,generation:part.generation}).map_err(crate::flight_runtime::error)?.recall=recall;
                        world.terrain.ships.iter_mut().find(|m|m.handle==part).ok_or(8u32)?.fighter_recall=recall;}}
                    o.sound(if recall{"fighter_recall"}else{"fighter_deploy"},0.85)?;true},
                164=>control::pick_target(o,b,world,[v[3],v[4]])?,_=>return Err(2)};
                if !accepted{reason=match tag{160=>read::Reader::new(b,world,specs).system_reason(h,system.ok_or(8u32)?)?,161=>match action{0=>read::Reader::new(b,world,specs).defense_reason(h)?,1=>read::Reader::new(b,world,specs).hull_shield_reason(h)?,_=>read::Reader::new(b,world,specs).vent_reason(h)?},_=>None};if reason.is_none(){reason=Some("当前无法执行该操作".into());}}}}
    }
    if local_wrapper&&f!=2{if let Some(text)=&reason{o.texts.push(Text{id:visual.next(),position:[b[own].motion[0],b[own].motion[1]],text:text.clone(),color:[255,190,90],size:13.0,life:1.3,max_life:1.3});}}
    crate::scene_wire::flush_audio(o,world)?;events.push((b[own].id,h,Notice{system:tag,kind:crate::scene_wire::COMMAND_RESULT,value:accepted as u32 as f64,detail:[0.0;2]}));Ok(Outcome{accepted,reason})
}
