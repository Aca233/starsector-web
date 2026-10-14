//! CombatControl / PlayerControls / ModuleFireControl in the whole scene transaction.
use crate::{ai_owner,ai_resident,battle::Ordnance,contact,flight_world,lifecycle::Spec,motion,motion_owner,navigation_ai,random::Random,
    scene_owner::{self,Owned},ship_state::{self,Notice,ShipState},state::{Body,Handle},tactical_ai,world_owner};
use std::collections::BTreeMap;
fn row(b:&[Body],h:Handle)->Result<usize,u32>{b.iter().position(|b|b.handle==h).ok_or(4)}
fn ship(b:&[Body],h:Handle)->Result<&ShipState,u32>{b[row(b,h)?].ship.as_ref().ok_or(8)}
fn live(b:&[Body],h:Handle)->Result<bool,u32>{let s=ship(b,h)?;Ok(s.flags&(ship_state::DEAD|ship_state::RETREATED|ship_state::DOCKED)==0&&s.armor.as_ref().ok_or(8u32)?.data[14]>0.0)}
fn fid(h:Handle)->tactical_ai::Identity{tactical_ai::Identity{handle:h.slot,generation:h.generation}}
pub fn assembly(b:&[Body],h:Handle)->Result<Vec<Handle>,u32>{
    fn visit(b:&[Body],h:Handle,out:&mut Vec<Handle>)->Result<(),u32>{if out.contains(&h){return Err(8);}out.push(h);
        for &c in &ship(b,h)?.world.as_ref().ok_or(8u32)?.children{if ship(b,c)?.world.as_ref().ok_or(8u32)?.parent!=Some(h){return Err(8);}visit(b,c,out)?;}Ok(())}
    let mut out=Vec::new();visit(b,h,&mut out)?;Ok(out)
}
fn mode(b:&mut[Body],w:&mut world_owner::Owned,h:Handle,manual:bool)->Result<(),u32>{let i=row(b,h)?;let s=b[i].ship.as_mut().ok_or(8u32)?;
    let c=s.combat.as_mut().ok_or(8u32)?;c.attrs[19]=(!manual)as u32 as f64;c.query.as_mut().ok_or(8u32)?.hold=false;
    let guns=s.weapons.as_mut().ok_or(8u32)?;guns.data[3]=manual as u32 as f64;guns.data[19]=manual as u32 as f64;
    w.ai.as_ref().ok_or(8u32)?.actor(ai_resident::identity(h).map_err(|_|4u32)?).map_err(|_|4u32)?;Ok(())
}
fn manual_readers(b:&mut[Body],w:&mut world_owner::Owned,h:Handle)->Result<(),u32>{let i=row(b,h)?;
    if let Some(sh)=b[i].ship.as_mut().ok_or(8u32)?.shield.as_mut(){sh.data[33]=0.0;sh.data[34]=0.0;}
    let ai=w.ai.as_mut().ok_or(8u32)?.actor_mut(ai_resident::identity(h).map_err(|_|4u32)?).map_err(|_|4u32)?;ai.defense_facing=None;ai.tactical_present=false;Ok(())}
pub fn stop_firing(o:&Owned,b:&mut[Body])->Result<(),u32>{for h in assembly(b,o.player)?{
    if h==o.player||ship(b,h)?.combat.as_ref().ok_or(8u32)?.attrs[19]!=1.0{let i=row(b,h)?;
        b[i].ship.as_mut().and_then(|s|s.combat.as_mut()).and_then(|c|c.query.as_mut()).ok_or(8u32)?.trigger=false;}}Ok(())}
