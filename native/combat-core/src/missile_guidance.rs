//! Exact current Web missile, flare and mote rules. All memory is resident and
//! cloneable with the owning world's transaction/checkpoint. Borrowed views are
//! constructed from resident entities; they are not per-step JS authority DTOs.
use crate::random::Random;
pub type Point = [f64;2];
#[derive(Clone,Copy,Debug,Default,PartialEq,Eq)]
pub struct Identity { pub handle:u32, pub generation:u32 }
#[derive(Clone,Copy,Debug,Default)]
pub struct Allegiance {pub team:Option<u32>,pub is_player:Option<bool>}
impl Allegiance {fn resolved(self)->Option<u32>{self.team.or(self.is_player.map(|p|if p{0}else{1}))}}
pub fn same_team(a:Allegiance,b:Allegiance)->bool{a.resolved().is_some_and(|t|Some(t)==b.resolved())}
#[derive(Clone,Debug,Default)]
pub struct Ship {
    pub identity:Identity,pub allegiance:Allegiance,pub position:Point,pub velocity:Point,pub radius:f64,
    pub dead:bool,pub phased:bool,pub retreated:bool,pub collisionless:bool,pub fighter:bool,pub visible_to_source:bool,
    pub shield_center:Point,pub shield_radius:f64,pub shield_none:bool,
}
#[derive(Clone,Debug,Default)]
pub struct Mote {pub age:f64,pub turn_sign:f64,pub scan_remaining:f64}
#[derive(Clone,Debug,Default)]
pub struct Missile {
    pub identity:Identity,pub id:f64,pub source:Identity,pub allegiance:Allegiance,pub position:Point,pub velocity:Point,
    pub radius:f64,pub elapsed:f64,pub facing:Option<f64>,pub turn_velocity:Option<f64>,
    pub guided:bool,pub rocket:bool,pub flare:bool,pub flare_fizzling:bool,pub render_target_indicator:Option<bool>,
    pub target_ship:Option<Identity>,pub target_projectile:Option<Identity>,pub flight_remaining:Option<f64>,
    pub acceleration:Option<f64>,pub max_speed:Option<f64>,pub max_turn_rate:Option<f64>,pub max_turn_acceleration:Option<f64>,
    pub guidance_bonus:Option<f64>,pub eccm_chance:Option<f64>,pub hitpoints:Option<f64>,
    pub damage:f64,pub base_damage:Option<f64>,pub source_damage_multiplier:Option<f64>,
    pub stage_triggered:bool,pub split_distance:Option<f64>,pub flare_life:Option<f64>,pub flare_max_life:Option<f64>,pub fade:f64,
    pub disarmed:bool,pub collision_disabled:bool,pub did_damage:bool,pub mote:Option<Mote>,
}
#[derive(Clone,Debug)]
pub struct Mirv {
    pub split_range:f64,pub split_range_range:f64,pub min_time:f64,pub can_split_early:bool,pub shots:f64,
    pub damage:f64,pub emp:f64,pub damage_type:u32,pub child_hitpoints:f64,pub even_spread:bool,
    pub arc_degrees:f64,pub inaccuracy_degrees:f64,pub spread_speed:f64,pub spread_speed_range:f64,
    pub projectile_range:f64,pub child_spec:u32,pub child_radius:Option<f64>,pub child_spawn_type:Option<u32>,
}
#[derive(Clone,Debug)]
pub struct Child {
    pub id:f64,pub source:Identity,pub allegiance:Allegiance,pub spec:u32,pub position:Point,pub velocity:Point,
    pub angle:f64,pub base_damage:f64,pub damage:f64,pub emp:f64,pub damage_type:u32,pub radius:f64,
    pub range:f64,pub hitpoints:f64,pub spawn_type:u32,pub launch_speed:f64,pub inherited_velocity:Point,
    pub source_damage_multiplier:Option<f64>,
}
#[derive(Clone,Copy,Debug,PartialEq,Eq)]
pub enum FlareMode {Standard,Seeker,Jammer}
#[derive(Clone,Debug)]
pub struct FlareSpec {pub mode:FlareMode,pub effect_range:f64,pub effect_chance:f64,pub flameout_time:f64,pub fade_time:f64}
#[derive(Clone,Debug)]
pub struct FlareState {pub wait:f64,pub spin:f64,pub seek_after:f64,pub immune:Vec<Identity>,pub target:Option<Identity>,pub orbit_target:Option<Identity>}
#[derive(Clone,Copy,Debug)]
pub struct DecoyLock {pub missile:Identity,pub decoy:Identity}
#[derive(Clone,Copy,Debug)]
pub struct Asteroid {pub position:Point,pub radius:f64}
pub struct MoteShared<'a> {pub source:Identity,pub elapsed:f64,pub attractor:Option<Point>,pub lock:Option<Identity>,pub motes:&'a [Identity]}
pub struct World<'a> {
    pub ships:&'a [Ship],pub projectiles:&'a [Missile],pub asteroids:&'a [Asteroid],
    /// JAMMER keeps its original Ship object even after it leaves live roster.
    /// The owner retains such referenced entities until the flare is removed.
    pub retained_ships:&'a [Ship],
    /// MoteControl filters shared.motes before updateProjectiles. A removed mote
    /// can still contribute to same-step budgets/cohesion via that shared list.
    pub retained_projectiles:&'a [Missile],
}
/// A guidance item borrows its current roster until all of its reads finish.
/// Resident owners can observe just the queried entities without building a
/// second world; slice callers retain the same ordered, complete observations.
pub trait TargetWorld {
    fn ships(&self)->impl Iterator<Item=Ship>;
    fn projectiles(&self)->impl Iterator<Item=Missile>;
    fn ship(&self,id:Identity)->Option<Ship>;
    fn ship_any(&self,id:Identity)->Option<Ship>;
    fn projectile(&self,id:Identity)->Option<Missile>;
}
impl World<'_> {
    fn ship(&self,id:Identity)->Option<&Ship>{self.ships.iter().find(|s|s.identity==id)}
    fn ship_any(&self,id:Identity)->Option<&Ship>{self.ship(id).or_else(||self.retained_ships.iter().find(|s|s.identity==id))}
    fn projectile(&self,id:Identity)->Option<&Missile>{self.projectiles.iter().find(|p|p.identity==id)}
    fn projectile_any(&self,id:Identity)->Option<&Missile>{self.projectile(id).or_else(||self.retained_projectiles.iter().find(|p|p.identity==id))}
}
impl TargetWorld for World<'_> {
    fn ships(&self)->impl Iterator<Item=Ship>{self.ships.iter().cloned()}
    fn projectiles(&self)->impl Iterator<Item=Missile>{self.projectiles.iter().cloned()}
    fn ship(&self,id:Identity)->Option<Ship>{World::ship(self,id).cloned()}
    fn ship_any(&self,id:Identity)->Option<Ship>{World::ship_any(self,id).cloned()}
    fn projectile(&self,id:Identity)->Option<Missile>{World::projectile(self,id).cloned()}
}
pub fn length(v:Point)->f64{let a=v[0].abs();let b=v[1].abs();if a==f64::INFINITY||b==f64::INFINITY{return f64::INFINITY;}let m=if a>b{a}else{b};if m==0.0&&a==0.0{return 0.0;}let r=if a>b{b}else{a}/m;(1.0+r*r).sqrt()*m}
fn sub(a:Point,b:Point)->Point{[a[0]-b[0],a[1]-b[1]]}
fn scale(a:Point,s:f64)->Point{[a[0]*s,a[1]*s]}
fn add_scaled(a:&mut Point,b:Point,s:f64){a[0]+=b[0]*s;a[1]+=b[1]*s;}
fn dot(a:Point,b:Point)->f64{a[0]*b[0]+a[1]*b[1]}
fn direction(from:Point,to:Point)->Point{normalize(sub(to,from))}
fn normalize(mut a:Point)->Point{let l=length(a);if l>0.00001{a[0]/=l;a[1]/=l;}a}
fn heading(a:Point)->f64{a[1].atan2(a[0])}
fn from_angle(a:f64,l:f64)->Point{[a.cos()*l,a.sin()*l]}
fn sign(v:f64)->f64{if v==0.0{v}else if v>0.0{1.0}else{-1.0}}
fn signed_angle(a:f64)->f64{a.sin().atan2(a.cos())}
fn clamp_speed(p:&mut Missile){let speed=length(p.velocity);let max=p.max_speed.unwrap_or(speed);if speed>max{p.velocity=scale(p.velocity,max/speed);}}

