//! Verification-only ABI for the readiness module, never used by production.
#[path="../../native/combat-core/src/random.rs"] mod random;
#[path="../../native/combat-core/src/flux.rs"] mod flux;
#[path="../../native/combat-core/src/readiness.rs"] mod readiness;
use std::cell::RefCell;
use readiness::{Components,Engine,Parameters,Readiness,Target,Weapon};
struct Fixture {random:random::Random,r:Readiness,p:Parameters,weapons:Vec<Weapon>,groups:Vec<u32>,
    engines:Vec<Engine>,permanent:f64,hp:f64,dead:bool,flux:flux::Flux,age:f64,
    input:Vec<f64>,output:Vec<f64>,actions:Vec<Target>}
thread_local!{static F:RefCell<Fixture>=RefCell::new(Fixture {random:random::Random::new(1),
    r:Readiness::new(0.7,10.0,&mut random::Random::new(1)),p:Parameters::default(),weapons:Vec::new(),groups:Vec::new(),
    engines:Vec::new(),permanent:0.0,hp:1000.0,dead:false,flux:flux::Flux::new(&[1000.0,0.0,1.0,1.0,1.0,0.0,1.0,0.0,0.0,0.0]),
    age:f64::INFINITY,input:Vec::new(),output:Vec::new(),actions:Vec::new()});}
