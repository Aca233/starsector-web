//! Current Web numeric tactical AI over a borrowed resident-world lease.
//! See docs/rust-combat-tactical-ai-plan-2026-10-08.md for source and limits.
use std::f64::consts::PI;
pub mod body_flag{pub const DEAD:u32=1;pub const COLLISIONLESS:u32=2;pub const RETREATED:u32=4;pub const DOCKED:u32=8;pub const FIGHTER:u32=16;pub const PHASED:u32=32;pub const OVERLOADED:u32=64;pub const VENTING:u32=128;pub const WEAPONS_BLOCKED:u32=256;pub const MANUAL:u32=2048;}
pub mod weapon_flag{pub const PD:u32=2;pub const BEAM:u32=8;pub const MISSILE:u32=32;}
#[derive(Clone,Copy,Debug,Default,PartialEq,Eq)]pub struct Identity{pub handle:u32,pub generation:u32}
#[derive(Clone,Copy,Debug,Default,PartialEq,Eq)]pub enum Role{#[default]Line,Brawler,Artillery,Skirmisher,Carrier,Unarmed}
#[derive(Clone,Copy,Debug,Default,PartialEq,Eq)]pub enum Task{#[default]Pressure,Finish,Screen,Support,Regroup,Disengage,Search}
#[derive(Clone,Copy,Debug,PartialEq,Eq)]pub enum OrderKind{Engage,Avoid,Defend,Escort,Waypoint}
#[derive(Clone,Copy,Debug)]pub struct Order{pub owner:Option<Identity>,pub kind:OrderKind,pub target:Option<Identity>,pub point:Option<[f64;2]>}
#[derive(Clone,Debug,Default)]pub struct Body{
    pub identity:Identity,pub parent:Option<Identity>,pub id:String,pub locale_rank:u32,pub team:f64,pub flags:u32,pub x:f64,pub y:f64,pub vx:f64,pub vy:f64,pub facing:f64,
    pub radius:f64,pub hp:f64,pub max_hp:f64,pub flux:f64,pub size:u8,pub max_speed:f64,pub max_turn_rate:f64,pub acceleration:f64,pub deceleration:f64,
    pub spec_speed:f64,pub spec_armor:f64,pub wing_power:f64,pub carrier_range:f64,pub strafe_multiplier:f64,pub shield_radius:f64,
    pub shield_raw_active:bool,pub shield_void:bool,pub shield_phased:bool,pub system_phased:bool,pub system_locks_turning:bool,
    pub vast:bool,pub retreating:bool,pub system_drone:bool,pub player:bool,pub manual:bool,pub do_not_back_off:bool,
    pub current_target:Option<Identity>,pub previous_task:Option<Task>,pub training_action:i32,pub weapon_first:usize,pub weapon_count:usize,
}
#[derive(Clone,Copy,Debug,Default)]pub struct Weapon{
    pub owner:Identity,pub locale_rank:u32,pub disabled:bool,pub ammo:f64,pub dps:f64,pub flags:u32,pub hints:u32,
    pub effective_range:f64,pub speed:f64,pub muzzle_x:f64,pub muzzle_y:f64,pub relative_x:f64,pub relative_y:f64,
    pub local_base_angle:f64,pub angle:f64,pub authored_half_arc:f64,pub fixed:bool,pub profile_delay:f64,pub position_turn_rate:f64,
}
#[derive(Clone,Copy,Debug,Default)]pub struct Asteroid{pub x:f64,pub y:f64,pub vx:f64,pub vy:f64,pub radius:f64}
#[derive(Clone,Copy,Debug,PartialEq,Eq)]pub enum Error{InvalidIdentity,DuplicateIdentity,InvalidNumber,InvalidTopology,IncompleteVisibility,StaleIdentity,InvalidPolicy}
#[derive(Clone,Copy)]
pub struct World<'a>{pub bodies:&'a[Body],pub weapons:&'a[Weapon],pub asteroids:&'a[Asteroid],pub teams:&'a[f64],pub visibility:&'a[u8]}
impl World<'_>{
    pub fn find(&self,id:Identity)->Option<usize>{self.bodies.iter().position(|b|b.identity==id)}
    pub fn visible(&self,row:usize,observer:usize)->bool{self.teams.iter().position(|t|*t==self.bodies[observer].team).is_some_and(|t|self.visibility[row*self.teams.len()+t]!=0)}
    fn visible_to(&self,row:usize,team:f64)->bool{self.teams.iter().position(|t|*t==team).is_some_and(|t|self.visibility[row*self.teams.len()+t]!=0)}
    pub fn validate(&self)->Result<(),Error>{
        if self.visibility.len()!=self.bodies.len()*self.teams.len()||self.bodies.iter().any(|b|!self.teams.contains(&b.team))||self.teams.iter().enumerate().any(|(i,t)|!t.is_finite()||self.teams[..i].contains(t)){return Err(Error::IncompleteVisibility);}
        // This call owns the immutable observation. Preserve the first-row
        // lookup and every validation, avoiding a roster scan per reference.
        let mut rows=std::collections::BTreeMap::new();
        for(i,b)in self.bodies.iter().enumerate(){rows.entry((b.identity.handle,b.identity.generation)).or_insert(i);}
        let find=|id:Identity|rows.get(&(id.handle,id.generation)).copied();
        let mut handles=std::collections::BTreeSet::new();let mut names=std::collections::BTreeSet::new();
        for(i,b)in self.bodies.iter().enumerate(){
            if b.identity.handle==0||b.identity.generation==0||b.id.is_empty(){return Err(Error::InvalidIdentity);}
            if !handles.insert(b.identity.handle)||!names.insert(b.id.as_str()){return Err(Error::DuplicateIdentity);}
            // Resident zero-capacity hulls have the actual FluxTracker 0/0 NaN.
            // Retain its false ordered-comparison predicates instead of clamping.
            if b.flux.is_infinite()||![b.team,b.x,b.y,b.vx,b.vy,b.facing,b.radius,b.hp,b.max_hp,b.max_speed,b.max_turn_rate,b.acceleration,b.deceleration,b.spec_speed,b.spec_armor,b.wing_power,b.carrier_range,b.strafe_multiplier,b.shield_radius].iter().all(|n|n.is_finite()){return Err(Error::InvalidNumber);}
            if b.size>4||b.weapon_first.checked_add(b.weapon_count).is_none_or(|end|end>self.weapons.len()){return Err(Error::InvalidTopology);}
            if b.current_target.is_some_and(|id|find(id).is_none()){return Err(Error::StaleIdentity);}
            let mut parent=b.parent;let mut depth=0;while let Some(id)=parent{let row=find(id).ok_or(Error::StaleIdentity)?;
                if row==i||depth>=self.bodies.len(){return Err(Error::InvalidTopology);}parent=self.bodies[row].parent;depth+=1;}
            for m in &self.weapons[b.weapon_first..b.weapon_first+b.weapon_count]{if m.owner!=b.identity{return Err(Error::InvalidTopology);}}
        }
        let mut coverage=vec![0usize;self.weapons.len()];
        for b in self.bodies{for count in &mut coverage[b.weapon_first..b.weapon_first+b.weapon_count]{*count+=1;}}
        for(i,m)in self.weapons.iter().enumerate(){
            if find(m.owner).is_none()||coverage[i]!=1{return Err(Error::InvalidTopology);}
            if m.ammo.is_nan()||m.ammo==f64::NEG_INFINITY||![m.dps,m.effective_range,m.speed,m.muzzle_x,m.muzzle_y,m.relative_x,m.relative_y,m.local_base_angle,m.angle,m.authored_half_arc,m.profile_delay,m.position_turn_rate].iter().all(|n|n.is_finite()){return Err(Error::InvalidNumber);}
        }
        if self.asteroids.iter().any(|a|![a.x,a.y,a.vx,a.vy,a.radius].iter().all(|n|n.is_finite())){return Err(Error::InvalidNumber);}Ok(())
    }
    fn row(&self,id:Identity)->Result<usize,Error>{self.find(id).ok_or(Error::StaleIdentity)}
}
fn min(a:f64,b:f64)->f64{if a.is_nan()||b.is_nan(){f64::NAN}else{a.min(b)}}
fn max(a:f64,b:f64)->f64{if a.is_nan()||b.is_nan(){f64::NAN}else{a.max(b)}}
fn clamp(x:f64,lo:f64,hi:f64)->f64{max(lo,min(hi,x))}
pub fn length(x:f64,y:f64)->f64{let a=x.abs();let b=y.abs();if a==f64::INFINITY||b==f64::INFINITY{return f64::INFINITY;}let largest=if a>b{a}else{b};if largest==0.0&&a==0.0{return 0.0;}let ratio=if a>b{b/largest}else{a/largest};(1.0+ratio*ratio).sqrt()*largest}
fn signed(a:f64)->f64{a.sin().atan2(a.cos())}
fn same_number(a:f64,b:f64)->bool{a.to_bits()==b.to_bits()||a.is_nan()&&b.is_nan()}
fn compare_id(a:&str,b:&str)->std::cmp::Ordering{a.encode_utf16().cmp(b.encode_utf16())}
fn distance(a:&Body,b:&Body)->f64{length(a.x-b.x,a.y-b.y)}
pub fn hostile(world:&World<'_>,observer:Identity,ordered:Option<Identity>)->Result<Option<Identity>,Error>{
    world.validate()?;hostile_at_barrier(world,observer,ordered)
}
pub(crate) fn hostile_at_barrier(world:&World<'_>,observer:Identity,ordered:Option<Identity>)->Result<Option<Identity>,Error>{
    let r=world.row(observer)?;
    let eligible=|i:usize|{let b=&world.bodies[i];!b.vast&&b.flags&body_flag::DEAD==0&&world.visible(i,r)&&b.team!=world.bodies[r].team};
    if let Some(target)=ordered{let i=world.row(target)?;if eligible(i){return Ok(Some(target));}}
    if let Some(target)=world.bodies[r].current_target{let i=world.row(target)?;if eligible(i){return Ok(Some(target));}}
    let mut main=None;let mut any=None;let mut main_distance=0.0;let mut any_distance=0.0;
    for(i,b)in world.bodies.iter().enumerate(){if !eligible(i){continue;}let d=distance(&world.bodies[r],b);
        if any.is_none()||d<any_distance{any=Some(b.identity);any_distance=d;}
        if b.flags&body_flag::FIGHTER==0&&(main.is_none()||d<main_distance){main=Some(b.identity);main_distance=d;}
    }Ok(main.or(any))
}
/// Source assemblyShips is depth-first even through a dead parent; only the
/// finished combatParts list applies alive/retreated/docked/HP predicates.
fn assembly_rows(world:&World<'_>,row:usize,out:&mut Vec<usize>){out.push(row);let own=world.bodies[row].identity;
    for i in 0..world.bodies.len(){if world.bodies[i].parent==Some(own){assembly_rows(world,i,out);}}}
