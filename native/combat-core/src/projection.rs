//! One-way projection of the authoritative core state into flat presentation
//! buffers. Read-only over the authority: no mutation, no command, no RNG draw.
//! This is the ECS contract layer's only remaining duty: every tick the
//! authority is projected into 16f sprite / 12f HUD / 16f readback / 22f64
//! witness buffers, which the host consumes without rebuilding objects.
//!
//! Semantics decided in docs/core-authority-migration-plan-2026-10-13.md:
//! authoritative (core_*) semantics win over the ECS buffer contract wherever
//! the two disagree; the ECS-side inconsistencies (armor_avg, HUD word 12,
//! shield_active) are fixed on the ECS side, not inherited here.
//! - sprite w/h and texSlot stay placeholders: sprite dimensions live only in
//!   TS content (ShipSpec.spriteWidth/Height) and the host fills them by entity
//!   id. Keeps the authority free of presentation data and avoids an ABI change.
//! - armor_avg is the core armor grid integrity (live cell mean / cell value).
//! - HUD word 12 is system_state (documented contract): 0 normal, 1 venting,
//!   2 overloaded, 3 phased.
//! - shield_active is the live core predicate, not a spawn-time constant.
//! - ships that are not available (DEAD/RETREATED/DOCKED or hp <= 0) are
//!   omitted from every buffer.

use crate::ecs_core::{FLOATS_PER_SHIP_HUD, FLOATS_PER_SHIP_STATE, FLOATS_PER_SPRITE};
use crate::state::{Core, Handle};
use std::cell::RefCell;

pub const WITNESS_WORDS: usize = 22;

thread_local! {
    static SPRITE: RefCell<Vec<f32>> = const { RefCell::new(Vec::new()) };
    static HUD: RefCell<Vec<f32>> = const { RefCell::new(Vec::new()) };
    static READBACK: RefCell<Vec<f32>> = const { RefCell::new(Vec::new()) };
    /// 4 floats per slice: [startInstance, instanceCount, textureSlot, blendMode].
    /// Ships first, then live projectiles. Slots are placeholders until the host
    /// binds its sprite atlas (D-A ②), so a slice never points past the buffer.
    static BATCH: RefCell<Vec<f32>> = const { RefCell::new(Vec::new()) };
    static WITNESS: RefCell<Vec<f64>> = const { RefCell::new(Vec::new()) };
}

fn body_of(core: &Core, handle: Handle) -> Option<&crate::state::Body> {
    let slot = core.slots.get(handle.slot as usize)?;
    if slot.generation != handle.generation { return None; }
    slot.body.as_ref()
}

/// `scene_owner::available` semantics: a ship is present while it is neither
/// dead, retreated nor docked and still has hull integrity.
fn available(ship: &crate::ship_state::ShipState) -> bool {
    if ship.flags & (crate::ship_state::DEAD | crate::ship_state::RETREATED | crate::ship_state::DOCKED) != 0 { return false; }
    ship.armor.as_ref().map(|a| a.data[14] > 0.0).unwrap_or(false)
}

