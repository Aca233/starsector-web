//! Read-only command/HUD queries over the actual resident world. No RNG access.
use crate::{gravity_world as g,lifecycle::{self,Spec},phase_runtime,ship_effects as e,ship_state::{self,ShipState},state::{Body,Handle},system_owner as so,system_world as w,world_owner};
use std::{cmp::Ordering,collections::BTreeMap};
pub fn row(b:&[Body],h:Handle)->Result<usize,u32>{b.iter().position(|b|b.handle==h).ok_or(4)}
pub fn ship(b:&[Body],h:Handle)->Result<&ShipState,u32>{b[row(b,h)?].ship.as_ref().ok_or(8)}
pub fn id(h:Handle)->w::Identity{w::Identity{slot:h.slot,generation:h.generation}}
fn handle(h:w::Identity)->Handle{Handle{slot:h.slot,generation:h.generation}}
pub fn live(s:&ShipState)->bool{s.flags&(ship_state::DEAD|ship_state::DOCKED|ship_state::RETREATED)==0&&s.armor.as_ref().is_some_and(|a|a.data[14]>0.0)}
pub fn runtime(s:&ShipState)->Result<e::Modifiers,u32>{let mut m=e::Modifiers::default();for(_,v)in &s.world.as_ref().ok_or(8u32)?.runtime{m.combine(v);}Ok(m)}
pub fn controls(s:&ShipState,specs:&BTreeMap<u32,Spec>)->Result<u32,u32>{let mut bits=s.systems.iter().fold(0,|bits,s|bits|s.controls());let runtime=runtime(s)?;
    if runtime.get(e::DISABLE_WEAPONS)>0.0{bits|=64;}if runtime.get(e::DISABLE_DEFENSE)>0.0{bits|=1;}if runtime.get(e::DISABLE_VENTING)>0.0{bits|=8;}
    let w=s.world.as_ref().ok_or(8u32)?;for life in &s.systems{if specs.get(&life.spec).ok_or(8u32)?.flags&lifecycle::AVAILABLE!=0&&!life.disabled&&life.state==lifecycle::ACTIVE&&w.metas.get(&life.id).ok_or(8u32)?.kind==e::Kind::Zhefeng{bits|=1;}}Ok(bits)}
