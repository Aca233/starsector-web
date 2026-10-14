//! Verification-only ABI for typed resident defense module; no public Core ABI.
#[path="../../native/combat-core/src/defense_ai.rs"] mod defense_ai;
#[path="../../native/combat-core/src/motion.rs"] mod motion;
#[path="../../native/combat-core/src/flux.rs"] mod flux;
#[path="../../native/combat-core/src/shield.rs"] mod shield;
use defense_ai::*;
use std::cell::RefCell;
const BODY:usize=27;const WEAPON:usize=21;const PROJECTILE:usize=19;const BEAM:usize=12;
struct Host {s:DefenseState,shield:shield::Shield,flux:flux::Flux,facing:Option<f64>,vent_allowed:bool,shield_requests:u32,vent_calls:u32}
impl DefenseHost for Host {
    fn defense_state(&self)->DefenseState {let mut s=self.s;let d=&self.shield.data;s.base_dissipation=self.flux.base;s.venting=self.flux.venting;
        s.flux_percent=self.flux.percent();s.overloaded=self.flux.overloaded;s.max_flux=self.flux.max;s.total_flux=self.flux.total();
        s.shield_type=self.shield.kind() as u8;s.shield_active=self.shield.active();s.toggle_locked=self.shield.locked();
        s.phase_engaged=(1.0..=3.0).contains(&d[14]);s.phase_activation_cost=d[20];s.phase_upkeep=d[21];s.phase_down_duration=d[18];s.shield_upkeep=d[4];
        s.can_use_shields=s.can_use_shields&&!self.flux.overloaded&&!self.flux.venting&&self.shield.kind()!=0;s}
    fn set_defense_facing(&mut self,facing:Option<f64>){self.facing=facing;}
    fn set_shield_active(&mut self,active:bool){self.shield_requests+=1;self.shield.set_active(active,&mut self.flux);}
    fn start_venting(&mut self)->bool {self.vent_calls+=1;if !self.vent_allowed||self.flux.overloaded||self.flux.venting||self.flux.total()<=5.0||self.shield.locked(){return false;}
        if self.shield.requested()&&(self.shield.kind()!=3||self.shield.phase_upkeep()){self.shield.set_active(false,&mut self.flux);}self.flux.start_vent()}
}
struct Fixture {input:Vec<f64>,output:Vec<f64>,controller:Controller,host:Host,forecast:Forecast,scratch:Scratch}
impl Default for Fixture {fn default()->Self{Self{input:Vec::new(),output:Vec::new(),controller:Controller::default(),forecast:Forecast::default(),scratch:Scratch::new(),
    host:Host{s:DefenseState::default(),shield:shield::Shield::new(&[1.0,180.0,250.0,1.0,10.0,1.0,1.0,0.5,0.5,2.0,45.0,26.0,1.0,0.0,1.0,0.0,0.0,0.0,0.0]),
        flux:flux::Flux::new(&[1000.0,100.0,1.0,1.0,1.0,0.0,1.0,0.0,0.0,0.0]),facing:None,vent_allowed:true,shield_requests:0,vent_calls:0}}}}