pub fn guidance_point(p:&Missile,target:&Ship)->Point{
    let g=p.guidance_bonus.unwrap_or(0.0).clamp(0.0,1.0);if g==0.0{return target.position;}
    let delta=sub(target.position,p.position);let distance=length(delta);let dir=if distance>0.0{scale(delta,1.0/distance)}else{[0.0;2]};
    let range=(distance-(p.radius+target.radius)*0.75).max(0.0);let max_speed=p.max_speed.unwrap_or_else(||length(p.velocity));
    let radial=dot(target.velocity,dir);let acceleration_time=max_speed/p.acceleration.unwrap_or(0.0).max(10.0)*2.0;
    let time=(range/(max_speed.max(100.0)-radial).max(100.0)).max(0.1);
    let inherited=scale(p.velocity,acceleration_time/(time+acceleration_time));let relative=sub(target.velocity,inherited);
    let closing=-dot(relative,dir);let mut speed=(closing+max_speed*0.5*g)*(1.5-0.5*g);if speed<=10.0{speed=20.0;}
    let mut result=target.position;add_scaled(&mut result,relative,(range/speed).clamp(0.0,10.0));result
}
pub fn steer(p:&mut Missile,target_angle:f64,dt:f64,turn_multiplier:f64){
    let Some(facing)=p.facing else{return;};let mut diff=target_angle-facing;
    while diff>std::f64::consts::PI{diff-=std::f64::consts::TAU;}while diff< -std::f64::consts::PI{diff+=std::f64::consts::TAU;}
    let rate=(p.max_turn_rate.unwrap_or(0.0)*turn_multiplier).max(0.0);if rate<=0.0{p.turn_velocity=Some(0.0);return;}
    let acceleration=(p.max_turn_acceleration.unwrap_or(f64::INFINITY)*turn_multiplier).max(0.0);
    let desired=sign(diff)*rate;let mut velocity=p.turn_velocity.unwrap_or(0.0);
    if acceleration.is_finite(){let delta=desired-velocity;velocity+=sign(delta)*delta.abs().min(acceleration*dt);}else{velocity=desired;}
    let step=velocity*dt;if step.abs()>=diff.abs(){p.facing=Some(facing+diff);p.turn_velocity=Some(0.0);}else{p.facing=Some(facing+step);p.turn_velocity=Some(velocity);}
}

