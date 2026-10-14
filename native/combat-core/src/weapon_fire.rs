//! Real ordered Web firing cycles. This module consumes a decided intent; it
//! neither queries AI nor calls a JavaScript emitter. The owner must atomically
//! create resident entities from Emission and roll back all state on failure.
use crate::{flux::Flux, random::Random, weapon::Mount};

#[derive(Clone, Default)]
pub struct FireMountState {
    pub target_ship: Option<u32>,
    pub target_projectile: Option<u32>,
}

#[derive(Clone)]
pub struct FireSpec {
    pub burst_size: f64,
    pub interruptible: bool,
    pub auto_charge: bool,
    pub flux_per_shot: f64,
    pub flux_per_second: f64,
    pub beam_chargeup: f64,
    pub beam_chargedown: f64,
    pub beam_duration: f64,
    pub beam_fire_only_full: bool,
    pub beam_sustained: bool,
    pub max_spread: f64,
    pub spread_per_shot: f64,
    /// Resolved mount-type fallback, kept in installation order.
    pub offsets: Vec<[f64; 2]>,
    pub relative_pos: [f64; 2],
    pub damage_per_shot: f64,
    pub damage_per_second: f64,
    pub emp_per_shot: f64,
    pub emp_per_second: f64,
    pub physical_recoil_speed: f64,
    pub point_defense: bool,
    pub rocket: bool,
    /// Exactly the hasSourceMissileLifecycle gate at entity creation.
    pub source_missile_lifecycle: bool,
    pub dud_probability: f64,
    pub flight_time: Option<f64>,
    pub launch_speed: f64,
}

impl Default for FireSpec {
    fn default() -> Self {
        Self { burst_size: 1.0, interruptible: false, auto_charge: false,
            flux_per_shot: 0.0, flux_per_second: 0.0, beam_chargeup: 0.0,
            beam_chargedown: 0.0, beam_duration: 0.001, beam_fire_only_full: false,
            beam_sustained: false, max_spread: 0.0, spread_per_shot: 0.0,
            offsets: Vec::new(), relative_pos: [0.0, 0.0], damage_per_shot: 0.0,
            damage_per_second: 0.0, emp_per_shot: 0.0, emp_per_second: 0.0,
            physical_recoil_speed: 0.0, point_defense: false, rocket: false,
            source_missile_lifecycle: false, dud_probability: 0.0,
            flight_time: None, launch_speed: 0.0 }
    }
}

impl FireSpec {
    pub fn valid(&self) -> bool {
        [self.burst_size, self.flux_per_shot, self.flux_per_second,
            self.beam_chargeup, self.beam_chargedown, self.beam_duration,
            self.max_spread, self.spread_per_shot, self.relative_pos[0],
            self.relative_pos[1], self.damage_per_shot, self.damage_per_second,
            self.emp_per_shot, self.emp_per_second, self.physical_recoil_speed,
            self.dud_probability, self.launch_speed].iter().all(|v| v.is_finite())
            && self.flight_time.is_none_or(f64::is_finite)
            && self.offsets.iter().flatten().all(|v| v.is_finite())
    }
}

/// Derived exclusively from the owner's resident pose and attribute services.
/// Velocity is shared by all mounts so each shot sees earlier physical recoil.
pub struct FireContext {
    pub position: [f64; 2],
    pub velocity: [f64; 2],
    pub facing: f64,
    pub can_ship_fire: bool,
    pub ai_control: bool,
    pub flux_cost_multiplier: f64,
    pub recoil_multiplier: f64,
    pub cr_damage_multiplier: f64,
    pub weapon_damage_multiplier: f64,
    pub beam_damage_multiplier: f64,
    pub effective_range: f64,
    pub projectile_speed: f64,
    pub ecm_range_penalty: f64,
}