thread_local!{static FIXTURE:RefCell<Fixture>=RefCell::new(Fixture::default());}
fn id(handle:f64,generation:f64)->Identity{Identity{handle:handle as u32,generation:generation as u32}}
fn optional_id(handle:f64,generation:f64)->Option<Identity>{if handle==0.0{None}else{Some(id(handle,generation))}}
#[no_mangle]pub extern "C" fn test_input(n:u32)->u32 {FIXTURE.with_borrow_mut(|f|{f.input.resize(n as usize,0.0);f.input.as_mut_ptr() as usize as u32})}
#[no_mangle]pub extern "C" fn test_output_words()->u32 {FIXTURE.with_borrow(|f|f.output.len() as u32)}
#[no_mangle]pub extern "C" fn test_assess()->u32 {FIXTURE.with_borrow_mut(|f|{
    let d=&f.input;let mut cursor=10;let mut bodies=Vec::new();let mut weapons=Vec::new();let mut projectiles=Vec::new();let mut beams=Vec::new();
    for _ in 0..d[5] as usize{let a=&d[cursor..cursor+BODY];cursor+=BODY;bodies.push(Body{identity:id(a[0],a[1]),team:a[2],flags:a[3] as u32,vx:a[4],vy:a[5],radius:a[6],
        shield_x:a[7],shield_y:a[8],shield_radius:a[9],shield_type:a[10] as u8,shield_efficiency:a[11],shield_damage_multiplier:a[12],shield_energy_multiplier:a[13],shield_half_arc:a[14],
        phase_down_duration:a[15],phase_up_duration:a[16],phase_cooldown_duration:a[17],shield_unfold_duration:a[18],overload_timer:a[19],vent_time:a[20],system_recovery:a[21],
        max_speed:a[22],max_turn_rate:a[23],weapon_first:a[24] as usize,weapon_count:a[25] as usize});}
    for _ in 0..d[6] as usize{let a=&d[cursor..cursor+WEAPON];cursor+=WEAPON;weapons.push(Weapon{owner:id(a[0],a[1]),disabled:a[2]==1.0,ammo:a[3],dps:a[4],flags:a[5] as u32,
        muzzle_x:a[6],muzzle_y:a[7],effective_range:a[8],max_speed:a[9],base_angle:a[10],angle:a[11],fixed:a[12]==1.0,authored_half_arc:a[13],turn_rate:a[14],
        readiness:a[15],burst_size:a[16],damage:a[17],damage_type:a[18] as u8,beam_duration:a[19]});}
    for _ in 0..d[7] as usize{let a=&d[cursor..cursor+PROJECTILE];cursor+=PROJECTILE;projectiles.push(Projectile{source:optional_id(a[0],a[1]),explicit_team:if a[2].is_nan(){None}else{Some(a[2])},
        flags:a[3] as u32,did_damage:a[4]==1.0,damage:a[5],damage_type:a[6] as u8,remaining_life:a[7],x:a[8],y:a[9],vx:a[10],vy:a[11],radius:a[12],fuse:a[13],
        target:optional_id(a[14],a[15]),facing:a[16],max_speed:a[17],turn_rate:a[18]});}
    for _ in 0..d[8] as usize{let a=&d[cursor..cursor+BEAM];cursor+=BEAM;beams.push(Beam{source:optional_id(a[0],a[1]),mount:if a[2]<0.0{None}else{Some(a[2] as usize)},
        damage_active:a[3]==1.0,duration:a[4],start_x:a[5],start_y:a[6],end_x:a[7],end_y:a[8],dps:a[9],damage_type:a[10] as u8});}
    let teams=&d[cursor..cursor+d[9] as usize];cursor+=teams.len();let visibility=d[cursor..].iter().map(|v|*v as u8).collect::<Vec<_>>();
    let world=World{bodies:&bodies,weapons:&weapons,projectiles:&projectiles,beams:&beams,teams,visibility:&visibility};let mut out=Assessment::default();
    let result=assess_into(&world,bodies[d[0] as usize].identity,d[1],d[2],d[3],d[4]==1.0,&mut out,&mut f.scratch);
    f.output.clear();f.output.push(result.is_err() as u32 as f64);if result.is_ok(){f.output.extend([out.imminent_damage,out.imminent_shield_flux,out.actual_damage,out.earliest,out.facing.unwrap_or(f64::NAN),
        out.facing_threat.map_or(-1.0,|v|v as f64),out.threats.len() as f64]);for t in out.threats{f.output.extend([match t.kind{Kind::Projectile=>0.0,Kind::Beam=>1.0,Kind::Weapon=>2.0},t.source.map_or(0.0,|id|id.handle as f64),
            t.source.map_or(0.0,|id|id.generation as f64),t.mount.map_or(-1.0,|v|v as f64),t.eta,t.damage,t.shield_flux,t.direction]);}}f.output.as_ptr() as usize as u32
})}
#[no_mangle]pub extern "C" fn test_initialize()->u32 {FIXTURE.with_borrow_mut(|f|{
    let d=&f.input;f.controller=Controller::default();f.forecast=Forecast::default();f.host.flux=flux::Flux::new(&d[..10]);f.host.shield=shield::Shield::new(&d[10..29]);f.host.shield.data[6]=d[29];
    f.host.s=DefenseState{can_use_shields:d[30]==1.0,system_shield_damage_multiplier:d[31],system_shield_upkeep_multiplier:d[32],hull_hp:d[33],..DefenseState::default()};
    f.host.vent_allowed=true;f.host.shield_requests=0;f.host.vent_calls=0;f.host.facing=None;0
})}
fn assessment(d:&[f64])->Assessment {let mut a=Assessment{imminent_damage:d[0],imminent_shield_flux:d[1],actual_damage:d[2],has_deferred_weapon_threat:d[4]==1.0,
    facing:if d[5].is_nan(){None}else{Some(d[5])},..Assessment::default()};for _ in 0..d[3] as usize{a.threats.push(Threat{kind:Kind::Projectile,source:None,mount:None,eta:0.0,damage:1.0,shield_flux:1.0,direction:0.0});}a}
