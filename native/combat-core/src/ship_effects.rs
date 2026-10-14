//! Resident seven-pack live modifiers and dynamic hullmod state. Callers borrow
//! these observations from the resident world; they are not a per-step JS API.
//! The shared world must apply these methods at their original phase barriers,
//! include every state in rollback/recovery, and execute real damage/spawn rules.
use crate::flux::Flux;
use crate::lifecycle::{IN, ACTIVE, OUT, COOLDOWN};

pub const SCALARS: usize = 33;
pub const WIDTH: usize = SCALARS + 18;
pub const DISABLE_WEAPONS: usize = 0;
pub const DISABLE_DEFENSE: usize = 1;
pub const DISABLE_MOTION: usize = 2;
pub const DISABLE_VENTING: usize = 3;
pub const DISABLE_SYSTEMS: usize = 4;
pub const COLLISION_DISABLED: usize = 5;
pub const VISUAL_ALPHA: usize = 6;
pub const SIGHT_FLAT: usize = 7;
pub const SIGHT_PERCENT: usize = 8;
pub const SHIELD_DAMAGE: usize = 9;
pub const SHIELD_UPKEEP: usize = 10;
pub const HULL_DAMAGE: usize = 11;
pub const ARMOR_DAMAGE: usize = 12;
pub const EMP_DAMAGE: usize = 13;
pub const REPAIR_TIME: usize = 14;
pub const TIME: usize = 15;
pub const BEAM_DAMAGE: usize = 16;
pub const RECOIL: usize = 17;
pub const FIGHTER_DAMAGE: usize = 18;
pub const HARD_FLUX: usize = 19;
pub const SOFT_FLUX: usize = 20;
pub const SPEED_FLAT: usize = 21;
pub const SPEED_PERCENT: usize = 22;
pub const ACCEL_FLAT: usize = 23;
pub const DECEL_FLAT: usize = 24;
pub const DISSIPATION: usize = 25;
pub const SUPPRESS_BOOST: usize = 26;
pub const ACCEL_PERCENT: usize = 27;
pub const DECEL_PERCENT: usize = 28;
pub const TURN_FLAT: usize = 29;
pub const TURN_PERCENT: usize = 30;
pub const TURN_ACCEL_FLAT: usize = 31;
pub const TURN_ACCEL_PERCENT: usize = 32;
pub const BALLISTIC: usize = 0;
pub const ENERGY: usize = 1;
pub const MISSILE: usize = 2;
pub const DAMAGE: usize = 0;
pub const RATE: usize = 1;
pub const COST: usize = 2;
pub const RANGE: usize = 3;
pub const PROJECTILE_SPEED: usize = 4;
pub const AMMO_REGEN: usize = 5;
fn weapon_index(kind:usize,key:usize)->usize {SCALARS+kind*6+key}
fn multiplier(i:usize)->bool {matches!(i,6|9..=18|25)||i>=SCALARS&&matches!((i-SCALARS)%6,0|1|2|5)}

