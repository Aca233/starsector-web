//! Actual encounter deployment, orders and settlement. All operations live in
//! Core's whole-battle transaction; reserve constructor bodies remain resident.
use crate::{ai_owner,ai_resident,battle::Ordnance,contact,lifecycle::Spec,motion,
    phase_runtime,random::Random,ship_state::{self,Notice},state::{Body,Handle},
    tactical_ai::OrderKind,world_damage,world_owner};
use std::{collections::BTreeMap,f64::consts::PI};
pub const HALF_EXTENT:f64=6000.0;
#[derive(Clone)]pub struct Root{pub ship:Handle,pub cost:f64,pub pending:bool,pub station:bool,pub radius:f64}
#[derive(Clone,Copy,PartialEq,Eq)]pub enum Status{Reserve,Deployed,Retreating,Retreated,Destroyed}
#[derive(Clone,Copy,PartialEq,Eq)]pub enum Unit{Fleet,Ship(Handle)}
#[derive(Clone,Copy,PartialEq,Eq)]pub enum Kind{Assault,Engage,Avoid,Defend,Escort,Waypoint}
#[derive(Clone)]pub struct Order{pub id:String,pub kind:Kind,pub target:Option<Handle>,pub point:Option<[f64;2]>,pub time:f64}
#[derive(Clone)]pub struct Audio{pub sequence:u64,pub key:String,pub volume:f64}
#[derive(Clone)]pub struct Text{pub id:f64,pub position:[f64;2],pub text:String,pub color:[u8;3],pub size:f64,pub life:f64,pub max_life:f64}
#[derive(Clone)]pub struct Radio{pub id:f64,pub sender:String,pub faction:String,pub text:String,pub color:[u8;3],pub time:f64}
#[derive(Clone)]pub struct Admission{pub roots:usize,pub automatic:usize,pub external:usize,pub full_rate:usize}
#[derive(Clone)]pub struct List{pub action:u32,pub count:usize,pub team:u32,pub withdraw:bool,pub target:Option<Handle>,pub items:Vec<Handle>}
#[derive(Clone)]pub struct ControlSample{pub autopilot:bool,pub blocked:bool,pub keys:u32,pub aim:[f64;2],pub firing:bool,pub mouse:bool,pub pointer:bool,pub field:bool,pub push:bool}
#[derive(Clone)]pub struct Owned{
    pub player:Handle,pub enemy:Handle,pub roots:Vec<Root>,pub enabled:bool,pub limit:f64,
    pub automatic:Vec<u32>,pub angles:Vec<(u32,f64)>,pub next_wave:f64,
    pub simulation:bool,pub simulation_limit:f64,pub simulation_costs:Vec<(Handle,f64)>,pub primary_enemy_deployed:bool,pub multi_team:bool,pub open:bool,
    pub cp:f64,pub recovery:f64,pub order_sequence:u64,pub orders:Vec<(Unit,Order)>,pub selected:Option<Unit>,pub map:bool,
    pub autopilot:bool,pub manual_weapon:Handle,pub player_target:Option<Handle>,
    pub externally_controlled:Vec<Handle>,pub full_rate:Vec<Handle>,pub command_rate:f64,
    pub result:Option<world_damage::ResultStats>,pub winning_team:Option<u32>,pub aftermath:f64,
    pub audio:Vec<Audio>,pub audio_sequence:u64,pub texts:Vec<Text>,pub radio:Vec<Radio>,
    pub admission:Option<Admission>,pub list:Option<List>,pub sample:Option<ControlSample>,pub profile:u32,pub multirate:bool,
    pub prelude:Option<crate::scene_prelude::Owned>,
    pub read:crate::scene_read::Owned,
    pub startup:crate::scene_startup::Owned,
    pub system_read:crate::scene_system_publication::Owned,
    pub seats:Option<crate::scene_seat::Owned>,
}
fn row(b:&[Body],h:Handle)->Result<usize,u32>{b.iter().position(|b|b.handle==h).ok_or(4)}
fn ship(b:&[Body],h:Handle)->Result<&ship_state::ShipState,u32>{b[row(b,h)?].ship.as_ref().ok_or(8)}
fn team(b:&[Body],h:Handle)->Result<u32,u32>{Ok(ship(b,h)?.combat.as_ref().ok_or(8u32)?.team)}
fn hp(b:&[Body],h:Handle)->Result<f64,u32>{Ok(ship(b,h)?.armor.as_ref().ok_or(8u32)?.data[14])}
fn available(b:&[Body],h:Handle)->Result<bool,u32>{Ok(ship(b,h)?.flags&(ship_state::DEAD|ship_state::RETREATED|ship_state::DOCKED)==0&&hp(b,h)?>0.0)}
fn distance(a:[f64;2],b:[f64;2])->f64{contact::length([a[0]-b[0],a[1]-b[1]])}
fn pos(b:&[Body],h:Handle)->Result<[f64;2],u32>{let b=&b[row(b,h)?];Ok([b.motion[0],b.motion[1]])}
impl Owned{
    pub fn new(player:Handle,enemy:Handle)->Self{Self{player,enemy,roots:Vec::new(),enabled:false,limit:240.0,
        automatic:Vec::new(),angles:Vec::new(),next_wave:5.0,simulation:false,simulation_limit:240.0,simulation_costs:Vec::new(),primary_enemy_deployed:true,multi_team:false,open:true,
        cp:5.0,recovery:0.0,order_sequence:0,orders:Vec::new(),selected:None,map:false,autopilot:false,manual_weapon:player,player_target:None,
        externally_controlled:Vec::new(),full_rate:Vec::new(),command_rate:0.0,result:None,winning_team:None,aftermath:0.0,
        audio:Vec::new(),audio_sequence:0,texts:Vec::new(),radio:Vec::new(),admission:None,list:None,sample:None,profile:0,multirate:true,prelude:None,read:crate::scene_read::Owned::default(),startup:crate::scene_startup::Owned::default(),system_read:crate::scene_system_publication::Owned::default(),seats:None}}
    pub fn validate(&self,bodies:&[Body])->Result<(),u32>{
        if let Some(seats)=&self.seats{seats.validate(self,bodies)?;}
        row(bodies,self.player)?;row(bodies,self.enemy)?;row(bodies,self.manual_weapon)?;
        if self.admission.is_some()||self.list.is_some()||self.roots.is_empty()||![self.limit,self.simulation_limit,self.command_rate,self.cp,self.recovery,self.next_wave,self.aftermath].iter().all(|n|n.is_finite())
            ||self.limit<=0.0||self.limit>20000.0||self.cp<0.0||self.recovery<0.0{return Err(8);}
        for(i,r)in self.roots.iter().enumerate(){let s=ship(bodies,r.ship)?;
            if !r.cost.is_finite()||r.cost<=0.0||!r.radius.is_finite()||r.radius<0.0||self.roots[..i].iter().any(|p|p.ship==r.ship)
                ||s.world.as_ref().is_none_or(|w|w.parent.is_some()){return Err(8);}if self.enabled&&r.cost>self.limit{return Err(8);}}
        if !self.roots.iter().any(|r|r.ship==self.player){return Err(8);}
        for(i,(h,cost))in self.simulation_costs.iter().enumerate(){if !self.simulation||!cost.is_finite()||*cost<=0.0||!self.roots.iter().any(|r|r.ship==*h)||self.simulation_costs[..i].iter().any(|(other,_)|other==h){return Err(8);}}
        if self.enabled{let mut teams=Vec::new();for r in &self.roots{let t=team(bodies,r.ship)?;if !teams.contains(&t){teams.push(t);}}
            for t in teams{if !self.roots.iter().any(|r|!r.pending&&team(bodies,r.ship)==Ok(t))||self.used(bodies,t)?>self.limit{return Err(8);}}}
        if let Some(t)=self.player_target{row(bodies,t)?;}Ok(())
    }
    pub fn set_angles(&mut self,bodies:&[Body])->Result<(),u32>{self.angles.clear();for r in &self.roots{
        let t=team(bodies,r.ship)?;if r.pending||self.angles.iter().any(|(team,_)|*team==t){continue;}let p=pos(bodies,r.ship)?;
        self.angles.push((t,if contact::length(p)>0.0{p[1].atan2(p[0])}else if t==0{PI/2.0}else{-PI/2.0}));}Ok(())}
    pub fn status(&self,b:&[Body],r:&Root)->Result<Status,u32>{let s=ship(b,r.ship)?;Ok(if s.flags&ship_state::DEAD!=0||hp(b,r.ship)?<=0.0{Status::Destroyed}
        else if s.flags&ship_state::RETREATED!=0{Status::Retreated}else if r.pending{Status::Reserve}else if s.flags&ship_state::RETREATING!=0{Status::Retreating}else{Status::Deployed})}
    pub fn capital(&self,b:&[Body])->Result<Vec<Handle>,u32>{let mut out=Vec::new();for r in &self.roots{
        if !r.pending&&ship(b,r.ship)?.flags&ship_state::RETREATED==0&&(r.ship!=self.enemy||self.primary_enemy_deployed){out.push(r.ship);}}Ok(out)}
    pub fn used(&self,b:&[Body],t:u32)->Result<f64,u32>{let mut cost=0.0;for r in &self.roots{
        if team(b,r.ship)?==t&&!r.pending&&ship(b,r.ship)?.flags&(ship_state::DEAD|ship_state::RETREATED)==0&&hp(b,r.ship)?>0.0{cost+=r.cost;}}Ok(cost)}
    pub fn simulation_used(&self,b:&[Body],player:bool)->Result<f64,u32>{let mut total=0.0;for h in self.capital(b)?{let s=ship(b,h)?;
        if s.flags&(ship_state::DEAD|ship_state::RETREATED)==0&&s.combat.as_ref().ok_or(8u32)?.player==Some(player){total+=self.simulation_costs.iter().find(|(owner,_)|*owner==h).map_or(0.0,|(_,cost)|*cost);}}Ok(total)}
    pub fn deploy(&mut self,b:&mut[Body],ids:&[Handle],t:u32)->Result<Vec<Handle>,u32>{
        if !self.enabled||self.result.is_some()||ids.is_empty(){return Err(8);}let mut cost=0.0;
        for(i,h)in ids.iter().enumerate(){if ids[..i].contains(h){return Err(8);}let r=self.roots.iter().find(|r|r.ship==*h).ok_or(4u32)?;
            if team(b,*h)?!=t||self.status(b,r)?!=Status::Reserve{return Err(8);}cost+=r.cost;}
        if self.used(b,t)?+cost>self.limit{return Err(8);}let mut occupied=Vec::new();for h in self.capital(b)?{
            let r=self.roots.iter().find(|r|r.ship==h).unwrap();occupied.push((pos(b,h)?,r.radius,ship(b,h)?.flags&(ship_state::DEAD|ship_state::RETREATED)==0));}
        let mut positions=Vec::new();for h in ids{let r=self.roots.iter().find(|r|r.ship==*h).unwrap();let p=self.entry_position(t,r.radius,r.station,&occupied,b)?;
            positions.push(p);occupied.push((p,r.radius,true));}
        for(&h,p)in ids.iter().zip(positions){let body=&mut b[row(b,h)?];body.motion[0]=p[0];body.motion[1]=p[1];body.motion[4]=(-p[1]).atan2(-p[0]);
            let w=body.ship.as_mut().and_then(|s|s.world.as_mut()).ok_or(8u32)?;w.previous=p;w.previous_facing=body.motion[4];
            self.roots.iter_mut().find(|r|r.ship==h).unwrap().pending=false;}
        Ok(ids.to_vec())
    }
    pub fn entry_position(&self,t:u32,r:f64,station:bool,occupied:&[([f64;2],f64,bool)],b:&[Body])->Result<[f64;2],u32>{
        let angle=self.angles.iter().find(|(team,_)|*team==t).map_or(if t==team(b,self.player)?{PI/2.0}else{-PI/2.0},|(_,a)|*a);
        let n=[angle.cos(),angle.sin()];let tangent=[-n[1],n[0]];let edge=HALF_EXTENT/n[0].abs().max(n[1].abs());
        for i in 0..256{let lane=if i%2==0{1.0}else{-1.0}*(i as f64/2.0).ceil()*(r*2.0+220.0);
            let along=if station{edge-r-600.0}else{edge+r+200.0}+(lane.abs()/8000.0).floor()*(r*2.0+220.0)*if station{-1.0}else{1.0};
            let p=[n[0]*along+tangent[0]*(lane%8000.0),n[1]*along+tangent[1]*(lane%8000.0)];
            if !occupied.iter().any(|(at,radius,live)|*live&&distance(*at,p)<radius+r+180.0){return Ok(p);}}
        Err(8)
    }
    pub fn automatic_wave(&mut self,b:&mut[Body],time:f64)->Result<Vec<Handle>,u32>{if !self.enabled||self.result.is_some(){return Ok(Vec::new());}
        let wave=time>=self.next_wave;if wave{self.next_wave=time+5.0;}let mut teams=Vec::new();for r in &self.roots{let t=team(b,r.ship)?;if !teams.contains(&t){teams.push(t);}}
        let mut born=Vec::new();for t in teams{let alive=self.capital(b)?.iter().any(|h|team(b,*h)==Ok(t)&&hp(b,*h).is_ok_and(|hp|hp>0.0)&&ship(b,*h).is_ok_and(|s|s.flags&(ship_state::DEAD|ship_state::RETREATED)==0));
            if alive&&!(wave&&self.automatic.contains(&t)){continue;}let mut room=self.limit-self.used(b,t)?;let mut ids=Vec::new();
            for r in &self.roots{if team(b,r.ship)?==t&&self.status(b,r)?==Status::Reserve&&r.cost<=room{ids.push(r.ship);room-=r.cost;}}
            if !ids.is_empty(){born.extend(self.deploy(b,&ids,t)?);}}Ok(born)
    }
    pub fn request_retreat(&mut self,b:&mut[Body],world:&mut world_owner::Owned,specs:&BTreeMap<u32,Spec>,ids:&[Handle],t:u32,withdraw:bool)->Result<(),u32>{
        if self.result.is_some()||ids.is_empty()&&!withdraw{return Err(8);}for(i,h)in ids.iter().enumerate(){let r=self.roots.iter().find(|r|r.ship==*h).ok_or(4u32)?;
            if ids[..i].contains(h)||r.station||team(b,*h)?!=t||self.status(b,r)?!=Status::Deployed{return Err(8);}}
        if withdraw{for r in &self.roots{if r.pending&&team(b,r.ship)?==t{let i=row(b,r.ship)?;b[i].ship.as_mut().unwrap().flags|=ship_state::RETREATED;}}}
        for h in ids{let i=row(b,*h)?;b[i].ship.as_mut().unwrap().flags|=ship_state::RETREATING;self.clear_input(b,world,specs,*h)?;self.orders.retain(|(u,_)|*u!=Unit::Ship(*h));}Ok(())
    }
    pub fn clear_input(&self,b:&mut[Body],world:&mut world_owner::Owned,specs:&BTreeMap<u32,Spec>,h:Handle)->Result<(),u32>{let i=row(b,h)?;b[i].motion[motion::TURN..=motion::STRAFE].fill(0.0);
        let s=b[i].ship.as_mut().ok_or(8u32)?;s.flags&=!ship_state::BRAKE;let q=s.combat.as_mut().and_then(|c|c.query.as_mut()).ok_or(8u32)?;q.trigger=false;
        phase_runtime::clear_held(world,b,i,specs)
    }
    pub fn navigate_retreat(&self,b:&mut[Body],world:&mut world_owner::Owned,specs:&BTreeMap<u32,Spec>,h:Handle,events:&mut Vec<(u32,Handle,Notice)>)->Result<(),u32>{
        let Some(_) = self.roots.iter().find(|r|r.ship==h)else{return Ok(());};let s=ship(b,h)?;if s.flags&ship_state::RETREATING==0||s.flags&(ship_state::RETREATED|ship_state::DEAD)!=0{return Ok(());}
        let angle=self.angles.iter().find(|(t,_)|team(b,h)==Ok(*t)).ok_or(8u32)?.1;let n=[angle.cos(),angle.sin()];let i=row(b,h)?;let p=pos(b,h)?;let radius=s.combat.as_ref().ok_or(8u32)?.radius;
        if p[0]*n[0]+p[1]*n[1]>HALF_EXTENT/n[0].abs().max(n[1].abs())+radius{phase_runtime::retreat(world,b,i,specs,events)?;
            b[i].motion[0]=p[0];b[i].motion[1]=p[1];let w=b[i].ship.as_mut().and_then(|s|s.world.as_mut()).ok_or(8u32)?;w.previous=p;return Ok(());}
        let delta=angle-b[i].motion[4];let error=delta.sin().atan2(delta.cos());b[i].motion[motion::TURN]=(error*2.0).clamp(-1.0,1.0);b[i].motion[motion::STRAFE]=0.0;b[i].motion[motion::THROTTLE]=if error.abs()<0.7{1.0}else{0.0};Ok(())
    }
    pub fn sound(&mut self,key:&str,volume:f64)->Result<(),u32>{self.audio_sequence=self.audio_sequence.checked_add(1).ok_or(5u32)?;self.audio.push(Audio{sequence:self.audio_sequence,key:key.into(),volume});Ok(())}
    fn text(&mut self,p:[f64;2],text:&str,color:[u8;3],size:f64,life:f64,visual:&mut Random){self.texts.push(Text{id:visual.next(),position:p,text:text.into(),color,size,life,max_life:life});}
    fn message(&mut self,sender:&str,text:&str,color:[u8;3],time:f64,visual:&mut Random)->Result<(),u32>{self.radio.push(Radio{id:visual.next_id(),sender:sender.into(),faction:"PLAYER".into(),text:text.into(),color,time});
        if self.radio.len()>8{self.radio.remove(0);}self.sound("comm_radio",0.65)}
    pub fn toggle_map(&mut self)->Result<(),u32>{self.map=!self.map;self.sound(if self.map{"map_open"}else{"map_close"},0.85)}
    pub fn select(&mut self,b:&[Body],u:Option<Unit>,visual:&mut Random)->Result<(),u32>{if self.selected==u{return Ok(());}if let Some(Unit::Ship(h))=u{
            if !self.capital(b)?.contains(&h)||team(b,h)?!=team(b,self.player)?||!available(b,h)?{return Err(8);}}
        self.selected=u;if let Some(u)=u{self.sound("map_open",0.8)?;let title=if u==Unit::Ship(self.player){"FLAGSHIP SELECTED"}else{let stable=match u{Unit::Fleet=>"fleet".to_string(),Unit::Ship(h)=>String::from_utf16(&ship(b,h)?.combat.as_ref().and_then(|c|c.death.as_ref()).ok_or(8u32)?.strings[3]).map_err(|_|8u32)?};
                if stable.contains("ftr"){"BROADSWORD WING SELECTED"}else if stable.contains("bmr"){"DAGGER FLIGHT SELECTED"}else{"UNIT SELECTED"}};
            self.text(pos(b,self.player)?,title,[80,220,255],15.0,1.5,visual);}else{self.sound("command_deselect",0.7)?;}Ok(())}
    pub fn advance_cp(&mut self,b:&[Body],dt:f64)->Result<(),u32>{let flags=ship(b,self.player)?.flags;let rate=if flags&(ship_state::DEAD|ship_state::RETREATED)==0{self.command_rate}else{0.0};
        self.recovery+=dt.max(0.0)*(1.0+rate).max(0.0);let recovered=(self.recovery/120.0).floor();if recovered!=0.0{self.cp+=recovered;self.recovery-=recovered*120.0;}Ok(())}
    fn valid_order(&self,b:&[Body],unit:Unit,kind:Kind,target:Option<Handle>,point:Option<[f64;2]>)->Result<(),u32>{
        if self.result.is_some(){return Err(8);}let own=team(b,self.player)?;let capital=self.capital(b)?;
        let friendly=|h|capital.contains(&h)&&team(b,h)==Ok(own)&&available(b,h)==Ok(true);
        if match unit{Unit::Fleet=>!capital.iter().any(|h|friendly(*h)),Unit::Ship(h)=>!friendly(h)}{return Err(8);}
        if matches!(kind,Kind::Waypoint|Kind::Defend)&&point.is_none_or(|p|p.iter().any(|n|!n.is_finite())){return Err(2);}
        if let Some(p)=point{if p.iter().any(|n|!n.is_finite()){return Err(2);}}
        if matches!(kind,Kind::Engage|Kind::Avoid|Kind::Escort){let t=target.ok_or(8u32)?;if !self.active(b)?.contains(&t)||!available(b,t)?{return Err(8);}
            if kind==Kind::Escort{if team(b,t)?!=own||unit==Unit::Fleet||unit==Unit::Ship(t){return Err(8);}}
            else if team(b,t)?==own||!ship(b,t)?.combat.as_ref().and_then(|c|c.query.as_ref()).ok_or(8u32)?.visible.iter().any(|(t,v)|*t==own&&*v){return Err(8);}}
        Ok(())
    }
    pub fn issue(&mut self,b:&[Body],unit:Unit,kind:Kind,target:Option<Handle>,point:Option<[f64;2]>,time:f64,visual:&mut Random)->Result<bool,u32>{
        self.valid_order(b,unit,kind,target,point)?;self.order_sequence=self.order_sequence.checked_add(1).ok_or(5u32)?;
        if self.cp<=0.0{self.sound("command_out_of_cp",0.9)?;self.text(pos(b,self.player)?,"! OUT OF COMMAND POINTS !",[255,60,60],18.0,2.0,visual);return Ok(false);}
        self.cp-=1.0;let order=Order{id:format!("tactical-{}",self.order_sequence),kind,target,point,time};
        if let Some((_,o))=self.orders.iter_mut().find(|(u,_)|*u==unit){*o=order;}else{self.orders.push((unit,order));}
        let p=pos(b,self.player)?;match kind{
            Kind::Assault=>{self.sound("command_engage",0.85)?;self.message("战术指挥",if unit==Unit::Fleet{"全舰解除原有任务，自主选择敌舰进攻。"}else{"该舰解除原有任务，自主选择敌舰进攻。"},[160,230,140],time,visual)?;}
            Kind::Defend|Kind::Escort|Kind::Avoid=>{self.sound("command_waypoint",0.85)?;self.message("战术指挥",match kind{Kind::Defend=>"保持指定防守位置。",Kind::Escort=>"护航舰已派出。",_=>"与指定敌舰拉开距离。"},[120,220,255],time,visual)?;}
            Kind::Engage=>{self.sound("command_engage",0.85)?;self.text(p,"DIRECT ENGAGE ORDER ISSUED",[255,100,100],15.0,1.6,visual);self.message("战术指挥","已向编队下达集火强袭指令！",[255,120,120],time,visual)?;}
            Kind::Waypoint=>{self.sound("command_waypoint",0.85)?;self.text(point.unwrap(),"WAYPOINT DESIGNATED",[100,220,255],14.0,1.6,visual);self.message("领航火控","战术航路点已标定，机动单元按标点机动。",[120,220,255],time,visual)?;}}
        if unit==Unit::Fleet{let own=team(b,self.player)?;let friendly=self.capital(b)?;self.orders.retain(|(u,_)|match u{Unit::Fleet=>true,Unit::Ship(h)=>!friendly.contains(h)||team(b,*h)!=Ok(own)||available(b,*h)!=Ok(true)});}Ok(true)
    }
    pub fn escort(&mut self,b:&[Body],units:&[Handle],target:Handle,time:f64,visual:&mut Random)->Result<bool,u32>{if units.is_empty(){return Err(8);}for(i,h)in units.iter().enumerate(){if units[..i].contains(h){return Err(8);}self.valid_order(b,Unit::Ship(*h),Kind::Escort,Some(target),None)?;}
        if !self.issue(b,Unit::Ship(units[0]),Kind::Escort,Some(target),None,time,visual)?{return Ok(false);}let order=self.orders.iter().find(|(u,_)|*u==Unit::Ship(units[0])).unwrap().1.clone();
        for h in &units[1..]{if let Some((_,o))=self.orders.iter_mut().find(|(u,_)|*u==Unit::Ship(*h)){*o=order.clone();}else{self.orders.push((Unit::Ship(*h),order.clone()));}}Ok(true)
    }
    pub fn cancel(&mut self,b:&[Body],unit:Unit,time:f64,visual:&mut Random)->Result<(),u32>{let Some(i)=self.orders.iter().position(|(u,_)|*u==unit)else{return Ok(());};self.orders.remove(i);self.sound("command_refund",0.8)?;
        self.text(pos(b,self.player)?,"ORDER CANCELLED",[160,230,140],14.0,1.5,visual);self.message("战术指挥","已取消指定战术部署命令。",[160,230,140],time,visual)
    }
    pub fn complete_orders(&mut self,b:&[Body],time:f64,visual:&mut Random)->Result<(),u32>{self.orders.retain(|(unit,o)|{
        let live=|h|ship(b,h).is_ok_and(|s|s.flags&ship_state::DEAD==0);let own=match unit{Unit::Fleet=>true,Unit::Ship(h)=>live(*h)};
        own&&(!matches!(o.kind,Kind::Engage|Kind::Escort|Kind::Avoid)||o.target.is_some_and(live))});
        for h in self.capital(b)?{if let Some((_,o))=self.orders.iter().find(|(u,_)|*u==Unit::Ship(h)){
            if o.kind==Kind::Waypoint&&(ship(b,h)?.flags&ship_state::DEAD!=0||distance(pos(b,h)?,o.point.ok_or(8u32)?)<=90.0){self.cancel(b,Unit::Ship(h),time,visual)?;}}}
        if let Some((_,o))=self.orders.iter().find(|(u,_)|*u==Unit::Fleet){if o.kind==Kind::Waypoint{let destination=o.point.ok_or(8u32)?;let mut arrived=true;
            for h in self.capital(b)?{let s=ship(b,h)?;if s.combat.as_ref().is_some_and(|c|c.player==Some(true))&&s.flags&ship_state::DEAD==0&&!self.orders.iter().any(|(u,_)|*u==Unit::Ship(h))&&distance(pos(b,h)?,destination)>90.0{arrived=false;}}
            if arrived{self.cancel(b,Unit::Fleet,time,visual)?;}}}Ok(())
    }
    pub fn sync_ai_orders(&self,b:&[Body],ai:&mut ai_resident::Owned)->Result<(),u32>{for actor in &mut ai.actors{let h=ai_resident::core_handle(actor.identity).map_err(|_|4u32)?;
        let o=self.orders.iter().find(|(u,_)|*u==Unit::Ship(h)).or_else(||if ship(b,h).is_ok_and(|s|s.combat.as_ref().is_some_and(|c|c.player==Some(true))){self.orders.iter().find(|(u,_)|*u==Unit::Fleet)}else{None});
        actor.order=match o{Some((_,o))if o.kind!=Kind::Assault=>Some(ai_owner::Order{id:o.id.clone(),kind:match o.kind{Kind::Engage=>OrderKind::Engage,Kind::Avoid=>OrderKind::Avoid,Kind::Defend=>OrderKind::Defend,Kind::Escort=>OrderKind::Escort,Kind::Waypoint=>OrderKind::Waypoint,Kind::Assault=>unreachable!()},
            target:o.target.map(ai_resident::identity).transpose().map_err(|_|4u32)?,point:o.point,issued_time:o.time}),_=>None};}Ok(())}
    pub fn resolve_result(&mut self,b:&[Body],world:&world_owner::Owned,time:f64)->Result<(),u32>{if self.result.is_some(){return Ok(());}let capital=self.capital(b)?;
        let live:Vec<_>=capital.into_iter().filter(|h|ship(b,*h).is_ok_and(|s|s.flags&(ship_state::DEAD|ship_state::RETREATED)==0)&&hp(b,*h).is_ok_and(|v|v>0.0)).collect();
        let victory=if self.multi_team{let mut teams=Vec::new();for h in &live{let t=team(b,*h)?;if !teams.contains(&t){teams.push(t);}}if teams.len()>1{return Ok(());}self.winning_team=teams.first().copied();Some(self.winning_team==Some(team(b,self.player)?))}
        else if !live.iter().any(|h|ship(b,*h).is_ok_and(|s|s.combat.as_ref().is_some_and(|c|c.player==Some(true)))){Some(false)}
        else if (!self.simulation||self.primary_enemy_deployed)&&!live.iter().any(|h|ship(b,*h).is_ok_and(|s|s.combat.as_ref().is_some_and(|c|c.player!=Some(true)))){Some(true)}else{None};
        if let Some(victory)=victory{let ratio=|h|->Result<f64,u32>{let a=ship(b,h)?.armor.as_ref().ok_or(8u32)?;Ok((a.data[14]/a.data[13]).max(0.0))};
            let spec=|h|->Result<String,u32>{Ok(ship(b,h)?.combat.as_ref().and_then(|c|c.death.as_ref()).ok_or(8u32)?.spec.id.clone())};
            self.result=Some(world.stats.finalize(victory,time,spec(self.player)?,spec(self.enemy)?,ratio(self.player)?,ratio(self.enemy)?));}Ok(())
    }
    pub fn aftermath(&mut self,b:&mut[Body],world:&mut world_owner::Owned,ordnance:&mut Ordnance,specs:&BTreeMap<u32,Spec>,dt:f64)->Result<(),u32>{
        if self.result.is_none(){return Err(8);}self.aftermath+=dt;let active=self.active(b)?;for h in active{let i=row(b,h)?;let w=b[i].ship.as_mut().and_then(|s|s.world.as_mut()).ok_or(8u32)?;
            w.previous=[b[i].motion[0],b[i].motion[1]];w.previous_facing=b[i].motion[4];self.clear_input(b,world,specs,h)?;
            if ship(b,h)?.flags&(ship_state::DEAD|ship_state::DOCKED|ship_state::RETREATED)==0{b[i].motion[0]+=b[i].motion[2]*dt;b[i].motion[1]+=b[i].motion[3]*dt;b[i].motion[4]+=b[i].motion[5]*dt;}}
        for p in ordnance.projectiles.iter_mut().rev(){p.prev=p.pos;if p.delivery.source()||p.delivery.spawn_type==1{p.prev_tail=p.tail;p.tail[0]+=p.velocity[0]*dt;p.tail[1]+=p.velocity[1]*dt;}
            p.pos[0]+=p.velocity[0]*dt;p.pos[1]+=p.velocity[1]*dt;p.elapsed+=dt;p.range-=contact::length(p.velocity)*dt;}
        for i in (0..ordnance.projectiles.len()).rev(){let p=&ordnance.projectiles[i];if p.range<=0.0||self.aftermath>=5.0{world.emit(world_owner::Output::Explosion(crate::explosion_effects::Output::DetachContrail{target:crate::explosion_effects::Identity{id:p.serial,generation:1}}));ordnance.projectiles.remove(i);}}
        for beam in ordnance.beams.iter_mut().rev(){beam.elapsed+=dt;beam.duration-=dt;beam.damage_active=false;beam.hitting=false;}
        ordnance.beams.retain(|beam|beam.duration>0.0&&self.aftermath<1.0);world.terrain.terrain.advance_asteroids(dt);Ok(())
    }
    pub fn advance_texts(&mut self,dt:f64){for text in self.texts.iter_mut().rev(){text.life-=dt;text.position[1]-=25.0*dt;}self.texts.retain(|t|t.life>0.0);}
    /// Source ships roster excludes pending root assemblies and the simulator's
    /// not-yet-deployed primary enemy; docked wing witnesses are handled by flight.
    pub fn active(&self,b:&[Body])->Result<Vec<Handle>,u32>{let mut out=Vec::new();for body in b{
        let mut root=body.handle;let mut seen=Vec::new();loop{if seen.contains(&root){return Err(8);}seen.push(root);
            if let Some(h)=ship(b,root)?.world.as_ref().and_then(|w|w.parent){root=h;}else{break;}}
        if self.roots.iter().any(|r|r.ship==root&&(r.pending||r.ship==self.enemy&&!self.primary_enemy_deployed)){continue;}
        if ship(b,body.handle)?.flags&ship_state::RETREATED==0{out.push(body.handle);}}Ok(out)}
    pub fn set_target(&mut self,b:&mut[Body],target:Option<Handle>)->Result<bool,u32>{
        if let Some(t)=target{let own=team(b,self.player)?;if !self.active(b)?.contains(&t)||team(b,t)?==own||!available(b,t)?||ship(b,t)?.combat.as_ref().and_then(|c|c.query.as_ref()).is_none_or(|q|q.vast||!q.visible.iter().any(|(t,v)|*t==own&&*v)){return Ok(false);}}
        if ship(b,self.player)?.flags&ship_state::DEAD!=0{return Ok(false);}self.player_target=target;
        let i=row(b,self.player)?;b[i].ship.as_mut().and_then(|s|s.combat.as_mut()).and_then(|c|c.query.as_mut()).ok_or(8u32)?.target=target;Ok(true)
    }
}
