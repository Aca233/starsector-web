//! Tags151..165. Fixed-width startup and player commands over unique scene.
use crate::{lifecycle::Spec,random::Random,scene_owner::{self as s,Owned,Unit},ship_state::{self,Notice},state::{Body,Handle},world_owner};
use std::collections::BTreeMap;
pub const COMMAND_RESULT:u32=70;
fn int(n:f64)->Result<u32,u32>{if n.is_finite()&&n>=0.0&&n<=u32::MAX as f64&&n.fract()==0.0{Ok(n as u32)}else{Err(2)}}
fn flag(n:f64)->Result<bool,u32>{match n{0.0=>Ok(false),1.0=>Ok(true),_=>Err(2)}}
fn pad(v:&[f64],n:usize)->Result<(),u32>{if v.len()!=22||v[n..].iter().any(|v|*v!=0.0){Err(2)}else{Ok(())}}
pub(crate) fn sample(o:&mut Owned,owner:Handle,v:&[f64])->Result<(),u32>{
    if owner!=o.player{return Err(8);}pad(v,11)?;if o.admission.is_some()||o.sample.is_some()||o.list.is_some(){return Err(8);}let keys=int(v[2])?;if keys>255{return Err(2);}
    o.sample=Some(s::ControlSample{autopilot:flag(v[0])?,blocked:flag(v[1])?,keys,aim:[v[3],v[4]],firing:flag(v[5])?,mouse:flag(v[6])?,pointer:flag(v[7])?,field:flag(v[8])?,push:flag(v[9])?});if v[10]!=0.0{return Err(2);}Ok(())
}
fn handle(v:&[f64],b:&[Body])->Result<Handle,u32>{let h=Handle{slot:int(v[0])?,generation:int(v[1])?};if b.iter().any(|b|b.handle==h){Ok(h)}else{Err(4)}}
fn optional(v:&[f64],b:&[Body])->Result<Option<Handle>,u32>{if flag(v[0])?{handle(&v[1..3],b).map(Some)}else if v[1]==0.0&&v[2]==0.0{Ok(None)}else{Err(2)}}
fn unit(v:&[f64],b:&[Body])->Result<Unit,u32>{match int(v[0])?{0=>{if v[1..3].iter().any(|v|*v!=0.0){Err(2)}else{Ok(Unit::Fleet)}},1=>handle(&v[1..3],b).map(Unit::Ship),_=>Err(2)}}
/// Scene UI/command factories share the single acknowledged native audio stream.
/// Flush at each actual source operation, rather than merging queues at read time.
pub fn flush_audio(o:&mut Owned,world:&mut world_owner::Owned)->Result<(),u32>{
    for a in &o.audio{world.visual.play(&a.key,a.volume,1.0,None,false)?;}o.audio.clear();Ok(())
}
fn control_ship(b:&[Body],h:Handle)->Result<&ship_state::ShipState,u32>{b.iter().find(|b|b.handle==h).ok_or(4u32)?.ship.as_ref().ok_or(8)}
fn control_team(b:&[Body],h:Handle)->Result<u32,u32>{Ok(control_ship(b,h)?.combat.as_ref().ok_or(8u32)?.team)}
fn control_live(b:&[Body],h:Handle,hp:bool)->Result<bool,u32>{let s=control_ship(b,h)?;Ok(s.flags&(ship_state::DEAD|ship_state::RETREATED|ship_state::DOCKED)==0&&(!hp||s.armor.as_ref().ok_or(8u32)?.data[14]>0.0))}
fn control_owns(o:&Owned,b:&[Body],u:Unit)->Result<bool,u32>{Ok(match u{Unit::Fleet=>true,Unit::Ship(h)=>o.capital(b)?.contains(&h)&&control_team(b,h)?==control_team(b,o.player)?})}
fn control_friendly(o:&Owned,b:&[Body],h:Handle)->Result<bool,u32>{Ok(control_owns(o,b,Unit::Ship(h))?&&control_live(b,h,true)?)}
fn control_target(o:&Owned,b:&[Body],kind:s::Kind,t:Option<Handle>)->Result<bool,u32>{let Some(h)=t else{return Ok(true);};if !o.active(b)?.contains(&h)||!control_live(b,h,true)?{return Ok(false);}let c=control_ship(b,h)?.combat.as_ref().ok_or(8u32)?;let own=control_team(b,o.player)?;
    Ok(if kind==s::Kind::Escort{c.team==own}else{c.team!=own&&c.query.as_ref().ok_or(8u32)?.visible.iter().any(|(t,v)|*t==own&&*v)})}
