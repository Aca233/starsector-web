//! Foundry 2.0 Data-Oriented ECS Combat Kernel + Zero-Object Direct Render Pipeline.
//! Provides flat Structure-of-Arrays (SoA) simulation, 256px Spatial Hash Grid,
//! 8-sector Continuous Armor Field A(theta), Utility AI with Friendly-Fire Corridor,
//! Boids Fighter Swarm, Command Queue, Event Outbox, and 16-float Direct Sprite Buffer.

use std::cell::RefCell;
use std::collections::BTreeMap;

pub const ECS_ABI_VERSION: u32 = 200;
pub const FLOATS_PER_SPRITE: usize = 16;
pub const FLOATS_PER_BATCH_SLICE: usize = 4; // [start_index, instance_count, texture_slot, blend_mode]
pub const FLOATS_PER_RIBBON: usize = 10; // [x0, y0, x1, y1, width, r, g, b, a, tex_slot]
pub const FLOATS_PER_EVENT: usize = 8; // [event_type, entity_a, entity_b, x, y, angle, magnitude, extra]
pub const FLOATS_PER_PARTICLE_BURST: usize = 8; // [x, y, vx, vy, color_rgba_packed, size, lifetime, count]
pub const FLOATS_PER_SHIP_HUD: usize = 12; // [id, team, x, y, rot, hp_ratio, flux_ratio, hard_flux_ratio, shield_active, overloaded, armor_avg, system_state]

pub const MAX_SHIPS: usize = 256;
pub const MAX_FIGHTERS: usize = 1024;
pub const MAX_PROJECTILES: usize = 16384;
pub const MAX_RENDER_SPRITES: usize = 32768;
pub const MAX_BATCH_SLICES: usize = 128;
pub const MAX_RIBBONS: usize = 2048;
pub const MAX_EVENTS: usize = 1024;
pub const MAX_PARTICLE_BURSTS: usize = 2048;
pub const MAX_COMMANDS: usize = 1024;

const GRID_CELL_SIZE: f32 = 256.0;
const GRID_DIM: usize = 64; // 64x64 grid covering [-8192, 8192]^2
const GRID_TOTAL_CELLS: usize = GRID_DIM * GRID_DIM;

// Command opcodes (16-byte / 4-f32 commands: [opcode_and_target, arg0, arg1, arg2])
pub const CMD_APPLY_FORCE: u32 = 1;
pub const CMD_SET_TIME_SCALE: u32 = 2;
pub const CMD_SET_COLLISION_MASK: u32 = 3;
pub const CMD_SPAWN_PROJECTILE: u32 = 4;
pub const CMD_RADIAL_FORCE: u32 = 5;
pub const CMD_SET_AI_AGGRESSION: u32 = 6;

// Event codes
pub const EVT_HIT_SHIELD: f32 = 1.0;
pub const EVT_HIT_ARMOR: f32 = 2.0;
pub const EVT_SHIP_OVERLOADED: f32 = 3.0;
pub const EVT_SHIP_DESTROYED: f32 = 4.0;
pub const EVT_HERO_SOUND: f32 = 5.0;

/// Per-ship authoritative readback stride (f32 words):
/// `[id, team, active, x, y, vx, vy, rot, vrot, hp, max_hp, soft_flux, hard_flux, shield_active, overloaded_timer, armor_avg]`.
/// `id` is exposed as f32 for diagnostics; ids above 2^24 are not exactly representable.
pub const FLOATS_PER_SHIP_STATE: usize = 16;

/// `ecs_rng_witness_ptr` publishes this many f64 words:
/// `[combat_seed, combat_state, combat_ids, visual_seed, visual_state, visual_ids]`.
pub const ECS_RNG_WORDS: usize = 6;

/// Matches `SimulationRandom`'s default seed (`src/engine/simulation/SimulationRandom.ts`).
pub const DEFAULT_ECS_SEED: u32 = 0x51a7e5ed;
/// Matches `CombatEngine`'s visual stream derivation: `(seed ^ 0x9e3779b9) >>> 0`.
pub const VISUAL_SEED_XOR: u32 = 0x9e3779b9;

/// Fixed-step contract for the authority step.
pub const ECS_DT_MIN: f32 = 0.0001;
pub const ECS_DT_MAX: f32 = 0.1;

/// RNG stream ids for the diagnostic sample export.
pub const RNG_STREAM_COMBAT: u32 = 0;
pub const RNG_STREAM_VISUAL: u32 = 1;

/// Exact `SimulationRandom` semantics (mulberry32), including the untruncated JS cursor.
///
/// `state` is accumulated in binary64 exactly like the JS field (which is never
/// truncated to u32 between draws, not even past the 2^53 integer boundary), so it
/// is deliberately **f64** in an otherwise f32 kernel. Truncating or wrapping it here
/// would change the witness and eventually every sample.
#[derive(Clone, Copy)]
pub struct EcsRandom {
    pub seed: u32,
    pub state: f64,
    pub ids: f64,
}

impl EcsRandom {
    pub const fn new(seed: u32) -> Self {
        Self { seed, state: seed as f64, ids: 0.0 }
    }

    pub fn reset(&mut self, seed: u32) {
        self.seed = seed;
        self.state = seed as f64;
        self.ids = 0.0;
    }

    #[inline]
    pub fn next(&mut self) -> f64 {
        // JS `this.state += 0x6d2b79f5` then `>>> 0`; both steps are exact for f64.
        self.state += 0x6d2b79f5u32 as f64;
        let mut t = (self.state % 4_294_967_296.0) as u32;
        t = (t ^ (t >> 15)).wrapping_mul(t | 1);
        t ^= t.wrapping_add((t ^ (t >> 7)).wrapping_mul(t | 61));
        (t ^ (t >> 14)) as f64 / 4_294_967_296.0
    }

    #[inline]
    pub fn next_numeric_id(&mut self) -> f64 {
        self.ids += 1.0;
        self.ids
    }

    pub fn witness(&self) -> [f64; 3] {
        [self.seed as f64, self.state, self.ids]
    }
}

#[derive(Clone, Copy)]
pub struct EcsCommand {
    pub opcode: u32,
    pub target_id: u32,
    pub a: f32,
    pub b: f32,
    pub c: f32,
}

pub struct ShipSoA {
    pub count: usize,
    pub id: Vec<u32>,
    pub team: Vec<u32>,
    /// Authority role (`SHIP_ROLE_*`); drives the replay witness and diagnostics.
    pub role: Vec<u8>,
    pub active: Vec<u8>,
    pub x: Vec<f32>,
    pub y: Vec<f32>,
    pub vx: Vec<f32>,
    pub vy: Vec<f32>,
    pub rot: Vec<f32>,
    pub vrot: Vec<f32>,
    pub radius: Vec<f32>,
    pub mass: Vec<f32>,
    pub sprite_w: Vec<f32>,
    pub sprite_h: Vec<f32>,
    pub max_speed: Vec<f32>,
    pub accel: Vec<f32>,
    pub turn_rate: Vec<f32>,
    pub hp: Vec<f32>,
    pub max_hp: Vec<f32>,
    pub flux: Vec<f32>,
    pub hard_flux: Vec<f32>,
    pub max_flux: Vec<f32>,
    pub flux_dissipation: Vec<f32>,
    pub overloaded_timer: Vec<f32>,
    pub shield_active: Vec<u8>,
    pub shield_arc_cos: Vec<f32>,
    pub shield_radius: Vec<f32>,
    pub shield_efficiency: Vec<f32>,
    pub time_scale: Vec<f32>,
    pub collision_mask: Vec<u32>,
    /// 8-sector continuous armor field per ship (8 floats per ship)
    pub armor_sectors: Vec<[f32; 8]>,
    pub base_armor: Vec<f32>,
    pub fire_cooldown: Vec<f32>,
    pub weapon_damage: Vec<f32>,
    pub proj_speed: Vec<f32>,
    pub ai_aggression: Vec<f32>,
    pub tex_slot: Vec<f32>,
}

impl ShipSoA {
    pub fn with_capacity(cap: usize) -> Self {
        Self {
            count: 0,
            id: Vec::with_capacity(cap),
            team: Vec::with_capacity(cap),
            role: Vec::with_capacity(cap),
            active: Vec::with_capacity(cap),
            x: Vec::with_capacity(cap),
            y: Vec::with_capacity(cap),
            vx: Vec::with_capacity(cap),
            vy: Vec::with_capacity(cap),
            rot: Vec::with_capacity(cap),
            vrot: Vec::with_capacity(cap),
            radius: Vec::with_capacity(cap),
            mass: Vec::with_capacity(cap),
            sprite_w: Vec::with_capacity(cap),
            sprite_h: Vec::with_capacity(cap),
            max_speed: Vec::with_capacity(cap),
            accel: Vec::with_capacity(cap),
            turn_rate: Vec::with_capacity(cap),
            hp: Vec::with_capacity(cap),
            max_hp: Vec::with_capacity(cap),
            flux: Vec::with_capacity(cap),
            hard_flux: Vec::with_capacity(cap),
            max_flux: Vec::with_capacity(cap),
            flux_dissipation: Vec::with_capacity(cap),
            overloaded_timer: Vec::with_capacity(cap),
            shield_active: Vec::with_capacity(cap),
            shield_arc_cos: Vec::with_capacity(cap),
            shield_radius: Vec::with_capacity(cap),
            shield_efficiency: Vec::with_capacity(cap),
            time_scale: Vec::with_capacity(cap),
            collision_mask: Vec::with_capacity(cap),
            armor_sectors: Vec::with_capacity(cap),
            base_armor: Vec::with_capacity(cap),
            fire_cooldown: Vec::with_capacity(cap),
            weapon_damage: Vec::with_capacity(cap),
            proj_speed: Vec::with_capacity(cap),
            ai_aggression: Vec::with_capacity(cap),
            tex_slot: Vec::with_capacity(cap),
        }
    }
}