pub fn release_modules(o:&mut Owned,b:&mut[Body],w:&mut world_owner::Owned,specs:&BTreeMap<u32,Spec>)->Result<(),u32>{
    for h in assembly(b,o.player)?.into_iter().skip(1){if ship(b,h)?.combat.as_ref().ok_or(8u32)?.attrs[19]!=1.0{
        o.clear_input(b,w,specs,h)?;mode(b,w,h,false)?;w.flight.as_mut().ok_or(8u32)?.owner.ship_mut(fid(h)).map_err(|_|4u32)?.player_target=None;}}
    o.manual_weapon=o.player;Ok(())
}
pub fn pilot(o:&mut Owned,b:&mut[Body],w:&mut world_owner::Owned,specs:&BTreeMap<u32,Spec>,autopilot:bool)->Result<(),u32>{
    if o.result.is_some()||!live(b,o.player)?||ship(b,o.player)?.flags&ship_state::RETREATING!=0{return Err(8);}
    o.clear_input(b,w,specs,o.player)?;stop_firing(o,b)?;if autopilot{release_modules(o,b,w,specs)?;}mode(b,w,o.player,!autopilot)?;manual_readers(b,w,o.player)?;o.autopilot=autopilot;
    if !autopilot{let active=active(w,b)?;let target=locked(o,b,&active)?;let i=row(b,o.player)?;b[i].ship.as_mut().unwrap().combat.as_mut().unwrap().query.as_mut().unwrap().target=target;}Ok(())
}
pub fn active(w:&world_owner::Owned,b:&[Body])->Result<Vec<Handle>,u32>{Ok(w.flight.as_ref().ok_or(8u32)?.roster(b).map_err(crate::flight_runtime::error)?
    .into_iter().map(|h|Handle{slot:h.handle,generation:h.generation}).collect())}
pub fn locked(o:&Owned,b:&[Body],active:&[Handle])->Result<Option<Handle>,u32>{let own=ship(b,o.player)?.combat.as_ref().ok_or(8u32)?.team;
    if let Some(h)=o.player_target{if active.contains(&h)&&live(b,h)?{let c=ship(b,h)?.combat.as_ref().ok_or(8u32)?;let q=c.query.as_ref().ok_or(8u32)?;
        if c.team!=own&&!q.vast&&q.visible.iter().any(|(t,v)|*t==own&&*v){return Ok(Some(h));}}}Ok(None)}
fn set_aim(b:&mut[Body],h:Handle,aim:[f64;2])->Result<(),u32>{let i=row(b,h)?;let s=b[i].ship.as_mut().ok_or(8u32)?;
    s.world.as_mut().ok_or(8u32)?.aim=aim;s.combat.as_mut().and_then(|c|c.query.as_mut()).ok_or(8u32)?.aim=aim;
    if let Some(sh)=s.shield.as_mut(){sh.data[31]=aim[0];sh.data[32]=aim[1];}Ok(())}
