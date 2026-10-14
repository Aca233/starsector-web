//! Full startup AI authority, with ordered chunk admission and final validation.
//! Tags121..130; root owns transaction and tick-zero router enforcement.
use crate::{ai_resident as r,ai_owner as a,tactical_ai as t,lifecycle::Spec,state::{Body,Handle},world_owner};
use std::collections::BTreeMap;
#[derive(Clone)]pub struct Draft{strings:[Vec<u16>;4],lengths:[usize;4],present:[bool;4],mounts:usize,systems:usize,wings:usize,attachment:bool,initial:bool,memory:bool,target:Option<t::Identity>}
#[derive(Clone)]pub struct Admission{count:usize,policy_rows:usize,drafts:Vec<Draft>}
fn int(n:f64)->Result<u32,u32>{if n.is_finite()&&n>=0.0&&n<=u32::MAX as f64&&n.fract()==0.0{Ok(n as u32)}else{Err(2)}}
fn flag(n:f64)->Result<bool,u32>{match n{0.0=>Ok(false),1.0=>Ok(true),_=>Err(2)}}
fn pad(v:&[f64],used:usize)->Result<(),u32>{if v.len()!=22||v[used..].iter().any(|v|*v!=0.0)||v.iter().any(|v|!v.is_finite()){Err(2)}else{Ok(())}}
fn optional(v:&[f64])->Result<Option<f64>,u32>{if flag(v[0])?{Ok(Some(v[1]))}else if v[1]==0.0{Ok(None)}else{Err(2)}}
fn handle(v:&[f64],bodies:&[Body])->Result<Option<t::Identity>,u32>{if flag(v[0])?{let h=Handle{slot:int(v[1])?,generation:int(v[2])?};if !bodies.iter().any(|b|b.handle==h){return Err(4);}r::identity(h).map(Some).map_err(|_|4)}else if v[1]==0.0&&v[2]==0.0{Ok(None)}else{Err(2)}}
fn kind(n:f64)->Result<a::SystemAI,u32>{use a::{SystemAI as A,SpecialAI as S};Ok(match int(n)?{0=>A::None,1=>A::Eclipse,2=>A::AdunForge,3=>A::AdunBarrier,4=>A::AdunRepair,5=>A::Special(S::GlorianaEdict),6=>A::Special(S::HyperionYamato),7=>A::Special(S::HyperionJump),8=>A::Special(S::RocinanteAttitude),9=>A::Special(S::RocinanteLocalFireControl),10=>A::Special(S::Zhefeng),11=>A::Special(S::GravityManeuver),12=>A::Special(S::GravityField),13=>A::Special(S::GravityCollapse),_=>return Err(2)})}
fn order_kind(n:f64)->Result<t::OrderKind,u32>{Ok(match int(n)?{0=>t::OrderKind::Engage,1=>t::OrderKind::Avoid,2=>t::OrderKind::Defend,3=>t::OrderKind::Escort,4=>t::OrderKind::Waypoint,_=>return Err(2)})}
fn text(d:&Draft,index:usize)->Result<String,u32>{if d.strings[index].len()!=d.lengths[index]{return Err(8);}String::from_utf16(&d.strings[index]).map_err(|_|2)}
pub fn apply(tag:u32,v:&[f64],world:&mut world_owner::Owned,bodies:&mut[Body],specs:&BTreeMap<u32,Spec>,own:usize)->Result<(),u32>{
    if own>=bodies.len(){return Err(4);}if tag==121{pad(v,6)?;if world.ai.is_some()||v[0]!=1.0||int(v[1])?as usize!=bodies.len(){return Err(8);}
        let policy=t::Policy{enabled:flag(v[2])?,min_visits:int(v[3])?,min_advantage:v[4],rows:Vec::new()};policy.validate().map_err(|_|2u32)?;
        world.ai=Some(r::Owned{policy,admission:Some(Admission{count:bodies.len(),policy_rows:int(v[5])?as usize,drafts:Vec::new()}),..Default::default()});return Ok(());}
    let ai=world.ai.as_mut().ok_or(8u32)?;let draft=ai.admission.as_mut().ok_or(8u32)?;
    match tag{
        122=>{pad(v,19)?;if ai.actors.len()>=draft.count{return Err(8);}let identity=handle(&[1.0,v[0],v[1]],bodies)?.ok_or(4u32)?;if ai.actors.iter().any(|m|m.identity==identity){return Err(8);}
            let flags=int(v[6])?;if flags>63||v[8]!=-1.0{return Err(2);}let lengths=[int(v[14])?as usize,int(v[16])?as usize,int(v[18])?as usize,0];let present=[true,flag(v[15])?,flag(v[17])?,false];
            if lengths[0]==0||lengths.iter().any(|n|*n>1_000_000)||(!present[1]&&lengths[1]!=0)||(!present[2]&&lengths[2]!=0){return Err(2);}
            draft.drafts.push(Draft{strings:std::array::from_fn(|_|Vec::new()),lengths,present,mounts:int(v[11])?as usize,systems:int(v[12])?as usize,wings:int(v[13])?as usize,attachment:false,initial:false,memory:flags&32!=0,target:None});
            ai.actors.push(r::Actor{identity,stable_id:String::new(),locale_rank:int(v[2])?,spec_speed:v[3],spec_armor:v[4],spec_hp:v[5],attachment:a::Attachment{parent:None,slot:None,x:None,y:None,angle_deg:None},attached_motion:flags&1!=0,tactical_present:flags&2!=0,native_forecast:flags&4!=0,system_drone:flags&8!=0,prevents_ai_venting:flags&16!=0,do_not_back_off:v[7],training_action:-1,system_mode:None,fighter_bays:int(v[9])?as usize,wing_range_multiplier:v[10],wings:Vec::new(),mounts:Vec::new(),systems:Vec::new(),order:None,memory:None,diagnostics:None,defense_facing:None});}
        123=>{let actor=int(v[0])?as usize;let field=int(v[1])?as usize;let count=int(v[3])?as usize;if field>3||count==0||count>18{return Err(2);}pad(v,4+count)?;
            let d=draft.drafts.get_mut(actor).ok_or(4u32)?;let offset=int(v[2])?as usize;if !d.present[field]||offset!=d.strings[field].len()||offset+count>d.lengths[field]{return Err(8);}
            for &n in &v[4..4+count]{d.strings[field].push(u16::try_from(int(n)?).map_err(|_|2u32)?);}}
        124=>{pad(v,10)?;let actor=int(v[0])?as usize;let d=draft.drafts.get_mut(actor).ok_or(4u32)?;if d.attachment{return Err(8);}d.attachment=true;
            ai.actors[actor].attachment=a::Attachment{parent:handle(&v[1..4],bodies)?,slot:None,x:optional(&v[4..6])?,y:optional(&v[6..8])?,angle_deg:optional(&v[8..10])?};}
        125=>{pad(v,5)?;let actor=int(v[0])?as usize;let d=draft.drafts.get(actor).ok_or(4u32)?;let m=&mut ai.actors[actor];if int(v[1])?as usize!=m.wings.len()||m.wings.len()>=d.wings{return Err(8);}m.wings.push(r::Wing{count:v[2],range:optional(&v[3..5])?});}
        126=>{pad(v,15)?;let actor=int(v[0])?as usize;let d=draft.drafts.get(actor).ok_or(4u32)?;let m=&mut ai.actors[actor];if int(v[1])?as usize!=m.mounts.len()||m.mounts.len()>=d.mounts{return Err(8);}
            m.mounts.push(r::MountMeta{component:int(v[2])?,locale_rank:int(v[3])?,dps:v[4],authored_max_speed:v[5],position_turn_rate:v[6],forecast_turn_rate:v[7],fixed:flag(v[8])?,beam_duration:optional(&v[9..11])?,role:match int(v[11])?{0=>r::RoleCertificate::None,1=>r::RoleCertificate::PointDefense,2=>r::RoleCertificate::Axial,_=>return Err(2)},original_point_defense:flag(v[12])?,stage_flags:int(v[13])?,stage_hints:int(v[14])?});}
        127=>{pad(v,6)?;let actor=int(v[0])?as usize;let d=draft.drafts.get(actor).ok_or(4u32)?;let m=&mut ai.actors[actor];if int(v[1])?as usize!=m.systems.len()||m.systems.len()>=d.systems{return Err(8);}m.systems.push(r::SystemMeta{id:int(v[2])?,ai:kind(v[3])?,defense:flag(v[4])?,active_speed_flat:v[5]});}
        128=>{pad(v,14)?;let actor=int(v[0])?as usize;let d=draft.drafts.get_mut(actor).ok_or(4u32)?;if d.initial{return Err(8);}d.initial=true;d.target=handle(&v[1..4],bodies)?;
            if !d.memory&&d.target.is_some(){return Err(8);}let target=handle(&v[7..10],bodies)?;let point=if flag(v[10])?{Some([v[11],v[12]])}else if v[11]==0.0&&v[12]==0.0{None}else{return Err(2)};
            if flag(v[4])?{d.present[3]=true;d.lengths[3]=int(v[6])?as usize;if d.lengths[3]==0||d.lengths[3]>1_000_000{return Err(2);}ai.actors[actor].order=Some(a::Order{id:String::new(),kind:order_kind(v[5])?,target,point,issued_time:v[13]});}
            else if v[5..].iter().any(|n|*n!=0.0){return Err(2);}}
        129=>{pad(v,9)?;let state=int(v[0])?;if state>=324||ai.policy.rows.len()>=draft.policy_rows||ai.policy.rows.iter().any(|r|r.state==state as u16){return Err(2);}ai.policy.rows.push(t::PolicyRow{state:state as u16,q:v[1..5].try_into().unwrap(),visits:[int(v[5])?,int(v[6])?,int(v[7])?,int(v[8])?]});}
        130=>{pad(v,0)?;if ai.actors.len()!=draft.count||draft.drafts.len()!=draft.count||ai.policy.rows.len()!=draft.policy_rows{return Err(8);}let installed=ai.admission.take().unwrap();
            for(m,d)in ai.actors.iter_mut().zip(&installed.drafts){if !d.attachment||!d.initial||m.mounts.len()!=d.mounts||m.systems.len()!=d.systems||m.wings.len()!=d.wings{return Err(8);}m.stable_id=text(d,0)?;
                m.attachment.slot=if d.present[1]{Some(text(d,1)?)}else{None};m.system_mode=if d.present[2]{Some(text(d,2)?)}else{None};if let Some(o)=&mut m.order{o.id=text(d,3)?;}if d.memory{m.initialize_memory(d.target).map_err(|_|8u32)?;}}
            ai.validate(bodies,specs).map_err(|e|match e{a::Error::StaleIdentity=>4u32,a::Error::InvalidNumber=>2u32,_=>8u32})?;
            for m in &ai.actors{let h=r::core_handle(m.identity).map_err(|_|4u32)?;
                let terrain=world.terrain.ships.iter().find(|meta|meta.handle==h).ok_or(4u32)?;if terrain.stable_id!=m.stable_id{return Err(8);}
                if m.order.as_ref().is_some_and(|o|o.target.is_some_and(|h|ai.actor(h).is_err()))||m.memory.as_ref().is_some_and(|mem|mem.target_ship.is_some_and(|h|ai.actor(h).is_err())){return Err(4);}
            }}
        _=>return Err(2)
    }Ok(())
}