fn engine_friendly(o:&Owned,b:&[Body],h:Handle)->Result<bool,u32>{let s=control_ship(b,h)?;Ok(o.active(b)?.contains(&h)&&s.flags&ship_state::DEAD==0&&s.combat.as_ref().ok_or(8u32)?.player==Some(true))}
fn engine_order(o:&Owned,b:&[Body],u:Unit,kind:s::Kind,t:Option<Handle>)->Result<bool,u32>{let units=o.active(b)?;let friendly=match u{Unit::Fleet=>{let mut yes=false;for h in &units{yes|=engine_friendly(o,b,*h)?;}yes},Unit::Ship(h)=>engine_friendly(o,b,h)?};if !friendly{return Ok(false);}
    if matches!(kind,s::Kind::Engage|s::Kind::Avoid){let Some(h)=t else{return Ok(false);};let s=control_ship(b,h)?;let c=s.combat.as_ref().ok_or(8u32)?;let own=control_team(b,o.player)?;if !units.contains(&h)||s.flags&ship_state::DEAD!=0||c.player!=Some(false)||!c.query.as_ref().ok_or(8u32)?.visible.iter().any(|(t,v)|*t==own&&*v){return Ok(false);}}
    if kind==s::Kind::Escort{let Some(h)=t else{return Ok(false);};if !engine_friendly(o,b,h)?||u==Unit::Fleet||u==Unit::Ship(h){return Ok(false);}}Ok(true)}