#[no_mangle]pub extern "C" fn test_defense()->u32 {FIXTURE.with_borrow_mut(|f|{
    let d=&f.input;let threat=assessment(&d[1..7]);f.host.s.committed_fire=d[7]==1.0;f.host.s.prevents_ai_venting=d[8]==1.0;f.host.vent_allowed=d[9]==1.0;f.host.flux.soft=d[10];f.host.flux.hard=d[11];f.host.flux.overloaded=d[12]==1.0;
    f.controller.observe(d[0],&threat).unwrap();let result=if d[13]==1.0{let fresh=assessment(&d[14..20]);let mut refresh=|_:&mut Host|Ok(fresh.clone());f.controller.update(&mut f.host,&threat,Some(&mut refresh))}else{f.controller.update(&mut f.host,&threat,None)};
    f.output.clear();f.output.push(result.is_err() as u32 as f64);if let Ok(result)=result{f.output.extend([f.controller.quiet_for,f.controller.safe_vent_for,result.vent_safe as u32 as f64,
        match result.state{DefenseMode::Up=>0.0,DefenseMode::Down=>1.0,DefenseMode::Phase=>2.0,DefenseMode::Venting=>3.0},result.refreshed_before_vent as u32 as f64,result.attempted_vent as u32 as f64,f.host.facing.unwrap_or(f64::NAN)]);
        f.output.extend(f.host.shield.data);f.output.extend(f.host.flux.words());f.output.extend([f.host.shield_requests as f64,f.host.vent_calls as f64]);}f.output.as_ptr() as usize as u32
})}
#[no_mangle]pub extern "C" fn test_forecast()->u32 {FIXTURE.with_borrow_mut(|f|{
    let d=&f.input;let step=f.forecast.begin(d[0],d[1],d[2],d[3] as usize,d[4]==1.0,d[5]==1.0,d[6]).unwrap();let mut assessment=Assessment::default();assessment.earliest=d[9];
    if d[8]==1.0{assessment.threats.push(Threat{kind:Kind::Weapon,source:None,mount:None,eta:d[2]+0.1,damage:1.0,shield_flux:1.0,direction:0.0});}
    f.forecast.finish(step,&mut assessment,d[2],d[3] as usize,d[7] as u8,d[6]).unwrap();f.output.clear();f.output.extend([step.first as u32 as f64,step.refresh as u32 as f64,step.compact as u32 as f64,step.weapon_horizon,
        f.forecast.remaining,f.forecast.far_threat as u32 as f64,f.forecast.earliest,f.forecast.defense_window,f.forecast.roster_size as f64,assessment.has_deferred_weapon_threat as u32 as f64,assessment.earliest]);f.output.as_ptr() as usize as u32
})}
#[no_mangle]pub extern "C" fn test_lifetime()->u32 {FIXTURE.with_borrow_mut(|f|{
    let d=&f.input;let option=|value:f64|if value.is_nan(){None}else{Some(value)};
    let lifetime=remaining_lifetime(Lifetime{source_missile:d[0]==1.0,flameout_time:d[1],fizzle_time:option(d[2]),flight_time:option(d[3]),range_remaining:option(d[4]),
        source_move_speed:option(d[5]),vx:d[6],vy:d[7],fade_time:d[8],fade_progress:d[9]});f.output.clear();f.output.push(lifetime);f.output.as_ptr() as usize as u32
})}