pub fn pre_tick(o:&mut Owned,b:&mut[Body],ordnance:&mut Ordnance,w:&mut world_owner::Owned,specs:&BTreeMap<u32,Spec>,dt:f64,
    random:&mut Random,visual:&mut Random,notices:&mut Vec<(u32,Handle,Notice)>)->Result<(),u32>{
    let sample=o.sample.take().ok_or(8u32)?;
    if o.result.is_some()||!live(b,o.player)?{o.clear_input(b,w,specs,o.player)?;release_modules(o,b,w,specs)?;return Ok(());}
    o.autopilot=sample.autopilot;
    if sample.autopilot{release_modules(o,b,w,specs)?;let active=active(w,b)?;let entry=entry(o,b,w,o.player,dt,false,false)?;
        let mut ai=w.ai.take().ok_or(8u32)?;o.sync_ai_orders(b,&mut ai)?;let excluded:Vec<_>=o.externally_controlled.iter().copied().filter(|h|active.contains(h)).collect();
        let result=ai.phase_with_fleet(&mut ai_resident::Resident{bodies:b,ordnance,specs,world:w,random,visual,events:notices},&[entry],&active,&[],&excluded,true,&mut ai_resident::Scratch::default()).map_err(|_|8u32);
        w.ai=Some(ai);return result;}
    mode(b,w,o.player,true)?;manual_readers(b,w,o.player)?;if o.map||sample.blocked{o.clear_input(b,w,specs,o.player)?;stop_firing(o,b)?;return Ok(());}
    let r=row(b,o.player)?;let mods=crate::system_owner::modifiers(b,r,specs)?;b[r].ship.as_mut().ok_or(8u32)?.live=mods;
    let mut pose=b[r].motion;let s=b[r].ship.as_ref().ok_or(8u32)?;
    motion_owner::stats(Some(w),b,r,&mut pose,&s.live)?;
    motion_owner::gate(Some(w),s,o.player,specs,&mut pose)?;let held=|n|sample.keys&n!=0;let steering=sample.mouse!=held(64);let horizontal=held(8)as i32-held(4)as i32;
    b[r].motion[motion::THROTTLE]=(held(1)as i32-held(2)as i32)as f64;b[r].motion[motion::BRAKE]=held(128)as u32 as f64;
    b[r].motion[motion::STRAFE]=((held(32)||(steering&&horizontal>0))as i32-(held(16)||(steering&&horizontal<0))as i32)as f64;
    let delta=[sample.aim[0]-b[r].motion[0],sample.aim[1]-b[r].motion[1]];
    b[r].motion[motion::TURN]=if !steering{horizontal as f64}else if sample.pointer&&contact::length(delta)>1e-6{
        navigation_ai::cursor_turn_command(b[r].motion[4],b[r].motion[5],delta[1].atan2(delta[0]),pose[motion::TURN_ACCELERATION]*0.5)}else{0.0};
    if pose[motion::FLAGS]as u32&4!=0{b[r].motion[motion::TURN]=0.0;}if held(128){b[r].ship.as_mut().unwrap().flags|=ship_state::BRAKE;}else{b[r].ship.as_mut().unwrap().flags&=!ship_state::BRAKE;}
    if sample.pointer{set_aim(b,o.player,sample.aim)?;}b[r].ship.as_mut().unwrap().combat.as_mut().unwrap().query.as_mut().unwrap().trigger=sample.pointer&&sample.firing;
    if o.manual_weapon!=o.player&&!live(b,o.manual_weapon)?{release_modules(o,b,w,specs)?;}
    if o.manual_weapon==o.player{release_modules(o,b,w,specs)?;}else{let module=o.manual_weapon;let mr=row(b,module)?;
        b[r].ship.as_mut().unwrap().combat.as_mut().unwrap().query.as_mut().unwrap().trigger=false;if sample.pointer{set_aim(b,module,sample.aim)?;}
        let q=b[mr].ship.as_mut().unwrap().combat.as_mut().unwrap().query.as_mut().unwrap();q.trigger=sample.pointer&&sample.firing;q.hold=false;
        w.flight.as_mut().ok_or(8u32)?.owner.ship_mut(fid(module)).map_err(|_|4u32)?.player_target=o.player_target.map(fid);}
    if !b[r].ship.as_ref().unwrap().world.as_ref().unwrap().gravity_systems.is_empty(){crate::gravity_runtime::held(w,b,ordnance,specs,r,sample.pointer&&sample.field,sample.pointer&&sample.push,random,visual,notices)?;}Ok(())
}
pub fn entry(o:&Owned,b:&[Body],w:&world_owner::Owned,h:Handle,dt:f64,compact:bool,weapon_frame:bool)->Result<ai_resident::Entry,u32>{
    let mut root=h;let mut seen=Vec::new();while let Some(parent)=ship(b,root)?.world.as_ref().ok_or(8u32)?.parent{if seen.contains(&root){return Err(8);}seen.push(root);root=parent;}
    let actor=w.ai.as_ref().ok_or(8u32)?.actor(ai_resident::identity(h).map_err(|_|4u32)?).map_err(|_|4u32)?;
    let full=o.full_rate.contains(&root)||o.full_rate.contains(&h);let external=o.externally_controlled.contains(&root)||o.externally_controlled.contains(&h);
    Ok(ai_resident::Entry{owner:actor.identity,dt,sample_decision:o.profile!=0&&root!=o.player&&!o.full_rate.contains(&root),settings:ai_owner::Settings{
        multirate:o.multirate&&root!=o.player&&!full&&!external,compact_forecast_eligible:compact,weapon_frame_eligible:weapon_frame,..ai_owner::Settings::default()}})
}
pub fn select_module(o:&mut Owned,b:&mut[Body],w:&mut world_owner::Owned,specs:&BTreeMap<u32,Spec>,index:usize)->Result<bool,u32>{
    if index>=128||!live(b,o.player)?{return Ok(false);}let tree=assembly(b,o.player)?;let Some(&part)=tree.get(index)else{return Ok(false);};
    if !live(b,part)?||part!=o.player&&(ship(b,o.player)?.combat.as_ref().ok_or(8u32)?.attrs[19]==1.0||ship(b,part)?.weapons.as_ref().ok_or(8u32)?.mounts.is_empty()){return Ok(false);}
    if part!=o.player&&o.manual_weapon==part{return Ok(true);}release_modules(o,b,w,specs)?;stop_firing(o,b)?;
    if part!=o.player{o.clear_input(b,w,specs,part)?;mode(b,w,part,true)?;let aim=ship(b,o.player)?.combat.as_ref().and_then(|c|c.query.as_ref()).ok_or(8u32)?.aim;set_aim(b,part,aim)?;
        w.flight.as_mut().ok_or(8u32)?.owner.ship_mut(fid(part)).map_err(|_|4u32)?.player_target=o.player_target.map(fid);o.manual_weapon=part;}Ok(true)
}
pub fn weapon_group(o:&mut Owned,b:&mut[Body],kind:u32,index:u32)->Result<bool,u32>{if !live(b,o.player)?{return Ok(false);}let r=row(b,o.manual_weapon)?;
    let w=b[r].ship.as_mut().and_then(|s|s.weapons.as_mut()).ok_or(8u32)?;let Some(i)=w.groups.iter().position(|g|g.data[0]==index as f64&&!g.members.is_empty())else{return Ok(false);};
    let sound=match kind{0=>{if w.data[22]==i as f64{return Ok(true);}w.data[22]=i as f64;b[r].ship.as_mut().unwrap().combat.as_mut().unwrap().query.as_mut().unwrap().selected=Some(i);("ui_button_press",0.5)},
        1=>{w.groups[i].data[1]=1.0-w.groups[i].data[1];("ui_button_press",0.6)},2=>{w.groups[i].data[2]=1.0-w.groups[i].data[2];("autofire_toggle",0.7)},_=>return Err(2)};o.sound(sound.0,sound.1)?;Ok(true)
}
pub fn pick_target(o:&mut Owned,b:&mut[Body],w:&world_owner::Owned,point:[f64;2])->Result<bool,u32>{
    if !point.iter().all(|n|n.is_finite())||!live(b,o.player)?{return Ok(false);}let active=active(w,b)?;let own=ship(b,o.player)?.combat.as_ref().ok_or(8u32)?.team;
    let mut best=None;let mut best_edge=f64::INFINITY;let mut best_center=f64::INFINITY;
    for h in active{if h==o.player||!live(b,h)?{continue;}let r=row(b,h)?;let c=ship(b,h)?.combat.as_ref().ok_or(8u32)?;let q=c.query.as_ref().ok_or(8u32)?;
        if c.team==own||q.vast||!q.visible.iter().any(|(t,v)|*t==own&&*v){continue;}let delta=[point[0]-b[r].motion[0],point[1]-b[r].motion[1]];let center=delta[0].hypot(delta[1]);let mut edge=(center-c.radius).max(0.0);
        if c.bounds.len()>=3{let p=contact::rotate(delta,-b[r].motion[4]);edge=0.0;if !contact::contains(p,&c.bounds){let mut square=f64::INFINITY;
            for i in 0..c.bounds.len(){let a=c.bounds[(i+c.bounds.len()-1)%c.bounds.len()];let z=c.bounds[i];let e=[z[0]-a[0],z[1]-a[1]];let length=e[0]*e[0]+e[1]*e[1];
                let t=(if length>0.0{((p[0]-a[0])*e[0]+(p[1]-a[1])*e[1])/length}else{0.0}).clamp(0.0,1.0);
                square=square.min((p[0]-a[0]-t*e[0]).powi(2)+(p[1]-a[1]-t*e[1]).powi(2));}edge=square.sqrt();}}
        if edge<=50.0&&(edge<best_edge||edge==best_edge&&center<best_center){best=Some(h);best_edge=edge;best_center=center;}}
    o.set_target(b,if best==o.player_target{None}else{best})
}
pub fn sync_flight_orders(o:&Owned,w:&mut world_owner::Owned)->Result<(),u32>{let f=&mut w.flight.as_mut().ok_or(8u32)?.owner;f.orders.clear();f.fleet_order=None;
    for (unit,order) in &o.orders{let order=flight_world::Order{kind:match order.kind{scene_owner::Kind::Engage=>flight_world::OrderKind::Engage,scene_owner::Kind::Assault=>flight_world::OrderKind::Assault,
        scene_owner::Kind::Avoid=>flight_world::OrderKind::Avoid,scene_owner::Kind::Defend=>flight_world::OrderKind::Defend,scene_owner::Kind::Escort=>flight_world::OrderKind::Escort,scene_owner::Kind::Waypoint=>flight_world::OrderKind::Waypoint},
        target:order.target.map(fid),point:order.point.map(|p|flight_world::Vec2{x:p[0],y:p[1]})};match unit{scene_owner::Unit::Fleet=>f.fleet_order=Some(order),scene_owner::Unit::Ship(h)=>f.orders.push((fid(*h),order))}}
    f.ship_mut(fid(o.player)).map_err(|_|4u32)?.player_target=o.player_target.map(fid);Ok(())
}
