//! Resident explosion, void area, fuse and projectile interception rules.
//! Host is implemented inside Rust against then-live authority; no JS callback.
use crate::{contact::{self, Point}, random::Random};
use std::f64::consts::PI;
use std::borrow::Cow;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Identity { pub id:f64, pub generation:u32 }
#[derive(Clone, Copy)]
pub struct Allegiance { pub team:Option<u32>, pub player:Option<bool> }
impl Allegiance {
    pub fn team(self)->Option<u32>{self.team.or_else(||self.player.map(|p|if p{0}else{1}))}
    pub fn same(self,other:Self)->bool{self.team().is_some_and(|t|Some(t)==other.team())}
}
#[derive(Clone)]
pub struct ShieldGeometry { pub active:bool,pub kind:u32,pub center:Point,pub facing:f64,pub arc:f64,pub radius:f64,pub void:bool }
#[derive(Clone)]
pub struct Ship {
    pub identity:Identity,pub root:Identity,pub allegiance:Allegiance,pub dead:bool,pub collisionless:bool,pub fighter:bool,
    pub position:Point,pub facing:f64,pub radius:f64,pub bounds:Vec<Point>,pub shield:ShieldGeometry,
    pub cr_taken:f64,pub system_shield:f64,pub shield_taken:[f64;4],
}
pub struct FuseShip<'a>{pub identity:Identity,pub allegiance:Allegiance,pub dead:bool,pub collisionless:bool,
    pub position:Point,pub facing:f64,pub radius:f64,pub bounds:Cow<'a,[Point]>,pub shield:ShieldGeometry}
impl From<Ship> for FuseShip<'_>{fn from(s:Ship)->Self{Self{identity:s.identity,allegiance:s.allegiance,dead:s.dead,collisionless:s.collisionless,
    position:s.position,facing:s.facing,radius:s.radius,bounds:Cow::Owned(s.bounds),shield:s.shield}}}