fn combat_parts(world:&World<'_>,row:usize)->Vec<usize>{let mut parts=Vec::new();if world.bodies[row].parent.is_some(){parts.push(row);}else{assembly_rows(world,row,&mut parts);}
    parts.retain(|&i|{let b=&world.bodies[i];b.flags&(body_flag::DEAD|body_flag::RETREATED|body_flag::DOCKED)==0&&b.hp>0.0});parts}
fn available_rows(world:&World<'_>,row:usize)->Vec<usize>{combat_parts(world,row).into_iter().flat_map(|i|{let b=&world.bodies[i];b.weapon_first..b.weapon_first+b.weapon_count})
    .filter(|&m|{let w=&world.weapons[m];!w.disabled&&w.ammo>=1.0&&w.dps>0.0}).collect()}
fn assembly_root(world:&World<'_>,mut row:usize)->usize{while let Some(id)=world.bodies[row].parent{row=world.find(id).expect("validated assembly parent");}row}
fn relative_position(world:&World<'_>,row:usize,m:usize)->[f64;2]{let w=&world.weapons[m];let owner=&world.bodies[world.find(w.owner).expect("validated weapon owner")];let root=&world.bodies[row];
    if owner.identity==root.identity{return [w.relative_x,w.relative_y];}
    let c=owner.facing.cos();let s=owner.facing.sin();let mut x=w.relative_x*c-w.relative_y*s;let mut y=w.relative_x*s+w.relative_y*c;
    x+=owner.x;y+=owner.y;x-=root.x;y-=root.y;let c=(-root.facing).cos();let s=(-root.facing).sin();[x*c-y*s,x*s+y*c]}
pub fn battery_rows(world:&World<'_>,row:usize,sustained:bool)->Vec<usize>{
    let available=available_rows(world,row);
    let offense:Vec<_>=available.iter().copied().filter(|&m|world.weapons[m].flags&weapon_flag::PD==0).collect();
    let steady:Vec<_>=if sustained{offense.iter().copied().filter(|&m|world.weapons[m].flags&weapon_flag::MISSILE==0&&world.weapons[m].hints&8==0).collect()}else{Vec::new()};
    if !steady.is_empty(){steady}else if !offense.is_empty(){offense}else{available}
}
#[derive(Clone,Copy,Debug)]pub struct Assignment{pub owner:Identity,pub target:Option<Identity>,pub role:Role,pub task:Task,pub score:f64,pub pressure_ratio:f64,pub assigned_power:f64,pub carrier_range:f64,pub anchor:Option<Identity>,pub approach_bearing:Option<f64>}
fn opportunity(a:&Body,b:&Body,pressure:f64)->bool{
    if a.flux>0.7||a.hp/max(1.0,a.max_hp)<0.25||pressure>2.5||b.flags&body_flag::COLLISIONLESS!=0{return false;}
    b.flags&(body_flag::OVERLOADED|body_flag::VENTING)!=0||b.hp/max(1.0,b.max_hp)<0.3||b.flux>=0.75&&b.flux-a.flux>=0.2
}
#[derive(Clone,Copy,Debug)]pub struct PolicyRow{pub state:u16,pub q:[f64;4],pub visits:[u32;4]}
#[derive(Clone,Debug)]pub struct Policy{pub enabled:bool,pub min_visits:u32,pub min_advantage:f64,pub rows:Vec<PolicyRow>}
impl Default for Policy{fn default()->Self{Self{enabled:false,min_visits:8,min_advantage:0.03,rows:Vec::new()}}}
impl Policy{
    pub fn validate(&self)->Result<(),Error>{if !(8..=1_000_000_000).contains(&self.min_visits)||!self.min_advantage.is_finite()||!(0.03..=100.0).contains(&self.min_advantage)
        ||self.rows.iter().enumerate().any(|(i,r)|r.state>=324||self.rows[..i].iter().any(|prior|prior.state==r.state)||r.q.iter().any(|q|!q.is_finite()||q.abs()>1000.0)||r.visits.iter().any(|&n|n>1_000_000_000)){return Err(Error::InvalidPolicy);}Ok(())}
    pub fn action(&self,state:u16)->u8{if !self.enabled{return 0;}let Some(row)=self.rows.iter().find(|r|r.state==state)else{return 0;};if row.visits[0]<self.min_visits{return 0;}let mut best=0;
        for i in 1..4{if row.visits[i]>=self.min_visits&&row.q[i]>row.q[best]+1e-9{best=i;}}if best!=0&&row.q[best]-row.q[0]>=self.min_advantage{best as u8}else{0}}
}
fn learning_range(world:&World<'_>,r:usize,t:usize,policy:&Policy)->f64{
    let a=&world.bodies[r];let b=&world.bodies[t];const RANGES:[f64;4]=[1.0,0.9,0.94,1.12];
    if a.flags&body_flag::MANUAL!=0{return 1.0;}if a.training_action>=0{return RANGES.get(a.training_action as usize).copied().unwrap_or(1.0);}
    if !policy.enabled||a.max_hp<=0.0||b.max_hp<=0.0{return 1.0;}
    let mut friends=0.0;let mut enemies=0.0;
    for(i,u)in world.bodies.iter().enumerate(){if u.flags&(body_flag::DEAD|body_flag::RETREATED|body_flag::DOCKED)!=0||!world.visible(i,r){continue;}
        let weight=[0.0,1.0,2.0,4.0,8.0][u.size as usize];let ratio=u.hp/u.max_hp;if weight==0.0||!ratio.is_finite(){continue;}
        let influence=weight*max(0.2,min(1.0,ratio))/(1.0+distance(a,u)/1000.0);if u.team==a.team{friends+=influence;}else{enemies+=influence;}
    }
    let flux=if a.flux>=0.75{2}else if a.flux>=0.45{1}else{0};let hull=if a.hp/a.max_hp<0.4{1}else{0};
    let window=if b.flags&(body_flag::OVERLOADED|body_flag::VENTING)!=0{2}else if b.flux>=0.7{1}else{0};let speed=a.spec_speed/max(1.0,b.spec_speed);
    let mobility=if speed<0.8{0}else if speed>1.25{2}else{1};let weak=if b.hp/b.max_hp<0.4{1}else{0};let ratio=enemies/max(0.1,friends);let pressure=if ratio<0.65{0}else if ratio>1.35{2}else{1};
    RANGES[policy.action(((((flux*2+hull)*3+window)*3+mobility)*2+weak)*3+pressure)as usize]
}
pub fn engagement_range(world:&World<'_>,r:usize,t:usize,gun_range:f64,assignment:Option<&Assignment>,policy:&Policy)->f64{
    let a=&world.bodies[r];let b=&world.bodies[t];let clearance=a.radius+b.radius+8.0;
    if assignment.is_some_and(|p|p.role==Role::Carrier){return max(clearance,assignment.unwrap().carrier_range);}
    let role=assignment.map(|p|p.role);let pressure=match role{Some(Role::Brawler)=>0.70,Some(Role::Skirmisher)=>0.80,Some(Role::Artillery)=>0.92,_=>0.84};
    let reserve=max(clamp((a.flux-0.65)/0.25,0.0,1.0),clamp((0.4-a.hp/max(1.0,a.max_hp))/0.25,0.0,1.0));
    let fraction=(pressure+(1.0-pressure)*reserve)*if opportunity(a,b,assignment.map_or(1.0,|p|p.pressure_ratio)){0.72}else{1.0};
    let mut residual=learning_range(world,r,t,policy);if reserve>0.4||role==Some(Role::Artillery){residual=max(1.0,residual);}
    clearance+max(0.0,gun_range-clearance)*min(1.12,fraction*residual)
}
fn intercept(px:f64,py:f64,vx:f64,vy:f64,speed:f64)->Option<f64>{
    if !(speed>0.0)||!speed.is_finite(){return None;}let c=px*px+py*py;if c<1e-12{return Some(0.0);}let vv=vx*vx+vy*vy;let a=vv-speed*speed;let b=2.0*(px*vx+py*vy);
    if a.abs()<=1e-10*max(max(speed*speed,vv),1.0){return if b< -1e-10{Some(-c/b)}else{None};}let d=b*b-4.0*a*c;if d<0.0{return None;}
    let q= -0.5*(b+if b>=0.0{1.0}else{-1.0}*d.sqrt());let first=q/a;let second=if q==0.0{f64::INFINITY}else{c/q};
    let f=first>=0.0&&first.is_finite();let s=second>=0.0&&second.is_finite();if f{Some(if s{min(first,second)}else{first})}else if s{Some(second)}else{None}
}
#[derive(Clone,Copy,Debug,Default)]pub struct Profile{pub range:f64,pub relative_bearing:f64,pub firepower:f64,pub weapons:usize}
#[derive(Clone,Copy)]struct Arc{m:usize,position:[f64;2],weight:f64,base:f64,half:f64}
pub fn profile(world:&World<'_>,observer:Identity,target:Option<Identity>,assignment:Option<&Assignment>,policy:&Policy)->Result<Profile,Error>{
    world.validate()?;policy.validate()?;profile_at_barrier(world,observer,target,assignment,policy)
}
pub(crate) fn profile_at_barrier(world:&World<'_>,observer:Identity,target:Option<Identity>,assignment:Option<&Assignment>,policy:&Policy)->Result<Profile,Error>{
    let r=world.row(observer)?;let Some(target)=target else{return Ok(Profile::default());};let t=world.row(target)?;
    let a=&world.bodies[r];let b=&world.bodies[t];let mounts=battery_rows(world,r,true);let radius=b.radius;let distance=max(1.0,distance(a,b));let heading=crate::canonical_math::atan2(b.y-a.y,b.x-a.x);let current=signed(heading-a.facing);
    if mounts.is_empty(){return Ok(Profile{relative_bearing:current,range:engagement_range(world,r,t,a.radius+radius+8.0,assignment,policy),firepower:0.0,weapons:0});}
    let arcs:Vec<Arc>=mounts.iter().map(|&m|{let w=&world.weapons[m];let owner=&world.bodies[world.find(w.owner).expect("validated weapon owner")];let mut x=b.x;let mut y=b.y;
        if distance<=w.effective_range*1.5+a.radius+radius{let vx=b.vx-owner.vx;let vy=b.vy-owner.vy;let px=x-w.muzzle_x+vx*w.profile_delay;let py=y-w.muzzle_y+vy*w.profile_delay;
            let time=if w.flags&weapon_flag::BEAM!=0{Some(0.0)}else{intercept(px,py,vx,vy,w.speed)};if let Some(time)=time{let ix=w.muzzle_x+px+vx*time;let iy=w.muzzle_y+py+vy*time;if ix.is_finite()&&iy.is_finite(){x=ix;y=iy;}}}
        Arc{m,position:relative_position(world,r,m),weight:w.dps,base:signed(w.local_base_angle+(owner.facing-a.facing)-signed(crate::canonical_math::atan2(y-w.muzzle_y,x-w.muzzle_x)-heading)),half:if w.fixed{0.0}else{min(PI,w.authored_half_arc)}}}).collect();
    let mut boundaries:Vec<f64>=arcs.iter().flat_map(|a|[signed(a.base-a.half),signed(a.base+a.half)]).collect();boundaries.sort_by(|a,b|a.partial_cmp(b).unwrap());
    let mut bearings=vec![current,0.0];bearings.extend(arcs.iter().map(|a|a.base));bearings.extend(&boundaries);
    for i in 0..boundaries.len(){bearings.push(signed((boundaries[i]+if i+1<boundaries.len(){boundaries[i+1]}else{boundaries[0]+PI*2.0})/2.0));}
    let mut best=current;let mut power= -1.0;let mut alignment=f64::INFINITY;let mut previous=None;
    for bearing in bearings{if previous.is_some_and(|p|same_number(bearing,p)){continue;}previous=Some(bearing);let mut score=0.0;let mut offset=0.0;
        for arc in &arcs{let error=signed(bearing-arc.base).abs();if error<=arc.half+1e-8{score+=arc.weight;offset+=arc.weight*error;}}
        if score>power+1e-6||(score-power).abs()<1e-6&&(offset<alignment-1e-6||(offset-alignment).abs()<1e-6&&signed(bearing-current).abs()<signed(best-current).abs()){best=bearing;power=score;alignment=offset;}
    }
    let useful:Vec<_>=arcs.iter().filter(|arc|signed(best-arc.base).abs()<=arc.half+1e-8).collect();
    let mut ranges:Vec<_>=useful.iter().map(|arc|{let w=&world.weapons[arc.m];(arc.weight,w.effective_range*0.9+arc.position[0]*best.cos()+arc.position[1]*best.sin()+radius)}).collect();ranges.sort_by(|a,b|a.1.partial_cmp(&b.1).unwrap());
    let mut accumulated=0.0;let mut range=ranges.last().map_or(distance,|entry|entry.1);for(entry_weight,entry_range)in ranges{accumulated+=entry_weight;if accumulated>=power*0.5{range=entry_range;break;}}
    range=max(a.radius+radius+8.0,range);Ok(Profile{relative_bearing:signed(best),range:engagement_range(world,r,t,range,assignment,policy),firepower:power,weapons:useful.len()})
}

#[derive(Clone,Copy)]struct Unit{row:usize,role:Role,range:f64,carrier:f64,speed:f64,hull:f64,power:f64,major:bool}
#[derive(Default)]pub struct FleetScratch{units:Vec<Unit>,distances:Vec<f64>,pressures:Vec<f64>}
impl FleetScratch{pub fn new()->Self{Self::default()}}
fn order_for<'a>(orders:&'a[Order],body:&Body)->Option<&'a Order>{orders.iter().find(|o|o.owner==Some(body.identity)).or_else(||if body.player{orders.iter().find(|o|o.owner.is_none())}else{None})}
pub fn fleet(world:&World<'_>,orders:&[Order],out:&mut Vec<Assignment>,scratch:&mut FleetScratch)->Result<(),Error>{
    world.validate()?;
    for(i,order)in orders.iter().enumerate(){if order.owner.is_some_and(|id|world.find(id).is_none())||order.target.is_some_and(|id|world.find(id).is_none()){return Err(Error::StaleIdentity);}
        if orders[..i].iter().any(|o|o.owner==order.owner)||order.point.is_some_and(|p|!p.iter().all(|n|n.is_finite())){return Err(Error::InvalidTopology);}}
    scratch.units.clear();
    for(r,b)in world.bodies.iter().enumerate(){if b.parent.is_some()||b.flags&(body_flag::DEAD|body_flag::RETREATED|body_flag::DOCKED)!=0||b.hp<=0.0||b.vast{continue;}
        let battery=battery_rows(world,r,true);let available=available_rows(world,r);
        let offensive:Vec<_>=available.into_iter().filter(|&m|world.weapons[m].flags&weapon_flag::PD==0).collect();
        let mut ranges:Vec<_>=battery.iter().map(|&m|(world.weapons[m].effective_range,world.weapons[m].dps)).collect();ranges.sort_by(|a,b|a.0.partial_cmp(&b.0).unwrap());
        let battery_power=ranges.iter().fold(0.0,|sum,m|sum+m.1);let offense=offensive.iter().fold(0.0,|sum,&m|sum+world.weapons[m].dps);
        let mut cumulative=0.0;let mut range=0.0;for &(reach,power)in &ranges{cumulative+=power;range=reach;if cumulative>=battery_power/2.0{break;}}
        let mut wing_power=0.0;let mut carrier_range=f64::INFINITY;for i in combat_parts(world,r){let p=&world.bodies[i];wing_power+=p.wing_power;if p.wing_power>0.0{carrier_range=min(carrier_range,p.carrier_range);}}
        if wing_power==0.0{carrier_range=0.0;}
        let role=if carrier_range>0.0&&offense<wing_power*1.25{Role::Carrier}else if battery.is_empty(){Role::Unarmed}else if range>=1000.0{Role::Artillery}else if b.max_speed>=120.0{Role::Skirmisher}else if range<=650.0{Role::Brawler}else{Role::Line};
        let availability=if b.retreating||b.flags&(body_flag::OVERLOADED|body_flag::VENTING)!=0{0.15}else{1.0-clamp(b.flux,0.0,1.0)*0.6};
        scratch.units.push(Unit{row:r,role,range:if role==Role::Carrier{carrier_range}else{range},carrier:carrier_range,speed:b.max_speed,hull:clamp(b.hp/max(1.0,b.max_hp),0.0,1.0),
            power:(offense+if offensive.is_empty(){battery_power*0.3}else{0.0}+wing_power)*availability,major:b.flags&body_flag::FIGHTER==0&&!b.system_drone});
    }
    let units=&scratch.units;let n=units.len();scratch.distances.clear();scratch.distances.resize(n*n,0.0);scratch.pressures.clear();scratch.pressures.resize(n*n,0.0);
    for i in 0..n{for j in 0..n{let high=max(i as f64,j as f64)as usize;let low=min(i as f64,j as f64)as usize;let a=&world.bodies[units[high].row];let b=&world.bodies[units[low].row];scratch.distances[i*n+j]=if i==j{0.0}else{distance(a,b)};}}
    for i in 0..n{for j in 0..n{let at=&world.bodies[units[i].row];let u=&world.bodies[units[j].row];let reach=max(200.0,units[j].range)+u.radius+at.radius;let gap=max(0.0,scratch.distances[i*n+j]-reach);scratch.pressures[i*n+j]=units[j].power/(1.0+gap/max(100.0,units[j].speed*4.0));}}
    let distance=|a:usize,b:usize|scratch.distances[a*n+b];let actors:Vec<_>=(0..n).filter(|&i|units[i].major&&!world.bodies[units[i].row].retreating).collect();
    let mut teams=Vec::new();for &u in &actors{let team=world.bodies[units[u].row].team;if !teams.contains(&team){teams.push(team);}}out.clear();
    for team in teams{
        let friends:Vec<_>=actors.iter().copied().filter(|&i|world.bodies[units[i].row].team==team).collect();let enemies:Vec<_>=(0..n).filter(|&i|world.bodies[units[i].row].team!=team&&world.visible_to(units[i].row,team)).collect();
        let major:Vec<_>=enemies.iter().copied().filter(|&i|units[i].major).collect();let candidates=if major.is_empty(){&enemies}else{&major};
        let influence=|at:usize,group:&[usize]|group.iter().fold(0.0,|sum,&i|sum+scratch.pressures[at*n+i]);
        let danger=|at:usize|influence(at,&enemies)/max(1.0,influence(at,&friends));let mut claims=vec![0.0;n];let mut previous=vec![None;n];
        let can_contribute=|u:usize,target:usize|distance(u,target)<=units[u].range+world.bodies[units[target].row].radius+world.bodies[units[u].row].radius+units[u].speed*6.0;
        for &u in &friends{let ship=&world.bodies[units[u].row];let order=order_for(orders,ship);let target=if order.is_some_and(|o|o.kind==OrderKind::Engage){order.unwrap().target}else{ship.current_target};
            if let Some(target)=target.and_then(|id|units.iter().position(|e|world.bodies[e.row].identity==id)){if world.bodies[units[target].row].team!=team&&world.visible_to(units[target].row,team)&&can_contribute(u,target){claims[target]=max(0.0,claims[target]+units[u].power);previous[u]=Some(target);}}
        }
        let mut autonomous:Vec<_>=friends.iter().copied().filter(|&u|!world.bodies[units[u].row].manual).collect();autonomous.sort_by(|&a,&b|{
            let pa=if order_for(orders,&world.bodies[units[a].row]).is_some_and(|o|o.kind==OrderKind::Engage){0}else{1};let pb=if order_for(orders,&world.bodies[units[b].row]).is_some_and(|o|o.kind==OrderKind::Engage){0}else{1};
            pa.cmp(&pb).then(compare_id(&world.bodies[units[a].row].id,&world.bodies[units[b].row].id))});
        for &u in &autonomous{
            let ship=&world.bodies[units[u].row];let order=order_for(orders,ship);if let Some(old)=previous[u]{claims[old]=max(0.0,claims[old]-units[u].power);}
            let ordered=order.filter(|o|o.kind==OrderKind::Engage||o.kind==OrderKind::Avoid).and_then(|o|o.target).and_then(|id|enemies.iter().copied().find(|&e|world.bodies[units[e].row].identity==id));
            let choices:Vec<_>=if let Some(e)=ordered{vec![e]}else{candidates.to_vec()};let mut selected=None;let mut best=f64::NEG_INFINITY;
            for e in choices{let target=&world.bodies[units[e].row];let gap=max(0.0,distance(u,e)-units[u].range-target.radius-ship.radius);let travel=gap/max(20.0,units[u].speed);
                let demand=max(100.0,target.hp/6.0+target.spec_armor*0.5+units[e].power*0.75);let mut score=7.0/(1.0+travel/8.0);score+=(1.0-units[e].hull)*2.0+clamp(target.flux,0.0,1.0)*1.5;
                if target.flags&(body_flag::OVERLOADED|body_flag::VENTING)!=0{score+=2.0;}if target.shield_phased||target.system_phased{score-=3.0;}
                score-=min(5.0,max(0.0,danger(e)-1.0)*1.6);score-=min(6.0,(claims[e]+units[u].power*0.25)/demand*2.0);if ship.current_target==Some(target.identity){score+=1.4;}
                if units[u].role==Role::Skirmisher{score+=if units[e].role==Role::Carrier||units[e].hull<0.4{1.0}else{0.0};}
                if let Some(Order{kind:OrderKind::Defend,point:Some([x,y]),..})=order{score-=length(target.x-x,target.y-y)/max(300.0,units[u].range);}
                if let Some(escort)=order.filter(|o|o.kind==OrderKind::Escort).and_then(|o|o.target).and_then(|id|units.iter().position(|e|world.bodies[e.row].identity==id)){score-=distance(e,escort)/max(300.0,units[u].range);}
                if score>best+1e-6||(score-best).abs()<=1e-6&&selected.is_some_and(|old:usize|compare_id(&target.id,&world.bodies[units[old].row].id).is_lt()){selected=Some(e);best=score;}
            }
            let covers:Vec<_>=friends.iter().copied().filter(|&a|{let other=&world.bodies[units[a].row];a!=u&&units[a].role!=Role::Unarmed&&units[a].role!=Role::Carrier&&units[a].hull>0.4&&other.flags&(body_flag::VENTING|body_flag::OVERLOADED)==0&&other.flux<0.8
                &&(units[u].role==Role::Unarmed||units[a].hull>units[u].hull+0.15||units[a].power>units[u].power*1.5||selected.is_some_and(|t|distance(a,t)>distance(u,t)+ship.radius+other.radius))}).collect();
            let mut anchor=None;for a in covers{if anchor.is_none_or(|best:usize|distance(u,a)<distance(u,best)||distance(u,a)==distance(u,best)&&compare_id(&world.bodies[units[a].row].id,&world.bodies[units[best].row].id).is_lt()){anchor=Some(a);}}
            let pressure=danger(u);let was_backing=matches!(ship.previous_task,Some(Task::Regroup|Task::Disengage));
            let near_fight=selected.is_some_and(|t|distance(u,t)<max(units[u].range,units[t].range)+ship.radius+world.bodies[units[t].row].radius+400.0+if was_backing{200.0}else{0.0});
            let opportunity=selected.is_some_and(|t|opportunity(ship,&world.bodies[units[t].row],pressure));
            let reserves=units[u].role==Role::Carrier||units[u].hull<0.5||ship.flags&(body_flag::OVERLOADED|body_flag::VENTING)!=0||ship.flux>=if was_backing{0.5}else{0.75};
            let backing=order.is_none()&&!ship.do_not_back_off&&(units[u].role==Role::Unarmed&&(anchor.is_some()||selected.is_some())||near_fight&&(units[u].hull<0.25&&(anchor.is_some()||was_backing)||!opportunity&&reserves&&pressure>if was_backing{1.6}else{2.5}));
            let regroup=backing&&anchor.is_some();let disengage=backing&&anchor.is_none()&&selected.is_some();
            let task=if regroup{Task::Regroup}else if disengage{Task::Disengage}else if selected.is_none(){Task::Search}else if units[u].role==Role::Carrier{Task::Support}else if opportunity{Task::Finish}else if units[u].role==Role::Skirmisher{Task::Screen}else{Task::Pressure};
            let committed=if selected.is_some_and(|t|can_contribute(u,t))&&!backing{units[u].power}else{0.0};if let Some(t)=selected{if committed!=0.0{claims[t]=max(0.0,claims[t]+committed);}}
            out.push(Assignment{owner:ship.identity,target:selected.map(|t|world.bodies[units[t].row].identity),role:units[u].role,task,score:if best.is_finite(){best}else{0.0},pressure_ratio:pressure,assigned_power:committed,carrier_range:units[u].carrier,
                anchor:if regroup{anchor.map(|a|world.bodies[units[a].row].identity)}else{None},approach_bearing:None});
        }
        for &target in candidates{let mut group:Vec<_>=autonomous.iter().copied().filter(|&u|{let ship=&world.bodies[units[u].row];let p=out.iter().find(|p|p.owner==ship.identity).unwrap();p.target==Some(world.bodies[units[target].row].identity)&&order_for(orders,ship).is_none()&&!matches!(p.task,Task::Regroup|Task::Disengage)&&!matches!(p.role,Role::Carrier|Role::Unarmed)}).collect();
            if group.len()<2{continue;}let x=group.iter().fold(0.0,|sum,&u|sum+world.bodies[units[u].row].x-world.bodies[units[target].row].x);let y=group.iter().fold(0.0,|sum,&u|sum+world.bodies[units[u].row].y-world.bodies[units[target].row].y);
            let bearing=crate::canonical_math::atan2(y,x);let nx= -bearing.sin();let ny=bearing.cos();group.sort_by(|&a,&b|{let a=&world.bodies[units[a].row];let b=&world.bodies[units[b].row];let order=((a.x-b.x)*nx+(a.y-b.y)*ny).partial_cmp(&0.0).unwrap();order.then(compare_id(&a.id,&b.id))});
            for(i,&u)in group.iter().enumerate(){let spread=0.55*if units[u].role==Role::Skirmisher{1.25}else{1.0};out.iter_mut().find(|p|p.owner==world.bodies[units[u].row].identity).unwrap().approach_bearing=Some(bearing+(i as f64/(group.len()-1)as f64*2.0-1.0)*spread);}
        }
    }Ok(())
}

