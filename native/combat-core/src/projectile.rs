//! Resident source projectile lifecycle and beam damage clock.
//! Spawned from real firing emission, never rewritten by a per-frame DTO.
use crate::{contact::{self,Point},random::Random,state::Handle,weapon_fire::Emission};
use std::rc::Rc;
pub const WIDTH:usize=65;
#[derive(Clone)]
pub struct Delivery {
    pub spawn_type:u32,pub length:f64,pub fade:f64,pub damage_type:u32,pub weapon_type:u32,
    pub radius:f64,pub arming:Option<f64>,pub angular:f64,pub flight:Option<f64>,
    pub missile:bool,pub flameout:f64,pub missile_fade:f64,pub fizzle_range:bool,
    pub no_collision_fade:bool,pub reduce_damage_fade:bool,pub collision_after_none:bool,
    pub beam_speed:f64,pub beam_hard:bool,
    pub guidance:Option<crate::missile_owner::Spec>,
    pub effect:Option<crate::weapon_effects::Effect>,pub high_frequency:bool,
    pub explosion:Option<crate::explosion_effects::Spec>,pub fuse:Option<crate::explosion_effects::Fuse>,pub intercepts:bool,pub pass_missiles:bool,
    pub visual:crate::weapon_world::Visual,pub pass_fighters:bool,pub pass_fighters_destroyed:bool,pub terrain_penetration:Option<[f64;3]>,
    pub admission:u32,pub sound_units:Vec<u16>,pub hitpoints:Option<f64>,
    pub is_mine:bool,pub mass_driver:bool,pub batch_ship_contacts:bool,pub fizzle_at_range:bool,pub system_fuse:Option<f64>,pub system_fade_in:Option<f64>,pub system_explosion_sound:Option<String>,pub system_sound_units:Vec<u16>,
}
impl Delivery {
    pub fn new(row:&[f64])->Self{Self{spawn_type:row[0] as u32,length:row[1],fade:row[2],damage_type:row[3] as u32,weapon_type:row[4] as u32,
        radius:row[5],arming:if row[6]==1.0{Some(row[7])}else{None},angular:row[8],flight:if row[9]==1.0{Some(row[10])}else{None},
        missile:row[11]==1.0,flameout:row[12],missile_fade:row[13],fizzle_range:row[14]==1.0,no_collision_fade:row[15]==1.0,
        reduce_damage_fade:row[16]==1.0,collision_after_none:row[17]==1.0,beam_speed:row[18],beam_hard:row[19]==1.0,guidance:None,effect:None,high_frequency:false,
        explosion:None,fuse:None,intercepts:false,pass_missiles:false,visual:crate::weapon_world::Visual::default(),pass_fighters:false,pass_fighters_destroyed:false,terrain_penetration:None,admission:0,sound_units:Vec::new(),hitpoints:None,
        is_mine:false,mass_driver:false,batch_ship_contacts:false,fizzle_at_range:false,system_fuse:None,system_fade_in:None,system_explosion_sound:None,system_sound_units:Vec::new()}}
    pub fn source(&self)->bool{!self.guidance.as_ref().is_some_and(|g|g.rocket||g.flare.is_some())&&(1..=3).contains(&self.spawn_type)&&self.fade>0.0&&(self.spawn_type==3||self.length>0.0)}
}
#[derive(Clone)]
pub struct Projectile {
    pub serial:f64,pub id:f64,pub source:u32,pub source_handle:Handle,pub component:u32,pub cycle:f64,
    pub team:u32,pub player:Option<bool>,pub target_handle:Option<Handle>,pub delivery:Rc<Delivery>,pub pos:Point,pub prev:Point,pub velocity:Point,pub angle:f64,
    pub damage:f64,pub emp:f64,pub base_damage:f64,pub range:f64,pub total_range:f64,pub elapsed:f64,
    pub source_speed:f64,pub inherited:Point,pub origin:Point,pub tail:Point,pub prev_tail:Point,
    pub fade:f64,pub prev_fade:f64,pub unfaded_damage:f64,pub unfaded_emp:f64,pub did_damage:bool,
    pub soft:bool,pub flight:Option<f64>,pub arming:Option<f64>,pub armed:Option<bool>,pub fizzle:Option<f64>,
    pub disarmed:bool,pub collision_disabled:bool,pub guided:bool,pub gravity_deflected:bool,
    pub target_ship:Option<u32>,pub target_projectile:Option<u32>,pub target_numeric:Option<f64>,pub outgoing:[f64;8],pub source_flux:f64,
    pub guidance:Option<crate::missile_guidance::Missile>,pub flare_state:Option<crate::missile_guidance::FlareState>,
    pub fighter_decoy:bool,pub hitpoints:Option<f64>,
    pub damaged_projectiles:Vec<f64>,pub damaged_asteroids:Vec<f64>,pub damaged_hulks:Vec<f64>,pub void_blocked:Option<crate::explosion_effects::Identity>,
    pub damaged_ships:Vec<crate::explosion_effects::Identity>,pub void_hit_recorded:bool,pub gravity_captured:Option<Handle>,
    pub system_fuse_triggered:bool,
    pub birth:crate::ordnance_publication::Birth,
}
impl Projectile {
    pub fn new(serial:f64,source:u32,handle:Handle,team:u32,d:Delivery,e:&Emission,speed:f64,outgoing:[f64;8],flux:f64)->Self{
        let mut birth=crate::ordnance_publication::Birth::new(handle,e.component_id,d.weapon_type,e.source_damage_multiplier,e.flight_time.or(d.flight),e.barrel_offset);birth.max_hp=d.guidance.as_ref().and_then(|g|g.hp).or(d.hitpoints);
        Self{serial,id:e.id,source,source_handle:handle,component:e.component_id,cycle:e.cycle_id,team,player:None,target_handle:None,
            pos:e.position,prev:e.position,velocity:e.velocity,angle:e.angle,damage:e.damage,emp:e.emp,base_damage:e.base_damage,
            range:e.range,total_range:e.range,elapsed:0.0,source_speed:speed,inherited:e.source_velocity,origin:e.position,
            tail:e.position,prev_tail:e.position,fade:0.0,prev_fade:0.0,unfaded_damage:e.damage,unfaded_emp:e.emp,did_damage:false,
            soft:false,flight:e.flight_time.or(d.flight),arming:d.arming,armed:e.armed_while_fizzling,fizzle:None,
            disarmed:false,collision_disabled:false,guided:false,gravity_deflected:false,target_ship:e.target_ship,
            target_projectile:e.target_projectile,target_numeric:None,outgoing,source_flux:flux,hitpoints:d.hitpoints,delivery:Rc::new(d),guidance:None,flare_state:None,fighter_decoy:false,
            damaged_projectiles:Vec::new(),damaged_asteroids:Vec::new(),damaged_hulks:Vec::new(),void_blocked:None,damaged_ships:Vec::new(),void_hit_recorded:false,gravity_captured:None,system_fuse_triggered:false,
            birth}
    }
    pub fn hp(&self)->f64{self.guidance.as_ref().and_then(|g|g.hitpoints).or(self.hitpoints).unwrap_or(100.0)}
    pub fn subtract_hp(&mut self,damage:f64)->f64{let hp=self.hp()-damage;if let Some(g)=&mut self.guidance{g.hitpoints=Some(hp);}else{self.hitpoints=Some(hp);}hp}
    pub fn valid(&self)->bool{self.words().iter().enumerate().all(|(i,v)|v.is_finite()
        ||(self.delivery.is_mine&&matches!(i,22|23)&&*v==f64::INFINITY)
        // This read-only launch snapshot is computed by resident Flux.percent;
        // actual zero capacity produces 0/0. No command imports this value.
        ||(i==64&&v.is_nan()))
        &&self.hitpoints.is_none_or(f64::is_finite)&&self.target_numeric.is_none_or(f64::is_finite)&&crate::missile_owner::valid(self)}
    pub fn begin(&mut self,dt:f64,random:&mut Random,dud:f64)->bool{
        self.birth.begun=true;
        self.elapsed+=dt;self.prev=self.pos;if let Some(a)=&mut self.arming{*a=(*a-dt).max(0.0);}
        if self.delivery.missile&&self.delivery.system_fuse.is_none(){
            if self.armed.is_none(){self.armed=Some(random.next()>dud);self.origin=self.pos;}
            self.prev_fade=self.fade;
            if self.fizzle.is_none(){
                let reached=self.delivery.fizzle_range&&contact::length([self.pos[0]-self.origin[0],self.pos[1]-self.origin[1]])>self.total_range;
                if let Some(t)=&mut self.flight{*t-=dt;}
                if reached||self.flight.is_some_and(|t|t<=0.0){
                    self.fizzle=Some(if reached{dt}else{dt.min((-self.flight.unwrap_or(0.0)).max(0.0))});self.flight=Some(self.flight.unwrap_or(0.0).min(0.0));
                    self.disarmed=self.disarmed||self.armed==Some(false);self.guided=false;self.target_ship=None;self.target_handle=None;self.target_projectile=None;self.target_numeric=None;
                    if let Some(g)=&mut self.guidance{g.target_ship=None;g.target_projectile=None;}
                    self.unfaded_damage=self.damage;self.unfaded_emp=self.emp;if self.delivery.collision_after_none{self.collision_disabled=true;}
                }
            }else{self.fizzle=Some(self.fizzle.unwrap()+dt);}
            if let Some(t)=self.fizzle{
                let remaining=self.delivery.flameout-t;
                self.fade=if self.delivery.missile_fade>0.0{(1.0-remaining/self.delivery.missile_fade).clamp(0.0,1.0)}else{if remaining<=0.0{1.0}else{0.0}};
                if self.fade>0.0{if self.delivery.no_collision_fade{self.collision_disabled=true;}
                    else if self.delivery.reduce_damage_fade{self.damage=self.unfaded_damage*(1.0-self.fade);self.emp=self.unfaded_emp*(1.0-self.fade);self.soft=true;}}
                if remaining<=0.0{return true;}
            }
        }else if let Some(t)=&mut self.flight{*t-=dt;if *t<=0.0{return true;}}
        false
    }
    pub fn advance_motion(&mut self,dt:f64)->bool{
        if self.delivery.source(){
            let speed=if self.gravity_deflected{contact::length(self.velocity)}else{self.source_speed};let fade=self.fade;self.prev_fade=fade;
            if self.delivery.spawn_type==3{
                self.fade=if self.range<=0.0{(fade+dt/self.delivery.fade).min(1.0)}else{fade};
                self.damage=self.unfaded_damage*(1.0-self.fade);self.emp=self.unfaded_emp*(1.0-self.fade);self.soft=self.fade>0.0;
                self.pos[0]+=self.velocity[0]*dt;self.pos[1]+=self.velocity[1]*dt;self.range-=speed*dt;return self.fade>=1.0;
            }
            let scale=if self.did_damage{0.0}else{(1.0-fade)*(1.0-fade)};self.damage=self.unfaded_damage*scale;self.emp=self.unfaded_emp*scale;self.soft=fade>0.0;self.prev_tail=self.tail;
            let dir=[self.angle.cos(),self.angle.sin()];
            if self.delivery.spawn_type==2{
                let length=contact::length([self.pos[0]-self.tail[0],self.pos[1]-self.tail[1]]);let step=speed*dt;
                let tail_step=if fade>0.0{step}else{(length+step-self.delivery.length).max(0.0)};
                self.tail[0]+=dir[0]*tail_step;self.tail[1]+=dir[1]*tail_step;self.tail[0]+=self.inherited[0]*dt;self.tail[1]+=self.inherited[1]*dt;
                if !self.did_damage{self.pos[0]+=self.velocity[0]*dt;self.pos[1]+=self.velocity[1]*dt;}
                if self.did_damage&&(self.pos[0]-self.tail[0])*dir[0]+(self.pos[1]-self.tail[1])*dir[1]<0.0{self.tail=self.pos;}
            }else{
                if !self.did_damage{self.pos[0]+=self.velocity[0]*dt;self.pos[1]+=self.velocity[1]*dt;}
                let mut length=contact::length([self.pos[0]-self.tail[0],self.pos[1]-self.tail[1]]);if fade>0.0{length=(length-speed*dt).max(0.0);}length=length.min(self.delivery.length);
                self.tail=[self.pos[0]+dir[0]*-length,self.pos[1]+dir[1]*-length];
            }
            self.range-=speed*dt;self.fade=if self.range<=0.0||self.did_damage{(fade+dt/self.delivery.fade).min(1.0)}else{fade};self.fade>=1.0
        }else{
            let step=[self.velocity[0]*dt,self.velocity[1]*dt];self.pos[0]+=step[0];self.pos[1]+=step[1];self.range-=contact::length(step);false
        }
    }
    pub fn impact(&mut self,point:Point)->bool{
        self.birth.impacted=true;
        self.did_damage=true;if !self.delivery.source()||self.delivery.spawn_type==3{return false;}
        self.pos=point;self.damage=0.0;self.emp=0.0;true
    }
    pub fn words(&self)->[f64;WIDTH]{let d=&self.delivery;
        [self.serial,self.id,self.source as f64,self.source_handle.slot as f64,self.source_handle.generation as f64,self.component as f64,self.cycle,self.team as f64,
            d.spawn_type as f64,d.damage_type as f64,d.weapon_type as f64,d.radius,
            self.pos[0],self.pos[1],self.prev[0],self.prev[1],self.velocity[0],self.velocity[1],self.angle,self.damage,self.emp,self.base_damage,self.range,self.total_range,self.elapsed,
            self.source_speed,self.inherited[0],self.inherited[1],self.origin[0],self.origin[1],self.tail[0],self.tail[1],self.prev_tail[0],self.prev_tail[1],
            self.fade,self.prev_fade,self.unfaded_damage,self.unfaded_emp,self.did_damage as u32 as f64,self.soft as u32 as f64,
            self.flight.is_some() as u32 as f64,self.flight.unwrap_or(0.0),self.arming.is_some() as u32 as f64,self.arming.unwrap_or(0.0),
            self.armed.is_some() as u32 as f64,self.armed.unwrap_or(false) as u32 as f64,self.fizzle.is_some() as u32 as f64,self.fizzle.unwrap_or(0.0),
            self.disarmed as u32 as f64,self.collision_disabled as u32 as f64,self.guided as u32 as f64,self.gravity_deflected as u32 as f64,
            self.target_ship.is_some() as u32 as f64,self.target_ship.unwrap_or(0) as f64,self.target_projectile.is_some() as u32 as f64,self.target_projectile.unwrap_or(0) as f64,
            self.outgoing[0],self.outgoing[1],self.outgoing[2],self.outgoing[3],self.outgoing[4],self.outgoing[5],self.outgoing[6],self.outgoing[7],self.source_flux]
    }
}
#[derive(Clone,Default)]
pub struct BeamClock{pub elapsed:Option<f64>,pub integral:f64,pub duration:f64,pub multiplier:f64}
#[derive(Clone,Copy)]
pub struct BeamSample{pub damage:f64,pub emp:f64,pub effective_dps:f64}
impl BeamClock{
    pub fn advance(&mut self,dt:f64,active:bool,brightness:f64,dps:f64,emp:f64,chargedown:bool,burst:bool,down:f64,random:&mut Random)->Option<BeamSample>{
        self.duration=0.0;self.multiplier=0.0;if !active||dt<=0.0{return None;}
        let elapsed=self.elapsed.get_or_insert_with(||random.next()*0.1);let brightness=brightness.clamp(0.0,1.0);
        self.integral+=brightness*brightness*dt;*elapsed+=dt;if *elapsed+1e-9<0.1{return None;}
        if chargedown&&burst&&brightness*down<0.1{self.integral+=brightness*brightness/4.0*down;}
        let integral=self.integral;self.duration=*elapsed;self.multiplier=integral/self.duration;*elapsed=0.0;self.integral=0.0;
        Some(BeamSample{damage:dps*integral,emp:emp*integral,effective_dps:dps*self.multiplier})
    }
}