pub struct ProjectileSoA {
    pub count: usize,
    pub x: Vec<f32>,
    pub y: Vec<f32>,
    pub vx: Vec<f32>,
    pub vy: Vec<f32>,
    pub rot: Vec<f32>,
    pub radius: Vec<f32>,
    pub damage: Vec<f32>,
    pub ttl: Vec<f32>,
    pub team: Vec<u32>,
    pub owner_id: Vec<u32>,
    pub color_r: Vec<f32>,
    pub color_g: Vec<f32>,
    pub color_b: Vec<f32>,
    pub tex_slot: Vec<f32>,
}

impl ProjectileSoA {
    pub fn with_capacity(cap: usize) -> Self {
        Self {
            count: 0,
            x: Vec::with_capacity(cap),
            y: Vec::with_capacity(cap),
            vx: Vec::with_capacity(cap),
            vy: Vec::with_capacity(cap),
            rot: Vec::with_capacity(cap),
            radius: Vec::with_capacity(cap),
            damage: Vec::with_capacity(cap),
            ttl: Vec::with_capacity(cap),
            team: Vec::with_capacity(cap),
            owner_id: Vec::with_capacity(cap),
            color_r: Vec::with_capacity(cap),
            color_g: Vec::with_capacity(cap),
            color_b: Vec::with_capacity(cap),
            tex_slot: Vec::with_capacity(cap),
        }
    }

    #[inline]
    pub fn swap_remove(&mut self, idx: usize) {
        let last = self.count - 1;
        if idx != last {
            self.x[idx] = self.x[last];
            self.y[idx] = self.y[last];
            self.vx[idx] = self.vx[last];
            self.vy[idx] = self.vy[last];
            self.rot[idx] = self.rot[last];
            self.radius[idx] = self.radius[last];
            self.damage[idx] = self.damage[last];
            self.ttl[idx] = self.ttl[last];
            self.team[idx] = self.team[last];
            self.owner_id[idx] = self.owner_id[last];
            self.color_r[idx] = self.color_r[last];
            self.color_g[idx] = self.color_g[last];
            self.color_b[idx] = self.color_b[last];
            self.tex_slot[idx] = self.tex_slot[last];
        }
        self.x.pop();
        self.y.pop();
        self.vx.pop();
        self.vy.pop();
        self.rot.pop();
        self.radius.pop();
        self.damage.pop();
        self.ttl.pop();
        self.team.pop();
        self.owner_id.pop();
        self.color_r.pop();
        self.color_g.pop();
        self.color_b.pop();
        self.tex_slot.pop();
        self.count -= 1;
    }
}

pub struct FighterSwarmSoA {
    pub count: usize,
    pub x: Vec<f32>,
    pub y: Vec<f32>,
    pub vx: Vec<f32>,
    pub vy: Vec<f32>,
    pub rot: Vec<f32>,
    pub hp: Vec<f32>,
    pub team: Vec<u32>,
    pub role: Vec<u8>, // 0 = Interceptor (bait/PD decoy), 1 = Bomber (blind-spot strike)
    pub cooldown: Vec<f32>,
}

impl FighterSwarmSoA {
    pub fn with_capacity(cap: usize) -> Self {
        Self {
            count: 0,
            x: Vec::with_capacity(cap),
            y: Vec::with_capacity(cap),
            vx: Vec::with_capacity(cap),
            vy: Vec::with_capacity(cap),
            rot: Vec::with_capacity(cap),
            hp: Vec::with_capacity(cap),
            team: Vec::with_capacity(cap),
            role: Vec::with_capacity(cap),
            cooldown: Vec::with_capacity(cap),
        }
    }
}

pub struct EcsWorld {
    pub tick: u64,
    pub sim_time: f32,
    pub ships: ShipSoA,
    pub projectiles: ProjectileSoA,
    pub fighters: FighterSwarmSoA,
    pub command_queue: Vec<EcsCommand>,
    pub grid_heads: Vec<i32>,
    pub grid_next: Vec<i32>,
    /// Contiguous 16-float per sprite direct GPU instance buffer
    pub render_sprites: Vec<f32>,
    pub render_sprite_count: usize,
    /// Contiguous 4-float batch slice buffer [start, count, tex_slot, blend_mode]
    pub batch_slices: Vec<f32>,
    pub batch_slice_count: usize,
    /// Contiguous 10-float ribbon/beam buffer
    pub ribbon_buffer: Vec<f32>,
    pub ribbon_count: usize,
    /// Contiguous 8-float low-frequency gameplay/audio event outbox
    pub event_outbox: Vec<f32>,
    pub event_count: usize,
    /// Contiguous 8-float GPU particle burst buffer (decoupled from CPU physics)
    pub particle_bursts: Vec<f32>,
    pub particle_burst_count: usize,
    /// Contiguous 12-float per-ship HUD telemetry buffer
    pub hud_buffer: Vec<f32>,
    pub hud_ship_count: usize,
    /// Deterministic combat stream (exact `SimulationRandom` parity).
    pub combat_random: EcsRandom,
    /// Deterministic cosmetic stream, derived as `(seed ^ 0x9e3779b9) >>> 0`.
    pub visual_random: EcsRandom,
    /// Published RNG witness in f64 words: combat seed/state/ids, visual seed/state/ids.
    pub rng_witness: [f64; ECS_RNG_WORDS],
    /// Contiguous per-ship authoritative readback (`FLOATS_PER_SHIP_STATE` per ship).
    pub ship_state: Vec<f32>,
    /// Host replay witness (`WITNESS_WORDS` f64 words).
    pub witness: [f64; WITNESS_WORDS],
    /// Receipts for the last applied command batch (`FLOATS_PER_COMMAND_RESULT` each).
    pub command_results: Vec<f32>,
    /// Per-ship external control, indexed parallel to `ships`; cleared every step.
    pub ship_controls: Vec<ShipControl>,
}

impl EcsWorld {
    pub fn new() -> Self {
        Self::new_seeded(DEFAULT_ECS_SEED)
    }

    /// Creates a world with deterministic streams. `ecs_create_seeded` is the
    /// authority entry point; `ecs_create` keeps the default seed for legacy CLI callers.
    pub fn new_seeded(seed: u32) -> Self {
        Self {
            tick: 0,
            sim_time: 0.0,
            ships: ShipSoA::with_capacity(MAX_SHIPS),
            projectiles: ProjectileSoA::with_capacity(MAX_PROJECTILES),
            fighters: FighterSwarmSoA::with_capacity(MAX_FIGHTERS),
            command_queue: Vec::with_capacity(MAX_COMMANDS),
            grid_heads: vec![-1; GRID_TOTAL_CELLS],
            grid_next: vec![-1; MAX_SHIPS],
            render_sprites: Vec::with_capacity(MAX_RENDER_SPRITES * FLOATS_PER_SPRITE),
            render_sprite_count: 0,
            batch_slices: Vec::with_capacity(MAX_BATCH_SLICES * FLOATS_PER_BATCH_SLICE),
            batch_slice_count: 0,
            ribbon_buffer: Vec::with_capacity(MAX_RIBBONS * FLOATS_PER_RIBBON),
            ribbon_count: 0,
            event_outbox: Vec::with_capacity(MAX_EVENTS * FLOATS_PER_EVENT),
            event_count: 0,
            particle_bursts: Vec::with_capacity(MAX_PARTICLE_BURSTS * FLOATS_PER_PARTICLE_BURST),
            particle_burst_count: 0,
            hud_buffer: Vec::with_capacity(MAX_SHIPS * FLOATS_PER_SHIP_HUD),
            hud_ship_count: 0,
            combat_random: EcsRandom::new(seed),
            visual_random: EcsRandom::new(seed ^ VISUAL_SEED_XOR),
            rng_witness: [0.0; ECS_RNG_WORDS],
            ship_state: Vec::with_capacity(MAX_SHIPS * FLOATS_PER_SHIP_STATE),
            witness: [0.0; WITNESS_WORDS],
            command_results: Vec::with_capacity(MAX_COMMANDS * FLOATS_PER_COMMAND_RESULT),
            ship_controls: Vec::with_capacity(MAX_SHIPS),
        }
    }

    #[inline]
    fn cell_coords(x: f32, y: f32) -> (isize, isize) {
        let cx = ((x + 8192.0) / GRID_CELL_SIZE).floor() as isize;
        let cy = ((y + 8192.0) / GRID_CELL_SIZE).floor() as isize;
        (
            cx.clamp(0, (GRID_DIM - 1) as isize),
            cy.clamp(0, (GRID_DIM - 1) as isize),
        )
    }

    #[inline]
    fn push_event(&mut self, evt_type: f32, a: f32, b: f32, x: f32, y: f32, angle: f32, mag: f32, extra: f32) {
        if self.event_count >= MAX_EVENTS {
            return;
        }
        self.event_outbox.extend_from_slice(&[evt_type, a, b, x, y, angle, mag, extra]);
        self.event_count += 1;
    }

    #[inline]
    fn push_particle_burst(&mut self, x: f32, y: f32, vx: f32, vy: f32, rgba_packed: f32, size: f32, lifetime: f32, count: f32) {
        if self.particle_burst_count >= MAX_PARTICLE_BURSTS {
            return;
        }
        self.particle_bursts.extend_from_slice(&[x, y, vx, vy, rgba_packed, size, lifetime, count]);
        self.particle_burst_count += 1;
    }