#[derive(Clone,Copy,Debug,Default)]pub struct Velocity{pub x:f64,pub y:f64}
fn limit(mut v:Velocity,speed:f64)->Velocity{let n=length(v.x,v.y);if n>speed{v.x*=speed/n;v.y*=speed/n;}v}
#[derive(Clone,Copy,Debug,Default,PartialEq,Eq)]pub enum PositionReason{#[default]Baseline,FireLane,Cover}
#[derive(Clone,Copy,Debug,Default)]pub struct PositionChoice{pub velocity:Velocity,pub adjusted:bool,pub score_gain:f64,pub clear_fire:f64,pub reason:PositionReason,/// 0 baseline, 1..6 exact original candidate order.
    pub candidate:u8}
#[derive(Clone,Copy,Debug,Default)]pub struct PositionScore{pub total:f64,pub clear_fire:f64,pub blocked:f64,pub allied_lane:f64,pub danger:f64,pub escape:f64}
#[derive(Clone,Copy)]struct PositionBody{x:f64,y:f64,radius:f64}
#[derive(Clone,Copy)]struct PositionGun{x:f64,y:f64,range:f64,power:f64,fixed:bool,half_arc:f64,turret_reach:f64,angle:f64,base:f64}
#[derive(Clone,Copy)]struct FoeGun{x:f64,y:f64,range:f64,power:f64,facing:f64,base:f64,arc:f64}
#[derive(Clone,Copy)]struct Lane{start:[f64;2],end:[f64;2]}
struct Scorer<'a>{body:&'a Body,target:[f64;2],target_radius:f64,radius:f64,profile:Profile,own_power:f64,desired:Velocity,guns:&'a[PositionGun],bodies:&'a[PositionBody],foes:&'a[FoeGun],lanes:&'a[Lane]}
fn crosses(x:f64,y:f64,dx:f64,dy:f64,length2:f64,cx:f64,cy:f64,radius:f64)->bool{if length2<1.0{return false;}let t=((cx-x)*dx+(cy-y)*dy)/length2;t>0.0&&t<1.0&&length(x+dx*t-cx,y+dy*t-cy)<radius}
fn circle_entry(x:f64,y:f64,ex:f64,ey:f64,cx:f64,cy:f64,r:f64)->bool{let dx=ex-x;let dy=ey-y;let fx=x-cx;let fy=y-cy;let c=fx*fx+fy*fy-r*r;if c<=0.0{return true;}let a=dx*dx+dy*dy;if a<=1e-12{return false;}let b=2.0*(fx*dx+fy*dy);let d=b*b-4.0*a*c;if d<0.0{return false;}let t=(-b-d.sqrt())/(2.0*a);t>=0.0&&t<=1.0}
impl Scorer<'_>{fn score(&self,velocity:Velocity)->PositionScore{
    let p=self.body;let c=p.facing.cos();let s=p.facing.sin();let dt=3.0/6.0;let mut x=p.x;let mut y=p.y;let mut vx=p.vx;let mut vy=p.vy;
    for _ in 0..6{let dx=velocity.x-vx;let dy=velocity.y-vy;let ax=clamp((dx*c+dy*s)/0.5,-p.deceleration,p.acceleration);let ay=clamp((-dx*s+dy*c)/0.5,-p.acceleration*p.strafe_multiplier,p.acceleration*p.strafe_multiplier);
        vx+=(ax*c-ay*s)*dt;vy+=(ax*s+ay*c)*dt;x+=vx*dt;y+=vy*dt;}
    let tx=self.target[0]-x;let ty=self.target[1]-y;let distance=length(tx,ty);let wanted=ty.atan2(tx)-self.profile.relative_bearing;
    let facing=p.facing+clamp(signed(wanted-p.facing),-p.max_turn_rate*3.0,p.max_turn_rate*3.0);let fc=facing.cos();let fs=facing.sin();let mut clear=0.0;let mut blocked=0.0;
    for g in self.guns{let ox=g.x*fc-g.y*fs+x;let oy=g.x*fs+g.y*fc+y;let dx=self.target[0]-ox;let dy=self.target[1]-oy;let d=length(dx,dy);if d>g.range+self.target_radius{continue;}
        let heading=dy.atan2(dx);let extent=min(1.0,self.target_radius/max(1.0,d)).asin();if signed(heading-facing-g.base).abs()>g.half_arc+extent{continue;}
        if !g.fixed&&signed(heading-g.angle-(facing-p.facing)).abs()>g.turret_reach+extent{continue;}
        let length2=dx*dx+dy*dy;let blocked_now=self.bodies.iter().any(|b|crosses(ox,oy,dx,dy,length2,b.x,b.y,b.radius));if blocked_now{blocked+=g.power;}else{clear+=g.power;}
    }
    let clear_fire=clear/self.own_power;let blocked=blocked/self.own_power;let mut lane_count=0;for lane in self.lanes{let dx=lane.end[0]-lane.start[0];let dy=lane.end[1]-lane.start[1];if crosses(lane.start[0],lane.start[1],dx,dy,dx*dx+dy*dy,x,y,self.radius+12.0){lane_count+=1;}}
    let allied_lane=min(2.0,lane_count as f64);let mut danger=0.0;for g in self.foes{let dx=x-g.x;let dy=y-g.y;if length(dx,dy)>g.range+self.radius{continue;}if signed(dy.atan2(dx)-g.facing-g.base).abs()<=g.arc{danger+=g.power/self.own_power;}}
    danger=min(3.0,danger);let mut ax=x-self.target[0];let mut ay=y-self.target[1];let away=length(ax,ay);if away>0.00001{ax/=away;ay/=away;}
    let reach=max(self.radius,p.max_speed*1.5);let ex=x+ax*reach;let ey=y+ay*reach;let mut exits=0;for b in self.bodies{if circle_entry(x,y,ex,ey,b.x,b.y,b.radius+self.radius){exits+=1;}}
    let escape=min(2.0,exits as f64);let overlap=self.bodies.iter().any(|b|length(x-b.x,y-b.y)<b.radius+self.radius)||distance<self.radius+self.target_radius+8.0;
    let range_error=min(2.0,(distance-self.profile.range).abs()/max(100.0,self.profile.range));let deviation=length(velocity.x-self.desired.x,velocity.y-self.desired.y)/max(1.0,p.max_speed);
    PositionScore{total:3.2*clear_fire-1.2*allied_lane-0.8*danger-0.5*escape-if overlap{6.0}else{0.0}-0.65*range_error-0.18*deviation,clear_fire,blocked,allied_lane,danger,escape}
}}
#[derive(Default)]pub struct PositionScratch{nearby:Vec<usize>,rocks:Vec<usize>,guns:Vec<PositionGun>,bodies:Vec<PositionBody>,foes:Vec<FoeGun>,lanes:Vec<Lane>}
impl PositionScratch{pub fn new()->Self{Self::default()}}
fn position_battery(world:&World<'_>,row:usize,steady:bool)->Vec<usize>{let mut rows:Vec<_>=battery_rows(world,row,steady).into_iter().filter(|&m|{let w=&world.weapons[m];w.flags&weapon_flag::PD==0&&w.dps>0.0&&(w.dps+w.effective_range).is_finite()}).collect();
    rows.sort_by(|&m,&n|world.weapons[n].dps.partial_cmp(&world.weapons[m].dps).unwrap().then(world.weapons[m].locale_rank.cmp(&world.weapons[n].locale_rank)));rows.truncate(8);rows}