pub fn root(b:&[Body],mut h:Handle)->Result<Handle,u32>{let mut seen=Vec::new();loop{if seen.contains(&h){return Err(8);}seen.push(h);match ship(b,h)?.world.as_ref().ok_or(8u32)?.parent{Some(p)=>h=p,None=>return Ok(h)}}}
/// ECMAScript toFixed chooses the larger decimal integer on an exact tie.
/// Work on the exact binary rational instead of Rust's ties-to-even formatter.
pub fn fixed(n:f64,digits:u32)->String{
    if !n.is_finite()||n.abs()>=1e21{return crate::gravity_owner::number_key(n);}
    let a=n.abs();let bits=a.to_bits();let exp=((bits>>52)&2047)as i32;let sig=if exp==0{bits&((1u64<<52)-1)}else{(bits&((1u64<<52)-1))|(1u64<<52)};
    let shift=if exp==0{-1074}else{exp-1023-52};let scaled=(sig as u128)*10u128.pow(digits);
    let rounded=if shift>=0{scaled<<shift as u32}else{let k=(-shift)as u32;if k>=128{0}else{let q=scaled>>k;let rem=scaled-(q<<k);q+if k>0&&rem>=1u128<<(k-1){1}else{0}}};
    let mut s=rounded.to_string();if digits>0{while s.len()<=digits as usize{s.insert(0,'0');}s.insert(s.len()-digits as usize,'.');}if n<0.0{s.insert(0,'-');}s
}
pub fn jump_reason(f:e::JumpFailure)->String{match f{e::JumpFailure::Invalid=>"落点坐标无效",e::JumpFailure::Near=>"落点过近（至少200）",e::JumpFailure::Far=>"落点超出跃迁范围",e::JumpFailure::Environment=>"落点环境尚未就绪",e::JumpFailure::Ship=>"落点被舰船占用",e::JumpFailure::Asteroid=>"落点被小行星占用"}.into()}
struct PublicationCache<'a>{observation:std::rc::Rc<so::PublicationObservation<'a>>,owners:std::cell::RefCell<Vec<Option<e::Owner>>>}
pub struct Reader<'a>{pub bodies:&'a[Body],pub world:&'a world_owner::Owned,pub specs:&'a BTreeMap<u32,Spec>,publication:Option<PublicationCache<'a>>}
impl<'a> Reader<'a>{
    pub fn new(bodies:&'a[Body],world:&'a world_owner::Owned,specs:&'a BTreeMap<u32,Spec>)->Self{Self{bodies,world,specs,publication:None}}
    pub(crate) fn publication(world:&'a world_owner::Owned,observation:std::rc::Rc<so::PublicationObservation<'a>>)->Self{
        Self{bodies:observation.bodies(),world,specs:observation.specs(),publication:Some(PublicationCache{observation,owners:std::cell::RefCell::new(Vec::new())})}}
}
impl Reader<'_>{
    pub(crate) fn row(&self,h:Handle)->Result<usize,u32>{self.publication.as_ref().map_or_else(||row(self.bodies,h),|p|p.observation.row(h))}
    pub(crate) fn ship(&self,h:Handle)->Result<&ShipState,u32>{self.publication.as_ref().map_or_else(||ship(self.bodies,h),|_|self.bodies[self.row(h)?].ship.as_ref().ok_or(8))}
    pub fn active(&self)->Result<Vec<Handle>,u32>{crate::scene_control::active(self.world,self.bodies)}
    pub fn owner(&self,h:Handle)->Result<e::Owner,u32>{let r=self.row(h)?;
        if let Some(p)=&self.publication{if let Some(Some(o))=p.owners.borrow().get(r){return Ok(*o);}}
        let s=self.ship(h)?;let world=s.world.as_ref().ok_or(8u32)?;
        // HUD engineering observes every child, unlike system_owner's first
        // live-engineering short circuit. Cache only this complete success.
        let mut engineering=false;for &c in &world.children{if self.ship(c)?.world.as_ref().ok_or(8u32)?.flags&so::ENGINEERING!=0&&live(self.ship(c)?){engineering=true;}}
        let mut o=so::local_owner(s,engineering,world.flags&so::CORONA!=0,phase_runtime::phased_world(self.world,self.bodies,r,self.specs)?);o.disable_systems+=runtime(s)?.get(e::DISABLE_SYSTEMS);
        if let Some(p)=&self.publication{let mut owners=p.owners.borrow_mut();if owners.is_empty(){owners.resize(self.bodies.len(),None);}owners[r]=Some(o);}Ok(o)
    }
    pub fn system_reason(&self,h:Handle,sid:u32)->Result<Option<String>,u32>{self.active()?;self.system_reason_at_barrier(h,sid)}
    /// Only the complete publication that already validated this current roster.
    pub(crate) fn system_reason_at_barrier(&self,h:Handle,sid:u32)->Result<Option<String>,u32>{let s=self.ship(h)?;let slot=so::slot(s,h,sid,self.specs)?;
        if matches!(slot.kind,e::Kind::GravityWell|e::Kind::GravityBattleWell|e::Kind::GravityOther){let gravity=self.world.gravity.as_ref().ok_or(8u32)?;let c=gravity.owner.hydrate_read_world(self.world,self.bodies,self.specs).map_err(crate::gravity_runtime::error)?;
            let k=c.slots.iter().position(|s|s.owner==id(h)&&s.lifecycle.id==sid).ok_or(8u32)?;return match c.reason(k,&GravityReader{reader:self}){Ok(())=>Ok(None),Err(f)=>self.gravity_reason(&c.slots[k],f).map(Some)};}
        match slot.activation_reason(self){Ok(())=>Ok(None),Err(f)=>{
            let sr=w::Host::ship(self,id(h)).map_err(so::error)?;let ark=matches!(slot.kind,e::Kind::ArkForge|e::Kind::ArkBarrier|e::Kind::ArkRepair);
            let text=match f{
                w::Failure::StaleIdentity=>return Err(4),w::Failure::Host|w::Failure::Unsupported=>return Err(8),
                w::Failure::Unavailable=>if slot.kind==e::Kind::None{"没有舰船系统".into()}else{"该系统尚未接入".into()},
                w::Failure::InactiveOwner=>"舰船不在战斗状态".into(),w::Failure::Disabled=>"系统离线".into(),w::Failure::Cooldown=>format!("冷却中（{}s）",fixed(slot.lifecycle.cooldown_timer,1)),
                w::Failure::Out=>"关闭中".into(),w::Failure::Active=>"系统正在运行".into(),w::Failure::Retreating=>"撤退中".into(),w::Failure::Overloaded=>"载荷过载".into(),w::Failure::Venting=>"正在排散载荷".into(),w::Failure::Flux=>"载荷空间不足".into(),w::Failure::Charges=>"充能耗尽".into(),
                w::Failure::WeaponMissing=>"需要至少一门可用的能量武器".into(),w::Failure::WeaponOffline=>match slot.kind{e::Kind::ArkForge=>"武备段不可用",e::Kind::Zhefeng=>"缺少可用主攻武器",_=>"对应武器已失效或弹药耗尽"}.into(),
                w::Failure::CoreMissing=>if ark{"太阳核心未装配"}else if slot.kind==e::Kind::Edict{"需要荣光女王指挥核心"}else if !sr.hyperion||!sr.reactor_installed{"需要内置旗舰反应堆"}else{"需要大和炮/反应堆核心技能"}.into(),
                w::Failure::CoreOffline=>"旗舰反应堆离线".into(),w::Failure::SharedBusy=>if ark{"太阳核心正在供能另一项能力"}else{"反应堆正供能另一技能"}.into(),
                w::Failure::SharedCharges=>{let core=w::Host::stock(self,id(h),if ark{e::Kind::ArkForge}else{e::Kind::Yamato}).map_err(so::error)?.ok_or(8u32)?;let cost=match slot.kind{e::Kind::ArkForge=>40,e::Kind::ArkBarrier=>35,e::Kind::ArkRepair=>50,e::Kind::Jump=>75,_=>if sr.focus{45}else{60}};
                    if ark{format!("太阳能不足：{}/{}",crate::gravity_owner::number_key(core.charges.floor()),cost)}else{format!("反应堆不足：{}/{}",crate::gravity_owner::number_key(core.charges),cost)}},
                w::Failure::Aim=>if e::yamato_aim_failure(sr.aim,sr.position,sr.facing)==1{"将准星置于舰艏前方400距离外"}else{"大和炮需要舰艏对准准星（±12°）"}.into(),
                w::Failure::Side=>"将准星移至左舷或右舷后启动".into(),w::Failure::Battery=>format!("{}没有可用实弹炮廊（检查战损、弹药与载荷）",if e::broadside(sr.aim,sr.position,sr.facing)<0{"左舷"}else{"右舷"}),
                w::Failure::Shield=>if slot.kind==e::Kind::ArkBarrier{"先升起护盾，再启用超载"}else{"需要先展开前盾"}.into(),w::Failure::NoRepairTarget=>"没有可重构的受损模块或近旁舰载机".into(),
                w::Failure::Compensating=>"反冲补偿正在占用姿态喷口".into(),w::Failure::Brake=>"刹车输入优先".into(),w::Failure::Engine=>"推进系统停机".into(),w::Failure::Reassigning=>"火控正在重分配".into(),w::Failure::Jump(j)=>jump_reason(j),
            };Ok(Some(text))}}
    }
    fn gravity_reason(&self,slot:&g::Slot,f:g::Error)->Result<String,u32>{let s=self.ship(handle(slot.owner))?;let l=&slot.lifecycle;let reacquire=l.active&&slot.field_spec.is_some_and(|f|f.cursor_speed.is_some())&&(l.state==lifecycle::IN||l.state==lifecycle::ACTIVE);
        let kind=slot.kind;let source_alive=live(s);let r=self.row(handle(slot.owner))?;let text=match f{
            g::Error::Stale=>return Err(4),g::Error::Host|g::Error::Unsupported=>return Err(8),g::Error::Unavailable=>"该系统尚未接入".into(),
            g::Error::Owner=>if !source_alive{"舰船不在战斗状态"}else{match kind{g::Kind::Well=>"当前不能建立引力井",g::Kind::BattleWell=>"当前不能布置重力井",g::Kind::Repulsor|g::Kind::BattleRepulsor=>"当前不能释放排斥波",g::Kind::Release=>"当前不能远端释放",g::Kind::Collapse=>"当前不能坍缩",g::Kind::Maneuver=>"当前不能折转航迹",g::Kind::Push=>"当前不能定向推送",g::Kind::Polarity=>return Err(8)}}.into(),
            g::Error::Disabled=>"系统离线".into(),g::Error::Cooldown=>format!("冷却中（{}s）",fixed(l.cooldown_timer,1)),g::Error::Active=>"系统正在运行".into(),g::Error::Out=>"关闭中".into(),
            g::Error::Retreat|g::Error::Overload|g::Error::Vent if reacquire=>"当前不能接管区域场".into(),g::Error::Retreat=>"撤退中".into(),g::Error::Overload=>"载荷过载".into(),g::Error::Vent=>"正在排散载荷".into(),g::Error::Flux=>"载荷空间不足".into(),
            g::Error::AutoCollapse=>"区域正在自动坍缩".into(),g::Error::Range=>match kind{g::Kind::Collapse=>"重力井超出维持距离",g::Kind::Release=>"引力锚超出维持距离",g::Kind::BattleWell=>"部署点超出2400距离",_=>"部署点超出1400距离"}.into(),
            g::Error::Anchor=>if kind==g::Kind::Collapse{"需要已建立的重力井"}else{"需要一个已建立的引力锚"}.into(),g::Error::Speed=>"需要先推进至30航速".into(),g::Error::Manual=>"当前不能定向推送".into(),
            g::Error::Aim=>{let aim=s.combat.as_ref().and_then(|c|c.query.as_ref()).ok_or(8u32)?.aim;let p=self.bodies[r].motion;let d=[aim[0]-p[0],aim[1]-p[1]];
                if !d.iter().all(|v|v.is_finite())||g::hypot(d)<slot.maneuver_spec.ok_or(8u32)?.min_aim{"请指向离舰心更远的航行方向"}else{"当前已沿该方向航行"}.into()},
        };Ok(text)
    }
    pub fn hull_shield_reason(&self,h:Handle)->Result<Option<String>,u32>{let s=self.ship(h)?;let sh=s.shield.as_ref().ok_or(8u32)?;Ok((if !live(s){Some("舰船不在战斗状态")}else if sh.kind()==crate::shield::NONE{Some("没有舰体护盾或相位装置")}else if sh.locked(){Some("护盾常开，不能手动关闭")}else if sh.kind()==crate::shield::PHASE&&sh.data[14]==3.0{Some("正在退出相位")}else if sh.kind()==crate::shield::PHASE&&sh.data[14]==4.0{Some("相位线圈冷却中")}else if sh.data[35]==1.0||controls(s,self.specs)?&1!=0{Some("防御被禁用")}else if s.flux.overloaded{Some("载荷过载")}else if s.flux.venting{Some("正在排散载荷")}else if s.flags&ship_state::RETREATING!=0{Some("撤退中")}else{None}).map(str::to_owned))}
    pub fn defense_reason(&self,h:Handle)->Result<Option<String>,u32>{let s=self.ship(h)?;if !live(s){return Ok(Some("舰船不在战斗状态".into()));}let defense=s.systems.iter().find(|s|s.defense).ok_or(8u32)?;let m=s.world.as_ref().and_then(|w|w.metas.get(&defense.id)).ok_or(8u32)?;
        if m.kind==e::Kind::None{return self.hull_shield_reason(h);}let sh=s.shield.as_ref().ok_or(8u32)?;if sh.data[43]==0.0&&!defense.active&&(controls(s,self.specs)?&1!=0||sh.data[35]==1.0){return Ok(Some("独立防御被禁用".into()));}self.system_reason(h,defense.id)
    }
    pub fn vent_reason(&self,h:Handle)->Result<Option<String>,u32>{let s=self.ship(h)?;let sh=s.shield.as_ref().ok_or(8u32)?;Ok((if !live(s){Some("舰船不在战斗状态")}else if s.flags&ship_state::RETREATING!=0{Some("撤退中")}else if sh.locked()||controls(s,self.specs)?&8!=0||s.flux.vent_mult<=0.0{Some("当前配置禁止主动排散")}else if s.flux.overloaded{Some("载荷过载")}else if s.flux.venting{Some("正在排散载荷")}else if s.flux.total()<=5.0{Some("无需排散载荷")}else{None}).map(str::to_owned))}
}
impl w::Host for Reader<'_>{
    fn ship(&self,h:w::Identity)->Result<w::ShipRead,w::Failure>{let r=self.row(handle(h)).map_err(|_|w::Failure::StaleIdentity)?;let b=&self.bodies[r];let s=b.ship.as_ref().ok_or(w::Failure::Host)?;let world=s.world.as_ref().ok_or(w::Failure::Host)?;let c=s.combat.as_ref().ok_or(w::Failure::Host)?;let a=s.armor.as_ref().ok_or(w::Failure::Host)?;
        Ok(w::ShipRead{identity:h,owner:self.owner(b.handle).map_err(|_|w::Failure::Host)?,maximum_hp:a.data[13],position:[b.motion[0],b.motion[1]],velocity:[b.motion[2],b.motion[3]],facing:b.motion[4],radius:c.radius,
            shield_radius:s.shield.as_ref().map_or(0.0,|sh|sh.data[2]),shield_active:s.shield.as_ref().is_some_and(|sh|sh.active()),attached:world.parent.is_some(),gloriana:world.flags&so::GLORIANA!=0,parent:world.parent.map(id),carrier_root:world.carrier.map(|h|root(self.bodies,h).map(id)).transpose().map_err(|_|w::Failure::Host)?,
            module_side:world.side,blocks_weapons:controls(s,self.specs).map_err(|_|w::Failure::Host)?&64!=0,hyperion:world.flags&so::HYPERION!=0,reactor_installed:world.flags&so::REACTOR!=0,focus:world.flags&so::FOCUS!=0,current_total_flux:s.flux.total(),max_flux:s.flux.max,
            brake:b.motion[crate::motion::BRAKE]==1.0,flameout_ratio:s.engines.as_ref().map_or(0.0,|e|e.fraction(true)),controller_flamed:s.engine_flame_flag(),controller_disabled:s.engines.as_ref().is_some_and(|e|e.data[4]==crate::engine::DISABLED),compensating:world.compensation.as_ref().is_some_and(e::Compensation::active),
            weapons:s.weapons.as_ref().map_or(Vec::new(),|ws|ws.mounts.iter().enumerate().map(|(i,m)|w::WeaponRead{weapon_type:if m.data[1]==0.0{usize::MAX}else{m.data[1]as usize-1},disabled:s.components[i].data[7]==1.0,ammo:m.data[17],point_defense:c.fire[i].spec.point_defense}).collect()),aim:c.query.as_ref().map_or(world.aim,|q|q.aim),range_multiplier:world.range_multiplier,manual:c.attrs[19]!=1.0,yamato_muzzle:world.muzzle})
    }
    fn systems(&self,h:w::Identity)->Result<Vec<w::SystemRead>,w::Failure>{let s=self.ship(handle(h)).map_err(|_|w::Failure::Host)?;let world=s.world.as_ref().ok_or(w::Failure::Host)?;s.systems.iter().map(|s|Ok(w::SystemRead{id:s.id,kind:world.metas.get(&s.id).ok_or(w::Failure::Host)?.kind,active:s.active,disabled:s.disabled,charges:s.charges,pending_flux:s.pending_flux})).collect()}
    fn assembly(&self,h:w::Identity)->Result<Vec<w::Identity>,w::Failure>{crate::scene_control::assembly(self.bodies,root(self.bodies,handle(h)).map_err(|_|w::Failure::Host)?).map(|v|v.into_iter().map(id).collect()).map_err(|_|w::Failure::Host)}
    fn children(&self,h:w::Identity)->Result<Vec<w::Identity>,w::Failure>{Ok(self.ship(handle(h)).map_err(|_|w::Failure::Host)?.world.as_ref().ok_or(w::Failure::Host)?.children.iter().copied().map(id).collect())}
    fn roster(&self)->Vec<w::Identity>{self.active().unwrap_or_default().into_iter().map(id).collect()}
    fn stock(&self,h:w::Identity,kind:e::Kind)->Result<Option<w::SystemRead>,w::Failure>{Ok(self.systems(h)?.into_iter().find(|s|s.kind==kind))}
    fn jump_obstacles(&self)->Result<(Vec<e::JumpObstacle>,Option<Vec<e::JumpAsteroid>>),w::Failure>{let mut ships=Vec::new();for h in self.active().map_err(|_|w::Failure::Host)?{let r=self.row(h).map_err(|_|w::Failure::Host)?;let b=&self.bodies[r];let c=b.ship.as_ref().and_then(|s|s.combat.as_ref()).ok_or(w::Failure::Host)?;ships.push(e::JumpObstacle{identity:h.slot,position:[b.motion[0],b.motion[1]],radius:c.radius,fighter:c.size==0});}
        let rocks=self.world.terrain.terrain.asteroids.iter().map(|a|e::JumpAsteroid{position:a.position,radius:a.radius,hp:Some(a.hp)}).collect();Ok((ships,Some(rocks)))}
    fn jump_pose(&self,_:w::Identity)->Result<e::JumpPose,w::Failure>{Err(w::Failure::Host)}
    fn spend_stock(&mut self,_:w::Identity,_:e::Kind,_:f64)->Result<(),w::Failure>{Err(w::Failure::Host)}
    fn set_regen(&mut self,_:w::Identity,_:u32,_:f64)->Result<(),w::Failure>{Err(w::Failure::Host)}
    fn heal(&mut self,_:w::Identity,_:f64)->Result<(),w::Failure>{Err(w::Failure::Host)}
    fn spawn_yamato(&mut self,_:w::SpawnYamato)->Result<(),w::Failure>{Err(w::Failure::Host)}
    fn play_yamato(&mut self,_:w::Identity)->Result<(),w::Failure>{Err(w::Failure::Host)}
    fn apply_jump_pose(&mut self,_:w::Identity,_:e::JumpPose)->Result<(),w::Failure>{Err(w::Failure::Host)}
}
/// Activation only reads the owner and ordered reservations. Unsupported future
/// query dependencies fail closed instead of acquiring a fake world or mutation.
struct GravityReader<'a,'b>{reader:&'a Reader<'b>}
impl g::Host for GravityReader<'_,'_>{
    fn observe(&self)->Result<g::Observation,g::Error>{let reader=self.reader;let owned=&reader.world.gravity.as_ref().ok_or(g::Error::Host)?.owner;let mut ships=Vec::new();for b in reader.bodies{let h=b.handle;let s=b.ship.as_ref().ok_or(g::Error::Host)?;let c=s.combat.as_ref().ok_or(g::Error::Host)?;let m=owned.ships.iter().find(|m|m.identity==id(h)).ok_or(g::Error::Host)?;let q=c.query.as_ref().ok_or(g::Error::Host)?;
        ships.push(g::Ship{id:id(h),name:m.name.clone(),root:id(root(reader.bodies,h).map_err(|_|g::Error::Host)?),owner:reader.owner(h).map_err(|_|g::Error::Host)?,team:Some(c.team as f64),player:c.player.unwrap_or(false),position:[b.motion[0],b.motion[1]],previous:s.world.as_ref().ok_or(g::Error::Host)?.previous,velocity:[b.motion[2],b.motion[3]],facing:b.motion[4],angular_velocity:b.motion[5],radius:c.radius,mass:m.mass,max_speed:b.motion[14],fixed:m.fixed,attached:m.module.is_some(),module_hull:m.module_hull,bounds:c.bounds.clone(),aim:q.aim,manual:c.attrs[19]!=1.0,trigger:q.trigger,brake:b.motion[8]==1.0,target:q.target.map(id),total_flux:s.flux.total(),max_flux:s.flux.max,range_multiplier:s.world.as_ref().unwrap().range_multiplier});}Ok(g::Observation{ships,..g::Observation::default()})}
    fn reservations(&self,h:w::Identity)->Result<Vec<(u32,f64)>,g::Error>{Ok(self.reader.ship(handle(h)).map_err(|_|g::Error::Stale)?.systems.iter().map(|s|(s.id,s.pending_flux)).collect())}
    fn locale_compare(&self,_:&str,_:&str)->Result<Ordering,g::Error>{Err(g::Error::Host)}
    fn segment_entry(&self,_:g::Target,_:g::V,_:g::V)->Result<Option<f64>,g::Error>{Err(g::Error::Host)}
    fn pointer_distance(&self,_:&g::Body,_:g::V)->Result<f64,g::Error>{Err(g::Error::Host)}
    fn owner_contains(&self,_:w::Identity,_:g::V)->Result<bool,g::Error>{Err(g::Error::Host)}
    fn line_clear(&self,_:w::Identity,_:&g::Body,_:g::V)->Result<bool,g::Error>{Err(g::Error::Host)}
    fn muzzle(&self,_:w::Identity,_:u32,_:f64)->Result<g::V,g::Error>{Err(g::Error::Host)}
    fn target_key(&self,_:g::Target)->Result<String,g::Error>{Err(g::Error::Host)}
    fn increase_flux(&mut self,_:w::Identity,_:f64)->Result<(),g::Error>{Err(g::Error::Host)}
    fn velocity(&mut self,_:g::Target,_:g::V,_:bool,_:Option<f64>)->Result<(),g::Error>{Err(g::Error::Host)}
    fn sync_modules(&mut self,_:w::Identity)->Result<(),g::Error>{Err(g::Error::Host)}
    fn capture_projectile(&mut self,_:w::Identity,_:w::Identity)->Result<(),g::Error>{Err(g::Error::Host)}
    fn binding(&mut self,_:w::Identity,_:g::Binding)->Result<(),g::Error>{Err(g::Error::Host)}
    fn hulk_managed(&mut self,_:w::Identity)->Result<(),g::Error>{Err(g::Error::Host)}
    fn tidal_hit(&mut self,_:w::Identity,_:w::Identity,_:g::V,_:f64,_:f64,_:bool)->Result<Option<g::V>,g::Error>{Err(g::Error::Host)}
}
