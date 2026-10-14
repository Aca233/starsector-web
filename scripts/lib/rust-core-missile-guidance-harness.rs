//! Isolated differential ABI only. Never imported by production.
#[path="../../native/combat-core/src/random.rs"] mod random;
#[path="../../native/combat-core/src/missile_guidance.rs"] mod missile_guidance;
use std::cell::RefCell;
use missile_guidance::*;
const MISSILE_WIDTH:usize=65;
const SHIP_WIDTH:usize=23;
struct Fixture {input:Vec<f64>,output:Vec<f64>,random:random::Random,ships:Vec<Ship>,projectiles:Vec<Missile>,
    state:Option<FlareState>,mirv:Option<Mirv>,flare:Option<FlareSpec>,mode:u32,step:u32,children:Vec<Child>,locks:Vec<DecoyLock>,
    asteroids:Vec<Asteroid>,motes:Vec<Identity>,shared_elapsed:f64,split:bool}
impl Fixture {fn new()->Self{Self{input:Vec::new(),output:Vec::new(),random:random::Random::new(7291),ships:Vec::new(),projectiles:Vec::new(),state:None,
    mirv:None,flare:None,mode:0,step:0,children:Vec::new(),locks:Vec::new(),asteroids:vec![Asteroid{position:[330.0,-95.0],radius:30.0}],motes:Vec::new(),shared_elapsed:0.0,split:false}}}
thread_local!{static FIXTURE:RefCell<Fixture>=RefCell::new(Fixture::new());}
fn optional(present:f64,value:f64)->Option<f64>{if present==1.0{Some(value)}else{None}}
fn identity(value:f64)->Identity{Identity{handle:value as u32,generation:1}}
fn lock(value:f64)->Option<Identity>{if value>0.0{Some(identity(value))}else{None}}
fn allegiance(team:f64,player:f64)->Allegiance{Allegiance{team:if team>=0.0{Some(team as u32)}else{None},is_player:if player>=0.0{Some(player==1.0)}else{None}}}
fn missile(d:&[f64])->Missile{Missile{identity:identity(d[0]),id:d[1],source:identity(d[2]),allegiance:allegiance(d[3],d[4]),
    position:[d[5],d[6]],velocity:[d[7],d[8]],radius:d[9],elapsed:d[10],facing:optional(d[11],d[12]),turn_velocity:optional(d[13],d[14]),
    guided:d[15]==1.0,rocket:d[16]==1.0,flare:d[17]==1.0,flare_fizzling:d[18]==1.0,render_target_indicator:if d[19]<0.0{None}else{Some(d[19]==1.0)},
    target_ship:lock(d[20]),target_projectile:lock(d[21]),flight_remaining:optional(d[22],d[23]),acceleration:optional(d[24],d[25]),
    max_speed:optional(d[26],d[27]),max_turn_rate:optional(d[28],d[29]),max_turn_acceleration:optional(d[30],d[31]),guidance_bonus:optional(d[32],d[33]),
    eccm_chance:optional(d[34],d[35]),hitpoints:optional(d[36],d[37]),damage:d[38],base_damage:optional(d[39],d[40]),source_damage_multiplier:optional(d[41],d[42]),
    stage_triggered:d[43]==1.0,split_distance:optional(d[44],d[45]),flare_life:optional(d[46],d[47]),flare_max_life:optional(d[48],d[49]),fade:d[50],
    disarmed:d[51]==1.0,collision_disabled:d[52]==1.0,did_damage:d[53]==1.0,mote:if d[54]==1.0{Some(Mote{age:d[55],turn_sign:d[56],scan_remaining:d[57]})}else{None}}}
fn ship(d:&[f64])->Ship{Ship{identity:identity(d[0]),allegiance:allegiance(d[1],d[2]),position:[d[3],d[4]],velocity:[d[5],d[6]],radius:d[7],dead:d[8]==1.0,
    phased:d[9]==1.0,retreated:d[10]==1.0,collisionless:d[11]==1.0,fighter:d[12]==1.0,visible_to_source:d[13]==1.0,shield_center:[d[14],d[15]],shield_radius:d[16],shield_none:d[17]==1.0}}
fn write_missile(out:&mut Vec<f64>,p:&Missile){out.extend([p.position[0],p.position[1],p.velocity[0],p.velocity[1],p.elapsed,
    p.facing.is_some() as u32 as f64,p.facing.unwrap_or(0.0),p.turn_velocity.is_some() as u32 as f64,p.turn_velocity.unwrap_or(0.0),
    p.target_ship.map_or(0.0,|v|v.handle as f64),p.target_projectile.map_or(0.0,|v|v.handle as f64),p.stage_triggered as u32 as f64,
    p.split_distance.is_some() as u32 as f64,p.split_distance.unwrap_or(0.0),p.flare_life.is_some() as u32 as f64,p.flare_life.unwrap_or(0.0),
    p.flare_fizzling as u32 as f64,p.fade,p.mote.is_some() as u32 as f64,p.mote.as_ref().map_or(0.0,|m|m.age),
    p.mote.as_ref().map_or(0.0,|m|m.turn_sign),p.mote.as_ref().map_or(0.0,|m|m.scan_remaining)]);}