/// Called after elapsed/lifecycle/angularVelocity and before ordinary movement.
/// Returns true only for successful MIRV splitting. Children must be appended to
/// the real roster in this order before removing the parent at its old index.
pub fn advance_missile(p:&mut Missile,dt:f64,world:&impl TargetWorld,mirv:Option<&Mirv>,random:&mut Random,children:&mut Vec<Child>)->bool{
    if p.facing.is_none(){p.facing=Some(heading(p.velocity));}
    if p.guided{
        let hostile=|s:&Ship|s.identity!=p.source&&!s.dead&&!s.phased&&(p.allegiance.is_player.is_none()||!same_team(s.allegiance,p.allegiance));
        let decoy=p.target_projectile.and_then(|id|world.projectile(id)).filter(|q|q.flare&&!q.flare_fizzling&&q.hitpoints.unwrap_or(1.0)>0.0&&(if p.allegiance.is_player.is_none(){q.source!=p.source}else{!same_team(q.allegiance,p.allegiance)}));
        if let Some(q)=decoy{steer(p,heading(sub(q.position,p.position)),dt,1.0);}else{
            p.target_projectile=None;
            let mut target=p.target_ship.and_then(|id|world.ship(id)).filter(hostile);
            if target.is_none(){target=world.ships().find(hostile);if let Some(s)=&target{p.target_ship=Some(s.identity);}}
            if let Some(s)=target{steer(p,heading(sub(guidance_point(p,&s),p.position)),dt,1.0);}
        }
    }
    if let Some(m)=mirv.filter(|_|!p.stage_triggered){
        let split=*p.split_distance.get_or_insert_with(||m.split_range+random.next()*m.split_range_range);
        let target=p.target_ship.and_then(|id|world.ship(id)).filter(|s|!s.dead&&!s.phased);
        if let Some(s)=target{
            let delta=sub(s.position,p.position);let distance=length(delta);let closing=dot(sub(p.velocity,s.velocity),normalize(delta));
            let eta=if closing>10.0{(distance-s.radius-split*0.75).max(0.0)/closing}else{1000.0};
            let eligible=p.elapsed>=m.min_time||(m.can_split_early&&p.elapsed>1.0&&eta<m.min_time-p.elapsed);
            let error=signed_angle(heading(delta)-p.facing.unwrap()).abs();let tolerance=s.radius/distance.max(0.001)*0.2+(m.arc_degrees-1.5).max(0.0)*std::f64::consts::PI/180.0;
            if eligible&&distance<split+s.radius&&error<tolerance{
                let count=m.shots.floor().max(1.0) as usize;let arc=m.arc_degrees*std::f64::consts::PI/180.0;let inaccuracy=m.inaccuracy_degrees*std::f64::consts::PI/180.0;
                for index in 0..count{
                    let t=if count<=1{0.5}else{index as f64/(count-1) as f64};let offset=if m.even_spread{(t-0.5)*arc}else{(random.next()-0.5)*arc};
                    let error=(random.next()-0.5)*inaccuracy;let angle=p.facing.unwrap()+offset+error;let speed=(m.spread_speed+random.next()*m.spread_speed_range).max(0.0);
                    let mut position=p.position;add_scaled(&mut position,from_angle(p.facing.unwrap(),1.0),5.0);
                    let mut velocity=from_angle(angle,speed);add_scaled(&mut velocity,p.velocity,1.0);let id=random.next();
                    let multiplier=p.source_damage_multiplier.unwrap_or_else(||if p.base_damage.unwrap_or(0.0)>0.0{p.damage/p.base_damage.unwrap()}else{1.0});
                    children.push(Child{id,source:p.source,allegiance:p.allegiance,spec:m.child_spec,position,velocity,angle,base_damage:m.damage,damage:m.damage*multiplier,
                        emp:m.emp,damage_type:m.damage_type,radius:m.child_radius.unwrap_or(1.75),range:m.projectile_range,hitpoints:m.child_hitpoints,
                        spawn_type:m.child_spawn_type.unwrap_or(1),launch_speed:speed,inherited_velocity:p.velocity,source_damage_multiplier:p.source_damage_multiplier});
                }
                p.stage_triggered=true;return true;
            }
        }
    }
    let acceleration=p.acceleration.unwrap_or(0.0);if acceleration>0.0{add_scaled(&mut p.velocity,from_angle(p.facing.unwrap(),acceleration*dt),1.0);}clamp_speed(p);false
}

