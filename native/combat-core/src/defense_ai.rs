//! Rust-resident threat forecasting and defense control.
//! Source contract: docs/rust-combat-defense-ai-source-notes-2026-10-08.md.
//! Views borrow authority-owned ordered rows; no JS capture or hot solver exists.
use std::f64::consts::PI;

pub mod body_flag { pub const DEAD:u32=1;pub const RETREATED:u32=4;pub const DOCKED:u32=8;pub const PHASED:u32=32;pub const OVERLOADED:u32=64;pub const VENTING:u32=128; }
pub mod weapon_flag { pub const BEAM:u32=8;pub const GUIDED:u32=16;pub const ALWAYS_FIRE:u32=128; }
pub mod projectile_flag { pub const GUIDED:u32=2;pub const FLARE:u32=4;pub const NO_COLLISION:u32=16;pub const DISARMED:u32=64; }
pub const CALM_BEFORE_LOWERING:f64=0.5;
pub const VENT_FLUX_FRACTION:f64=0.7;
pub const IMMINENT_WINDOW:f64=1.0;

#[derive(Clone,Copy,Debug,Default,PartialEq,Eq)]
pub struct Identity { pub handle:u32,pub generation:u32 }
#[derive(Clone,Copy,Debug,Default)]
pub struct Body {
    pub identity:Identity,pub team:f64,pub flags:u32,pub vx:f64,pub vy:f64,
    pub radius:f64,pub shield_x:f64,pub shield_y:f64,pub shield_radius:f64,pub shield_type:u8,
    pub shield_efficiency:f64,pub shield_damage_multiplier:f64,pub shield_energy_multiplier:f64,
    pub shield_half_arc:f64,pub phase_down_duration:f64,pub phase_up_duration:f64,
    pub phase_cooldown_duration:f64,pub shield_unfold_duration:f64,
    pub overload_timer:f64,pub vent_time:f64,pub system_recovery:f64,
    pub max_speed:f64,pub max_turn_rate:f64,pub weapon_first:usize,pub weapon_count:usize,
}
#[derive(Clone,Copy,Debug,Default)]
pub struct Weapon {
    pub owner:Identity,pub disabled:bool,pub ammo:f64,pub dps:f64,pub flags:u32,
    pub muzzle_x:f64,pub muzzle_y:f64,pub effective_range:f64,pub max_speed:f64,
    pub base_angle:f64,pub angle:f64,pub fixed:bool,pub authored_half_arc:f64,pub turn_rate:f64,
    pub readiness:f64,pub burst_size:f64,pub damage:f64,pub damage_type:u8,pub beam_duration:f64,
}
#[derive(Clone,Copy,Debug,Default)]
pub struct Projectile {
    pub source:Option<Identity>,pub explicit_team:Option<f64>,pub flags:u32,pub did_damage:bool,
    pub damage:f64,pub damage_type:u8,pub remaining_life:f64,pub x:f64,pub y:f64,pub vx:f64,pub vy:f64,
    pub radius:f64,pub fuse:f64,pub target:Option<Identity>,pub facing:f64,pub max_speed:f64,pub turn_rate:f64,
}
#[derive(Clone,Copy,Debug,Default)]
pub struct Beam {
    pub source:Option<Identity>,pub mount:Option<usize>,pub damage_active:bool,pub duration:f64,
    pub start_x:f64,pub start_y:f64,pub end_x:f64,pub end_y:f64,pub dps:f64,pub damage_type:u8,
}
#[derive(Clone,Copy,Debug,PartialEq,Eq)]
pub enum Error { InvalidIdentity,DuplicateIdentity,InvalidNumber,InvalidTopology,IncompleteVisibility,StaleIdentity }