#[no_mangle]pub extern "C" fn test_input(n:u32)->u32{FIXTURE.with_borrow_mut(|f|{f.input.resize(n as usize,0.0);f.input.as_mut_ptr() as usize as u32})}
#[no_mangle]pub extern "C" fn test_initialize()->u32{FIXTURE.with_borrow_mut(|f|{
    let d=&f.input;f.mode=d[0] as u32;f.random=random::Random::new(d[1] as u32);f.state=None;f.step=0;f.shared_elapsed=0.0;f.split=false;f.children.clear();f.locks.clear();
    f.mirv=if d[4]==1.0{Some(Mirv{split_range:d[5],split_range_range:d[6],min_time:d[7],can_split_early:d[8]==1.0,shots:d[9],
        damage:133.0,emp:17.0,damage_type:2,child_hitpoints:4.0,even_spread:d[10]==1.0,arc_degrees:d[11],inaccuracy_degrees:d[12],
        spread_speed:d[13],spread_speed_range:d[14],projectile_range:799.0,child_spec:7,child_radius:if d[15]==1.0{Some(3.0)}else{None},child_spawn_type:if d[16]==1.0{Some(2)}else{None}})}else{None};
    f.flare=if d[17]==1.0{Some(FlareSpec{mode:match d[18] as u32{1=>FlareMode::Seeker,2=>FlareMode::Jammer,_=>FlareMode::Standard},effect_range:d[19],effect_chance:d[20],flameout_time:d[21],fade_time:d[22]})}else{None};
    f.ships.clear();let mut offset=32;for _ in 0..d[2] as usize{f.ships.push(ship(&d[offset..offset+SHIP_WIDTH]));offset+=SHIP_WIDTH;}
    f.projectiles.clear();for _ in 0..d[3] as usize{f.projectiles.push(missile(&d[offset..offset+MISSILE_WIDTH]));offset+=MISSILE_WIDTH;}
    f.motes=f.projectiles.iter().filter(|p|p.mote.is_some()).map(|p|p.identity).collect();0
})}
#[no_mangle]pub extern "C" fn test_step()->u32{FIXTURE.with_borrow_mut(|f|{
    let dt=f.input[0];let tick=f.step;f.children.clear();f.locks.clear();
    if tick==18{f.ships[1].dead=true;}if tick==39{f.ships[2].phased=true;}if tick==55{f.ships[1].dead=false;}
    if tick==23{f.projectiles[2].hitpoints=Some(0.0);}if tick==43{f.projectiles[3].flight_remaining=Some(0.0);}
    for s in &mut f.ships{add_move(&mut s.position,s.velocity,dt);s.shield_center=s.position;}
    for p in &mut f.projectiles[1..]{add_move(&mut p.position,p.velocity,dt);}
    f.shared_elapsed+=dt;
    let mut p=f.projectiles[0].clone();p.elapsed+=dt;
    let live_projectiles:Vec<Missile>=f.projectiles.iter().enumerate().filter(|(i,_)|!(f.mode==2&&tick>=31&&*i==4)).map(|(_,q)|q.clone()).collect();
    let retained:Vec<Missile>=if f.mode==2&&tick>=31{vec![f.projectiles[4].clone()]}else{Vec::new()};
    let world=World{ships:&f.ships,projectiles:&live_projectiles,asteroids:&f.asteroids,retained_ships:&[],retained_projectiles:&retained};
    let remove=match f.mode{
        1=>advance_flare(&mut p,&mut f.state,dt,f.flare.as_ref(),&world,&mut f.random,&mut f.locks),
        2=>{let shared=MoteShared{source:identity(10.0),elapsed:f.shared_elapsed,attractor:if tick%20<13{Some([650.0,110.0])}else{None},lock:if (35..51).contains(&tick){Some(identity(11.0))}else{None},motes:&f.motes};advance_mote(&mut p,dt,&world,&shared,&mut f.random);false},
        _=>advance_missile(&mut p,dt,&world,f.mirv.as_ref(),&mut f.random,&mut f.children),
    };
    if !remove{add_move(&mut p.position,p.velocity,dt);}f.projectiles[0]=p;
    for l in &f.locks{if let Some(q)=f.projectiles.iter_mut().find(|q|q.identity==l.missile){q.target_projectile=Some(l.decoy);}}
    f.output.clear();f.output.extend([remove as u32 as f64,f.random.seed as f64,f.random.cursor,f.random.ids,f.children.len() as f64,f.locks.len() as f64]);
    write_missile(&mut f.output,&f.projectiles[0]);
    f.output.push(f.state.is_some() as u32 as f64);if let Some(s)=&f.state{
        f.output.extend([s.wait,s.spin,s.seek_after,s.target.map_or(0.0,|v|v.handle as f64),s.orbit_target.map_or(0.0,|v|v.handle as f64),s.immune.len() as f64]);for id in &s.immune{f.output.push(id.handle as f64);}
    }
    for p in &f.projectiles{f.output.push(p.target_projectile.map_or(0.0,|v|v.handle as f64));}
    for l in &f.locks{f.output.extend([l.missile.handle as f64,l.decoy.handle as f64]);}
    for c in &f.children{f.output.extend([c.id,c.source.handle as f64,c.spec as f64,c.position[0],c.position[1],c.velocity[0],c.velocity[1],c.angle,c.base_damage,c.damage,c.emp,c.damage_type as f64,c.radius,c.range,c.hitpoints,c.spawn_type as f64,c.launch_speed,c.inherited_velocity[0],c.inherited_velocity[1],c.source_damage_multiplier.is_some() as u32 as f64,c.source_damage_multiplier.unwrap_or(0.0)]);}
    f.step+=1;f.output.as_ptr() as usize as u32
})}
fn add_move(p:&mut Point,v:Point,dt:f64){p[0]+=v[0]*dt;p[1]+=v[1]*dt;}
#[no_mangle]pub extern "C" fn test_output_words()->u32{FIXTURE.with_borrow(|f|f.output.len() as u32)}