    pub fn spawn_ship(
        &mut self,
        id: u32,
        team: u32,
        x: f32,
        y: f32,
        rot: f32,
        radius: f32,
        mass: f32,
        sprite_w: f32,
        sprite_h: f32,
        max_speed: f32,
        accel: f32,
        turn_rate: f32,
        hp: f32,
        base_armor: f32,
        max_flux: f32,
        flux_dissipation: f32,
        shield_arc_deg: f32,
        shield_radius: f32,
        shield_efficiency: f32,
        weapon_damage: f32,
        proj_speed: f32,
        tex_slot: f32,
    ) -> u32 {
        if self.ships.count >= MAX_SHIPS {
            return u32::MAX;
        }
        let idx = self.ships.count;
        self.ships.count += 1;
        self.ships.id.push(id);
        self.ships.team.push(team);
        self.ships.role.push(SHIP_ROLE_NONE);
        self.ships.active.push(1);
        self.ships.x.push(x);
        self.ships.y.push(y);
        self.ships.vx.push(0.0);
        self.ships.vy.push(0.0);
        self.ships.rot.push(rot);
        self.ships.vrot.push(0.0);
        self.ships.radius.push(radius.max(8.0));
        self.ships.mass.push(mass.max(10.0));
        self.ships.sprite_w.push(sprite_w.max(16.0));
        self.ships.sprite_h.push(sprite_h.max(16.0));
        self.ships.max_speed.push(max_speed.max(10.0));
        self.ships.accel.push(accel.max(5.0));
        self.ships.turn_rate.push(turn_rate.max(0.1));
        self.ships.hp.push(hp.max(1.0));
        self.ships.max_hp.push(hp.max(1.0));
        self.ships.flux.push(0.0);
        self.ships.hard_flux.push(0.0);
        self.ships.max_flux.push(max_flux.max(100.0));
        self.ships.flux_dissipation.push(flux_dissipation.max(1.0));
        self.ships.overloaded_timer.push(0.0);
        let has_shield = u8::from(shield_arc_deg > 0.0 && shield_radius > 0.0);
        self.ships.shield_active.push(has_shield);
        let half_arc_rad = (shield_arc_deg * 0.5).to_radians();
        self.ships.shield_arc_cos.push(half_arc_rad.cos());
        self.ships.shield_radius.push(shield_radius.max(radius));
        self.ships.shield_efficiency.push(shield_efficiency.max(0.1));
        self.ships.time_scale.push(1.0);
        self.ships.collision_mask.push(0xFFFF_FFFF);
        // 8-sector continuous armor distribution (front-reinforced default)
        self.ships.armor_sectors.push([
            base_armor * 1.15,
            base_armor * 1.05,
            base_armor * 1.00,
            base_armor * 0.90,
            base_armor * 0.85,
            base_armor * 0.90,
            base_armor * 1.00,
            base_armor * 1.05,
        ]);
        self.ships.base_armor.push(base_armor.max(10.0));
        self.ships.fire_cooldown.push(0.0);
        self.ships.weapon_damage.push(weapon_damage.max(0.0));
        self.ships.proj_speed.push(proj_speed.max(300.0));
        self.ships.ai_aggression.push(0.75);
        self.ships.tex_slot.push(tex_slot);
        self.ship_controls.push(ShipControl::default());
        idx as u32
    }

    pub fn spawn_projectile(
        &mut self,
        x: f32,
        y: f32,
        vx: f32,
        vy: f32,
        radius: f32,
        damage: f32,
        ttl: f32,
        team: u32,
        owner_id: u32,
        r: f32,
        g: f32,
        b: f32,
        tex_slot: f32,
    ) -> u32 {
        if self.projectiles.count >= MAX_PROJECTILES {
            return u32::MAX;
        }
        let idx = self.projectiles.count;
        self.projectiles.count += 1;
        self.projectiles.x.push(x);
        self.projectiles.y.push(y);
        self.projectiles.vx.push(vx);
        self.projectiles.vy.push(vy);
        self.projectiles.rot.push(vy.atan2(vx));
        self.projectiles.radius.push(radius.max(2.0));
        self.projectiles.damage.push(damage.max(0.0));
        self.projectiles.ttl.push(ttl.max(0.05));
        self.projectiles.team.push(team);
        self.projectiles.owner_id.push(owner_id);
        self.projectiles.color_r.push(r);
        self.projectiles.color_g.push(g);
        self.projectiles.color_b.push(b);
        self.projectiles.tex_slot.push(tex_slot);
        idx as u32
    }

    pub fn spawn_fighter(&mut self, x: f32, y: f32, vx: f32, vy: f32, team: u32, role: u8) -> u32 {
        if self.fighters.count >= MAX_FIGHTERS {
            return u32::MAX;
        }
        let idx = self.fighters.count;
        self.fighters.count += 1;
        self.fighters.x.push(x);
        self.fighters.y.push(y);
        self.fighters.vx.push(vx);
        self.fighters.vy.push(vy);
        self.fighters.rot.push(vy.atan2(vx));
        self.fighters.hp.push(150.0);
        self.fighters.team.push(team);
        self.fighters.role.push(role);
        self.fighters.cooldown.push(0.0);
        idx as u32
    }

    pub fn push_command(&mut self, opcode: u32, target_id: u32, a: f32, b: f32, c: f32) -> u32 {
        if self.command_queue.len() >= MAX_COMMANDS {
            return 0;
        }
        self.command_queue.push(EcsCommand { opcode, target_id, a, b, c });
        1
    }

    /// Evaluates Continuous Armor Field A(theta) and applies smooth angular Gaussian ablation.
    #[inline]
    fn apply_continuous_armor_damage(&mut self, ship_idx: usize, impact_angle_local: f32, raw_damage: f32) -> f32 {
        let tau = std::f32::consts::TAU;
        let normalized = ((impact_angle_local % tau) + tau) % tau;
        let sector_f = (normalized / tau) * 8.0;
        let s0 = (sector_f.floor() as usize) & 7;
        let s1 = (s0 + 1) & 7;
        let frac = sector_f - sector_f.floor();

        let sectors = &mut self.ships.armor_sectors[ship_idx];
        let eff_armor = sectors[s0] * (1.0 - frac) + sectors[s1] * frac;
        let damage_mult = raw_damage / (raw_damage + eff_armor.max(5.0));
        let hull_damage = raw_damage * damage_mult;
        let armor_ablation = raw_damage * (1.0 - damage_mult * 0.5) * 0.35;

        let min_residual = self.ships.base_armor[ship_idx] * 0.05;
        // Smooth 3-sector Gaussian kernel instead of 21-cell 2D grid iteration
        let prev = (s0 + 7) & 7;
        sectors[s0] = (sectors[s0] - armor_ablation * 0.60).max(min_residual);
        sectors[s1] = (sectors[s1] - armor_ablation * 0.25).max(min_residual);
        sectors[prev] = (sectors[prev] - armor_ablation * 0.15).max(min_residual);

        hull_damage
    }

    /// Checks whether firing along (dir_x, dir_y) from shooter_idx would hit a friendly ship in the corridor.
    #[inline]
    fn has_friendly_in_fire_corridor(&self, shooter_idx: usize, dir_x: f32, dir_y: f32, max_range: f32) -> bool {
        let sx = self.ships.x[shooter_idx];
        let sy = self.ships.y[shooter_idx];
        let steam = self.ships.team[shooter_idx];
        for j in 0..self.ships.count {
            if j == shooter_idx || self.ships.active[j] == 0 || self.ships.team[j] != steam {
                continue;
            }
            let dx = self.ships.x[j] - sx;
            let dy = self.ships.y[j] - sy;
            let proj = dx * dir_x + dy * dir_y;
            if proj <= 0.0 || proj >= max_range {
                continue;
            }
            let perp_sq = (dx * dx + dy * dy) - proj * proj;
            let safe_radius = self.ships.radius[j] + 18.0;
            if perp_sq < safe_radius * safe_radius {
                return true;
            }
        }
        false
    }
}