/// Complete semantic ordered world lease created at a resident AI/read barrier.
#[derive(Clone,Copy)]
pub struct World<'a> {
    pub bodies:&'a [Body],pub weapons:&'a [Weapon],pub projectiles:&'a [Projectile],pub beams:&'a [Beam],
    pub teams:&'a [f64],pub visibility:&'a [u8],
}
impl World<'_> {
    pub fn find(&self,id:Identity)->Option<usize> { self.bodies.iter().position(|b|b.identity==id) }
    pub fn validate(&self)->Result<(),Error> {
        if self.visibility.len()!=self.bodies.len()*self.teams.len() || self.bodies.iter().any(|b|!self.teams.contains(&b.team)) {
            return Err(Error::IncompleteVisibility);
        }
        if self.teams.iter().enumerate().any(|(i,t)|!t.is_finite()||self.teams[..i].contains(t)) {return Err(Error::IncompleteVisibility);}
        let mut rows=std::collections::BTreeMap::new();
        for(i,b)in self.bodies.iter().enumerate(){rows.entry((b.identity.handle,b.identity.generation)).or_insert(i);}
        let find=|id:Identity|rows.get(&(id.handle,id.generation)).copied();
        let mut handles=std::collections::BTreeSet::new();
        for (i,b) in self.bodies.iter().enumerate() {
            if b.identity.handle==0||b.identity.generation==0 {return Err(Error::InvalidIdentity);}
            if !handles.insert(b.identity.handle) {return Err(Error::DuplicateIdentity);}
            if ![b.team,b.vx,b.vy,b.radius,b.shield_x,b.shield_y,b.shield_radius,b.shield_efficiency,b.shield_damage_multiplier,
                b.shield_energy_multiplier,b.shield_half_arc,b.phase_down_duration,b.phase_up_duration,b.phase_cooldown_duration,
                b.shield_unfold_duration,b.overload_timer,b.vent_time,b.system_recovery,b.max_speed,b.max_turn_rate].iter().all(|n|n.is_finite()) {return Err(Error::InvalidNumber);}
            if b.shield_type>3||b.weapon_first.checked_add(b.weapon_count).is_none_or(|end|end>self.weapons.len()) {return Err(Error::InvalidTopology);}
            for m in &self.weapons[b.weapon_first..b.weapon_first+b.weapon_count] {if m.owner!=b.identity {return Err(Error::InvalidTopology);}}
        }
        let mut coverage=vec![0usize;self.weapons.len()];
        for b in self.bodies{for count in &mut coverage[b.weapon_first..b.weapon_first+b.weapon_count]{*count+=1;}}
        for (i,m) in self.weapons.iter().enumerate() {
            if find(m.owner).is_none()||coverage[i]!=1 {return Err(Error::InvalidTopology);}
            if m.damage_type>3||m.ammo.is_nan()||m.ammo==f64::NEG_INFINITY||m.beam_duration.is_nan()||m.beam_duration==f64::NEG_INFINITY||![m.dps,m.muzzle_x,m.muzzle_y,m.effective_range,m.max_speed,
                m.base_angle,m.angle,m.authored_half_arc,m.turn_rate,m.readiness,m.burst_size,m.damage].iter().all(|n|n.is_finite()) {return Err(Error::InvalidNumber);}
        }
        for p in self.projectiles {
            if p.source.is_some_and(|id|find(id).is_none())||p.target.is_some_and(|id|find(id).is_none()) {return Err(Error::StaleIdentity);}
            if p.explicit_team.is_some_and(|team|!team.is_finite())||p.damage_type>3||p.remaining_life.is_nan()||p.remaining_life==f64::NEG_INFINITY
                ||![p.damage,p.x,p.y,p.vx,p.vy,p.radius,p.fuse,p.facing,p.max_speed,p.turn_rate].iter().all(|n|n.is_finite()) {return Err(Error::InvalidNumber);}
        }
        for b in self.beams {
            if b.source.is_some_and(|id|find(id).is_none()) {return Err(Error::StaleIdentity);}
            if b.mount.is_some_and(|m|m>=self.weapons.len()||Some(self.weapons[m].owner)!=b.source) {return Err(Error::InvalidTopology);}
            if b.damage_type>3||![b.duration,b.start_x,b.start_y,b.end_x,b.end_y,b.dps].iter().all(|n|n.is_finite()) {return Err(Error::InvalidNumber);}
        }
        Ok(())
    }
    fn visible(&self,source:usize,observer:usize)->bool {
        self.teams.iter().position(|t|*t==self.bodies[observer].team).is_some_and(|team|self.visibility[source*self.teams.len()+team]!=0)
    }
}

