//! Actual Web DroneSystem rules. Authored launcher data is installed once;
//! bodies, lifecycle stock, weapons and random streams remain resident owners.
use crate::{flight_world as f,navigation_ai::Controls,tactical_ai::Identity};
use std::f64::consts::PI;
#[derive(Clone,Copy,PartialEq,Eq,Default)]pub enum Order{#[default]Recall,Deploy,Attack}
#[derive(Clone,Copy,PartialEq,Eq)]pub enum Priority{Missile,Fighter,Ship}
#[derive(Clone,Copy,PartialEq,Eq)]pub enum Facing{Away,Drone,Ship}
#[derive(Clone)]pub struct Slot{pub position:f::Vec2,pub angle:f64}
#[derive(Clone)]pub struct Ring{pub indices:Vec<usize>,pub initial:f64,pub radius:f64,pub direction:f64,pub speed:f64,
    pub facing:Facing,pub face_enemy:bool,pub hold:f64,pub free:f64,pub priorities:Vec<Priority>}
#[derive(Clone)]pub struct Config{pub template:String,pub max_drones:usize,pub delay:f64,pub speed:f64,pub free:bool,
    pub regen:f64,pub regen_multiplier:f64,pub sensor:bool,pub slots:Vec<Slot>,pub rings:Vec<Ring>}
impl Config{pub fn valid(&self)->bool{!self.template.is_empty()&&self.max_drones>0&&self.max_drones<=65536&&!self.rings.is_empty()
    &&[self.delay,self.speed,self.regen,self.regen_multiplier].iter().all(|v|v.is_finite()&&*v>=0.0)
    &&self.slots.len()<=65536&&self.slots.iter().all(|s|[s.position.x,s.position.y,s.angle].iter().all(|v|v.is_finite()))
    &&self.rings.len()<=65536&&self.rings.iter().all(|r|[r.initial,r.radius,r.direction,r.speed,r.hold,r.free].iter().all(|v|v.is_finite())
        &&r.indices.len()<=65536&&r.priorities.len()<=65536)}}
#[derive(Clone)]pub struct Craft{pub identity:Identity,pub slot:Slot}
#[derive(Clone)]pub struct Launcher{pub carrier:Identity,pub system:u32,pub config:Config,pub order:Order,
    pub drones:Vec<Craft>,pub elapsed:f64,pub regen:f64,pub slot:f64,pub angles:Vec<f64>,pub effect_count:f64}
impl Launcher{pub fn new(carrier:Identity,system:u32,config:Config)->Result<Self,f::Error>{
    if carrier.generation==0||system==0||!config.valid(){return Err(f::Error::InvalidTopology);}
    let angles=config.rings.iter().map(|r|r.initial*PI/180.0).collect();Ok(Self{carrier,system,config,order:Order::Recall,
        drones:Vec::new(),elapsed:0.0,regen:0.0,slot:0.0,angles,effect_count:0.0})}}
#[derive(Clone,Default)]pub struct Owned{pub launchers:Vec<Launcher>,pub registered:Vec<(Identity,u32)>}
pub struct Read{pub body:f::Body,pub fighter:bool,pub acceleration:f64,pub range:f64,pub center:f::Vec2,
    pub shield_radius:f64,pub shield_active:bool,pub can_shield:bool}
pub struct Stock{pub maximum:f64,pub charges:f64,pub disabled:bool,pub available:bool}
pub struct Missile{pub identity:Identity,pub team:u32,pub player:Option<bool>,pub rocket:bool,pub flare:bool,
    pub hp:f64,pub disarmed:bool,pub remaining:f64,pub pos:f::Vec2,pub radius:f64}
pub trait Host:f::Host{
    fn drone_read(&self,h:Identity)->Result<Read,f::Error>;
    fn stock(&self,carrier:Identity,system:u32)->Result<Stock,f::Error>;
    fn stock_set(&mut self,carrier:Identity,system:u32,charges:f64)->Result<(),f::Error>;
    fn drone_spawn(&mut self,carrier:Identity,config:&Config,slot:&Slot)->Result<Identity,f::Error>;
    fn drone_missiles(&self)->Result<Vec<Missile>,f::Error>;
    fn orphan(&mut self,h:Identity)->Result<(),f::Error>;
    fn dock(&mut self,h:Identity)->Result<(),f::Error>;
    fn current_target(&mut self,h:Identity,target:Option<Identity>)->Result<(),f::Error>;
    fn autofire(&mut self,h:Identity,on:bool)->Result<(),f::Error>;
    fn sensor(&mut self,h:Identity,count:f64)->Result<(),f::Error>;
}

