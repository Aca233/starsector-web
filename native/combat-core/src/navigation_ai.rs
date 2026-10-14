//! Resident-world numeric navigation. Source contract and limits:
//! docs/rust-combat-navigation-source-notes-2026-10-08.md.
//! The authority owns rows and builds this immutable lease at the AI boundary.
//! No callback, clock, random state, JS hydration or world write occurs here.

use std::f64::consts::PI;

pub mod body_flag {
    pub const DEAD: u32 = 1;
    pub const FIGHTER: u32 = 16;
    pub const PHASED: u32 = 32;
    pub const OVERLOADED: u32 = 64;
}
pub const POSITION_TOLERANCE: f64 = 8.0;
pub const COLLISION_MARGIN: f64 = 8.0;
pub const STEERING_RESPONSE: f64 = 0.5;
pub const AVOIDANCE_LOOKAHEAD: f64 = 3.0;
pub const AVOIDANCE_STEPS: usize = 8;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Identity { pub handle: u32, pub generation: u32 }

#[derive(Clone, Copy, Debug, Default)]
pub struct Body {
    pub identity: Identity,
    pub assembly_root: Identity,
    pub x: f64, pub y: f64, pub vx: f64, pub vy: f64,
    pub facing: f64, pub angular_velocity: f64,
    pub radius: f64, pub team: f64, pub flags: u32,
    pub max_speed: f64, pub acceleration: f64, pub deceleration: f64,
    pub strafe_multiplier: f64, pub turn_deceleration: f64,
    pub shield_type: u8, pub shield_radius: f64,
    pub raw_shield_active: bool, pub shield_void: bool,
    pub system_locks_turning: bool,
    pub weapon_first: usize, pub weapon_count: usize,
}

#[derive(Clone, Copy, Debug, Default)]
pub struct Weapon {
    pub owner: Identity,
    pub relative_x: f64, pub relative_y: f64,
    /// Only actual FRIENDLY_BLOCKED/SHIP diagnostics create this reference.
    pub blocked_lane_target: Option<Identity>,
}

#[derive(Clone, Copy, Debug, Default)]
pub struct Obstacle { pub x: f64, pub y: f64, pub vx: f64, pub vy: f64, pub radius: f64 }

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum Role { Brawler, Skirmisher, Artillery, Carrier, Unarmed, #[default] Line }

#[derive(Clone, Copy, Debug, Default)]
pub struct Assignment { pub role: Role, pub approach_bearing: Option<f64> }

#[derive(Clone, Copy, Debug, Default)]
pub struct Velocity { pub x: f64, pub y: f64 }

#[derive(Clone, Copy, Debug, Default)]
pub struct Controls { pub turn: f64, pub throttle: f64, pub strafe: f64, pub brake: bool }

#[derive(Clone, Copy, Debug, Default)]
pub struct Avoidance {
    pub velocity: Velocity, pub avoiding: bool, pub risk: f64,
    /// 0 retains input; 1 halves it; 2 stops; 3..11 are the authored detours.
    pub candidate: u8,
}

#[derive(Clone, Copy, Debug, Default)]
pub struct Yield { pub velocity: Velocity, pub yielding: bool, pub lane: Option<usize> }

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Error { InvalidNumber, InvalidIdentity, DuplicateIdentity, InvalidTopology, StaleTarget }

/// Validated synchronous lease. Construction validates the whole authoritative
/// observation once; public solvers reject invalid owner/target rows separately.
#[derive(Clone,Copy)]
pub struct World<'a> {
    bodies: &'a [Body], weapons: &'a [Weapon], obstacles: &'a [Obstacle],
}
impl<'a> World<'a> {
    pub fn new(bodies: &'a [Body], weapons: &'a [Weapon], obstacles: &'a [Obstacle]) -> Result<Self, Error> {
        let view = Self { bodies, weapons, obstacles };
        let mut rows=std::collections::BTreeMap::new();
        for(i,b)in bodies.iter().enumerate(){rows.entry((b.identity.handle,b.identity.generation)).or_insert(i);}
        let find=|id:Identity|rows.get(&(id.handle,id.generation)).copied();
        let mut handles=std::collections::BTreeSet::new();
        for b in bodies {
            if b.identity.handle == 0 || b.identity.generation == 0 || b.assembly_root.handle == 0 || b.assembly_root.generation == 0 {
                return Err(Error::InvalidIdentity);
            }
            if !handles.insert(b.identity.handle) { return Err(Error::DuplicateIdentity); }
            if ![b.x,b.y,b.vx,b.vy,b.facing,b.angular_velocity,b.radius,b.team,b.max_speed,b.acceleration,b.deceleration,
                b.strafe_multiplier,b.turn_deceleration,b.shield_radius].iter().all(|n|n.is_finite())
                || [b.radius,b.max_speed,b.acceleration,b.deceleration,b.strafe_multiplier,b.turn_deceleration,b.shield_radius].iter().any(|n|*n<0.0) {
                return Err(Error::InvalidNumber);
            }
            if b.shield_type > 3 || b.weapon_first.checked_add(b.weapon_count).is_none_or(|end|end>weapons.len()) {
                return Err(Error::InvalidTopology);
            }
            for m in &weapons[b.weapon_first..b.weapon_first+b.weapon_count] {
                if m.owner != b.identity { return Err(Error::InvalidTopology); }
            }
        }
        for m in weapons {
            if find(m.owner).is_none() || ![m.relative_x,m.relative_y].iter().all(|n|n.is_finite()) { return Err(Error::InvalidTopology); }
            if m.blocked_lane_target.is_some_and(|target|find(target).is_none()) { return Err(Error::StaleTarget); }
        }
        for b in bodies {
            if find(b.assembly_root).is_none() { return Err(Error::StaleTarget); }
        }
        let mut coverage=vec![0usize;weapons.len()];
        for b in bodies{for count in &mut coverage[b.weapon_first..b.weapon_first+b.weapon_count]{*count+=1;}}
        if coverage.iter().any(|count|*count!=1){return Err(Error::InvalidTopology);}
        for o in obstacles {
            if ![o.x,o.y,o.vx,o.vy,o.radius].iter().all(|n|n.is_finite()) || o.radius<0.0 { return Err(Error::InvalidNumber); }
        }
        Ok(view)
    }
    pub fn find(&self, identity: Identity) -> Option<usize> { self.bodies.iter().position(|b|b.identity==identity) }
    fn body(&self, row: usize) -> Result<&Body, Error> { self.bodies.get(row).ok_or(Error::InvalidIdentity) }
}

