use crate::{armor::Armor, component::Component, engine::{self, Controller, Context}, weapon, motion, random::Random, flux::Flux, lifecycle::{self, Spec, System}, shield::{self, Shield}};
use std::collections::BTreeMap;

pub const WIDTH: usize = 1 + crate::flux::WIDTH + 9 + 3 + 8;
pub const SHIELD: u32 = 1;
pub const DISSIPATE: u32 = 2;
pub const LOCKED: u32 = 4;
pub const SUPPRESS: u32 = 8;
pub const DEAD: u32 = 16;
pub const RETREATED: u32 = 32;
pub const DOCKED: u32 = 64;
pub const RETREATING: u32 = 128;
pub const DISABLED: u32 = 256;
pub const BRAKE: u32 = 512;
pub const FLAMED: u32 = 1024;

pub const FLUX_RESULT: u32 = 1;
pub const OVERLOAD_STARTED: u32 = 2;
pub const OVERLOAD_AUDIO: u32 = 3;
pub const VENT_LOOP_STOP: u32 = 4;
pub const SYSTEM_RESULT: u32 = 5;
pub const INTERRUPT: u32 = 6;
pub const RESET: u32 = 7;
pub const ACTIVATE: u32 = 8;
pub const BECAME_ACTIVE: u32 = 9;
pub const ADVANCE: u32 = 10;
pub const SHIELD_RESULT: u32 = 11;
pub const SHIELD_UP: u32 = 12;
pub const SHIELD_DOWN: u32 = 13;
pub const PHASE_ACTIVATE: u32 = 14;
pub const PHASE_DEACTIVATE: u32 = 15;
pub const VENT_AUDIO: u32 = 16;
pub const VENT_LOOP_START: u32 = 17;
pub const IMPACT_FLUX: u32 = 18;
pub const IMPACT_ABSORBED: u32 = 19;
pub const IMPACT_REMAINING: u32 = 20;
pub const CELL_DAMAGE: u32 = 21;
pub const ARMOR_DAMAGE: u32 = 22;
pub const ARMOR_HULL: u32 = 23;
pub const ARMOR_RESIDUAL: u32 = 24;
pub const HULL_APPLIED: u32 = 25;
pub const COMPONENT_DAMAGE: u32 = 26;
pub const COMPONENT_RESULT: u32 = 27;
pub const COMPONENT_DISABLED: u32 = 28;
pub const COMPONENT_REPAIRED: u32 = 29;
pub const ENGINE_DAMAGE: u32 = 30;
pub const ENGINE_RESULT: u32 = 31;
pub const ENGINE_DISABLED: u32 = 32;
pub const ENGINE_REPAIRED: u32 = 33;
pub const ENGINE_FLAMEOUT: u32 = 34;
pub const ENGINE_RESTART: u32 = 35;
pub const CRITICAL_ARMOR: u32 = 36;
pub const CRITICAL_HULL: u32 = 37;

#[derive(Clone)]
pub struct Notice { pub system: u32, pub kind: u32, pub value: f64, pub detail: [f64; 2] }
fn notice(events: &mut Vec<Notice>, system: u32, kind: u32, value: f64) {
    events.push(Notice {system, kind, value, detail:[0.0; 2]});
}

/// A synchronous damage listener over the very ShipState being advanced.
/// Production callers provide the scene authority; the local path rejects an
/// installed anchor so missing context cannot silently bypass interception.
pub trait HullServices {
    fn before_hull(&mut self,ship:&mut ShipState,damage:f64,events:&mut Vec<Notice>)->Result<bool,u32>;
    fn phased(&self,ship:&ShipState)->Result<bool,u32>;
}
pub(crate) struct LocalHull;
impl HullServices for LocalHull {
    fn before_hull(&mut self,s:&mut ShipState,_:f64,_:&mut Vec<Notice>)->Result<bool,u32>{if s.anchor_installed{Err(8)}else{Ok(false)}}
    fn phased(&self,s:&ShipState)->Result<bool,u32>{if s.anchor_installed{return Err(8);}Ok(local_phased(s))}
}
pub fn local_phased(s:&ShipState)->bool{s.flags&(DOCKED|RETREATED)!=0||s.shield.as_ref().is_some_and(|sh|sh.kind()==shield::PHASE
    &&(sh.data[14]==1.0||sh.data[14]==2.0||sh.data[14]==3.0&&sh.data[15]>0.5))}

