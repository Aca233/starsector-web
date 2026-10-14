//! Isolated verification ABI. Production authority does not upload these DTOs.
#![allow(dead_code)]
#[path="../../native/combat-core/src/navigation_ai.rs"] mod navigation_ai;
use navigation_ai::*;
use std::cell::RefCell;
thread_local! { static INPUT:RefCell<Vec<f64>>=RefCell::new(Vec::new()); static OUTPUT:RefCell<Vec<f64>>=RefCell::new(Vec::new()); }
#[no_mangle] pub extern "C" fn test_input(n:u32)->u32 { INPUT.with_borrow_mut(|v|{v.resize(n as usize,0.0);v.as_mut_ptr()as usize as u32}) }
#[no_mangle] pub extern "C" fn test_run()->u32 {
    INPUT.with_borrow(|input|{
        let count=input[0]as usize; let mounts=input[1]as usize; let obstacles_count=input[2]as usize;
        let mut at=22; let mut bodies=Vec::new(); let mut weapons=Vec::new(); let mut obstacles=Vec::new();
        for _ in 0..count {
            let d=&input[at..at+25]; at+=25;
            bodies.push(Body {identity:Identity {handle:d[0]as u32,generation:d[1]as u32},assembly_root:Identity {handle:d[2]as u32,generation:d[3]as u32},
                x:d[4],y:d[5],vx:d[6],vy:d[7],facing:d[8],angular_velocity:d[9],radius:d[10],team:d[11],flags:d[12]as u32,
                max_speed:d[13],acceleration:d[14],deceleration:d[15],strafe_multiplier:d[16],turn_deceleration:d[17],
                shield_type:d[18]as u8,shield_radius:d[19],raw_shield_active:d[20]!=0.0,shield_void:d[21]!=0.0,
                system_locks_turning:d[22]!=0.0,weapon_first:d[23]as usize,weapon_count:d[24]as usize});
        }
        for _ in 0..mounts {
            let d=&input[at..at+6]; at+=6;
            weapons.push(Weapon {owner:Identity {handle:d[0]as u32,generation:d[1]as u32},relative_x:d[2],relative_y:d[3],
                blocked_lane_target:if d[4]==0.0 {None}else{Some(Identity {handle:d[4]as u32,generation:d[5]as u32})}});
        }
        for _ in 0..obstacles_count { let d=&input[at..at+5]; at+=5; obstacles.push(Obstacle {x:d[0],y:d[1],vx:d[2],vy:d[3],radius:d[4]}); }
        let world=match World::new(&bodies,&weapons,&obstacles) {Ok(v)=>v,Err(e)=>return e as u32+1};
        let row=input[3]as usize; let target=input[4]as usize; let anchor=input[5]as usize;
        let regroup_target=if input[6]<0.0 {None}else{Some(input[6]as usize)};
        let roles=[Role::Brawler,Role::Skirmisher,Role::Artillery,Role::Carrier,Role::Unarmed,Role::Line];
        let assignment=if input[13]<0.0 {None}else{Some(Assignment {role:roles[input[13]as usize],approach_bearing:if input[14]!=0.0 {Some(input[15])}else{None}})};
        let desired=Velocity {x:input[16],y:input[17]}; let mut scratch=Scratch::new();
        let result=(||->Result<Vec<f64>,Error>{
            let pos=position_velocity(&world,row,input[7],input[8],Velocity {x:input[9],y:input[10]},input[11])?;
            let approach=approach_velocity(&world,row,target,input[12],input[20]!=0.0,assignment)?;
            let regroup=regroup_velocity(&world,row,anchor,regroup_target)?;
            let avoid=avoid_collisions(&world,row,desired,&mut scratch)?;
            let forward=forward_path_clear(&world,row,input[18],input[19],&mut scratch)?;
            let yielding=yield_fire_lane(&world,row,desired)?;
            // Desired facing is intentionally independent from the corridor speed.
            let controls=steering(&world,row,desired,input[21])?;
            let b=bodies[row];
            let cursor=cursor_turn_command(b.facing,b.angular_velocity,input[21],b.turn_deceleration);
            Ok(vec![pos.x,pos.y,approach.x,approach.y,regroup.x,regroup.y,avoid.velocity.x,avoid.velocity.y,
                avoid.avoiding as u32 as f64,avoid.risk,avoid.candidate as f64,forward as u32 as f64,
                yielding.velocity.x,yielding.velocity.y,yielding.yielding as u32 as f64,yielding.lane.map_or(-1.0,|index|index as f64),
                controls.turn,controls.throttle,controls.strafe,controls.brake as u32 as f64,cursor])
        })();
        match result {Ok(value)=>{OUTPUT.with_borrow_mut(|out|*out=value);0},Err(e)=>e as u32+1}
    })
}
#[no_mangle] pub extern "C" fn test_output()->u32 { OUTPUT.with_borrow(|v|v.as_ptr()as usize as u32) }
#[no_mangle] pub extern "C" fn test_output_words()->u32 { OUTPUT.with_borrow(|v|v.len()as u32) }