pub fn position(world:&World<'_>,observer:Identity,target:Identity,desired:Velocity,profile:Profile,fleet:&[Assignment],scratch:&mut PositionScratch)->Result<PositionChoice,Error>{
    world.validate()?;position_at_barrier(world,observer,target,desired,profile,fleet,scratch)
}
pub(crate) fn position_at_barrier(world:&World<'_>,observer:Identity,target:Identity,desired:Velocity,profile:Profile,fleet:&[Assignment],scratch:&mut PositionScratch)->Result<PositionChoice,Error>{
    let r=world.row(observer)?;let t=world.row(target)?;if ![desired.x,desired.y,profile.range,profile.relative_bearing,profile.firepower].iter().all(|n|n.is_finite()){return Err(Error::InvalidNumber);}
    for p in fleet{if world.find(p.owner).is_none()||p.target.is_some_and(|id|world.find(id).is_none()){return Err(Error::StaleIdentity);}}
    let b=&world.bodies[r];let target=&world.bodies[t];let mut result=PositionChoice{velocity:desired,..PositionChoice::default()};
    if b.flags&(body_flag::PHASED|body_flag::VENTING|body_flag::OVERLOADED)!=0||b.system_locks_turning||!world.visible(t,r)||!(b.max_speed>0.0)||distance(b,target)>profile.range*2.5{return Ok(result);}
    let guns=position_battery(world,r,true);let own_power=guns.iter().fold(0.0,|n,&m|n+world.weapons[m].dps);if own_power<=0.0{return Ok(result);}
    let own_root=assembly_root(world,r);let target_root=assembly_root(world,t);
    scratch.nearby.clear();scratch.nearby.extend((0..world.bodies.len()).filter(|&i|assembly_root(world,i)!=own_root&&assembly_root(world,i)!=target_root&&world.bodies[i].flags&(body_flag::DEAD|body_flag::PHASED|body_flag::FIGHTER)==0&&world.visible(i,r)));
    scratch.nearby.sort_by(|&i,&j|distance(b,&world.bodies[i]).partial_cmp(&distance(b,&world.bodies[j])).unwrap().then(world.bodies[i].locale_rank.cmp(&world.bodies[j].locale_rank)));scratch.nearby.truncate(12);
    let predict=|i:usize|[world.bodies[i].x+world.bodies[i].vx*3.0,world.bodies[i].y+world.bodies[i].vy*3.0];
    scratch.bodies.clear();for &i in &scratch.nearby{let other=&world.bodies[i];let p=predict(i);scratch.bodies.push(PositionBody{x:p[0],y:p[1],radius:max(other.radius,if other.shield_raw_active&&!(other.shield_void&&other.team==b.team){other.shield_radius}else{0.0})+8.0});}
    scratch.rocks.clear();scratch.rocks.extend(0..world.asteroids.len());scratch.rocks.sort_by(|&i,&j|{let i=&world.asteroids[i];let j=&world.asteroids[j];length(b.x-i.x,b.y-i.y).partial_cmp(&length(b.x-j.x,b.y-j.y)).unwrap()});scratch.rocks.truncate(8);
    for &i in &scratch.rocks{let rock=&world.asteroids[i];scratch.bodies.push(PositionBody{x:rock.x+rock.vx*3.0,y:rock.y+rock.vy*3.0,radius:rock.radius+8.0});}
    scratch.foes.clear();for &i in scratch.nearby.iter().filter(|&&i|world.bodies[i].parent.is_none()&&world.bodies[i].team!=b.team&&world.bodies[i].flags&(body_flag::VENTING|body_flag::OVERLOADED|body_flag::WEAPONS_BLOCKED)==0).take(4){
        let other=&world.bodies[i];let p=predict(i);let c=other.facing.cos();let s=other.facing.sin();for m in position_battery(world,i,false){let w=&world.weapons[m];let local=relative_position(world,i,m);let owner=&world.bodies[world.find(w.owner).expect("validated weapon owner")];scratch.foes.push(FoeGun{x:local[0]*c-local[1]*s+p[0],y:local[0]*s+local[1]*c+p[1],range:w.effective_range,power:w.dps,facing:other.facing,base:(owner.facing-other.facing)+w.local_base_angle,arc:w.authored_half_arc+0.15});}}
    scratch.lanes.clear();for &i in scratch.nearby.iter().filter(|&&i|world.bodies[i].parent.is_none()&&world.bodies[i].team==b.team){if let Some(j)=fleet.iter().find(|p|p.owner==world.bodies[i].identity).and_then(|p|p.target).and_then(|id|world.find(id)){
        if world.bodies[j].flags&body_flag::DEAD==0&&world.bodies[j].team!=b.team&&world.visible(j,r){scratch.lanes.push(Lane{start:predict(i),end:predict(j)});}}}
    scratch.guns.clear();for &m in &guns{let w=&world.weapons[m];let local=relative_position(world,r,m);let owner=&world.bodies[world.find(w.owner).expect("validated weapon owner")];scratch.guns.push(PositionGun{x:local[0],y:local[1],range:w.effective_range,power:w.dps,fixed:w.fixed,half_arc:if w.fixed{0.0}else{w.authored_half_arc},turret_reach:w.position_turn_rate*3.0,angle:w.angle,base:(owner.facing-b.facing)+w.local_base_angle});}
    let scorer=Scorer{body:b,target:predict(t),target_radius:target.radius,radius:max(b.radius,if b.shield_raw_active{b.shield_radius}else{0.0}),profile,own_power,desired,guns:&scratch.guns,bodies:&scratch.bodies,foes:&scratch.foes,lanes:&scratch.lanes};
    let baseline=scorer.score(desired);result.clear_fire=baseline.clear_fire;if baseline.blocked==0.0&&baseline.allied_lane==0.0&&baseline.danger<0.4&&baseline.escape==0.0{return Ok(result);}
    let predicted=predict(t);let mut rx=predicted[0]-b.x;let mut ry=predicted[1]-b.y;let n=length(rx,ry);if n>0.00001{rx/=n;ry/=n;}
    let mut candidates=Vec::new();for side in [1.0,-1.0]{for amount in [0.55,1.0]{candidates.push(limit(Velocity{x:desired.x+-ry*(side*b.max_speed*amount),y:desired.y+rx*(side*b.max_speed*amount)},b.max_speed));}}
    candidates.push(Velocity{x:desired.x*0.5,y:desired.y*0.5});candidates.push(Velocity::default());let minimum=if distance(b,target)>profile.range+8.0{max(0.0,desired.x*rx+desired.y*ry)*0.5}else{0.0};let mut best=baseline;
    for(i,candidate)in candidates.into_iter().enumerate(){if minimum>0.0&&candidate.x*rx+candidate.y*ry<minimum-1e-8{continue;}let next=scorer.score(candidate);if next.total>best.total+0.12{best=next;result.velocity=candidate;result.adjusted=true;
        result.reason=if baseline.blocked>0.0||baseline.allied_lane>0.0{PositionReason::FireLane}else{PositionReason::Cover};result.score_gain=next.total-baseline.total;result.clear_fire=next.clear_fire;result.candidate=i as u8+1;}}
    Ok(result)
}