#[derive(Clone)]
pub struct Missile {
    pub identity:Identity,pub source_ship:u32,pub allegiance:Allegiance,pub position:Point,pub radius:f64,
    pub rocket:bool,pub collision_disabled:bool,pub did_damage:bool,pub flare:bool,pub flare_fizzling:bool,pub decoy:bool,pub hp:f64,
}
#[derive(Clone)]
pub struct Asteroid {pub identity:Identity,pub position:Point,pub radius:f64,pub hp:f64}
#[derive(Clone)]
pub struct Wreck {pub position:Point,pub facing:f64,pub local_offset:Point,pub bounds:Vec<Point>}
#[derive(Clone)]
pub struct SourceBinding {pub handle:crate::state::Handle,pub weapon_type:u32,pub origin:Point,pub outgoing:[f64;8],pub flux:f64,pub captured:bool}
#[derive(Clone)]
pub struct Payload {
    pub identity:Identity,pub source_ship:u32,pub allegiance:Allegiance,pub damage:f64,pub damage_type:u32,pub soft_flux:bool,
    pub position:Point,pub previous:Point,pub velocity:Point,pub radius:f64,pub range_remaining:f64,
    pub rocket:bool,pub flare:bool,pub did_damage:bool,pub moving_ray:bool,pub intercepts_missiles:bool,
    pub target_projectile:Option<Identity>,pub pass_through_missiles:bool,pub damaged_projectiles:Vec<Identity>,
    pub void_blocked_root:Option<Identity>,
    pub source_binding:Option<SourceBinding>,
}
#[derive(Clone, Copy,Debug)]
pub enum Collision { ShipsAndAsteroids,MissileFF,MissileNoFF,ProjectileFF,ProjectileNoFF,Other{no_ff:bool} }
impl Collision {
    pub fn no_ff(self)->bool{matches!(self,Self::MissileNoFF|Self::ProjectileNoFF|Self::Other{no_ff:true})}
    pub fn small(self)->bool{matches!(self,Self::MissileFF|Self::MissileNoFF|Self::ProjectileFF|Self::ProjectileNoFF)}
}
#[derive(Clone, Copy,Debug)]
pub struct Spec {pub radius:f64,pub core:f64,pub duration:f64,pub minimum_fraction:f64,pub collision:Collision}
impl Spec {
    pub fn scale(self,distance:f64)->f64{if distance<=self.core{1.0}else{1.0-(1.0-self.minimum_fraction)*((distance-self.core)/(self.radius-self.core).max(0.001)).clamp(0.0,1.0)}}
    pub fn valid(self)->bool{[self.radius,self.core,self.duration,self.minimum_fraction].iter().all(|n|n.is_finite())&&self.radius>=0.0&&self.core>=0.0&&self.duration>=0.0&&(0.0..=1.0).contains(&self.minimum_fraction)}
}
#[derive(Clone, Copy)]
pub struct Fuse {pub range:f64,pub radius:f64,pub core:Option<f64>,pub source_explosion:Option<Spec>}
impl Fuse {
    pub fn scale(self,distance:f64)->f64{
        let outer=self.radius.max(0.0);let core=self.core.unwrap_or(outer).min(outer).max(0.0);let distance=distance.max(0.0);
        if distance<=core{1.0}else if distance>=outer||outer<=core{0.0}else{1.0-(distance-core)/(outer-core)}
    }
}
#[derive(Clone, Copy)]
pub struct Screen {pub root:Identity,pub center:Point,pub radius:f64,pub team:Option<u32>,pub fraction:f64}
#[derive(Clone, Copy,Debug)]
pub struct Contact {pub point:Point,pub distance:f64,pub shield:bool}
fn norm(p:Point)->Point{let len=contact::length(p);if len>0.00001{[p[0]/len,p[1]/len]}else{p}}
fn delta(a:Point,b:Point)->Point{[a[0]-b[0],a[1]-b[1]]}
fn dist(a:Point,b:Point)->f64{contact::length(delta(a,b))}
fn frame_hypot(v:Point)->f64{
    let a=v[0].abs();let b=v[1].abs();let max=a.max(b);if max==0.0{return 0.0;}if max.is_infinite(){return max;}
    let x=a/max;let y=b/max;(x*x+y*y).sqrt()*max
}
fn local(s:&Ship,p:Point)->Point{contact::rotate(delta(p,s.position),-s.facing)}
fn world(s:&Ship,p:Point)->Point{let p=contact::rotate(p,s.facing);[p[0]+s.position[0],p[1]+s.position[1]]}
fn shield_active(s:&ShieldGeometry)->bool{s.active&&s.arc>5.0&&s.radius>0.0&&s.kind!=0&&s.kind!=3}
pub fn shield_distance(s:&ShieldGeometry,point:Point)->f64{
    if !shield_active(s){return f64::INFINITY;}let radial=delta(point,s.center);let half=s.arc.min(360.0)*PI/360.0;
    let angle=radial[1].atan2(radial[0])-s.facing;let diff=angle.sin().atan2(angle.cos());
    if diff.abs()<=half{return (contact::length(radial)-s.radius).abs();}
    let mut distance=f64::INFINITY;for end in [s.facing-half,s.facing+half]{distance=distance.min(frame_hypot([radial[0]-end.cos()*s.radius,radial[1]-end.sin()*s.radius]));}distance
}
fn fuse_shield_distance(s:&ShieldGeometry,point:Point,limit:f64)->f64{
    if !shield_active(s){return f64::INFINITY;}
    let scale=1.0f64.max(point[0].abs()).max(point[1].abs()).max(s.center[0].abs()).max(s.center[1].abs()).max(s.radius).max(limit);
    // Match the source's distance-limited enclosing square. Exceptional inputs
    // retain the original arc calculation and its exact result.
    if point.into_iter().chain(s.center).chain([s.radius,limit,s.facing,s.arc]).all(f64::is_finite)
        &&limit>=0.0&&s.radius>=0.0&&scale<=1e100{
        let reach=s.radius+limit+1e-7*scale;
        if (point[0]-s.center[0]).abs()>reach||(point[1]-s.center[1]).abs()>reach{return f64::INFINITY;}
    }
    shield_distance(s,point)
}
fn fuse_hull_may_be_near(s:&FuseShip<'_>,point:Point,limit:f64)->bool{
    if s.bounds.len()<3||!(limit>=0.0)||!s.facing.is_finite(){return true;}
    let mut reach=0.0f64;
    for vertex in s.bounds.iter(){
        if !vertex[0].is_finite()||!vertex[1].is_finite(){return true;}
        reach=reach.max(vertex[0].abs()+vertex[1].abs());
    }
    if !point.into_iter().chain(s.position).chain([reach,limit]).all(f64::is_finite){return true;}
    let scale=1.0f64.max(point[0].abs()).max(point[1].abs()).max(s.position[0].abs()).max(s.position[1].abs()).max(reach).max(limit);
    if !(scale<=1e100){return true;}
    let bound=reach+limit+1e-7*scale;
    !((point[0]-s.position[0]).abs()>bound||(point[1]-s.position[1]).abs()>bound)
}
pub fn hull_distance(s:&Ship,point:Point)->f64{
    hull_geometry_distance(s.position,s.facing,s.radius,&s.bounds,point)
}
fn hull_geometry_distance(position:Point,facing:f64,radius:f64,bounds:&[Point],point:Point)->f64{
    if bounds.len()<3{return (dist(point,position)-radius).max(0.0);}let p=contact::rotate(delta(point,position),-facing);if contact::contains(p,bounds){return 0.0;}
    let mut squared=f64::INFINITY;
    for i in 0..bounds.len(){let a=bounds[i];let b=bounds[(i+1)%bounds.len()];let d=delta(b,a);let len=d[0]*d[0]+d[1]*d[1];
        let t=if len>0.0{((p[0]-a[0])*d[0]+(p[1]-a[1])*d[1])/len}else{0.0}.clamp(0.0,1.0);
        let x=p[0]-a[0]-t*d[0];let y=p[1]-a[1]-t*d[1];squared=squared.min(x*x+y*y);
    }squared.sqrt()
}
pub fn explosion_contact(s:&Ship,origin:Point,ignore_shield:bool)->Contact{
    let mut point=origin;let p=local(s,origin);
    let inside=if s.bounds.len()<3{dist(origin,s.position)<=s.radius*0.82}else{contact::contains(p,&s.bounds)};
    if !inside{
        if s.bounds.len()>=3{let mut best=f64::INFINITY;for i in 0..s.bounds.len(){let a=s.bounds[i];let b=s.bounds[(i+1)%s.bounds.len()];let d=delta(b,a);let len=d[0]*d[0]+d[1]*d[1];
            let t=if len>0.0{((p[0]-a[0])*d[0]+(p[1]-a[1])*d[1])/len}else{0.0}.clamp(0.0,1.0);let q=[a[0]+d[0]*t,a[1]+d[1]*t];let distance=frame_hypot(delta(q,p));
            if distance<best{best=distance;point=world(s,q);}
        }}else{let direction=norm(delta(origin,s.position));point=[s.position[0]+direction[0]*s.radius,s.position[1]+direction[1]*s.radius];}
    }
    let hull=dist(point,origin);let shield=shield_distance(&s.shield,origin);
    if ignore_shield||shield>hull||!shield.is_finite(){return Contact{point,distance:hull,shield:false};}
    let radial=delta(origin,s.shield.center);let half=s.shield.arc.min(360.0)*PI/360.0;let angle=radial[1].atan2(radial[0])-s.shield.facing;
    let angle=s.shield.facing+angle.sin().atan2(angle.cos()).clamp(-half,half);
    Contact{point:[s.shield.center[0]+angle.cos()*s.shield.radius,s.shield.center[1]+angle.sin()*s.shield.radius],distance:shield,shield:true}
}
pub fn area_fraction(screens:&[Screen],s:&Ship,point:Point)->f64{
    let mut fraction:f64=1.0;for screen in screens{if s.allegiance.team().is_some_and(|t|Some(t)==screen.team){let d=delta(point,screen.center);
        if d[0]*d[0]+d[1]*d[1]<=screen.radius*screen.radius+1e-5{fraction=fraction.min(screen.fraction);}
    }}fraction
}
#[derive(Clone,Copy,Debug)]pub struct Absorption{pub flux:f64,pub absorbed:f64,pub remainder:f64}
#[derive(Clone,Copy,Debug)]pub struct Damage{pub armor:f64,pub hull:f64}
#[derive(Clone,Copy,Debug)]pub enum Layer{Shield,Armor,Hull}
#[derive(Clone,Copy,Debug)]pub enum Sound{Fuse,Missile{volume:f64}}
#[derive(Clone,Copy,Debug)]pub struct Smoke{pub position:Point,pub velocity:Point,pub life:f64,pub size:f64,pub max_size:f64,pub rotation:f64}
#[derive(Clone,Debug)]pub enum Output{
    Damage{player:bool,kind:u32,layer:Layer,amount:f64,emp:f64,target_player:Option<bool>},
    FloatingDamage{point:Point,amount:f64,color:[u8;3]},FloatingText{point:Point,kind:u32},
    Sound{point:Point,sound:Sound},AuthenticExplosion{point:Point,radius:f64,color:[u8;3],missile:bool},
    SourceExplosion{point:Point,spec:Spec},Sparks{point:Point,count:u32,color:[u8;3]},Smoke(Smoke),
    ArmorSparks{target:Identity,local:Point,damage:f64},ShieldRipple{point:Point},CameraShake,
    Radio{kind:u32,count:u32},ShotHit{player:bool},MissileIntercepted{player:bool},DetachContrail{target:Identity},
}
/// World reads occur after each synchronous mutation. Implementor retains
/// emitter rules after removal and all real terrain/death/effect closures.
pub trait Host{
    fn ships(&self)->Vec<Identity>;fn fighters(&self)->Vec<Identity>;fn capitals(&self)->Vec<Identity>;
    fn ship(&self,id:Identity)->Option<Ship>;fn missiles(&self)->Vec<Identity>;fn missile(&self,id:Identity)->Option<Missile>;
    /// Preserve unknown hosts' live lookup, while resident fuse queries may
    /// borrow geometry instead of calculating unrelated explosion damage views.
    fn fuse_ship(&self,id:Identity)->Option<FuseShip<'_>>{self.ship(id).map(FuseShip::from)}
    /// Default hosts retain list construction, every ordered live lookup and
    /// early return. Resident hosts can consume rows resolved during this borrow.
    fn visit_fuse_ships(&self,fighter:bool,visitor:&mut dyn FnMut(FuseShip<'_>)->bool)->bool{
        for id in if fighter{self.fighters()}else{self.capitals()}{
            if let Some(s)=self.fuse_ship(id){if visitor(s){return true;}}
        }false
    }
    /// One query's ordered, live reads. Unknown hosts retain every old lookup;
    /// resident hosts may project the same values directly while immutably borrowed.
    fn visit_interception_missiles(&self,visitor:&mut dyn FnMut(Missile)){
        for id in self.missiles(){if let Some(m)=self.missile(id){visitor(m);}}
    }
    fn asteroids(&self)->Vec<Identity>;fn asteroid(&self,id:Identity)->Option<Asteroid>;
    fn outgoing(&self,p:&Payload,target:Option<Identity>,point:Point)->f64;
    fn missile_damage(&self,p:&Payload,target:&Missile,damage:f64)->f64;
    fn absorb(&mut self,id:Identity,damage:f64,kind:u32,angle:f64)->Result<Absorption,u32>;
    fn shield_flux(&mut self,id:Identity,flux:f64,hard:bool)->Result<(),u32>;
    fn armor(&mut self,id:Identity,local:Point,damage:f64,kind:u32,strength:Option<f64>,visual:&mut Random)->Result<Damage,u32>;
    fn hull(&mut self,id:Identity,damage:f64)->Result<(),u32>;
    fn components(&mut self,id:Identity,local:Point,damage:Damage,emp:f64,source:u32,random:&mut Random)->Result<(),u32>;
    /// Production owners consume actual armor-particle RNG synchronously here.
    /// Record-only oracles may use the default without claiming full world FX.
    fn armor_sparks(&mut self,id:Identity,local:Point,damage:f64,_visual:&mut Random)->Result<(),u32>{
        self.output(Output::ArmorSparks{target:id,local,damage});Ok(())
    }
    fn destroy_if_dead(&mut self,id:Identity,random:&mut Random,visual:&mut Random)->Result<bool,u32>;
    fn subtract_missile_hp(&mut self,id:Identity,damage:f64)->Result<f64,u32>;
    fn remove_missile(&mut self,id:Identity)->Result<(),u32>;
    fn asteroid_impact(&mut self,p:&Payload,target:Identity,damage:f64,point:Point,random:&mut Random,visual:&mut Random)->Result<(),u32>;
    fn missile_visual(&mut self,id:Identity,point:Point,color:[u8;3],visual:&mut Random)->Result<(),u32>;
    fn interception_effect(&mut self,p:&Payload,target:Identity,point:Point,random:&mut Random,visual:&mut Random)->Result<(),u32>;
    fn ship_obstruction(&self,p:&Payload)->Option<f64>;fn asteroid_obstruction(&self,p:&Payload)->Option<f64>;fn wrecks(&self)->Vec<Wreck>;
    fn player_id(&self)->u32;fn output(&mut self,output:Output);
    fn visual_output(&mut self,output:Output,_visual:&mut Random)->Result<(),u32>{self.output(output);Ok(())}
}
pub fn screen_area<H:Host,F:Fn(f64)->f64>(p:&Payload,ship_ids:&[Identity],origin:Point,radius:f64,scale:F,host:&mut H,screens:&mut Vec<Screen>,visual:&mut Random)->Result<(),u32>{
    for &id in ship_ids{let Some(candidate)=host.ship(id)else{continue;};let Some(root)=host.ship(candidate.root)else{return Err(4);};
        if screens.iter().any(|s|s.root==root.identity)||root.allegiance.same(p.allegiance){continue;}
        let intercepted=p.void_blocked_root==Some(root.identity);
        if !intercepted&&(!root.shield.void||!root.shield.active||root.dead||root.collisionless){continue;}
        let radial=delta(origin,root.shield.center);let len=contact::length(radial);
        let screen=|fraction|Screen{root:root.identity,center:root.shield.center,radius:root.shield.radius,team:root.allegiance.team(),fraction};
        if intercepted{screens.push(screen(0.0));continue;}if len<root.shield.radius-0.001{continue;}
        let distance=(len-root.shield.radius).max(0.0);if distance>radius{continue;}let direction=norm(radial);
        let point=[root.shield.center[0]+direction[0]*root.shield.radius,root.shield.center[1]+direction[1]*root.shield.radius];
        let damage=p.damage*scale(distance)*host.outgoing(p,Some(root.identity),point)*root.cr_taken;if !(damage>0.0){continue;}
        let result=host.absorb(root.identity,damage,p.damage_type,radial[1].atan2(radial[0]))?;screens.push(screen(result.remainder));
        host.output(Output::Damage{player:p.allegiance.player.unwrap_or(false),kind:p.damage_type,layer:Layer::Shield,amount:result.absorbed,emp:0.0,target_player:root.allegiance.player});
        host.visual_output(Output::FloatingDamage{point,amount:result.absorbed,color:[120,185,255]},visual)?;
    }Ok(())
}
#[derive(Clone)]pub struct Explosion{
    pub payload:Payload,pub spec:Spec,pub position:Point,pub life:f64,pub screens:Vec<Screen>,
    pub ships:Vec<Identity>,pub asteroids:Vec<Identity>,pub missiles:Vec<Identity>,pub referenced_projectile:Option<f64>,
}
impl Explosion{
    pub fn new(p:Payload,spec:Spec,point:Point,ship:Option<Identity>,asteroid:Option<Identity>)->Result<Self,u32>{
        if !spec.valid(){return Err(2);}let missiles=vec![p.identity];Ok(Self{payload:p,spec,position:point,life:spec.duration,screens:Vec::new(),ships:ship.into_iter().collect(),asteroids:asteroid.into_iter().collect(),missiles,referenced_projectile:None})
    }
    pub fn apply<H:Host>(&mut self,host:&mut H,random:&mut Random,visual:&mut Random)->Result<(),u32>{
        let p=&self.payload;let spec=self.spec;let targets=host.ships();let screen_targets:Vec<_>=targets.iter().copied().filter(|id|!spec.collision.no_ff()||host.ship(*id).is_some_and(|s|!s.allegiance.same(p.allegiance))).collect();
        screen_area(p,&screen_targets,self.position,spec.radius,|d|spec.scale(d),host,&mut self.screens,visual)?;
        for id in targets{let Some(ship)=host.ship(id)else{continue;};
            if self.ships.contains(&id)||ship.dead||ship.collisionless||(ship.fighter&&!spec.collision.small())||(spec.collision.no_ff()&&ship.allegiance.same(p.allegiance)){continue;}
            let void=host.ship(ship.root).ok_or(4u32)?.shield.void;let hit=explosion_contact(&ship,self.position,void);if hit.distance>spec.radius{continue;}
            let fraction=area_fraction(&self.screens,&ship,hit.point);if fraction<=0.0{self.ships.push(id);continue;}
            let damage=p.damage*fraction*spec.scale(hit.distance)*host.outgoing(p,Some(id),hit.point);if damage<=0.0{continue;}self.ships.push(id);
            if hit.shield{let taken=damage*ship.cr_taken*ship.system_shield;let angle=delta(hit.point,ship.shield.center);let result=host.absorb(id,taken,p.damage_type,angle[1].atan2(angle[0]))?;
                host.shield_flux(id,result.flux,!p.soft_flux)?;let amount=taken*ship.shield_taken[p.damage_type as usize];host.output(Output::Damage{player:p.allegiance.player.unwrap_or(false),kind:p.damage_type,layer:Layer::Shield,amount,emp:0.0,target_player:ship.allegiance.player});host.visual_output(Output::FloatingDamage{point:hit.point,amount,color:[80,200,255]},visual)?;
            }else{let point=local(&ship,hit.point);let result=host.armor(id,point,damage*ship.cr_taken,p.damage_type,Some(damage),visual)?;
                host.hull(id,result.hull)?;host.components(id,point,result,0.0,p.source_ship,random)?;host.armor_sparks(id,point,result.armor,visual)?;
                for (layer,amount)in [(Layer::Armor,result.armor),(Layer::Hull,result.hull)]{host.output(Output::Damage{player:p.allegiance.player.unwrap_or(false),kind:p.damage_type,layer,amount,emp:0.0,target_player:ship.allegiance.player});}
                if result.armor>0.0{host.visual_output(Output::FloatingDamage{point:hit.point,amount:result.armor,color:[255,175,40]},visual)?;}if result.hull>0.0{host.visual_output(Output::FloatingDamage{point:hit.point,amount:result.hull,color:[255,55,45]},visual)?;}
                host.destroy_if_dead(id,random,visual)?;
            }
        }
        if spec.collision.small(){for id in host.missiles().into_iter().rev(){let Some(m)=host.missile(id)else{continue;};
            if m.collision_disabled||!m.rocket||m.did_damage||self.missiles.contains(&id)||(spec.collision.no_ff()&&m.allegiance.same(p.allegiance)){continue;}
            let distance=(dist(m.position,self.position)-m.radius).max(0.0);if distance>spec.radius{continue;}self.missiles.push(id);
            let raw=p.damage*spec.scale(distance)*host.outgoing(p,None,m.position);let damage=host.missile_damage(p,&m,raw);
            if host.subtract_missile_hp(id,damage)?<=0.0{host.output(Output::DetachContrail{target:id});if !m.allegiance.same(p.allegiance){host.output(Output::MissileIntercepted{player:p.allegiance.player.unwrap_or(false)});}host.remove_missile(id)?;}
        }}
        for id in host.asteroids(){let Some(a)=host.asteroid(id)else{continue;};if self.asteroids.contains(&id)||a.hp<=0.0{continue;}
            let radial=delta(a.position,self.position);let distance=(contact::length(radial)-a.radius).max(0.0);let damage=p.damage*spec.scale(distance);
            if distance>spec.radius||damage<=0.0{continue;}self.asteroids.push(id);let direction=norm(radial);let point=[self.position[0]+direction[0]*distance,self.position[1]+direction[1]*distance];
            host.asteroid_impact(p,id,damage,point,random,visual)?;
        }Ok(())
    }
}
#[derive(Clone,Default)]pub struct Explosions{pub active:Vec<Explosion>}
impl Explosions{
    pub fn spawn<H:Host>(&mut self,p:Payload,spec:Spec,point:Point,ship:Option<Identity>,asteroid:Option<Identity>,host:&mut H,random:&mut Random,visual:&mut Random)->Result<(),u32>{
        if spec.radius<=0.0{return Ok(());}let mut e=Explosion::new(p,spec,point,ship,asteroid)?;e.apply(host,random,visual)?;self.active.push(e);Ok(())
    }
    pub fn advance<H:Host>(&mut self,dt:f64,host:&mut H,random:&mut Random,visual:&mut Random)->Result<(),u32>{
        if dt<=0.0{return Ok(());}for index in (0..self.active.len()).rev(){let e=&mut self.active[index];e.life-=dt;
            if e.life< -1e-9{self.active.remove(index);continue;}e.position[0]+=e.payload.velocity[0]*dt;e.position[1]+=e.payload.velocity[1]*dt;e.apply(host,random,visual)?;
        }Ok(())
    }
}
pub fn hostile(p:&Payload,m:&Missile)->bool{
    if m.collision_disabled||m.identity==p.identity||m.source_ship==p.source_ship{return false;}
    if p.allegiance.player.is_none()||m.allegiance.player.is_none(){m.source_ship!=p.source_ship}else{!m.allegiance.same(p.allegiance)}
}
pub fn fuse_trigger<H:Host>(p:&Payload,fuse:Fuse,candidates:&[Identity],host:&H)->bool{
    for &id in candidates{if let Some(m)=host.missile(id).filter(|m|m.rocket&&hostile(p,m)){if dist(p.position,m.position)<=fuse.range{return true;}}}
    let eligible=|s:&FuseShip<'_>|s.identity.id!=p.source_ship as f64&&(p.allegiance.player.is_none()||!s.allegiance.same(p.allegiance))&&!s.dead&&!s.collisionless;
    if host.visit_fuse_ships(true,&mut |s|eligible(&s)&&dist(p.position,s.position)<=fuse.range+s.radius*0.7){return true;}
    if host.visit_fuse_ships(false,&mut |s|{
        if !eligible(&s){return false;}let limit=fuse.range*0.5;
        let shield=fuse_shield_distance(&s.shield,p.position,limit);
        if shield>limit&&!fuse_hull_may_be_near(&s,p.position,limit){return false;}
        shield.min(hull_geometry_distance(s.position,s.facing,s.radius,&s.bounds,p.position))<=limit
    }){return true;}p.range_remaining<=0.0
}
pub fn fuse_commit<H:Host>(p:&Payload,fuse:Fuse,host:&mut H,explosions:&mut Explosions,random:&mut Random,visual:&mut Random)->Result<(),u32>{
    fuse_commit_with_spawn(p,fuse,host,random,visual,&mut |host,p,s,point,r,v|explosions.spawn(p,s,point,None,None,host,r,v))
}
pub fn fuse_commit_with_spawn<H:Host,F>(p:&Payload,fuse:Fuse,host:&mut H,random:&mut Random,visual:&mut Random,spawn:&mut F)->Result<(),u32>
where F:FnMut(&mut H,Payload,Spec,Point,&mut Random,&mut Random)->Result<(),u32>{
    if let Some(spec)=fuse.source_explosion{let mut payload=p.clone();payload.velocity=[0.0;2];spawn(host,payload,spec,p.position,random,visual)?;
        host.output(Output::Sound{point:p.position,sound:Sound::Fuse});host.visual_output(Output::SourceExplosion{point:p.position,spec},visual)?;return Ok(());
    }
    let radius=if fuse.radius!=0.0{fuse.radius}else{45.0};host.output(Output::Sound{point:p.position,sound:Sound::Fuse});
    host.visual_output(Output::AuthenticExplosion{point:p.position,radius,color:[255,175,85],missile:false},visual)?;host.visual_output(Output::Sparks{point:p.position,count:32,color:[255,160,60]},visual)?;
    for index in 0..8{let angle=index as f64/8.0*PI*2.0+(visual.next()-0.5)*0.4;let speed=15.0+visual.next()*35.0;
        let position=[p.position[0]+(visual.next()-0.5)*16.0,p.position[1]+(visual.next()-0.5)*16.0];let life=0.7+visual.next()*0.4;
        let size=12.0+visual.next()*8.0;let max_size=32.0+visual.next()*16.0;let rotation=visual.next()*PI*2.0;
        host.output(Output::Smoke(Smoke{position,velocity:[angle.cos()*speed,angle.sin()*speed],life,size,max_size,rotation}));
    }
    let mut damaged=false;let mut intercepted=0;
    for id in host.missiles().into_iter().rev(){let Some(m)=host.missile(id).filter(|m|m.rocket&&hostile(p,m))else{continue;};let distance=dist(p.position,m.position);
        if distance>radius{continue;}let raw=p.damage*fuse.scale(distance)*host.outgoing(p,None,m.position);let damage=host.missile_damage(p,&m,raw);if damage<=0.0{continue;}
        let hp=host.subtract_missile_hp(id,damage)?;damaged=true;
        if hp<=0.0{host.output(Output::DetachContrail{target:id});host.remove_missile(id)?;host.output(Output::Sound{point:m.position,sound:Sound::Missile{volume:0.55}});
            host.missile_visual(id,m.position,[255,140,40],visual)?;host.visual_output(Output::FloatingText{point:m.position,kind:0},visual)?;intercepted+=1;
        }else{host.visual_output(Output::Sparks{point:m.position,count:10,color:[255,160,60]},visual)?;host.visual_output(Output::FloatingDamage{point:m.position,amount:damage,color:[255,180,70]},visual)?;}
    }
    if intercepted>0{host.output(Output::CameraShake);if p.source_ship==host.player_id()&&visual.next()<0.6{host.visual_output(Output::Radio{kind:0,count:intercepted},visual)?;}}
    let ids=host.ships();let fighter_ids=host.fighters();let source_team=p.allegiance.team();
    let screen_targets:Vec<_>=ids.iter().copied().filter(|id|source_team.is_none()||host.ship(*id).is_some_and(|s|s.allegiance.team()!=source_team)).collect();
    let mut fragmentation=p.clone();fragmentation.damage_type=3;let mut screens=Vec::new();screen_area(&fragmentation,&screen_targets,p.position,fuse.radius,|d|fuse.scale(d),host,&mut screens,visual)?;
    let mut visited=Vec::new();
    for id in ids{if visited.contains(&id){continue;}visited.push(id);let Some(s)=host.ship(id)else{continue;};
        if s.identity.id==p.source_ship as f64||source_team.is_some_and(|t|s.allegiance.team()==Some(t))||s.dead||s.collisionless{continue;}
        let void=host.ship(s.root).ok_or(4u32)?.shield.void;let hit=explosion_contact(&s,p.position,void);let fraction=area_fraction(&screens,&s,hit.point);if fraction<=0.0{continue;}
        let raw=p.damage*fraction*fuse.scale(hit.distance)*host.outgoing(p,Some(id),hit.point);if raw<=0.0{continue;}let taken=raw*s.cr_taken;damaged=true;
        if hit.shield{let damage=taken*s.system_shield;let radial=delta(hit.point,s.shield.center);let absorption=host.absorb(id,damage,3,radial[1].atan2(radial[0]))?;
            host.shield_flux(id,absorption.flux,true)?;host.output(Output::Damage{player:p.allegiance.player.unwrap_or(false),kind:3,layer:Layer::Shield,amount:damage*s.shield_taken[3],emp:0.0,target_player:None});host.output(Output::ShieldRipple{point:p.position});continue;
        }
        let local=local(&s,hit.point);let result=host.armor(id,local,taken,3,Some(raw),visual)?;host.components(id,local,result,0.0,p.source_ship,random)?;
        host.armor_sparks(id,local,result.armor,visual)?;
        if result.armor>0.0{host.output(Output::Damage{player:p.allegiance.player.unwrap_or(false),kind:3,layer:Layer::Armor,amount:result.armor,emp:0.0,target_player:None});}
        if result.hull>0.0{host.output(Output::Damage{player:p.allegiance.player.unwrap_or(false),kind:3,layer:Layer::Hull,amount:result.hull,emp:0.0,target_player:None});}
        host.hull(id,result.hull)?;let fighter=fighter_ids.contains(&id)||s.fighter;
        if fighter{let applied=result.armor+result.hull;if applied>0.0{host.visual_output(Output::FloatingDamage{point:s.position,amount:applied,color:[255,180,60]},visual)?;}host.visual_output(Output::Sparks{point:s.position,count:10,color:[255,120,40]},visual)?;}
        if host.destroy_if_dead(id,random,visual)?&&fighter{host.visual_output(Output::FloatingText{point:s.position,kind:1},visual)?;if p.source_ship==host.player_id(){host.visual_output(Output::Radio{kind:1,count:1},visual)?;}}
    }
    if damaged{host.output(Output::ShotHit{player:p.allegiance.player.unwrap_or(false)});}Ok(())
}
pub fn segment_circle(start:Point,end:Point,center:Point,radius:f64)->Option<f64>{
    let d=delta(end,start);let f=delta(start,center);let c=f[0]*f[0]+f[1]*f[1]-radius*radius;if c<=0.0{return Some(0.0);}let a=d[0]*d[0]+d[1]*d[1];if a<=1e-12{return None;}
    let b=2.0*(f[0]*d[0]+f[1]*d[1]);let disc=b*b-4.0*a*c;if disc<0.0{return None;}let t=(-b-disc.sqrt())/(2.0*a);if (0.0..=1.0).contains(&t){Some(t)}else{None}
}
fn near(a:Point,b:Point)->bool{(a[0]-b[0]).abs()<0.1&&(a[1]-b[1]).abs()<0.1}
fn edges(poly:&[Point])->Vec<(Point,Point)>{let mut result=Vec::new();for i in 0..poly.len(){let a=poly[i];let b=poly[(i+1)%poly.len()];if near(a,b)||poly.iter().enumerate().any(|(j,c)|j!=i&&near(b,*c)&&near(a,poly[(j+1)%poly.len()])){continue;}result.push((a,b));}result}
fn wreck_contains(p:Point,edges:&[(Point,Point)])->bool{let mut inside=false;for &(a,b)in edges{let d=delta(b,a);let len=d[0]*d[0]+d[1]*d[1];let t=((p[0]-a[0])*d[0]+(p[1]-a[1])*d[1])/if len==0.0{1.0}else{len};let t=t.clamp(0.0,1.0);if dist(p,[a[0]+d[0]*t,a[1]+d[1]*t])<0.00001{return true;}if (a[1]>p[1])!=(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0]{inside=!inside;}}inside}
pub fn wreck_hit(a:Point,b:Point,poly:&[Point])->Option<f64>{let edges=edges(poly);if wreck_contains(a,&edges){return Some(0.0);}let mut first=f64::INFINITY;
    for &(c,d)in &edges{let ab=delta(b,a);let cd=delta(d,c);let ca=delta(c,a);let den=ab[0]*cd[1]-ab[1]*cd[0];if den.abs()<1e-8{continue;}let t=(ca[0]*cd[1]-ca[1]*cd[0])/den;let u=(ca[0]*ab[1]-ca[1]*ab[0])/den;
        if (-1e-7..=1.0+1e-7).contains(&t)&&(-1e-7..=1.0+1e-7).contains(&u){first=first.min(t.clamp(0.0,1.0));}
    }if first.is_finite(){Some(first)}else if wreck_contains(b,&edges){Some(1.0)}else{None}
}
#[derive(Clone,Copy)]pub struct Interception{pub target:Identity,pub t:f64,pub point:Point}
pub fn interception_query<H:Host>(p:&Payload,host:&H)->Option<Interception>{
    if (p.rocket&&!p.intercepts_missiles&&p.target_projectile.is_none())||p.flare||p.did_damage{return None;}let mut best=None;let mut first=f64::INFINITY;
    host.visit_interception_missiles(&mut |m|{
        if !m.rocket||!hostile(p,&m)||p.damaged_projectiles.contains(&m.identity){return;}
        if p.rocket&&!p.intercepts_missiles&&(Some(m.identity)!=p.target_projectile||!m.flare||m.flare_fizzling){return;}
        if let Some(t)=segment_circle(p.previous,p.position,m.position,m.radius+if p.moving_ray{0.0}else{p.radius}){if t<first{first=t;best=Some(m.identity);}}
    });let target=best?;let mut limit=host.ship_obstruction(p).unwrap_or(f64::INFINITY).min(host.asteroid_obstruction(p).unwrap_or(f64::INFINITY));
    for w in host.wrecks(){let local=|v|{let q=contact::rotate(delta(v,w.position),-w.facing);[q[0]+w.local_offset[0],q[1]+w.local_offset[1]]};if let Some(t)=wreck_hit(local(p.previous),local(p.position),&w.bounds){limit=limit.min(t);}}
    if !(first<limit){return None;}Some(Interception{target,t:first,point:contact::lerp(p.previous,p.position,first)})
}
#[derive(Clone,Copy)]pub struct InterceptionResult{pub target:Identity,pub destroyed:bool,pub consumes:bool}
pub fn interception_commit<H:Host>(p:&mut Payload,hit:Interception,host:&mut H,explosions:&mut Explosions,source_spec:Option<Spec>,random:&mut Random,visual:&mut Random)->Result<InterceptionResult,u32>{
    interception_commit_with_spawn(p,hit,host,source_spec,random,visual,&mut |host,p,s,point,r,v|explosions.spawn(p,s,point,None,None,host,r,v))
}
pub fn interception_commit_with_spawn<H:Host,F>(p:&mut Payload,hit:Interception,host:&mut H,source_spec:Option<Spec>,random:&mut Random,visual:&mut Random,spawn:&mut F)->Result<InterceptionResult,u32>
where F:FnMut(&mut H,Payload,Spec,Point,&mut Random,&mut Random)->Result<(),u32>{
    let m=host.missile(hit.target).ok_or(4u32)?;let damage=host.missile_damage(p,&m,p.damage*host.outgoing(p,None,hit.point));host.subtract_missile_hp(hit.target,damage)?;
    host.interception_effect(p,hit.target,hit.point,random,visual)?;let destroyed=host.missile(hit.target).ok_or(4u32)?.hp<=0.0;
    if destroyed{host.output(Output::DetachContrail{target:hit.target});host.output(Output::MissileIntercepted{player:p.allegiance.player.unwrap_or(false)});host.output(Output::Sound{point:m.position,sound:Sound::Missile{volume:0.5}});host.missile_visual(hit.target,m.position,[255,160,40],visual)?;}
    else{host.visual_output(Output::Sparks{point:hit.point,count:8,color:[255,180,60]},visual)?;}
    host.output(Output::ShotHit{player:p.allegiance.player.unwrap_or(false)});p.damaged_projectiles.push(hit.target);if !p.pass_through_missiles{p.position=hit.point;}
    if p.rocket{host.output(Output::DetachContrail{target:p.identity});if let Some(spec)=source_spec{spawn(host,p.clone(),spec,hit.point,random,visual)?;}host.missile_visual(p.identity,hit.point,[255,160,40],visual)?;}
    Ok(InterceptionResult{target:hit.target,destroyed,consumes:!p.pass_through_missiles})
}