/// Legacy remainingProjectileLifetime expressed from resident lifecycle fields.
#[derive(Clone,Copy,Debug,Default)]
pub struct Lifetime {
    pub source_missile:bool,pub flameout_time:f64,pub fizzle_time:Option<f64>,pub flight_time:Option<f64>,
    pub range_remaining:Option<f64>,pub source_move_speed:Option<f64>,pub vx:f64,pub vy:f64,pub fade_time:f64,pub fade_progress:f64,
}
pub fn remaining_lifetime(p:Lifetime)->f64 {
    if p.source_missile {
        let flameout=max(0.0,p.flameout_time-p.fizzle_time.unwrap_or(0.0));
        if p.fizzle_time.is_some(){return flameout;}
        if let Some(flight)=p.flight_time{return max(0.0,flight)+flameout;}
    }
    if let Some(flight)=p.flight_time{return flight;}
    let Some(range)=p.range_remaining else{return f64::INFINITY;};
    max(0.0,range)/max(1.0,p.source_move_speed.unwrap_or_else(||length(p.vx,p.vy)))+max(0.0,p.fade_time*(1.0-p.fade_progress))
}

#[derive(Clone,Copy,Debug,PartialEq,Eq)]
pub enum Kind { Projectile,Beam,Weapon }
#[derive(Clone,Copy,Debug)]
pub struct Threat {pub kind:Kind,pub source:Option<Identity>,pub mount:Option<usize>,pub eta:f64,pub damage:f64,pub shield_flux:f64,pub direction:f64}
#[derive(Clone,Debug)]
pub struct Assessment {
    pub threats:Vec<Threat>,pub has_deferred_weapon_threat:bool,pub horizon:f64,
    pub imminent_damage:f64,pub imminent_shield_flux:f64,pub actual_damage:f64,pub earliest:f64,pub facing:Option<f64>,
    /// Index into threats, preserving the first original-order winning candidate.
    pub facing_threat:Option<usize>,
}
impl Default for Assessment { fn default()->Self {Self {threats:Vec::new(),has_deferred_weapon_threat:false,horizon:0.0,imminent_damage:0.0,imminent_shield_flux:0.0,
    actual_damage:0.0,earliest:f64::INFINITY,facing:None,facing_threat:None}} }

fn min(a:f64,b:f64)->f64 {if a.is_nan()||b.is_nan(){f64::NAN}else{a.min(b)}}
fn max(a:f64,b:f64)->f64 {if a.is_nan()||b.is_nan(){f64::NAN}else{a.max(b)}}
pub fn signed_angle(a:f64)->f64 {a.sin().atan2(a.cos())}
/// Exact Vector2.coordinateLength evaluation order.
pub fn length(x:f64,y:f64)->f64 {
    let a=x.abs();let b=y.abs();if a==f64::INFINITY||b==f64::INFINITY{return f64::INFINITY;}
    let largest=if a>b{a}else{b};if largest==0.0&&a==0.0{return 0.0;}
    let ratio=if a>b{b/largest}else{a/largest};(1.0+ratio*ratio).sqrt()*largest
}
/// V8 Math.hypot two-argument normalized summation used by the frame path.
/// Rust libm hypot can round differently; that difference would alter ETA.
pub fn frame_length(x:f64,y:f64)->f64 {
    let x=x.abs();let y=y.abs();if x==f64::INFINITY||y==f64::INFINITY{return f64::INFINITY;}
    let largest=max(x,y);if largest==0.0{return 0.0;}
    let sx=x/largest;let sy=y/largest;(sx*sx+sy*sy).sqrt()*largest
}
pub fn circle_entry(ax:f64,ay:f64,bx:f64,by:f64,cx:f64,cy:f64,r:f64)->Option<f64> {
    let fx=ax-cx;let fy=ay-cy;let dx=bx-ax;let dy=by-ay;let c=fx*fx+fy*fy-r*r;
    if c<=0.0{return Some(0.0);}let a=dx*dx+dy*dy;if a<=1e-12{return None;}
    let b=2.0*(fx*dx+fy*dy);let d=b*b-4.0*a*c;if d<0.0{return None;}
    let t=(-b-d.sqrt())/(2.0*a);if t>=0.0&&t<=1.0{Some(t)}else{None}
}
fn covered(direction:f64,center:f64,half:f64)->bool {
    let difference=direction-center;let absolute=difference.abs();let separation=if absolute<=PI{absolute}else{PI*2.0-absolute};
    if absolute<=PI*2.0&&(separation-half).abs()>1e-12{separation<=half}else{signed_angle(difference).abs()<=half}
}