pub fn length(x: f64, y: f64) -> f64 {
    let a=x.abs(); let b=y.abs();
    if a==f64::INFINITY || b==f64::INFINITY { return f64::INFINITY; }
    let max=if a>b { a } else { b };
    if max==0.0 && a==0.0 { return 0.0; }
    let ratio=if a>b { b/max } else { a/max };
    (1.0+ratio*ratio).sqrt()*max
}
fn hypot(x:f64,y:f64)->f64 { x.hypot(y) }
fn min(a:f64,b:f64)->f64 { if a.is_nan() || b.is_nan() { f64::NAN } else { a.min(b) } }
fn max(a:f64,b:f64)->f64 { if a.is_nan() || b.is_nan() { f64::NAN } else { a.max(b) } }
fn clamp(x:f64,lo:f64,hi:f64)->f64 { max(lo,min(hi,x)) }
pub fn signed_angle(a:f64)->f64 { a.sin().atan2(a.cos()) }
fn sign(x:f64)->f64 { if x==0.0 || x.is_nan() { x } else if x<0.0 { -1.0 } else { 1.0 } }
pub fn limit(mut velocity:Velocity,limit:f64)->Velocity {
    let n=length(velocity.x,velocity.y);
    if n>limit { velocity.x*=limit/n; velocity.y*=limit/n; }
    velocity
}
fn valid_velocity(v:Velocity)->Result<(),Error> { if v.x.is_finite() && v.y.is_finite() { Ok(()) } else { Err(Error::InvalidNumber) } }

pub fn position_velocity(world:&World<'_>,row:usize,x:f64,y:f64,target_velocity:Velocity,tolerance:f64)->Result<Velocity,Error> {
    let b=world.body(row)?; valid_velocity(target_velocity)?;
    if ![x,y,tolerance].iter().all(|n|n.is_finite()) { return Err(Error::InvalidNumber); }
    let dx=x-b.x; let dy=y-b.y; let distance=length(dx,dy);
    let speed=if distance<=tolerance { 0.0 } else { min(b.max_speed,(2.0*b.deceleration*(distance-tolerance)).sqrt()) };
    let mut desired=target_velocity;
    if distance>0.0 { desired.x+=dx*(speed/distance); desired.y+=dy*(speed/distance); }
    Ok(limit(desired,b.max_speed))
}

