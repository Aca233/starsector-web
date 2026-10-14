//! Resident current Web CR/PPT/deployment rules. Selected malfunctions and
//! shield overload attempts MUST be applied synchronously by the ship owner;
//! presentation notices do not execute gameplay side effects.
use crate::random::Random;

pub const STATE_WIDTH: usize = 8;
pub const EFFECT_WIDTH: usize = 9;
pub const SEQUENCE_WIDTH: usize = 10;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Target { Weapon(u32), Engine(u32) }

#[derive(Clone, Copy)]
pub struct Weapon {
    pub id: u32, pub hidden: bool, pub permanently_disabled: bool,
    pub ammo: f64, pub max_ammo: f64, pub ammo_regen: f64,
}
#[derive(Clone, Copy)]
pub struct Engine { pub id: u32, pub system_activated: bool, pub contribution: f64 }

/// These slices borrow live Rust components in installation/group order.
/// Repeated group members are meaningful and are not deduplicated.
pub struct Components<'a> {
    pub weapons: &'a [Weapon], pub grouped_weapon_ids: &'a [u32],
    pub engines: &'a [Engine], pub permanently_disabled_fraction: f64,
}
impl Components<'_> {
    pub fn eligible(&self, target: Target, cr: f64) -> bool {
        match target {
            Target::Weapon(id) => {
                let Some(mount) = self.weapons.iter().find(|w| w.id == id) else { return false; };
                if mount.hidden { return false; }
                if cr <= 0.0 { return true; }
                self.weapons.iter().any(|other| other.id != id && !other.permanently_disabled && !other.hidden
                    && other.ammo > 0.0 && (other.max_ammo > 20.0 || other.ammo_regen > 0.0))
            }
            Target::Engine(id) => self.engines.iter().find(|e| e.id == id)
                .is_some_and(|e| e.contribution + self.permanently_disabled_fraction <= 0.66),
        }
    }
}

#[derive(Clone, Copy)]
pub struct Parameters {
    pub fighter: bool, pub malfunction_range: f64,
    pub critical_chance_multiplier: f64, pub weapon_chance_bonus: f64,
    pub critical_chance_bonus: f64, pub peak_cr_seconds: f64,
    /// The current hullStats value is percent/second, not fraction/second.
    pub cr_loss_per_second: f64,
}
impl Default for Parameters {
    fn default() -> Self { Self {fighter:false,malfunction_range:1.0,critical_chance_multiplier:1.0,
        weapon_chance_bonus:0.0,critical_chance_bonus:0.0,peak_cr_seconds:0.0,cr_loss_per_second:0.0} }
}

#[derive(Clone, Copy)]
pub struct Effects {
    pub movement_percent: f64, pub damage_percent: f64, pub damage_taken_percent: f64,
    pub weapon_chance: f64, pub engine_chance: f64, pub critical_chance: f64,
    pub shield_chance: f64, pub system_disabled: bool, pub defense_disabled: bool,
}
impl Effects {
    pub fn words(&self) -> [f64; EFFECT_WIDTH] {
        [self.movement_percent,self.damage_percent,self.damage_taken_percent,self.weapon_chance,
            self.engine_chance,self.critical_chance,self.shield_chance,
            self.system_disabled as u32 as f64,self.defense_disabled as u32 as f64]
    }
}

pub fn clamp_cr(cr: f64) -> f64 { if cr.is_finite() { cr.max(0.0).min(1.0) } else { 0.0 } }
fn change_percent(cr: f64) -> f64 {
    if cr < 0.5 { -((0.5-cr)/0.5)*10.0 }
    else if cr > 0.7 { ((cr-0.7)/(1.0-0.7))*10.0 } else { 0.0 }
}
fn damage_taken_percent(cr: f64) -> f64 {
    if cr < 0.5 { ((0.5-cr)/0.5)*10.0 }
    else if cr > 0.7 { -((cr-0.7)/(1.0-0.7))*10.0 } else { 0.0 }
}
fn chance(cr: f64, threshold: f64, maximum_percent: f64) -> f64 {
    if threshold <= 0.0 || cr >= threshold { 0.0 }
    else { (maximum_percent*(threshold-cr))/threshold/100.0 }
}
pub fn effects(cr: f64, p: Parameters) -> Effects {
    let cr=clamp_cr(cr); let disabled=!p.fighter && cr <= 0.0;
    let malfunction=0.4*p.malfunction_range-0.001;
    let critical=0.2*p.malfunction_range-0.001;
    Effects {movement_percent:change_percent(cr),damage_percent:change_percent(cr),
        damage_taken_percent:damage_taken_percent(cr),
        weapon_chance:(if p.fighter {0.0} else {chance(cr,malfunction,10.0)})+p.weapon_chance_bonus,
        engine_chance:if p.fighter {0.0} else {chance(cr,malfunction,7.5)},
        critical_chance:((if p.fighter {0.0} else {chance(cr,critical,25.0)})+p.critical_chance_bonus)*p.critical_chance_multiplier,
        shield_chance:if p.fighter {0.0} else {chance(cr,0.1*p.malfunction_range,5.0)},
        system_disabled:disabled,defense_disabled:disabled}
}

