//! Verification-only ABI. Production imports weapon_fire through the core.
#[path="../../native/combat-core/src/random.rs"] mod random;
#[path="../../native/combat-core/src/flux.rs"] mod flux;
mod component { pub struct Component {pub data:[f64;20]} }
mod ship_state {
    pub const COMPONENT_DISABLED:u32=28;
    pub const COMPONENT_REPAIRED:u32=29;
    pub struct Notice {pub system:u32,pub kind:u32,pub value:f64,pub detail:[f64;2]}
}
#[path="../../native/combat-core/src/weapon.rs"] mod weapon;
#[path="../../native/combat-core/src/weapon_fire.rs"] mod weapon_fire;
use std::cell::RefCell;
use weapon_fire::{FireSpec,FireContext,FireInput,FireMountState,Emission,EmissionKind};
struct Fixture {mount:weapon::Mount,state:FireMountState,spec:FireSpec,flux:flux::Flux,
    random:random::Random,ctx:FireContext,input:Vec<f64>,output:Vec<f64>}
thread_local!{static FIXTURE:RefCell<Fixture>=RefCell::new(Fixture {
    mount:weapon::Mount {data:[0.0;36],initialized:true},state:FireMountState::default(),spec:FireSpec::default(),
    flux:flux::Flux::new(&[1000.0,0.0,1.0,1.0,1.0,0.0,1.0,0.0,0.0,0.0]),
    random:random::Random::new(7291),ctx:FireContext {position:[100.0,-50.0],velocity:[7.0,-3.0],facing:0.27,
        can_ship_fire:true,ai_control:false,flux_cost_multiplier:1.13,recoil_multiplier:1.17,
        cr_damage_multiplier:1.07,weapon_damage_multiplier:1.21,beam_damage_multiplier:1.09,
        effective_range:(1000.0/0.93)*(1.0-7.0/100.0),projectile_speed:317.0,ecm_range_penalty:7.0},input:Vec::new(),output:Vec::new()
});}
#[no_mangle]pub extern "C" fn test_input(n:u32)->u32 {FIXTURE.with_borrow_mut(|f| {f.input.resize(n as usize,0.0);f.input.as_mut_ptr() as usize as u32})}
#[no_mangle]pub extern "C" fn test_initialize()->u32 {FIXTURE.with_borrow_mut(|f| {
    f.mount.data.copy_from_slice(&f.input[..36]);f.state=FireMountState::default();f.random=random::Random::new(7291);
    f.flux.soft=f.input[60];f.flux.hard=f.input[61];f.ctx.velocity=[7.0,-3.0];
    f.spec=FireSpec {burst_size:f.input[36],interruptible:f.input[37]==1.0,auto_charge:f.input[38]==1.0,
        flux_per_shot:f.input[39],flux_per_second:f.input[40],beam_chargeup:f.input[41],beam_chargedown:f.input[42],
        beam_duration:f.input[43],beam_fire_only_full:f.input[44]==1.0,beam_sustained:f.input[45]==1.0,
        max_spread:f.input[46],spread_per_shot:f.input[47],offsets:if f.input[48]==1.0 {vec![[3.0,-4.0],[-2.0,6.0]]} else {Vec::new()},
        relative_pos:[11.0,-9.0],damage_per_shot:127.0,damage_per_second:197.0,emp_per_shot:13.0,emp_per_second:23.0,
        physical_recoil_speed:f.input[49],point_defense:f.input[50]==1.0,rocket:f.input[51]==1.0,
        source_missile_lifecycle:f.input[52]==1.0,dud_probability:0.23,flight_time:Some(9.0),launch_speed:67.0};
    0
})}
fn emit_words(out:&mut Vec<f64>,e:&Emission) {
    out.extend([match e.kind {EmissionKind::Projectile=>0.0,EmissionKind::BeamActive=>1.0,EmissionKind::BeamCharge=>2.0,EmissionKind::BeamChargedown=>3.0},
        e.id,e.component_id as f64,e.cycle_id,e.position[0],e.position[1],e.velocity[0],e.velocity[1],e.angle,
        e.barrel_offset[0],e.barrel_offset[1],e.base_damage,e.source_damage_multiplier,e.damage,e.emp,e.range,e.duration,
        e.target_ship.map_or(0.0,|v|v as f64),e.target_projectile.map_or(0.0,|v|v as f64),
        e.armed_while_fizzling.map_or(-1.0,|v|v as u32 as f64),e.flight_time.unwrap_or(0.0),
        e.source_velocity[0],e.source_velocity[1],e.recoil_delta[0],e.recoil_delta[1]]);
}
#[no_mangle]pub extern "C" fn test_commit()->u32 {FIXTURE.with_borrow_mut(|f| {
    let d=&f.input;f.mount.data[19]=d[6];f.ctx.can_ship_fire=d[7]==1.0;f.ctx.ai_control=d[8]==1.0;
    let input=FireInput {requested:d[0]==1.0,trigger_held:d[1]==1.0,disabled:d[2]==1.0,system_allows:d[3]==1.0,
        suspended:d[4]==1.0,recheck_flux_budget:d[5]==1.0,step_dt:d[6],target_ship:Some(47),target_projectile:Some(73)};
    let mut emissions=Vec::new();let result=weapon_fire::commit_mount(&mut f.mount,&mut f.state,&f.spec,&mut f.flux,&mut f.random,&mut f.ctx,input,&mut emissions);
    f.output.clear();f.output.extend(f.mount.data);f.output.extend([f.flux.soft,f.flux.hard,f.ctx.velocity[0],f.ctx.velocity[1],
        f.random.seed as f64,f.random.cursor,f.random.ids,result.started as u32 as f64,result.flux_budget_rejected as u32 as f64,emissions.len() as f64]);
    for e in &emissions {emit_words(&mut f.output,e);}f.output.as_ptr() as usize as u32
})}
#[no_mangle]pub extern "C" fn test_output_words()->u32 {FIXTURE.with_borrow(|f|f.output.len() as u32)}