impl EcsWorld {
    pub fn step(&mut self, dt: f32) {
        let dt = dt.clamp(0.0001, 0.1);
        self.tick += 1;
        self.sim_time += dt;
        self.event_outbox.clear();
        self.event_count = 0;
        self.particle_bursts.clear();
        self.particle_burst_count = 0;

        // 1. Drain Command Queue (16B atomic physics primitives) with receipts.
        self.apply_commands();

        // 2. Rebuild 256px Spatial Hash Grid for Ships
        self.grid_heads.fill(-1);
        if self.grid_next.len() < self.ships.count {
            self.grid_next.resize(self.ships.count, -1);
        }
        for i in 0..self.ships.count {
            if self.ships.active[i] == 0 {
                self.grid_next[i] = -1;
                continue;
            }
            let (cx, cy) = Self::cell_coords(self.ships.x[i], self.ships.y[i]);
            let cell = (cy as usize) * GRID_DIM + (cx as usize);
            self.grid_next[i] = self.grid_heads[cell];
            self.grid_heads[cell] = i as i32;
        }

        // 3. Ship Utility AI, Friendly-Fire Corridor Fire Control, Flux & Kinematics
        for i in 0..self.ships.count {
            if self.ships.active[i] == 0 {
                continue;
            }
            let ship_dt = dt * self.ships.time_scale[i];

            // Flux dissipation & overload recovery
            if self.ships.overloaded_timer[i] > 0.0 {
                self.ships.overloaded_timer[i] = (self.ships.overloaded_timer[i] - ship_dt).max(0.0);
                self.ships.flux[i] = (self.ships.flux[i] - self.ships.flux_dissipation[i] * 0.5 * ship_dt).max(0.0);
                self.ships.hard_flux[i] = self.ships.hard_flux[i].min(self.ships.flux[i]);
            } else {
                let diss = self.ships.flux_dissipation[i] * ship_dt;
                let soft = (self.ships.flux[i] - self.ships.hard_flux[i]).max(0.0);
                if diss <= soft {
                    self.ships.flux[i] -= diss;
                } else if self.ships.shield_active[i] == 0 {
                    let rem = diss - soft;
                    self.ships.hard_flux[i] = (self.ships.hard_flux[i] - rem).max(0.0);
                    self.ships.flux[i] = self.ships.hard_flux[i];
                } else {
                    self.ships.flux[i] = self.ships.hard_flux[i];
                }
            }

            // External control for this tick, or the ship's own AI. The AI body below is
            // left untouched so its behaviour stays bit-identical to previous builds.
            if self.ship_controls[i].state == CONTROL_ACTIVE {
                self.step_manual_control(i, ship_dt);
            } else {
            // Utility AI target selection & smooth threat curve (eliminates Hesitation Loop)
            let my_team = self.ships.team[i];
            let mut best_target: Option<usize> = None;
            let mut best_dist_sq = f32::MAX;
            for j in 0..self.ships.count {
                if self.ships.active[j] == 0 || self.ships.team[j] == my_team {
                    continue;
                }
                let dx = self.ships.x[j] - self.ships.x[i];
                let dy = self.ships.y[j] - self.ships.y[i];
                let d2 = dx * dx + dy * dy;
                if d2 < best_dist_sq {
                    best_dist_sq = d2;
                    best_target = Some(j);
                }
            }

            if let Some(target_idx) = best_target {
                let dx = self.ships.x[target_idx] - self.ships.x[i];
                let dy = self.ships.y[target_idx] - self.ships.y[i];
                let dist = best_dist_sq.sqrt().max(1.0);
                let dir_x = dx / dist;
                let dir_y = dy / dist;
                let desired_angle = dy.atan2(dx);

                let mut angle_diff = desired_angle - self.ships.rot[i];
                while angle_diff > std::f32::consts::PI {
                    angle_diff -= std::f32::consts::TAU;
                }
                while angle_diff < -std::f32::consts::PI {
                    angle_diff += std::f32::consts::TAU;
                }
                let max_turn = self.ships.turn_rate[i] * ship_dt;
                self.ships.rot[i] += angle_diff.clamp(-max_turn, max_turn);

                // Smooth Utility Curve: commit to attack when flux < 82% or enemy is critically low
                let my_flux_ratio = self.ships.flux[i] / self.ships.max_flux[i].max(1.0);
                let enemy_hp_ratio = self.ships.hp[target_idx] / self.ships.max_hp[target_idx].max(1.0);
                let utility_drive = self.ships.ai_aggression[i] + (1.0 - enemy_hp_ratio) * 0.45 - my_flux_ratio * 0.85;
                let preferred_range = 420.0;
                let thrust_sign = if utility_drive > 0.15 {
                    if dist > preferred_range { 1.0 } else if dist < preferred_range * 0.65 { -0.5 } else { 0.2 }
                } else {
                    -0.85
                };

                let accel = self.ships.accel[i] * ship_dt * thrust_sign;
                self.ships.vx[i] += self.ships.rot[i].cos() * accel;
                self.ships.vy[i] += self.ships.rot[i].sin() * accel;

                // Clamp speed
                let speed_sq = self.ships.vx[i] * self.ships.vx[i] + self.ships.vy[i] * self.ships.vy[i];
                let max_spd = self.ships.max_speed[i];
                if speed_sq > max_spd * max_spd {
                    let s = max_spd / speed_sq.sqrt();
                    self.ships.vx[i] *= s;
                    self.ships.vy[i] *= s;
                }

                // Friendly Fire Corridor check before firing weapons
                self.ships.fire_cooldown[i] = (self.ships.fire_cooldown[i] - ship_dt).max(0.0);
                if self.ships.overloaded_timer[i] <= 0.0
                    && self.ships.weapon_damage[i] > 0.0
                    && self.ships.fire_cooldown[i] <= 0.0
                    && dist < 1100.0
                    && angle_diff.abs() < 0.35
                    && !self.has_friendly_in_fire_corridor(i, dir_x, dir_y, dist)
                {
                    self.ships.fire_cooldown[i] = 0.25;
                    let p_speed = self.ships.proj_speed[i];
                    let muzzle_x = self.ships.x[i] + dir_x * (self.ships.radius[i] + 6.0);
                    let muzzle_y = self.ships.y[i] + dir_y * (self.ships.radius[i] + 6.0);
                    let dmg = self.ships.weapon_damage[i];
                    let ship_id = self.ships.id[i];
                    self.spawn_projectile(
                        muzzle_x,
                        muzzle_y,
                        self.ships.vx[i] * 0.25 + dir_x * p_speed,
                        self.ships.vy[i] * 0.25 + dir_y * p_speed,
                        4.5,
                        dmg,
                        2.2,
                        my_team,
                        ship_id,
                        if my_team == 0 { 0.35 } else { 1.0 },
                        if my_team == 0 { 0.85 } else { 0.35 },
                        if my_team == 0 { 1.0 } else { 0.25 },
                        1.0,
                    );
                }
            }
            }

            self.ships.x[i] += self.ships.vx[i] * ship_dt;
            self.ships.y[i] += self.ships.vy[i] * ship_dt;
            self.ships.rot[i] += self.ships.vrot[i] * ship_dt;
            self.ships.vrot[i] *= 0.92;
        }

        // A control sample belongs to exactly one tick.
        for control in self.ship_controls.iter_mut() {
            control.state = CONTROL_INACTIVE;
        }

        // 4. Boids Fighter Swarm Coordination (PD Evasion + Blind-Spot Strike)
        for f in 0..self.fighters.count {
            if self.fighters.hp[f] <= 0.0 {
                continue;
            }
            let fx = self.fighters.x[f];
            let fy = self.fighters.y[f];
            let fteam = self.fighters.team[f];
            let mut sep_x = 0.0f32;
            let mut sep_y = 0.0f32;
            // Separation + PD evasion weave
            let weave = (self.sim_time * 6.0 + (f as f32) * 1.3).sin() * 45.0;
            for other in 0..self.fighters.count {
                if other == f || self.fighters.hp[other] <= 0.0 {
                    continue;
                }
                let dx = fx - self.fighters.x[other];
                let dy = fy - self.fighters.y[other];
                let d2 = dx * dx + dy * dy;
                if d2 > 0.01 && d2 < 36.0 * 36.0 {
                    let inv = 1.0 / d2.sqrt();
                    sep_x += dx * inv * 60.0;
                    sep_y += dy * inv * 60.0;
                }
            }
            // Seek enemy ship rear blind-spot for bombers, front screen for interceptors
            for s in 0..self.ships.count {
                if self.ships.active[s] == 0 || self.ships.team[s] == fteam {
                    continue;
                }
                let blind_offset = if self.fighters.role[f] == 1 { -self.ships.radius[s] * 1.4 } else { self.ships.radius[s] * 1.1 };
                let tx = self.ships.x[s] + self.ships.rot[s].cos() * blind_offset;
                let ty = self.ships.y[s] + self.ships.rot[s].sin() * blind_offset;
                let dx = tx - fx;
                let dy = ty - fy;
                let d = (dx * dx + dy * dy).sqrt().max(1.0);
                let perp_x = -dy / d;
                let perp_y = dx / d;
                self.fighters.vx[f] = (dx / d) * 260.0 + perp_x * weave + sep_x;
                self.fighters.vy[f] = (dy / d) * 260.0 + perp_y * weave + sep_y;
                break;
            }
            self.fighters.x[f] += self.fighters.vx[f] * dt;
            self.fighters.y[f] += self.fighters.vy[f] * dt;
            self.fighters.rot[f] = self.fighters.vy[f].atan2(self.fighters.vx[f]);
        }

        // 5. Projectile Kinematics + Spatial Hash Grid Broadphase + Shield Arc / Continuous Armor Narrowphase
        let mut p = 0;
        while p < self.projectiles.count {
            self.projectiles.ttl[p] -= dt;
            if self.projectiles.ttl[p] <= 0.0 {
                self.projectiles.swap_remove(p);
                continue;
            }
            let px = self.projectiles.x[p] + self.projectiles.vx[p] * dt;
            let py = self.projectiles.y[p] + self.projectiles.vy[p] * dt;
            self.projectiles.x[p] = px;
            self.projectiles.y[p] = py;

            let pteam = self.projectiles.team[p];
            let pradius = self.projectiles.radius[p];
            let pdmg = self.projectiles.damage[p];
            let (cx, cy) = Self::cell_coords(px, py);

            let mut hit_ship: Option<(usize, bool, f32)> = None;
            'cell_loop: for ny in (cy - 1).max(0)..=(cy + 1).min((GRID_DIM - 1) as isize) {
                for nx in (cx - 1).max(0)..=(cx + 1).min((GRID_DIM - 1) as isize) {
                    let mut s_idx = self.grid_heads[(ny as usize) * GRID_DIM + (nx as usize)];
                    while s_idx >= 0 {
                        let s = s_idx as usize;
                        s_idx = self.grid_next[s];
                        if self.ships.active[s] == 0 || self.ships.team[s] == pteam || self.ships.collision_mask[s] == 0 {
                            continue;
                        }
                        let dx = px - self.ships.x[s];
                        let dy = py - self.ships.y[s];
                        let dist_sq = dx * dx + dy * dy;

                        // Check shield arc first if active and not overloaded
                        let shield_up = self.ships.shield_active[s] != 0 && self.ships.overloaded_timer[s] <= 0.0;
                        let check_r = if shield_up {
                            self.ships.shield_radius[s] + pradius
                        } else {
                            self.ships.radius[s] + pradius
                        };
                        if dist_sq <= check_r * check_r {
                            let impact_world_angle = dy.atan2(dx);
                            let local_angle = impact_world_angle - self.ships.rot[s];
                            let in_shield_arc = shield_up && local_angle.cos() >= self.ships.shield_arc_cos[s];
                            if in_shield_arc || dist_sq <= (self.ships.radius[s] + pradius).powi(2) {
                                hit_ship = Some((s, in_shield_arc, local_angle));
                                break 'cell_loop;
                            }
                        }
                    }
                }
            }

            if let Some((s, hit_shield, local_angle)) = hit_ship {
                let ship_id = self.ships.id[s] as f32;
                if hit_shield {
                    let flux_added = pdmg * self.ships.shield_efficiency[s];
                    self.ships.flux[s] += flux_added;
                    self.ships.hard_flux[s] += flux_added;
                    if self.ships.flux[s] >= self.ships.max_flux[s] {
                        self.ships.flux[s] = self.ships.max_flux[s];
                        self.ships.overloaded_timer[s] = 4.5;
                        self.push_event(EVT_SHIP_OVERLOADED, ship_id, 0.0, px, py, local_angle, flux_added, 1.0);
                    } else {
                        self.push_event(EVT_HIT_SHIELD, ship_id, 0.0, px, py, local_angle, pdmg, 0.0);
                    }
                    // Emit GPU particle burst (zero CPU particle entities!)
                    self.push_particle_burst(px, py, -self.projectiles.vx[p] * 0.2, -self.projectiles.vy[p] * 0.2, 0.45, 6.0, 0.35, 12.0);
                } else {
                    let hull_dmg = self.apply_continuous_armor_damage(s, local_angle, pdmg);
                    self.ships.hp[s] -= hull_dmg;
                    self.push_event(EVT_HIT_ARMOR, ship_id, 0.0, px, py, local_angle, hull_dmg, pdmg);
                    self.push_particle_burst(px, py, -self.projectiles.vx[p] * 0.15, -self.projectiles.vy[p] * 0.15, 0.85, 8.0, 0.55, 18.0);
                    if pdmg >= 250.0 {
                        // Heavy weapon impact triggers Hero Sound ducking tier 1
                        self.push_event(EVT_HERO_SOUND, ship_id, 1.0, px, py, local_angle, pdmg, 1.0);
                    }
                    if self.ships.hp[s] <= 0.0 {
                        self.ships.hp[s] = 0.0;
                        self.ships.active[s] = 0;
                        self.push_event(EVT_SHIP_DESTROYED, ship_id, 0.0, self.ships.x[s], self.ships.y[s], self.ships.rot[s], self.ships.max_hp[s], 1.0);
                        self.push_event(EVT_HERO_SOUND, ship_id, 2.0, self.ships.x[s], self.ships.y[s], 0.0, 1000.0, 1.0);
                        self.push_particle_burst(self.ships.x[s], self.ships.y[s], 0.0, 0.0, 1.0, 32.0, 1.4, 64.0);
                    }
                }
                self.projectiles.swap_remove(p);
                continue;
            }
            p += 1;
        }