pub struct LowCRSequence {
    pub severity: f64, pub elapsed: f64, pub before_damage: f64,
    pub interval: f64, pub interval_elapsed: f64, pub interval_was_elapsed: bool,
    pub initial_attempts: f64, pub remaining_attempts: f64, pub finished: bool,
    pub targets: Vec<Target>,
}
impl Clone for LowCRSequence {
    fn clone(&self)->Self { Self {severity:self.severity,elapsed:self.elapsed,before_damage:self.before_damage,
        interval:self.interval,interval_elapsed:self.interval_elapsed,interval_was_elapsed:self.interval_was_elapsed,
        initial_attempts:self.initial_attempts,remaining_attempts:self.remaining_attempts,finished:self.finished,
        targets:self.targets.clone()} }
    fn clone_from(&mut self, s:&Self) {self.severity=s.severity;self.elapsed=s.elapsed;self.before_damage=s.before_damage;
        self.interval=s.interval;self.interval_elapsed=s.interval_elapsed;self.interval_was_elapsed=s.interval_was_elapsed;
        self.initial_attempts=s.initial_attempts;self.remaining_attempts=s.remaining_attempts;self.finished=s.finished;
        self.targets.clone_from(&s.targets);}
}
impl LowCRSequence {
    pub fn new(severity:f64, components:&Components<'_>, random:&mut Random)->Self {
        // IntervalUtil's field initializer precedes the constructor delay draw.
        let interval=0.25+random.next()*0.75;
        let before_damage=1.0+random.next()*2.0;
        let mut targets=Vec::new();
        for id in components.grouped_weapon_ids {
            if components.weapons.iter().any(|w| w.id == *id) { targets.push(Target::Weapon(*id)); }
        }
        for e in components.engines {if !e.system_activated {targets.push(Target::Engine(e.id));}}
        let count=(0.25+0.75*severity)*targets.len() as f64*0.25;
        // JS Math.round is not floor(x+.5): addition can round a value just
        // below a half boundary up to the next integer before floor runs.
        let floor=count.floor();let rounded=if count-floor < 0.5 {floor} else {floor+1.0};
        let attempts=1.0_f64.max(rounded)*if severity >= 1.0 {2.0} else {1.0};
        Self {severity,elapsed:0.0,before_damage,interval,interval_elapsed:0.0,interval_was_elapsed:false,
            initial_attempts:attempts,remaining_attempts:attempts,finished:false,targets}
    }
    /// Returns at most one synchronous critical-malfunction action. The owner
    /// must commit it before another ship stage or eligibility query occurs.
    pub fn advance(&mut self, amount:f64, dead:bool, hull_hp:f64, cr:f64,
        components:&Components<'_>, random:&mut Random)->Option<Target> {
        if !(amount > 0.0) || self.finished {return None;}
        if dead || hull_hp <= 0.0 {self.finished=true;return None;}
        self.elapsed+=amount;
        if self.elapsed <= self.before_damage {return None;}
        if self.interval_was_elapsed {
            self.interval=0.25+random.next()*0.75;self.interval_elapsed=0.0;self.interval_was_elapsed=false;
        }
        self.interval_elapsed+=amount;
        let mut target=None;
        if self.interval_elapsed >= self.interval {
            self.interval_was_elapsed=true;
            if self.remaining_attempts > 0.0 {
                self.remaining_attempts-=1.0;
                self.targets.retain(|t| components.eligible(*t,cr));
                if !self.targets.is_empty() {
                    let index=(random.next()*self.targets.len() as f64).floor() as usize;
                    target=Some(self.targets.remove(index));
                }
            }
        }
        if self.remaining_attempts <= 0.0 {self.finished=true;}
        target
    }
    pub fn finish_after_commit(&mut self,dead:bool,hull_hp:f64) {
        if dead || hull_hp <= 0.0 || self.remaining_attempts <= 0.0 {self.finished=true;}
    }
    pub fn words(&self)->[f64;SEQUENCE_WIDTH] {
        [self.severity,self.elapsed,self.before_damage,self.interval,self.interval_elapsed,
            self.interval_was_elapsed as u32 as f64,self.initial_attempts,self.remaining_attempts,
            self.finished as u32 as f64,self.targets.len() as f64]
    }
    pub fn valid(&self)->bool {self.words().iter().all(|n| n.is_finite())}
}