#[derive(Default)]
pub struct Scratch {active:Vec<bool>,imminent:Vec<usize>,weights:Vec<f64>,order:Vec<usize>,angles:Vec<f64>,members:Vec<u32>,scores:Vec<f64>,excluded:Vec<usize>}
impl Scratch {pub fn new()->Self {Self::default()}}

fn facing(threats:&[Threat],half:f64,scratch:&mut Scratch)->Option<usize> {
    let n=scratch.imminent.len();scratch.weights.clear();scratch.weights.extend(scratch.imminent.iter().map(|&i|threats[i].shield_flux/(1.0+threats[i].eta)));
    let mut best= -1.0;let mut winner=None;
    if n<128||!(half>1e-9&&half<PI-1e-9)||scratch.imminent.iter().any(|&i|!threats[i].direction.is_finite()||threats[i].direction.abs()>PI) {
        for &candidate in &scratch.imminent {
            let mut weight=0.0;for (i,&threat) in scratch.imminent.iter().enumerate(){if covered(threats[threat].direction,threats[candidate].direction,half){weight+=scratch.weights[i];}}
            if weight>best{best=weight;winner=Some(candidate);}
        }
        return winner;
    }
    scratch.order.clear();scratch.order.extend(0..n);scratch.order.sort_by(|&a,&b|threats[scratch.imminent[a]].direction.partial_cmp(&threats[scratch.imminent[b]].direction).unwrap().then(a.cmp(&b)));
    scratch.angles.clear();scratch.angles.resize(n*3,0.0);
    // Keep the same addition/subtraction placement as TS (direction + (period-1)*TAU).
    for i in 0..n*3{scratch.angles[i]=threats[scratch.imminent[scratch.order[i%n]]].direction+((i/n) as f64-1.0)*(PI*2.0);}
    scratch.members.clear();scratch.members.resize(n.div_ceil(32),0);scratch.scores.clear();scratch.scores.resize(n,0.0);scratch.excluded.clear();
    let mut lo=0;let mut hi=0;let mut prior=None;let mut prior_score=0.0;
    for &candidate in &scratch.order {
        let center=threats[scratch.imminent[candidate]].direction;
        if prior==Some(center){scratch.scores[candidate]=prior_score;continue;}
        let lower=center-half;let upper=center+half;
        while lo<scratch.angles.len()&&scratch.angles[lo]<lower-1e-11{
            if lo<hi{let index=scratch.order[lo%n];scratch.members[index>>5]&=!(1u32<<(index&31));}lo+=1;
        }
        if hi<lo{hi=lo;}while hi<scratch.angles.len()&&scratch.angles[hi]<=upper+1e-11{let index=scratch.order[hi%n];hi+=1;scratch.members[index>>5]|=1u32<<(index&31);}
        let mut check=|i:usize|{let index=scratch.order[i%n];if !covered(threats[scratch.imminent[index]].direction,center,half){scratch.members[index>>5]&=!(1u32<<(index&31));scratch.excluded.push(index);}};
        let mut i=lo;while i<hi&&scratch.angles[i]<=lower+1e-11{check(i);i+=1;}
        let mut i=hi;while i>lo&&scratch.angles[i-1]>=upper-1e-11{i-=1;check(i);}
        let mut weight=0.0;for (block,&member) in scratch.members.iter().enumerate(){let mut word=member;while word!=0{let bit=word.trailing_zeros() as usize;weight+=scratch.weights[block*32+bit];word&=word-1;}}
        for &index in &scratch.excluded{scratch.members[index>>5]|=1u32<<(index&31);}scratch.excluded.clear();scratch.scores[candidate]=weight;prior_score=weight;prior=Some(center);
    }
    for (i,&score) in scratch.scores.iter().enumerate(){if score>best{best=score;winner=Some(scratch.imminent[i]);}}
    winner
}