#[derive(Clone, PartialEq)]
pub struct Modifiers { defined:u64,values:[f64;WIDTH] }
impl std::fmt::Debug for Modifiers {fn fmt(&self,f:&mut std::fmt::Formatter<'_>)->std::fmt::Result {
    let fields=std::array::from_fn::<_,WIDTH,_>(|i|self.field(i));f.debug_struct("Modifiers").field("fields",&fields).finish()
}}
impl Default for Modifiers {fn default()->Self {Self {defined:0,values:[0.0;WIDTH]}}}
impl Modifiers {
    pub fn set(&mut self,key:usize,value:f64) {self.values[key]=value;self.defined|=1_u64<<key;}
    /// Presence is separate from the live value, including explicit zero/one.
    /// The array read retains the original bounds check before the mask shift.
    pub fn field(&self,key:usize)->Option<f64> {let value=self.values[key];(self.defined&(1_u64<<key)!=0).then_some(value)}
    pub fn set_field(&mut self,key:usize,value:Option<f64>) {match value {Some(value)=>self.set(key,value),None=>{self.values[key]=0.0;self.defined&=!(1_u64<<key);}}}
    pub fn weapon(&mut self,kind:usize,key:usize,value:f64) {self.set(weapon_index(kind,key),value);}
    pub fn get(&self,key:usize)->f64 {self.field(key).unwrap_or(if multiplier(key){1.0}else{0.0})}
    pub fn weapon_value(&self,kind:usize,key:usize)->f64 {self.get(weapon_index(kind,key))}
    /// Same left-to-right arithmetic as combineSystemModifiers. Missing fields
    /// are distinct from explicit zero/one, including subsequent parent folds.
    pub fn combine(&mut self,other:&Self) {let mut defined=other.defined;while defined!=0 {
        let i=defined.trailing_zeros()as usize;let value=other.values[i];
        self.set(i,if multiplier(i){self.field(i).unwrap_or(1.0)*value}else{self.field(i).unwrap_or(0.0)+value});
        defined&=defined-1;
    }}
    pub fn words(&self)->[f64;WIDTH] {let mut result=[f64::NAN;WIDTH];let mut defined=self.defined;while defined!=0 {let i=defined.trailing_zeros()as usize;result[i]=self.values[i];defined&=defined-1;}result}
    /// Finite production representation; `words` is for differential fixtures.
    pub fn defined_mask(&self)->u64 {self.defined}
    pub fn values(&self)->[f64;WIDTH] {self.values}
    pub fn valid(&self)->bool {let mut defined=self.defined;while defined!=0 {let i=defined.trailing_zeros()as usize;if !self.values[i].is_finite(){return false;}defined&=defined-1;}true}
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Kind {None,Eclipse,Edict,Yamato,Jump,ArkForge,ArkBarrier,ArkRepair,RocAttitude,RocFire,Zhefeng,
    GravityWell,GravityBattleWell,GravityOther,BurnDrive,AmmoFeed,HighEnergyFocus,ManeuveringJets,FortressShield,PlasmaJets}
impl Kind {pub fn from_id(id:&str)->Option<Self> {Some(match id {
    "NONE"=>Self::None,"WEB_ZHUYUAN_ECLIPSE_PROTOCOL"=>Self::Eclipse,"WEB_GLORIANA_BROADSIDE_EDICT"=>Self::Edict,
    "WEB_SC2_HYPERION_YAMATO"=>Self::Yamato,"WEB_SC2_HYPERION_JUMP"=>Self::Jump,
    "WEB_ADUN_ARK_FORGE"=>Self::ArkForge,"WEB_ADUN_ARK_BARRIER"=>Self::ArkBarrier,"WEB_ADUN_ARK_REPAIR"=>Self::ArkRepair,
    "WEB_ROCINANTE_ATTITUDE"=>Self::RocAttitude,"WEB_ROCINANTE_FIRE_CONTROL"=>Self::RocFire,
    "WEB_ZHEFENG_COMMUTATOR"=>Self::Zhefeng,"WEB_GRAVITY_WELL"=>Self::GravityWell,
    "WEB_GRAVITY_BATTLE_WELL"=>Self::GravityBattleWell,
    "WEB_GRAVITY_REPULSOR"|"WEB_GRAVITY_VECTOR_TURN"|"WEB_GRAVITY_REMOTE_RELEASE"|"WEB_GRAVITY_DIRECTIONAL_PUSH"|
    "WEB_GRAVITY_POLARITY"|"WEB_GRAVITY_COLLAPSE"|"WEB_GRAVITY_BATTLE_REPULSOR"=>Self::GravityOther,
    "BURN_DRIVE"=>Self::BurnDrive,"AMMO_FEED"=>Self::AmmoFeed,
    "HIGH_ENERGY_FOCUS"=>Self::HighEnergyFocus,"MANEUVERING_JETS"=>Self::ManeuveringJets,
    "FORTRESS_SHIELD"=>Self::FortressShield,"PLASMA_JETS"=>Self::PlasmaJets,_=>return None})}}

#[derive(Clone, Copy, Default)]
pub struct Owner {
    pub hp:f64,pub dead:bool,pub retreated:bool,pub retreating:bool,pub docked:bool,pub phased:bool,
    pub flux_percent:f64,pub venting:bool,pub overloaded:bool,pub disable_systems:f64,
    pub engineering_online:bool,pub corona:bool,
}
impl Owner {pub fn alive(self)->bool {!self.dead&&self.hp>0.0&&!self.retreated&&!self.docked}
    pub fn online(self)->bool {self.alive()&&!self.retreating&&!self.overloaded&&!self.venting&&self.disable_systems<=0.0}}

#[derive(Clone, Copy)]
pub struct SystemView {
    pub kind:Kind,pub state:u32,pub level:f64,pub retained:f64,pub active:bool,pub available:bool,pub disabled:bool,
    pub cooldown:f64,pub max_cooldown:f64,pub jump_origin:bool,pub gravity_collapse:bool,
    /// -1 = port, +1 = starboard; 0 = no accepted broadside.
    pub locked_side:i32,
}
impl SystemView {
    pub fn ambush_remaining(self,owner:Option<Owner>)->f64 {
        if self.kind!=Kind::Jump||self.state!=COOLDOWN||!self.jump_origin||self.disabled
            ||!owner.is_some_and(|s|s.online()){0.0}else{(self.cooldown-(self.max_cooldown-6.0).max(0.0)).max(0.0)}
    }
}
fn mobility(owner:Option<Owner>)->Modifiers {let mut m=Modifiers::default();m.set(SUPPRESS_BOOST,1.0);
    if owner.is_some_and(|o|!o.engineering_online){m.set(SPEED_PERCENT,-45.0);m.set(TURN_PERCENT,-25.0);m.set(TURN_ACCEL_PERCENT,-25.0);}m}
fn forge(level:f64,owner:Option<Owner>)->Modifiers {let mut m=Modifiers::default();let corona=owner.is_some_and(|o|o.corona);
    m.set(DISSIPATION,1.0-0.15*level);m.weapon(ENERGY,DAMAGE,1.0+if corona{0.65}else{0.45}*level);
    m.weapon(ENERGY,RATE,1.0+if corona{0.3}else{0.2}*level);m.weapon(ENERGY,COST,1.0+if corona{0.55}else{0.35}*level);m}

pub fn own_modifiers(s:SystemView,owner:Option<Owner>,capacity:f64)->Modifiers {
    let mut m=Modifiers::default();if !s.available{return m;}
    if !s.active {match s.kind {
        Kind::ArkForge=>return mobility(owner),
        Kind::Jump if s.ambush_remaining(owner)>0.0=>{m.weapon(ENERGY,DAMAGE,1.2);m.weapon(ENERGY,RATE,1.5);m.weapon(ENERGY,COST,1.5);},
        _=>{},}return m;}
    let l=s.level;
    match s.kind {
        Kind::Eclipse=>{let pressure=(owner.map_or(0.0,|o|o.flux_percent)/0.75).clamp(0.0,1.0);
            m.set(SPEED_PERCENT,-35.0*l);m.set(DISSIPATION,1.0-0.5*l);m.set(SHIELD_DAMAGE,1.0+0.3*l);
            m.weapon(ENERGY,DAMAGE,1.0+(0.25+0.75*pressure)*l);m.weapon(ENERGY,PROJECTILE_SPEED,60.0*l);m.weapon(ENERGY,RANGE,20.0*l);},
        Kind::Edict=>{m.set(SUPPRESS_BOOST,1.0);m.set(SPEED_PERCENT,-40.0*l);m.set(ACCEL_PERCENT,-40.0*l);m.set(TURN_PERCENT,-60.0*l);m.set(TURN_ACCEL_PERCENT,-60.0*l);},
        Kind::Yamato=>{m.set(SPEED_PERCENT,-60.0*l);m.set(ACCEL_PERCENT,-60.0*l);},
        Kind::Jump=>m.set(SPEED_PERCENT,-50.0*l),
        Kind::ArkForge=>{m=mobility(owner);let speed=m.field(SPEED_PERCENT).unwrap_or(0.0)-35.0*l;m.combine(&forge(l,owner));m.set(SPEED_PERCENT,speed);},
        Kind::ArkBarrier=>{m.set(SHIELD_DAMAGE,1.0-0.65*l);m.set(SHIELD_UPKEEP,1.0+0.5*l);},
        Kind::ArkRepair=>m.weapon(ENERGY,DAMAGE,1.0-0.6*l),
        Kind::RocAttitude=>if s.state==ACTIVE&&owner.is_none_or(|o|o.alive()){m.set(TURN_PERCENT,80.0);m.set(TURN_ACCEL_PERCENT,120.0);},
        Kind::RocFire=>if !s.disabled&&s.state==ACTIVE&&owner.is_some_and(|o|o.alive()&&!o.venting&&!o.overloaded){
            m.set(DISSIPATION,0.5);m.weapon(BALLISTIC,RATE,1.5);m.weapon(BALLISTIC,PROJECTILE_SPEED,25.0);m.weapon(BALLISTIC,COST,1.35);},
        Kind::Zhefeng=>if !s.disabled&&owner.is_some_and(|o|!o.dead&&o.hp>0.0&&!o.retreated&&!o.venting&&!o.overloaded){
            if s.state==IN {m.set(SHIELD_DAMAGE,0.5);m.set(SPEED_PERCENT,-30.0);}else if s.state==ACTIVE{
                m.weapon(BALLISTIC,RATE,1.6);m.weapon(BALLISTIC,COST,0.85);}else if s.state==OUT{m.weapon(BALLISTIC,RATE,0.6);}},
        Kind::GravityWell=>if s.state==ACTIVE{m.set(SOFT_FLUX,180.0);},
        Kind::GravityBattleWell=>if s.state==ACTIVE&&!s.gravity_collapse{m.set(SOFT_FLUX,250.0);},
        Kind::BurnDrive=>{m.set(SOFT_FLUX,1.0);m.set(SPEED_FLAT,if s.state==OUT{0.0}else{200.0*l});m.set(ACCEL_FLAT,if s.state==OUT{200.0}else{200.0*l});},
        Kind::AmmoFeed=>{m.weapon(BALLISTIC,RATE,1.0+l);m.weapon(BALLISTIC,COST,0.5);},
        Kind::HighEnergyFocus=>{m.set(SOFT_FLUX,1.0);m.weapon(ENERGY,DAMAGE,1.0+0.5*l);},
        Kind::ManeuveringJets|Kind::PlasmaJets=>{let plasma=s.kind==Kind::PlasmaJets;let retained=s.retained;let down=s.state==OUT;
            m.set(SPEED_FLAT,if down{0.0}else if plasma{125.0}else{50.0});m.set(ACCEL_PERCENT,if plasma{375.0}else{200.0}*retained);m.set(DECEL_PERCENT,if plasma{375.0}else{200.0}*retained);
            m.set(TURN_FLAT,if down{0.0}else{15.0});m.set(TURN_PERCENT,if down{0.0}else{100.0});m.set(TURN_ACCEL_FLAT,if plasma{20.0}else{30.0}*retained);m.set(TURN_ACCEL_PERCENT,if plasma{100.0}else{200.0}*retained);},
        Kind::FortressShield=>{m.set(SHIELD_DAMAGE,1.0-0.9*l);m.set(SHIELD_UPKEEP,0.0);m.set(HARD_FLUX,capacity*0.025);},
        _=>{},
    }m
}

#[derive(Clone, Copy, Default)]
pub struct Module {
    pub child:Owner,pub parent:Owner,pub direct:bool,pub listed:bool,pub battery_side:i32,pub usable_battery:bool,pub loader:bool,
}
pub fn module_modifiers(s:SystemView,parent:Option<Owner>,module:Module)->Modifiers {
    let mut m=Modifiers::default();let l=s.level;
    match s.kind {
        Kind::Edict=>if module.direct&&module.listed&&module.battery_side!=0&&s.locked_side!=0&&s.available&&!s.disabled&&s.active&&l>0.0
            &&parent.is_some_and(|o|o.alive()&&!o.retreating&&!o.venting&&!o.overloaded)&&module.usable_battery {
            if module.battery_side==s.locked_side {m.set(DISSIPATION,1.0-0.3*l);
                m.weapon(BALLISTIC,RATE,(1.0+0.75*l)*if module.loader{1.0+0.5*l}else{1.0});m.weapon(BALLISTIC,RANGE,15.0*l);
                m.weapon(BALLISTIC,COST,(1.0+0.25*l)*if module.loader{1.0-0.2*l}else{1.0});
            }else{m.weapon(BALLISTIC,RATE,1.0-0.35*l);}},
        Kind::ArkForge=>if module.child.alive(){return forge(l,parent);},
        Kind::ArkBarrier=>m.weapon(ENERGY,COST,1.0+0.25*l),
        Kind::ArkRepair=>m.weapon(ENERGY,DAMAGE,1.0-0.6*l),
        _=>{},
    }m
}
/// Recursive auxiliary chain is folded in its stored order; runtime then parent
/// values are added only when querying the owner's primary system.
pub fn compose(systems:&[SystemView],owner:Option<Owner>,capacity:f64,primary:bool,runtime:&Modifiers,parent_systems:&[SystemView],module:Option<Module>)->Modifiers {
    compose_iter(systems.iter().copied(),owner,capacity,primary,runtime,parent_systems.iter().copied(),module)
}
/// Synchronous readers may borrow actual systems without allocating a temporary
/// array. The source's auxiliary cutoff and right-associated fold stay exact.
pub fn compose_iter<I,P>(systems:I,owner:Option<Owner>,capacity:f64,primary:bool,runtime:&Modifiers,parent_systems:P,module:Option<Module>)->Modifiers
where I:Iterator<Item=SystemView>+DoubleEndedIterator+ExactSizeIterator+Clone,P:Iterator<Item=SystemView>{
    // Auxiliary modifiers recurse first: a * (b * c), not (a * b) * c.
    // An unavailable auxiliary ends this chain; its own auxiliary is not read.
    let end=systems.clone().enumerate().skip(1).find_map(|(i,s)|if !s.available{Some(i)}else{None}).unwrap_or(systems.len());
    let mut m=Modifiers::default();for s in systems.take(end).rev() {
        let mut own=own_modifiers(s,owner,capacity);own.combine(&m);m=own;
    }
    if primary {m.combine(runtime);if let Some(child)=module {
        // ShipSystem's outer parent gate deliberately does not test docked.
        if !child.parent.dead&&child.parent.hp>0.0&&!child.parent.retreated&&!child.child.dead&&child.child.hp>0.0&&!child.child.retreated {
            for s in parent_systems {if s.available&&!s.disabled&&s.active {m.combine(&module_modifiers(s,Some(child.parent),child));}}
        }
    }}m
}

pub const BLOCK_DISSIPATION:u32=1;
pub const BLOCK_ACCELERATION:u32=2;
pub const BLOCK_STRAFING:u32=4;
pub const FORCE_AUTOFIRE:u32=8;
pub const BLOCK_WEAPONS:u32=16;
pub const BLOCK_SHIELDS:u32=32;
pub const LOCK_TURNING:u32=64;
pub const FORCE_FORWARD:u32=128;
pub const BLOCK_VENTING:u32=256;
pub const RELEASE_ON_OUT:u32=512;
#[derive(Clone, Copy)]
pub struct ControlSpec {pub flags:u32,pub phase:bool,pub vulnerable_up:bool,pub vulnerable_down:bool}
#[derive(Clone, Copy, Default)]
pub struct Controls {pub bits:u32,pub phased:bool}
pub fn controls(s:SystemView,spec:ControlSpec,runtime:&Modifiers)->Controls {
    let mut bits=if s.active&&!(s.state==OUT&&spec.flags&RELEASE_ON_OUT!=0){spec.flags&!RELEASE_ON_OUT}else{0};
    if runtime.get(DISABLE_WEAPONS)>0.0{bits|=BLOCK_WEAPONS;}
    if runtime.get(DISABLE_DEFENSE)>0.0||s.available&&!s.disabled&&s.kind==Kind::Zhefeng&&s.state==ACTIVE{bits|=BLOCK_SHIELDS;}
    if runtime.get(DISABLE_MOTION)>0.0{bits|=BLOCK_ACCELERATION|BLOCK_STRAFING|LOCK_TURNING;}
    if runtime.get(DISABLE_VENTING)>0.0{bits|=BLOCK_VENTING;}
    let phased=s.available&&s.active&&spec.phase&&match s.state{IN=>!spec.vulnerable_up,OUT=>!spec.vulnerable_down,ACTIVE=>true,_=>false};
    Controls {bits,phased}
}
pub fn can_fire(systems:&[SystemView],controls:Controls,point_defense:bool)->bool {
    controls.bits&BLOCK_WEAPONS==0&&systems.iter().all(|s|!s.available||s.kind!=Kind::Zhefeng||s.state!=IN||point_defense)
}
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct AutofirePolicy {pub suppress:bool,pub suspended:bool}
pub fn rocinante_policy(s:SystemView,owner:Option<Owner>,role_point_defense:bool)->Option<AutofirePolicy> {
    if s.kind==Kind::RocFire&&s.available&&!s.disabled&&owner.is_some_and(|o|o.alive())&&role_point_defense{
        Some(AutofirePolicy {suppress:s.state==ACTIVE,suspended:s.state==IN||s.state==OUT})
    }else{None}
}

#[derive(Clone, Default)]
pub struct Bulkheads {pub used:bool,pub remaining:f64}
impl Bulkheads {
    pub fn advance(&mut self,dt:f64,available:bool,hp:f64,max_hp:f64,reserved:f64,flux:&mut Flux)->bool {
        if !(dt>0.0){return false;}if !available{self.remaining=0.0;return false;}
        if self.remaining>0.0 {self.remaining=(self.remaining-dt).max(0.0);if self.remaining<1e-8{self.remaining=0.0;}return false;}
        let cost=flux.max*0.25;
        if self.used||hp>max_hp*0.4||flux.venting||flux.overloaded||flux.max<=0.0||flux.total()+reserved+cost>flux.max{return false;}
        flux.increase_clamped(cost,true);self.used=true;self.remaining=6.0;true
    }
    pub fn modifiers(&self)->Modifiers {let mut m=Modifiers::default();if self.remaining>0.0{
        m.set(ARMOR_DAMAGE,0.4);m.set(HULL_DAMAGE,0.4);m.set(DISABLE_WEAPONS,1.0);m.set(DISABLE_VENTING,1.0);}m}
    pub fn words(&self)->[f64;2] {[self.used as u32 as f64,self.remaining]}
}

#[derive(Clone, Copy)]
pub struct RepairMount {pub cycle:f64,pub idle:bool,pub trigger:bool}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RepairReason {Waiting,Exhausted,Ceiling,NoReserve,Working}
#[derive(Clone)]
pub struct FieldRepair {
    pub quiet:f64,pub used:f64,pub tick:f64,pub working:bool,pub reason:RepairReason,pub cycles:Vec<f64>,
}
impl FieldRepair {
    pub fn new(mounts:&[RepairMount])->Self {Self {quiet:0.0,used:0.0,tick:0.0,working:false,reason:RepairReason::Waiting,cycles:mounts.iter().map(|m|m.cycle).collect()}}
    pub fn interrupt(&mut self) {self.quiet=0.0;self.tick=0.0;self.working=false;self.reason=RepairReason::Waiting;}
    /// Call immediately for positive real armor/hull damage, before later steps.
    pub fn on_damage(&mut self,damage:f64) {if damage>0.0{self.interrupt();}}
    /// Post-weapons/system stage; every slot is read even after firing is found.
    pub fn advance(&mut self,dt:f64,online:bool,core_enabled:bool,is_firing_main:bool,any_system_active:bool,since_shield_damage:f64,
        mounts:&[RepairMount],max_hp:f64,hp:&mut f64,charges:&mut f64) {
        if !dt.is_finite()||dt<=0.0{return;}
        let mut firing=is_firing_main||any_system_active;
        for (i,w) in mounts.iter().enumerate(){firing|=!w.idle||w.trigger||self.cycles.get(i).is_none_or(|c|*c!=w.cycle);}
        self.cycles.clear();self.cycles.extend(mounts.iter().map(|m|m.cycle));
        if !online||!core_enabled||firing{self.interrupt();return;}
        self.quiet=6.0_f64.min(self.quiet+dt).min(since_shield_damage);self.working=false;
        let ceiling=max_hp*0.8;let budget=max_hp*0.2;
        if self.used>=budget-1e-7{self.reason=RepairReason::Exhausted;self.tick=0.0;return;}
        if *hp>=ceiling-1e-7{self.reason=RepairReason::Ceiling;self.tick=0.0;return;}
        if self.quiet<6.0{self.reason=RepairReason::Waiting;self.tick=0.0;return;}
        if *charges<1.0{self.reason=RepairReason::NoReserve;self.tick=0.0;return;}
        self.working=true;self.reason=RepairReason::Working;self.tick+=dt*6.0;
        let hp_per_energy=max_hp*0.005/6.0;
        while self.tick>=1.0&&*charges>=1.0&&self.used<budget-1e-7&&*hp<ceiling-1e-7{
            let amount=hp_per_energy.min(budget-self.used).min(ceiling-*hp);*charges-=1.0;self.tick-=1.0;*hp+=amount;self.used+=amount;
        }
        self.tick=self.tick.min(1.0);
        if self.used>=budget-1e-7{self.working=false;self.reason=RepairReason::Exhausted;}
        else if *hp>=ceiling-1e-7{self.working=false;self.reason=RepairReason::Ceiling;}
        else if *charges<1.0{self.working=false;self.reason=RepairReason::NoReserve;}
    }
    pub fn words(&self)->[f64;5] {[self.quiet,self.used,self.tick,self.working as u32 as f64,match self.reason{RepairReason::Waiting=>0.0,RepairReason::Exhausted=>1.0,RepairReason::Ceiling=>2.0,RepairReason::NoReserve=>3.0,RepairReason::Working=>4.0}]}
}

#[derive(Clone, Default)]
pub struct Compensation {pub x:f64,pub y:f64,pub remaining:f64}
impl Compensation {
    pub fn active(&self)->bool {self.remaining>0.0}
    pub fn on_recoil(&mut self,railgun:bool,eligible:bool,attitude_active:bool,dx:f64,dy:f64,flux:&mut Flux)->bool {
        if !railgun||!eligible||flux.overloaded||flux.venting||attitude_active||flux.total()+120.0>flux.max||self.active(){return false;}
        flux.increase(120.0,false,false);self.x=-dx*0.7;self.y=-dy*0.7;self.remaining=0.25;true
    }
    pub fn advance(&mut self,dt:f64,eligible:bool,velocity:&mut [f64;2]) {
        if !self.active()||!(dt>0.0){return;}if !eligible{*self=Self::default();return;}
        let fraction=dt.min(self.remaining)/0.25;velocity[0]+=self.x*fraction;velocity[1]+=self.y*fraction;
        self.remaining-=dt.min(self.remaining);if self.remaining<=1e-9{*self=Self::default();}
    }
    pub fn words(&self)->[f64;4] {if self.active(){[1.0,self.x,self.y,self.remaining]}else{[0.0,0.0,0.0,0.0]}}
}

/// Shared stock is the actual lifecycle charges slot. Selection/readiness must
/// call the same predicate before acceptance and again at event execution.
pub fn shared_reason(core_present:bool,core_online:bool,other_active:bool,charges:f64,cost:f64)->u32 {
    if !core_present{1}else if !core_online{2}else if other_active{3}else if charges<cost{4}else{0}
}
pub fn spend_shared(core_present:bool,core_online:bool,other_active:bool,charges:&mut f64,cost:f64)->bool {
    if shared_reason(core_present,core_online,other_active,*charges,cost)!=0{return false;}*charges-=cost;true
}
pub fn ark_regen(owner:Owner,any_system_active:bool)->f64 {
    if owner.alive()&&!owner.overloaded&&!owner.venting&&!any_system_active{
        (if owner.engineering_online{2.5}else{0.8})*if owner.corona{0.7}else{1.0}
    }else{0.0}
}
pub fn ark_repair_hp(hp:&mut f64,max_hp:f64,dt:f64,craft:bool) {*hp=max_hp.min(*hp+max_hp*if craft{0.12}else{0.015}*dt);}

/// Accepted command-edge broadside; callers retain this result through aim or
/// facing changes. This decision has no geometry-tolerance exemption.
pub fn broadside(point:[f64;2],origin:[f64;2],facing:f64)->i32 {
    let dx=point[0]-origin[0];let dy=point[1]-origin[1];let right=-dx*facing.sin()+dy*facing.cos();
    // V8 Math.hypot's two-input scaled sum, not Rust/libm hypot. The former
    // controls the Web broadside dead-cone decision at adjacent f64 values.
    let a=dx.abs();let b=dy.abs();let max=a.max(b);
    let length=if max==f64::INFINITY{f64::INFINITY}else if max==0.0{0.0}else{
        let x=a/max;let y=b/max;let sum=x*x+y*y;sum.sqrt()*max
    };
    if !right.is_finite()||right.abs()<8.0_f64.max(length*0.2){0}else if right<0.0{-1}else{1}
}

fn vector_length(v:[f64;2])->f64 {
    let a=v[0].abs();let b=v[1].abs();if a==f64::INFINITY||b==f64::INFINITY{return f64::INFINITY;}
    let max=if a>b{a}else{b};if max==0.0&&a==0.0{return 0.0;}
    let ratio=if a>b{b}else{a}/max;(1.0+ratio*ratio).sqrt()*max
}
fn js_hypot(v:[f64;2])->f64 {
    let a=v[0].abs();let b=v[1].abs();if a==f64::INFINITY||b==f64::INFINITY{return f64::INFINITY;}
    if a.is_nan()||b.is_nan(){return f64::NAN;}let max=a.max(b);if max==0.0{return 0.0;}
    let x=a/max;let y=b/max;(x*x+y*y).sqrt()*max
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum JumpFailure {Invalid,Near,Far,Environment,Ship,Asteroid}
#[derive(Clone, Copy)]
pub struct JumpObstacle {pub identity:u32,pub position:[f64;2],pub radius:f64,pub fighter:bool}
#[derive(Clone, Copy)]
pub struct JumpAsteroid {pub position:[f64;2],pub radius:f64,pub hp:Option<f64>}
pub struct JumpWorld<'a> {pub ships:&'a [JumpObstacle],pub asteroids:Option<&'a [JumpAsteroid]>}
/// Manual command and execution use Math.hypot, including <=range+1e-6.
pub fn jump_failure(ship:JumpObstacle,point:[f64;2],range:f64,world:Option<&JumpWorld<'_>>)->Option<JumpFailure> {
    if !point.into_iter().chain(ship.position).chain([range]).all(|v|v.is_finite())||range<=0.0{return Some(JumpFailure::Invalid);}
    let distance=js_hypot([point[0]-ship.position[0],point[1]-ship.position[1]]);
    if distance<200.0{return Some(JumpFailure::Near);}if distance>range+1e-6{return Some(JumpFailure::Far);}
    let Some(world)=world else{return None;};let Some(asteroids)=world.asteroids else{return Some(JumpFailure::Environment);};
    let radius=ship.radius.max(1.0);
    for other in world.ships {if other.identity==ship.identity||other.fighter{continue;}
        if js_hypot([point[0]-other.position[0],point[1]-other.position[1]])<radius+other.radius+1.0{return Some(JumpFailure::Ship);}}
    for rock in asteroids {if rock.hp.is_some_and(|hp|hp<=0.0){continue;}
        if js_hypot([point[0]-rock.position[0],point[1]-rock.position[1]])<radius+rock.radius+1.0{return Some(JumpFailure::Asteroid);}}
    None
}
fn clear_landing(ship:JumpObstacle,point:[f64;2],world:&JumpWorld<'_>)->bool {
    let Some(asteroids)=world.asteroids else{return false;};if !point.iter().all(|v|v.is_finite()){return false;}
    let radius=ship.radius.max(1.0);
    for other in world.ships {if other.identity==ship.identity||other.fighter{continue;}
        if vector_length([point[0]-other.position[0],point[1]-other.position[1]])<radius+other.radius+1.0{return false;}}
    for rock in asteroids {if rock.hp.is_some_and(|hp|hp<=0.0){continue;}
        if vector_length([point[0]-rock.position[0],point[1]-rock.position[1]])<radius+rock.radius+1.0{return false;}}
    true
}
/// Current Web AI search uses Vector2's scaled norm, not Math.hypot. Search
/// order, ring/angle bounds, radius fallback and range gate are unchanged.
pub fn find_jump_destination(ship:JumpObstacle,desired:[f64;2],range:f64,world:&JumpWorld<'_>)->Option<[f64;2]> {
    if world.asteroids.is_none()||!desired.iter().chain(ship.position.iter()).all(|v|v.is_finite())||!range.is_finite()||range<=0.0{return None;}
    let delta=[desired[0]-ship.position[0],desired[1]-ship.position[1]];let distance=vector_length(delta);
    let clamped=if distance>range{let scale=range/distance;[ship.position[0]+delta[0]*scale,ship.position[1]+delta[1]*scale]}else{desired};
    if clear_landing(ship,clamped,world){return Some(clamped);}let step=ship.radius.max(1.0);
    for ring in 1..=10 {for angle in 0..12 {
        let heading=angle as f64*std::f64::consts::PI/6.0;let radius=ring as f64*step;
        let candidate=[clamped[0]+heading.cos()*radius,clamped[1]+heading.sin()*radius];
        if vector_length([candidate[0]-ship.position[0],candidate[1]-ship.position[1]])<=range+1e-6&&clear_landing(ship,candidate,world){return Some(candidate);}
    }}None
}
#[derive(Clone, Copy)]
pub struct ActivationInput {
    pub point:[f64;2],pub origin:[f64;2],pub velocity:[f64;2],pub facing:f64,
    pub target:Option<(u32,u32)>,pub gravity_anchor_serial:Option<f64>,
}
#[derive(Clone, Copy)]
pub struct JumpVisual {
    pub serial:f64,pub destination:[f64;2],pub destination_facing:f64,pub origin:Option<[f64;2]>,pub origin_facing:Option<f64>,
}
#[derive(Clone, Default)]
pub struct TacticalJump {pub input:Option<ActivationInput>,pub visual:Option<JumpVisual>}
#[derive(Clone, Copy)]
pub struct JumpGate {pub owner:Owner,pub system_disabled:bool,pub core_present:bool,pub core_online:bool,pub other_active:bool}
impl JumpGate {fn online(self)->bool{self.owner.online()&&!self.system_disabled}
    fn resource(self,charges:f64)->bool {shared_reason(self.core_present,self.core_online,self.other_active,charges,75.0)==0}}
#[derive(Clone, Copy)]
pub struct JumpPose {pub position:[f64;2],pub previous:[f64;2],pub velocity:[f64;2],pub facing:f64,pub previous_facing:f64,
    pub sequence:f64,pub camera_offset:[f64;2]}
impl TacticalJump {
    /// Called at actual onActivate event, after command acceptance. False means
    /// original deactivate must run before later queued active events dispatch.
    pub fn on_activate(&mut self,gate:JumpGate,charges:f64,ship:JumpObstacle,range:f64,manual:bool,serial:f64,world:&JumpWorld<'_>)->bool {
        self.visual=None;let Some(input)=self.input else{return false;};if !gate.online()||!gate.resource(charges){return false;}
        let destination=if manual{if jump_failure(ship,input.point,range,Some(world)).is_some(){None}else{Some(input.point)}}else{find_jump_destination(ship,input.point,range,world)};
        let Some(destination)=destination else{return false;};if vector_length([destination[0]-ship.position[0],destination[1]-ship.position[1]])<200.0{return false;}
        self.visual=Some(JumpVisual {serial,destination,destination_facing:input.facing,origin:None,origin_facing:None});true
    }
    /// Applies the actual authoritative relocation and shared resource debit.
    /// A failed second clearance only clears the plan; it never searches again.
    pub fn on_active(&mut self,gate:JumpGate,charges:&mut f64,ship:JumpObstacle,range:f64,pose:&mut JumpPose,world:&JumpWorld<'_>)->bool {
        let Some(mut plan)=self.visual else{return false;};
        if !gate.online()||self.input.is_none()||!gate.resource(*charges)
            ||jump_failure(ship,plan.destination,range,Some(world)).is_some()
            ||vector_length([plan.destination[0]-ship.position[0],plan.destination[1]-ship.position[1]])<200.0 {self.visual=None;return false;}
        if !spend_shared(gate.core_present,gate.core_online,gate.other_active,charges,75.0){return false;}
        plan.origin=Some(pose.position);plan.origin_facing=Some(pose.facing);self.visual=Some(plan);
        pose.sequence+=1.0;pose.camera_offset[0]+=pose.position[0]-plan.destination[0];pose.camera_offset[1]+=pose.position[1]-plan.destination[1];
        pose.position=plan.destination;pose.previous=plan.destination;pose.facing=plan.destination_facing;pose.previous_facing=plan.destination_facing;
        pose.velocity[0]*=0.5;pose.velocity[1]*=0.5;true
    }
    /// True requires lifecycle interrupt. Even during OUT the visual/input clear.
    pub fn on_advance(&mut self,gate:JumpGate,s:SystemView)->bool {
        let interrupted=s.active&&!gate.online();if interrupted{self.visual=None;self.input=None;}
        let mut view=s;view.jump_origin=self.visual.is_some_and(|v|v.origin.is_some());
        if !gate.online()||!s.active&&view.ambush_remaining(Some(gate.owner))<=0.0{self.visual=None;}interrupted
    }
    /// Actual onReset only clears visuals; the lifecycle reset separately clears
    /// accepted input at its original ordering boundary.
    pub fn on_reset(&mut self){self.visual=None;}
    pub fn words(&self)->[f64;12] {
        let Some(v)=self.visual else{let mut row=[0.0;12];row[9]=self.input.is_some() as u32 as f64;return row;};let origin=v.origin.unwrap_or([0.0;2]);
        [1.0,v.serial,v.destination[0],v.destination[1],v.destination_facing,v.origin.is_some() as u32 as f64,
            origin[0],origin[1],v.origin_facing.unwrap_or(0.0),self.input.is_some() as u32 as f64,0.0,0.0]
    }
}
/// Same actual Web Yamato angle gate; no damage/spawn callback is substituted.
pub fn yamato_aim_failure(point:[f64;2],position:[f64;2],facing:f64)->u32 {
    let delta=[point[0]-position[0],point[1]-position[1]];
    if !delta.iter().all(|v|v.is_finite())||vector_length(delta)<400.0{return 1;}
    let angle=delta[1].atan2(delta[0])-facing;let signed=angle.sin().atan2(angle.cos());
    if signed.abs()>std::f64::consts::PI/15.0{2}else{0}
}