pub fn approach_velocity(world:&World<'_>,row:usize,target:usize,range:f64,withdrawing:bool,assignment:Option<Assignment>)->Result<Velocity,Error> {
    let b=world.body(row)?; let t=world.body(target)?;
    if !range.is_finite() || assignment.is_some_and(|a|a.approach_bearing.is_some_and(|bearing|!bearing.is_finite())) { return Err(Error::InvalidNumber); }
    let mut tx=t.x-b.x; let mut ty=t.y-b.y;
    if length(tx,ty)<1e-6 { tx=b.facing.cos(); ty=b.facing.sin(); }
    let distance=length(tx,ty); let ux=if distance>0.00001 { tx/distance } else { tx }; let uy=if distance>0.00001 { ty/distance } else { ty };
    if withdrawing { return Ok(Velocity { x:ux*-b.max_speed,y:uy*-b.max_speed }); }
    let braking=max(64.0,b.max_speed*b.max_speed/(2.0*max(1.0,b.deceleration)));
    let gap=max(0.0,distance-range-POSITION_TOLERANCE); let follow=max(0.0,1.0-gap/braking);
    let mut desired=position_velocity(world,row,t.x+ux*-range,t.y+uy*-range,Velocity {x:t.vx*follow,y:t.vy*follow},POSITION_TOLERANCE)?;
    let Some(Assignment {role,approach_bearing:Some(bearing)})=assignment else { return Ok(desired); };
    let rx=b.x-t.x; let ry=b.y-t.y; let radial=length(rx,ry);
    if radial<1.0 || radial>range*2.5 { return Ok(desired); }
    let delta=bearing-crate::canonical_math::atan2(ry,rx);
    let error=crate::canonical_math::atan2(delta.sin(),delta.cos());
    let lane=min(b.max_speed*if role==Role::Skirmisher {0.5}else{0.3},(2.0*b.acceleration*b.strafe_multiplier*max(0.0,error.abs()*radial-20.0)).sqrt());
    desired.x+=-ry/radial*(sign(error)*lane); desired.y+=rx/radial*(sign(error)*lane);
    Ok(limit(desired,b.max_speed))
}

pub fn regroup_velocity(world:&World<'_>,row:usize,anchor:usize,target:Option<usize>)->Result<Velocity,Error> {
    let b=world.body(row)?; let a=world.body(anchor)?;
    let (mut x,mut y)=if let Some(t)=target { let t=world.body(t)?; (a.x-t.x,a.y-t.y) } else { ((a.facing+PI).cos(),(a.facing+PI).sin()) };
    if length(x,y)<1.0 { x=(a.facing+PI).cos(); y=(a.facing+PI).sin(); }
    let k=(b.radius+a.radius+180.0)/length(x,y);
    position_velocity(world,row,a.x+x*k,a.y+y*k,Velocity {x:a.vx,y:a.vy},60.0)
}

#[derive(Default)]
pub struct Scratch { nearby: Vec<Obstacle> }
impl Scratch {
    pub fn new()->Self { Self::default() }
    fn obstacles(&mut self,world:&World<'_>,row:usize,horizon:f64)->Result<(),Error> {
        let own=world.body(row)?;
        self.nearby.clear();
        let own_radius=max(own.radius,if own.raw_shield_active && own.shield_type!=3 {own.shield_radius}else{0.0});
        let mut add=|x:f64,y:f64,vx:f64,vy:f64,radius:f64| {
            let combined=own_radius+radius+COLLISION_MARGIN;
            if length(own.x-x,own.y-y)>combined+(own.max_speed+length(own.vx,own.vy)+length(vx,vy))*horizon { return; }
            self.nearby.push(Obstacle {x,y,vx,vy,radius:combined});
        };
        for b in world.bodies {
            if b.assembly_root==own.assembly_root || b.flags&(body_flag::DEAD|body_flag::PHASED|body_flag::FIGHTER)!=0 { continue; }
            let shield=if b.raw_shield_active && b.shield_type!=3 && !(b.shield_void && b.team==own.team) {b.shield_radius}else{0.0};
            add(b.x,b.y,b.vx,b.vy,max(b.radius,shield));
        }
        for o in world.obstacles { add(o.x,o.y,o.vx,o.vy,o.radius); }
        Ok(())
    }
}