        // 6. Populate Direct 16-Float Sprite Buffer, Batch Slices, Ribbon Buffer, and HUD Telemetry
        self.build_render_buffers();
    }
}

impl EcsWorld {
    /// Writes directly into contiguous 16-float SpriteBatcher layout:
    /// [worldX, worldY, scaleX, scaleY, rot, pivotX, pivotY, u0, v0, u1, v1, r, g, b, a, texSlot]
    pub fn build_render_buffers(&mut self) {
        self.render_sprites.clear();
        self.render_sprite_count = 0;
        self.batch_slices.clear();
        self.batch_slice_count = 0;
        self.ribbon_buffer.clear();
        self.ribbon_count = 0;
        self.hud_buffer.clear();
        self.hud_ship_count = 0;

        // Pass 1: Hulls (Normal Alpha Blend = 0.0)
        let hull_start = self.render_sprite_count;
        for i in 0..self.ships.count {
            if self.ships.active[i] == 0 || self.render_sprite_count >= MAX_RENDER_SPRITES {
                continue;
            }
            let armor_avg = self.ships.armor_sectors[i].iter().sum::<f32>() / (8.0 * self.ships.base_armor[i].max(1.0));
            let tint = (0.55 + 0.45 * armor_avg).clamp(0.35, 1.0);
            self.render_sprites.extend_from_slice(&[
                self.ships.x[i],
                self.ships.y[i],
                self.ships.sprite_w[i],
                self.ships.sprite_h[i],
                self.ships.rot[i],
                0.5,
                0.5,
                0.0,
                0.0,
                1.0,
                1.0,
                tint,
                tint,
                tint,
                1.0,
                self.ships.tex_slot[i],
            ]);
            self.render_sprite_count += 1;

            // Populate HUD telemetry (12 floats per active ship)
            let hp_ratio = (self.ships.hp[i] / self.ships.max_hp[i].max(1.0)).clamp(0.0, 1.0);
            let flux_ratio = (self.ships.flux[i] / self.ships.max_flux[i].max(1.0)).clamp(0.0, 1.0);
            let hard_ratio = (self.ships.hard_flux[i] / self.ships.max_flux[i].max(1.0)).clamp(0.0, 1.0);
            self.hud_buffer.extend_from_slice(&[
                self.ships.id[i] as f32,
                self.ships.team[i] as f32,
                self.ships.x[i],
                self.ships.y[i],
                self.ships.rot[i],
                hp_ratio,
                flux_ratio,
                hard_ratio,
                self.ships.shield_active[i] as f32,
                u8::from(self.ships.overloaded_timer[i] > 0.0) as f32,
                armor_avg.clamp(0.0, 1.5),
                self.ships.time_scale[i],
            ]);
            self.hud_ship_count += 1;
        }
        let hull_count = self.render_sprite_count - hull_start;
        if hull_count > 0 && self.batch_slice_count < MAX_BATCH_SLICES {
            self.batch_slices.extend_from_slice(&[hull_start as f32, hull_count as f32, 0.0, 0.0]);
            self.batch_slice_count += 1;
        }

        // Pass 2: Fighters (Normal Alpha Blend = 0.0)
        let fighter_start = self.render_sprite_count;
        for f in 0..self.fighters.count {
            if self.fighters.hp[f] <= 0.0 || self.render_sprite_count >= MAX_RENDER_SPRITES {
                continue;
            }
            self.render_sprites.extend_from_slice(&[
                self.fighters.x[f],
                self.fighters.y[f],
                18.0,
                14.0,
                self.fighters.rot[f],
                0.5,
                0.5,
                0.0,
                0.0,
                1.0,
                1.0,
                0.9,
                0.95,
                1.0,
                1.0,
                2.0,
            ]);
            self.render_sprite_count += 1;
        }
        let fighter_count = self.render_sprite_count - fighter_start;
        if fighter_count > 0 && self.batch_slice_count < MAX_BATCH_SLICES {
            self.batch_slices.extend_from_slice(&[fighter_start as f32, fighter_count as f32, 2.0, 0.0]);
            self.batch_slice_count += 1;
        }

        // Pass 3: Projectiles & Shield Glows (Additive Blend = 1.0)
        let proj_start = self.render_sprite_count;
        for p in 0..self.projectiles.count {
            if self.render_sprite_count >= MAX_RENDER_SPRITES {
                break;
            }
            let r = self.projectiles.radius[p];
            self.render_sprites.extend_from_slice(&[
                self.projectiles.x[p],
                self.projectiles.y[p],
                r * 3.2,
                r * 1.4,
                self.projectiles.rot[p],
                0.5,
                0.5,
                0.0,
                0.0,
                1.0,
                1.0,
                self.projectiles.color_r[p],
                self.projectiles.color_g[p],
                self.projectiles.color_b[p],
                0.95,
                self.projectiles.tex_slot[p],
            ]);
            self.render_sprite_count += 1;
        }
        let proj_count = self.render_sprite_count - proj_start;
        if proj_count > 0 && self.batch_slice_count < MAX_BATCH_SLICES {
            self.batch_slices.extend_from_slice(&[proj_start as f32, proj_count as f32, 1.0, 1.0]);
            self.batch_slice_count += 1;
        }
    }
}

struct EcsRegistry {
    next_id: u32,
    worlds: BTreeMap<u32, EcsWorld>,
}

thread_local! {
    static ECS_REGISTRY: RefCell<EcsRegistry> = RefCell::new(EcsRegistry {
        next_id: 1,
        worlds: BTreeMap::new(),
    });
}

#[no_mangle]
pub extern "C" fn ecs_abi_version() -> u32 {
    ECS_ABI_VERSION
}

#[no_mangle]
pub extern "C" fn ecs_create() -> u32 {
    ECS_REGISTRY.with_borrow_mut(|reg| {
        let id = reg.next_id;
        let Some(next) = id.checked_add(1) else { return 0; };
        reg.next_id = next;
        reg.worlds.insert(id, EcsWorld::new());
        id
    })
}

#[no_mangle]
pub extern "C" fn ecs_destroy(world_id: u32) -> u32 {
    ECS_REGISTRY.with_borrow_mut(|reg| u32::from(reg.worlds.remove(&world_id).is_some()))
}

#[no_mangle]
pub extern "C" fn ecs_step(world_id: u32, dt: f32) -> u32 {
    ECS_REGISTRY.with_borrow_mut(|reg| {
        let Some(world) = reg.worlds.get_mut(&world_id) else { return 0; };
        world.step(dt);
        world.render_sprite_count as u32
    })
}

#[no_mangle]
pub extern "C" fn ecs_spawn_ship(
    world_id: u32,
    id: u32,
    team: u32,
    x: f32,
    y: f32,
    rot: f32,
    radius: f32,
    mass: f32,
    sprite_w: f32,
    sprite_h: f32,
    max_speed: f32,
    accel: f32,
    turn_rate: f32,
    hp: f32,
    base_armor: f32,
    max_flux: f32,
    flux_dissipation: f32,
    shield_arc_deg: f32,
    shield_radius: f32,
    shield_efficiency: f32,
    weapon_damage: f32,
    proj_speed: f32,
    tex_slot: f32,
) -> u32 {
    ECS_REGISTRY.with_borrow_mut(|reg| {
        let Some(world) = reg.worlds.get_mut(&world_id) else { return u32::MAX; };
        world.spawn_ship(
            id, team, x, y, rot, radius, mass, sprite_w, sprite_h, max_speed, accel, turn_rate,
            hp, base_armor, max_flux, flux_dissipation, shield_arc_deg, shield_radius,
            shield_efficiency, weapon_damage, proj_speed, tex_slot,
        )
    })
}

#[no_mangle]
pub extern "C" fn ecs_spawn_projectile(
    world_id: u32,
    x: f32,
    y: f32,
    vx: f32,
    vy: f32,
    radius: f32,
    damage: f32,
    ttl: f32,
    team: u32,
    owner_id: u32,
    r: f32,
    g: f32,
    b: f32,
    tex_slot: f32,
) -> u32 {
    ECS_REGISTRY.with_borrow_mut(|reg| {
        let Some(world) = reg.worlds.get_mut(&world_id) else { return u32::MAX; };
        world.spawn_projectile(x, y, vx, vy, radius, damage, ttl, team, owner_id, r, g, b, tex_slot)
    })
}

