//! Independent validation ABI only. Production never imports this harness.
#[path="../../native/combat-core/src/flux.rs"] mod flux;
#[path="../../native/combat-core/src/lifecycle.rs"] mod lifecycle;
#[path="../../native/combat-core/src/ship_effects.rs"] mod ship_effects;
use std::cell::RefCell;
use ship_effects::*;
struct Fixture {input:Vec<f64>,output:Vec<f64>,bulkheads:Bulkheads,repair:FieldRepair,compensation:Compensation,
    flux:flux::Flux,hp:f64,charges:f64,velocity:[f64;2],jump:TacticalJump,pose:JumpPose}
thread_local! {static F:RefCell<Fixture>=RefCell::new(Fixture {input:Vec::new(),output:Vec::new(),bulkheads:Bulkheads::default(),
    repair:FieldRepair::new(&[RepairMount {cycle:0.0,idle:true,trigger:false};2]),compensation:Compensation::default(),
    flux:flux::Flux::new(&[1000.0,0.0,1.0,1.0,1.0,0.0,1.0,0.0,0.0,0.0]),hp:300.0,charges:100.0,velocity:[7.0,-3.0],
    jump:TacticalJump::default(),pose:JumpPose {position:[0.0;2],previous:[0.0;2],velocity:[0.0;2],facing:0.0,previous_facing:0.0,sequence:0.0,camera_offset:[0.0;2]}});}
#[no_mangle]pub extern "C" fn test_input(n:u32)->u32 {F.with_borrow_mut(|f|{f.input.resize(n as usize,0.0);f.input.as_mut_ptr() as usize as u32})}
fn kind(i:f64)->Kind {match i as u32{0=>Kind::None,1=>Kind::Eclipse,2=>Kind::Edict,3=>Kind::Yamato,4=>Kind::Jump,5=>Kind::ArkForge,
    6=>Kind::ArkBarrier,7=>Kind::ArkRepair,8=>Kind::RocAttitude,9=>Kind::RocFire,10=>Kind::Zhefeng,11=>Kind::GravityWell,
    12=>Kind::GravityBattleWell,13=>Kind::GravityOther,14=>Kind::BurnDrive,15=>Kind::AmmoFeed,16=>Kind::HighEnergyFocus,
    17=>Kind::ManeuveringJets,18=>Kind::FortressShield,_=>Kind::PlasmaJets}}
fn owner(d:&[f64])->Owner {Owner {hp:d[0],dead:d[1]==1.0,retreated:d[2]==1.0,retreating:d[3]==1.0,docked:d[4]==1.0,phased:d[5]==1.0,
    flux_percent:d[6],venting:d[7]==1.0,overloaded:d[8]==1.0,disable_systems:d[9],engineering_online:d[10]==1.0,corona:d[11]==1.0}}
fn system(d:&[f64])->SystemView {SystemView {kind:kind(d[0]),state:d[1] as u32,level:d[2],retained:d[3],active:d[4]==1.0,
    available:d[5]==1.0,disabled:d[6]==1.0,cooldown:d[7],max_cooldown:d[8],jump_origin:d[9]==1.0,gravity_collapse:d[10]==1.0,locked_side:d[11] as i32}}