#[no_mangle]pub extern "C" fn test_input(n:u32)->u32 {F.with_borrow_mut(|f|{f.input.resize(n as usize,0.0);f.input.as_mut_ptr() as usize as u32})}
#[no_mangle]pub extern "C" fn test_initialize()->u32 {F.with_borrow_mut(|f| {
    let d=&f.input;f.random=random::Random::new(d[0] as u32);f.r=Readiness::new(d[1],d[2],&mut f.random);
    f.p=Parameters {malfunction_range:d[3],critical_chance_multiplier:d[4],fighter:d[5]==1.0,
        weapon_chance_bonus:d[6],critical_chance_bonus:d[7],peak_cr_seconds:d[8],cr_loss_per_second:d[9]};
    f.weapons=vec![Weapon {id:1,hidden:false,permanently_disabled:false,ammo:f64::INFINITY,max_ammo:f64::INFINITY,ammo_regen:0.0},
        Weapon {id:2,hidden:true,permanently_disabled:false,ammo:6.0,max_ammo:12.0,ammo_regen:0.0},
        Weapon {id:3,hidden:false,permanently_disabled:false,ammo:1.0,max_ammo:12.0,ammo_regen:0.0},
        Weapon {id:4,hidden:false,permanently_disabled:false,ammo:40.0,max_ammo:40.0,ammo_regen:0.1}];
    f.groups=vec![1,2,1,3,4,99];f.engines=vec![Engine {id:0,system_activated:false,contribution:0.33},
        Engine {id:1,system_activated:true,contribution:0.0},Engine {id:2,system_activated:false,contribution:0.34}];
    f.permanent=0.0;f.hp=1000.0;f.dead=false;f.age=f64::INFINITY;f.actions.clear();
    f.flux=flux::Flux::new(&[1000.0,0.0,if f.p.fighter {0.0} else {1.0},1.0,1.0,0.0,1.0,0.0,0.0,0.0]);
    if d[10] == 1.0 {f.r.deploy(d[1],d[11]==1.0,f.p,&Components {weapons:&f.weapons,grouped_weapon_ids:&f.groups,
        engines:&f.engines,permanently_disabled_fraction:f.permanent},&mut f.random);}
    0
})}
fn apply(f:&mut Fixture,t:Target) {
    f.actions.push(t);
    match t {
        Target::Weapon(id)=>{let w=f.weapons.iter_mut().find(|w|w.id==id).unwrap();w.permanently_disabled=true;
            if w.ammo.is_finite(){w.ammo=0.0;}f.groups.retain(|v|*v!=id);},
        Target::Engine(id)=>{f.permanent+=f.engines.iter().find(|e|e.id==id).unwrap().contribution;}
    }
}
#[no_mangle]pub extern "C" fn test_step()->u32 {F.with_borrow_mut(|f| {
    let d=f.input.clone();let dt=d[0];let effective=d[1];let enemy=d[2]==1.0;
    f.dead=d[3]==1.0;f.hp=d[4];if d[5]>=0.0 {f.r.current_cr=d[5];}
    f.weapons[3].ammo=d[6];if d[7]>=0.0 {f.permanent=d[7];}
    f.flux.overloaded=d[8]==1.0;f.flux.venting=d[9]==1.0;f.flux.soft=d[10];f.flux.hard=0.0;
    f.flux.overload_timer=0.0;f.flux.overload_duration=0.0;
    if d[11]>=0.0 {f.age=d[11];}
    let mut active=d[12]==1.0;let mut requested=active;let front_or_omni=d[13]==1.0;
    if d[14]==1.0 {f.r.deploy(f.r.current_cr,d[15]==1.0,f.p,&Components {weapons:&f.weapons,
        grouped_weapon_ids:&f.groups,engines:&f.engines,permanently_disabled_fraction:f.permanent},&mut f.random);}
    f.actions.clear();
    let target=f.r.advance_deployment(dt,f.dead,f.hp,f.p,&Components {weapons:&f.weapons,
        grouped_weapon_ids:&f.groups,engines:&f.engines,permanently_disabled_fraction:f.permanent},&mut f.random);
    if let Some(t)=target {apply(f,t);}
    f.r.finish_deployment(dt,f.dead,f.hp);
    let alive=!f.dead && d[16]==0.0 && f.hp>0.0;
    let mut system_disabled=false;let mut defense_disabled=false;
    if alive {
        f.r.advance_peak(dt,enemy,f.p);let e=f.r.effects(f.p);system_disabled=e.system_disabled;defense_disabled=e.defense_disabled;
        if defense_disabled && requested {active=false;requested=false;}
        let attempt=f.r.advance_shield(effective,&mut f.age,readiness::ShieldContext {front_or_omni,active,flux_fraction:f.flux.percent()},f.p,&mut f.random);
        if attempt && f.flux.begin_overload(0.0) {f.r.finish_shield_attempt(true);active=false;requested=false;}
        if (f.flux.overloaded||f.flux.venting)&&requested {active=false;requested=false;}
    }
    f.output.clear();f.output.extend(f.r.words());f.output.extend(f.r.effects(f.p).words());
    if let Some(s)=&f.r.deployment_sequence {f.output.extend(s.words());}else{f.output.extend([0.0;readiness::SEQUENCE_WIDTH]);}
    f.output.extend([f.age,f.random.seed as f64,f.random.cursor,f.random.ids,f.permanent,
        f.flux.overloaded as u32 as f64,f.flux.overload_timer,f.flux.overload_duration,active as u32 as f64,
        requested as u32 as f64,system_disabled as u32 as f64,defense_disabled as u32 as f64,f.actions.len() as f64]);
    for w in &f.weapons {f.output.extend([w.permanently_disabled as u32 as f64,w.ammo]);}
    f.output.push(f.groups.len() as f64);for id in &f.groups {f.output.push(*id as f64);}
    if let Some(s)=&f.r.deployment_sequence {for t in &s.targets {f.output.extend(match t {Target::Weapon(id)=>[0.0,*id as f64],Target::Engine(id)=>[1.0,*id as f64]});}}
    for t in &f.actions {f.output.extend(match t {Target::Weapon(id)=>[0.0,*id as f64],Target::Engine(id)=>[1.0,*id as f64]});}
    f.output.as_ptr() as usize as u32
})}
#[no_mangle]pub extern "C" fn test_effects()->u32 {F.with_borrow_mut(|f| {
    let d=&f.input;let mut p=Parameters::default();p.fighter=d[2]==1.0;p.malfunction_range=d[1];
    p.weapon_chance_bonus=d[3];p.critical_chance_bonus=d[4];p.critical_chance_multiplier=d[5];
    f.output=readiness::effects(d[0],p).words().to_vec();f.output.as_ptr() as usize as u32
})}
#[no_mangle]pub extern "C" fn test_query()->u32 {F.with_borrow_mut(|f| {
    let d=&f.input;let owner=readiness::Contact {identity:[1,1],team:if d[0]<0.0 {None} else {Some(d[0] as u32)},
        position:[d[1],d[2]],dead:false,retreated:false,docked:false,fighter:false};
    let other=readiness::Contact {identity:[d[3] as u32,d[4] as u32],team:if d[5]<0.0 {None} else {Some(d[5] as u32)},
        position:[d[6],d[7]],dead:d[8]==1.0,retreated:d[9]==1.0,docked:d[10]==1.0,fighter:d[11]==1.0};
    f.output=vec![readiness::significant_enemies(owner,d[12],None,&[other]) as u32 as f64];f.output.as_ptr() as usize as u32
})}
#[no_mangle]pub extern "C" fn test_output_words()->u32 {F.with_borrow(|f|f.output.len() as u32)}