fn add(out:&mut Assessment,b:&Body,kind:Kind,source:Option<Identity>,mount:Option<usize>,eta:f64,damage:f64,damage_type:u8,x:f64,y:f64,weapon_horizon:f64) {
    if !(eta>=0.0&&eta<=if kind==Kind::Weapon{weapon_horizon}else{out.horizon}&&damage>0.0)||!damage.is_finite(){return;}
    let base=match damage_type{0=>2.0,1=>0.5,3=>0.25,_=>1.0};let multiplier=b.shield_damage_multiplier*if damage_type==2{b.shield_energy_multiplier}else{1.0};
    out.threats.push(Threat {kind,source,mount,eta,damage,shield_flux:damage*base*b.shield_efficiency*multiplier,direction:(y-b.shield_y).atan2(x-b.shield_x)});
}

pub fn assess_into(world:&World<'_>,observer:Identity,horizon:f64,window:f64,weapon_horizon:f64,weapon_frame_eligible:bool,out:&mut Assessment,scratch:&mut Scratch)->Result<(),Error> {
    world.validate()?;assess_into_at_barrier(world,observer,horizon,window,weapon_horizon,weapon_frame_eligible,out,scratch)
}
pub(crate) fn assess_into_at_barrier(world:&World<'_>,observer:Identity,horizon:f64,window:f64,weapon_horizon:f64,weapon_frame_eligible:bool,out:&mut Assessment,scratch:&mut Scratch)->Result<(),Error> {
    let row=world.find(observer).ok_or(Error::StaleIdentity)?;
    if horizon.is_nan()||window.is_nan()||weapon_horizon.is_nan()||horizon<0.0||window<0.0||weapon_horizon<0.0{return Err(Error::InvalidNumber);}
    let b=&world.bodies[row];out.threats.clear();out.has_deferred_weapon_threat=false;out.horizon=horizon;out.imminent_damage=0.0;out.imminent_shield_flux=0.0;out.actual_damage=0.0;out.earliest=f64::INFINITY;out.facing=None;out.facing_threat=None;
    let cx=b.shield_x;let cy=b.shield_y;let radius=max(b.radius,if b.shield_type==1||b.shield_type==2{b.shield_radius}else{0.0});
    for p in world.projectiles {
        let owner=p.explicit_team.or_else(||p.source.and_then(|id|world.find(id).map(|s|world.bodies[s].team)));
        if owner.is_none()||owner==Some(b.team)||p.flags&(projectile_flag::FLARE|projectile_flag::DISARMED|projectile_flag::NO_COLLISION)!=0||p.did_damage||!(p.damage>0.0){continue;}
        let life=min(horizon,p.remaining_life);if !(life>0.0){continue;}
        let ex=p.x+(p.vx-b.vx)*life;let ey=p.y+(p.vy-b.vy)*life;let cr=radius+p.radius+p.fuse;
        let mut eta=circle_entry(p.x,p.y,ex,ey,cx,cy,cr).map_or(f64::INFINITY,|t|t*life);
        if p.flags&projectile_flag::GUIDED!=0&&p.target==Some(observer){
            let dx=cx-p.x;let dy=cy-p.y;let error=signed_angle(dy.atan2(dx)-p.facing).abs();
            let pursuit=max(0.0,length(dx,dy)-cr)/max(1.0,p.max_speed)+error/max(0.001,p.turn_rate);
            if pursuit<=life{eta=min(eta,pursuit);}
        }
        add(out,b,Kind::Projectile,p.source,None,eta,p.damage,p.damage_type,p.x,p.y,weapon_horizon);
    }
    scratch.active.clear();scratch.active.resize(world.weapons.len(),false);
    for beam in world.beams {
        let Some(source)=beam.source.and_then(|id|world.find(id))else{continue;};
        if world.bodies[source].team==b.team||world.bodies[source].flags&body_flag::DEAD!=0||!beam.damage_active||beam.duration<=0.0{continue;}
        if circle_entry(beam.start_x,beam.start_y,beam.end_x,beam.end_y,cx,cy,radius).is_none(){continue;}
        if let Some(m)=beam.mount{scratch.active[m]=true;}
        add(out,b,Kind::Beam,beam.source,beam.mount,0.0,beam.dps*min(window,beam.duration),beam.damage_type,beam.start_x,beam.start_y,weapon_horizon);
    }
    for (s,enemy) in world.bodies.iter().enumerate() {
        let stopped=if weapon_frame_eligible{body_flag::DEAD|body_flag::RETREATED|body_flag::DOCKED}else{body_flag::DEAD};
        if s==row||enemy.flags&stopped!=0||enemy.team==b.team||!world.visible(s,row){continue;}
        let recovery=max(max(if enemy.flags&body_flag::OVERLOADED!=0{enemy.overload_timer}else{0.0},if enemy.flags&body_flag::VENTING!=0{enemy.vent_time}else{0.0}),
            max(if enemy.flags&body_flag::PHASED!=0{enemy.phase_down_duration}else{0.0},enemy.system_recovery));
        if recovery>weapon_horizon{continue;}
        for m in enemy.weapon_first..enemy.weapon_first+enemy.weapon_count {
            let weapon=&world.weapons[m];if weapon.disabled||weapon.ammo<1.0||weapon.dps<=0.0||scratch.active[m]{continue;}
            let dx=cx-weapon.muzzle_x;let dy=cy-weapon.muzzle_y;let distance=if weapon_frame_eligible{frame_length(dx,dy)}else{length(dx,dy)};
            let ux=if distance>0.00001{dx/distance}else{dx};let uy=if distance>0.00001{dy/distance}else{dy};
            let closing=max(0.0,(enemy.vx-b.vx)*ux+(enemy.vy-b.vy)*uy);
            let approach=max(0.0,distance-radius-weapon.effective_range)/max(1.0,enemy.max_speed+closing);
            if !weapon_frame_eligible&&approach>weapon_horizon{continue;}
            let travel=if weapon.flags&weapon_flag::BEAM!=0{0.0}else{max(0.0,min(weapon.effective_range,distance-radius))/max(1.0,weapon.max_speed)};
            if weapon_frame_eligible&&max(max(recovery,weapon.readiness),approach)+travel>weapon_horizon{continue;}
            let heading=dy.atan2(dx);let turn=signed_angle(heading-weapon.base_angle).abs();let half=if weapon.fixed{0.0}else{weapon.authored_half_arc};
            let hull_turn=max(0.0,turn-half-min(1.0,radius/max(1.0,distance)).asin())/max(0.001,enemy.max_turn_rate);
            let turret=if half>0.0{signed_angle(heading-weapon.angle).abs()/max(0.001,weapon.turn_rate)}else{0.0};
            let turn_time=if weapon.flags&weapon_flag::GUIDED!=0&&weapon.flags&weapon_flag::ALWAYS_FIRE!=0{0.0}else{max(hull_turn,turret)};
            let eta=max(max(max(recovery,weapon.readiness),turn_time),approach)+travel;
            let count=min(weapon.ammo,max(1.0,weapon.burst_size));
            let damage=if weapon.flags&weapon_flag::BEAM!=0{weapon.dps*min(window,weapon.beam_duration)}else{weapon.damage*count};
            add(out,b,Kind::Weapon,Some(enemy.identity),Some(m),eta,damage,weapon.damage_type,weapon.muzzle_x,weapon.muzzle_y,weapon_horizon);
        }
    }
    scratch.imminent.clear();scratch.imminent.extend(out.threats.iter().enumerate().filter(|(_,t)|t.eta<=window).map(|(i,_)|i));
    out.facing_threat=facing(&out.threats,b.shield_half_arc,scratch);out.facing=out.facing_threat.map(|i|out.threats[i].direction);
    for t in &out.threats{out.earliest=min(out.earliest,t.eta);if t.eta<=window{out.imminent_damage+=t.damage;out.imminent_shield_flux+=t.shield_flux;if t.kind!=Kind::Weapon{out.actual_damage+=t.damage;}}}
    Ok(())
}