#[derive(Clone, Copy)]
pub struct FireInput {
    pub requested: bool,
    pub trigger_held: bool,
    pub disabled: bool,
    pub system_allows: bool,
    pub suspended: bool,
    /// Web commit rechecks automatic/non-active-manual requests in mount order.
    pub recheck_flux_budget: bool,
    pub step_dt: f64,
    pub target_ship: Option<u32>,
    pub target_projectile: Option<u32>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum EmissionKind { Projectile, BeamActive, BeamCharge, BeamChargedown }

#[derive(Clone, Debug)]
pub struct Emission {
    pub kind: EmissionKind,
    /// Web random entity identity, separate from numeric handle allocation.
    pub id: f64,
    pub component_id: u32,
    pub cycle_id: f64,
    pub position: [f64; 2],
    pub velocity: [f64; 2],
    pub angle: f64,
    pub barrel_offset: [f64; 2],
    pub base_damage: f64,
    pub source_damage_multiplier: f64,
    pub damage: f64,
    pub emp: f64,
    pub range: f64,
    pub duration: f64,
    pub target_ship: Option<u32>,
    pub target_projectile: Option<u32>,
    pub armed_while_fizzling: Option<bool>,
    pub flight_time: Option<f64>,
    /// Muzzle particles and the projectile inherit this pre-recoil velocity.
    pub source_velocity: [f64; 2],
    /// Applied by the caller to the resident hull and authored recoil hooks.
    pub recoil_delta: [f64; 2],
}

#[derive(Default, Debug)]
pub struct CommitResult { pub started: bool, pub flux_budget_rejected: bool }

/// Source stat readers run inside each emission, after its actual flux debit.
pub trait Hooks{
    fn read(&mut self,_:&Flux,_:&mut FireContext){}
    fn recoil(&mut self,flux:&mut Flux,delta:[f64;2]);
}
impl<F:FnMut(&mut Flux,[f64;2])> Hooks for F{fn recoil(&mut self,flux:&mut Flux,delta:[f64;2]){self(flux,delta);}}
struct NoHooks;
impl Hooks for NoHooks{fn recoil(&mut self,_:&mut Flux,_:[f64;2]){}}

fn rotate(v: [f64; 2], angle: f64) -> [f64; 2] {
    let c = angle.cos(); let s = angle.sin();
    [v[0] * c - v[1] * s, v[0] * s + v[1] * c]
}

fn fire_position(ctx: &FireContext, spec: &FireSpec, barrel: [f64; 2]) -> [f64; 2] {
    let mount = rotate(spec.relative_pos, ctx.facing);
    // Vector2.add twice: keep the source grouping rather than combine offsets.
    [ctx.position[0] + mount[0] + barrel[0], ctx.position[1] + mount[1] + barrel[1]]
}

fn emit_beam_state(m: &Mount, spec: &FireSpec, ctx: &mut FireContext,
    random: &mut Random, duration: f64, kind: EmissionKind, out: &mut Vec<Emission>,flux:&Flux,hooks:&mut dyn Hooks) {
    hooks.read(flux,ctx);
    let data = &m.data;
    out.push(Emission { kind, id: random.next(), component_id: data[0] as u32,
        cycle_id: data[26], position: fire_position(ctx, spec, [0.0, 0.0]),
        velocity: [0.0, 0.0], angle: data[15], barrel_offset: [0.0, 0.0],
        base_damage: spec.damage_per_second,
        source_damage_multiplier: ctx.cr_damage_multiplier * ctx.weapon_damage_multiplier * ctx.beam_damage_multiplier,
        damage: spec.damage_per_second * ctx.cr_damage_multiplier * ctx.weapon_damage_multiplier * ctx.beam_damage_multiplier,
        emp: spec.emp_per_second, range: ctx.effective_range, duration: duration.max(0.001),
        target_ship: None, target_projectile: None, armed_while_fizzling: None,
        flight_time: None, source_velocity: ctx.velocity, recoil_delta: [0.0, 0.0] });
}

/// True means a real entity was produced. Failure creates no emission or RNG draw.
pub fn emit_weapon(m: &mut Mount, state: &FireMountState, spec: &FireSpec,
    flux: &mut Flux, random: &mut Random, ctx: &mut FireContext,
    system_allows: bool, out: &mut Vec<Emission>) -> bool {
    emit_with_recoil(m,state,spec,flux,random,ctx,system_allows,out,&mut NoHooks)
}
fn emit_with_recoil(m:&mut Mount,state:&FireMountState,spec:&FireSpec,flux:&mut Flux,random:&mut Random,ctx:&mut FireContext,
    system_allows:bool,out:&mut Vec<Emission>,recoil_hook:&mut dyn Hooks)->bool{
    let d = &mut m.data;
    if d[27] > 0.0 || !system_allows { return false; }
    let beam = d[2] == 1.0;
    let cost = spec.flux_per_shot * ctx.flux_cost_multiplier;
    if !beam && d[22] == 0.0 && spec.flux_per_shot > 0.0 && flux.max - flux.total() < cost { return false; }
    if !beam && d[17].is_finite() {
        if d[17] < 1.0 { return false; }
        d[17] = (d[17] - 1.0).max(0.0);
    }
    d[28] = 1.0; d[29] = 1.0;
    let min = d[12];
    let max_source = if spec.max_spread == 0.0 { min } else { spec.max_spread };
    let max = (max_source * ctx.recoil_multiplier).max(min);
    d[31] = (d[31] + spec.spread_per_shot * ctx.recoil_multiplier).min(max);
    let spread = ((random.next() - 0.5) * d[31] * std::f64::consts::PI) / 180.0;
    let angle = d[15] + spread;
    let mut barrel = [0.0, 0.0];
    if !spec.offsets.is_empty() {
        // Installation validation guarantees an integer, nonnegative barrel index.
        let index = (d[30] % spec.offsets.len() as f64) as usize;
        barrel = spec.offsets[index];
        if d[14] == 1.0 {
            if d[32] == 0.0 { d[32] = 1.0; d[33] = 1.0; d[34] = 1.0; }
            d[33 + index % 2] = 0.0;
            if d[17] < 1.0 { d[33] = 0.0; d[34] = 0.0; }
        }
        d[30] = (d[30] + 1.0) % spec.offsets.len() as f64;
    }
    let position = fire_position(ctx, spec, rotate(barrel, d[15]));
    if !beam && d[22] == 0.0 && spec.flux_per_shot > 0.0 { flux.increase(cost, false, false); }
    let source_velocity = ctx.velocity;
    let id = random.next();
    let armed = if !beam && spec.source_missile_lifecycle { Some(random.next() > spec.dud_probability) } else { None };
    recoil_hook.read(flux,ctx);
    let source_damage = ctx.cr_damage_multiplier * ctx.weapon_damage_multiplier;
    let speed = if spec.rocket { spec.launch_speed } else { ctx.projectile_speed };
    let velocity = if beam { [0.0, 0.0] } else {
        [angle.cos() * speed + source_velocity[0], angle.sin() * speed + source_velocity[1]]
    };
    let recoil = if !beam && spec.physical_recoil_speed > 0.0 {
        [-angle.cos() * spec.physical_recoil_speed, -angle.sin() * spec.physical_recoil_speed]
    } else { [0.0, 0.0] };
    out.push(Emission { kind: if beam { EmissionKind::BeamActive } else { EmissionKind::Projectile },
        id, component_id: d[0] as u32, cycle_id: d[26], position, velocity, angle,
        barrel_offset: barrel, base_damage: if beam { spec.damage_per_second } else { spec.damage_per_shot },
        source_damage_multiplier: if beam { source_damage * ctx.beam_damage_multiplier } else { source_damage },
        damage: if beam { spec.damage_per_second * ctx.cr_damage_multiplier * ctx.weapon_damage_multiplier * ctx.beam_damage_multiplier }
            else { spec.damage_per_shot * ctx.cr_damage_multiplier * ctx.weapon_damage_multiplier },
        emp: if beam { spec.emp_per_second } else { spec.emp_per_shot }, range: ctx.effective_range,
        duration: if beam { if spec.beam_sustained { 9_007_199_254_740_991.0 } else { spec.beam_duration.max(0.001) } } else { 0.0 },
        target_ship: if beam { None } else { state.target_ship }, target_projectile: if beam { None } else { state.target_projectile },
        armed_while_fizzling: armed, flight_time: if beam { None } else { spec.flight_time.map(|t| t * (1.0 - ctx.ecm_range_penalty / 100.0)) },
        source_velocity, recoil_delta: recoil });
    if recoil != [0.0, 0.0] { ctx.velocity[0] += recoil[0]; ctx.velocity[1] += recoil[1];recoil_hook.recoil(flux,recoil); }
    true
}

fn activate_beam(m: &mut Mount, state: &FireMountState, spec: &FireSpec, flux: &mut Flux,
    random: &mut Random, ctx: &mut FireContext, allowed: bool, out: &mut Vec<Emission>,recoil_hook:&mut dyn Hooks) {
    m.data[23] = 2.0;
    m.data[24] = if m.data[3] == 1.0 { spec.beam_duration.max(0.001) } else { f64::INFINITY };
    emit_with_recoil(m, state, spec, flux, random, ctx, allowed, out,recoil_hook);
}

fn chargedown(m: &mut Mount, spec: &FireSpec, ctx: &mut FireContext,
    random: &mut Random, active: bool, out: &mut Vec<Emission>,flux:&Flux,hooks:&mut dyn Hooks) {
    let level = if m.data[23] == 1.0 { (1.0 - m.data[24] / spec.beam_chargeup.max(0.001)).clamp(0.0, 1.0) } else { 1.0 };
    let remaining = spec.beam_chargedown * level;
    if (active || !spec.beam_fire_only_full) && remaining > 0.0 {
        emit_beam_state(m, spec, ctx, random, remaining, EmissionKind::BeamChargedown, out,flux,hooks);
    }
    if remaining > 0.0 { m.data[23] = 3.0; m.data[24] = remaining; }
    else {
        m.data[23] = 0.0; m.data[24] = 0.0;
        m.data[16] = m.data[16].max(if m.data[7] == 1.0 { m.data[8] } else { m.data[4] });
    }
}

fn request(m: &mut Mount, state: &mut FireMountState, spec: &FireSpec, flux: &mut Flux,
    random: &mut Random, ctx: &mut FireContext, input: FireInput, out: &mut Vec<Emission>,recoil_hook:&mut dyn Hooks) -> bool {
    if m.data[27] > 0.0 || !input.system_allows { return false; }
    m.data[25] = 1.0;
    if m.data[2] == 1.0 {
        if m.data[23] != 0.0 || m.data[16] > 0.0 { return false; }
        if m.data[17].is_finite() && m.data[17] < 1.0 { return false; }
        if m.data[17].is_finite() { m.data[17] = (m.data[17] - 1.0).max(0.0); }
        m.data[26] += 1.0;
        if spec.beam_chargeup > 0.0 {
            m.data[23] = 1.0; m.data[24] = spec.beam_chargeup; m.data[29] = 0.0;
            if !spec.beam_fire_only_full { emit_beam_state(m, spec, ctx, random, spec.beam_chargeup, EmissionKind::BeamCharge, out,flux,recoil_hook); }
        } else { activate_beam(m, state, spec, flux, random, ctx, input.system_allows, out,recoil_hook); }
        return true;
    }
    if m.data[23] != 0.0 || m.data[20] > 0.0 || m.data[16] > 0.0 { return false; }
    if m.data[17].is_finite() && m.data[17] < 1.0 { return false; }
    let cost = spec.flux_per_shot * ctx.flux_cost_multiplier * if spec.interruptible { 1.0 } else { spec.burst_size.max(1.0) };
    if flux.max - flux.total() < cost { return false; }
    state.target_ship = input.target_ship; state.target_projectile = input.target_projectile;
    m.data[23] = 1.0; m.data[24] = m.data[5]; true
}

fn lifecycle(m: &mut Mount, state: &FireMountState, spec: &FireSpec, flux: &mut Flux,
    random: &mut Random, ctx: &mut FireContext, input: FireInput, out: &mut Vec<Emission>,recoil_hook:&mut dyn Hooks) {
    let dt = m.data[19]; let allowed = ctx.can_ship_fire && input.system_allows;
    if m.data[2] != 1.0 && m.data[23] == 1.0 {
        if !allowed || (m.data[25] == 0.0 && !spec.auto_charge) { m.data[23] = 0.0; m.data[24] = 0.0; return; }
        m.data[24] -= dt;
        m.data[29] = 1.0 - m.data[24].max(0.0) / m.data[5].max(0.001);
        if m.data[24] > 1e-9 { return; }
        m.data[23] = 0.0;
        let count = spec.burst_size.floor().max(1.0);
        if !spec.interruptible && count > 1.0 {
            let cost = spec.flux_per_shot * ctx.flux_cost_multiplier * count;
            if flux.max - flux.total() < cost { return; }
            flux.increase(cost, false, false); m.data[22] = 1.0;
        }
        if !emit_with_recoil(m, state, spec, flux, random, ctx, input.system_allows, out,recoil_hook) { m.data[22] = 0.0; return; }
        m.data[20] = count - 1.0;
        if count > 1.0 { m.data[21] = m.data[6]; } else { m.data[16] = m.data[4]; }
        return;
    }
    if m.data[2] != 1.0 && m.data[20] > 0.0 {
        if !allowed || (spec.interruptible && m.data[25] == 0.0) {
            m.data[20] = 0.0; m.data[22] = 0.0; m.data[21] = 0.0;
            m.data[16] = m.data[16].max(m.data[4]); return;
        }
        m.data[21] -= dt; let delay = m.data[6].max(0.0001);
        while m.data[20] > 0.0 && m.data[21] <= 1e-9 {
            if !emit_with_recoil(m, state, spec, flux, random, ctx, input.system_allows, out,recoil_hook) {
                m.data[20] = 0.0; m.data[22] = 0.0; m.data[21] = 0.0;
                m.data[16] = m.data[16].max(m.data[4]); break;
            }
            m.data[20] -= 1.0;
            if m.data[20] == 0.0 { m.data[22] = 0.0; }
            if m.data[20] > 0.0 { m.data[21] += delay; } else { m.data[16] = m.data[4]; }
        }
        return;
    }
    if m.data[2] != 1.0 { return; }
    if m.data[23] == 1.0 {
        if (m.data[25] == 0.0 && m.data[3] != 1.0) || !allowed { chargedown(m, spec, ctx, random, false, out,flux,recoil_hook); return; }
        if spec.flux_per_second != 0.0 && !flux.spend(spec.flux_per_second * ctx.flux_cost_multiplier * dt) {
            chargedown(m, spec, ctx, random, true, out,flux,recoil_hook); return;
        }
        m.data[24] -= dt;
        m.data[29] = m.data[29].max(1.0 - m.data[24].max(0.0) / spec.beam_chargeup.max(0.001));
        if m.data[24] <= 0.0 { activate_beam(m, state, spec, flux, random, ctx, input.system_allows, out,recoil_hook); }
        return;
    }
    if m.data[23] == 2.0 {
        if !allowed || (m.data[3] != 1.0 && m.data[25] == 0.0) { chargedown(m, spec, ctx, random, true, out,flux,recoil_hook); return; }
        if spec.flux_per_second != 0.0 && !flux.spend(spec.flux_per_second * ctx.flux_cost_multiplier * dt) {
            chargedown(m, spec, ctx, random, true, out,flux,recoil_hook); return;
        }
        if m.data[3] == 1.0 { m.data[24] -= dt; if m.data[24] <= 0.0 { chargedown(m, spec, ctx, random, true, out,flux,recoil_hook); } }
        return;
    }
    if m.data[23] == 3.0 {
        m.data[24] -= dt;
        m.data[29] = m.data[29].min(m.data[24].max(0.0) / spec.beam_chargedown.max(0.001));
        if m.data[24] <= 0.0 {
            m.data[23] = 0.0; m.data[24] = 0.0;
            m.data[16] = m.data[16].max(if m.data[7] == 1.0 { m.data[8] } else { m.data[4] });
        }
    }
}

/// Call once per mount in installation order after resident pre-fire/aim stages.
/// The returned start updates automatic alternating groups only on real starts.
pub fn commit_mount(m: &mut Mount, state: &mut FireMountState, spec: &FireSpec,
    flux: &mut Flux, random: &mut Random, ctx: &mut FireContext,
    input: FireInput, out: &mut Vec<Emission>) -> CommitResult {
    commit_mount_with_recoil(m,state,spec,flux,random,ctx,input,out,&mut NoHooks)
}
pub fn commit_mount_with_recoil(m:&mut Mount,state:&mut FireMountState,spec:&FireSpec,flux:&mut Flux,random:&mut Random,ctx:&mut FireContext,
    input:FireInput,out:&mut Vec<Emission>,recoil_hook:&mut dyn Hooks)->CommitResult{
    let mut result = CommitResult::default();
    if input.disabled { return result; }
    m.data[25] = input.trigger_held as u32 as f64;
    let mut requested = input.requested;
    if requested && input.recheck_flux_budget {
        let active = m.data[20] > 0.0 || m.data[23] == 1.0 || m.data[23] == 2.0;
        let cost = if m.data[2] == 1.0 {
            spec.flux_per_second * input.step_dt.max(if !active && m.data[3] == 1.0 { spec.beam_chargeup + spec.beam_duration } else { input.step_dt })
        } else if m.data[22] == 1.0 || active { 0.0 }
        else { spec.flux_per_shot * if spec.interruptible { 1.0 } else { spec.burst_size.max(1.0) } };
        let ceiling = if ctx.ai_control && !spec.point_defense && !active { 0.95 } else { 1.0 };
        if cost > 0.0 && flux.total() + cost * ctx.flux_cost_multiplier > flux.max * ceiling {
            requested = false; result.flux_budget_rejected = true;
        }
    }
    if ctx.can_ship_fire && requested { result.started = request(m, state, spec, flux, random, ctx, input, out,recoil_hook); }
    if input.suspended && ctx.can_ship_fire && input.system_allows { return result; }
    lifecycle(m, state, spec, flux, random, ctx, input, out,recoil_hook); result
}
