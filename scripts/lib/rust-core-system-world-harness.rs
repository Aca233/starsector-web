//! Isolated actual-source lifecycle/world-effect verification only.
#[path="../../native/combat-core/src/flux.rs"]mod flux;
#[path="../../native/combat-core/src/lifecycle.rs"]mod lifecycle;
#[path="../../native/combat-core/src/ship_effects.rs"]mod ship_effects;
#[path="../../native/combat-core/src/system_world.rs"]mod system_world;
#[path="../../native/combat-core/src/random.rs"]mod random;
use system_world::*;use ship_effects::{Kind,Owner,ActivationInput};use std::cell::RefCell;
fn kind(n:u32)->Kind {match n{1=>Kind::Eclipse,2=>Kind::Edict,3=>Kind::Yamato,4=>Kind::Jump,5=>Kind::ArkForge,6=>Kind::ArkBarrier,7=>Kind::ArkRepair,
    8=>Kind::RocAttitude,9=>Kind::RocFire,10=>Kind::Zhefeng,_=>Kind::None}}
#[derive(Clone)]struct World {ships:Vec<ShipRead>,systems:Vec<SystemRead>,random:random::Random,emissions:Vec<[f64;13]>,sounds:u32,fail_spawn:bool,fail_stock:bool,missing_slot:bool}
impl Host for World {
    fn ship(&self,id:Identity)->Result<ShipRead,Failure>{self.ships.iter().find(|s|s.identity==id).cloned().ok_or(Failure::StaleIdentity)}
    fn systems(&self,_:Identity)->Result<Vec<SystemRead>,Failure>{let mut entries=Vec::new();if !self.missing_slot{entries.push(SystemRead{id:11,kind:Kind::None,active:false,disabled:false,charges:0.0,pending_flux:0.0});}entries.extend(self.systems.iter().copied());Ok(entries)}
    fn assembly(&self,_:Identity)->Result<Vec<Identity>,Failure>{Ok(self.ships.iter().take(3).map(|s|s.identity).collect())}
    fn children(&self,_:Identity)->Result<Vec<Identity>,Failure>{Ok(self.ships.iter().skip(1).take(2).map(|s|s.identity).collect())}
    fn roster(&self)->Vec<Identity>{self.ships.iter().map(|s|s.identity).collect()}
    fn stock(&self,_:Identity,core:Kind)->Result<Option<SystemRead>,Failure>{if self.fail_stock{return Err(Failure::StaleIdentity);}Ok(self.systems.iter().find(|s|s.kind==core).copied())}
    fn spend_stock(&mut self,_:Identity,core:Kind,amount:f64)->Result<(),Failure>{let s=self.systems.iter_mut().find(|s|s.kind==core).ok_or(Failure::CoreMissing)?;s.charges-=amount;Ok(())}
    fn set_regen(&mut self,_:Identity,_:u32,_:f64)->Result<(),Failure>{Ok(())}
    fn heal(&mut self,id:Identity,amount:f64)->Result<(),Failure>{let s=self.ships.iter_mut().find(|s|s.identity==id).ok_or(Failure::StaleIdentity)?;s.owner.hp=s.maximum_hp.min(s.owner.hp+amount);Ok(())}
    fn spawn_yamato(&mut self,p:SpawnYamato)->Result<(),Failure>{let id=self.random.next();let mult=1.07*1.21;let speed=1200.0;
        self.emissions.push([id,p.position[0],p.position[1],p.facing.cos()*speed+p.velocity[0],p.facing.sin()*speed+p.velocity[1],p.facing,6500.0*mult,6500.0,mult,2400.0,1200.0,p.velocity[0],p.velocity[1]]);if self.fail_spawn{Err(Failure::Host)}else{Ok(())}}
    fn play_yamato(&mut self,_:Identity)->Result<(),Failure>{self.sounds+=1;Ok(())}
    fn jump_obstacles(&self)->Result<(Vec<ship_effects::JumpObstacle>,Option<Vec<ship_effects::JumpAsteroid>>),Failure>{Ok((Vec::new(),Some(Vec::new())))}
    fn jump_pose(&self,_:Identity)->Result<ship_effects::JumpPose,Failure>{Err(Failure::Unsupported)}
    fn apply_jump_pose(&mut self,_:Identity,_:ship_effects::JumpPose)->Result<(),Failure>{Err(Failure::Unsupported)}
}
struct Fixture {input:Vec<f64>,output:Vec<f64>,slot:Option<Slot>,world:World,reason:u32}
thread_local!{static F:RefCell<Fixture>=RefCell::new(Fixture {input:Vec::new(),output:Vec::new(),slot:None,reason:0,world:World {ships:Vec::new(),systems:Vec::new(),random:random::Random::new(7191),emissions:Vec::new(),sounds:0,fail_spawn:false,fail_stock:false,missing_slot:false}});}
fn failure_code(reason:Option<Failure>)->u32 {match reason {None=>0,Some(Failure::Unavailable)=>1,Some(Failure::InactiveOwner)=>2,Some(Failure::Disabled)=>3,
    Some(Failure::Cooldown)=>4,Some(Failure::Out)=>5,Some(Failure::Active)=>6,Some(Failure::Retreating)=>7,Some(Failure::Overloaded)=>8,Some(Failure::Venting)=>9,
    Some(Failure::Flux)=>10,Some(Failure::Charges)=>11,Some(Failure::WeaponMissing)=>12,Some(Failure::WeaponOffline)=>13,Some(Failure::CoreMissing)=>14,
    Some(Failure::CoreOffline)=>15,Some(Failure::SharedBusy)=>16,Some(Failure::SharedCharges)=>17,Some(Failure::Aim)=>18,Some(Failure::Side)=>19,Some(Failure::Battery)=>20,
    Some(Failure::Shield)=>21,Some(Failure::NoRepairTarget)=>22,Some(Failure::Compensating)=>23,Some(Failure::Brake)=>24,Some(Failure::Engine)=>25,
    Some(Failure::Reassigning)=>26,Some(Failure::Jump(_))=>27,Some(Failure::StaleIdentity)=>28,Some(Failure::Unsupported)=>29,Some(Failure::Host)=>30}}
