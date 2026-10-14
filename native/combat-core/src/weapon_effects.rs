//! Resident registered weapon effects. All callbacks below are Rust-internal
//! synchronous commits, never host/JS rule callbacks. Call at the same phase as
//! the current TS weapon handlers; caller owns transaction and live observations.
use crate::{contact::{self, Point}, random::Random};
use std::f64::consts::PI;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Effect { Tachyon, Graviton, Sabot, Mote, HyperionYamato, GlorianaSiege }
impl Effect {
    pub fn registered(id: &str) -> Option<Self> {
        Some(match id {
            "com.fs.starfarer.api.impl.combat.TachyonLanceEffect" => Self::Tachyon,
            "com.fs.starfarer.api.impl.combat.GravitonBeamEffect" => Self::Graviton,
            "com.fs.starfarer.api.impl.combat.SabotOnHitEffect" => Self::Sabot,
            "com.fs.starfarer.api.impl.combat.MoteOnHitEffect" => Self::Mote,
            "web_sc2_hyperion_yamato_impact" => Self::HyperionYamato,
            "web_gloriana_siege_impact" => Self::GlorianaSiege,
            _ => return None,
        })
    }
    pub fn has_beam(self) -> bool { matches!(self, Self::Tachyon | Self::Graviton) }
    pub fn has_hit(self) -> bool { !self.has_beam() }
    pub fn has_projectile_hit(self) -> bool { self == Self::Mote }
    pub fn has_environment_hit(self) -> bool { matches!(self, Self::HyperionYamato | Self::GlorianaSiege) }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct WeaponIdentity { pub source: u32, pub slot: u32, pub generation: u32, pub component: u32 }

/// Preserve Map insertion order: refresh changes expiry, not position.
#[derive(Clone, Default)]
pub struct GravitonHits { pub hits: Vec<(WeaponIdentity, f64)> }
impl GravitonHits {
    pub fn notify(&mut self, weapon: WeaponIdentity) {
        if let Some((_, time)) = self.hits.iter_mut().find(|(w, _)| *w == weapon) { *time = 1.0; }
        else { self.hits.push((weapon, 1.0)); }
    }
    /// Target ship listener phase precedes this frame's weapon contacts. The
    /// returned None removes the modifier/listener; notify alone cannot set it.
    pub fn advance(&mut self, amount: f64) -> Option<f64> {
        for (_, remaining) in &mut self.hits { *remaining -= amount; }
        self.hits.retain(|(_, time)| *time > 0.0);
        match self.hits.len() { 0 => None, 1 => Some(1.05), 2 => Some(1.08), _ => Some(1.10) }
    }
    pub fn valid(&self) -> bool { self.hits.iter().all(|(_, t)| t.is_finite()) }
}

#[derive(Clone)]
pub struct TachyonState { pub interval: f64, pub elapsed: f64, pub interval_elapsed: bool, pub was_zero: bool }
#[derive(Clone)]
pub struct BeamEffectState { pub tachyon: Option<TachyonState>, pub graviton_was_zero: bool }
impl Default for BeamEffectState {
    fn default() -> Self { Self { tachyon: None, graviton_was_zero: true } }
}
impl BeamEffectState {
    /// Initialization consumes a gameplay sample even with no target/partial
    /// brightness. This is effectState initialization, not IntervalUtil.advance.
    pub fn tachyon_interval(&mut self, beam: &BeamInput, random: &mut Random) -> bool {
        let state = self.tachyon.get_or_insert_with(|| TachyonState {
            interval: 0.2 + random.next() * 0.1, elapsed: 0.0, interval_elapsed: false, was_zero: true,
        });
        if !beam.has_target || beam.brightness < 1.0 || !beam.damage_active { return false; }
        let amount = if state.was_zero { beam.dps_duration } else { 0.0 };
        state.was_zero = beam.dps_duration <= 0.0;
        if state.interval_elapsed {
            state.interval = 0.2 + random.next() * 0.1;
            state.elapsed = 0.0;
            state.interval_elapsed = false;
        }
        state.elapsed += amount;
        state.interval_elapsed = state.elapsed >= state.interval;
        state.interval_elapsed
    }
    pub fn graviton_refresh(&mut self, beam: &BeamInput, has_weapon: bool, within_arc: bool) -> bool {
        if !beam.has_target || !has_weapon || beam.brightness < 1.0 || !beam.damage_active { return false; }
        let amount = if self.graviton_was_zero { beam.dps_duration } else { 0.0 };
        self.graviton_was_zero = beam.dps_duration <= 0.0;
        amount > 0.0 && within_arc
    }
    pub fn valid(&self) -> bool {
        self.tachyon.as_ref().is_none_or(|s| s.interval.is_finite() && s.elapsed.is_finite())
    }
}

#[derive(Clone, Copy)]
pub struct BeamInput {
    pub has_target: bool, pub brightness: f64, pub damage_active: bool,
    pub dps_duration: f64, pub damage_per_second: f64, pub damage_multiplier: f64,
    pub base_emp_per_second: f64, pub from: Point, pub endpoint: Point, pub width: f64,
    pub is_player: bool, pub fringe: [u8; 4], pub core: [u8; 4],
}
#[derive(Clone, Copy)]
pub struct ShieldArc { pub active: bool, pub kind: u32, pub center: Point, pub facing: f64, pub arc_deg: f64 }
pub fn within_emp_arc(shield: ShieldArc, point: Point) -> bool {
    // NONE=0, FRONT=1, OMNI=2, PHASE=3 in resident Shield.
    if !shield.active || shield.kind == 0 || shield.kind == 3 { return false; }
    let angle = (point[1] - shield.center[1]).atan2(point[0] - shield.center[0]) - shield.facing;
    let diff = angle.sin().atan2(angle.cos());
    diff.abs() <= shield.arc_deg.max(1.0) * PI / 360.0
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum EmpKind { Engine, Weapon, Center }
#[derive(Clone, Copy, Debug)]
pub struct EmpTarget { pub local: Point, pub weight: f64, pub kind: EmpKind, pub index: i32 }
#[derive(Clone, Copy)]
pub struct EmpWeapon { pub local: Point, pub hidden: bool }
pub struct TargetInput<'a> {
    pub id: u32, pub dead: bool, pub fighter: bool, pub position: Point, pub facing: f64,
    pub engines: &'a [Point], pub weapons: &'a [EmpWeapon], pub shield: ShieldArc,
    pub hard_flux: f64, pub max_flux: f64, pub shield_pierced: f64, pub cr_damage_taken: f64,
    pub system_shield_multiplier: f64, pub shield_efficiency: f64, pub energy_shield_multiplier: f64,
}
pub fn pick_emp_target(ship: &TargetInput<'_>, from: Point, random: &mut Random) -> EmpTarget {
    let local_from = contact::rotate([from[0] - ship.position[0], from[1] - ship.position[1]], -ship.facing);
    let choice = |local: Point, kind: EmpKind, index: usize| {
        let distance = contact::length([local[0] - local_from[0], local[1] - local_from[1]]);
        (distance <= 100000.0).then_some(EmpTarget { local, kind, index: index as i32, weight: 1.0 / distance.max(1e-6) })
    };
    let choices: Vec<EmpTarget> = ship.engines.iter().enumerate().filter_map(|(i, p)| choice(*p, EmpKind::Engine, i))
        .chain(ship.weapons.iter().enumerate().filter(|(_, w)| !w.hidden).filter_map(|(i, w)| choice(w.local, EmpKind::Weapon, i))).collect();
    if choices.is_empty() { return EmpTarget { local: [0.0, 0.0], weight: 1.0, kind: EmpKind::Center, index: -1 }; }
    let mut pick = random.next() * choices.iter().fold(0.0, |sum, c| sum + c.weight);
    for c in &choices { pick -= c.weight; if pick <= 0.0 { return *c; } }
    *choices.last().unwrap()
}
fn world(ship: &TargetInput<'_>, local: Point) -> Point {
    let p = contact::rotate(local, ship.facing); [p[0] + ship.position[0], p[1] + ship.position[1]]
}
fn local(ship: &TargetInput<'_>, point: Point) -> Point {
    contact::rotate([point[0] - ship.position[0], point[1] - ship.position[1]], -ship.facing)
}

#[derive(Clone, Copy, Debug, Default)]
pub struct Damage { pub armor: f64, pub hull: f64 }
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DamageLayer { Armor, Hull }
#[derive(Clone, Copy, Debug)]
pub struct EmpArc { pub from: Point, pub to: Point, pub target: u32, pub width: f64, pub fringe: [u8; 4], pub core: [u8; 4] }
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Sound { Tachyon(u32), MoteEmp, MoteNormal, MoteDamage }

/// Implemented by the resident world. Each call must finish immediately; armor
/// and component RNG are consumed here between the effect's own samples.
pub trait Sink {
    fn armor_energy(&mut self, target: u32, point: Point, damage: f64, visual: &mut Random) -> Result<Damage, u32>;
    fn hull(&mut self, target: u32, damage: f64);
    fn components(&mut self, target: u32, point: Point, damage: Damage, emp: f64, random: &mut Random) -> Result<(), u32>;
    fn shield_flux(&mut self, target: u32, amount: f64, hard: bool);
    fn armor_sparks(&mut self, target: u32, point: Point, armor: f64);
    fn armor_sparks_immediate(&mut self,target:u32,point:Point,armor:f64,_visual:&mut Random)->Result<(),u32>{self.armor_sparks(target,point,armor);Ok(())}
    fn emp_arc(&mut self, arc: EmpArc);
    fn emp_arc_immediate(&mut self,arc:EmpArc,_visual:&mut Random)->Result<(),u32>{self.emp_arc(arc);Ok(())}
    fn sound(&mut self, sound: Sound, point: Point, volume: f64, pitch: f64);
    fn record_energy(&mut self, player: bool, layer: DamageLayer, damage: f64, emp: f64);
    fn destroy_if_dead(&mut self, target: u32, random: &mut Random, visual: &mut Random);
    fn cosmetic(&mut self, impact: CosmeticImpact);
    fn cosmetic_immediate(&mut self,impact:CosmeticImpact,_visual:&mut Random)->Result<(),u32>{self.cosmetic(impact);Ok(())}
}

pub fn tachyon<S: Sink>(state: &mut BeamEffectState, beam: &BeamInput, target: Option<&TargetInput<'_>>,
    random: &mut Random, visual: &mut Random, sink: &mut S) -> Result<(), u32> {
    if !state.tachyon_interval(beam, random) { return Ok(()); }
    let Some(target) = target.filter(|t| !t.dead) else { return Ok(()); };
    let hit_shield = within_emp_arc(target.shield, beam.from);
    let chance = (target.hard_flux / target.max_flux - 0.1) * target.shield_pierced;
    if hit_shield && !(random.next() < chance) { return Ok(()); }
    let point = pick_emp_target(target, beam.from, random);
    let end = world(target, point.local);
    let damage = beam.damage_per_second * beam.damage_multiplier * 0.25;
    let emp = beam.base_emp_per_second * 0.5;
    sink.emp_arc_immediate(EmpArc { from: beam.from, to: end, target: target.id, width: beam.width + 5.0, fringe: beam.fringe, core: beam.core },visual)?;
    let result = sink.armor_energy(target.id, point.local, damage * target.cr_damage_taken, visual)?;
    sink.hull(target.id, result.hull);
    sink.armor_sparks_immediate(target.id, point.local, result.armor,visual)?;
    sink.components(target.id, point.local, result, emp, random)?;
    sink.record_energy(beam.is_player, DamageLayer::Armor, result.armor, emp);
    if result.hull > 0.0 { sink.record_energy(beam.is_player, DamageLayer::Hull, result.hull, 0.0); }
    let variant = 1 + (visual.next() * 3.0).floor().min(2.0) as u32;
    sink.sound(Sound::Tachyon(variant), end, 0.3, 1.5);
    sink.destroy_if_dead(target.id, random, visual); Ok(())
}
pub fn graviton(state: &mut BeamEffectState, beam: &BeamInput, target: Option<&TargetInput<'_>>,
    weapon: Option<WeaponIdentity>, listener: &mut GravitonHits) -> bool {
    let within = target.is_some_and(|t| within_emp_arc(t.shield, beam.endpoint));
    if !state.graviton_refresh(beam, weapon.is_some(), within) { return false; }
    listener.notify(weapon.unwrap()); true
}

#[derive(Clone, Copy)]
pub struct HitInput {
    pub effect: Effect, pub point: Point, pub shield: bool, pub damage: f64, pub emp: f64,
    pub high_frequency: bool, pub outgoing: f64, pub facing: f64, pub velocity: Point,
}
pub fn hit_ship<S: Sink>(hit: HitInput, target: &TargetInput<'_>, random: &mut Random, visual: &mut Random, sink: &mut S) -> Result<(), u32> {
    match hit.effect {
        Effect::Sabot => {
            if hit.shield || random.next() >= 0.25 { return Ok(()); }
            let point = pick_emp_target(target, hit.point, random);
            let end = world(target, point.local);
            sink.components(target.id, point.local, Damage::default(), hit.emp, random)?;
            sink.emp_arc_immediate(EmpArc { from: hit.point, to: end, target: target.id, width: 20.0, fringe: [25, 100, 155, 255], core: [255; 4] },visual)?;
            let variant = 1 + (visual.next() * 3.0).floor() as u32;
            sink.sound(Sound::Tachyon(variant), end, 0.3, 1.5);
        }
        Effect::Mote => {
            if target.fighter {
                let amount = (if hit.high_frequency { 1000.0 } else { 200.0 }) * hit.outgoing * target.cr_damage_taken;
                if hit.shield {
                    sink.shield_flux(target.id, amount * target.system_shield_multiplier * target.shield_efficiency * target.energy_shield_multiplier, true);
                } else {
                    let point = local(target, hit.point);
                    let result = sink.armor_energy(target.id, point, amount, visual)?;
                    sink.hull(target.id, result.hull);
                    sink.components(target.id, point, result, 0.0, random)?;
                }
            } else if !hit.shield || random.next() < target.shield_pierced {
                let point = pick_emp_target(target, hit.point, random);
                let end = world(target, point.local);
                let result = sink.armor_energy(target.id, point.local, hit.damage * hit.outgoing * target.cr_damage_taken, visual)?;
                sink.hull(target.id, result.hull);
                sink.components(target.id, point.local, result, hit.emp, random)?;
                sink.emp_arc_immediate(EmpArc { from: hit.point, to: end, target: target.id, width: 20.0,
                    fringe: if hit.high_frequency { [255, 100, 255, 255] } else { [100, 165, 255, 255] }, core: [255; 4] },visual)?;
                sink.sound(Sound::MoteEmp, end, 1.0, 1.0);
            }
            sink.sound(if hit.high_frequency { Sound::MoteDamage } else { Sound::MoteNormal }, hit.point, 1.0, 1.0);
        }
        Effect::HyperionYamato | Effect::GlorianaSiege => {
            if let Some(impact) = cosmetic(hit.effect, hit.point, hit.velocity, hit.facing, hit.shield) { sink.cosmetic_immediate(impact,visual)?; }
        }
        _ => return Err(8),
    } Ok(())
}
/// Source missile/fighter bonuses are already resident hit-time observations,
/// separate from outgoing ship damage. This never mutates the attacking mote.
pub fn mote_projectile_damage(high: bool, outgoing: f64, target_is_decoy: bool,
    missile_percent: f64, missile_multiplier: f64, fighter_percent: f64, fighter_multiplier: f64, point_defense: bool) -> f64 {
    let damage = (if high { 1000.0 } else { 200.0 }) * outgoing;
    if target_is_decoy { damage * (1.0 + (fighter_percent + if point_defense { 50.0 } else { 0.0 }) / 100.0) * fighter_multiplier }
    else { damage * (1.0 + missile_percent / 100.0) * missile_multiplier }
}

#[derive(Clone, Copy, Debug)]
pub struct Puff { pub texture: u32, pub offset: Point, pub velocity: Point, pub start_size: f64, pub end_size: f64, pub rotation: f64 }
#[derive(Clone, Copy, Debug)]
pub struct Flare { pub width: f64, pub height: f64, pub color: [u8; 3], pub velocity: Point }
#[derive(Clone, Copy, Debug)]
pub struct Flash { pub diameter: f64, pub core_diameter: f64, pub color: [u8; 3], pub duration: f64, pub velocity: Point }
#[derive(Clone, Debug)]
pub struct CosmeticImpact {
    pub effect: Effect, pub position: Point, pub radius: f64, pub max_radius: f64, pub life: f64,
    pub rotation: f64, pub color: [u8; 3], pub shockwave: bool, pub shockwave_radius: f64,
    pub max_shockwave_radius: f64, pub puff_duration: f64, pub puffs: Vec<Puff>, pub flare: Option<Flare>, pub flash: Option<Flash>,
}
pub fn cosmetic(effect: Effect, point: Point, velocity: Point, angle: f64, shield: bool) -> Option<CosmeticImpact> {
    match effect {
        Effect::HyperionYamato => {
            let size = if shield { 210.0 } else { 170.0 };
            Some(CosmeticImpact { effect, position: point, radius: size * 0.3, max_radius: size, life: 2.25, rotation: angle,
                color: [255, 170, 75], shockwave: true, shockwave_radius: 6.0, max_shockwave_radius: size, puff_duration: 0.7,
                puffs: vec![
                    Puff { texture: 1, offset: [0.0, 0.0], velocity, start_size: size * 0.6, end_size: size * 1.35, rotation: angle },
                    Puff { texture: 2, offset: contact::rotate([-18.0, 12.0], angle), velocity, start_size: size * 0.45, end_size: size, rotation: angle + 0.7 },
                    Puff { texture: 0, offset: contact::rotate([12.0, -16.0], angle), velocity, start_size: size * 0.4, end_size: size * 0.8, rotation: angle - 1.2 },
                    Puff { texture: 3, offset: [0.0, 0.0], velocity, start_size: 16.0, end_size: size * 2.0, rotation: angle },
                ], flare: Some(Flare { width: size * 1.4, height: size * 0.55, color: if shield { [190, 224, 255] } else { [255, 200, 110] }, velocity }), flash: None })
        }
        Effect::GlorianaSiege if !shield => {
            let outward = [ (angle + PI).cos(), (angle + PI).sin() ];
            let drift = [velocity[0] + outward[0] * 22.0, velocity[1] + outward[1] * 22.0];
            Some(CosmeticImpact { effect, position: point, radius: 18.0, max_radius: 52.0, life: 0.38, rotation: angle,
                color: [235, 165, 95], shockwave: false, shockwave_radius: 0.0, max_shockwave_radius: 0.0, puff_duration: 0.38,
                puffs: vec![
                    Puff { texture: 2, offset: [0.0, 0.0], velocity, start_size: 34.0, end_size: 68.0, rotation: angle },
                    Puff { texture: 1, offset: contact::rotate([-8.0, -6.0], angle), velocity: drift, start_size: 22.0, end_size: 76.0, rotation: angle + 0.8 },
                    Puff { texture: 1, offset: contact::rotate([-5.0, 9.0], angle), velocity: [velocity[0] + outward[0] * 35.0, velocity[1] + outward[1] * 35.0], start_size: 18.0, end_size: 57.0, rotation: angle - 1.1 },
                ], flare: None, flash: Some(Flash { diameter: 88.0, core_diameter: 26.0, color: [255, 220, 165], duration: 0.065, velocity }) })
        }
        _ => None,
    }
}