#[no_mangle]
pub extern "C" fn ecs_spawn_fighter(
    world_id: u32,
    x: f32,
    y: f32,
    vx: f32,
    vy: f32,
    team: u32,
    role: u32,
) -> u32 {
    ECS_REGISTRY.with_borrow_mut(|reg| {
        let Some(world) = reg.worlds.get_mut(&world_id) else { return u32::MAX; };
        world.spawn_fighter(x, y, vx, vy, team, role as u8)
    })
}

#[no_mangle]
pub extern "C" fn ecs_push_command(world_id: u32, opcode: u32, target_id: u32, a: f32, b: f32, c: f32) -> u32 {
    ECS_REGISTRY.with_borrow_mut(|reg| {
        let Some(world) = reg.worlds.get_mut(&world_id) else { return 0; };
        world.push_command(opcode, target_id, a, b, c)
    })
}

#[no_mangle]
pub extern "C" fn ecs_render_buffer_ptr(world_id: u32) -> u32 {
    ECS_REGISTRY.with_borrow(|reg| {
        reg.worlds
            .get(&world_id)
            .map_or(0, |w| w.render_sprites.as_ptr() as usize as u32)
    })
}

#[no_mangle]
pub extern "C" fn ecs_render_sprite_count(world_id: u32) -> u32 {
    ECS_REGISTRY.with_borrow(|reg| {
        reg.worlds
            .get(&world_id)
            .map_or(0, |w| w.render_sprite_count as u32)
    })
}

#[no_mangle]
pub extern "C" fn ecs_batch_slices_ptr(world_id: u32) -> u32 {
    ECS_REGISTRY.with_borrow(|reg| {
        reg.worlds
            .get(&world_id)
            .map_or(0, |w| w.batch_slices.as_ptr() as usize as u32)
    })
}

#[no_mangle]
pub extern "C" fn ecs_batch_slice_count(world_id: u32) -> u32 {
    ECS_REGISTRY.with_borrow(|reg| {
        reg.worlds
            .get(&world_id)
            .map_or(0, |w| w.batch_slice_count as u32)
    })
}

#[no_mangle]
pub extern "C" fn ecs_ribbon_buffer_ptr(world_id: u32) -> u32 {
    ECS_REGISTRY.with_borrow(|reg| {
        reg.worlds
            .get(&world_id)
            .map_or(0, |w| w.ribbon_buffer.as_ptr() as usize as u32)
    })
}

#[no_mangle]
pub extern "C" fn ecs_ribbon_count(world_id: u32) -> u32 {
    ECS_REGISTRY.with_borrow(|reg| {
        reg.worlds
            .get(&world_id)
            .map_or(0, |w| w.ribbon_count as u32)
    })
}

#[no_mangle]
pub extern "C" fn ecs_events_ptr(world_id: u32) -> u32 {
    ECS_REGISTRY.with_borrow(|reg| {
        reg.worlds
            .get(&world_id)
            .map_or(0, |w| w.event_outbox.as_ptr() as usize as u32)
    })
}

#[no_mangle]
pub extern "C" fn ecs_event_count(world_id: u32) -> u32 {
    ECS_REGISTRY.with_borrow(|reg| {
        reg.worlds
            .get(&world_id)
            .map_or(0, |w| w.event_count as u32)
    })
}

#[no_mangle]
pub extern "C" fn ecs_particle_bursts_ptr(world_id: u32) -> u32 {
    ECS_REGISTRY.with_borrow(|reg| {
        reg.worlds
            .get(&world_id)
            .map_or(0, |w| w.particle_bursts.as_ptr() as usize as u32)
    })
}

#[no_mangle]
pub extern "C" fn ecs_particle_burst_count(world_id: u32) -> u32 {
    ECS_REGISTRY.with_borrow(|reg| {
        reg.worlds
            .get(&world_id)
            .map_or(0, |w| w.particle_burst_count as u32)
    })
}

#[no_mangle]
pub extern "C" fn ecs_hud_ptr(world_id: u32) -> u32 {
    ECS_REGISTRY.with_borrow(|reg| {
        reg.worlds
            .get(&world_id)
            .map_or(0, |w| w.hud_buffer.as_ptr() as usize as u32)
    })
}

#[no_mangle]
pub extern "C" fn ecs_hud_ship_count(world_id: u32) -> u32 {
    ECS_REGISTRY.with_borrow(|reg| {
        reg.worlds
            .get(&world_id)
            .map_or(0, |w| w.hud_ship_count as u32)
    })
}

#[no_mangle]
pub extern "C" fn ecs_active_projectile_count(world_id: u32) -> u32 {
    ECS_REGISTRY.with_borrow(|reg| {
        reg.worlds
            .get(&world_id)
            .map_or(0, |w| w.projectiles.count as u32)
    })
}

// ---------------------------------------------------------------------------
// Authority foundation: tick contract, deterministic RNG, state readback.
//
// Additive only — `ECS_ABI_VERSION` stays 200 because no existing export changed
// meaning (see the comment on `ECS_ABI_VERSION` consumers in RustEcsBridge.ts).
// ---------------------------------------------------------------------------

/// `ecs_step_checked` status codes.
pub const STEP_OK: u32 = 1;
pub const STEP_UNKNOWN_WORLD: u32 = 0;
pub const STEP_TICK_MISMATCH: u32 = 2;
pub const STEP_INVALID_DT: u32 = 3;

/// Host replay witness: exactly 22 finite f64 words with `[0] === tick`.
///
/// The layout matches `LocalCombatKernel.replayWitness()` field for field so the
/// equivalence harness can compare an ECS authority against the TypeScript one:
/// `[0] tick, [1..3] combat seed/state/ids, [4..6] visual seed/state/ids, [7] combatTime,`
/// `[8..15] player x/y/vx/vy/facing/hull/softFlux/hardFlux, [16..18] enemy x/y/hull,`
/// `[19] reinforcements, [20] projectiles, [21] beams`.
pub const WITNESS_WORDS: usize = 22;

/// Witness fields compared with geometric tolerance (positions, velocity, facing).
/// Everything else - hull, flux, RNG cursors, counts - is compared exactly.
pub const WITNESS_GEOMETRIC: [usize; 7] = [8, 9, 10, 11, 12, 16, 17];

/// Authority role of a spawned ship.
pub const SHIP_ROLE_NONE: u8 = 0;
pub const SHIP_ROLE_PLAYER: u8 = 1;
pub const SHIP_ROLE_PRIMARY_ENEMY: u8 = 2;

/// Command receipt layout: `[accepted, reason_code]` per applied command, positional.
pub const FLOATS_PER_COMMAND_RESULT: usize = 2;
pub const CMD_RESULT_OK: f32 = 0.0;
pub const CMD_RESULT_UNKNOWN_OPCODE: f32 = 1.0;
pub const CMD_RESULT_UNKNOWN_TARGET: f32 = 2.0;
/// Returned by `ecs_apply_commands` when the world does not exist.
pub const APPLY_UNKNOWN_WORLD: u32 = u32::MAX;

/// External control belongs to exactly ONE tick: `ecs_set_control` arms it and the
/// next `step` consumes then clears it, mirroring the host's per-tick control sample.
pub const CONTROL_INACTIVE: u8 = 0;
pub const CONTROL_ACTIVE: u8 = 1;
/// Lateral acceleration as a fraction of the hull's own forward acceleration, so a
/// strafe input can never out-accelerate the hull.
pub const STRAFE_ACCEL_SCALE: f32 = 0.6;
/// Corridor length used by the manual-fire friendly-fire check (same gate the AI uses).
pub const MANUAL_FIRE_RANGE: f32 = 1100.0;

/// One tick of external control for a single ship.
#[derive(Clone, Copy, Default)]
pub struct ShipControl {
    pub state: u8,
    pub aim_x: f32,
    pub aim_y: f32,
    pub thrust: f32,
    pub strafe: f32,
    pub firing: f32,
}

#[inline]
fn valid_cursor(value: f64) -> bool {
    value.is_finite() && value >= 0.0 && value.fract() == 0.0
}

impl EcsWorld {
    /// Publishes the per-ship authoritative readback in `FLOATS_PER_SHIP_STATE` strides.
    pub fn refresh_ship_state(&mut self) {
        self.ship_state.clear();
        for i in 0..self.ships.count {
            let armor = self.ships.armor_sectors[i];
            // One semantic only: normalized armor integrity, identical to the HUD
            // channel. A second, absolute definition here (sum / 8) previously made
            // the same field name mean two different things to its consumers.
            let armor_avg = armor.iter().sum::<f32>() / (8.0 * self.ships.base_armor[i].max(1.0));
            self.ship_state.extend_from_slice(&[
                self.ships.id[i] as f32,
                self.ships.team[i] as f32,
                f32::from(self.ships.active[i]),
                self.ships.x[i],
                self.ships.y[i],
                self.ships.vx[i],
                self.ships.vy[i],
                self.ships.rot[i],
                self.ships.vrot[i],
                self.ships.hp[i],
                self.ships.max_hp[i],
                self.ships.flux[i],
                self.ships.hard_flux[i],
                f32::from(self.ships.shield_active[i]),
                self.ships.overloaded_timer[i],
                armor_avg,
            ]);
        }
    }

    /// Publishes the RNG witness: combat seed/state/ids then visual seed/state/ids.
    pub fn refresh_rng_witness(&mut self) {
        let combat = self.combat_random.witness();
        let visual = self.visual_random.witness();
        self.rng_witness = [
            combat[0], combat[1], combat[2], visual[0], visual[1], visual[2],
        ];
    }

    /// Marks the authority role of a spawned ship. Returns false for a bad index or role.
    pub fn mark_role(&mut self, index: u32, role: u8) -> bool {
        let i = index as usize;
        if i >= self.ships.count || role > SHIP_ROLE_PRIMARY_ENEMY {
            return false;
        }
        self.ships.role[i] = role;
        true
    }