fn read_ship(i:usize,d:&[f64])->ShipRead {let identity=Identity{slot:i as u32+1,generation:1};let o=Owner {hp:d[0],dead:d[1]==1.0,retreated:d[2]==1.0,retreating:d[3]==1.0,docked:d[4]==1.0,
    phased:d[5]==1.0,flux_percent:d[6]/1000.0,venting:d[7]==1.0,overloaded:d[8]==1.0,disable_systems:d[9],engineering_online:d[10]==1.0,corona:d[11]==1.0};
    ShipRead {identity,owner:o,maximum_hp:1000.0,position:[d[12],d[13]],velocity:[7.0,-3.0],facing:d[14],radius:100.0,shield_radius:1000.0,
        shield_active:d[15]==1.0,attached:i>0&&i<3,gloriana:d[17]==1.0,parent:if i>0&&i<3{Some(Identity{slot:1,generation:1})}else{None},
        carrier_root:if i>=3{Some(Identity{slot:1,generation:1})}else{None},module_side:d[16] as i32,blocks_weapons:d[18]==1.0,
        hyperion:d[19] as u32&4!=0,reactor_installed:d[19] as u32&2!=0,focus:d[19] as u32&1!=0,current_total_flux:d[6],max_flux:1000.0,brake:d[20]==1.0,flameout_ratio:d[21],
        controller_flamed:d[22]==1.0,controller_disabled:false,compensating:d[23]==1.0,weapons:vec![WeaponRead {weapon_type:ship_effects::ENERGY,disabled:d[24]==1.0,ammo:d[25],point_defense:false},
            WeaponRead {weapon_type:ship_effects::BALLISTIC,disabled:d[26]==1.0,ammo:d[27],point_defense:d[28]==1.0}],aim:[d[29],d[30]],range_multiplier:1.0,manual:true,
        yamato_muzzle:if d[31]==1.0{Some([369.0,0.0])}else{None}}
}
#[no_mangle]pub extern "C" fn test_input(n:u32)->u32{F.with_borrow_mut(|f|{f.input.resize(n as usize,0.0);f.input.as_mut_ptr() as usize as u32})}
#[no_mangle]pub extern "C" fn test_initialize()->u32{F.with_borrow_mut(|f|{
    let d=&f.input;let k=kind(d[0] as u32);let spec=lifecycle::Spec::new(&d[1..10]);f.slot=Some(Slot::new(Identity{slot:1,generation:1},11,k,1,spec));
    f.world=World {ships:(0..5).map(|i|read_ship(i,&d[10+i*32..42+i*32])).collect(),systems:vec![SystemRead{id:12,kind:if matches!(k,Kind::ArkForge|Kind::ArkBarrier|Kind::ArkRepair){Kind::ArkForge}else{Kind::Yamato},active:false,disabled:false,charges:100.0,pending_flux:0.0}],
        random:random::Random::new(7191),emissions:Vec::new(),sounds:0,fail_spawn:false,fail_stock:false,missing_slot:false};0
})}
#[no_mangle]pub extern "C" fn test_step()->u32{F.with_borrow_mut(|f|{
    let d=&f.input;let slot=f.slot.as_mut().unwrap();f.world.ships[0]=read_ship(0,&d[3..35]);f.world.systems[0].active=d[35]==1.0;f.world.systems[0].charges=d[36];f.world.systems[0].disabled=d[37]==1.0;
    f.world.systems[0].pending_flux=d[38];slot.lifecycle.disabled=d[39]==1.0;if d.len()>40{slot.lifecycle.charges=d[40];}let command=d[0] as u32;let dt=d[1];let flags=d[2] as u32;
    f.reason=failure_code(slot.activation_reason(&f.world).err());
    let accepted=if command==1 {let input=ActivationInput {point:[d[32],d[33]],origin:f.world.ships[0].position,velocity:f.world.ships[0].velocity,facing:f.world.ships[0].facing,target:None,gravity_anchor_serial:None};slot.activate(&f.world,input).is_ok()}
        else if command==2{slot.interrupt();true}else{false};
    if flags&1!=0{slot.cancel_before_update(&f.world,dt).unwrap();}slot.update(dt);if flags&1!=0{slot.cancel_after_readiness(&f.world).unwrap();}
    let (cost,_)=slot.consume_flux();let mut result=true;if flags&2==0{result=slot.dispatch(&mut f.world,dt).is_ok();if flags&4!=0{result&=slot.dispatch(&mut f.world,0.0).is_ok();}}
    f.output=vec![accepted as u32 as f64,result as u32 as f64,cost,slot.regen,f.world.systems[0].charges,f.world.random.cursor,f.world.random.ids,f.world.sounds as f64,f.world.emissions.len() as f64];
    f.output.extend(slot.lifecycle.words());f.output.push(slot.input.is_some() as u32 as f64);for s in &f.world.ships{f.output.push(s.owner.hp);}for p in &f.world.emissions{f.output.extend(p);}f.output.as_ptr() as usize as u32
})}
#[no_mangle]pub extern "C" fn test_output_words()->u32{F.with_borrow(|f|f.output.len() as u32)}
#[no_mangle]pub extern "C" fn test_reason()->u32{F.with_borrow(|f|f.reason)}