#[derive(Clone, Copy)]
pub struct ShieldContext {pub front_or_omni:bool,pub active:bool,pub flux_fraction:f64}

pub struct Readiness {
    pub current_cr:f64,pub cr_at_deployment:Option<f64>,pub peak_performance_remaining:f64,
    pub shield_timer:f64,pub shield_interval:f64,pub shield_interval_elapsed:bool,
    pub just_shield_malfunction:bool,pub deployment_sequence:Option<LowCRSequence>,
}
impl Clone for Readiness {
    fn clone(&self)->Self {Self {current_cr:self.current_cr,cr_at_deployment:self.cr_at_deployment,
        peak_performance_remaining:self.peak_performance_remaining,shield_timer:self.shield_timer,
        shield_interval:self.shield_interval,shield_interval_elapsed:self.shield_interval_elapsed,
        just_shield_malfunction:self.just_shield_malfunction,deployment_sequence:self.deployment_sequence.clone()} }
    fn clone_from(&mut self,s:&Self) {self.current_cr=s.current_cr;self.cr_at_deployment=s.cr_at_deployment;
        self.peak_performance_remaining=s.peak_performance_remaining;self.shield_timer=s.shield_timer;
        self.shield_interval=s.shield_interval;self.shield_interval_elapsed=s.shield_interval_elapsed;
        self.just_shield_malfunction=s.just_shield_malfunction;self.deployment_sequence.clone_from(&s.deployment_sequence);}
}
impl Readiness {
    /// Call at the same installation position as resetShieldMalfunctionState.
    /// The caller also sets the resident Shield's since-last-hit to Infinity.
    pub fn new(cr:f64,peak:f64,random:&mut Random)->Self {
        Self {current_cr:cr,cr_at_deployment:None,peak_performance_remaining:peak,shield_timer:0.0,
            shield_interval:0.75+random.next()*0.5,shield_interval_elapsed:false,
            just_shield_malfunction:false,deployment_sequence:None}
    }
    pub fn reset_shield(&mut self,random:&mut Random) {
        self.shield_timer=0.0;self.shield_interval=0.75+random.next()*0.5;
        self.shield_interval_elapsed=false;self.just_shield_malfunction=false;
    }
    pub fn deploy(&mut self,cr:f64,controls_locked:bool,p:Parameters,
        components:&Components<'_>,random:&mut Random) {
        self.current_cr=clamp_cr(cr);self.cr_at_deployment=Some(self.current_cr);self.deployment_sequence=None;
        let threshold=0.2*p.malfunction_range-0.001;
        if threshold > 0.0 && self.current_cr < threshold && !controls_locked && !p.fighter {
            let severity=(threshold-self.current_cr)/threshold*p.critical_chance_multiplier;
            self.deployment_sequence=Some(LowCRSequence::new(severity,components,random));
        }
    }
    /// First Ship.prepare stage; world dt is deliberately not phase-scaled.
    /// The lazy path uses controls_locked=false, matching the actual Web hook.
    pub fn advance_deployment(&mut self,dt:f64,dead:bool,hull_hp:f64,p:Parameters,
        components:&Components<'_>,random:&mut Random)->Option<Target> {
        if self.cr_at_deployment.is_none() {self.deploy(self.current_cr,false,p,components,random);}
        self.deployment_sequence.as_mut().and_then(|s|s.advance(dt,dead,hull_hp,self.current_cr,components,random))
    }
    /// Call immediately after the returned action's actual critical damage.
    pub fn finish_deployment(&mut self,dt:f64,dead:bool,hull_hp:f64) {
        if dt > 0.0 {if let Some(s)=&mut self.deployment_sequence {s.finish_after_commit(dead,hull_hp);}}
        if self.deployment_sequence.as_ref().is_some_and(|s|s.finished) {self.deployment_sequence=None;}
    }
    /// Called after the alive/nonretreated ship gate. The supplied enemy flag
    /// must come from a query of resident entities, never JS observation state.
    pub fn advance_peak(&mut self,world_dt:f64,significant_enemy:bool,p:Parameters) {
        if p.peak_cr_seconds > 0.0 && significant_enemy {
            if self.peak_performance_remaining > 0.0 {
                self.peak_performance_remaining=(self.peak_performance_remaining-world_dt).max(0.0);
            } else {
                let loss_rate=p.cr_loss_per_second*0.01;
                self.current_cr=(self.current_cr-loss_rate*world_dt).max(0.0);
            }
        }
    }
    pub fn effects(&self,p:Parameters)->Effects {effects(self.current_cr,p)}
    /// Called after system restrictions/lowering, before ordinary upkeep and
    /// shield integration. True requests forceOverload(0); success is recorded
    /// separately because existing overload/venting can reject the attempt.
    pub fn advance_shield(&mut self,dt:f64,since_last_hit:&mut f64,context:ShieldContext,
        p:Parameters,random:&mut Random)->bool {
        *since_last_hit+=dt;
        if self.shield_interval_elapsed {
            self.shield_interval=0.75+random.next()*0.5;self.shield_timer=0.0;self.shield_interval_elapsed=false;
        }
        self.shield_timer+=dt;
        if self.shield_timer < self.shield_interval {return false;}
        self.shield_interval_elapsed=true;
        let chance=self.effects(p).shield_chance;
        chance > 0.0 && context.front_or_omni && context.active && context.flux_fraction > 0.75
            && *since_last_hit < 1.25 && random.next() < chance
    }
    pub fn finish_shield_attempt(&mut self,overload_started:bool) {
        if overload_started {self.just_shield_malfunction=true;}
    }
    pub fn words(&self)->[f64;STATE_WIDTH] {
        [self.current_cr,self.cr_at_deployment.unwrap_or(-1.0),self.peak_performance_remaining,
            self.shield_timer,self.shield_interval,self.shield_interval_elapsed as u32 as f64,
            self.just_shield_malfunction as u32 as f64,self.deployment_sequence.is_some() as u32 as f64]
    }
    pub fn valid(&self)->bool {self.words().iter().all(|n|n.is_finite())
        && self.deployment_sequence.as_ref().is_none_or(|s|s.valid())}
}

/// Minimal borrowed world membership for the current Web's PPT query. Team
/// None is not equal to any other team, matching CombatTeams.sameTeam.
#[derive(Clone,Copy)]
pub struct Contact {pub identity:[u32;2],pub team:Option<u32>,pub position:[f64;2],
    pub dead:bool,pub retreated:bool,pub docked:bool,pub fighter:bool}
fn distance(a:[f64;2],b:[f64;2])->f64 {
    let x=(a[0]-b[0]).abs();let y=(a[1]-b[1]).abs();
    if x == f64::INFINITY || y == f64::INFINITY {return f64::INFINITY;}
    let maximum=if x > y {x} else {y};if maximum == 0.0 && x == 0.0 {return 0.0;}
    let ratio=(if x > y {y} else {x})/maximum;(1.0+ratio*ratio).sqrt()*maximum
}
pub fn significant_enemies(owner:Contact,range:f64,explicit:Option<Contact>,world:&[Contact])->bool {
    let significant=|other:Contact| other.identity != owner.identity
        && !(owner.team.is_some() && owner.team == other.team) && !other.dead && !other.retreated && !other.docked
        && !other.fighter && distance(owner.position,other.position) <= range;
    explicit.is_some_and(significant) || world.iter().copied().any(significant)
}