pub fn project(core: &Core) {
    SPRITE.with_borrow_mut(|s| s.clear());
    HUD.with_borrow_mut(|s| s.clear());
    READBACK.with_borrow_mut(|s| s.clear());
    BATCH.with_borrow_mut(|s| s.clear());
    WITNESS.with_borrow_mut(|s| s.clear());
    let Some(scene) = core.scene.as_ref() else { return };
    let mut capitals = 0usize;
    for r in &scene.roots {
        if r.pending { continue; }
        let Some(body) = body_of(core, r.ship) else { continue };
        let Some(ship) = body.ship.as_ref() else { continue };
        if ship.flags & crate::ship_state::RETREATED == 0 && (r.ship != scene.enemy || scene.primary_enemy_deployed) { capitals += 1; }
    }
    let mut ship_sprites = 0usize;
    for handle in &core.roster {
        let Some(body) = body_of(core, *handle) else { continue };
        let Some(ship) = body.ship.as_ref() else { continue };
        if !available(ship) { continue; }
        let armor = ship.armor.as_ref();
        let flux = &ship.flux;
        let hp = armor.map(|a| a.data[14]).unwrap_or(0.0);
        let max_hp = armor.map(|a| a.data[13]).unwrap_or(1.0);
        let soft = flux.soft;
        let hard = flux.hard;
        let max_flux = flux.max;
        let shield_active = ship.shield.is_some() && ship.flags & crate::ship_state::SHIELD != 0;
        let overloaded = flux.overloaded || flux.overload_timer > 0.0;
        let system_state = if crate::ship_state::local_phased(ship) { 3.0 }
            else if overloaded { 2.0 }
            else if flux.venting { 1.0 }
            else { 0.0 };
        let team = ship.combat.as_ref().map(|c| c.team).unwrap_or(0);
        let armor_avg = armor.map(|a| {
            let n = a.cells.len();
            if n == 0 { 0.0 } else { a.cells.iter().map(|&c| c as f64).sum::<f64>() / n as f64 / a.data[7].max(1e-9) }
        }).unwrap_or(0.0);
        let x = body.motion[0]; let y = body.motion[1];
        let vx = body.motion[2]; let vy = body.motion[3];
        let rot = body.motion[4]; let vrot = body.motion[5];
        let tint = (0.55 + 0.45 * armor_avg).clamp(0.35, 1.0);
        let radius = ship.combat.as_ref().map(|c| c.radius).unwrap_or(32.0).max(8.0) * 2.0;
        SPRITE.with_borrow_mut(|s| s.extend_from_slice(&[
            x as f32, y as f32, radius as f32, radius as f32, rot as f32,
            0.5, 0.5, 0.0, 0.0, 1.0, 1.0, tint as f32, tint as f32, tint as f32, 1.0, 0.0]));
        HUD.with_borrow_mut(|s| s.extend_from_slice(&[
            body.id as f32, team as f32, x as f32, y as f32, rot as f32,
            (hp / max_hp.max(1.0)).clamp(0.0, 1.0) as f32,
            ((soft + hard) / max_flux.max(1.0)).clamp(0.0, 1.0) as f32,
            (hard / max_flux.max(1.0)).clamp(0.0, 1.0) as f32,
            u8::from(shield_active) as f32, u8::from(overloaded) as f32,
            armor_avg.clamp(0.0, 1.5) as f32, system_state as f32]));
        READBACK.with_borrow_mut(|s| s.extend_from_slice(&[
            body.id as f32, team as f32, 1.0, x as f32, y as f32, vx as f32, vy as f32, rot as f32, vrot as f32,
            hp as f32, max_hp as f32, soft as f32, hard as f32, u8::from(shield_active) as f32,
            flux.overload_timer as f32, armor_avg.clamp(0.0, 1.5) as f32]));
        ship_sprites += 1;
    }
    for p in &core.ordnance.projectiles {
        SPRITE.with_borrow_mut(|s| s.extend_from_slice(&[
            p.pos[0] as f32, p.pos[1] as f32, 6.0, 6.0, p.angle as f32,
            0.5, 0.5, 0.0, 0.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0]));
    }
    let projectile_sprites = core.ordnance.projectiles.len();
    BATCH.with_borrow_mut(|b| {
        b.extend_from_slice(&[0.0, ship_sprites as f32, 0.0, 0.0]);
        if projectile_sprites > 0 { b.extend_from_slice(&[ship_sprites as f32, projectile_sprites as f32, 1.0, 0.0]); }
    });
    let player = body_of(core, scene.player);
    let enemy = body_of(core, scene.enemy);
    let words: [f64; WITNESS_WORDS] = [
        core.tick, core.random.seed as f64, core.random.cursor, core.random.ids,
        core.visual_random.seed as f64, core.visual_random.cursor, core.visual_random.ids, core.time,
        player.map(|b| b.motion[0]).unwrap_or(0.0), player.map(|b| b.motion[1]).unwrap_or(0.0),
        player.map(|b| b.motion[2]).unwrap_or(0.0), player.map(|b| b.motion[3]).unwrap_or(0.0),
        player.map(|b| b.motion[4]).unwrap_or(0.0),
        player.and_then(|b| b.ship.as_ref()).and_then(|s| s.armor.as_ref()).map(|a| a.data[14]).unwrap_or(0.0),
        player.map(|b| b.ship.as_ref().map(|s| s.flux.soft).unwrap_or(0.0)).unwrap_or(0.0),
        player.map(|b| b.ship.as_ref().map(|s| s.flux.hard).unwrap_or(0.0)).unwrap_or(0.0),
        enemy.map(|b| b.motion[0]).unwrap_or(0.0), enemy.map(|b| b.motion[1]).unwrap_or(0.0),
        enemy.and_then(|b| b.ship.as_ref()).and_then(|s| s.armor.as_ref()).map(|a| a.data[14]).unwrap_or(0.0),
        capitals as f64 - 1.0 - u8::from(scene.primary_enemy_deployed) as f64,
        core.ordnance.projectiles.len() as f64, core.ordnance.beams.len() as f64,
    ];
    WITNESS.with_borrow_mut(|w| w.extend_from_slice(&words));
}

#[no_mangle]
pub extern "C" fn core_sprite_words() -> u32 { SPRITE.with(|s| s.borrow().len() as u32) }
#[no_mangle]
pub extern "C" fn core_sprite_ptr() -> u32 { SPRITE.with(|s| s.borrow().as_ptr() as usize as u32) }
#[no_mangle]
pub extern "C" fn core_hud_words() -> u32 { HUD.with(|s| s.borrow().len() as u32) }
#[no_mangle]
pub extern "C" fn core_hud_ptr() -> u32 { HUD.with(|s| s.borrow().as_ptr() as usize as u32) }
#[no_mangle]
pub extern "C" fn core_readback_words() -> u32 { READBACK.with(|s| s.borrow().len() as u32) }
#[no_mangle]
pub extern "C" fn core_readback_ptr() -> u32 { READBACK.with(|s| s.borrow().as_ptr() as usize as u32) }
#[no_mangle]
pub extern "C" fn core_batch_words() -> u32 { BATCH.with(|s| s.borrow().len() as u32) }
#[no_mangle]
pub extern "C" fn core_batch_ptr() -> u32 { BATCH.with(|s| s.borrow().as_ptr() as usize as u32) }
#[no_mangle]
pub extern "C" fn core_witness_words() -> u32 { WITNESS.with(|s| s.borrow().len() as u32) }
#[no_mangle]
pub extern "C" fn core_witness_ptr() -> u32 { WITNESS.with(|s| s.borrow().as_ptr() as usize as u32) }
/// Ships written to the readback buffer; the sprite buffer additionally covers
/// live projectiles, so the host derives its counts from the word exports.
pub fn readback_ships() -> usize { READBACK.with(|s| s.borrow().len() / FLOATS_PER_SHIP_STATE) }
