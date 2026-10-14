//! Isolated validation ABI; production uses resident tactical_ai typed methods.
#[path="../../native/combat-core/src/tactical_ai.rs"]mod tactical_ai;
use tactical_ai::*;use std::cell::RefCell;
const BODY:usize=44;const WEAPON:usize=21;const ORDER:usize=9;
struct Fixture{input:Vec<f64>,output:Vec<f64>,fleet_scratch:FleetScratch,position_scratch:PositionScratch}
thread_local!{static FIXTURE:RefCell<Fixture>=RefCell::new(Fixture{input:Vec::new(),output:Vec::new(),fleet_scratch:FleetScratch::new(),position_scratch:PositionScratch::new()});}
fn id(h:f64,g:f64)->Identity{Identity{handle:h as u32,generation:g as u32}}
fn option(h:f64,g:f64)->Option<Identity>{if h==0.0{None}else{Some(id(h,g))}}
fn task(code:f64)->Task{match code as u32{1=>Task::Finish,2=>Task::Screen,3=>Task::Support,4=>Task::Regroup,5=>Task::Disengage,6=>Task::Search,_=>Task::Pressure}}
fn task_code(task:Task)->f64{match task{Task::Pressure=>0.0,Task::Finish=>1.0,Task::Screen=>2.0,Task::Support=>3.0,Task::Regroup=>4.0,Task::Disengage=>5.0,Task::Search=>6.0}}
fn role_code(role:Role)->f64{match role{Role::Line=>0.0,Role::Brawler=>1.0,Role::Artillery=>2.0,Role::Skirmisher=>3.0,Role::Carrier=>4.0,Role::Unarmed=>5.0}}
#[no_mangle]pub extern "C" fn test_input(n:u32)->u32{FIXTURE.with_borrow_mut(|f|{f.input.resize(n as usize,0.0);f.input.as_mut_ptr()as usize as u32})}
#[no_mangle]pub extern "C" fn test_output_words()->u32{FIXTURE.with_borrow(|f|f.output.len()as u32)}
fn execute(f:&mut Fixture)->Result<(),Error>{
    let d=&f.input;let mut c=12;let mut bodies=Vec::new();let mut weapons=Vec::new();let mut asteroids=Vec::new();let mut orders=Vec::new();
    for _ in 0..d[0]as usize{let a=&d[c..c+BODY];c+=BODY;bodies.push(Body{identity:id(a[0],a[1]),parent:None,id:format!("ship-{:03}",a[2]as u32),locale_rank:a[3]as u32,team:a[4],flags:a[5]as u32,x:a[6],y:a[7],vx:a[8],vy:a[9],facing:a[10],
        radius:a[11],hp:a[12],max_hp:a[13],flux:a[14],size:a[15]as u8,max_speed:a[16],max_turn_rate:a[17],acceleration:a[18],deceleration:a[19],spec_speed:a[20],spec_armor:a[21],
        wing_power:a[22],carrier_range:a[23],strafe_multiplier:a[24],shield_radius:a[25],shield_raw_active:a[26]==1.0,shield_void:a[27]==1.0,shield_phased:a[28]==1.0,system_phased:a[29]==1.0,system_locks_turning:a[30]==1.0,
        vast:a[31]==1.0,retreating:a[32]==1.0,system_drone:a[33]==1.0,player:a[34]==1.0,manual:a[35]==1.0,do_not_back_off:a[36]==1.0,current_target:option(a[37],a[38]),
        previous_task:if a[39]<0.0{None}else{Some(task(a[39]))},training_action:a[40]as i32,weapon_first:a[41]as usize,weapon_count:a[42]as usize});}
    for _ in 0..d[1]as usize{let a=&d[c..c+WEAPON];c+=WEAPON;weapons.push(Weapon{owner:id(a[0],a[1]),locale_rank:a[2]as u32,disabled:a[3]==1.0,ammo:a[4],dps:a[5],flags:a[6]as u32,hints:a[7]as u32,
        effective_range:a[8],speed:a[9],muzzle_x:a[10],muzzle_y:a[11],relative_x:a[12],relative_y:a[13],local_base_angle:a[14],angle:a[15],authored_half_arc:a[16],fixed:a[17]==1.0,profile_delay:a[18],position_turn_rate:a[19]});}
    for _ in 0..d[2]as usize{let a=&d[c..c+5];c+=5;asteroids.push(Asteroid{x:a[0],y:a[1],vx:a[2],vy:a[3],radius:a[4]});}
    for _ in 0..d[3]as usize{let a=&d[c..c+ORDER];c+=ORDER;orders.push(Order{owner:option(a[0],a[1]),kind:match a[2]as u32{1=>OrderKind::Avoid,2=>OrderKind::Defend,3=>OrderKind::Escort,4=>OrderKind::Waypoint,_=>OrderKind::Engage},
        target:option(a[3],a[4]),point:if a[5]==1.0{Some([a[6],a[7]])}else{None}});}
    let teams=&d[c..c+d[4]as usize];c+=teams.len();let visibility=d[c..].iter().map(|n|*n as u8).collect::<Vec<_>>();let world=World{bodies:&bodies,weapons:&weapons,asteroids:&asteroids,teams,visibility:&visibility};world.validate()?;
    let own=bodies.get(d[5]as usize).ok_or(Error::InvalidIdentity)?.identity;let target=if d[6]<0.0{None}else{Some(bodies.get(d[6]as usize).ok_or(Error::InvalidIdentity)?.identity)};
    let ordered=if d[9]<0.0{None}else{Some(bodies.get(d[9]as usize).ok_or(Error::InvalidIdentity)?.identity)};let selected=hostile(&world,own,ordered)?;
    let mut assignments=Vec::new();fleet(&world,&orders,&mut assignments,&mut f.fleet_scratch)?;let assignment=assignments.iter().find(|a|a.owner==own);
    let profile=profile(&world,own,target,assignment,&Policy::default())?;
    let position=if let Some(target)=target{position(&world,own,target,Velocity{x:d[7],y:d[8]},profile,&assignments,&mut f.position_scratch)?}else{PositionChoice::default()};
    f.output.extend([0.0,selected.map_or(0.0,|id|id.handle as f64),selected.map_or(0.0,|id|id.generation as f64),profile.range,profile.relative_bearing,profile.firepower,profile.weapons as f64,
        position.velocity.x,position.velocity.y,position.adjusted as u32 as f64,position.score_gain,position.clear_fire,match position.reason{PositionReason::Baseline=>0.0,PositionReason::FireLane=>1.0,PositionReason::Cover=>2.0},position.candidate as f64,assignments.len()as f64]);
    for a in assignments{f.output.extend([a.owner.handle as f64,a.owner.generation as f64,a.target.map_or(0.0,|id|id.handle as f64),a.target.map_or(0.0,|id|id.generation as f64),role_code(a.role),task_code(a.task),a.score,a.pressure_ratio,a.assigned_power,a.carrier_range,
        a.anchor.map_or(0.0,|id|id.handle as f64),a.anchor.map_or(0.0,|id|id.generation as f64),a.approach_bearing.unwrap_or(f64::NAN)]);}Ok(())
}
#[no_mangle]pub extern "C" fn test_solve()->u32{FIXTURE.with_borrow_mut(|f|{f.output.clear();if execute(f).is_err(){f.output.clear();f.output.push(1.0);}f.output.as_mut_ptr()as usize as u32})}