fn hostile_projectile(p:&Missile,q:&Missile)->bool{
    q.identity!=p.identity&&(if p.allegiance.is_player.is_none(){q.source!=p.source}else{!same_team(q.allegiance,p.allegiance)})
        &&q.hitpoints.is_none_or(|h|h>0.0)&&!q.flare_fizzling&&q.flight_remaining.is_none_or(|t|t>0.0)
}
pub fn advance_flare(p:&mut Missile,memory:&mut Option<FlareState>,dt:f64,spec:Option<&FlareSpec>,world:&impl TargetWorld,random:&mut Random,locks:&mut Vec<DecoyLock>)->bool{
    let life=p.flare_life.unwrap_or_else(||p.flare_max_life.unwrap_or(0.0))-dt;p.flare_life=Some(life);
    let Some(spec)=spec else{return life<=0.0;};if p.hitpoints.unwrap_or(1.0)<=0.0||life<= -spec.flameout_time{return true;}
    p.flare_fizzling=life<=0.0;if p.flare_fizzling{p.fade=((-life-spec.flameout_time+spec.fade_time)/spec.fade_time.max(0.001)).clamp(0.0,1.0);return false;}
    let state=memory.get_or_insert_with(||{
        let wait=0.05+random.next()*0.05;let spin=if random.next()>0.5{-1.0}else{1.0};let seek_after=if spec.mode==FlareMode::Seeker{0.5+random.next()*0.5}else{f64::INFINITY};
        let mut orbit_target=None;let mut nearest=f64::INFINITY;
        if spec.mode==FlareMode::Jammer{for s in world.ships(){let distance=length(sub(s.position,p.position));if !s.dead&&!s.phased&&!same_team(s.allegiance,p.allegiance)&&distance<=1000.0&&distance<nearest{nearest=distance;orbit_target=Some(s.identity);}}}
        FlareState{wait,spin,seek_after,immune:Vec::new(),target:None,orbit_target}
    });
    if spec.mode==FlareMode::Jammer{
        let mut angle=p.facing.unwrap_or_else(||heading(p.velocity));
        if let Some(s)=state.orbit_target.and_then(|id|world.ship_any(id)){
            let radius=if s.shield_none{s.radius}else{s.shield_radius}+75.0;let distance=length(sub(p.position,s.shield_center));
            angle=heading(sub(s.shield_center,p.position))+if distance<radius{std::f64::consts::PI}else{0.0}+(1.0-(distance-radius).abs()/100.0).max(0.0)*std::f64::consts::FRAC_PI_2*state.spin;
        }
        let facing=p.facing.unwrap_or_else(||heading(p.velocity));let rate=p.max_turn_rate.unwrap_or(0.0);let desired=(signed_angle(angle-facing)*4.0).min(rate).max(-rate);
        let change=p.max_turn_acceleration.unwrap_or(0.0)*dt;let old=p.turn_velocity.unwrap_or(0.0);let velocity=old+(desired-old).min(change).max(-change);
        p.turn_velocity=Some(velocity);p.facing=Some(facing+velocity*dt);add_scaled(&mut p.velocity,from_angle(p.facing.unwrap(),p.acceleration.unwrap_or(0.0)*dt),1.0);clamp_speed(p);return false;
    }
    state.wait-=dt;if state.wait<=1e-9{
        state.wait+=0.05+random.next()*0.05;
        if spec.mode==FlareMode::Seeker&&p.elapsed>=state.seek_after{
            state.target=None;let mut nearest=f64::INFINITY;for q in world.projectiles(){if !q.rocket||q.flare||!hostile_projectile(p,&q){continue;}let distance=length(sub(p.position,q.position));if distance<nearest{nearest=distance;state.target=Some(q.identity);}}
        }
        for q in world.projectiles(){
            if !q.rocket||!q.guided||q.flare||!hostile_projectile(p,&q)||q.render_target_indicator==Some(false)||length(sub(p.position,q.position))>spec.effect_range||state.immune.contains(&q.identity){continue;}
            // JS || short circuits: a failed probability does not consume ECCM.
            if random.next()>spec.effect_chance||q.eccm_chance.unwrap_or(0.0)>random.next(){state.immune.push(q.identity);}else{locks.push(DecoyLock{missile:q.identity,decoy:p.identity});}
        }
    }
    let seek=p.elapsed>=state.seek_after;if spec.mode==FlareMode::Seeker&&!seek{return false;}
    let velocity=state.spin*p.max_turn_rate.unwrap_or(0.0).min(p.turn_velocity.unwrap_or(0.0).abs()+p.max_turn_acceleration.unwrap_or(0.0)*dt);
    p.turn_velocity=Some(velocity);p.facing=Some(p.facing.unwrap_or_else(||heading(p.velocity))+velocity*dt);let mut angle=p.facing.unwrap();
    if seek{if let Some(q)=state.target.and_then(|id|world.projectile(id)).filter(|q|hostile_projectile(p,q)){
        let lead=(length(sub(p.position,q.position))/p.max_speed.unwrap_or(0.0).max(1.0)).min(1.5);let mut point=q.position;add_scaled(&mut point,q.velocity,lead);angle=heading(sub(point,p.position));
    }}
    add_scaled(&mut p.velocity,from_angle(angle,p.acceleration.unwrap_or(0.0)*dt),1.0);clamp_speed(p);false
}