/// Bounded one-time certificate, sharing flight's real template dictionary.
pub fn decode(v:&crate::flight_static_wire::Value,bodies:&[crate::state::Body],statics:&std::collections::BTreeMap<String,crate::flight_owner::StaticShip>,
    specs:&std::collections::BTreeMap<u32,crate::lifecycle::Spec>)->Result<Owned,u32>{
    use crate::flight_static_wire::Value;fn text(v:&Value)->Result<String,u32>{let s=v.text()?;if s.is_empty(){Err(8)}else{Ok(s.into())}}
    let mut p=v.object()?;let mut out=Owned::default();for v in p.get("launchers")?.array()?{let mut l=v.object()?;let mut h=l.get("carrier")?.object()?;
        let carrier=Identity{handle:h.get("slot")?.int()?,generation:h.get("generation")?.int()?};h.done()?;let system=l.get("system")?.int()?;
        let body=bodies.iter().find(|b|b.handle.slot==carrier.handle&&b.handle.generation==carrier.generation).ok_or(4u32)?;
        let life=body.ship.as_ref().and_then(|s|s.systems.iter().find(|s|s.id==system)).ok_or(8u32)?;let spec=specs.get(&life.spec).ok_or(8u32)?;
        if spec.max_charges<0.0||spec.max_charges.fract()!=0.0{return Err(8);}
        let mut c=l.get("config")?.object()?;let template=text(c.get("template")?)?;let t=statics.get(&template).ok_or(8u32)?;t.validate(specs).map_err(crate::flight_runtime::error)?;
        if t.spawn_admission.is_none(){return Err(8);}let max_drones=c.get("maxDrones")?.int()?as usize;
        let delay=c.get("launchDelay")?.number()?;let speed=c.get("launchSpeed")?.number()?;let free=c.get("allowFreeRoam")?.bool()?;
        let regen=c.get("regen")?.number()?;let regen_multiplier=c.get("regenMultiplier")?.number()?;let sensor=c.get("sensor")?.bool()?;
        let slots=c.get("slots")?.array()?.iter().map(|v|{let mut s=v.object()?;let[x,y]=s.get("position")?.numbers()?;
            let slot=Slot{position:f::Vec2{x,y},angle:s.get("angle")?.number()?};s.done()?;Ok(slot)}).collect::<Result<Vec<_>,u32>>()?;
        let rings=c.get("rings")?.array()?.iter().map(|v|{let mut r=v.object()?;
            let ring=Ring{indices:r.get("indices")?.array()?.iter().map(|v|v.int().map(|n|n as usize)).collect::<Result<_,_>>()?,initial:r.get("initial")?.number()?,
                radius:r.get("radius")?.number()?,direction:r.get("direction")?.number()?,speed:r.get("speed")?.number()?,
                facing:match r.get("facing")?.text()?{"AWAY"=>Facing::Away,"DRONE"=>Facing::Drone,"SHIP"=>Facing::Ship,_=>return Err(8)},
                face_enemy:r.get("faceEnemy")?.bool()?,hold:r.get("hold")?.number()?,free:r.get("free")?.number()?,
                priorities:r.get("priorities")?.array()?.iter().map(|v|Ok(match v.text()?{"MISSILE"=>Priority::Missile,"FIGHTER"=>Priority::Fighter,"SHIP"=>Priority::Ship,_=>return Err(8)})).collect::<Result<_,u32>>()?};r.done()?;Ok(ring)}).collect::<Result<Vec<_>,u32>>()?;
        c.done()?;l.done()?;out.admit(Launcher::new(carrier,system,Config{template,max_drones,delay,speed,free,regen,regen_multiplier,sensor,slots,rings}).map_err(crate::flight_runtime::error)?).map_err(crate::flight_runtime::error)?;
    }p.done()?;Ok(out)
}
fn active<H:Host>(h:&H,craft:&Craft)->Result<bool,f::Error>{let c=h.drone_read(craft.identity)?.body;Ok(!c.dead&&!c.docked&&c.hp>0.0)}
fn filtered<H:Host>(h:&H,crafts:&[Craft])->Result<Vec<Craft>,f::Error>{let mut out=Vec::new();for c in crafts{if active(h,c)?{out.push(c.clone());}}Ok(out)}
impl Owned{
    pub fn admit(&mut self,l:Launcher)->Result<(),f::Error>{if self.launchers.iter().any(|a|a.carrier==l.carrier&&a.system==l.system)
        ||l.elapsed!=0.0||l.regen!=0.0||l.slot!=0.0||l.effect_count!=0.0||!l.drones.is_empty(){return Err(f::Error::InvalidTopology);}self.launchers.push(l);Ok(())}
    pub fn has(&self,carrier:Identity,system:u32)->bool{self.launchers.iter().any(|l|l.carrier==carrier&&l.system==system)}
    pub fn activate(&mut self,carrier:Identity,system:u32)->Result<(),f::Error>{let l=self.launchers.iter_mut().find(|l|l.carrier==carrier&&l.system==system).ok_or(f::Error::UnknownTemplate)?;
        l.order=match l.order{Order::Recall=>Order::Deploy,Order::Deploy if l.config.free=>Order::Attack,_=>Order::Recall};Ok(())}
    pub fn ai<H:Host>(&mut self,h:&H,carrier:Identity,system:u32,distance:f64,withdrawing:bool)->Result<(),f::Error>{
        if !distance.is_finite(){return Err(f::Error::InvalidNumber);}let b=h.drone_read(carrier)?.body;
        if b.dead||b.overloaded||b.venting{return Ok(());}let l=self.launchers.iter_mut().find(|l|l.carrier==carrier&&l.system==system).ok_or(f::Error::UnknownTemplate)?;
        if withdrawing&&distance>2500.0{l.order=Order::Recall;}else if distance<2500.0{l.order=if withdrawing||!l.config.free{Order::Deploy}else{Order::Attack};}Ok(())}
    /// Called at the source onAdvance dispatch, after the shared batch.
    pub fn advance<H:Host>(&mut self,h:&mut H,carrier:Identity,system:u32,dt:f64)->Result<(),f::Error>{
        let index=self.launchers.iter().position(|l|l.carrier==carrier&&l.system==system).ok_or(f::Error::UnknownTemplate)?;
        let b=h.drone_read(carrier)?.body;if !dt.is_finite()||dt<=0.0||b.dead||b.retreated{return Ok(());}
        let key=(carrier,system);if !self.registered.contains(&key){self.registered.push(key);}
        let l=&mut self.launchers[index];l.drones=filtered(h,&l.drones)?;let stock=h.stock(carrier,system)?;
        let capacity=(stock.maximum-l.drones.len()as f64).max(0.0);let mut charges=stock.charges.min(capacity);
        if charges<capacity{l.regen+=dt*l.config.regen*l.config.regen_multiplier;let add=(capacity-charges).min(l.regen.floor());charges+=add;l.regen-=add;}else{l.regen=0.0;}
        l.elapsed+=dt;h.stock_set(carrier,system,charges)?;
        if l.order!=Order::Recall&&charges!=0.0&&l.drones.len()<l.config.max_drones&&!stock.disabled&&!b.overloaded&&!b.venting&&!b.phased
            &&l.elapsed>=l.config.delay&&!l.config.slots.is_empty(){
            if !l.slot.is_finite()||l.slot>=9_007_199_254_740_991.0{return Err(f::Error::InvalidNumber);}
            let slot=l.config.slots[(l.slot%l.config.slots.len()as f64)as usize].clone();let craft=h.drone_spawn(carrier,&l.config,&slot)?;
            l.drones.push(Craft{identity:craft,slot});charges-=1.0;l.slot+=1.0;l.elapsed=0.0;h.stock_set(carrier,system,charges)?;}
        if l.config.sensor{let count=filtered(h,&l.drones)?.len()as f64;let d=count-l.effect_count;
            l.effect_count+=if d==0.0{d}else{d.signum()*d.abs().min(2.0*dt)};h.sensor(carrier,l.effect_count)?;}Ok(())
    }
    pub fn reset<H:Host>(&mut self,h:&mut H,carrier:Identity,system:u32)->Result<(),f::Error>{let index=self.launchers.iter().position(|l|l.carrier==carrier&&l.system==system).ok_or(f::Error::UnknownTemplate)?;
        let config=self.launchers[index].config.clone();for c in &self.launchers[index].drones{h.dock(c.identity)?;h.clear_input(c.identity)?;}h.sensor(carrier,0.0)?;
        // onReset deletes only the source WeakMap deployment; DroneSystem's
        // launcher Map still contains its insertion-order entry.
        self.launchers[index]=Launcher::new(carrier,system,config)?;Ok(())}
    pub fn validate(&self,bodies:&[crate::state::Body],statics:&std::collections::BTreeMap<String,crate::flight_owner::StaticShip>)->Result<(),f::Error>{
        for(i,l)in self.launchers.iter().enumerate(){if !l.config.valid()||!statics.contains_key(&l.config.template)
            ||self.launchers[..i].iter().any(|p|p.carrier==l.carrier&&p.system==l.system)||l.angles.len()!=l.config.rings.len()
            ||[l.elapsed,l.regen,l.slot,l.effect_count].iter().chain(&l.angles).any(|n|!n.is_finite())
            ||l.elapsed<0.0||l.slot<0.0||l.slot.fract()!=0.0{return Err(f::Error::InvalidTopology);}
            let carrier=bodies.iter().find(|b|b.handle.slot==l.carrier.handle&&b.handle.generation==l.carrier.generation).ok_or(f::Error::StaleIdentity)?;
            if !carrier.ship.as_ref().is_some_and(|s|s.systems.iter().any(|s|s.id==l.system)){return Err(f::Error::InvalidTopology);}
            for(j,c)in l.drones.iter().enumerate(){if l.drones[..j].iter().any(|p|p.identity==c.identity)||!bodies.iter().any(|b|b.handle.slot==c.identity.handle&&b.handle.generation==c.identity.generation){return Err(f::Error::StaleIdentity);}}
        }
        for(i,k)in self.registered.iter().enumerate(){if self.registered[..i].contains(k)||!self.has(k.0,k.1){return Err(f::Error::InvalidTopology);}}Ok(())
    }
    /// Every source candidate and tie retains its captured insertion order.
    pub fn collect<H:Host>(&mut self,h:&mut H,dt:f64)->Result<(),f::Error>{if !dt.is_finite()||dt<0.0{return Err(f::Error::InvalidNumber);}
        let scope=h.fire_roster()?;let missiles=h.drone_missiles()?;let mut keep=Vec::new();
        for key in self.registered.clone(){let index=self.launchers.iter().position(|l|(l.carrier,l.system)==key).ok_or(f::Error::InvalidTopology)?;
            let l=&mut self.launchers[index];let carrier=h.drone_read(l.carrier)?;
            if carrier.body.dead||carrier.body.retreated||carrier.body.hp<=0.0||!scope.contains(&l.carrier){
                for c in &l.drones{h.orphan(c.identity)?;h.clear_input(c.identity)?;h.set_shield(c.identity,false)?;}continue;}
            keep.push(key);l.drones=filtered(h,&l.drones)?;
            for (i,r)in l.config.rings.iter().enumerate(){let radius=(carrier.shield_radius+r.radius).max(1.0);l.angles[i]+=r.direction*r.speed/radius*dt;}
            for (index,c)in l.drones.iter().enumerate(){let craft=h.drone_read(c.identity)?;
                let ring_index=l.config.rings.iter().position(|r|r.indices.contains(&index)).unwrap_or(0);let ring=&l.config.rings[ring_index];
                let members:Vec<_>=l.drones.iter().enumerate().filter(|(i,_)|ring.indices.contains(i)).map(|(_,c)|c.identity).collect();
                let member=members.iter().position(|id|*id==c.identity).map_or(-1.0,|i|i as f64);
                let angle=carrier.body.facing+l.angles[ring_index]+member/members.len().max(1)as f64*PI*2.0*ring.direction;
                let radius=(carrier.shield_radius+ring.radius).max(1.0);let radial=f::Vec2{x:angle.cos()*radius,y:angle.sin()*radius};
                let orbital=carrier.center.add(radial);let tangent=angle+PI/2.0;
                let mut goal=orbital;let mut velocity=carrier.body.vel.add(f::Vec2{x:tangent.cos()*(ring.speed*ring.direction),y:tangent.sin()*(ring.speed*ring.direction)});
                let mut facing=match ring.facing{Facing::Away=>craft.body.pos.sub(carrier.body.pos).angle(),Facing::Drone if craft.body.vel.len()>5.0=>craft.body.vel.angle(),_=>carrier.body.facing};
                let roam=if l.order==Order::Attack{ring.free}else{ring.hold};let mut eligible=Vec::new();
                for &other in &scope{let o=h.drone_read(other)?;if !o.body.dead&&h.visible(other,craft.body.team)?&&o.body.hp>0.0&&!o.body.phased&&o.body.team!=craft.body.team
                    &&o.body.pos.sub(orbital).len()<=craft.range+roam+o.body.spec.radius{eligible.push(o);}}
                let mut target=None;for priority in &ring.priorities{let mut best=None;let mut distance=f64::INFINITY;
                    match priority{Priority::Missile=>for p in &missiles{if p.rocket&&p.player.is_some()&&p.team as f64!=craft.body.team&&!p.flare&&p.hp>0.0&&!p.disarmed&&p.remaining>0.0
                        &&p.pos.sub(orbital).len()<=craft.range+roam+p.radius{let d=p.pos.sub(craft.body.pos).len();if best.is_none()||d<distance{best=Some((None,p.pos));distance=d;}}},
                        _=>for o in &eligible{if o.fighter==(*priority==Priority::Fighter){let d=o.body.pos.sub(craft.body.pos).len();if best.is_none()||d<distance{best=Some((Some(o.body.identity),o.body.pos));distance=d;}}}}
                    if best.is_some(){target=best;break;}}
                let current=target.and_then(|t|t.0);h.current_target(c.identity,current)?;
                if l.order==Order::Recall{goal=carrier.body.pos.add(c.slot.position.rotate(carrier.body.facing));velocity=carrier.body.vel;
                    if craft.body.pos.sub(goal).len()<35.0{h.dock(c.identity)?;h.clear_input(c.identity)?;let stock=h.stock(l.carrier,l.system)?;h.stock_set(l.carrier,l.system,stock.maximum.min(stock.charges+1.0))?;
                        continue;}
                }else if let Some((_,pos))=target{if ring.face_enemy{facing=pos.sub(craft.body.pos).angle();}if roam>0.0{let approach=pos.sub(orbital);let length=approach.len();if length>0.0{goal=goal.add_scaled(approach,roam.min((length-craft.range*0.8).max(0.0))/length);}}}
                let delta=goal.sub(craft.body.pos);let desired=velocity.add(delta.scale(2.0));let correction=desired.sub(craft.body.vel).rotate(-craft.body.facing);
                let turn=(facing-craft.body.facing).sin().atan2((facing-craft.body.facing).cos())*3.0-craft.body.angular;
                let aim=target.map_or(craft.body.pos.add(f::Vec2{x:facing.cos()*1000.0,y:facing.sin()*1000.0}),|t|t.1);
                h.commands(c.identity,f::Commands{controls:Controls{turn:turn.clamp(-1.0,1.0),brake:false,throttle:(correction.x/(craft.acceleration*0.5).max(1.0)).clamp(-1.0,1.0),strafe:(correction.y/(craft.acceleration*0.5).max(1.0)).clamp(-1.0,1.0)},
                    ai:l.order!=Order::Recall,firing:false,hold:craft.body.hold,aim,target:current})?;
                h.autofire(c.identity,l.order!=Order::Recall)?;if target.is_some()&&craft.can_shield&&!craft.shield_active{h.set_shield(c.identity,true)?;}
                h.enqueue_ship_step(c.identity,dt,current,f::FirePermission::World)?;
            }
            let mut kept=Vec::new();for c in &l.drones{if !h.drone_read(c.identity)?.body.docked{kept.push(c.clone());}}l.drones=kept;
        }self.registered=keep;Ok(())
    }
}