    /// Drains the command queue, recording one positional receipt per command.
    ///
    /// Receipts stay readable until the next non-empty batch, so a `commands`
    /// request can be answered without advancing the tick. Opcode/target rejections
    /// are recorded rather than silently dropped; accepted commands behave exactly
    /// as before, so legacy callers that ignore receipts are unaffected.
    pub fn apply_commands(&mut self) {
        if self.command_queue.is_empty() {
            return;
        }
        self.command_results.clear();
        for cmd_idx in 0..self.command_queue.len() {
            let cmd = self.command_queue[cmd_idx];
            let reason = match cmd.opcode {
                CMD_APPLY_FORCE => {
                    let i = cmd.target_id as usize;
                    if i < self.ships.count && self.ships.active[i] != 0 {
                        let inv_m = 1.0 / self.ships.mass[i].max(1.0);
                        self.ships.vx[i] += cmd.a * inv_m;
                        self.ships.vy[i] += cmd.b * inv_m;
                        self.ships.vrot[i] += cmd.c;
                        CMD_RESULT_OK
                    } else {
                        CMD_RESULT_UNKNOWN_TARGET
                    }
                }
                CMD_SET_TIME_SCALE => {
                    let i = cmd.target_id as usize;
                    if i < self.ships.count {
                        self.ships.time_scale[i] = cmd.a.clamp(0.05, 5.0);
                        CMD_RESULT_OK
                    } else {
                        CMD_RESULT_UNKNOWN_TARGET
                    }
                }
                CMD_SET_COLLISION_MASK => {
                    let i = cmd.target_id as usize;
                    if i < self.ships.count {
                        self.ships.collision_mask[i] = cmd.a as u32;
                        CMD_RESULT_OK
                    } else {
                        CMD_RESULT_UNKNOWN_TARGET
                    }
                }
                CMD_RADIAL_FORCE => {
                    let cx = cmd.a;
                    let cy = cmd.b;
                    let impulse = cmd.c;
                    for i in 0..self.ships.count {
                        if self.ships.active[i] == 0 {
                            continue;
                        }
                        let dx = self.ships.x[i] - cx;
                        let dy = self.ships.y[i] - cy;
                        let d2 = dx * dx + dy * dy + 64.0;
                        if d2 < 650.0 * 650.0 {
                            let inv_d = 1.0 / d2.sqrt();
                            let scale = (impulse * inv_d) / self.ships.mass[i].max(10.0);
                            self.ships.vx[i] += dx * inv_d * scale;
                            self.ships.vy[i] += dy * inv_d * scale;
                        }
                    }
                    CMD_RESULT_OK
                }
                CMD_SET_AI_AGGRESSION => {
                    let i = cmd.target_id as usize;
                    if i < self.ships.count {
                        self.ships.ai_aggression[i] = cmd.a.clamp(0.0, 1.5);
                        CMD_RESULT_OK
                    } else {
                        CMD_RESULT_UNKNOWN_TARGET
                    }
                }
                _ => CMD_RESULT_UNKNOWN_OPCODE,
            };
            self.command_results.push(if reason == CMD_RESULT_OK { 1.0 } else { 0.0 });
            self.command_results.push(reason);
        }
        self.command_queue.clear();
    }

    /// Arms one tick of external control for a spawned, active ship.
    ///
    /// Returns false for a bad index, an inactive ship, or a non-finite input. The
    /// control is consumed and cleared by the next `step`; a tick with no control
    /// falls back to the ship's own AI.
    pub fn set_control(&mut self, index: u32, aim_x: f32, aim_y: f32, thrust: f32, strafe: f32, firing: f32) -> bool {
        let i = index as usize;
        if i >= self.ships.count || self.ships.active[i] == 0 {
            return false;
        }
        if !(aim_x.is_finite() && aim_y.is_finite() && thrust.is_finite() && strafe.is_finite() && firing.is_finite()) {
            return false;
        }
        let control = &mut self.ship_controls[i];
        control.state = CONTROL_ACTIVE;
        control.aim_x = aim_x;
        control.aim_y = aim_y;
        control.thrust = thrust;
        control.strafe = strafe;
        control.firing = firing;
        true
    }

    /// External-control branch of the ship loop.
    ///
    /// Deliberately reuses the same limits as the AI branch - hull turn rate, hull
    /// acceleration, the shared speed clamp, the 0.25s fire cooldown and the
    /// friendly-fire corridor - so a manual input can never exceed what the AI could
    /// do, and the two branches stay physically comparable.
    fn step_manual_control(&mut self, i: usize, ship_dt: f32) {
        let control = self.ship_controls[i];
        let mut cos = self.ships.rot[i].cos();
        let mut sin = self.ships.rot[i].sin();
        // Turn toward the aim point at the hull's own turn rate. An aim of exactly
        // (0, 0) means "hold facing", which is what a pure thrust input wants.
        if (control.aim_x != 0.0 || control.aim_y != 0.0)
            && (control.aim_x - self.ships.x[i] != 0.0 || control.aim_y - self.ships.y[i] != 0.0)
        {
            let desired = (control.aim_y - self.ships.y[i]).atan2(control.aim_x - self.ships.x[i]);
            let mut diff = desired - self.ships.rot[i];
            while diff > std::f32::consts::PI {
                diff -= std::f32::consts::TAU;
            }
            while diff < -std::f32::consts::PI {
                diff += std::f32::consts::TAU;
            }
            let max_turn = self.ships.turn_rate[i] * ship_dt;
            self.ships.rot[i] += diff.clamp(-max_turn, max_turn);
            cos = self.ships.rot[i].cos();
            sin = self.ships.rot[i].sin();
        }

        let accel = self.ships.accel[i] * ship_dt;
        let thrust = control.thrust.clamp(-1.0, 1.0) * accel;
        let strafe = control.strafe.clamp(-1.0, 1.0) * accel * STRAFE_ACCEL_SCALE;
        self.ships.vx[i] += cos * thrust - sin * strafe;
        self.ships.vy[i] += sin * thrust + cos * strafe;

        // Same clamp as the AI branch, so both paths share one speed ceiling.
        let speed_sq = self.ships.vx[i] * self.ships.vx[i] + self.ships.vy[i] * self.ships.vy[i];
        let max_spd = self.ships.max_speed[i];
        if speed_sq > max_spd * max_spd {
            let s = max_spd / speed_sq.sqrt();
            self.ships.vx[i] *= s;
            self.ships.vy[i] *= s;
        }

        // Manual fire aims along the hull instead of at a selected target, but keeps
        // the overload, cooldown and friendly-fire gates identical to the AI path.
        self.ships.fire_cooldown[i] = (self.ships.fire_cooldown[i] - ship_dt).max(0.0);
        if control.firing >= 0.5
            && self.ships.overloaded_timer[i] <= 0.0
            && self.ships.weapon_damage[i] > 0.0
            && self.ships.fire_cooldown[i] <= 0.0
            && !self.has_friendly_in_fire_corridor(i, cos, sin, MANUAL_FIRE_RANGE)
        {
            self.ships.fire_cooldown[i] = 0.25;
            let p_speed = self.ships.proj_speed[i];
            let muzzle_x = self.ships.x[i] + cos * (self.ships.radius[i] + 6.0);
            let muzzle_y = self.ships.y[i] + sin * (self.ships.radius[i] + 6.0);
            let dmg = self.ships.weapon_damage[i];
            let ship_id = self.ships.id[i];
            let my_team = self.ships.team[i];
            self.spawn_projectile(
                muzzle_x,
                muzzle_y,
                self.ships.vx[i] * 0.25 + cos * p_speed,
                self.ships.vy[i] * 0.25 + sin * p_speed,
                4.5,
                dmg,
                2.2,
                my_team,
                ship_id,
                if my_team == 0 { 0.35 } else { 1.0 },
                if my_team == 0 { 0.85 } else { 0.35 },
                if my_team == 0 { 1.0 } else { 0.25 },
                1.0,
            );
        }
    }

    /// Which authority roles are currently present: bit 0 = player, bit 1 = primary enemy.
    pub fn roles_present(&self) -> u32 {
        let mut mask = 0u32;
        for i in 0..self.ships.count {
            if self.ships.active[i] == 0 {
                continue;
            }
            if self.ships.role[i] == SHIP_ROLE_PLAYER {
                mask |= 1;
            } else if self.ships.role[i] == SHIP_ROLE_PRIMARY_ENEMY {
                mask |= 2;
            }
        }
        mask
    }

    /// Publishes the host replay witness. Unmarked roles publish zeros; callers must
    /// check `ecs_witness_roles_present` before trusting the player/enemy fields.
    pub fn refresh_witness(&mut self) {
        let combat = self.combat_random.witness();
        let visual = self.visual_random.witness();
        let mut player: Option<usize> = None;
        let mut enemy: Option<usize> = None;
        for i in 0..self.ships.count {
            if self.ships.active[i] == 0 {
                continue;
            }
            match self.ships.role[i] {
                SHIP_ROLE_PLAYER if player.is_none() => player = Some(i),
                SHIP_ROLE_PRIMARY_ENEMY if enemy.is_none() => enemy = Some(i),
                _ => {}
            }
        }
        let mut w = [0.0f64; WITNESS_WORDS];
        w[0] = self.tick as f64;
        w[1] = combat[0];
        w[2] = combat[1];
        w[3] = combat[2];
        w[4] = visual[0];
        w[5] = visual[1];
        w[6] = visual[2];
        w[7] = self.sim_time as f64;
        if let Some(i) = player {
            w[8] = self.ships.x[i] as f64;
            w[9] = self.ships.y[i] as f64;
            w[10] = self.ships.vx[i] as f64;
            w[11] = self.ships.vy[i] as f64;
            w[12] = self.ships.rot[i] as f64;
            w[13] = self.ships.hp[i] as f64;
            w[14] = self.ships.flux[i] as f64;
            w[15] = self.ships.hard_flux[i] as f64;
        }
        if let Some(i) = enemy {
            w[16] = self.ships.x[i] as f64;
            w[17] = self.ships.y[i] as f64;
            w[18] = self.ships.hp[i] as f64;
        }
        // Deliberate placeholders: the ECS kernel has no reinforcement reserve and no
        // beam implementation yet (the ribbon buffer is never written), so these two
        // fields cannot carry anything but zero until those systems exist.
        w[19] = 0.0;
        w[20] = self.projectiles.count as f64;
        w[21] = 0.0;
        self.witness = w;
    }
}

