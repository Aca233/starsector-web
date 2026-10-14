//! Actual retained MineSystem and shared StealthMinefield authority. The missile
//! lives only in Ordnance; this owner retains the source mine timer and queues.
use crate::{battle::Ordnance,contact::{self,Point},explosion_effects as e,lifecycle::Spec as SystemSpec,
    projectile::{Delivery,Projectile},random::Random,ship_effects,ship_state::{self,Notice},
    state::{Body,Handle},weapon_fire::{Emission,EmissionKind},world_owner as w};
use std::{collections::BTreeMap,f64::consts::PI};

fn sub(a:Point,b:Point)->Point{[a[0]-b[0],a[1]-b[1]]}
fn distance(a:Point,b:Point)->f64{contact::length(sub(a,b))}
fn normalized(p:Point)->Point{let n=contact::length(p);if n>0.00001{[p[0]/n,p[1]/n]}else{p}}
fn offset(p:Point,angle:f64,r:f64)->Point{[p[0]+angle.cos()*r,p[1]+angle.sin()*r]}
fn flag(v:bool)->f64{v as u32 as f64}

/// Installed directly from actual generated light/heavy mine specifications.
#[derive(Clone)]pub struct MineSpec{
    pub weapon:u32,pub damage:f64,pub speed:f64,pub hp:f64,pub radius:f64,pub visual_radius:f64,
    pub acceleration:f64,pub trigger:f64,pub delay:f64,pub windup:f64,pub explosion:e::Spec,
    pub color:[u8;3],pub glow:[u8;3],pub ping_sound:String,pub windup_sound:String,
}
impl MineSpec{
    /// weapon, damage, speed, hp, radius, visual radius, acceleration, trigger,
    /// delay, windup, blast radius/core/duration, explosion RGB, glow RGB.
    pub fn new(row:&[f64])->Result<Self,u32>{if row.len()!=19||row.iter().any(|v|!v.is_finite())||!matches!(row[0],1.0|2.0)||row[13..19].iter().any(|v|v.fract()!=0.0||!(0.0..=255.0).contains(v)){return Err(2);}
        let s=Self{weapon:row[0]as u32,damage:row[1],speed:row[2],hp:row[3],radius:row[4],visual_radius:row[5],acceleration:row[6],trigger:row[7],delay:row[8],windup:row[9],
            explosion:e::Spec{radius:row[10],core:row[11],duration:row[12],minimum_fraction:0.5,collision:e::Collision::MissileFF},
            color:[row[13]as u8,row[14]as u8,row[15]as u8],glow:[row[16]as u8,row[17]as u8,row[18]as u8],ping_sound:"mine_ping".into(),windup_sound:"mine_windup_heavy".into()};
        if !s.valid(){return Err(2);}Ok(s)
    }
    pub fn valid(&self)->bool{matches!(self.weapon,1|2)&&self.damage>0.0&&[self.damage,self.speed,self.hp,self.radius,self.visual_radius,self.acceleration,self.trigger,self.delay,self.windup].into_iter().all(|v|v.is_finite()&&v>=0.0)
        &&self.explosion.valid()&&!self.ping_sound.is_empty()&&!self.windup_sound.is_empty()}
}
/// effectiveHullModWeaponSpec is resolved once for both retained payloads.
#[derive(Clone,Copy)]pub struct Payload{pub damage:f64,pub launch_speed:f64,pub hp:f64,pub flight:f64}
impl Payload{pub fn valid(self)->bool{[self.damage,self.launch_speed,self.hp,self.flight].into_iter().all(f64::is_finite)}}
#[derive(Clone)]pub struct ShipMeta{
    pub identity:e::Identity,pub handle:Handle,pub payloads:[Payload;2],
    pub stealth:Option<u32>,pub ineligible:bool,pub drone:bool,pub travel_systems:Vec<u32>,
}
#[derive(Clone)]pub struct Mine{
    pub serial:f64,pub id:f64,pub weapon:u32,pub source:e::Identity,pub source_handle:Handle,pub player:Option<bool>,pub team:u32,
    pub position:Point,pub velocity:Point,pub age:f64,pub fade_in:f64,pub rotation:f64,pub windup_played:bool,pub timer:f64,pub detonating:bool,
    pub trigger:f64,pub visual_radius:f64,pub damage:f64,pub source_multiplier:f64,pub life:f64,
}
#[derive(Clone)]pub struct Incoming{pub point:Point,pub target:e::Identity,pub delay:f64}
#[derive(Clone)]pub struct Minefield{pub source:e::Identity,pub weapon:u32,pub remaining:f64,pub incoming:Vec<Incoming>}
#[derive(Clone,Default)]pub struct Owned{pub specs:BTreeMap<u32,MineSpec>,pub ships:Vec<ShipMeta>,pub mines:Vec<Mine>,pub explosions:Vec<e::Explosion>,pub field:Option<Minefield>,pub hooks:Vec<(Handle,u32)>}
impl Owned{
    pub fn valid(&self)->bool{self.specs.values().all(MineSpec::valid)&&self.ships.iter().all(|s|s.payloads.iter().all(|p|p.valid()))
        &&self.mines.iter().all(|m|[m.serial,m.id,m.position[0],m.position[1],m.velocity[0],m.velocity[1],m.age,m.fade_in,m.rotation,m.timer,m.trigger,m.visual_radius,m.damage,m.source_multiplier,m.life].into_iter().all(f64::is_finite))
        &&self.explosions.iter().all(|e|e.spec.valid()&&e.life.is_finite()&&e.position.into_iter().all(f64::is_finite)&&e.payload.damage.is_finite())
        &&self.field.as_ref().is_none_or(|f|f.remaining.is_finite()&&f.incoming.iter().all(|i|i.point.into_iter().all(f64::is_finite)&&i.delay.is_finite()))}
    pub fn install_spec(&mut self,s:MineSpec)->Result<(),u32>{if !s.valid()||self.specs.contains_key(&s.weapon){return Err(2);}self.specs.insert(s.weapon,s);Ok(())}
    pub fn install_ship(&mut self,m:ShipMeta)->Result<(),u32>{if self.ships.iter().any(|s|s.identity==m.identity||s.handle==m.handle)||!m.payloads.iter().all(|p|p.valid())||m.stealth.is_some_and(|w|!matches!(w,1|2)){return Err(2);}self.ships.push(m);Ok(())}
    pub fn validate(&self,bodies:&[Body],ordnance:&Ordnance)->Result<(),u32>{for m in &self.ships{let b=bodies.iter().find(|b|w::identity(b)==m.identity&&b.handle==m.handle).ok_or(4u32)?;
        if b.ship.as_ref().and_then(|s|s.combat.as_ref()).is_none(){return Err(8);}if m.stealth.is_some_and(|w|!self.specs.contains_key(&w)){return Err(8);}}
        for m in &self.mines{if !self.specs.contains_key(&m.weapon)||!self.ships.iter().any(|s|s.identity==m.source&&s.handle==m.source_handle){return Err(8);}
            if let Some(p)=ordnance.projectiles.iter().find(|p|p.serial==m.serial){if !p.delivery.is_mine||p.id!=m.id{return Err(8);}}}
        if let Some(f)=&self.field{if !self.ships.iter().any(|s|s.identity==f.source)||!self.specs.contains_key(&f.weapon){return Err(8);}}Ok(())
    }
    pub fn clear(&mut self){self.mines.clear();self.explosions.clear();}
    /// Read-only render/recovery witness. Stealth source persists across clear,
    /// exactly as the source WeakMap does for the same combatScope.
    pub fn words(&self)->Vec<f64>{let mut out=vec![1.0,self.mines.len()as f64];for m in &self.mines{out.extend([m.serial,m.id,m.weapon as f64,m.source.id,m.source.generation as f64,m.team as f64,flag(m.player.is_some()),flag(m.player.unwrap_or(false))]);
        out.extend(m.position);out.extend(m.velocity);out.extend([m.age,m.fade_in,m.rotation,flag(m.windup_played),m.timer,flag(m.detonating),m.trigger,m.visual_radius,m.damage,m.source_multiplier,m.life]);}
        out.push(self.explosions.len()as f64);for e in &self.explosions{out.extend(e.position);out.extend([e.life,e.ships.len()as f64,e.asteroids.len()as f64,e.missiles.len()as f64]);}
        out.push(flag(self.field.is_some()));if let Some(f)=&self.field{out.extend([f.source.id,f.source.generation as f64,f.weapon as f64,f.remaining,f.incoming.len()as f64]);for i in &f.incoming{out.extend(i.point);out.extend([i.target.id,i.target.generation as f64,i.delay]);}}out
    }
}
/// All services execute inside the Rust transaction. No defaults can silently
/// omit domain registration, retirement, or actual then-live phase eligibility.
pub trait Services{
    fn projectile_spawned(&mut self,world:&mut w::Owned,p:&Projectile)->Result<(),u32>;
    fn projectile_retired(&mut self,world:&mut w::Owned,p:&Projectile)->Result<(),u32>;
    fn phased(&self,bodies:&[Body],world:&w::Owned,specs:&BTreeMap<u32,SystemSpec>,id:e::Identity)->Result<bool,u32>;
}
#[derive(Clone,Default)]pub struct SpawnOptions{pub life:Option<f64>,pub fade_in:Option<f64>,pub sound:Option<String>,pub stationary:bool,pub facing:Option<f64>}
pub struct Host<'a,S:Services>{pub bodies:&'a mut[Body],pub specs:&'a BTreeMap<u32,SystemSpec>,pub ordnance:&'a mut Ordnance,pub world:&'a mut w::Owned,pub owned:&'a mut Owned,pub services:&'a mut S,pub events:&'a mut Vec<(u32,Handle,Notice)>}
impl<S:Services> Host<'_,S>{
    fn row(&self,id:e::Identity)->Result<usize,u32>{let meta=self.owned.ships.iter().find(|m|m.identity==id).ok_or(4u32)?;self.bodies.iter().position(|b|w::identity(b)==id&&b.handle==meta.handle).ok_or(4u32)}
    fn roster(&self)->Vec<e::Identity>{self.world.rows(self.bodies).expect("validated world scope").into_iter().filter_map(|i|{let b=&self.bodies[i];b.ship.as_ref().filter(|s|s.flags&(ship_state::DOCKED|ship_state::RETREATED)==0).map(|_|w::identity(b))}).collect()}
    fn world_host(&mut self)->w::Host<'_>{w::Host{bodies:self.bodies,specs:self.specs,ordnance:self.ordnance,owned:self.world,events:self.events}}
    fn remove(&mut self,serial:f64)->Result<(),u32>{if let Some(index)=self.ordnance.projectiles.iter().position(|p|p.serial==serial){let p=self.ordnance.projectiles.remove(index);self.services.projectile_retired(self.world,&p)?;self.world.retired_projectiles.push(p);}Ok(())}
    fn sync(&mut self,m:&Mine){if let Some(p)=self.ordnance.projectiles.iter_mut().find(|p|p.serial==m.serial){p.pos=m.position;p.velocity=m.velocity;}}
    pub fn spawn(&mut self,point:Point,source:e::Identity,weapon:u32,options:SpawnOptions,random:&mut Random,visual:&mut Random)->Result<f64,u32>{
        if !point.into_iter().all(f64::is_finite)||options.life.is_some_and(|x|!x.is_finite())||options.fade_in.is_some_and(|x|!x.is_finite())||options.facing.is_some_and(|x|!x.is_finite()){return Err(2);}
        let spec=self.owned.specs.get(&weapon).ok_or(8u32)?.clone();let row=self.row(source)?;let meta=self.owned.ships.iter().find(|m|m.identity==source).unwrap();let payload=meta.payloads[(weapon-1)as usize];
        self.world_host().refresh(row)?;let b=&self.bodies[row];let s=b.ship.as_ref().ok_or(8u32)?;let c=s.combat.as_ref().ok_or(8u32)?;
        let support=s.world.as_ref().and_then(|s|s.carrier).and_then(|h|self.bodies.iter().find(|b|b.handle==h)).and_then(|b|b.ship.as_ref())
            .filter(|s|s.flags&ship_state::DEAD==0&&s.armor.as_ref().is_some_and(|a|a.data[14]>0.0)).map_or(1.0,|s|s.live.get(ship_effects::FIGHTER_DAMAGE));
        let mult=c.attrs[11]*(c.attrs[16]*(s.live.weapon_value(ship_effects::MISSILE,ship_effects::DAMAGE)*support));
        let id=random.next();let facing=options.facing.unwrap_or(0.0);let velocity=if options.stationary{[0.0;2]}else{[facing.cos()*payload.launch_speed,facing.sin()*payload.launch_speed]};
        let life=options.life.unwrap_or_else(||(payload.flight-random.next()).max(0.0));let rotation=visual.next()*PI*2.0;
        self.ordnance.serial+=1.0;if self.ordnance.serial>u32::MAX as f64{return Err(5);}let serial=self.ordnance.serial;
        let mine=Mine{serial,id,weapon,source,source_handle:b.handle,player:c.player,team:c.team,position:point,velocity,age:0.0,fade_in:options.fade_in.unwrap_or(1.0),rotation,
            windup_played:false,timer:spec.delay,detonating:false,trigger:spec.trigger,visual_radius:spec.explosion.radius,damage:payload.damage*mult,source_multiplier:payload.damage/spec.damage*mult,life};
        let mut d=Delivery::new(&[0.0,0.0,0.0,2.0,3.0,spec.radius,0.0,0.0,0.0,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]);d.is_mine=true;d.hitpoints=Some(payload.hp);
        d.visual.missile=Some(crate::weapon_world::MissileVisual{radius:spec.visual_radius,color:spec.color,hit_glow:false});
        let em=Emission{kind:EmissionKind::Projectile,id,component_id:0,cycle_id:0.0,position:point,velocity,angle:0.0,barrel_offset:[0.0;2],base_damage:spec.damage,source_damage_multiplier:mine.source_multiplier,
            damage:mine.damage,emp:0.0,range:f64::INFINITY,duration:0.0,target_ship:None,target_projectile:None,armed_while_fizzling:None,flight_time:None,source_velocity:[0.0;2],recoil_delta:[0.0;2]};
        let mut p=Projectile::new(serial,b.id,b.handle,c.team,d,&em,0.0,c.outgoing(),s.flux.percent());p.player=c.player;p.birth.mine(weapon);
        self.owned.mines.push(mine);self.ordnance.projectiles.push(p.clone());self.services.projectile_spawned(self.world,&p)?;
        crate::weapon_world::sound(self.world,options.sound.as_deref().unwrap_or("mine_spawn"),point,0.9);Ok(serial)
    }
    pub fn deploy(&mut self,target:Point,source:e::Identity,range:f64,random:&mut Random,visual:&mut Random)->Result<f64,u32>{
        if !range.is_finite()||!target.into_iter().all(f64::is_finite){return Err(2);}let row=self.row(source)?;let b=&self.bodies[row];let c=b.ship.as_ref().and_then(|s|s.combat.as_ref()).ok_or(8u32)?;let pos=[b.motion[0],b.motion[1]];
        let delta=sub(target,pos);let max=range.max(0.0)+c.radius;let mut center=if contact::length(delta)>max{let d=normalized(delta);[pos[0]+d[0]*max,pos[1]+d[1]*max]}else{target};
        let clear=|this:&Self,p:Point|->Result<bool,u32>{for id in this.roster(){let b=&this.bodies[this.row(id)?];let s=b.ship.as_ref().ok_or(8u32)?;let c=s.combat.as_ref().ok_or(8u32)?;
            if c.size!=0{let sh=s.shield.as_ref().ok_or(8u32)?;if distance(p,contact::shield_center(sh,&b.motion))<sh.data[2]+if c.size==1{110.0}else{75.0}{return Ok(false);}}}
            Ok(!this.world.terrain.terrain.asteroids.iter().any(|a|distance(p,a.position)<a.radius+75.0))};
        if !clear(self,center)?{let mut tried=Vec::new();let mut found=None;let mut ring=1;while ring<=32&&found.is_none(){let start=random.next()*PI*2.0;for i in 0..6{let p=offset(center,start+i as f64*PI/3.0,50.0*ring as f64);tried.push(p);if clear(self,p)?{found=Some(p);break;}}ring*=2;}
            center=found.unwrap_or_else(||tried[(random.next()*tried.len()as f64).floor()as usize]);}
        let mut pos=offset(center,random.next()*PI*2.0,30.0+random.next()*30.0);let start=random.next()*PI*2.0;let radius=self.owned.specs.get(&2).ok_or(8u32)?.radius+40.0;
        for i in 0..=12{if i>0{pos=offset(center,start+i as f64*PI/6.0,50.0+random.next()*30.0);}if !self.owned.mines.iter().any(|m|distance(self.ordnance.projectiles.iter().find(|p|p.serial==m.serial).map_or(m.position,|p|p.pos),pos)<radius){break;}if i==12{pos=offset(center,random.next()*PI*2.0,30.0+random.next()*30.0);}}
        self.spawn(pos,source,2,SpawnOptions{life:Some(5.0),fade_in:Some(0.5),sound:Some("mine_teleport".into()),stationary:true,..Default::default()},random,visual)
    }
    fn detonate(&mut self,m:&Mine,random:&mut Random,visual:&mut Random)->Result<(),u32>{let spec=self.owned.specs.get(&m.weapon).ok_or(8u32)?.clone();let missile=self.ordnance.projectiles.iter().find(|p|p.serial==m.serial).cloned();
        crate::weapon_world::sound(self.world,"mine_explosion",m.position,1.0);if let Some(e)=crate::terrain_world::impact_explosion(m.position,spec.visual_radius,spec.color,false,2.0,[0.0;2],visual){self.world.output.push(w::Output::Impact(e));}
        self.remove(m.serial)?;let mut payload=if let Some(p)=missile{w::payload(&p)}else{return Err(4);};payload.position=m.position;payload.previous=m.position;payload.velocity=[0.0;2];payload.damage=m.damage;payload.damage_type=2;payload.soft_flux=false;payload.range_remaining=0.0;payload.rocket=false;
        let mut e=e::Explosion::new(payload,spec.explosion,m.position,None,None)?;let index=self.owned.explosions.len();self.owned.explosions.push(e.clone());let mut host=self.world_host();e.apply(&mut host,random,visual)?;host.finish()?;self.owned.explosions[index]=e;Ok(())
    }
    /// Same trailsMinesFX barrier: own active blasts first, mines in reverse.
    pub fn advance(&mut self,dt:f64,random:&mut Random,visual:&mut Random)->Result<(),u32>{if !dt.is_finite(){return Err(2);}if dt<=0.0{return Ok(());}
        for index in (0..self.owned.explosions.len()).rev(){let mut e=self.owned.explosions[index].clone();e.life-=dt;if e.life< -1e-9{self.owned.explosions.remove(index);continue;}e.position[0]+=e.payload.velocity[0]*dt;e.position[1]+=e.payload.velocity[1]*dt;
            let mut host=self.world_host();e.apply(&mut host,random,visual)?;host.finish()?;self.owned.explosions[index]=e;}
        for index in (0..self.owned.mines.len()).rev(){let mut m=self.owned.mines[index].clone();let Some(p)=self.ordnance.projectiles.iter_mut().find(|p|p.serial==m.serial&&p.delivery.is_mine)else{self.owned.mines.remove(index);continue;};
            // TS projectile.pos/vel and SpatialMine.pos/vel share vectors. Rust
            // authority uses one Ordnance copy; observe preceding gravity motion.
            m.position=p.pos;m.velocity=p.velocity;p.prev=m.position;m.age+=dt;
            if p.disarmed{m.detonating=false;m.life-=dt;m.position[0]+=m.velocity[0]*dt;m.position[1]+=m.velocity[1]*dt;self.sync(&m);if m.life<=0.0{self.remove(m.serial)?;self.owned.mines.remove(index);}else{self.owned.mines[index]=m;}continue;}
            let spec=self.owned.specs.get(&m.weapon).ok_or(8u32)?.clone();if m.detonating{m.timer-=dt;if !m.windup_played&&m.timer<spec.windup{m.windup_played=true;crate::weapon_world::sound(self.world,&spec.windup_sound,m.position,1.0);}
                if m.timer<=1e-9{self.detonate(&m,random,visual)?;self.owned.mines.remove(index);}else{self.owned.mines[index]=m;}continue;}
            m.life-=dt;let mut targets=Vec::new();for id in self.roster(){let b=&self.bodies[self.row(id)?];let s=b.ship.as_ref().ok_or(8u32)?;let c=s.combat.as_ref().ok_or(8u32)?;if s.flags&ship_state::DEAD==0&&c.team!=m.team&&!self.services.phased(self.bodies,self.world,self.specs,id)?{targets.push(id);}}
            let mut nearest=None;let mut nearest_distance=f64::INFINITY;for id in &targets{let b=&self.bodies[self.row(*id)?];let d=distance([b.motion[0],b.motion[1]],m.position);if nearest.is_none()||d<nearest_distance{nearest=Some(*id);nearest_distance=d;}}
            if let Some(id)=nearest{let b=&self.bodies[self.row(id)?];let desired=normalized(sub([b.motion[0],b.motion[1]],m.position));let change=sub([desired[0]*spec.speed,desired[1]*spec.speed],m.velocity);let amount=contact::length(change).min(spec.acceleration*dt);let change=normalized(change);
                m.velocity[0]+=change[0]*amount;m.velocity[1]+=change[1]*amount;m.position[0]+=m.velocity[0]*dt;m.position[1]+=m.velocity[1]*dt;}
            self.sync(&m);let mut close=false;for id in &targets{let ship=self.world_host().explosion_ship(*id)?;if e::explosion_contact(&ship,m.position,false).distance<m.trigger{close=true;break;}}
            let close_missile=self.ordnance.projectiles.iter().any(|p|(p.delivery.missile||p.guidance.as_ref().is_some_and(|s|s.rocket))&&!p.did_damage&&!p.guidance.as_ref().is_some_and(|s|s.flare)&&p.team!=m.team&&distance(m.position,p.pos)<m.trigger+p.delivery.radius);
            if m.life<=1e-9||close||close_missile{m.detonating=true;m.velocity[0]*=0.0;m.velocity[1]*=0.0;self.sync(&m);crate::weapon_world::sound(self.world,&spec.ping_sound,m.position,1.0);}self.owned.mines[index]=m;
        }Ok(())
    }
    /// Call in the actual per-ship advanceCombat order, not once per frame.
    pub fn stealth(&mut self,source:e::Identity,dt:f64,random:&mut Random,visual:&mut Random)->Result<(),u32>{if !dt.is_finite(){return Err(2);}if dt<=0.0{return Ok(());}let row=self.row(source)?;let meta=self.owned.ships.iter().find(|m|m.identity==source).unwrap();let weapon=meta.stealth.ok_or(8u32)?;
        if self.owned.field.is_none(){self.owned.field=Some(Minefield{source,weapon,remaining:0.5+random.next(),incoming:Vec::new()});}
        let s=self.bodies[row].ship.as_ref().ok_or(8u32)?;let mut f=self.owned.field.as_ref().unwrap().clone();if f.source!=source||s.flags&(ship_state::DEAD|ship_state::DOCKED|ship_state::RETREATED)!=0||s.armor.as_ref().ok_or(8u32)?.data[14]<=0.0{return Ok(());}
        for i in (0..f.incoming.len()).rev(){f.incoming[i].delay-=dt;if f.incoming[i].delay>0.0{continue;}let incoming=f.incoming[i].clone();let point=offset(incoming.point,random.next()*PI*2.0,50.0+random.next()*50.0);let target=&self.bodies[self.row(incoming.target)?];let facing=(target.motion[1]-point[1]).atan2(target.motion[0]-point[0]);
            self.spawn(point,source,f.weapon,SpawnOptions{facing:Some(facing),..Default::default()},random,visual)?;f.incoming.remove(i);}
        f.remaining-=dt;if f.remaining>0.0{self.owned.field=Some(f);return Ok(());}f.remaining+=0.5+random.next();let team=self.bodies[row].ship.as_ref().unwrap().combat.as_ref().unwrap().team;let mut candidates=Vec::new();
        for id in self.roster(){let index=self.row(id)?;let b=&self.bodies[index];let s=b.ship.as_ref().ok_or(8u32)?;let c=s.combat.as_ref().ok_or(8u32)?;let m=self.owned.ships.iter().find(|m|m.identity==id).ok_or(8u32)?;
            if id==source||s.flags&(ship_state::DEAD|ship_state::DOCKED|ship_state::RETREATED)!=0||s.armor.as_ref().ok_or(8u32)?.data[14]<=0.0||c.team==team||m.ineligible||c.size==0||m.drone||s.world.as_ref().is_some_and(|w|w.parent.is_some()){continue;}
            if s.systems.iter().any(|s|m.travel_systems.contains(&s.id)&&s.active){continue;}if random.next()>0.25{continue;}let radius=c.radius+400.0;let point=offset([b.motion[0],b.motion[1]],random.next()*PI*2.0,radius+200.0*random.next());let mut blocked=false;
            for other in self.roster(){let ob=&self.bodies[self.row(other)?];let oc=ob.ship.as_ref().and_then(|s|s.combat.as_ref()).ok_or(8u32)?;let om=self.owned.ships.iter().find(|m|m.identity==other).ok_or(8u32)?;if oc.size!=0&&!om.drone&&distance(point,[ob.motion[0],ob.motion[1]])<radius{blocked=true;break;}}
            if blocked||self.world.terrain.terrain.asteroids.iter().any(|a|distance(point,a.position)<a.radius+100.0){continue;}candidates.push(Incoming{point,target:id,delay:random.next()*1.5});}
        let count=(5+(random.next()*6.0).floor()as usize).min(candidates.len());for _ in 0..count{let index=(random.next()*candidates.len()as f64).floor()as usize;f.incoming.push(candidates.remove(index));}self.owned.field=Some(f);Ok(())
    }
}