#[derive(Clone,Copy,Debug)]
pub struct Forecast {
    pub remaining:f64,pub far_threat:bool,pub earliest:f64,pub defense_window:f64,pub roster_size:usize,
}
impl Default for Forecast {fn default()->Self{Self {remaining:-1.0,far_threat:false,earliest:f64::INFINITY,defense_window:0.0,roster_size:0}}}
#[derive(Clone,Copy,Debug)]
pub struct ForecastStep {pub first:bool,pub refresh:bool,pub compact:bool,pub weapon_horizon:f64}
impl Forecast {
    pub fn reset(&mut self){*self=Self::default();}
    pub fn invalidate_after_live_refresh(&mut self){self.remaining=-1.0;}
    pub fn begin(&mut self,dt:f64,horizon:f64,window:f64,roster_size:usize,compact_eligible:bool,native_forecast:bool,interval:f64)->Result<ForecastStep,Error>{
        if !dt.is_finite()||dt<0.0||!interval.is_finite()||interval<0.0||horizon.is_nan()||window.is_nan(){return Err(Error::InvalidNumber);}
        let compact=interval>0.0&&compact_eligible&&native_forecast;let first=self.remaining<0.0;self.remaining-=max(0.0,dt);
        let refresh=!compact||first||self.remaining<=1e-9||self.defense_window!=window||self.roster_size!=roster_size;
        Ok(ForecastStep{first,refresh,compact,weapon_horizon:if refresh{horizon}else{min(horizon,window)}})
    }
    pub fn finish(&mut self,step:ForecastStep,threat:&mut Assessment,window:f64,roster_size:usize,tactical_phase:u8,interval:f64)->Result<(),Error>{
        if tactical_phase>2||!interval.is_finite()||interval<0.0{return Err(Error::InvalidNumber);}
        if step.refresh{
            self.far_threat=false;self.earliest=f64::INFINITY;
            for incoming in &threat.threats{if incoming.kind==Kind::Weapon&&incoming.eta>window{self.far_threat=true;self.earliest=min(self.earliest,incoming.eta);}}
            self.remaining=if !step.compact{-1.0}else if step.first{(tactical_phase as f64+1.0)*interval/3.0}else{interval+min(0.0,self.remaining%interval)};
            self.defense_window=window;self.roster_size=roster_size;
        }else{threat.has_deferred_weapon_threat=self.far_threat;threat.earliest=min(threat.earliest,self.earliest);}
        Ok(())
    }
}