/// Creates a world with explicit deterministic seeds. Combat uses `seed`;
/// visual uses `(seed ^ 0x9e3779b9) >>> 0`, matching `CombatEngine`.
#[no_mangle]
pub extern "C" fn ecs_create_seeded(seed: u32) -> u32 {
    ECS_REGISTRY.with_borrow_mut(|reg| {
        let id = reg.next_id;
        let Some(next) = id.checked_add(1) else { return 0; };
        reg.next_id = next;
        reg.worlds.insert(id, EcsWorld::new_seeded(seed));
        id
    })
}

/// Committed tick count.
#[no_mangle]
pub extern "C" fn ecs_tick(world_id: u32) -> f64 {
    ECS_REGISTRY.with_borrow(|reg| reg.worlds.get(&world_id).map_or(-1.0, |w| w.tick as f64))
}

/// Fixed-step bounds published so callers can validate before stepping.
#[no_mangle]
pub extern "C" fn ecs_dt_min() -> f32 {
    ECS_DT_MIN
}

#[no_mangle]
pub extern "C" fn ecs_dt_max() -> f32 {
    ECS_DT_MAX
}

/// Authority step with an explicit tick contract.
///
/// Returns `STEP_OK` only when the world exists, `expected_tick` equals the
/// committed tick, and `dt` is finite and inside `[ECS_DT_MIN, ECS_DT_MAX]`.
/// Unlike legacy `ecs_step`, an out-of-range `dt` is rejected instead of being
/// silently clamped, so a mistimed authority loop cannot corrupt the timeline.
#[no_mangle]
pub extern "C" fn ecs_step_checked(world_id: u32, expected_tick: f64, dt: f32) -> u32 {
    if !valid_cursor(expected_tick) {
        return STEP_TICK_MISMATCH;
    }
    if !(dt.is_finite() && dt >= ECS_DT_MIN && dt <= ECS_DT_MAX) {
        return STEP_INVALID_DT;
    }
    ECS_REGISTRY.with_borrow_mut(|reg| {
        let Some(world) = reg.worlds.get_mut(&world_id) else {
            return STEP_UNKNOWN_WORLD;
        };
        if expected_tick != world.tick as f64 {
            return STEP_TICK_MISMATCH;
        }
        world.step(dt);
        STEP_OK
    })
}

#[no_mangle]
pub extern "C" fn ecs_rng_witness_words() -> u32 {
    ECS_RNG_WORDS as u32
}

/// Pointer to `ECS_RNG_WORDS` f64 words; refreshes the witness first.
#[no_mangle]
pub extern "C" fn ecs_rng_witness_ptr(world_id: u32) -> u32 {
    ECS_REGISTRY.with_borrow_mut(|reg| {
        let Some(world) = reg.worlds.get_mut(&world_id) else { return 0; };
        world.refresh_rng_witness();
        world.rng_witness.as_ptr() as usize as u32
    })
}

/// Diagnostic single draw from a stream (`RNG_STREAM_COMBAT` / `RNG_STREAM_VISUAL`).
/// Authority gameplay must consume randomness inside `step`, not through this export.
#[no_mangle]
pub extern "C" fn ecs_rng_sample(world_id: u32, stream: u32) -> f64 {
    ECS_REGISTRY.with_borrow_mut(|reg| {
        let Some(world) = reg.worlds.get_mut(&world_id) else { return f64::NAN; };
        match stream {
            RNG_STREAM_COMBAT => world.combat_random.next(),
            RNG_STREAM_VISUAL => world.visual_random.next(),
            _ => f64::NAN,
        }
    })
}

/// Diagnostic identity allocation from the combat stream (`SimulationRandom.nextNumericId`).
#[no_mangle]
pub extern "C" fn ecs_rng_next_id(world_id: u32) -> f64 {
    ECS_REGISTRY.with_borrow_mut(|reg| {
        let Some(world) = reg.worlds.get_mut(&world_id) else { return f64::NAN; };
        world.combat_random.next_numeric_id()
    })
}

/// Restores both stream cursors from a published witness (identities included).
/// Seeds are unchanged; only the counters move. Returns 1 on success.
#[no_mangle]
pub extern "C" fn ecs_set_rng_cursors(
    world_id: u32,
    combat_state: f64,
    combat_ids: f64,
    visual_state: f64,
    visual_ids: f64,
) -> u32 {
    if !valid_cursor(combat_state) || !valid_cursor(combat_ids)
        || !valid_cursor(visual_state) || !valid_cursor(visual_ids) {
        return 0;
    }
    ECS_REGISTRY.with_borrow_mut(|reg| {
        let Some(world) = reg.worlds.get_mut(&world_id) else { return 0; };
        world.combat_random.state = combat_state;
        world.combat_random.ids = combat_ids;
        world.visual_random.state = visual_state;
        world.visual_random.ids = visual_ids;
        1
    })
}

#[no_mangle]
pub extern "C" fn ecs_ship_state_stride() -> u32 {
    FLOATS_PER_SHIP_STATE as u32
}

/// Pointer to the per-ship readback; refreshes it first. Count via `ecs_ship_state_count`.
#[no_mangle]
pub extern "C" fn ecs_ship_state_ptr(world_id: u32) -> u32 {
    ECS_REGISTRY.with_borrow_mut(|reg| {
        let Some(world) = reg.worlds.get_mut(&world_id) else { return 0; };
        world.refresh_ship_state();
        world.ship_state.as_ptr() as usize as u32
    })
}

#[no_mangle]
pub extern "C" fn ecs_ship_state_count(world_id: u32) -> u32 {
    ECS_REGISTRY.with_borrow(|reg| reg.worlds.get(&world_id).map_or(0, |w| w.ships.count as u32))
}

/// Marks a spawned ship's authority role (`SHIP_ROLE_*`). Returns 1 on success.
#[no_mangle]
pub extern "C" fn ecs_mark_ship_role(world_id: u32, ship_index: u32, role: u32) -> u32 {
    if role > SHIP_ROLE_PRIMARY_ENEMY as u32 {
        return 0;
    }
    ECS_REGISTRY.with_borrow_mut(|reg| {
        let Some(world) = reg.worlds.get_mut(&world_id) else { return 0; };
        u32::from(world.mark_role(ship_index, role as u8))
    })
}

/// Drains queued commands without advancing the tick and records their receipts.
/// Returns the applied command count, or `APPLY_UNKNOWN_WORLD` for an unknown world.
#[no_mangle]
pub extern "C" fn ecs_apply_commands(world_id: u32) -> u32 {
    ECS_REGISTRY.with_borrow_mut(|reg| {
        let Some(world) = reg.worlds.get_mut(&world_id) else { return APPLY_UNKNOWN_WORLD; };
        world.apply_commands();
        (world.command_results.len() / FLOATS_PER_COMMAND_RESULT) as u32
    })
}

#[no_mangle]
pub extern "C" fn ecs_witness_words() -> u32 {
    WITNESS_WORDS as u32
}

/// Pointer to the host replay witness (`WITNESS_WORDS` f64 words); refreshes it first.
#[no_mangle]
pub extern "C" fn ecs_witness_ptr(world_id: u32) -> u32 {
    ECS_REGISTRY.with_borrow_mut(|reg| {
        let Some(world) = reg.worlds.get_mut(&world_id) else { return 0; };
        world.refresh_witness();
        world.witness.as_ptr() as usize as u32
    })
}

/// Bit 0 = player role present, bit 1 = primary enemy role present.
#[no_mangle]
pub extern "C" fn ecs_witness_roles_present(world_id: u32) -> u32 {
    ECS_REGISTRY.with_borrow(|reg| reg.worlds.get(&world_id).map_or(0, |w| w.roles_present()))
}

#[no_mangle]
pub extern "C" fn ecs_command_result_stride() -> u32 {
    FLOATS_PER_COMMAND_RESULT as u32
}

/// Pointer to the last batch's receipts: `[accepted, reason_code]` per command.
#[no_mangle]
pub extern "C" fn ecs_command_results_ptr(world_id: u32) -> u32 {
    ECS_REGISTRY.with_borrow(|reg| {
        reg.worlds
            .get(&world_id)
            .map_or(0, |w| w.command_results.as_ptr() as usize as u32)
    })
}

#[no_mangle]
pub extern "C" fn ecs_command_results_count(world_id: u32) -> u32 {
    ECS_REGISTRY.with_borrow(|reg| {
        reg.worlds
            .get(&world_id)
            .map_or(0, |w| (w.command_results.len() / FLOATS_PER_COMMAND_RESULT) as u32)
    })
}

/// Arms one tick of external control for a ship (`aim`, `thrust`, `strafe`, `firing`).
///
/// The control is consumed and cleared by the next step; a step without a fresh
/// control falls back to that ship's AI. Returns 1 on success, 0 on rejection
/// (unknown world, bad/inactive index, or a non-finite input).
#[no_mangle]
pub extern "C" fn ecs_set_control(
    world_id: u32,
    ship_index: u32,
    aim_x: f32,
    aim_y: f32,
    thrust: f32,
    strafe: f32,
    firing: f32,
) -> u32 {
    ECS_REGISTRY.with_borrow_mut(|reg| {
        let Some(world) = reg.worlds.get_mut(&world_id) else { return 0; };
        u32::from(world.set_control(ship_index, aim_x, aim_y, thrust, strafe, firing))
    })
}