pub fn intercept_time(position:Point,velocity:Point,speed:f64)->Option<f64>{
    if !(speed>0.0)||!speed.is_finite(){return None;}let c=dot(position,position);if c<1e-12{return Some(0.0);}
    let velocity_squared=dot(velocity,velocity);let a=velocity_squared-speed*speed;let b=2.0*dot(position,velocity);
    if a.abs()<=1e-10*(speed*speed).max(velocity_squared).max(1.0){return if b< -1e-10{Some(-c/b)}else{None};}
    let disc=b*b-4.0*a*c;if disc<0.0{return None;}let q=-0.5*(b+if b>=0.0{1.0}else{-1.0}*disc.sqrt());
    let first=q/a;let second=if q==0.0{f64::INFINITY}else{c/q};let first_valid=first>=0.0&&first.is_finite();let second_valid=second>=0.0&&second.is_finite();
    if first_valid{Some(if second_valid{first.min(second)}else{first})}else if second_valid{Some(second)}else{None}
}
pub fn advance_mote(p:&mut Missile,dt:f64,world:&World<'_>,shared:&MoteShared<'_>,random:&mut Random){
    let Some(source)=world.ship_any(shared.source)else{return;};if p.disarmed||p.mote.is_none(){return;}
    {let data=p.mote.as_mut().unwrap();data.age+=dt;if data.age<0.5{return;}data.scan_remaining-=dt;}
    let attractor=shared.lock.and_then(|id|world.ship_any(id)).map(|s|s.position).or(shared.attractor);
    if p.mote.as_ref().unwrap().scan_remaining<=0.0{
        p.mote.as_mut().unwrap().scan_remaining=0.05+random.next()*0.05;p.target_ship=None;p.target_projectile=None;
        let lock=shared.lock.and_then(|id|world.ship_any(id)).filter(|s|!s.dead&&!s.retreated);
        if let Some(s)=lock{p.target_ship=Some(s.identity);}else{
            let eligible=|pos:Point|length(sub(pos,source.position))<=2000.0||attractor.is_some_and(|a|length(sub(pos,a))<=1000.0);
            let mut min=f64::INFINITY;
            for q in world.projectiles{
                if q.identity==p.identity||!q.rocket||q.allegiance.is_player.is_none()||same_team(q.allegiance,p.allegiance)||q.collision_disabled||q.disarmed||q.did_damage||q.hitpoints.unwrap_or(1.0)<=0.0||!eligible(q.position){continue;}
                let budget=shared.motes.iter().filter_map(|id|world.projectile_any(*id)).filter(|m|m.identity!=p.identity&&m.target_projectile==Some(q.identity)).count();if budget>=2{continue;}
                let distance=length(sub(p.position,q.position));if distance<min{min=distance;p.target_ship=None;p.target_projectile=Some(q.identity);}
            }
            for s in world.ships{
                if same_team(s.allegiance,p.allegiance)||s.dead||s.collisionless||!s.fighter||!eligible(s.position){continue;}
                let distance=length(sub(p.position,s.position));if distance>3000.0&&!s.visible_to_source{continue;}
                let budget=shared.motes.iter().filter_map(|id|world.projectile_any(*id)).filter(|m|m.identity!=p.identity&&m.target_ship==Some(s.identity)).count();if budget>=2{continue;}
                if distance<min{min=distance;p.target_ship=Some(s.identity);p.target_projectile=None;}
            }
        }
    }
    let ship_target=p.target_ship.and_then(|id|world.ship(id)).filter(|s|!s.dead&&!s.collisionless);
    let missile_target=p.target_projectile.and_then(|id|world.projectile(id)).filter(|q|q.hitpoints.unwrap_or(1.0)>0.0&&!q.did_damage);
    let target=ship_target.map(|s|(s.position,s.velocity)).or_else(||missile_target.map(|q|(q.position,q.velocity)));
    let distant=shared.lock.and_then(|id|world.ship_any(id)).is_some_and(|s|length(sub(p.position,s.position))>s.radius+300.0);
    let mut force=[0.0;2];
    if let Some((position,velocity))=target.filter(|_|!distant){let lead=intercept_time(sub(position,p.position),velocity,p.max_speed.unwrap_or(400.0)).unwrap_or(0.0);let mut point=position;add_scaled(&mut point,velocity,lead);force=sub(point,p.position);}else{
        let mut avoid=50.0*(1.0+shared.elapsed.sin()*0.25);let cohesion=100.0;
        if let Some(a)=attractor{let distance=length(sub(p.position,a));add_scaled(&mut force,direction(p.position,a),(distance/200.0).min(1.0)*3.0);avoid*=3.0;}
        let mut hard=false;
        let obstacles=world.ships.iter().filter(|s|!s.dead&&!s.fighter).map(|s|(s.position,s.radius)).chain(world.asteroids.iter().map(|a|(a.position,a.radius)));
        for (position,radius) in obstacles{let distance=length(sub(p.position,position));if distance>radius+400.0{continue;}let range=radius+avoid+50.0;if distance<range{let f=1.0-distance/range;add_scaled(&mut force,direction(position,p.position),f*5.0);hard=f>0.5;}}
        for q in shared.motes.iter().filter_map(|id|world.projectile_any(*id)){if q.identity==p.identity{continue;}let distance=length(sub(p.position,q.position));if distance<avoid&&!hard{add_scaled(&mut force,direction(q.position,p.position),1.0-distance/avoid);}if distance<cohesion{add_scaled(&mut force,normalize(q.velocity),1.0-distance/cohesion);}}
        let distance=length(sub(p.position,source.position));let radius=source.radius;
        if distance>radius+200.0{add_scaled(&mut force,direction(p.position,source.position),(distance/(radius+600.0)-1.0)*0.5);}
        if distance<radius+50.0{add_scaled(&mut force,direction(source.position,p.position),(1.0-distance/(radius+50.0))*5.0);}
        if distance<radius+600.0&&length(source.velocity)>20.0{add_scaled(&mut force,normalize(source.velocity),1.0-distance/(radius+600.0));}
        if length(force)<=0.05{let d=direction(p.position,source.position);let a=p.mote.as_ref().unwrap().turn_sign*std::f64::consts::FRAC_PI_2;force=[d[0]*a.cos()-d[1]*a.sin(),d[0]*a.sin()+d[1]*a.cos()];}
    }
    if length(force)>0.0{let desired=scale(normalize(force),p.max_speed.unwrap_or(400.0));let mut change=sub(desired,p.velocity);let max=p.acceleration.unwrap_or(650.0)*dt;if length(change)>max{change=scale(change,max/length(change));}add_scaled(&mut p.velocity,change,1.0);}
    p.facing=Some(p.facing.unwrap_or(0.0)+p.mote.as_ref().unwrap().turn_sign*p.max_turn_rate.unwrap_or(0.0)*dt);
}