pub struct ShipState {
    pub flux: Flux, pub flags: u32,
    /// phase bonus, phase effect, external multiplier; sampled dt and clocks.
    pub clock: [f64; 9],
    pub hard_fraction: f64, pub zero_minimum: f64, pub allow_any: f64,
    pub systems: Vec<System>,
    pub shield: Option<Shield>,
    pub armor: Option<Armor>, pub components: Vec<Component>,
    pub engines: Option<Controller>, pub weapons:Option<weapon::Controller>, pub damage_policy: [f64;8],
    pub combat:Option<crate::battle::CombatShip>,
    pub world:Option<crate::system_owner::Owned>,pub live:crate::ship_effects::Modifiers,
    pub anchor_installed:bool,
}
impl Clone for ShipState {
    fn clone(&self) -> Self {
        Self {flux: self.flux.clone(), flags: self.flags, clock: self.clock,
            hard_fraction: self.hard_fraction, zero_minimum: self.zero_minimum,
            allow_any: self.allow_any, systems: self.systems.clone(), shield: self.shield.clone(),
            armor:self.armor.clone(),components:self.components.clone(),engines:self.engines.clone(),weapons:self.weapons.clone(),damage_policy:self.damage_policy,combat:self.combat.clone(),world:self.world.clone(),live:self.live.clone(),anchor_installed:self.anchor_installed}
    }
    fn clone_from(&mut self, source: &Self) {
        self.flux.clone_from(&source.flux); self.flags = source.flags; self.clock = source.clock;
        self.hard_fraction = source.hard_fraction; self.zero_minimum = source.zero_minimum;
        self.allow_any = source.allow_any; self.systems.clone_from(&source.systems);
        self.shield.clone_from(&source.shield);
        self.armor.clone_from(&source.armor); self.components.clone_from(&source.components);
        self.engines.clone_from(&source.engines);self.weapons.clone_from(&source.weapons); self.damage_policy=source.damage_policy;
        self.combat.clone_from(&source.combat);
        self.world.clone_from(&source.world);self.live.clone_from(&source.live);
        self.anchor_installed=source.anchor_installed;
    }
}
impl ShipState {
    pub fn new(row: &[f64]) -> Self {
        Self {flux: Flux::new(row), flags: row[10] as u32,
            clock: [row[11], row[12], row[13], 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
            hard_fraction: row[14], zero_minimum: row[15], allow_any: row[16], systems: Vec::new(), shield: None,
            armor:None,components:Vec::new(),engines:None,weapons:None,damage_policy:[1.0,1.0,1.0,1.0,1.0,100.0,1.0,1.0],combat:None,world:None,live:crate::ship_effects::Modifiers::default(),anchor_installed:false}
    }
    pub fn words(&self) -> [f64; WIDTH] {
        let mut row = [0.0; WIDTH]; row[0] = self.flags as f64;
        row[1..20].copy_from_slice(&self.flux.words()); row[20..29].copy_from_slice(&self.clock);
        row[29] = self.hard_fraction; row[30] = self.zero_minimum; row[31] = self.allow_any;
        row[32..40].copy_from_slice(&self.damage_policy); row
    }
    pub fn valid(&self) -> bool {
        self.words().iter().all(|n| n.is_finite()) && self.systems.iter().all(|s| {
            s.words().iter().enumerate().all(|(field, n)| n.is_finite() || (field == 14 && *n == f64::INFINITY))
                && [s.serial, s.pending_active, s.pending_activation].iter().all(|n| *n <= 9_007_199_254_740_991.0)
        }) && self.shield.as_ref().is_none_or(|s| s.valid())
            && self.armor.as_ref().is_none_or(|a| a.valid()) && self.components.iter().all(|c| c.valid())
            && self.engines.as_ref().is_none_or(|e| e.valid()) && self.weapons.as_ref().is_none_or(|w| w.valid())
            && self.combat.as_ref().is_none_or(|c|c.valid())&&self.world.as_ref().is_none_or(|w|w.valid())&&self.live.valid()
    }
    pub fn can_advance(&self) -> bool {
        self.flags & (DEAD | RETREATED) == 0 && self.armor.as_ref().is_none_or(|a| a.data[14] > 0.0)
    }
    pub fn finish_damage(&mut self, world_dt: f64, random: &mut Random, visual: &mut Random, events: &mut Vec<Notice>) {
        if self.weapons.is_none() {for component in &mut self.components { component.advance(self.clock[5],random,events); }}
        if let Some(armor) = &mut self.armor { armor.advance_scars(world_dt,visual); }
    }
    pub fn engine_context(&self) -> Context {
        Context {extended:self.clock[1] > 0.0 || self.systems.iter().any(|s| s.upkeep[6] as u32 & 32 != 0 && s.effect > 0.0),
            system_active:self.systems.iter().any(|s| s.active),accelerating:false,spreading:false,maneuver:[0.0;3]}
    }
    pub fn disable_weapon(&mut self,index:usize,permanent:bool,random:&mut Random,events:&mut Vec<Notice>)->bool {
        let newly=self.components[index].disable(permanent,random);
        if newly {
            if let Some(w)=&mut self.weapons {w.cancel(index,permanent,events);}
            else {events.push(Notice {system:0,kind:COMPONENT_DISABLED,value:0.0,detail:[self.components[index].data[0],permanent as u32 as f64]});}
        }newly
    }
    pub fn finish_weapons(&mut self,facing:f64,random:&mut Random,visual:&mut Random,events:&mut Vec<Notice>)->Result<(),u32> {
        self.finish_weapons_with(facing,random,visual,events,&mut LocalHull)
    }
    pub fn finish_weapons_with<H:HullServices>(&mut self,facing:f64,random:&mut Random,visual:&mut Random,events:&mut Vec<Notice>,hull:&mut H)->Result<(),u32> {
        let base=self.weapons.as_ref().map(|w|w.data);if let Some(w)=&mut self.weapons{if self.world.is_some(){for i in 0..3{w.data[13+i]*=self.live.weapon_value(i,crate::ship_effects::RATE);w.data[16+i]*=self.live.weapon_value(i,crate::ship_effects::AMMO_REGEN);}w.data[12]*=self.live.get(crate::ship_effects::RECOIL);w.data[11]*=self.live.get(crate::ship_effects::REPAIR_TIME);}}
        let result=self.finish_weapons_inner(facing,random,visual,events,hull);if let(Some(base),Some(w))=(base,self.weapons.as_mut()){w.data[11..19].copy_from_slice(&base[11..19]);}result
    }
    fn finish_weapons_inner<H:HullServices>(&mut self,facing:f64,random:&mut Random,visual:&mut Random,events:&mut Vec<Notice>,hull:&mut H)->Result<(),u32> {
        if self.weapons.is_none() {return Ok(());}let dt=self.clock[5];let controls=self.control_flags();
        let phased=hull.phased(self)?;
        self.weapons.as_mut().unwrap().begin(facing,dt,controls & 128 != 0,controls & 64 != 0,phased,self.flux.overloaded,self.flux.venting);
        for index in 0..self.components.len() {
            let alive=self.flags & DEAD == 0;
            self.weapons.as_mut().unwrap().advance_mount(index,dt,alive,self.components[index].data[7] == 1.0);
            if self.components[index].data[8] == 1.0 {continue;}
            let due=self.components[index].begin(dt,random);let mut disabled=false;
            if due {
                if self.components[index].data[5] <= 0.0 {disabled=self.components[index].disable(false,random);}
                else {
                    let w=self.weapons.as_ref().unwrap();
                    if w.in_cycle(index,&self.components[index]) {
                        if let Some(critical)=weapon::malfunction(random,w.data[8],w.data[9]) {
                            let permanent=critical && w.can_permanent(index,&self.components);
                            disabled=self.components[index].disable(permanent,random);
                            if permanent {self.weapons.as_mut().unwrap().finalize(index);}
                            if critical {let c=&self.components[index].data;let point=[c[3],c[4]];self.critical_damage_with(point,random,visual,events,hull)?;}
                        }
                    }
                }
            }
            let w=self.weapons.as_ref().unwrap();
            let repaired=self.components[index].finish(dt,alive,w.data[6]*w.data[11],w.data[7] == 1.0);
            let w=self.weapons.as_mut().unwrap();if disabled {w.cancel(index,false,events);}if repaired {w.repair_notice(index,events);}
        }Ok(())
    }
    pub fn engine_flame_flag(&self) -> bool {
        self.engines.as_ref().is_some_and(|e| e.data[4] != engine::READY || e.fraction(true).clamp(0.0,1.0) >= 1.0)
    }
    pub fn sync_engines(&mut self) {
        if self.engines.is_some() {self.flags=(self.flags & !FLAMED) | if self.engine_flame_flag() {FLAMED} else {0};}
    }
    pub fn propagate(&mut self, point:[f64;2], result:[f64;2], emp:f64, source:[f64;2], random:&mut Random, events:&mut Vec<Notice>) -> Result<(),u32> {
        let armor=self.armor.as_ref().ok_or(8u32)?; let total=result[0]+result[1]+emp*self.damage_policy[0]*self.live.get(crate::ship_effects::EMP_DAMAGE);
        if !total.is_finite() {return Err(7);} if total <= 0.0 {return Ok(());}
        let impact=armor.grid(point[0],point[1]);
        let weight=|x:f64,y:f64| {
            let cell=armor.grid(x,y); let dx=(cell.0-impact.0).abs(); let dy=(cell.1-impact.1).abs();
            if dx > 2 || dy > 2 || (dx == 2 && dy == 2) {0.0} else if dx <= 1 && dy <= 1 {0.5} else {0.25}
        };
        let weapon_damage=total*self.damage_policy[1]*source[0]; let engine_damage=total*self.damage_policy[2]*source[1];
        if !weapon_damage.is_finite() || !engine_damage.is_finite() {return Err(7);}
        let extended=self.engine_context().extended;
        for weapon in &mut self.components {
            if weapon.data[2] == 2.0 {continue;}
            let damage=weapon_damage*weight(weapon.data[3],weapon.data[4]); let dealt=weapon.damage(damage,random);
            events.push(Notice {system:0,kind:COMPONENT_DAMAGE,value:dealt,detail:[weapon.data[0],0.0]});
        }
        if let Some(controller)=&mut self.engines {for index in 0..controller.engines.len() {
            let d=&controller.engines[index].data; let damage=engine_damage*weight(d[1],d[2]);
            let dealt=controller.damage(index,damage,extended);
            events.push(Notice {system:0,kind:ENGINE_DAMAGE,value:dealt,detail:[index as f64,0.0]});
        }}
        self.sync_engines(); Ok(())
    }
    pub fn armor_impact(&mut self,row:&[f64],visual:&mut Random,events:&mut Vec<Notice>)->Result<[f64;3],u32> {
        self.armor_impact_with(row,visual,events,&mut LocalHull)
    }
    pub fn armor_impact_with<H:HullServices>(&mut self,row:&[f64],visual:&mut Random,events:&mut Vec<Notice>,hull:&mut H)->Result<[f64;3],u32> {
        let armor=self.armor.as_mut().ok_or(8u32)?;let original:[f64;8]=armor.data[21..29].try_into().unwrap();
        for i in 0..4{armor.data[21+i*2]=original[i*2]*self.live.get(crate::ship_effects::ARMOR_DAMAGE);armor.data[22+i*2]=original[i*2+1]*self.live.get(crate::ship_effects::HULL_DAMAGE);}
        let repair=self.world.as_mut().and_then(|w|w.repair.as_mut());
        let mut repair=repair;
        let result=armor.impact_with_damage(row,visual,&mut self.shield,events,|damage|{if let Some(r)=&mut repair{r.on_damage(damage);}});armor.data[21..29].copy_from_slice(&original);
        for (kind,value) in [(ARMOR_DAMAGE,result[0]),(ARMOR_HULL,result[1]),(ARMOR_RESIDUAL,result[2])] {
            if !value.is_finite() {return Err(7);} events.push(Notice {system:0,kind,value,detail:[0.0;2]});
        }
        if row[7] == 1.0 {
            self.apply_hull_with(result[1],events,hull)?;
        }
        Ok(result)
    }
    pub fn apply_hull(&mut self,damage:f64,events:&mut Vec<Notice>)->Result<f64,u32>{
        self.apply_hull_with(damage,events,&mut LocalHull)
    }
    pub fn apply_hull_with<H:HullServices>(&mut self,damage:f64,events:&mut Vec<Notice>,hull:&mut H)->Result<f64,u32>{
        if !damage.is_finite(){return Err(7);}let a=self.armor.as_ref().ok_or(8u32)?;
        let eligible=damage>0.0&&self.flags&(DEAD|RETREATED)==0&&a.data[15]!=1.0&&a.data[16]!=1.0;
        if eligible&&hull.before_hull(self,damage,events)?{events.push(Notice{system:0,kind:HULL_APPLIED,value:0.0,detail:[0.0;2]});return Ok(0.0);}
        if eligible{crate::system_owner::damage(self,damage);}
        let dealt=self.armor.as_mut().unwrap().apply_hull(damage,self.flags&(DEAD|RETREATED)!=0,&mut self.shield);
        events.push(Notice{system:0,kind:HULL_APPLIED,value:dealt,detail:[0.0;2]});Ok(dealt)
    }
    pub fn critical_damage(&mut self,point:[f64;2],random:&mut Random,visual:&mut Random,events:&mut Vec<Notice>)->Result<(),u32> {
        self.critical_damage_with(point,random,visual,events,&mut LocalHull)
    }
    pub fn critical_damage_with<H:HullServices>(&mut self,point:[f64;2],random:&mut Random,visual:&mut Random,events:&mut Vec<Notice>,hull:&mut H)->Result<(),u32> {
        let a=self.armor.as_ref().ok_or(8u32)?;
        let damage=self.damage_policy[5]*(0.75+random.next()*0.5)*self.damage_policy[6];
        if !damage.is_finite() {return Err(7);} let lethal=a.data[14] <= damage;
        let reported;
        if !lethal && random.next() > 0.25 {
            reported=[0.0,a.data[14].min(damage)];
            self.apply_hull_with(damage,events,hull)?;
        } else {
            let raw=if lethal {a.data[13]*10.0} else {damage};
            let row=[point[0],point[1],raw*self.damage_policy[7],0.0,1.0,raw,0.0,1.0];
            if row.iter().any(|n| !n.is_finite()) {return Err(7);}
            let result=self.armor_impact_with(&row,visual,events,hull)?; reported=[result[0],result[1]];
            self.propagate(point,reported,0.0,[self.damage_policy[3],self.damage_policy[4]],random,events)?;
        }
        for (kind,value) in [(CRITICAL_ARMOR,reported[0]),(CRITICAL_HULL,reported[1])] {events.push(Notice {system:0,kind,value,detail:point});}
        Ok(())
    }
    pub fn finish_engines(&mut self,pose:&[f64;motion::WIDTH],before:&[f64;motion::WIDTH],random:&mut Random,visual:&mut Random,events:&mut Vec<Notice>)->Result<(),u32> {
        self.finish_engines_with(pose,before,random,visual,events,&mut LocalHull)
    }
    pub fn finish_engines_with<H:HullServices>(&mut self,pose:&[f64;motion::WIDTH],before:&[f64;motion::WIDTH],random:&mut Random,visual:&mut Random,events:&mut Vec<Notice>,hull:&mut H)->Result<(),u32> {
        if self.engines.is_none() {return Ok(());} let dt=self.clock[5]; let mut context=self.engine_context();
        context.accelerating=pose[motion::ACCELERATING] == 1.0; context.spreading=pose[motion::SPREADING] == 1.0;
        let controller=self.engines.as_mut().unwrap();
        if controller.data[19] == 1.0 && controller.engines.iter().any(|e| e.data[6] == 1.0) {
            let cosine=before[motion::FACING].cos(); let sine=before[motion::FACING].sin();
            let x=pose[motion::VX]-before[motion::VX]; let y=pose[motion::VY]-before[motion::VY];
            let scale=(dt*controller.motion[17]).max(0.000001);
            context.maneuver=[(x*cosine+y*sine)/scale,(-x*sine+y*cosine)/scale,
                (pose[motion::ANGULAR]-before[motion::ANGULAR])/(dt*controller.motion[18]*std::f64::consts::PI/180.0).max(0.000001)];
            if context.maneuver.iter().any(|n| !n.is_finite()) {return Err(7);}
        }
        let can_repair=controller.data[14]; if self.flags & DEAD != 0 || self.armor.as_ref().is_some_and(|a| a.data[14] <= 0.0) {controller.data[14]=0.0;}
        let flaming=controller.begin(dt); let count=controller.engines.len();
        for index in 0..count {
            let e=self.engines.as_mut().unwrap(); let was_permanent=e.engines[index].data[13] == 1.0;
            let critical=e.health_begin(index,dt,flaming,context,random);
            if critical {
                let d=&self.engines.as_ref().unwrap().engines[index].data; let point=[d[1],d[2]];
                self.critical_damage_with(point,random,visual,events,hull)?;
            }
            self.engines.as_mut().unwrap().health_finish(index,dt,flaming,was_permanent,events);
        }
        let e=self.engines.as_mut().unwrap(); e.data[14]=can_repair; e.finish(dt,context,events); self.sync_engines(); Ok(())
    }
    pub fn subjective_multiplier(&self) -> f64 {
        // The admitted generic lifecycle has no modifier callbacks. External
        // stat revisions persist; full system behavior admission is still pending.
        (1.0 + 2.0 * self.clock[0] * self.clock[1]) * self.clock[2]*self.live.get(crate::ship_effects::TIME)
    }
    fn overload_notice(&mut self, events: &mut Vec<Notice>, was_overloaded: bool, audio: bool) {
        if !was_overloaded && self.flux.overloaded {
            if let Some(shield) = &mut self.shield { shield.overload(&mut self.flux); self.sync_shield(); }
            else { self.flags &= !SHIELD; }
            notice(events, 0, OVERLOAD_STARTED, 0.0);
            if audio { notice(events, 0, OVERLOAD_AUDIO, 0.0); }
        }
    }
    pub fn sync_shield(&mut self) {
        if let Some(s) = &self.shield {
            self.flags = (self.flags & !SHIELD) | if s.active() { SHIELD } else { 0 };
            self.clock[1] = s.data[shield::EFFECT];
        }
    }
    pub fn control_flags(&self) -> u32 {let mut bits=self.systems.iter().fold(0, |bits, s| bits | s.controls());
        if self.live.get(crate::ship_effects::DISABLE_WEAPONS)>0.0{bits|=64;}if self.live.get(crate::ship_effects::DISABLE_DEFENSE)>0.0{bits|=1;}
        if self.live.get(crate::ship_effects::DISABLE_VENTING)>0.0{bits|=8;}
        if self.world.as_ref().is_some_and(|w|self.systems.iter().any(|s|s.state==lifecycle::ACTIVE&&s.active&&!s.disabled&&w.metas.get(&s.id).is_some_and(|m|m.kind==crate::ship_effects::Kind::Zhefeng))){bits|=1;}
        bits}
    fn shield_blocked(&self) -> bool {
        self.shield.as_ref().is_some_and(|s| s.data[35] == 1.0) || self.control_flags() & 1 != 0
    }
    fn lower_shield(&mut self, events: &mut Vec<Notice>) {
        if let Some(s) = &mut self.shield {
            if !s.requested() || (s.kind() == shield::PHASE && !s.phase_upkeep()) { return; }
            let phase = s.kind() == shield::PHASE; s.set_active(false, &mut self.flux);
            notice(events, 0, if phase { PHASE_DEACTIVATE } else { SHIELD_DOWN }, if phase { 0.9 } else { 0.7 });
        }
        self.sync_shield();
    }
    pub fn shield_operation(&mut self, op: u32, specs: &BTreeMap<u32, Spec>, events: &mut Vec<Notice>) -> Result<(), u32> {
        if self.shield.is_none() { return Err(8); }
        let mut result = false;
        if op == 0 { result = self.shield.as_mut().unwrap().toggle(&mut self.flux); }
        else if op == 1 || op == 2 { self.shield.as_mut().unwrap().set_active(op == 1, &mut self.flux); }
        else if op == 3 {
            let s = self.shield.as_ref().unwrap();
            if self.can_advance() && self.flags & (DOCKED | RETREATING) == 0 && s.kind() != shield::NONE
                && !s.locked() && !(s.kind() == shield::PHASE && (s.data[14] == 3.0 || s.data[14] == 4.0))
                && !self.shield_blocked() && !self.flux.overloaded && !self.flux.venting {
                let phase = s.kind() == shield::PHASE;
                let raising = if phase { s.data[14] == 0.0 } else { !s.requested() };
                self.shield.as_mut().unwrap().toggle(&mut self.flux); result = true;
                let kind = if phase { if raising { PHASE_ACTIVATE } else { PHASE_DEACTIVATE } }
                    else if raising { SHIELD_UP } else { SHIELD_DOWN };
                notice(events, 0, kind, if phase { 0.9 } else { 0.65 });
            }
        } else if op == 4 {
            if self.can_advance() && self.flags & (DOCKED | RETREATING) == 0 && !self.shield.as_ref().unwrap().locked()
                && self.control_flags() & 8 == 0 && self.flux.vent_mult > 0.0
                && !self.flux.overloaded && !self.flux.venting && self.flux.total() > 5.0 {
                if self.shield.as_ref().unwrap().void.is_some() { self.shield.as_mut().unwrap().overload(&mut self.flux); }
                else { self.lower_shield(events); }
                let right_click = self.shield.as_ref().unwrap().data[43] == 1.0;
                for s in &mut self.systems {
                    if !s.defense || right_click {
                        notice(events, s.id, INTERRUPT, 0.0); s.interrupt(&specs[&s.spec]);
                    }
                }
                result = self.flux.start_vent();
                if result { notice(events, 0, VENT_AUDIO, 0.9); notice(events, 0, VENT_LOOP_START, 0.65); }
            }
        } else { return Err(2); }
        self.sync_shield(); notice(events, 0, SHIELD_RESULT, result as u32 as f64); Ok(())
    }
    fn upkeep(&self, specs: &BTreeMap<u32, Spec>) -> [f64; 4] {
        if self.world.is_some(){return [self.live.get(crate::ship_effects::SOFT_FLUX),self.live.get(crate::ship_effects::HARD_FLUX),self.live.get(crate::ship_effects::SHIELD_UPKEEP),self.live.get(crate::ship_effects::SUPPRESS_BOOST)];}
        let mut tail = [0.0, 0.0, 1.0, 0.0];
        for (index, s) in self.systems.iter().enumerate().rev() {
            let own = s.resource_modifiers(&specs[&s.spec], self.flux.max);
            if self.systems.get(index + 1).is_some_and(|next| specs[&next.spec].flags & lifecycle::AVAILABLE != 0) {
                tail = [own[0] + tail[0], own[1] + tail[1], own[2] * tail[2], own[3] + tail[3]];
            } else { tail = own; }
        }
        if let Some(s) = &self.shield { tail[0] += s.data[37]; tail[1] += s.data[38]; tail[2] *= s.data[36]; }
        tail
    }
    pub fn motion_speed_multiplier(&self) -> f64 {
        self.shield.as_ref().filter(|s| s.kind() == shield::PHASE).map_or(1.0,
            |s| s.phase_speed(if self.flux.max > 0.0 { self.flux.hard / self.flux.max } else { 0.0 }))
    }
    pub fn finish_shield(&mut self, pose: &[f64; crate::motion::WIDTH]) -> Result<(), u32> {
        let blocked = self.shield_blocked();
        let suppressed = blocked || self.flux.overloaded || self.flux.venting || self.flags & (DEAD | RETREATING) != 0;
        // Ship.integrateStep reads the current cursor/AI aim at the motion
        // barrier, including manual input and wing controls written this tick.
        if let Some(q) = self.combat.as_ref().and_then(|c|c.query.as_ref()) {
            if let Some(s) = &mut self.shield { s.data[31..33].copy_from_slice(&q.aim); }
        }
        if let Some(s) = &mut self.shield { s.update(self.clock[5], pose, &mut self.flux, suppressed)?; }
        self.sync_shield(); Ok(())
    }
    pub fn flux_operation(&mut self, op: u32, amount: f64, hard: bool, events: &mut Vec<Notice>) {
        let was = self.flux.overloaded;
        let result = match op {
            0 => self.flux.increase(amount, hard, true),
            1 => self.flux.increase(amount, hard, false),
            2 => self.flux.spend(amount),
            3 => { self.flux.increase_clamped(amount, hard); false },
            4 => self.flux.begin_overload(amount),
            5 => self.flux.begin_overload(amount * 25.0),
            6 => self.flux.overload_for(amount),
            7 => self.flux.start_vent(),
            8 => { self.flux.cancel_vent(); notice(events, 0, VENT_LOOP_STOP, 0.0); false },
            _ => unreachable!(),
        };
        self.overload_notice(events, was, op == 0 || op == 1 || op == 4);
        notice(events, 0, FLUX_RESULT, result as u32 as f64);
    }
    pub fn system_operation(&mut self, id: u32, op: u32, specs: &BTreeMap<u32, Spec>, events: &mut Vec<Notice>) -> Result<(), u32> {
        let index = self.systems.iter().position(|s| s.id == id).ok_or(8u32)?;
        let d = &specs[&self.systems[index].spec];
        if op == 0 {
            let s = &self.systems[index];
            let reserved = self.systems.iter().fold(0.0, |sum, system| sum + system.pending_flux);
            let ready = d.flags & lifecycle::AVAILABLE != 0
                && self.can_advance() && self.flags & (DOCKED | DISABLED) == 0 && !s.disabled
                && s.state != lifecycle::COOLDOWN && !s.cooling
                && if s.active { d.flags & lifecycle::TOGGLE != 0 && s.state != lifecycle::OUT }
                   else { self.flags & RETREATING == 0 && !self.flux.overloaded && !self.flux.venting
                       && self.flux.total() + d.flux_cost + reserved <= self.flux.max
                       && (d.flags & lifecycle::CHARGES == 0 || s.charges > 0.0) };
            if ready { self.systems[index].activate(d); }
            notice(events, id, SYSTEM_RESULT, ready as u32 as f64);
        } else if op == 1 {
            notice(events, id, INTERRUPT, 0.0); self.systems[index].interrupt(d);
        } else if op == 2 {
            notice(events, id, RESET, 0.0); self.systems[index].reset(d);
        } else { self.systems[index].disabled = op == 4; }
        Ok(())
    }
    /// Generic lifecycle notifications at the original status-dispatch boundary.
    /// No host JS callbacks are imported or executed by this development core.
    pub fn dispatch(&mut self, specs: &BTreeMap<u32, Spec>, events: &mut Vec<Notice>) -> Result<(), u32> {
        if self.flags & (DEAD | RETREATED | DOCKED) != 0 { return Ok(()); }
        let dt = self.clock[3] * self.subjective_multiplier();
        if !dt.is_finite() { return Err(7); }
        for s in &mut self.systems {
            let starts = s.pending_activation; s.pending_activation = 0.0;
            let active = s.pending_active; s.pending_active = 0.0;
            if specs[&s.spec].flags & lifecycle::AVAILABLE == 0 { continue; }
            for _ in 0..starts as u64 { notice(events, s.id, ACTIVATE, 0.0); }
            for _ in 0..active as u64 { notice(events, s.id, BECAME_ACTIVE, 0.0); }
            notice(events, s.id, ADVANCE, dt);
        }
        Ok(())
    }
    pub fn advance(&mut self, dt: f64, specs: &BTreeMap<u32, Spec>, random:&mut Random, events: &mut Vec<Notice>) -> Result<f64, u32> {
        let result=self.begin_advance(dt,specs,random,events)?;if self.can_advance(){self.finish_advance(specs,events)?;}Ok(result)
    }
    pub fn begin_advance(&mut self, dt: f64, specs: &BTreeMap<u32, Spec>, random:&mut Random, events: &mut Vec<Notice>) -> Result<f64, u32> {
        let effective=self.begin_clock(dt)?;if !self.can_advance(){return Ok(effective);}
        for index in 0..self.systems.len(){self.begin_system(index,specs,events)?;}
        self.begin_readiness(specs,random,events)?;Ok(effective)
    }
    pub fn begin_clock(&mut self,dt:f64)->Result<f64,u32>{
        if !self.can_advance() { return Ok(0.0); }
        self.sync_engines(); if let Some(e)=&mut self.engines {e.prepare();}
        let tactical = dt * self.clock[2]*self.live.get(crate::ship_effects::TIME);
        let effective = dt * self.subjective_multiplier();
        if !tactical.is_finite() || !effective.is_finite() { return Err(7); }
        self.clock[3] = dt; self.clock[4] = tactical; self.clock[5] = effective;
        self.clock[6] += dt; self.clock[7] += tactical; self.clock[8] += effective;
        Ok(effective)
    }
    pub fn begin_system(&mut self,index:usize,specs:&BTreeMap<u32,Spec>,events:&mut Vec<Notice>)->Result<(),u32>{
            let effective=self.clock[5];let s=self.systems.get_mut(index).ok_or(8u32)?;
            let d = &specs[&s.spec];
            if effective > 0.0 && ((d.flags & 16 != 0 && self.flags & BRAKE != 0)
                || (d.flags & 32 != 0 && self.flags & RETREATING != 0)) {
                notice(events, s.id, INTERRUPT, 0.0); s.interrupt(d);
            }
            if let Some(meta)=self.world.as_ref().and_then(|w|w.metas.get(&s.id)){let mut dynamic=d.clone();dynamic.regen=meta.regen;s.update(&dynamic,effective);}else{s.update(d, effective);}
        Ok(())
    }
    pub fn begin_readiness(&mut self,specs:&BTreeMap<u32,Spec>,random:&mut Random,events:&mut Vec<Notice>)->Result<(),u32>{let effective=self.clock[5];
        if let Some(mut owned)=self.combat.as_mut().and_then(|c|c.readiness.take()){
            let effects=owned.state.effects(owned.parameters);
            for system in &mut self.systems{
                system.disabled=if system.defense{effects.defense_disabled}else{effects.system_disabled};
                if system.disabled{notice(events,system.id,INTERRUPT,0.0);system.interrupt(&specs[&system.spec]);}
            }
            if effects.defense_disabled{self.lower_shield(events);}
            let mut no_shield_age=f64::INFINITY;
            let context=crate::readiness::ShieldContext{front_or_omni:self.shield.as_ref().is_some_and(|s|s.kind()==shield::FRONT||s.kind()==shield::OMNI),
                active:self.shield.as_ref().is_some_and(|s|s.active()),flux_fraction:self.flux.percent()};
            let age=self.shield.as_mut().map_or(&mut no_shield_age,|s|&mut s.data[28]);
            if owned.state.advance_shield(effective,age,context,owned.parameters,random){
                let was=self.flux.overloaded;let started=self.flux.begin_overload(0.0);
                owned.state.finish_shield_attempt(started);self.overload_notice(events,was,false);if started{self.lower_shield(events);}
            }
            self.combat.as_mut().unwrap().readiness=Some(owned);
        }else if let Some(s) = &mut self.shield { s.data[28] += effective; }
        for s in &mut self.systems {
            let d = &specs[&s.spec];
            if self.flux.overloaded || self.flux.venting
                || (s.active && d.flags & 64 != 0 && self.flags & FLAMED != 0) {
                notice(events, s.id, INTERRUPT, 0.0); s.interrupt(d);
            }
        }
        Ok(())
    }
    pub fn finish_advance(&mut self,specs:&BTreeMap<u32,Spec>,events:&mut Vec<Notice>)->Result<(),u32>{
        let dt=self.clock[3];let tactical=self.clock[4];
        if self.shield.is_some() {
            if self.shield_blocked() { self.lower_shield(events); }
            if self.shield.as_ref().is_some_and(|s| s.void.is_none()) && (self.flux.overloaded || self.flux.venting) {
                self.lower_shield(events);
            }
            let upkeep = self.upkeep(specs);
            let s = self.shield.as_ref().unwrap();
            if s.void.is_none() && s.kind() != shield::PHASE && s.active() && !self.flux.overloaded && !self.flux.venting {
                if self.flux.total() >= self.flux.max || !self.flux.spend(s.data[4] * upkeep[2] * tactical) { self.lower_shield(events); }
            }
            let s = self.shield.as_ref().unwrap();
            if s.kind() == shield::PHASE && s.phase_upkeep() { self.flux.increase_clamped(s.data[21] * dt, true); }
        }
        // System resource rules also apply before an optional shield is installed.
        if !self.flux.overloaded && !self.flux.venting {
            let upkeep = self.upkeep(specs);
            let was = self.flux.overloaded; self.flux.increase(upkeep[0] * tactical, false, false);
            self.overload_notice(events, was, true);
            // Source reads the hard rate after attempting the soft rate.
            if upkeep[1] > 0.0 {
                let was = self.flux.overloaded; self.flux.increase(upkeep[1] * tactical, true, false);
                self.overload_notice(events, was, true);
            }
        }
        for index in 0..self.systems.len() {
            let s = &mut self.systems[index];
            let cost = s.pending_flux; s.pending_flux = 0.0;
            let hard = specs[&s.spec].flags & lifecycle::HARD != 0;
            if cost > 0.0 {
                let was = self.flux.overloaded; self.flux.increase(cost, hard, false);
                self.overload_notice(events, was, true);
            }
        }
        let boost_timer = self.flux.zero_timer;
        if self.world.is_some(){self.flux.dissipation_mult=self.live.get(crate::ship_effects::DISSIPATION);}
        let locked = self.flux.overloaded || self.flux.venting;
        let controls = self.control_flags();
        let allowed = self.flags & DISSIPATE != 0 && controls & 2 == 0;
        if tactical > 0.0 && !locked && allowed && self.flags & SHIELD != 0 && self.hard_fraction > 0.0 {
            let leftover = (self.flux.dissipation() * tactical - self.flux.soft).max(0.0);
            self.flux.hard = (self.flux.hard - leftover * self.hard_fraction.min(1.0)).max(0.0);
        }
        if self.flux.update(tactical, self.flags & SHIELD != 0, allowed) { notice(events, 0, VENT_LOOP_STOP, 0.0); }
        if (self.zero_minimum > 0.0 || self.allow_any > 0.0) && tactical > 0.0 {
            let boost = !locked && !self.flux.overloaded && !self.flux.venting
                && self.flags & DEAD == 0 && self.flux.hull != 0 && self.flags & LOCKED == 0 && controls & 4 == 0
                && (self.flux.percent() <= self.zero_minimum || self.allow_any > 0.0);
            self.flux.zero_timer = if boost {
                if self.allow_any > 0.0 && self.flux.percent() > self.zero_minimum { self.flux.since_increase }
                else { boost_timer + tactical }
            } else { 0.0 };
            self.flux.boost = boost && self.flux.zero_timer >= self.flux.boost_delay;
        }
        if self.flags & SUPPRESS != 0 || self.upkeep(specs)[3] > 0.0 { self.flux.zero_timer = 0.0; self.flux.boost = false; }
        Ok(())
    }
}
