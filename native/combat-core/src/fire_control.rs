//! Numeric FIRE_QUERY domain. Inputs are borrowed from the resident Rust world;
//! no TS entity callbacks, resource reservations or emission occur here.
use crate::random::Random;
use std::f64::consts::PI;

pub mod body_flag {pub const DEAD:u32=1;pub const COLLISIONLESS:u32=2;pub const FIGHTER:u32=16;pub const PHASED:u32=32;pub const OVERLOADED:u32=64;pub const VENTING:u32=128;pub const HOLD_FIRE:u32=1024;}
pub mod weapon_flag {pub const PD:u32=2;pub const PD_ONLY:u32=4;pub const BEAM:u32=8;pub const GUIDED:u32=16;pub const HARDPOINT:u32=64;pub const ALWAYS_FIRE:u32=128;}
pub mod projectile_flag {pub const GUIDED:u32=2;pub const NO_COLLISION:u32=16;}
pub mod hint {pub const ANTI_FTR:u32=1;pub const STRIKE:u32=2;pub const DO_NOT_AIM:u32=4;pub const GUIDED_POOR:u32=8;pub const PD_ALSO:u32=16;pub const USE_VS_FRIGATES:u32=32;pub const IGNORES_FLARES:u32=64;pub const DO_NOT_CONSERVE:u32=128;pub const USE_LESS_VS_SHIELDS:u32=256;}
#[derive(Clone,Copy,Debug,Default,PartialEq,Eq)]
pub struct Identity {pub handle:u32,pub generation:u32}
#[derive(Clone,Copy,Debug,Default,PartialEq,Eq)]
pub struct Target {pub kind:u8,pub identity:Identity}
#[derive(Clone,Default)]
pub struct Armor {pub cols:usize,pub rows:usize,pub width:f64,pub height:f64,pub min_x:f64,pub min_y:f64,pub cells:Vec<f32>,pub effective:f64,pub dynamic_effective:f64,pub residual:f64,pub reduction:f64,pub armor_mult:[f64;4],pub hull_mult:[f64;4],pub native:bool}
#[derive(Clone,Default)]
pub struct Body {
    pub identity:Identity,pub x:f64,pub y:f64,pub vx:f64,pub vy:f64,pub facing:f64,pub angular_velocity:f64,pub radius:f64,pub team:f64,pub flags:u32,pub assembly_root:usize,
    pub hull:Vec<[f64;2]>,pub shield_x:f64,pub shield_y:f64,pub shield_radius:f64,pub shield_arc:f64,pub shield_facing:f64,pub shield_type:u8,pub shield_on:bool,pub shield_void:bool,
    pub hp:f64,pub max_hp:f64,pub flux_percent:f64,pub overload_timer:f64,pub vent_time:f64,pub size:u8,pub target_radius:f64,pub vast:bool,pub no_fire_through:bool,pub pd_ignore_flares:f64,
    pub accuracy:f64,pub current_target:Option<Identity>,pub autonomous:bool,pub aim_x:f64,pub aim_y:f64,pub main_trigger:bool,pub finish:f64,pub pressure:f64,pub native_threat:bool,pub armor:Armor,pub tie:u32,
}
#[derive(Clone,Default)]
pub struct Weapon {
    pub owner:usize,pub flags:u32,pub angle:f64,pub base_angle:f64,pub arc_rad:f64,pub arc_deg:f64,pub effective_range:f64,pub speed:f64,pub turn_rate:f64,pub charge_delay:f64,
    pub ammo:f64,pub max_ammo:f64,pub disabled:bool,pub cooldown:f64,pub burst_remaining:f64,pub firing_state:u8,pub damage_type:u8,pub projectile_radius:f64,
    pub hints:u32,pub pass_fighters:bool,pub missile_body:bool,pub beam_burst:bool,pub proximity:f64,pub has_proximity:bool,pub weapon_missile:bool,pub regen:f64,pub size_scale:f64,pub accuracy_bonus:f64,
    pub idle:f64,pub has_muzzle_offset:bool,pub offset_x:f64,pub offset_y:f64,pub reload:f64,pub cycle:f64,pub base_range:f64,pub base_speed:f64,pub authored_base_angle:f64,pub relative_x:f64,pub relative_y:f64,
}
#[derive(Clone,Default)]
pub struct Projectile {
    pub identity:Identity,pub x:f64,pub y:f64,pub vx:f64,pub vy:f64,pub radius:f64,pub source:Option<usize>,pub flags:u32,pub damage:f64,pub damage_type:u8,pub range_remaining:f64,
    pub decoy:bool,pub flare:bool,pub hp:f64,pub flight_life:f64,pub flight_life_present:bool,pub eligible_budget:bool,pub arming:f64,pub source_speed:f64,
    pub team:f64,pub explicit_team:f64,pub budget_team:f64,pub damaged_rows:Vec<usize>,pub tie:u32,
}
#[derive(Clone,Copy,Default)]
pub struct Asteroid {pub x:f64,pub y:f64,pub vx:f64,pub vy:f64,pub radius:f64,pub hp:f64}
/// Scope and budget membership are semantic ordered resident roster membership.
/// An adapter must never reconstruct budget_rows from potentially eligible fire.
pub struct World<'a> {pub bodies:&'a [Body],pub weapons:&'a [Weapon],pub projectiles:&'a [Projectile],pub asteroids:&'a [Asteroid],pub teams:&'a [f64],pub visibility:&'a [u8],pub scope:&'a [u8],pub missile_scope:&'a [u8],pub budget_scope:&'a [u8],pub budget_rows:&'a [Vec<usize>],pub budget_present:bool,pub native_budget:bool,pub budget_complete:bool,pub adaptive_budget:bool}
/// Proof for this exact immutable world borrow, after all validation succeeds.
/// A query cannot substitute another world or retain this across a mutation.
pub(crate) struct ValidatedWorld<'world,'data> {world:&'world World<'data>}
#[derive(Clone,Copy,Debug,PartialEq,Eq)]
pub enum Error {IncompleteWorld,UnsupportedBudget,MissingOwner,MissingMount,PreTurnDecision}
impl<'data> World<'data> {
    pub fn validate(&self)->Result<(),Error> {
        if self.scope.len()!=self.bodies.len() || self.missile_scope.len()!=self.projectiles.len() || self.budget_scope.len()!=self.bodies.len()
            || self.visibility.len()!=self.bodies.len()*self.teams.len() || self.budget_rows.len()!=self.bodies.len()
            || self.weapons.iter().any(|w|w.owner>=self.bodies.len() || w.damage_type>3)
            || self.projectiles.iter().any(|p|p.source.is_some_and(|r|r>=self.bodies.len()) || p.damage_type>3)
            || self.budget_rows.iter().any(|rows|rows.iter().any(|&r|r>=self.projectiles.len())) {return Err(Error::IncompleteWorld);}
        if self.budget_present && (!self.native_budget || !self.budget_complete || self.bodies.iter().any(|b|b.native_threat && !b.armor.native)) {return Err(Error::UnsupportedBudget);}
        if self.bodies.iter().any(|b|b.armor.native && (b.armor.cols==0 || b.armor.rows==0 || !(b.armor.width>0.0 && b.armor.height>0.0) || b.armor.cells.len()!=b.armor.cols*b.armor.rows)) {return Err(Error::IncompleteWorld);}
        Ok(())
    }
    pub(crate) fn validated(&self)->Result<ValidatedWorld<'_,'data>,Error> {
        self.validate()?;Ok(ValidatedWorld{world:self})
    }
    fn target_row(&self,target:Target)->Option<usize> {match target.kind {1=>self.bodies.iter().position(|b|b.identity==target.identity),2=>self.projectiles.iter().position(|p|p.identity==target.identity),_=>None}}
    fn current(&self,own:usize)->Option<usize> {self.bodies[own].current_target.and_then(|id|self.bodies.iter().position(|b|b.identity==id))}
    fn visible(&self,row:usize,team:f64)->bool {self.teams.iter().position(|&t|t==team).is_some_and(|i|self.visibility[row*self.teams.len()+i]!=0)}
}
pub fn signed_angle(a:f64)->f64 {a.sin().atan2(a.cos())}
pub fn length(x:f64,y:f64)->f64 {let a=x.abs();let b=y.abs();if a==f64::INFINITY || b==f64::INFINITY{return f64::INFINITY;}let max=if a>b{a}else{b};if max==0.0 && a==0.0{return 0.0;}let ratio=if a>b{b}else{a}/max;(1.0+ratio*ratio).sqrt()*max}
fn sign(a:f64)->f64 {if a>0.0{1.0}else if a<0.0{-1.0}else{a}}
pub fn intercept_time(px:f64,py:f64,vx:f64,vy:f64,speed:f64)->Option<f64> {
    if !(speed>0.0) || !speed.is_finite(){return None;}let c=px*px+py*py;if c<1e-12{return Some(0.0);}
    let vv=vx*vx+vy*vy;let a=vv-speed*speed;let b=2.0*(px*vx+py*vy);
    if a.abs()<=1e-10*(speed*speed).max(vv).max(1.0){return if b< -1e-10{Some(-c/b)}else{None};}
    let d=b*b-4.0*a*c;if d<0.0{return None;}let q= -0.5*(b+if b>=0.0{1.0}else{-1.0}*d.sqrt());let first=q/a;let second=if q==0.0{f64::INFINITY}else{c/q};
    let f=first>=0.0 && first.is_finite();let s=second>=0.0 && second.is_finite();if f{Some(if s{first.min(second)}else{first})}else if s{Some(second)}else{None}
}
/// Acquisition intentionally tests the first circle entry only.
pub fn circle(ax:f64,ay:f64,bx:f64,by:f64,cx:f64,cy:f64,radius:f64)->Option<f64> {
    let fx=ax-cx;let fy=ay-cy;let dx=bx-ax;let dy=by-ay;let c=fx*fx+fy*fy-radius*radius;if c<=0.0{return Some(0.0);}let a=dx*dx+dy*dy;if a<=1e-12{return None;}
    let b=2.0*(fx*dx+fy*dy);let d=b*b-4.0*a*c;if d<0.0{return None;}let first=(-b-d.sqrt())/(2.0*a);if first>=0.0 && first<=1.0{Some(first)}else{None}
}
fn inside(points:&[[f64;2]],x:f64,y:f64)->bool {let mut result=false;let mut j=points.len()-1;for i in 0..points.len(){let [xi,yi]=points[i];let [xj,yj]=points[j];if (yi>y)!=(yj>y) && x<((xj-xi)*(y-yi))/(yj-yi)+xi{result=!result;}j=i;}result}
#[derive(Clone,Copy)]
struct HullFrame {cos:f64,sin:f64,min_x:f64,max_x:f64,min_y:f64,max_y:f64}
impl HullFrame {
    fn new(b:&Body)->Self {
        let cos=(-b.facing).cos();let sin=(-b.facing).sin();
        let mut min_x=f64::INFINITY;let mut max_x=f64::NEG_INFINITY;let mut min_y=f64::INFINITY;let mut max_y=f64::NEG_INFINITY;
        for &[x,y] in &b.hull{min_x=min_x.min(x);max_x=max_x.max(x);min_y=min_y.min(y);max_y=max_y.max(y);}
        Self{cos,sin,min_x,max_x,min_y,max_y}
    }
}
/// Only this exact body slice can use these values. The immutable borrow ends
/// before the next observation can update location, facing or authored bounds.
pub(crate) struct PreparedHulls<'body> {bodies:&'body [Body],frames:Vec<HullFrame>}
impl<'body> PreparedHulls<'body> {
    pub(crate) fn new(bodies:&'body [Body])->Self {Self{bodies,frames:bodies.iter().map(HullFrame::new).collect()}}
    fn frame(&self,bodies:&[Body],row:usize)->Option<&HullFrame> {if std::ptr::eq(self.bodies,bodies){Some(&self.frames[row])}else{None}}
}
pub fn hull(b:&Body,ax:f64,ay:f64,bx:f64,by:f64)->Option<f64> {
    if b.hull.len()<3{return circle(ax,ay,bx,by,b.x,b.y,b.radius);}hull_prepared(b,ax,ay,bx,by,&HullFrame::new(b))
}
fn hull_prepared(b:&Body,ax:f64,ay:f64,bx:f64,by:f64,frame:&HullFrame)->Option<f64> {
    if b.hull.len()<3{return circle(ax,ay,bx,by,b.x,b.y,b.radius);}let HullFrame{cos,sin,min_x,max_x,min_y,max_y}=*frame;let sx=ax-b.x;let sy=ay-b.y;let ex=bx-b.x;let ey=by-b.y;
    let x0=sx*cos-sy*sin;let y0=sx*sin+sy*cos;let x1=ex*cos-ey*sin;let y1=ex*sin+ey*cos;
    let pad=1e-7*1.0f64.max(x0.abs()).max(y0.abs()).max(x1.abs()).max(y1.abs()).max(min_x.abs()).max(max_x.abs()).max(min_y.abs()).max(max_y.abs());
    if x0.max(x1)<min_x-pad || x0.min(x1)>max_x+pad || y0.max(y1)<min_y-pad || y0.min(y1)>max_y+pad{return None;}
    if inside(&b.hull,x0,y0){return Some(0.0);}let dx1=x1-x0;let dy1=y1-y0;let mut min_t=1.0;let mut found=false;
    for i in 0..b.hull.len(){let j=(i+b.hull.len()-1)%b.hull.len();let [x,y]=b.hull[j];let dx2=b.hull[i][0]-x;let dy2=b.hull[i][1]-y;let denom=dx1*dy2-dy1*dx2;if denom.abs()<1e-8{continue;}let dx3=x0-x;let dy3=y0-y;let t=(dx2*dy3-dy2*dx3)/denom;let u=(dx1*dy3-dy1*dx3)/denom;
        if t>=0.0 && t<=1.0 && u>=0.0 && u<=1.0 && t<=min_t{min_t=t;found=true;}}
    if found{Some(min_t)}else if inside(&b.hull,x1,y1){Some(1.0)}else{None}
}
pub fn shield_covered(b:&Body,x:f64,y:f64)->bool {
    if !(b.shield_arc>5.0*PI/180.0) || b.shield_type==0 || b.shield_type==3 || !b.shield_on{return false;}let dx=x-b.shield_x;let dy=y-b.shield_y;let scale=b.shield_radius/length(dx,dy).max(0.001);
    let px=b.shield_x+dx*scale;let py=b.shield_y+dy*scale;signed_angle((py-b.shield_y).atan2(px-b.shield_x)-b.shield_facing).abs()<=b.shield_arc/2.0
}
pub fn segment(b:&Body,ax:f64,ay:f64,bx:f64,by:f64,ignore_shield:bool)->Option<f64> {
    segment_shield(b,ax,ay,bx,by,ignore_shield,hull(b,ax,ay,bx,by))
}
fn body_segment(prepared:Option<&PreparedHulls<'_>>,bodies:&[Body],row:usize,ax:f64,ay:f64,bx:f64,by:f64,ignore_shield:bool)->Option<f64> {
    let b=&bodies[row];if let Some(frame)=prepared.and_then(|p|p.frame(bodies,row)){segment_shield(b,ax,ay,bx,by,ignore_shield,hull_prepared(b,ax,ay,bx,by,frame))}else{segment(b,ax,ay,bx,by,ignore_shield)}
}
fn segment_shield(b:&Body,ax:f64,ay:f64,bx:f64,by:f64,ignore_shield:bool,mut first:Option<f64>)->Option<f64> {
    if !ignore_shield && b.shield_on && b.shield_arc>5.0*PI/180.0 && b.shield_type!=0 && b.shield_type!=3{
        if let Some(t)=circle(ax,ay,bx,by,b.shield_x,b.shield_y,b.shield_radius){if signed_angle((ay+(by-ay)*t-b.shield_y).atan2(ax+(bx-ax)*t-b.shield_x)-b.shield_facing).abs()<=b.shield_arc/2.0{first=Some(first.map_or(t,|f|f.min(t)));}}}first
}
pub fn advance_turret(current:f64,base:f64,target:f64,arc_deg:f64,turn_rate:f64,pivot_rate:f64,dt:f64)->f64 {
    let half=PI.min(arc_deg*PI/360.0);let unlimited=arc_deg>=360.0;let clamp=|v:f64|{let v=signed_angle(v);if unlimited{v}else{v.max(-half).min(half)}};
    let relative=clamp(current-base);let desired=clamp(target-base);let error=if unlimited{signed_angle(desired-relative)}else{desired-relative};let opposed=if sign(error)!=sign(pivot_rate) && turn_rate>0.0{pivot_rate.abs()}else{0.0};
    let rate=turn_rate.max(opposed-5.0*PI/180.0);base+relative+sign(error)*error.abs().min(rate.max(0.0)*dt)
}

pub struct FireBudget;
impl FireBudget {
    pub fn needs_detailed(v:&World<'_>,own:usize,target:usize)->bool {
        let b=&v.bodies[target];if b.shield_on || b.shield_type==3{return false;}
        if !b.armor.native || !b.hp.is_finite() || !b.max_hp.is_finite() || b.hp<=0.0 || b.hp<=b.max_hp*0.5{return true;}
        let mut raw=0.0;for &shot in &v.budget_rows[target]{let p=&v.projectiles[shot];if !p.damage.is_finite(){return true;}if p.budget_team!=v.bodies[own].team{continue;}raw+=p.damage.max(0.0);if raw>=b.hp*0.25{return true;}}false
    }
    pub fn penalty(v:&World<'_>,own:usize,target:usize,before:f64)->f64 {
        Self::penalty_prepared(v,own,target,before,None)
    }
    fn penalty_prepared(v:&World<'_>,own:usize,target:usize,before:f64,prepared:Option<&PreparedHulls<'_>>)->f64 {
        let b=&v.bodies[target];let owner=&v.bodies[own];let horizon=before.min(3.0);
        if !horizon.is_finite() || horizon<=0.0 || b.flags&(body_flag::DEAD|body_flag::COLLISIONLESS)!=0 || b.team==owner.team || b.shield_type==3 || !b.native_threat || b.shield_on{return 0.0;}
        let a=&b.armor;let mut damage=0.0;
        for &shot in &v.budget_rows[target]{let p=&v.projectiles[shot];if !p.eligible_budget || p.damaged_rows.contains(&target) || p.budget_team!=owner.team || !(p.source_speed>0.0){continue;}
            let life=horizon.min(p.range_remaining/p.source_speed).min(p.flight_life);let vx=p.vx-b.vx;let vy=p.vy-b.vy;
            let Some(entry)=body_segment(prepared,v.bodies,target,p.x,p.y,p.x+vx*life,p.y+vy*life,false)else{continue;};let eta=entry*life;if p.arming>eta{continue;}
            let mut blocked=false;
            for (other,body) in v.bodies.iter().enumerate(){if v.budget_scope[other]==0 || other==target || Some(other)==p.source || body.flags&body_flag::COLLISIONLESS!=0 || !v.visible(other,owner.team){continue;}
                if body_segment(prepared,v.bodies,other,p.x,p.y,p.x+(p.vx-body.vx)*eta,p.y+(p.vy-body.vy)*eta,body.shield_void && body.team==p.explicit_team).is_some(){blocked=true;break;}}
            if blocked{continue;}
            for rock in v.asteroids{if rock.hp>0.0 && circle(p.x,p.y,p.x+(p.vx-rock.vx)*eta,p.y+(p.vy-rock.vy)*eta,rock.x,rock.y,rock.radius+p.radius).is_some(){blocked=true;break;}}
            if blocked{continue;}
            let cos=(-b.facing).cos();let sin=(-b.facing).sin();let hx=p.x+vx*eta-b.x;let hy=p.y+vy*eta-b.y;let x=hx*cos-hy*sin;let y=hx*sin+hy*cos;
            let col=((x-a.min_x)/a.width).floor().max(0.0).min((a.cols-1)as f64)as isize;let row=((y-a.min_y)/a.height).floor().max(0.0).min((a.rows-1)as f64)as isize;
            let t=p.damage_type as usize;let type_mult=match t{1=>2.0,0=>0.5,3=>0.25,_=>1.0};let armor_mult=type_mult*a.armor_mult[t];let hull_mult=a.hull_mult[t];if !(armor_mult>0.0 && hull_mult>0.0){continue;}
            let mut effective=0.0;let mut absorption=0.0;
            for dy in -2isize..=2{for dx in -2isize..=2{if dx.abs()==2 && dy.abs()==2{continue;}let c=col+dx;let r=row+dy;
                let cell=if c<0 || r<0 || c>=a.cols as isize || r>=a.rows as isize{0.0}else{a.cells[r as usize*a.cols+c as usize]as f64};
                effective+=cell*if dx.abs()<=1 && dy.abs()<=1{1.0}else{0.033333335/0.06666667};absorption+=cell;}}
            effective=(effective*a.effective*a.dynamic_effective).max(a.residual);let strength=p.damage*armor_mult;let reduced=strength*(1.0-a.reduction).max(strength/(strength+effective));
            let mut confidence=if p.flags&projectile_flag::GUIDED!=0{0.55}else{0.8};
            if b.shield_type!=0 && !(b.flags&body_flag::OVERLOADED!=0 && b.overload_timer>eta) && !(b.flags&body_flag::VENTING!=0 && b.vent_time>eta){confidence*=0.35;}
            let expected=(reduced-absorption).max(0.0)*hull_mult/armor_mult*confidence;if expected.is_finite(){damage+=expected;}
        }
        let coverage=damage/b.hp.max(1.0);2.5*((coverage-0.6)/0.8).max(0.0).min(1.0)
    }
}
#[derive(Clone,Copy,Debug,PartialEq,Eq)]
pub enum Priority {Escort,Suppress}
#[derive(Clone,Copy,Debug,PartialEq,Eq)]
pub struct Policy {pub priority:Priority,pub suspended:bool}
#[derive(Clone,Copy,Debug,PartialEq,Eq)]
pub enum CadenceMode {Multirate,Hz20}
#[derive(Clone,Copy)]
pub struct Cadence {pub mode:CadenceMode,pub aim_in:f64,pub scan_in:f64,pub salt:u32,pub x:f64,pub y:f64,pub point:bool,pub range:f64,pub speed:f64,pub base:f64,pub arc:f64,pub rx:f64,pub ry:f64,pub pd:bool,pub initialized:bool}
#[derive(Clone,Copy,Debug,PartialEq,Eq)]
pub struct PolicyKey {pub priority:Priority,pub suspended:bool,pub suppress_handle:Option<u32>}
#[derive(Clone)]
pub struct Memory {pub target:Target,pub scan_in:f64,pub firing_time:f64,pub idle_fire_time:f64,pub ammo_allowed:bool,pub policy_key:Option<PolicyKey>,pub random:Random,pub cadence:Option<Cadence>}
impl Memory {
    pub fn new(salt:u32)->Self {Self {target:Target::default(),scan_in:0.0,firing_time:0.0,idle_fire_time:0.0,ammo_allowed:true,policy_key:None,random:Random::new(salt),cadence:None}}
}
/// JS iterates Unicode code points, then charCodeAt(0) takes only their first
/// UTF-16 code unit. Non-BMP pairs therefore hash the high surrogate once.
pub fn tracker_salt(text:&str)->u32 {let mut hash=2166136261u32;for character in text.chars(){let point=character as u32;let unit=if point>=0x10000{0xd800+((point-0x10000)>>10)}else{point};hash=(hash^unit).wrapping_mul(16777619);}hash}
#[derive(Clone,Copy,Debug,PartialEq,Eq)]
pub enum Decision {Fire,NoTarget,Aligning,FriendlyBlocked,ObstacleBlocked,ConservingAmmo,FluxBudget,Unavailable,DefensiveHold,Reassigning}
#[derive(Clone)]
struct Candidate {kind:u8,row:usize,x:f64,y:f64,priority:f64,threat:f64,utility:f64,retained:bool,traverse:f64,tie:u32}
/// Scratch is not cross-step authority. Memory, turret and group state are.
pub struct Program<'hulls> {
    own:usize,m:usize,dt:f64,ox:f64,oy:f64,pivot_x:f64,pivot_y:f64,delay:f64,speed:f64,range:f64,contact_time:f64,contact_distance:f64,solve_x:f64,solve_y:f64,final_bore:bool,
    target_kind:u8,target_row:Option<usize>,cadence_mode:Option<CadenceMode>,candidates:Vec<Candidate>,order:Vec<usize>,prepared:Option<&'hulls PreparedHulls<'hulls>>,
    pub point_x:f64,pub point_y:f64,pub has_point:bool,pub steer_x:f64,pub steer_y:f64,pub has_steer:bool,pub angle:f64,pub idle:f64,
}
impl<'hulls> Program<'hulls> {
    pub fn new(own:usize)->Self {Self {own,m:0,dt:0.0,ox:0.0,oy:0.0,pivot_x:0.0,pivot_y:0.0,delay:0.0,speed:0.0,range:0.0,contact_time:0.0,contact_distance:0.0,solve_x:0.0,solve_y:0.0,final_bore:false,target_kind:0,target_row:None,cadence_mode:None,candidates:Vec::new(),order:Vec::new(),prepared:None,point_x:0.0,point_y:0.0,has_point:false,steer_x:0.0,steer_y:0.0,has_steer:false,angle:0.0,idle:0.0}}
    pub(crate) fn new_prepared(own:usize,prepared:&'hulls PreparedHulls<'hulls>)->Self {Self{prepared:Some(prepared),..Self::new(own)}}
    pub fn configure_mount(&mut self,v:&World<'_>,m:usize,dt:f64)->Result<(),Error> {
        if self.own>=v.bodies.len(){return Err(Error::MissingOwner);}let Some(w)=v.weapons.get(m)else{return Err(Error::MissingMount);};if w.owner!=self.own{return Err(Error::MissingOwner);}
        self.m=m;self.dt=dt;let b=&v.bodies[self.own];let cos=crate::canonical_math::cos(b.facing);let sin=b.facing.sin();self.pivot_x=w.relative_x*cos-w.relative_y*sin+b.x;self.pivot_y=w.relative_x*sin+w.relative_y*cos+b.y;
        self.angle=w.angle;self.idle=w.idle;self.delay=if w.firing_state==1{w.charge_delay.max(0.0)}else if w.firing_state==0 && w.burst_remaining<=0.0{w.charge_delay}else{0.0};
        self.speed=w.speed;self.range=w.effective_range;self.target_kind=0;self.target_row=None;self.has_point=false;self.has_steer=false;self.refresh_bore(w,self.angle);self.final_bore=false;Ok(())
    }
    pub fn set_memory(&mut self,v:&World<'_>,memory:&Memory){self.target_kind=memory.target.kind;self.target_row=v.target_row(memory.target);}
    pub fn refresh_bore(&mut self,w:&Weapon,angle:f64){self.angle=angle;let cos=angle.cos();let sin=angle.sin();self.ox=if w.has_muzzle_offset{self.pivot_x+(w.offset_x*cos-w.offset_y*sin)}else{self.pivot_x};self.oy=if w.has_muzzle_offset{self.pivot_y+(w.offset_x*sin+w.offset_y*cos)}else{self.pivot_y};}
    pub fn bore(&self)->(f64,f64,f64,bool){(self.ox,self.oy,self.angle,self.final_bore)}
    /// Actual predictWeaponIntercept: no target permission, acquisition bound,
    /// traversal, RNG or persistent fire memory is touched by this query.
    pub fn predict_unconstrained(&mut self,v:&World<'_>,target:Target)->Result<Option<[f64;2]>,Error>{
        v.validate()?;let Some(row)=v.target_row(target)else{return Ok(None);};let own=&v.bodies[self.own];
        let(x,y,vx,vy)=if target.kind==1{let b=&v.bodies[row];(b.x,b.y,b.vx-own.vx,b.vy-own.vy)}else{let p=&v.projectiles[row];(p.x,p.y,p.vx-own.vx,p.vy-own.vy)};
        let px=x-self.ox+vx*self.delay;let py=y-self.oy+vy*self.delay;let time=if self.beam(v){Some(0.0)}else{intercept_time(px,py,vx,vy,self.speed)};
        let Some(time)=time else{return Ok(None);};let point=[self.ox+px+vx*time,self.oy+py+vy*time];Ok(if point.iter().all(|n|n.is_finite()){Some(point)}else{None})
    }
    /// Actual reachableFireTarget at a solved bearing, with the same target
    /// admission, real geometry and relative friendly/asteroid obstruction.
    /// A temporary Program owns only rebuildable query scratch.
    pub fn reachable(&mut self,v:&World<'_>,target:Target)->Result<bool,Error>{
        v.validate()?;let row=v.target_row(target);if !self.eligible(v,target.kind,row){return Ok(false);}let row=row.unwrap();
        self.target_kind=target.kind;self.target_row=Some(row);if !self.solve(v,target.kind,row){return Ok(false);}
        let dx=self.solve_x-self.ox;let dy=self.solve_y-self.oy;let angle=dy.atan2(dx);
        if self.guided(v){let distance=length(dx,dy);self.contact_distance=distance;self.contact_time=distance/self.speed.max(1.0);}
        else if !self.trace(v,target.kind,row,angle){return Ok(false);}
        Ok(self.obstruction(v,angle).is_none())
    }
    pub fn target(&self,v:&World<'_>)->Target {let identity=self.target_row.and_then(|r|if self.target_kind==1{v.bodies.get(r).map(|b|b.identity)}else{v.projectiles.get(r).map(|p|p.identity)});identity.map_or(Target::default(),|identity|Target {kind:self.target_kind,identity})}
    fn pd(&self,v:&World<'_>)->bool {v.weapons[self.m].flags&weapon_flag::PD!=0}
    fn guided(&self,v:&World<'_>)->bool {v.weapons[self.m].flags&weapon_flag::GUIDED!=0}
    fn beam(&self,v:&World<'_>)->bool {v.weapons[self.m].flags&weapon_flag::BEAM!=0}
    fn radius(&self,v:&World<'_>,kind:u8,row:usize)->f64 {if kind==1{v.bodies[row].target_radius}else{v.projectiles[row].radius}}
    fn eligible(&self,v:&World<'_>,kind:u8,row:Option<usize>)->bool {
        let Some(row)=row else{return false;};let w=&v.weapons[self.m];let own=&v.bodies[self.own];let flags=w.flags;let hints=w.hints;let pd=self.pd(v);
        if kind==2 {let Some(p)=v.projectiles.get(row)else{return false;};if v.missile_scope[row]==0 || p.flags&projectile_flag::NO_COLLISION!=0{return false;}if !p.explicit_team.is_finite() && !p.source.is_some_and(|r|v.scope[r]!=0){return false;}
            if p.decoy {if flags&weapon_flag::PD_ONLY!=0 && hints&hint::ANTI_FTR==0 || w.pass_fighters{return false;}if !pd && hints&hint::ANTI_FTR==0 && (hints&hint::STRIKE!=0 || w.weapon_missile && w.ammo.is_finite() && hints&hint::DO_NOT_AIM==0){return false;}}
            else if self.guided(v) || !self.beam(v) && w.missile_body && !w.has_proximity{return false;}
            return (p.decoy || pd) && p.team.is_finite() && p.team!=own.team && p.hp>0.0 && p.flight_life>0.0 && !(p.flare && (hints&hint::IGNORES_FLARES!=0 || own.pd_ignore_flares>0.0));
        }
        if kind!=1{return false;}let Some(b)=v.bodies.get(row)else{return false;};if v.scope[row]==0 || b.vast || b.flags&(body_flag::DEAD|body_flag::COLLISIONLESS)!=0 || b.team==own.team || !v.visible(row,own.team){return false;}
        let fighter=b.flags&body_flag::FIGHTER!=0;if flags&weapon_flag::PD_ONLY!=0 && !(hints&hint::ANTI_FTR!=0 && fighter){return false;}
        if fighter && (w.pass_fighters || !pd && hints&hint::ANTI_FTR==0 && (hints&hint::STRIKE!=0 || w.weapon_missile && w.ammo.is_finite() && hints&hint::DO_NOT_AIM==0)){return false;}
        !(b.size==1 && hints&hint::STRIKE!=0 && hints&hint::USE_VS_FRIGATES==0)
    }
    fn trace(&mut self,v:&World<'_>,kind:u8,row:usize,angle:f64)->bool {
        let own=&v.bodies[self.own];let w=&v.weapons[self.m];let (tx,ty)=if kind==1{(v.bodies[row].vx,v.bodies[row].vy)}else{(v.projectiles[row].vx,v.projectiles[row].vy)};
        let vx=own.vx-tx;let vy=own.vy-ty;let horizon=if self.beam(v){0.0}else{self.range/self.speed.max(1e-6)};let sx=self.ox+vx*self.delay;let sy=self.oy+vy*self.delay;
        let ex=sx+angle.cos()*self.range+vx*horizon;let ey=sy+angle.sin()*self.range+vy*horizon;
        let t=if kind==1{body_segment(self.prepared,v.bodies,row,sx,sy,ex,ey,false)}else{let p=&v.projectiles[row];circle(sx,sy,ex,ey,p.x,p.y,p.radius+w.projectile_radius+w.proximity)};
        let Some(t)=t else{return false;};self.contact_time=horizon*t;self.contact_distance=self.range*t;true
    }
    fn solve(&mut self,v:&World<'_>,kind:u8,row:usize)->bool {
        let own=&v.bodies[self.own];let w=&v.weapons[self.m];let (x,y,vx,vy)=if kind==1{let b=&v.bodies[row];(b.x,b.y,b.vx-own.vx,b.vy-own.vy)}else{let p=&v.projectiles[row];(p.x,p.y,p.vx-own.vx,p.vy-own.vy)};
        let limit=self.range+self.radius(v,kind,row);let horizon=self.delay+if self.beam(v){0.0}else{limit/self.speed};let reach=limit+(vx.abs()+vy.abs())*horizon;let bound=(x-self.ox).abs().max((y-self.oy).abs());let pad=1e-6*1.0f64.max(x.abs()).max(y.abs()).max(self.ox.abs()).max(self.oy.abs()).max(reach.abs());
        if self.speed>0.0 && self.delay>=0.0 && limit>=0.0 && horizon>=0.0 && reach.is_finite() && bound>reach+pad{return false;}
        let px=x-self.ox+vx*self.delay;let py=y-self.oy+vy*self.delay;let time=if self.beam(v){Some(0.0)}else{intercept_time(px,py,vx,vy,self.speed)};let Some(time)=time else{return false;};
        self.solve_x=self.ox+px+vx*time;self.solve_y=self.oy+py+vy*time;if !self.solve_x.is_finite() || !self.solve_y.is_finite(){return false;}let dx=self.solve_x-self.ox;let dy=self.solve_y-self.oy;let distance=length(dx,dy);
        if distance>self.range+self.radius(v,kind,row){return false;}let free=self.guided(v) && (w.flags&weapon_flag::ALWAYS_FIRE!=0 || w.hints&(hint::DO_NOT_AIM|hint::GUIDED_POOR)!=0);
        if !free && w.arc_deg<360.0 && signed_angle(dy.atan2(dx)-w.base_angle).abs()>w.arc_rad/2.0+(self.radius(v,kind,row)/distance.max(1.0)).min(1.0).asin(){return false;}
        if !self.guided(v) && (!self.trace(v,kind,row,dy.atan2(dx)) || kind==2 && self.delay+self.contact_time>v.projectiles[row].flight_life){return false;}true
    }
    fn obstruction(&self,v:&World<'_>,angle:f64)->Option<Decision> {
        let own=&v.bodies[self.own];let w=&v.weapons[self.m];let travel_x=angle.cos()*self.contact_distance;let travel_y=angle.sin()*self.contact_distance;
        for (other,b) in v.bodies.iter().enumerate(){if v.scope[other]==0 || other==self.own || b.flags&(body_flag::DEAD|body_flag::PHASED)!=0 || b.team!=own.team || b.assembly_root==own.assembly_root && !b.no_fire_through || b.flags&body_flag::FIGHTER!=0 && w.pass_fighters{continue;}
            let vx=own.vx-b.vx;let vy=own.vy-b.vy;let sx=self.ox+vx*self.delay;let sy=self.oy+vy*self.delay;
            if body_segment(self.prepared,v.bodies,other,sx,sy,sx+travel_x+vx*self.contact_time,sy+travel_y+vy*self.contact_time,b.shield_void).is_some(){return Some(Decision::FriendlyBlocked);}}
        for rock in v.asteroids{if rock.hp<=0.0{continue;}let vx=own.vx-rock.vx;let vy=own.vy-rock.vy;let sx=self.ox+vx*self.delay;let sy=self.oy+vy*self.delay;
            if circle(sx,sy,sx+travel_x+vx*self.contact_time,sy+travel_y+vy*self.contact_time,rock.x,rock.y,rock.radius+w.projectile_radius).is_some(){return Some(Decision::ObstacleBlocked);}}None
    }
    fn impact(&self,v:&World<'_>,row:usize)->f64 {
        let p=&v.projectiles[row];let b=&v.bodies[self.own];let dx=p.x-b.x;let dy=p.y-b.y;let vx=p.vx-b.vx;let vy=p.vy-b.vy;let radius=b.radius.max(if b.shield_on{b.shield_radius}else{0.0})+p.radius;let distance=length(dx,dy);if distance<=radius{return 0.0;}let velocity=length(vx,vy);let horizon=if p.flight_life_present{p.flight_life}else if velocity>0.0{distance/velocity*2.0}else{0.0};
        if !(horizon>0.0){return f64::INFINITY;}circle(dx,dy,dx+vx*horizon,dy+vy*horizon,0.0,0.0,radius).map_or(f64::INFINITY,|t|horizon*t)
    }
    fn utility(&self,v:&World<'_>,row:usize,retained:bool,traverse:f64,arrival:f64)->f64 {
        let b=&v.bodies[row];let own=&v.bodies[self.own];let w=&v.weapons[self.m];let hp=(b.hp/b.max_hp.max(1.0)).max(0.0).min(1.0);let vulnerable=b.flags&(body_flag::OVERLOADED|body_flag::VENTING)!=0;
        let shield=shield_covered(b,self.ox,self.oy) && !vulnerable;let effectiveness=match w.damage_type {0=>if shield{2.0}else{0.5},1=>if shield{0.5}else{2.0},3=>if b.flags&body_flag::FIGHTER!=0{1.5}else{0.25},_=>1.0};
        effectiveness*0.65+if Some(row)==v.current(self.own){0.45}else{0.0}+if retained{0.22}else{0.0}
            +own.finish*((1.0-hp)*0.55+if vulnerable{0.55}else{0.0})+own.pressure*if shield{b.flux_percent.max(0.0).min(1.0)*0.35}else{0.0}
            -if shield && w.hints&hint::USE_LESS_VS_SHIELDS!=0{1.8}else{0.0}-if w.ammo.is_finite() && !(w.regen>0.0) && shield && w.damage_type==1{0.6}else{0.0}
            -PI.min(traverse.abs())*0.14-arrival.max(0.0).min(4.0)*0.06
    }
    fn scan(&mut self,v:&World<'_>,memory:&mut Memory,policy:Option<Policy>){
        self.candidates.clear();self.order.clear();let mut hulls=0;
        for row in 0..v.projectiles.len(){if v.missile_scope[row]!=0 && (self.pd(v) || v.projectiles[row].decoy) && self.eligible(v,2,Some(row)) && self.solve(v,2,row){self.candidates.push(Candidate {kind:2,row,x:self.solve_x,y:self.solve_y,priority:0.0,threat:0.0,utility:0.0,retained:false,traverse:0.0,tie:v.projectiles[row].tie});}}
        for row in 0..v.bodies.len(){if v.scope[row]!=0 && v.bodies[row].team!=v.bodies[self.own].team && self.eligible(v,1,Some(row)) && self.solve(v,1,row){hulls+=1;self.candidates.push(Candidate {kind:1,row,x:self.solve_x,y:self.solve_y,priority:0.0,threat:0.0,utility:0.0,retained:false,traverse:0.0,tie:v.bodies[row].tie});}}
        let autonomous=v.bodies[self.own].autonomous;let omit=v.adaptive_budget && autonomous && hulls<2 && v.native_budget;let pd=self.pd(v);
        for i in 0..self.candidates.len(){let c=&self.candidates[i];let kind=c.kind;let row=c.row;let retained=kind==self.target_kind && Some(row)==self.target_row;
            let traverse=signed_angle((c.y-self.oy).atan2(c.x-self.ox)-self.angle).abs();let arrival=self.delay+if self.beam(v){0.0}else{length(c.x-self.ox,c.y-self.oy)/self.speed.max(1.0)};
            let priority=if let Some(policy)=policy{if policy.priority==Priority::Suppress && kind==1 && v.bodies[row].flags&body_flag::FIGHTER==0 && Some(row)==v.current(self.own){-1.0}
                else if kind==2 && !v.projectiles[row].decoy && !v.projectiles[row].flare || kind==1 && v.bodies[row].flags&body_flag::FIGHTER!=0{0.0}else if kind==2{2.0}else{1.0}}
                else{let pd_first=pd && v.weapons[self.m].hints&(hint::PD_ALSO|hint::STRIKE)==0;if kind==2{if v.projectiles[row].decoy{2.0}else if pd_first{0.0}else{3.0}}else if autonomous || Some(row)==v.current(self.own){1.0}else{2.0}};
            let committed=if !omit && autonomous && !pd && kind==1 && v.budget_present && (!v.adaptive_budget || !v.native_budget || FireBudget::needs_detailed(v,self.own,row))
                && v.bodies[row].native_threat{FireBudget::penalty_prepared(v,self.own,row,arrival,self.prepared)}else{0.0};
            let threat=if kind==2{self.impact(v,row)}else{f64::INFINITY};let utility=if autonomous && kind==1{self.utility(v,row,retained,traverse,arrival)-committed}else{0.0};
            let c=&mut self.candidates[i];c.priority=priority;c.retained=retained;c.traverse=traverse;c.threat=threat;c.utility=utility;self.order.push(i);
        }
        let candidates=&self.candidates;
        // Stable sort keeps publication order if every comparison, including
        // the authored JS locale rank, is tied. Infinite threats tie exactly.
        self.order.sort_by(|&a,&b|{let a=&candidates[a];let b=&candidates[b];compare_js(a.priority-b.priority)
            .then_with(||if a.threat==b.threat{std::cmp::Ordering::Equal}else{compare_js(a.threat-b.threat)})
            .then_with(||compare_js(b.utility-a.utility)).then_with(||(if a.retained{0}else{1}).cmp(&(if b.retained{0}else{1})))
            .then_with(||compare_js(a.traverse-b.traverse)).then_with(||a.tie.cmp(&b.tie))});
        let mut chosen=self.order.first().copied();
        for i in 0..self.order.len(){let index=self.order[i];let c=&self.candidates[index];let kind=c.kind;let row=c.row;let x=c.x;let y=c.y;let angle=(y-self.oy).atan2(x-self.ox);
            let contact=if self.guided(v){self.contact_distance=length(x-self.ox,y-self.oy);self.contact_time=self.contact_distance/self.speed.max(1.0);true}else{self.trace(v,kind,row,angle)};
            if contact && self.obstruction(v,angle).is_none(){chosen=Some(index);break;}
        }
        self.target_kind=chosen.map_or(0,|i|self.candidates[i].kind);self.target_row=chosen.map(|i|self.candidates[i].row);self.has_point=chosen.is_some();if let Some(i)=chosen{self.point_x=self.candidates[i].x;self.point_y=self.candidates[i].y;}
        memory.scan_in=if chosen.is_some(){(0.5+memory.random.next()*0.5)*v.weapons[self.m].size_scale}else if self.cadence_mode==Some(CadenceMode::Multirate){if self.pd(v){1.0/30.0}else{0.1}}else{0.05+memory.random.next()*0.05};
        if self.cadence_mode==Some(CadenceMode::Multirate){if let Some(cadence)=&mut memory.cadence{cadence.scan_in=if self.pd(v){1.0/30.0}else{0.1};}}
    }
    fn pre_aim(&mut self,v:&World<'_>)->bool {
        let w=&v.weapons[self.m];if w.disabled || w.flags&weapon_flag::HARDPOINT!=0{return false;}let saved_range=self.range;self.range*=1.5;let mut found=false;let mut nearest=f64::INFINITY;
        if let Some(row)=v.current(self.own){if self.eligible(v,1,Some(row)) && self.solve(v,1,row){self.steer_x=self.solve_x;self.steer_y=self.solve_y;found=true;}}
        if !found{for row in 0..v.bodies.len(){let b=&v.bodies[row];if v.scope[row]==0 || b.team==v.bodies[self.own].team{continue;}let distance=length(b.x-self.ox,b.y-self.oy);
            if distance<nearest && self.eligible(v,1,Some(row)) && self.solve(v,1,row){self.steer_x=self.solve_x;self.steer_y=self.solve_y;found=true;nearest=distance;}}}self.range=saved_range;found
    }
    fn native_lead(&mut self,v:&World<'_>,memory:&Memory){
        if !self.has_point || self.beam(v) || self.guided(v){return;}let Some(row)=self.target_row else{return;};let own=&v.bodies[self.own];let w=&v.weapons[self.m];
        let (x,y,vx,vy,raw_radius)=if self.target_kind==1{let b=&v.bodies[row];(b.x,b.y,b.vx-own.vx,b.vy-own.vy,b.radius)}else{let p=&v.projectiles[row];(p.x,p.y,p.vx-own.vx,p.vy-own.vy,p.radius)};
        let dx=x-own.x;let dy=y-own.y;let distance=length(dx,dy);let closing=if distance>0.0{-(vx*dx+vy*dy)/distance}else{0.0};
        let accuracy=(2.0-own.accuracy.max(0.0).min(1.0)-memory.firing_time/15.0-w.accuracy_bonus).max(1.0);let range=(distance-(own.radius+raw_radius)*0.75).max(0.0);let mut speed=(closing+self.speed)*accuracy;if speed<=10.0{speed=20.0;}
        let mut time=range/speed;time=((range-closing*accuracy*time)/speed).max(0.0).min(10.0);let nx=x+vx*(time+self.delay);let ny=y+vy*(time+self.delay);
        if self.trace(v,self.target_kind,row,(ny-self.oy).atan2(nx-self.ox)){self.point_x=nx;self.point_y=ny;}
    }
    pub fn aim(&mut self,v:&World<'_>,memory:&mut Memory,policy:Option<Policy>,mode:Option<CadenceMode>,salt:u32)->Result<(),Error> {
        v.validate()?;self.aim_inner(v,memory,policy,mode,salt)
    }
    pub(crate) fn aim_validated(&mut self,v:&ValidatedWorld<'_,'_>,memory:&mut Memory,policy:Option<Policy>,mode:Option<CadenceMode>,salt:u32)->Result<(),Error> {
        self.aim_inner(v.world,memory,policy,mode,salt)
    }
    fn aim_inner(&mut self,v:&World<'_>,memory:&mut Memory,policy:Option<Policy>,mode:Option<CadenceMode>,salt:u32)->Result<(),Error> {
        self.cadence_mode=mode;let w=&v.weapons[self.m];let pd=self.pd(v);let selected=v.current(self.own);let key=policy.map(|p|PolicyKey {priority:p.priority,suspended:p.suspended,suppress_handle:if p.priority==Priority::Suppress{selected.map(|r|v.bodies[r].identity.handle)}else{None}});
        if memory.policy_key!=key{memory.policy_key=key;self.target_kind=0;self.target_row=None;memory.scan_in=0.0;}
        if policy.is_some_and(|p|p.suspended){self.target_kind=0;self.target_row=None;memory.target=Target::default();return Ok(());}
        if w.firing_state!=0 || w.burst_remaining>0.0 || w.cooldown>0.0{memory.firing_time+=self.dt;memory.idle_fire_time=0.0;}else{memory.idle_fire_time+=self.dt;if memory.idle_fire_time>3.0{memory.firing_time=0.0;}}
        memory.scan_in-=self.dt;
        if let Some(mode)=mode{let changed=memory.cadence.is_none_or(|c|c.mode!=mode || c.range!=w.base_range || c.speed!=w.base_speed || c.base!=w.authored_base_angle || c.arc!=w.arc_deg || c.rx!=w.relative_x || c.ry!=w.relative_y || c.pd!=pd);
            if changed{if memory.cadence.is_some(){self.target_kind=0;self.target_row=None;memory.scan_in=0.0;memory.firing_time=0.0;memory.idle_fire_time=0.0;memory.random=Random::new(salt);memory.ammo_allowed=true;}
                memory.cadence=Some(Cadence {mode,aim_in:0.0,scan_in:0.0,salt,x:0.0,y:0.0,point:false,range:w.base_range,speed:w.base_speed,base:w.authored_base_angle,arc:w.arc_deg,rx:w.relative_x,ry:w.relative_y,pd,initialized:false});}}
        else{if memory.cadence.is_some_and(|c|c.mode==CadenceMode::Multirate){let salt=memory.cadence.unwrap().salt;self.target_kind=0;self.target_row=None;memory.scan_in=0.0;memory.firing_time=0.0;memory.idle_fire_time=0.0;memory.random=Random::new(salt);memory.ammo_allowed=true;}memory.cadence=None;}
        if let Some(c)=&mut memory.cadence{c.aim_in-=self.dt;c.scan_in-=self.dt;}
        if self.target_kind!=0 && !self.eligible(v,self.target_kind,self.target_row){self.target_kind=0;self.target_row=None;memory.scan_in=0.0;memory.firing_time=0.0;memory.idle_fire_time=0.0;if let Some(c)=&mut memory.cadence{c.point=false;c.aim_in=0.0;}}
        if let Some(c)=memory.cadence{if c.aim_in>1e-9{self.has_point=self.target_kind!=0;self.point_x=c.x;self.point_y=c.y;self.has_steer=c.point;self.steer_x=c.x;self.steer_y=c.y;memory.target=self.target(v);return Ok(());}}
        let previous_kind=self.target_kind;let previous_row=self.target_row;
        if let Some(row)=self.target_row{if self.target_kind!=0 && self.solve(v,self.target_kind,row){self.has_point=true;self.point_x=self.solve_x;self.point_y=self.solve_y;}else if self.target_kind!=0{self.target_kind=0;self.target_row=None;memory.scan_in=0.0;}}
        let scan_eligible=memory.scan_in<=if mode==Some(CadenceMode::Multirate){1e-9}else{0.0} && (memory.cadence.is_none() || mode!=Some(CadenceMode::Multirate) || memory.cadence.unwrap().scan_in<=1e-9);
        if scan_eligible{self.scan(v,memory,policy);}if previous_kind!=self.target_kind || previous_row!=self.target_row{memory.firing_time=0.0;memory.idle_fire_time=0.0;}
        self.native_lead(v,memory);self.has_steer=self.has_point;if self.has_point{self.steer_x=self.point_x;self.steer_y=self.point_y;}else if memory.cadence.is_none() || mode!=Some(CadenceMode::Multirate) || scan_eligible{self.has_steer=self.pre_aim(v);}else if let Some(c)=memory.cadence{self.has_steer=c.point;self.steer_x=c.x;self.steer_y=c.y;}
        if let Some(c)=&mut memory.cadence{let first=!c.initialized;let period=if mode==Some(CadenceMode::Multirate) && pd{1.0/30.0}else{0.05};let mut delay=period-(-c.aim_in).max(0.0)%period;if delay<=1e-9{delay=period;}
            if first{delay=(1+salt%if mode==Some(CadenceMode::Multirate) && pd{2}else{3})as f64/60.0;if mode==Some(CadenceMode::Multirate) && scan_eligible && !pd{c.scan_in+= (salt%2)as f64*0.05;}}
            c.aim_in=if mode==Some(CadenceMode::Hz20) && !first{0.05}else{delay};c.point=self.has_steer;c.x=if self.has_steer{self.steer_x}else{0.0};c.y=if self.has_steer{self.steer_y}else{0.0};c.initialized=true;}
        memory.target=self.target(v);Ok(())
    }
    pub fn turn(&mut self,v:&World<'_>,point:Option<(f64,f64)>)->f64 {
        let w=&v.weapons[self.m];let b=&v.bodies[self.own];let base=w.base_angle;
        if w.flags&weapon_flag::HARDPOINT!=0 || w.turn_rate<=0.0{self.angle=base;}else if let Some((x,y))=point{self.idle=0.0;let angle=crate::canonical_math::atan2(y-self.pivot_y,x-self.pivot_x);let diff=signed_angle(angle-base);let desired=if w.arc_deg>=360.0 || diff.abs()<=w.arc_rad/2.0{angle}else{base+sign(diff)*w.arc_rad/2.0};self.angle=advance_turret(self.angle,base,desired,w.arc_deg,w.turn_rate,b.angular_velocity,self.dt);}
        else{self.idle+=self.dt;if self.idle>15.0{self.angle=advance_turret(self.angle,base,base,w.arc_deg,w.turn_rate,b.angular_velocity,self.dt);}}
        self.refresh_bore(w,self.angle);self.final_bore=true;self.angle
    }
    pub fn turn_automatic(&mut self,v:&World<'_>)->f64 {self.turn(v,if self.has_steer{Some((self.steer_x,self.steer_y))}else{None})}
    pub fn available(&self,v:&World<'_>)->bool {!v.weapons[self.m].disabled && v.bodies[self.own].flags&(body_flag::DEAD|body_flag::PHASED|body_flag::OVERLOADED|body_flag::VENTING)==0}
    pub fn decide(&mut self,v:&World<'_>,memory:&mut Memory,can_fire_weapon:bool,suspended:bool)->Result<Decision,Error> {
        if !self.final_bore{return Err(Error::PreTurnDecision);}let w=&v.weapons[self.m];let own=&v.bodies[self.own];if suspended{return Ok(Decision::Reassigning);}if !self.has_point || self.target_kind==0 || !self.eligible(v,self.target_kind,self.target_row){return Ok(Decision::NoTarget);}
        if !self.available(v) || !can_fire_weapon{return Ok(Decision::Unavailable);}if self.cadence_mode.is_some() && (!self.range.is_finite() || !self.speed.is_finite() || !self.delay.is_finite() || !self.angle.is_finite() || self.range<0.0 || self.speed<0.0 || !self.beam(v) && self.speed==0.0 || self.delay<0.0){return Ok(Decision::Unavailable);}
        if w.arc_deg<360.0 && signed_angle(self.angle-w.base_angle).abs()>w.arc_rad/2.0+1e-9{return Ok(Decision::Aligning);}let row=self.target_row.unwrap();
        if self.guided(v){let distance=length(self.point_x-self.ox,self.point_y-self.oy);let free=w.flags&weapon_flag::ALWAYS_FIRE!=0 || w.hints&(hint::DO_NOT_AIM|hint::GUIDED_POOR)!=0;let error=signed_angle((self.point_y-self.oy).atan2(self.point_x-self.ox)-self.angle).abs();
            if !free && error>(self.radius(v,self.target_kind,row)/distance.max(1.0)).min(1.0).asin(){return Ok(Decision::Aligning);}self.contact_distance=self.range.min(distance);self.contact_time=self.contact_distance/self.speed.max(1.0);}
        else if !self.trace(v,self.target_kind,row,self.angle){return Ok(Decision::Aligning);}
        if self.cadence_mode.is_some() && self.target_kind==2 && self.delay+self.contact_time>v.projectiles[row].flight_life{return Ok(Decision::NoTarget);}if let Some(decision)=self.obstruction(v,self.angle){return Ok(decision);}
        let active=w.burst_remaining>0.0 || w.firing_state==1 || w.firing_state==2;let committed=w.burst_remaining>0.0 || w.firing_state==1 || self.beam(v) && w.beam_burst && w.firing_state==2;
        if own.autonomous && own.flags&body_flag::HOLD_FIRE!=0 && !self.pd(v) && !committed{return Ok(Decision::DefensiveHold);}
        if !active{if w.ammo<1.0{return Ok(Decision::ConservingAmmo);}
            if w.hints&hint::USE_LESS_VS_SHIELDS!=0 && self.target_kind==1 && v.bodies[row].flags&body_flag::FIGHTER==0{
                if shield_covered(&v.bodies[row],self.ox,self.oy){if !w.ammo.is_finite() || !(w.regen>0.0){memory.ammo_allowed=false;}else{if w.ammo<=1.0 || w.ammo<=w.max_ammo*0.8{memory.ammo_allowed=false;}if w.ammo>=w.max_ammo{memory.ammo_allowed=true;}}}else{memory.ammo_allowed=true;}}
            else if !self.pd(v) && w.hints&hint::DO_NOT_CONSERVE==0 && w.ammo.is_finite() && w.regen>0.0{if w.ammo<=1.0{memory.ammo_allowed=false;}if w.ammo>=w.max_ammo*0.34 || w.ammo>=5.0 || w.max_ammo<12.0{memory.ammo_allowed=true;}}
            else{memory.ammo_allowed=true;}if !memory.ammo_allowed{return Ok(Decision::ConservingAmmo);}}
        Ok(Decision::Fire)
    }
}
fn compare_js(value:f64)->std::cmp::Ordering {if value<0.0{std::cmp::Ordering::Less}else if value>0.0{std::cmp::Ordering::Greater}else{std::cmp::Ordering::Equal}}

#[derive(Clone,Default)]
pub struct Group {pub rows:Vec<Option<usize>>,pub linked:bool,pub automatic:bool,pub index:i64,pub elapsed:f64,pub was_firing:bool,pub switched:bool,pub elapsed_present:bool,pub was_firing_present:bool,pub switched_present:bool}
pub struct Groups {pub active:Vec<u8>,pub automatic:Vec<u8>,pub manual:Vec<u8>,pub starts:Vec<Option<usize>>,groups:Vec<Group>,selected:Option<usize>,own:usize,dt:f64,manual_control:bool,can_fire:bool,alternating:Option<usize>}
fn group_index(g:&Group)->Option<usize> {if g.rows.is_empty(){None}else{Some(g.index.rem_euclid(g.rows.len()as i64)as usize)}}
fn usable(v:&World<'_>,row:Option<usize>)->bool {row.is_some_and(|r|!v.weapons[r].disabled && (!v.weapons[r].ammo.is_finite() || v.weapons[r].ammo>=1.0))}
fn next(v:&World<'_>,g:&Group,index:usize)->Option<usize> {for offset in 1..=g.rows.len(){let n=(index+offset)%g.rows.len();if usable(v,g.rows[n]){return Some(n);}}None}
fn slice(v:&World<'_>,row:usize,count:usize)->f64 {(v.weapons[row].cycle/count.max(1)as f64).max(1.0/240.0)}
impl Groups {
    pub fn new(v:&World<'_>,groups:&[Group],selected:Option<usize>,own:usize,dt:f64,manual_control:bool,can_fire:bool)->Result<Self,Error> {
        if own>=v.bodies.len(){return Err(Error::MissingOwner);}if groups.iter().any(|g|g.rows.iter().flatten().any(|&r|r>=v.weapons.len() || v.weapons[r].owner!=own)){return Err(Error::MissingMount);}
        let mut out=Self {active:vec![0;v.weapons.len()],automatic:vec![0;v.weapons.len()],manual:vec![0;v.weapons.len()],starts:vec![None;v.weapons.len()],groups:groups.to_vec(),selected,own,dt,manual_control,can_fire,alternating:None};
        for (i,g) in out.groups.iter().enumerate(){for &row in g.rows.iter().flatten(){if Some(i)==selected{out.active[row]=1;}if g.automatic{out.automatic[row]=1;}}}out.prepare_manual(v);Ok(out)
    }
    fn advance(v:&World<'_>,g:&mut Group,dt:f64){
        let Some(start)=group_index(g)else{return;};let mut index=start;let mut row=g.rows[index];let mut rotated=false;
        let finishing=row.is_some_and(|r|{let w=&v.weapons[r];!w.disabled && w.ammo<1.0 && g.was_firing && (w.cooldown>0.0 || w.burst_remaining>0.0 || w.firing_state!=0)});
        if !usable(v,row) && !finishing{let Some(n)=next(v,g,start)else{g.was_firing=true;g.switched=false;return;};index=n;row=g.rows[index];g.elapsed=0.0;rotated=true;}
        let Some(row)=row else{return;};let w=&v.weapons[row];if w.flags&weapon_flag::BEAM!=0 && !w.beam_burst{g.index=index as i64;g.elapsed=0.0;g.was_firing=true;g.switched=false;return;}
        let elapsed=g.elapsed+dt;if elapsed>slice(v,row,g.rows.len()){if let Some(n)=next(v,g,index){if n!=index{index=n;}}g.elapsed=0.0;rotated=true;}else{g.elapsed=elapsed;}
        g.index=index as i64;g.was_firing=true;g.switched=rotated;
    }
    fn prepare_manual(&mut self,v:&World<'_>){
        let Some(selected)=self.selected else{return;};let Some(g)=self.groups.get_mut(selected)else{return;};let b=&v.bodies[self.own];
        if self.manual_control && !g.linked{if b.main_trigger && self.can_fire{Self::advance(v,g,self.dt);}else{if g.was_firing && !g.switched{if let Some(index)=group_index(g){if let Some(n)=next(v,g,index){g.index=n as i64;}}}g.elapsed=0.0;g.was_firing=false;g.switched=false;}
            self.alternating=group_index(g).and_then(|i|g.rows[i]);if let Some(row)=self.alternating{self.manual[row]=1;}return;}
        let mut closest=None;let mut closest_distance=f64::INFINITY;let mut found=false;let cos=b.facing.cos();let sin=b.facing.sin();
        for &row in g.rows.iter().flatten(){let w=&v.weapons[row];let x=w.relative_x*cos-w.relative_y*sin+b.x;let y=w.relative_x*sin+w.relative_y*cos+b.y;let target=crate::canonical_math::atan2(b.aim_y-y,b.aim_x-x);let distance=(crate::canonical_math::signed(target-b.facing-w.authored_base_angle*PI/180.0).abs()-w.arc_deg*PI/360.0).max(0.0);
            if distance<=1e-9 || w.flags&weapon_flag::HARDPOINT!=0 || w.arc_deg<=10.0 || w.flags&weapon_flag::ALWAYS_FIRE!=0{self.manual[row]=1;found=true;}if distance<closest_distance{closest=Some(row);closest_distance=distance;}}
        if !found{if let Some(row)=closest{self.manual[row]=1;}}
    }
    pub fn manual_request(&self,v:&World<'_>,row:usize)->bool {
        let Some(g)=self.selected.and_then(|i|self.groups.get(i))else{return false;};let w=&v.weapons[row];if !v.bodies[self.own].main_trigger || !self.can_fire || w.cooldown>0.0{return false;}
        w.flags&weapon_flag::BEAM==0 && (w.firing_state==1 || w.burst_remaining>0.0) || self.manual[row]!=0 && (g.linked || Some(row)==self.alternating)
    }
    pub fn schedule_automatic(&mut self,v:&World<'_>,requests:&mut [u8])->Result<(),Error> {
        if requests.len()!=v.weapons.len(){return Err(Error::IncompleteWorld);}self.starts.fill(None);
        for (gi,g) in self.groups.iter_mut().enumerate(){if g.linked || self.manual_control && (Some(gi)==self.selected || !g.automatic){continue;}
            let Some(index)=group_index(g)else{continue;};let active=g.rows[index];let mut count=0;
            for &row in g.rows.iter().flatten(){let w=&v.weapons[row];if !w.disabled && (w.ammo>=1.0 || w.cooldown>0.0 || w.burst_remaining>0.0 || w.firing_state!=0){count+=1;}}
            let mut chosen=None;let mut waiting=false;if g.was_firing{g.elapsed+=self.dt;if let Some(row)=active{let w=&v.weapons[row];if w.flags&weapon_flag::BEAM!=0 && !w.beam_burst{if requests[row]!=0 && w.firing_state!=0{chosen=Some(row);}}else if g.elapsed+1e-9<slice(v,row,count){waiting=true;}}}
            if chosen.is_none() && !waiting{let was=g.was_firing as usize;for offset in was..g.rows.len()+was{if let Some(row)=g.rows[(index+offset)%g.rows.len()]{let w=&v.weapons[row];if requests[row]!=0 && !w.disabled && w.ammo>=1.0 && w.firing_state==0 && w.burst_remaining<=0.0 && w.cooldown<=0.0 && !(w.reload>0.0){chosen=Some(row);break;}}}}
            if let Some(row)=chosen{self.starts[row]=Some(gi);}for &row in g.rows.iter().flatten(){let w=&v.weapons[row];let committed=w.burst_remaining>0.0 || w.firing_state==1 || w.flags&weapon_flag::BEAM!=0 && w.beam_burst && w.firing_state==2;if Some(row)!=chosen && !committed{requests[row]=0;}}
        }Ok(())
    }
    pub fn writeback(&self,groups:&mut [Group])->Result<(),Error> {
        if groups.len()!=self.groups.len(){return Err(Error::IncompleteWorld);}for (i,(g,out)) in self.groups.iter().zip(groups.iter_mut()).enumerate(){if g.linked || self.manual_control && Some(i)!=self.selected && !g.automatic{continue;}write_group(g,out);}Ok(())
    }
    pub fn writeback_manual(&self,groups:&mut [Group])->Result<(),Error> {
        if groups.len()!=self.groups.len(){return Err(Error::IncompleteWorld);}if let Some(index)=self.selected{if let Some(g)=self.groups.get(index){if self.manual_control && !g.linked{write_group(g,&mut groups[index]);}}}Ok(())
    }
    /// Call after a real successful cycle start only. Query choice is advisory.
    pub fn record_success(&self,groups:&mut [Group],row:usize)->Result<(),Error> {
        let Some(&group)=self.starts.get(row)else{return Err(Error::MissingMount);};let Some(group)=group else{return Ok(());};let Some(g)=groups.get_mut(group)else{return Err(Error::IncompleteWorld);};let Some(index)=g.rows.iter().position(|r|*r==Some(row))else{return Err(Error::MissingMount);};
        g.index=index as i64;g.elapsed=0.0;g.was_firing=true;g.switched=true;g.elapsed_present=true;g.was_firing_present=true;g.switched_present=true;Ok(())
    }
}
fn write_group(g:&Group,out:&mut Group){out.index=g.index;out.elapsed=g.elapsed;out.was_firing=g.was_firing;out.switched=g.switched;out.elapsed_present=true;out.was_firing_present=true;out.switched_present=true;}