fn risk(body:&Body,desired:Velocity,nearby:&[Obstacle],horizon:f64)->f64 {
    let step=horizon/AVOIDANCE_STEPS as f64; let c=body.facing.cos(); let s=body.facing.sin();
    let (mut x,mut y,mut vx,mut vy,mut score)=(body.x,body.y,body.vx,body.vy,0.0);
    for i in 0..AVOIDANCE_STEPS {
        let bx=x; let by=y; let time=i as f64*step;
        if length(desired.x,desired.y)<1.0 {
            let speed=hypot(vx,vy); let mult=if speed!=0.0 {max(0.0,1.0-body.deceleration*step/speed)}else{0.0}; vx*=mult; vy*=mult;
        } else {
            let ex=(desired.x-vx)*c+(desired.y-vy)*s; let ey=-(desired.x-vx)*s+(desired.y-vy)*c;
            let ax=clamp(ex/STEERING_RESPONSE,-body.deceleration,body.acceleration);
            let ay=clamp(ey/STEERING_RESPONSE,-body.acceleration*body.strafe_multiplier,body.acceleration*body.strafe_multiplier);
            vx+=(ax*c-ay*s)*step; vy+=(ax*s+ay*c)*step;
        }
        x+=vx*step; y+=vy*step;
        for o in nearby {
            let rx=bx-o.x-o.vx*time; let ry=by-o.y-o.vy*time; let dx=x-bx-o.vx*step; let dy=y-by-o.vy*step;
            let t=clamp(-(rx*dx+ry*dy)/max(1e-10,dx*dx+dy*dy),0.0,1.0);
            let separation=hypot(rx+dx*t,ry+dy*t);
            if separation<o.radius { score+=(o.radius-separation)/o.radius*step/(1.0+time); }
        }
    }
    score
}

pub fn avoid_collisions(world:&World<'_>,row:usize,desired:Velocity,scratch:&mut Scratch)->Result<Avoidance,Error> {
    let b=world.body(row)?; valid_velocity(desired)?;
    let unchanged=Avoidance {velocity:desired,..Avoidance::default()};
    if b.flags&body_flag::PHASED!=0 { return Ok(unchanged); }
    let horizon=max(AVOIDANCE_LOOKAHEAD,length(b.vx,b.vy)/max(1.0,b.deceleration)+1.0);
    scratch.obstacles(world,row,horizon)?;
    if scratch.nearby.is_empty() { return Ok(unchanged); }
    let original=risk(b,desired,&scratch.nearby,horizon);
    if original<=1e-8 { return Ok(unchanged); }
    let desired_length=length(desired.x,desired.y); let speed=max(desired_length,b.max_speed*0.5);
    let heading=if desired_length>1.0 {crate::canonical_math::atan2(desired.y,desired.x)}else{b.facing};
    let mut candidates=[Velocity::default();11];
    candidates[0]=Velocity {x:desired.x*0.5,y:desired.y*0.5};
    for (i,angle) in [30.0,-30.0,60.0,-60.0,90.0,-90.0,135.0,-135.0,180.0].iter().enumerate() {
        let h=heading+angle*PI/180.0;
        candidates[i+2]=Velocity {x:crate::canonical_math::cos(h)*min(speed,b.max_speed),y:crate::canonical_math::sin(h)*min(speed,b.max_speed)};
    }
    let mut result=Avoidance {velocity:desired,avoiding:true,risk:original,candidate:0}; let mut best_deviation=0.0;
    for (i,candidate) in candidates.iter().enumerate() {
        let candidate_risk=risk(b,*candidate,&scratch.nearby,horizon);
        let deviation=if desired_length>1.0 { signed_angle(candidate.y.atan2(candidate.x)-heading).abs()*speed*0.5+(length(candidate.x,candidate.y)-desired_length).abs()*2.0 }else{length(candidate.x,candidate.y)};
        if candidate_risk<result.risk-1e-8 || (candidate_risk-result.risk).abs()<1e-8 && deviation<best_deviation-1e-8 {
            result.velocity=*candidate; result.risk=candidate_risk; result.candidate=i as u8+1; best_deviation=deviation;
        }
    }
    Ok(result)
}

pub fn forward_path_clear(world:&World<'_>,row:usize,speed:f64,horizon:f64,scratch:&mut Scratch)->Result<bool,Error> {
    let b=world.body(row)?;
    if !speed.is_finite() || !horizon.is_finite() || horizon<0.0 { return Err(Error::InvalidNumber); }
    if b.flags&body_flag::PHASED!=0 { return Ok(true); }
    let vx=b.facing.cos()*speed; let vy=b.facing.sin()*speed;
    scratch.obstacles(world,row,horizon)?;
    for o in &scratch.nearby {
        let dx=o.x-b.x; let dy=o.y-b.y; let rx=o.vx-vx; let ry=o.vy-vy;
        let t=clamp(-(dx*rx+dy*ry)/max(1e-8,rx*rx+ry*ry),0.0,horizon);
        if length(dx+rx*t,dy+ry*t)<o.radius { return Ok(false); }
    }
    Ok(true)
}