#[derive(Clone,Copy,Debug,Default)]
pub struct DefenseState {
    pub committed_fire:bool,pub base_dissipation:f64,pub prevents_ai_venting:bool,pub venting:bool,
    pub flux_percent:f64,pub phase_engaged:bool,pub overloaded:bool,pub can_use_shields:bool,pub toggle_locked:bool,
    pub max_flux:f64,pub total_flux:f64,pub shield_type:u8,pub shield_active:bool,pub phase_activation_cost:f64,
    pub phase_upkeep:f64,pub phase_down_duration:f64,pub system_shield_damage_multiplier:f64,
    pub shield_upkeep:f64,pub system_shield_upkeep_multiplier:f64,pub hull_hp:f64,
}
#[derive(Clone,Copy,Debug,PartialEq,Eq)]
pub enum DefenseMode { Up,Down,Phase,Venting }
#[derive(Clone,Copy,Debug,PartialEq,Eq)]
pub struct DefenseResult {pub vent_safe:bool,pub state:DefenseMode,pub refreshed_before_vent:bool,pub attempted_vent:bool}
/// Implemented directly by resident Rust Ship/Shield/Flux, never by JS callbacks.
pub trait DefenseHost {
    fn defense_state(&self)->DefenseState;
    fn set_defense_facing(&mut self,facing:Option<f64>);
    fn set_shield_active(&mut self,active:bool);
    fn start_venting(&mut self)->bool;
}
#[derive(Clone,Copy,Debug,Default)]
pub struct Controller {pub quiet_for:f64,pub safe_vent_for:f64}
impl Controller {
    pub fn reset(&mut self){self.quiet_for=0.0;self.safe_vent_for=0.0;}
    pub fn observe(&mut self,dt:f64,threat:&Assessment)->Result<(),Error>{
        if !dt.is_finite()||dt<0.0{return Err(Error::InvalidNumber);}
        self.quiet_for=if threat.imminent_damage>0.0{0.0}else{self.quiet_for+dt};
        self.safe_vent_for=if !threat.threats.is_empty()||threat.has_deferred_weapon_threat{0.0}else{self.safe_vent_for+dt};Ok(())
    }
    pub fn would_refresh_before_vent(&self,state:DefenseState)->bool{
        self.safe_vent_for>=CALM_BEFORE_LOWERING&&state.base_dissipation>0.0&&!state.committed_fire&&!state.prevents_ai_venting
            &&!state.venting&&state.flux_percent>=VENT_FLUX_FRACTION&&!state.phase_engaged&&!state.overloaded
    }
    /// Refresh closure is a resident live-world query at the exact vent barrier.
    /// It runs once, then observe(0) and the original recursive update execute.
    pub fn update<H:DefenseHost>(&mut self,host:&mut H,threat:&Assessment,mut refresh:Option<&mut dyn FnMut(&mut H)->Result<Assessment,Error>>)->Result<DefenseResult,Error>{
        let state=host.defense_state();
        if state.shield_type>3||state.flux_percent.is_infinite()||state.flux_percent.is_nan()&&!(state.max_flux==0.0&&state.total_flux==0.0)||![state.base_dissipation,state.max_flux,state.total_flux,state.phase_activation_cost,state.phase_upkeep,
            state.phase_down_duration,state.system_shield_damage_multiplier,state.shield_upkeep,state.system_shield_upkeep_multiplier,state.hull_hp].iter().all(|n|n.is_finite()){return Err(Error::InvalidNumber);}
        host.set_defense_facing(threat.facing);
        let vent_safe=self.safe_vent_for>=CALM_BEFORE_LOWERING&&state.base_dissipation>0.0&&!state.committed_fire&&!state.prevents_ai_venting;
        let result=|state,attempted_vent|DefenseResult{vent_safe,state,refreshed_before_vent:false,attempted_vent};
        if state.venting{return Ok(result(DefenseMode::Venting,false));}
        let mut attempted_vent=false;
        if vent_safe&&state.flux_percent>=VENT_FLUX_FRACTION&&!state.phase_engaged&&!state.overloaded{
            if let Some(refresh)=refresh.as_mut(){let fresh=refresh(host)?;self.observe(0.0,&fresh)?;let mut answer=self.update(host,&fresh,None)?;answer.refreshed_before_vent=true;return Ok(answer);}
            attempted_vent=true;if host.start_venting(){return Ok(result(DefenseMode::Venting,true));}
        }
        let state=host.defense_state();
        if !state.can_use_shields{host.set_shield_active(false);return Ok(result(DefenseMode::Down,attempted_vent));}
        if state.toggle_locked{host.set_shield_active(true);return Ok(DefenseResult{vent_safe:false,state:DefenseMode::Up,refreshed_before_vent:false,attempted_vent});}
        let room=state.max_flux-state.total_flux;
        if state.shield_type==3{
            let activation=if state.shield_active{0.0}else{state.phase_activation_cost};
            let reserve=activation+state.phase_upkeep*(state.phase_down_duration+IMMINENT_WINDOW);
            if !(room>reserve)||self.quiet_for>=CALM_BEFORE_LOWERING{host.set_shield_active(false);}else if threat.imminent_damage>0.0{host.set_shield_active(true);}
            return Ok(result(if host.defense_state().phase_engaged{DefenseMode::Phase}else{DefenseMode::Down},attempted_vent));
        }
        let needed=threat.imminent_shield_flux*state.system_shield_damage_multiplier+state.shield_upkeep*state.system_shield_upkeep_multiplier*IMMINENT_WINDOW;
        let can_absorb=room>needed;let must_protect=threat.actual_damage>=state.hull_hp;
        if threat.imminent_damage>0.0{host.set_shield_active(can_absorb||must_protect);}else if self.quiet_for>=CALM_BEFORE_LOWERING{host.set_shield_active(false);}
        Ok(result(if host.defense_state().shield_active{DefenseMode::Up}else{DefenseMode::Down},attempted_vent))
    }
}
