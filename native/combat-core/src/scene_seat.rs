//! Real LAN/Steam seat actors. This state is cloned with the whole scene.
//! No seat is redirected to the host flagship; each scope owns its root,
//! manual weapon and target while sharing the one battle/allocator/RNG.
use crate::{ai_resident,battle::Ordnance,contact,lifecycle::Spec,motion,motion_owner,navigation_ai,
    random::Random,scene_commands::{self,Outcome},scene_control,scene_owner::{self,ControlSample},
    scene_system_read as read,ship_state::{self,Notice},state::{Body,Handle},tactical_ai,world_owner};
use std::collections::BTreeMap;
#[derive(Clone)]pub struct Edge{tag:u32,values:[f64;22]}
#[derive(Clone)]pub struct Seat{pub number:u32,pub root:Handle,pub connected:bool,pub manual:Handle,pub target:Option<Handle>,sample:Option<ControlSample>,edges:Vec<Edge>}
#[derive(Clone)]struct List{seat:u32,operation:u32,count:usize,items:Vec<Handle>}
#[derive(Clone,Default)]pub struct Owned{pub seats:Vec<Seat>,list:Option<List>,teleports:Vec<(Handle,f64,u64)>}
fn integer(n:f64)->Result<u32,u32>{if n.is_finite()&&n>=0.0&&n<=u32::MAX as f64&&n.fract()==0.0{Ok(n as u32)}else{Err(2)}}
fn flag(n:f64)->Result<bool,u32>{match n{0.0=>Ok(false),1.0=>Ok(true),_=>Err(2)}}
fn pad(v:&[f64],n:usize)->Result<(),u32>{if v.len()!=22||v.iter().any(|n|!n.is_finite())||v[n..].iter().any(|n|*n!=0.0){Err(2)}else{Ok(())}}
fn id(h:Handle)->tactical_ai::Identity{tactical_ai::Identity{handle:h.slot,generation:h.generation}}
fn neutral()->ControlSample{ControlSample{autopilot:false,blocked:false,keys:0,aim:[0.0;2],firing:false,mouse:true,pointer:false,field:false,push:false}}
struct Scope{player:Handle,manual:Handle,target:Option<Handle>,autopilot:bool,map:bool,sample:Option<ControlSample>}
impl Scope{
    fn enter(o:&mut scene_owner::Owned,s:&Seat)->Self{let old=Self{player:o.player,manual:o.manual_weapon,target:o.player_target,autopilot:o.autopilot,map:o.map,sample:o.sample.take()};
        o.player=s.root;o.manual_weapon=s.manual;o.player_target=s.target;o.autopilot=false;o.map=false;old}
    fn leave(self,o:&mut scene_owner::Owned,s:&mut Seat){s.manual=o.manual_weapon;s.target=o.player_target;
        o.player=self.player;o.manual_weapon=if s.root==self.player{s.manual}else{self.manual};o.player_target=if s.root==self.player{s.target}else{self.target};o.autopilot=self.autopilot;o.map=self.map;o.sample=self.sample;}
}
impl Owned{
    pub fn connected(&self,h:Handle)->bool{self.seats.iter().any(|s|s.root==h&&s.connected)}
    fn get_mut(&mut self,n:u32,h:Handle)->Result<&mut Seat,u32>{self.seats.iter_mut().find(|s|s.number==n&&s.root==h).ok_or(4)}
    pub fn validate(&self,o:&scene_owner::Owned,b:&[Body])->Result<(),u32>{if self.seats.is_empty()||self.seats.len()>64||self.list.is_some(){return Err(8);}
        for(i,s)in self.seats.iter().enumerate(){if self.seats[..i].iter().any(|p|p.number==s.number||p.root==s.root)||!o.roots.iter().any(|r|r.ship==s.root)||!scene_control::assembly(b,s.root)?.contains(&s.manual)||s.edges.len()>64{return Err(8);}
            if let Some(t)=s.target{read::row(b,t)?;}if o.externally_controlled.contains(&s.root)!=s.connected{return Err(8);}}Ok(())}
    pub fn sync_targets(&self,w:&mut world_owner::Owned)->Result<(),u32>{let f=&mut w.flight.as_mut().ok_or(8u32)?.owner;
        for s in &self.seats{f.ship_mut(id(s.root)).map_err(crate::flight_runtime::error)?.player_target=s.target.map(id);
            if s.manual!=s.root{f.ship_mut(id(s.manual)).map_err(crate::flight_runtime::error)?.player_target=s.target.map(id);}}Ok(())}
    pub fn manual(&self,b:&[Body])->Result<Vec<ai_resident::Manual>,u32>{let mut out=Vec::new();for s in &self.seats{
        if s.manual!=s.root&&read::live(read::ship(b,s.root)?)&&read::live(read::ship(b,s.manual)?)&&read::ship(b,s.root)?.combat.as_ref().ok_or(8u32)?.attrs[19]!=1.0&&read::ship(b,s.manual)?.combat.as_ref().ok_or(8u32)?.attrs[19]!=1.0{
            out.push(ai_resident::Manual{owner:ai_resident::identity(s.manual).map_err(|_|4u32)?,player_target:s.target});}}Ok(out)}
    pub fn observe_target(&mut self,h:Handle,target:Option<Handle>){if target.is_none(){for s in &mut self.seats{if s.manual==h{s.target=None;}}}}
    /// TeleportSequence counts completed actual jump poses, not activations.
    /// Invoke at the completed step barrier, never from the read publication.
    pub fn observe(&mut self,b:&[Body])->Result<(),u32>{for body in b{let s=body.ship.as_ref().ok_or(8u32)?;
        for m in s.world.as_ref().ok_or(8u32)?.metas.values(){if m.kind==crate::ship_effects::Kind::Jump{if let Some(v)=m.jump.visual.filter(|v|v.origin.is_some()){
            if let Some((_,serial,count))=self.teleports.iter_mut().find(|(h,_,_)|*h==body.handle){if *serial!=v.serial{*serial=v.serial;*count=count.checked_add(1).ok_or(5u32)?;}}
            else{self.teleports.push((body.handle,v.serial,1));}}}}}Ok(())}
}
fn push_record(out:&mut Vec<f64>,count:&mut usize,tag:u32,v:Vec<f64>){out.extend([tag as f64,v.len()as f64]);out.extend(v);*count+=1;}
fn put_string(out:&mut Vec<f64>,s:&str){let words:Vec<_>=s.encode_utf16().collect();out.push(words.len()as f64);out.extend(words.into_iter().map(|v|v as f64));}
/// Extra existing LAN display reads. Rules execute in Rust; TS only copies.
pub fn words(seats:&Owned,o:&scene_owner::Owned,b:&[Body],w:&world_owner::Owned,specs:&BTreeMap<u32,Spec>)->Result<Vec<f64>,u32>{
    use crate::{ship_effects as e,system_owner as so};seats.validate(o,b)?;let mut out=vec![1.0,0.0];let mut count=0;
    for s in &seats.seats{let mut v=vec![s.number as f64,s.root.slot as f64,s.root.generation as f64,s.connected as u32 as f64,s.manual.slot as f64,s.manual.generation as f64,s.target.is_some()as u32 as f64];if let Some(t)=s.target{v.extend([t.slot as f64,t.generation as f64]);}push_record(&mut out,&mut count,1,v);}
    let phase=w.phase.as_ref().ok_or(8u32)?;let reader=read::Reader::new(b,w,specs);
    for(r,body)in b.iter().enumerate(){let s=body.ship.as_ref().ok_or(8u32)?;let live=so::modifiers(b,r,specs)?;let mut pose=body.motion;
        motion_owner::stats(Some(w),b,r,&mut pose,&live)?;
        let sw=s.world.as_ref().ok_or(8u32)?;let query=s.combat.as_ref().and_then(|c|c.query.as_ref()).ok_or(8u32)?;
        let alpha=phase.external_phase(body.handle);let sh=s.shield.as_ref().ok_or(8u32)?;
        let mut v=vec![body.id as f64,pose[12],pose[13],pose[14],pose[16],pose[15],pose[15]*0.5,pose[17],pose[18],((pose[11]as u32&8)!=0)as u32 as f64,
            (1.0+2.0*s.clock[0]*sh.data[15])*s.clock[2]*live.get(e::TIME),query.aim[0],query.aim[1],sh.data[33],sh.data[34],query.hold as u32 as f64,
            alpha.is_some()as u32 as f64,alpha.unwrap_or(0.0),read::runtime(s)?.get(e::VISUAL_ALPHA),seats.teleports.iter().find(|(h,_,_)|*h==body.handle).map_or(0,|(_,_,n)|*n)as f64];
        // Preserve original facts already observed above; no ship state writes.
        push_record(&mut out,&mut count,2,std::mem::take(&mut v));
        let views=so::views(s,specs);let owner=reader.owner(body.handle)?;let runtime=read::runtime(s)?;
        for(i,life)in s.systems.iter().enumerate(){let mut bits=0;let mut own_phase=false;
            for(k,view)in views[i..].iter().enumerate(){let c=phase.controls.find(body.handle,s.systems[i+k].id).ok_or(8u32)?;
                let flags=e::controls(*view,c.spec,&runtime);bits|=flags.bits;if k==0{own_phase=flags.phased;}}
            let modifiers=if i==0{live.clone()}else{e::compose(&views[i..],Some(owner),s.flux.max,false,&e::Modifiers::default(),&[],None)};
            let mut v=vec![body.id as f64,life.id as f64,bits as f64,0.0,own_phase as u32 as f64];
            for kind in 0..3{v.push(modifiers.weapon_value(kind,e::COST));}for kind in 0..3{v.push(modifiers.weapon_value(kind,e::RATE));}
            let allowed=s.weapons.as_ref().ok_or(8u32)?.mounts.iter().enumerate().filter(|(k,_)|e::can_fire(&views[i..],e::Controls{bits,phased:own_phase},s.combat.as_ref().unwrap().fire[*k].spec.point_defense)).map(|(_,m)|m.data[0]).collect::<Vec<_>>();
            v.push(allowed.len()as f64);v.extend(allowed);push_record(&mut out,&mut count,3,v);}
        let combat=s.combat.as_ref().ok_or(8u32)?;for(i,m)in s.weapons.as_ref().ok_or(8u32)?.mounts.iter().enumerate(){push_record(&mut out,&mut count,4,vec![body.id as f64,m.data[0],crate::battle::weapon_geometry(&combat.fire[i],m.data[1]as usize,&live,combat.attrs[18]).1]);}
        let _=sw;
    }
    let flights=&w.flight.as_ref().ok_or(8u32)?.flights;
    for(side,wings)in [(0,&flights.player_wings),(1,&flights.enemy_wings)]{for wing in wings{let mut v=vec![side as f64,wing.carrier.handle as f64,wing.carrier.generation as f64];put_string(&mut v,&wing.id);put_string(&mut v,&wing.spec.spec_id);put_string(&mut v,&wing.name);
        v.extend([wing.team,wing.spec.count as f64,wing.crr,wing.spec.tags.len()as f64]);for tag in &wing.spec.tags{put_string(&mut v,tag);}v.push(wing.rebuild.len()as f64);for row in &wing.rebuild{put_string(&mut v,&row.id);v.extend([row.timer,row.max_timer]);}push_record(&mut out,&mut count,5,v);}}
    if out.len()>8_000_000||out.iter().any(|v|!v.is_finite()){return Err(7);}out[1]=count as f64;Ok(out)
}
fn clear(o:&mut scene_owner::Owned,s:&mut Seat,b:&mut[Body],w:&mut world_owner::Owned,specs:&BTreeMap<u32,Spec>)->Result<(),u32>{
    let old=Scope::enter(o,s);let result=(||{o.clear_input(b,w,specs,s.root)?;scene_control::stop_firing(o,b)?;
        if s.connected{controls(o,b,w,specs,&neutral(),false)?;}s.sample=None;s.edges.clear();Ok(())})();old.leave(o,s);result
}
/// Exact applyPlayerControls + applyModuleWeaponInput; LAN does not enter
/// the local cockpit's pause/autopilot/HP gate.
fn controls(o:&mut scene_owner::Owned,b:&mut[Body],w:&mut world_owner::Owned,specs:&BTreeMap<u32,Spec>,sample:&ControlSample,module_input:bool)->Result<(),u32>{
    let h=o.player;let r=read::row(b,h)?;{let s=b[r].ship.as_mut().ok_or(8u32)?;s.combat.as_mut().ok_or(8u32)?.attrs[19]=0.0;
        let q=s.combat.as_mut().and_then(|c|c.query.as_mut()).ok_or(8u32)?;q.hold=false;
        let guns=s.weapons.as_mut().ok_or(8u32)?;guns.data[3]=1.0;guns.data[19]=1.0;
        let sh=s.shield.as_mut().ok_or(8u32)?;sh.data[33]=0.0;sh.data[34]=0.0;}
    let ai=w.ai.as_mut().ok_or(8u32)?.actor_mut(ai_resident::identity(h).map_err(|_|4u32)?).map_err(|_|4u32)?;ai.defense_facing=None;ai.tactical_present=false;
    if sample.pointer{set_aim(b,h,sample.aim)?;}
    let dead=read::ship(b,h)?.flags&ship_state::DEAD!=0;b[r].ship.as_mut().unwrap().combat.as_mut().unwrap().query.as_mut().unwrap().trigger=sample.pointer&&sample.firing&&!dead;
    if dead{o.clear_input(b,w,specs,h)?;}else{
        let mods=crate::system_owner::modifiers(b,r,specs)?;b[r].ship.as_mut().unwrap().live=mods;let mut pose=b[r].motion;let s=read::ship(b,h)?;
        motion_owner::stats(Some(w),b,r,&mut pose,&s.live)?;
        motion_owner::gate(Some(w),s,h,specs,&mut pose)?;let held=|n|sample.keys&n!=0;let steering=sample.mouse!=held(64);let horizontal=held(8)as i32-held(4)as i32;
        b[r].motion[motion::THROTTLE]=(held(1)as i32-held(2)as i32)as f64;b[r].motion[motion::BRAKE]=held(128)as u32 as f64;
        b[r].motion[motion::STRAFE]=((held(32)||(steering&&horizontal>0))as i32-(held(16)||(steering&&horizontal<0))as i32)as f64;
        let delta=[sample.aim[0]-b[r].motion[0],sample.aim[1]-b[r].motion[1]];
        b[r].motion[motion::TURN]=if !steering{horizontal as f64}else if sample.pointer&&contact::length(delta)>1e-6{navigation_ai::cursor_turn_command(b[r].motion[4],b[r].motion[5],delta[1].atan2(delta[0]),pose[motion::TURN_ACCELERATION]*0.5)}else{0.0};
        if pose[motion::FLAGS]as u32&4!=0{b[r].motion[motion::TURN]=0.0;}if held(128){b[r].ship.as_mut().unwrap().flags|=ship_state::BRAKE;}else{b[r].ship.as_mut().unwrap().flags&=!ship_state::BRAKE;}}
    if !module_input{return Ok(());}
    if !read::live(read::ship(b,h)?)||o.manual_weapon!=h&&!read::live(read::ship(b,o.manual_weapon)?){scene_control::release_modules(o,b,w,specs)?;}
    if o.manual_weapon==h{scene_control::release_modules(o,b,w,specs)?;}else{let part=o.manual_weapon;let mr=read::row(b,part)?;
        b[r].ship.as_mut().unwrap().combat.as_mut().unwrap().query.as_mut().unwrap().trigger=false;if sample.pointer{set_aim(b,part,sample.aim)?;}
        let q=b[mr].ship.as_mut().unwrap().combat.as_mut().unwrap().query.as_mut().unwrap();q.trigger=sample.pointer&&sample.firing;q.hold=false;
        w.flight.as_mut().ok_or(8u32)?.owner.ship_mut(id(part)).map_err(crate::flight_runtime::error)?.player_target=o.player_target.map(id);}Ok(())
}
fn set_aim(b:&mut[Body],h:Handle,p:[f64;2])->Result<(),u32>{let r=read::row(b,h)?;let s=b[r].ship.as_mut().ok_or(8u32)?;
    s.world.as_mut().ok_or(8u32)?.aim=p;s.combat.as_mut().and_then(|c|c.query.as_mut()).ok_or(8u32)?.aim=p;
    let sh=s.shield.as_mut().ok_or(8u32)?;sh.data[31]=p[0];sh.data[32]=p[1];Ok(())}