#[no_mangle]pub extern "C" fn test_reset()->u32 {F.with_borrow_mut(|f|{
    f.bulkheads=Bulkheads::default();f.repair=FieldRepair::new(&[RepairMount {cycle:0.0,idle:true,trigger:false};2]);f.compensation=Compensation::default();
    f.flux.soft=0.0;f.flux.hard=0.0;f.flux.venting=false;f.flux.overloaded=false;f.hp=f.input[0];f.charges=f.input[1];f.velocity=[7.0,-3.0];0
})}
#[no_mangle]pub extern "C" fn test_modifiers()->u32 {F.with_borrow_mut(|f| {
    let d=&f.input;let s=system(d);let o=if d[24]==1.0{Some(owner(&d[12..24]))}else{None};
    f.output=own_modifiers(s,o,d[25]).words().to_vec();
    f.output.push(s.ambush_remaining(o));let c=controls(s,ControlSpec {flags:d[26] as u32,phase:d[27]==1.0,vulnerable_up:d[28]==1.0,vulnerable_down:d[29]==1.0},&Modifiers::default());
    f.output.extend([c.bits as f64,c.phased as u32 as f64,can_fire(&[s],c,d[30]==1.0) as u32 as f64]);
    let policy=rocinante_policy(s,o,d[31]==1.0);f.output.extend(policy.map_or([-1.0,-1.0],|p|[p.suppress as u32 as f64,p.suspended as u32 as f64]));
    f.output.as_ptr() as usize as u32
})}
#[no_mangle]pub extern "C" fn test_compose()->u32 {F.with_borrow_mut(|f| {
    let d=&f.input;let systems=[system(&d[0..12]),system(&d[12..24]),system(&d[24..36])];let child=owner(&d[36..48]);let parent=owner(&d[48..60]);
    let ps=[system(&d[60..72]),system(&d[72..84])];let m=Module {child,parent,direct:d[84]==1.0,listed:d[85]==1.0,battery_side:d[86] as i32,usable_battery:d[87]==1.0,loader:d[88]==1.0};
    let mut runtime=Modifiers::default();for i in 0..WIDTH{if d[90+i].is_finite(){runtime.set(i,d[90+i]);}}
    f.output=compose(&systems,Some(child),1000.0,true,&runtime,&ps,if d[89]==1.0{Some(m)}else{None}).words().to_vec();f.output.as_ptr() as usize as u32
})}
#[no_mangle]pub extern "C" fn test_helpers()->u32 {F.with_borrow_mut(|f| {
    let d=&f.input;let o=owner(&d[0..12]);let mut charges=d[12];let reason=shared_reason(d[13]==1.0,d[14]==1.0,d[15]==1.0,charges,d[16]);
    let spent=spend_shared(d[13]==1.0,d[14]==1.0,d[15]==1.0,&mut charges,d[16]);
    let mut hp=d[18];if o.alive()&&!o.overloaded&&!o.venting{ark_repair_hp(&mut hp,1000.0,d[19],d[20]==1.0);}
    let side=broadside([d[21],d[22]],[d[23],d[24]],d[25]);let s=system(&d[26..38]);let policy=rocinante_policy(s,Some(o),d[38]==1.0);
    f.output=vec![reason as f64,spent as u32 as f64,charges,ark_regen(o,d[17]==1.0),hp,side as f64];
    f.output.extend(policy.map_or([-1.0,-1.0],|p|[p.suppress as u32 as f64,p.suspended as u32 as f64]));f.output.as_ptr() as usize as u32
})}
#[no_mangle]pub extern "C" fn test_broadside()->u32 {F.with_borrow_mut(|f| {
    let d=&f.input;f.output=vec![broadside([d[0],d[1]],[d[2],d[3]],d[4]) as f64];f.output.as_ptr() as usize as u32
})}
#[no_mangle]pub extern "C" fn test_jump_initialize()->u32 {F.with_borrow_mut(|f| {
    let d=&f.input;f.pose=JumpPose {position:[d[0],d[1]],previous:[d[2],d[3]],velocity:[d[4],d[5]],facing:d[6],previous_facing:d[7],sequence:d[8],camera_offset:[d[9],d[10]]};
    f.jump=TacticalJump {input:if d[11]==1.0{Some(ActivationInput {point:[d[12],d[13]],origin:[d[0],d[1]],velocity:[d[4],d[5]],facing:d[14],target:None,gravity_anchor_serial:None})}else{None},visual:None};f.charges=d[15];0
})}
#[no_mangle]pub extern "C" fn test_jump()->u32 {F.with_borrow_mut(|f| {
    let d=&f.input;let o=owner(d);let gate=JumpGate {owner:o,system_disabled:d[12]==1.0,core_present:d[13]==1.0,core_online:d[14]==1.0,other_active:d[15]==1.0};
    let action=d[16] as u32;let range=d[17];let manual=d[18]==1.0;let ships_count=d[19] as usize;let asteroid_count=d[20] as usize;
    f.pose.position[0]+=d[21];f.pose.position[1]+=d[22];if d[23]==1.0{f.jump.input=None;}
    let mut offset=37;let mut ships=Vec::new();for _ in 0..ships_count{ships.push(JumpObstacle {identity:d[offset] as u32,position:[d[offset+1],d[offset+2]],radius:d[offset+3],fighter:d[offset+4]==1.0});offset+=5;}
    let mut rocks=Vec::new();for _ in 0..asteroid_count {rocks.push(JumpAsteroid {position:[d[offset],d[offset+1]],radius:d[offset+2],hp:if d[offset+3]==1.0{Some(d[offset+4])}else{None}});offset+=5;}
    let world=JumpWorld {ships:&ships,asteroids:if d[24]==1.0{Some(&rocks)}else{None}};let ship=JumpObstacle {identity:1,position:f.pose.position,radius:100.0,fighter:false};
    let result=match action {0=>!f.jump.on_activate(gate,f.charges,ship,range,manual,7.0,&world),1=>f.jump.on_active(gate,&mut f.charges,ship,range,&mut f.pose,&world),
        2=>f.jump.on_advance(gate,system(&d[25..37])),_=>{f.jump.on_reset();false}};
    f.output=vec![result as u32 as f64,f.charges,f.pose.position[0],f.pose.position[1],f.pose.previous[0],f.pose.previous[1],f.pose.velocity[0],f.pose.velocity[1],f.pose.facing,f.pose.previous_facing,f.pose.sequence,f.pose.camera_offset[0],f.pose.camera_offset[1]];
    f.output.extend(f.jump.words());f.output.push(f.jump.input.is_some() as u32 as f64);f.output.as_ptr() as usize as u32
})}
#[no_mangle]pub extern "C" fn test_dynamic()->u32 {F.with_borrow_mut(|f| {
    let d=&f.input;let dt=d[0];f.flux.soft=d[1];f.flux.hard=d[2];f.flux.venting=d[3]==1.0;f.flux.overloaded=d[4]==1.0;
    let triggered=f.bulkheads.advance(dt,d[5]==1.0,f.hp,1000.0,d[6],&mut f.flux);
    f.repair.on_damage(d[7]);let mounts=[RepairMount {cycle:d[8],idle:d[9]==1.0,trigger:d[10]==1.0},RepairMount{cycle:d[11],idle:d[12]==1.0,trigger:d[13]==1.0}];
    f.repair.advance(dt,d[14]==1.0,d[15]==1.0,d[16]==1.0,d[17]==1.0,d[18],&mounts,1000.0,&mut f.hp,&mut f.charges);
    let recoil=f.compensation.on_recoil(d[19]==1.0,d[20]==1.0,d[21]==1.0,d[22],d[23],&mut f.flux);
    f.compensation.advance(dt,d[24]==1.0,&mut f.velocity);
    f.output.clear();f.output.extend([f.hp,f.charges,f.flux.soft,f.flux.hard,f.flux.since_increase,triggered as u32 as f64,recoil as u32 as f64,f.velocity[0],f.velocity[1]]);
    f.output.extend(f.bulkheads.words());f.output.extend(f.repair.words());f.output.extend(f.compensation.words());f.output.extend(f.bulkheads.modifiers().words());f.output.as_ptr() as usize as u32
})}
#[no_mangle]pub extern "C" fn test_output_words()->u32 {F.with_borrow(|f|f.output.len() as u32)}