/// Authority contracts beyond the permissive legacy JS world: stale generations
/// fail closed, synchronous failures propagate, and a full caller checkpoint can
/// restore pending events and real RNG/entities before retrying exactly once.
#[no_mangle]pub extern "C" fn test_contract()->u32{F.with_borrow(|f|{
    let owner=Identity{slot:1,generation:1};let mut base=f.world.clone();base.emissions.clear();base.sounds=0;base.random=random::Random::new(7191);
    base.fail_spawn=false;base.fail_stock=false;base.missing_slot=false;base.systems[0]=SystemRead{id:12,kind:Kind::Yamato,active:false,disabled:false,charges:100.0,pending_flux:0.0};
    let s=&mut base.ships[0];s.owner=Owner{hp:300.0,dead:false,retreated:false,retreating:false,docked:false,phased:false,flux_percent:0.0,venting:false,overloaded:false,disable_systems:0.0,engineering_online:true,corona:false};
    s.position=[0.0,0.0];s.facing=0.0;s.current_total_flux=0.0;s.aim=[800.0,0.0];s.yamato_muzzle=Some([369.0,0.0]);s.focus=false;s.brake=false;s.controller_flamed=false;s.flameout_ratio=0.0;
    let spec=lifecycle::Spec::new(&[0.0,0.15,0.45,18.0,100.0,100.0,0.0,0.0,1.0]);
    let make=||Slot::new(owner,11,Kind::Yamato,1,spec.clone());
    let input=ActivationInput{point:[800.0,0.0],origin:[0.0,0.0],velocity:[7.0,-3.0],facing:0.0,target:None,gravity_anchor_serial:None};let mut bits=0;
    let mut stale=make();stale.owner.generation=2;if stale.activate(&base,input)==Err(Failure::StaleIdentity)&&stale.lifecycle.serial==0.0{bits|=1;}
    let mut stale=make();let mut target=input;target.target=Some((2,2));let before=stale.lifecycle.words();
    if stale.activate(&base,target)==Err(Failure::StaleIdentity)&&stale.lifecycle.words()==before&&stale.input.is_none(){bits|=2;}
    let mut ordered=base.clone();ordered.missing_slot=true;let mut slot=make();if slot.activate(&ordered,input)==Err(Failure::Host)&&slot.lifecycle.serial==0.0{bits|=4;}
    let mut world=base.clone();let mut slot=make();slot.activate(&world,input).unwrap();world.fail_spawn=true;
    let checkpoint=(slot.clone(),world.clone());let result=slot.dispatch(&mut world,0.0);
    if result==Err(Failure::Host)&&world.random.cursor!=checkpoint.1.random.cursor&&world.emissions.len()==1&&slot.lifecycle.charges==100.0&&world.sounds==0{bits|=8;}
    slot=checkpoint.0.clone();world=checkpoint.1.clone();let restored=slot.lifecycle.words()==checkpoint.0.lifecycle.words()&&slot.input.is_some()&&world.emissions.is_empty()&&world.random.cursor==7191.0;
    world.fail_spawn=false;if restored&&slot.dispatch(&mut world,0.0).is_ok()&&slot.lifecycle.charges==40.0&&world.emissions.len()==1&&world.sounds==1&&world.random.cursor==7191.0+0x6d2b79f5u32 as f64{bits|=16;}
    let mut world=base.clone();world.systems[0].kind=Kind::ArkForge;let mut ark=Slot::new(owner,11,Kind::ArkBarrier,1,spec.clone());ark.activate(&world,input).unwrap();world.fail_stock=true;
    if ark.dispatch(&mut world,0.0)==Err(Failure::StaleIdentity)&&world.systems[0].charges==100.0{bits|=32;}
    let mut unsupported=Slot::new(owner,11,Kind::GravityWell,1,spec.clone());if unsupported.activate(&base,input)==Err(Failure::Unsupported)&&unsupported.lifecycle.serial==0.0{bits|=64;}
    let mut world=base.clone();let mut roc=Slot::new(owner,11,Kind::RocAttitude,1,lifecycle::Spec::new(&[0.1,1.2,0.2,8.0,0.0,0.0,0.0,150.0,1.0]));
    roc.activate(&world,input).unwrap();roc.cancel_before_update(&world,0.1).unwrap();roc.update(0.1);world.ships[0].controller_flamed=true;roc.cancel_after_readiness(&world).unwrap();
    if roc.lifecycle.state==lifecycle::OUT&&roc.lifecycle.pending_activation==0.0&&roc.lifecycle.pending_active==0.0&&roc.lifecycle.pending_flux==150.0{bits|=128;}bits
})}