fn next_rejected_order(o:&mut Owned)->Result<(),u32>{o.order_sequence=o.order_sequence.checked_add(1).ok_or(5u32)?;Ok(())}
fn control_select(o:&mut Owned,b:&[Body],u:Option<Unit>,visual:&mut Random)->Result<(),u32>{
    if o.selected==u{return Ok(());}o.selected=u;if let Some(u)=u{o.sound("map_open",0.8)?;let title=if u==Unit::Ship(o.player){"FLAGSHIP SELECTED"}else{let stable=match u{Unit::Fleet=>"fleet".to_string(),Unit::Ship(h)=>String::from_utf16(&control_ship(b,h)?.combat.as_ref().and_then(|c|c.death.as_ref()).ok_or(8u32)?.strings[3]).map_err(|_|8u32)?};if stable.contains("ftr"){"BROADSWORD WING SELECTED"}else if stable.contains("bmr"){"DAGGER FLIGHT SELECTED"}else{"UNIT SELECTED"}};
        let p=b.iter().find(|b|b.handle==o.player).ok_or(4u32)?.motion;o.texts.push(s::Text{id:visual.next(),position:[p[0],p[1]],text:title.into(),color:[80,220,255],size:15.0,life:1.5,max_life:1.5});}else{o.sound("command_deselect",0.7)?;}Ok(())
}
/// Runtime commands return ordinary source gameplay rejection as data. The
/// legacy startup/sample ABI and fixtures still use `apply` below unchanged.
pub fn apply_control(tag:u32,v:&[f64],scene:&mut Option<Owned>,b:&mut[Body],world:&mut world_owner::Owned,specs:&BTreeMap<u32,Spec>,own:usize,time:f64,visual:&mut Random,events:&mut Vec<(u32,Handle,Notice)>)->Result<(Vec<Handle>,Option<crate::scene_commands::Outcome>),u32>{
    if !(155..=159).contains(&tag)&&tag!=197{return apply(tag,v,scene,b,world,specs,own,time,visual,events).map(|born|(born,None));}
    if v.len()!=22||v.iter().any(|n|!n.is_finite()){return Err(2);}let owner=b.get(own).ok_or(4u32)?.handle;let o=scene.as_mut().ok_or(8u32)?;if owner!=o.player||o.admission.is_some(){return Err(8);}flush_audio(o,world)?;
    let mut born=Vec::new();let mut reason:Option<String>=None;
    match tag{
        155=>{if o.list.is_some(){return Err(8);}let action=int(v[0])?;match action{
            0|1|3|4=>{pad(v,1)?;match action{0=>{o.clear_input(b,world,specs,o.player)?;crate::scene_control::stop_firing(o,b)?;o.toggle_map()?;},1=>{if o.map{o.toggle_map()?;}},3=>{o.clear_input(b,world,specs,o.player)?;crate::scene_control::stop_firing(o,b)?;},_=>crate::scene_control::stop_firing(o,b)?}},
            2=>{pad(v,4)?;let selected=if v[1]==2.0{if v[2]!=0.0||v[3]!=0.0{return Err(2);}None}else{Some(unit(&v[1..4],b)?)};
                if let Some(Unit::Ship(h))=selected{if !control_owns(o,b,Unit::Ship(h))?||!control_live(b,h,false)?{reason=Some("该友舰已离开战场。".into());}}if reason.is_none(){control_select(o,b,selected,visual)?;}},
            5=>{pad(v,2)?;let pilot=flag(v[1])?;if o.result.is_some()||!control_live(b,o.player,true)?||control_ship(b,o.player)?.flags&ship_state::RETREATING!=0{reason=Some("舰船不可接管".into());}else{crate::scene_control::pilot(o,b,world,specs,pilot)?;}},
            6=>{pad(v,4)?;let u=unit(&v[1..4],b)?;if o.result.is_some(){reason=Some("战斗已结束。".into());}else if !control_owns(o,b,u)?{reason=Some("不能取消其他舰队的指令。".into());}else if !o.orders.iter().any(|(unit,_)|*unit==u)&&o.orders.iter().any(|(u,_)|*u==Unit::Fleet){reason=Some("该舰正在执行全舰指令；按 A 选择全舰后取消。".into());}else{o.cancel(b,u,time,visual)?;}},
            7=>{pad(v,4)?;let target=optional(&v[1..4],b)?;if o.result.is_some(){reason=Some("战斗已结束。".into());}else if target.is_none()||!o.set_target(b,target)?{reason=Some("目标已离开己方视野。".into());}},
            8=>{pad(v,3)?;let target=handle(&v[1..3],b)?;if o.result.is_some(){reason=Some("战斗已结束。".into());}else{let mut units=Vec::new();for(u,order)in &o.orders{if order.target==Some(target)&&control_owns(o,b,*u)?{units.push(*u);}}for u in units{o.cancel(b,u,time,visual)?;}}},
            _=>return Err(2)}}
        156=>{pad(v,10)?;if o.list.is_some(){return Err(8);}let u=unit(&v[..3],b)?;let kind=match int(v[3])?{0=>s::Kind::Assault,1=>s::Kind::Engage,2=>s::Kind::Avoid,3=>s::Kind::Defend,4=>s::Kind::Escort,5=>s::Kind::Waypoint,_=>return Err(2)};let target=optional(&v[4..7],b)?;let point=if flag(v[7])?{Some([v[8],v[9]])}else if v[8]==0.0&&v[9]==0.0{None}else{return Err(2)};
            if o.result.is_some(){reason=Some("战斗已结束。".into());}else if !control_owns(o,b,u)?||matches!(kind,s::Kind::Defend|s::Kind::Waypoint)&&point.is_none()||matches!(kind,s::Kind::Engage|s::Kind::Avoid|s::Kind::Escort)&&target.is_none(){reason=Some("无效的战术指令。".into());}else{let friendly=match u{Unit::Ship(h)=>control_friendly(o,b,h)?,Unit::Fleet=>{let mut yes=false;for h in o.capital(b)?{yes|=control_friendly(o,b,h)?;}yes}};
                if !friendly||!control_target(o,b,kind,target)?{reason=Some("该舰或目标已离开战场。".into());}else if !engine_order(o,b,u,kind,target)?{next_rejected_order(o)?;reason=Some(if o.cp<=0.0{"指挥点不足。每 120 秒战斗时间恢复 1 点。"}else{"该舰或目标已离开战场。"}.into());}else if !o.issue(b,u,kind,target,point,time,visual)?{reason=Some("指挥点不足。每 120 秒战斗时间恢复 1 点。".into());}}}
        157=>{pad(v,7)?;if o.list.is_some(){return Err(8);}let action=int(v[0])?;let count=int(v[1])?as usize;let team=int(v[2])?;if action>2||count>4096{return Err(2);}if control_team(b,o.player)?!=team{return Err(8);}o.list=Some(s::List{action,count,team,withdraw:flag(v[3])?,target:optional(&v[4..7],b)?,items:Vec::new()});return Ok((born,None));}
        158=>{pad(v,3)?;let h=handle(&v[1..3],b)?;let list=o.list.as_mut().ok_or(8u32)?;if int(v[0])?as usize!=list.items.len()||list.items.len()>=list.count||list.items.contains(&h){return Err(8);}list.items.push(h);return Ok((born,None));}
        159=>{pad(v,0)?;let list=o.list.take().ok_or(8u32)?;if list.items.len()!=list.count{return Err(8);}match list.action{
            0=>{if list.withdraw||list.target.is_some(){return Err(2);}if o.result.is_some(){reason=Some("战斗已经结束，不能继续部署。".into());}else if !o.enabled{reason=Some("本场战斗不能继续部署。".into());}else if list.items.is_empty(){reason=Some("请选择不重复的待命舰船。".into());}else{let mut cost=0.0;for h in &list.items{let r=o.roots.iter().find(|r|r.ship==*h);if r.is_none()||control_team(b,*h)?!=list.team{reason=Some("只能部署本队战前编成中的舰船。".into());break;}let r=r.unwrap();if o.status(b,r)?!=s::Status::Reserve{reason=Some("所选舰船已部署、撤退或损失，请更新选择。".into());break;}cost+=r.cost;}
                    if reason.is_none()&&o.used(b,list.team)?+cost>o.limit{reason=Some("超出本队可用部署点。".into());}if reason.is_none(){let mut occupied=Vec::new();for h in o.capital(b)?{let r=o.roots.iter().find(|r|r.ship==h).ok_or(8u32)?;let body=b.iter().find(|b|b.handle==h).ok_or(4u32)?;occupied.push(([body.motion[0],body.motion[1]],r.radius,control_ship(b,h)?.flags&(ship_state::DEAD|ship_state::RETREATED)==0));}for h in &list.items{let r=o.roots.iter().find(|r|r.ship==*h).ok_or(8u32)?;match o.entry_position(list.team,r.radius,r.station,&occupied,b){Ok(p)=>occupied.push((p,r.radius,true)),Err(8)=>{reason=Some("本方入场边缘拥堵，请稍后部署。".into());break;},Err(e)=>return Err(e)}}}if reason.is_none(){born=o.deploy(b,&list.items,list.team)?;}}}
            1=>{if list.target.is_some(){return Err(2);}if o.result.is_some(){reason=Some("战斗已结束。".into());}else if !o.enabled{reason=Some("本场没有后备舰队撤退规则。".into());}else if list.items.is_empty()&&!list.withdraw{reason=Some("不能下达撤退。".into());}else{if list.items.iter().any(|h|o.roots.iter().any(|r|r.ship==*h&&r.station)){reason=Some("空间站不能撤退。".into());}else{for h in &list.items{if o.roots.iter().find(|r|r.ship==*h).is_none_or(|r|control_team(b,*h)!=Ok(list.team)||o.status(b,r)!=Ok(s::Status::Deployed)){reason=Some("只能撤退本队在场舰船。".into());break;}}}if reason.is_none(){o.request_retreat(b,world,specs,&list.items,list.team,list.withdraw)?;}}}
            2=>{if list.withdraw{return Err(2);}let target=list.target.ok_or(2u32)?;if o.result.is_some(){reason=Some("战斗已结束。".into());}else{let mut owns=!list.items.is_empty();for h in &list.items{owns&=control_owns(o,b,Unit::Ship(*h))?;}if !owns{reason=Some("无效的护航编组。".into());}else{let mut friendly=control_friendly(o,b,target)?;for h in &list.items{friendly&=control_friendly(o,b,*h)?;}if !friendly{reason=Some("护航舰或目标已离开战场。".into());}else{let mut engine_valid=!list.items.contains(&target);for h in &list.items{engine_valid&=engine_friendly(o,b,*h)?;}engine_valid&=engine_order(o,b,Unit::Ship(list.items[0]),s::Kind::Escort,Some(target))?;if !engine_valid{next_rejected_order(o)?;reason=Some("护航指令未生效，请检查指挥点或舰船状态。".into());}else if !o.escort(b,&list.items,target,time,visual)?{reason=Some("护航指令未生效，请检查指挥点或舰船状态。".into());}}}}}
            _=>return Err(2)}}
        197=>{pad(v,1)?;let limit=int(v[0])?;if limit==0||limit>20000{return Err(2);}if o.list.is_some(){return Err(8);}if o.result.is_some(){reason=Some("战斗已经结束，不能继续部署。".into());}else{let used=[o.simulation_used(b,true)?,o.simulation_used(b,false)?];if !o.simulation||used[0].max(used[1])>limit as f64{reason=Some("不能低于场上舰船已经占用的部署点，且只能调整模拟战斗。".into());}else{o.simulation_limit=limit as f64;}}}
        _=>unreachable!()
    }
    let accepted=reason.is_none();flush_audio(o,world)?;events.push((b[own].id,owner,Notice{system:tag,kind:COMMAND_RESULT,value:accepted as u32 as f64,detail:[0.0;2]}));Ok((born,Some(crate::scene_commands::Outcome{accepted,reason})))
}
pub fn apply(tag:u32,v:&[f64],scene:&mut Option<Owned>,b:&mut[Body],world:&mut world_owner::Owned,specs:&BTreeMap<u32,Spec>,own:usize,time:f64,visual:&mut Random,events:&mut Vec<(u32,Handle,Notice)>)->Result<Vec<Handle>,u32>{
    let owner=b.get(own).ok_or(4u32)?.handle;
    if tag==151{pad(v,15)?;if scene.is_some(){return Err(8);}let enemy=handle(&v[0..2],b)?;let mut o=Owned::new(owner,enemy);let flags=int(v[2])?;if flags>255||int(v[13])?>2{return Err(2);}
        o.enabled=flags&1!=0;o.simulation=flags&2!=0;o.primary_enemy_deployed=flags&4!=0;o.multi_team=flags&8!=0;o.open=flags&16!=0;o.autopilot=flags&32!=0;o.multirate=flags&64!=0;o.map=flags&128!=0;
        o.limit=v[3];o.simulation_limit=v[4];o.command_rate=v[5];o.profile=int(v[13])?;o.manual_weapon=handle(&v[11..13],b)?;
        o.admission=Some(s::Admission{roots:int(v[6])?as usize,automatic:int(v[7])?as usize,external:int(v[8])?as usize,full_rate:int(v[9])?as usize});if v[10]!=0.0||v[14]!=0.0{return Err(2);}*scene=Some(o);return Ok(Vec::new());}
    let o=scene.as_mut().ok_or(8u32)?;
    if owner!=o.player{return Err(8);}
    let mut born=Vec::new();let mut accepted=true;
    match tag{
        152=>{pad(v,7)?;let a=o.admission.as_ref().ok_or(8u32)?;let h=handle(&v[..2],b)?;if o.roots.len()>=a.roots||o.roots.iter().any(|r|r.ship==h){return Err(8);}
            if int(v[2])?as usize!=o.roots.len(){return Err(8);}o.roots.push(s::Root{ship:h,cost:v[3],pending:flag(v[4])?,station:flag(v[5])?,radius:v[6]});if o.simulation&&h==o.player{o.simulation_costs.push((h,v[3]));}}
        153=>{pad(v,4)?;let a=o.admission.as_ref().ok_or(8u32)?;match int(v[0])?{
            0=>{let t=int(v[2])?;if v[3]!=0.0||int(v[1])?as usize!=o.automatic.len()||o.automatic.len()>=a.automatic||o.automatic.contains(&t){return Err(8);}o.automatic.push(t);}
            k@1..=2=>{let h=handle(&v[2..4],b)?;let(entries,count)=if k==1{(&mut o.externally_controlled,a.external)}else{(&mut o.full_rate,a.full_rate)};
                if int(v[1])?as usize!=entries.len()||entries.len()>=count||entries.contains(&h){return Err(8);}entries.push(h);}
            _=>return Err(2)}}
        154=>{pad(v,0)?;let a=o.admission.take().ok_or(8u32)?;if o.roots.len()!=a.roots||o.automatic.len()!=a.automatic||o.externally_controlled.len()!=a.external||o.full_rate.len()!=a.full_rate{return Err(8);}o.validate(b)?;o.set_angles(b)?;}
        155=>{pad(v,5)?;if o.admission.is_some()||o.list.is_some(){return Err(8);}match int(v[0])?{
            0=>{o.clear_input(b,world,specs,o.player)?;crate::scene_control::stop_firing(o,b)?;o.toggle_map()?;}
            1=>{if o.map{o.toggle_map()?;}}
            2=>{let selection=if v[1]==2.0{if v[2..].iter().any(|v|*v!=0.0){return Err(2);}None}else{Some(unit(&v[1..4],b)?)};o.select(b,selection,visual)?;}
            3=>{o.clear_input(b,world,specs,o.player)?;crate::scene_control::stop_firing(o,b)?;}
            4=>{crate::scene_control::stop_firing(o,b)?;}
            5=>{let pilot=flag(v[1])?;let s=b[own].ship.as_ref().ok_or(8u32)?;if o.result.is_some()||s.flags&(ship_state::DEAD|ship_state::RETREATED|ship_state::DOCKED|ship_state::RETREATING)!=0||s.armor.as_ref().is_none_or(|a|a.data[14]<=0.0){return Err(8);}
                crate::scene_control::pilot(o,b,world,specs,pilot)?;}
            6=>{let u=unit(&v[1..4],b)?;if let Unit::Ship(h)=u{if !o.roots.iter().any(|r|r.ship==h)||b.iter().find(|b|b.handle==h).and_then(|b|b.ship.as_ref()).and_then(|s|s.combat.as_ref()).is_none_or(|c|c.team!=b[own].ship.as_ref().unwrap().combat.as_ref().unwrap().team){return Err(8);}
                    if !o.orders.iter().any(|(unit,_)|*unit==u)&&o.orders.iter().any(|(u,_)|*u==Unit::Fleet){return Err(8);}}
                o.cancel(b,u,time,visual)?;}
            7=>{accepted=o.set_target(b,optional(&v[1..4],b)?)?;}
            8=>{let target=handle(&v[1..3],b)?;let units:Vec<_>=o.orders.iter().filter(|(_,order)|order.target==Some(target)).map(|(u,_)|*u).collect();for u in units{o.cancel(b,u,time,visual)?;}}
            _=>return Err(2)}}
        156=>{pad(v,10)?;if o.admission.is_some()||o.list.is_some(){return Err(8);}let u=unit(&v[0..3],b)?;let kind=match int(v[3])?{0=>s::Kind::Assault,1=>s::Kind::Engage,2=>s::Kind::Avoid,3=>s::Kind::Defend,4=>s::Kind::Escort,5=>s::Kind::Waypoint,_=>return Err(2)};
            let target=optional(&v[4..7],b)?;let point=if flag(v[7])?{Some([v[8],v[9]])}else if v[8]==0.0&&v[9]==0.0{None}else{return Err(2)};
            accepted=o.issue(b,u,kind,target,point,time,visual)?;}
        157=>{pad(v,7)?;if o.admission.is_some()||o.list.is_some(){return Err(8);}let action=int(v[0])?;if action>2{return Err(2);}let count=int(v[1])?as usize;if count>4096{return Err(2);}
            let team=int(v[2])?;if b[own].ship.as_ref().and_then(|s|s.combat.as_ref()).is_none_or(|c|c.team!=team){return Err(8);}o.list=Some(s::List{action,count,team,withdraw:flag(v[3])?,target:optional(&v[4..7],b)?,items:Vec::new()});}
        158=>{pad(v,3)?;let list=o.list.as_mut().ok_or(8u32)?;let h=handle(&v[1..3],b)?;if int(v[0])?as usize!=list.items.len()||list.items.len()>=list.count||list.items.contains(&h){return Err(8);}list.items.push(h);}
        159=>{pad(v,0)?;let list=o.list.take().ok_or(8u32)?;if list.items.len()!=list.count{return Err(8);}match list.action{
            0=>{if list.withdraw||list.target.is_some(){return Err(2);}born=o.deploy(b,&list.items,list.team)?;}
            1=>{if !o.enabled||list.target.is_some(){return Err(8);}o.request_retreat(b,world,specs,&list.items,list.team,list.withdraw)?;}
            2=>{if list.withdraw{return Err(2);}accepted=o.escort(b,&list.items,list.target.ok_or(8u32)?,time,visual)?;}
            _=>return Err(2)}}
        165=>sample(o,owner,v)?,
        _=>return Err(2)
    }
    if tag>=155&&tag!=157&&tag!=158&&tag!=165{events.push((b[own].id,owner,Notice{system:tag,kind:COMMAND_RESULT,value:accepted as u32 as f64,detail:[0.0;2]}));}
    Ok(born)
}