pub fn yield_fire_lane(world:&World<'_>,row:usize,desired:Velocity)->Result<Yield,Error> {
    yield_fire_lane_inner(world,row,desired,false)
}
/// Default CapitalShipAI's object path excludes its entire own assembly.
/// The opt-in batch solver above retains its separately verified source gate.
pub fn yield_fire_lane_assembly(world:&World<'_>,row:usize,desired:Velocity)->Result<Yield,Error> {
    yield_fire_lane_inner(world,row,desired,true)
}
fn yield_fire_lane_inner(world:&World<'_>,row:usize,desired:Velocity,assembly:bool)->Result<Yield,Error> {
    let b=world.body(row)?; valid_velocity(desired)?;
    let unchanged=Yield {velocity:desired,..Yield::default()};
    if b.flags&body_flag::PHASED!=0 { return Ok(unchanged); }
    for (ally,a) in world.bodies.iter().enumerate() {
        if (if assembly{a.assembly_root==b.assembly_root}else{ally==row}) || a.flags&body_flag::DEAD!=0 || a.team!=b.team { continue; }
        for index in a.weapon_first..a.weapon_first+a.weapon_count {
            let m=&world.weapons[index]; let Some(identity)=m.blocked_lane_target else { continue; };
            let target=world.find(identity).ok_or(Error::StaleTarget)?; let t=&world.bodies[target];
            if t.flags&(body_flag::DEAD|body_flag::PHASED)!=0 { continue; }
            let c=a.facing.cos(); let s=a.facing.sin(); let ox=m.relative_x*c-m.relative_y*s+a.x; let oy=m.relative_x*s+m.relative_y*c+a.y;
            let dx=t.x-ox; let dy=t.y-oy; let n=length(dx,dy); if n<1.0 { continue; }
            let inv=1.0/n; let ux=dx*inv; let uy=dy*inv; let rx=b.x-ox; let ry=b.y-oy; let along=rx*ux+ry*uy;
            if along<=0.0 || along>=n-t.radius { continue; }
            let offset=rx*-uy+ry*ux;
            let radius=max(b.radius,if b.raw_shield_active && b.shield_type!=3 {b.shield_radius}else{0.0})+COLLISION_MARGIN;
            if offset.abs()>=radius { continue; }
            let k=if offset<0.0 {-1.0}else{1.0}*b.max_speed*0.5;
            return Ok(Yield {velocity:limit(Velocity {x:desired.x+-uy*k,y:desired.y+ux*k},b.max_speed),yielding:true,lane:Some(index)});
        }
    }
    Ok(unchanged)
}

pub fn cursor_turn_command(facing:f64,angular_velocity:f64,target_angle:f64,turn_deceleration:f64)->f64 {
    if !(turn_deceleration>0.0) { return 0.0; }
    let stopping=angular_velocity*angular_velocity.abs()/(2.0*turn_deceleration);
    let predicted=signed_angle(target_angle-facing-stopping);
    if predicted.abs()<=PI/180.0 { return 0.0; }
    let error=signed_angle(target_angle-facing);
    if error.abs()<1e-10 { return -sign(angular_velocity); }
    let direction=sign(error);
    if direction==sign(angular_velocity) && stopping.abs()>error.abs() { -direction }else{direction}
}

pub fn steering(world:&World<'_>,row:usize,desired:Velocity,facing:f64)->Result<Controls,Error> {
    let b=world.body(row)?; valid_velocity(desired)?;
    if !facing.is_finite() { return Err(Error::InvalidNumber); }
    let turn=if b.system_locks_turning || b.flags&body_flag::OVERLOADED!=0 {0.0}else{cursor_turn_command(b.facing,b.angular_velocity,facing,b.turn_deceleration)};
    // SteeringKernel deliberately uses unscaled sqrt, unlike Vector2.length.
    let brake=(desired.x*desired.x+desired.y*desired.y).sqrt()<1.0;
    if brake { return Ok(Controls {turn,brake,..Controls::default()}); }
    let dx=desired.x-b.vx; let dy=desired.y-b.vy; let c=crate::canonical_math::cos(b.facing); let s=crate::canonical_math::sin(b.facing);
    let x=dx*c+dy*s; let y=-dx*s+dy*c;
    Ok(Controls {turn,brake,throttle:clamp(x/(if x>=0.0 {b.acceleration}else{b.deceleration}*STEERING_RESPONSE),-1.0,1.0),
        strafe:clamp(y/(b.acceleration*b.strafe_multiplier*STEERING_RESPONSE),-1.0,1.0)})
}