pub fn pre_tick(seats:&mut Owned,o:&mut scene_owner::Owned,b:&mut[Body],ordnance:&mut Ordnance,w:&mut world_owner::Owned,specs:&BTreeMap<u32,Spec>,random:&mut Random,visual:&mut Random,events:&mut Vec<(u32,Handle,Notice)>)->Result<(),u32>{
    for s in &mut seats.seats{if !s.connected{if s.sample.is_some()||!s.edges.is_empty(){return Err(8);}continue;}let sample=s.sample.take().ok_or(8u32)?;let edges=std::mem::take(&mut s.edges);let old=Scope::enter(o,s);
        let result:Result<(),u32>=(||{controls(o,b,w,specs,&sample,true)?;let r=read::row(b,s.root)?;
            for edge in edges{scene_commands::dispatch(edge.tag,&edge.values,o,b,w,ordnance,specs,r,random,visual,events)?;}
            if !read::ship(b,s.root)?.world.as_ref().ok_or(8u32)?.gravity_systems.is_empty(){crate::gravity_runtime::held(w,b,ordnance,specs,r,sample.pointer&&sample.field,sample.pointer&&sample.push,random,visual,events)?;}Ok(())})();old.leave(o,s);result?;
    }seats.sync_targets(w)
}
pub fn apply(tag:u32,v:&[f64],seats:&mut Owned,o:&mut scene_owner::Owned,b:&mut[Body],w:&mut world_owner::Owned,specs:&BTreeMap<u32,Spec>,own:usize)->Result<(Vec<Handle>,Option<Outcome>),u32>{
    if !(201..=207).contains(&tag){return Err(2);}let h=b.get(own).ok_or(4u32)?.handle;let number=integer(*v.first().ok_or(2u32)?)?;
    match tag{
        201=>{pad(v,3)?;if seats.list.is_some()||seats.seats.len()>=64||seats.seats.iter().any(|s|s.number==number||s.root==h)||!o.roots.iter().any(|r|r.ship==h){return Err(8);}
            let manual=Handle{slot:integer(v[1])?,generation:integer(v[2])?};if !scene_control::assembly(b,h)?.contains(&manual){return Err(8);}
            let mut s=Seat{number,root:h,connected:true,manual,target:None,sample:None,edges:Vec::new()};if !o.externally_controlled.contains(&h){o.externally_controlled.push(h);}if !o.full_rate.contains(&h){o.full_rate.push(h);}clear(o,&mut s,b,w,specs)?;seats.seats.push(s);}
        202=>{pad(v,2)?;if seats.list.is_some(){return Err(8);}let s=seats.get_mut(number,h)?;s.connected=flag(v[1])?;
            if s.connected{if !o.externally_controlled.contains(&h){o.externally_controlled.push(h);}}else{o.externally_controlled.retain(|p|*p!=h);}clear(o,s,b,w,specs)?;}
        203=>{pad(v,9)?;if seats.list.is_some(){return Err(8);}let s=seats.get_mut(number,h)?;let keys=integer(v[1])?;if !s.connected||s.sample.is_some()||keys>255{return Err(8);}
            s.sample=Some(ControlSample{autopilot:false,blocked:false,keys,aim:[v[2],v[3]],firing:flag(v[4])?,mouse:flag(v[5])?,pointer:flag(v[6])?,field:flag(v[7])?,push:flag(v[8])?});}
        204=>{pad(v,9)?;if seats.list.is_some(){return Err(8);}let s=seats.get_mut(number,h)?;let tag=integer(v[1])?;
            if !s.connected||s.sample.is_none()||s.edges.len()>=64||!(160..=164).contains(&tag){return Err(8);}let mut values=[0.0;22];values[..7].copy_from_slice(&v[2..9]);s.edges.push(Edge{tag,values});}
        205=>{pad(v,3)?;if seats.list.is_some(){return Err(8);}seats.get_mut(number,h)?;let operation=integer(v[1])?;let count=integer(v[2])?as usize;if operation>2||count>128{return Err(2);}seats.list=Some(List{seat:number,operation,count,items:Vec::new()});}
        206=>{pad(v,4)?;seats.get_mut(number,h)?;let list=seats.list.as_mut().ok_or(8u32)?;if list.seat!=number||integer(v[1])?as usize!=list.items.len()||list.items.len()>=list.count{return Err(8);}
            let target=Handle{slot:integer(v[2])?,generation:integer(v[3])?};read::row(b,target)?;list.items.push(target);}
        207=>{pad(v,1)?;seats.get_mut(number,h)?;let list=seats.list.take().ok_or(8u32)?;if list.seat!=number||list.count!=list.items.len(){return Err(8);}
            let team=read::ship(b,h)?.combat.as_ref().ok_or(8u32)?.team;let duplicate=list.items.iter().enumerate().any(|(i,h)|list.items[..i].contains(h));
            let mut reason=None;let mut born=Vec::new();
            if list.operation==0{if o.result.is_some()||!o.enabled{reason=Some("本场战斗不能继续部署。".into());}else if list.items.is_empty()||duplicate{reason=Some("请选择不重复的待命舰船。".into());}else{
                let mut cost=0.0;for h in &list.items{match o.roots.iter().find(|r|r.ship==*h){None=>{reason=Some("只能部署本队战前编成中的舰船。".into());break;},Some(r)=>{
                    if read::ship(b,*h)?.combat.as_ref().ok_or(8u32)?.team!=team{reason=Some("只能部署本队战前编成中的舰船。".into());break;}
                    if o.status(b,r)?!=scene_owner::Status::Reserve{reason=Some("所选舰船已部署、撤退或损失，请更新选择。".into());break;}cost+=r.cost;}}}
                if reason.is_none()&&o.used(b,team)?+cost>o.limit{reason=Some("超出本队可用部署点。".into());}
                if reason.is_none(){match o.deploy(b,&list.items,team){Ok(items)=>born=items,Err(8)=>reason=Some("本方入场边缘拥堵，请稍后部署。".into()),Err(e)=>return Err(e)}}}}
            else if o.result.is_some()||list.items.is_empty()&&list.operation!=2||duplicate{reason=Some("不能下达撤退。".into());}
            else if list.items.iter().any(|h|seats.seats.iter().any(|s|s.number!=number&&s.root==*h)){reason=Some("不能替其他真人玩家下达撤退。".into());}
            else if list.items.iter().any(|h|o.roots.iter().any(|r|r.ship==*h&&r.station)){reason=Some("空间站不能撤退。".into());}
            else{for h in &list.items{if o.roots.iter().find(|r|r.ship==*h).is_none_or(|r|read::ship(b,*h).ok().and_then(|s|s.combat.as_ref()).is_none_or(|c|c.team!=team)||o.status(b,r)!=Ok(scene_owner::Status::Deployed)){reason=Some("只能撤退本队在场舰船。".into());break;}}
                if reason.is_none(){o.request_retreat(b,w,specs,&list.items,team,list.operation==2)?;}}
            return Ok((born,Some(Outcome{accepted:reason.is_none(),reason})));}
        _=>return Err(2)}Ok((Vec::new(),None))
}
