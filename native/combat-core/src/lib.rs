//! Development foundation of the resident combat core. It is not a complete
//! battle backend: AI, fire, damage, ability effects and admission are pending.
mod flux;
mod armor;
mod component;
mod weapon;
mod weapon_fire;
mod contact;
mod projectile;
mod battle;
mod fire_control;
mod canonical_math;
mod fire_query;
mod readiness;
mod readiness_owner;
mod missile_guidance;
mod missile_owner;
mod weapon_effects;
mod weapon_effects_owner;
mod effect_owner;
mod ship_effects;
mod system_world;
mod system_owner;
mod gravity_world;
mod gravity_owner;
mod gravity_runtime;
mod gravity_wire;
mod gravity_terrain;
mod world_damage;
mod explosion_effects;
mod terrain_world;
mod terrain_owner;
mod world_owner;
mod world_wire;
mod weapon_world;
mod aux_world;
mod aux_runtime;
mod aux_wire;
mod startup_wire;
mod phase_anchor;
mod phase_runtime;
mod phase_wire;
mod tactical_ai;
mod navigation_ai;
mod defense_ai;
mod ai_owner;
mod ai_resident;
mod ai_wire;
mod scene_owner;
mod scene_wire;
mod scene_control;
mod scene_prelude;
mod scene_runtime;
mod scene_read;
mod scene_publication;
mod scene_startup;
mod scene_commands;
mod scene_system_read;
mod scene_system_publication;
mod ordnance_publication;
mod scene_dynamic_wire;
mod scene_dynamic;
mod scene_seat;
mod drone_runtime;
mod flight_world;
mod flight_owner;
mod flight_runtime;
mod flight_wire;
mod flight_static_wire;
mod flight_allocator;
mod flight_admission;
mod combat_visuals;
mod visual_wire;
mod damage_wire;
mod delivery_wire;
mod engine;
mod lifecycle;
mod motion;
mod motion_owner;
mod random;
mod shield;
mod ship_state;
mod state;
mod projection;
pub mod ecs_core;

pub use ecs_core::*;
use state::Core;
use std::{cell::RefCell, collections::BTreeMap};

struct Registry { next: u32, cores: BTreeMap<u32, Core> }
thread_local! {
    // Opaque IDs are validated on every exported call. No JS value is cast to
    // an unchecked Core pointer, and destroyed instance IDs are never recycled.
    static REGISTRY: RefCell<Registry> = RefCell::new(Registry {next: 1, cores: BTreeMap::new()});
}

#[no_mangle]
pub extern "C" fn core_abi() -> u32 { state::ABI }
#[no_mangle]
pub extern "C" fn core_command_width() -> u32 { state::COMMAND_WIDTH as u32 }
#[no_mangle]
pub extern "C" fn core_body_width() -> u32 { state::BODY_WIDTH as u32 }
#[no_mangle]
pub extern "C" fn core_output_header() -> u32 { state::OUTPUT_HEADER as u32 }
#[no_mangle]
pub extern "C" fn core_system_width() -> u32 { state::SYSTEM_WIDTH as u32 }
#[no_mangle]
pub extern "C" fn core_event_width() -> u32 { state::EVENT_WIDTH as u32 }
#[no_mangle]
pub extern "C" fn core_shield_width() -> u32 { state::SHIELD_WIDTH as u32 }
#[no_mangle]
pub extern "C" fn core_armor_width() -> u32 { state::ARMOR_WIDTH as u32 }
#[no_mangle]
pub extern "C" fn core_scar_width() -> u32 { state::SCAR_WIDTH as u32 }
#[no_mangle]
pub extern "C" fn core_component_width() -> u32 { state::COMPONENT_WIDTH as u32 }
#[no_mangle]
pub extern "C" fn core_engine_controller_width() -> u32 { state::ENGINE_CONTROLLER_WIDTH as u32 }
#[no_mangle]
pub extern "C" fn core_engine_width() -> u32 { state::ENGINE_WIDTH as u32 }
#[no_mangle]
pub extern "C" fn core_weapon_controller_width() -> u32 { state::WEAPON_CONTROLLER_WIDTH as u32 }
#[no_mangle]
pub extern "C" fn core_weapon_mount_width() -> u32 { state::WEAPON_MOUNT_WIDTH as u32 }
#[no_mangle]
pub extern "C" fn core_weapon_group_width() -> u32 { state::WEAPON_GROUP_WIDTH as u32 }
#[no_mangle]
pub extern "C" fn core_projectile_width() -> u32 { projectile::WIDTH as u32 }
#[no_mangle]
pub extern "C" fn core_beam_width() -> u32 { battle::BEAM_WIDTH as u32 }
#[no_mangle]
pub extern "C" fn core_fire_memory_width() -> u32 { (3+fire_query::WIDTH)as u32 }
#[no_mangle]
pub extern "C" fn core_readiness_width() -> u32 { (3+readiness_owner::WIDTH)as u32 }
#[no_mangle]
pub extern "C" fn core_guidance_width() -> u32 { missile_owner::WIDTH as u32 }
#[no_mangle]
pub extern "C" fn core_domain_mask() -> u32 { state::DOMAIN_MASK }
#[no_mangle]
pub extern "C" fn core_full_battle_ready() -> u32 { 0 }

#[no_mangle]
pub extern "C" fn core_create(seed: u32, visual_seed: u32) -> u32 {
    REGISTRY.with_borrow_mut(|r| {
        let id = r.next;
        let Some(next) = id.checked_add(1) else { return 0; };
        r.next = next;
        r.cores.insert(id, Core::new(seed, visual_seed));
        id
    })
}

#[no_mangle]
pub extern "C" fn core_destroy(id: u32) -> u32 {
    REGISTRY.with_borrow_mut(|r| u32::from(r.cores.remove(&id).is_some()))
}

#[no_mangle]
pub extern "C" fn core_input(id: u32, words: u32) -> u32 {
    REGISTRY.with_borrow_mut(|r| {
        let Some(core) = r.cores.get_mut(&id) else { return 0; };
        if (words as usize).checked_mul(8).is_none_or(|bytes| bytes > isize::MAX as usize) { return 0; }
        core.input.resize(words as usize, 0.0);
        core.input.as_mut_ptr() as usize as u32
    })
}

#[no_mangle]
pub extern "C" fn core_apply(id: u32, words: u32) -> u32 {
    REGISTRY.with_borrow_mut(|r| r.cores.get_mut(&id)
        .map_or(1, |core| core.apply(words as usize).map_or_else(|error| error, |_| 0)))
}

#[no_mangle]
pub extern "C" fn core_step(id: u32, expected_tick: f64, dt: f64) -> u32 {
    REGISTRY.with_borrow_mut(|r| r.cores.get_mut(&id)
        .map_or(1, |core| core.step(expected_tick, dt).map_or_else(|error| error, |_| 0)))
}

#[no_mangle]
pub extern "C" fn core_ack_events(id: u32, sequence: f64) -> u32 {
    REGISTRY.with_borrow_mut(|r| r.cores.get_mut(&id)
        .map_or(1, |core| core.acknowledge(sequence).map_or_else(|error| error, |_| 0)))
}
#[no_mangle]
pub extern "C" fn core_ack_audio(id:u32,sequence:f64)->u32{
    REGISTRY.with_borrow_mut(|r|r.cores.get_mut(&id).map_or(1,|core|core.acknowledge_audio(sequence).map_or_else(|error|error,|_|0)))
}

#[no_mangle]
pub extern "C" fn core_publish(id: u32) -> u32 {
    REGISTRY.with_borrow_mut(|r| r.cores.get_mut(&id)
        .map_or(0, |core| core.publish().as_ptr() as usize as u32))
}

#[no_mangle]
pub extern "C" fn core_output_words(id: u32) -> u32 {
    REGISTRY.with_borrow(|r| r.cores.get(&id).map_or(0, |core| core.output.len() as u32))
}

#[no_mangle]
pub extern "C" fn core_scene_publish(id:u32)->u32{REGISTRY.with_borrow_mut(|r|r.cores.get_mut(&id).and_then(|c|c.publish_scene().ok()).map_or(0,|o|o.as_ptr()as usize as u32))}
#[no_mangle]
pub extern "C" fn core_scene_words(id:u32)->u32{REGISTRY.with_borrow(|r|r.cores.get(&id).map_or(0,|c|c.scene_output.len()as u32))}

#[no_mangle]
pub extern "C" fn core_summary_publish(id:u32)->u32{REGISTRY.with_borrow_mut(|r|r.cores.get_mut(&id).and_then(|c|c.publish_summary().ok()).map_or(0,|o|o.as_ptr()as usize as u32))}
#[no_mangle]
pub extern "C" fn core_summary_words(id:u32)->u32{REGISTRY.with_borrow(|r|r.cores.get(&id).map_or(0,|c|c.summary_output.len()as u32))}
#[no_mangle]
pub extern "C" fn core_audio_publish(id:u32)->u32{REGISTRY.with_borrow_mut(|r|r.cores.get_mut(&id).and_then(|c|c.publish_audio().ok()).map_or(0,|o|o.as_ptr()as usize as u32))}
#[no_mangle]
pub extern "C" fn core_audio_words(id:u32)->u32{REGISTRY.with_borrow(|r|r.cores.get(&id).map_or(0,|c|c.audio_output.len()as u32))}

#[no_mangle]
pub extern "C" fn core_random(id: u32, visual: u32) -> f64 {
    REGISTRY.with_borrow_mut(|r| r.cores.get_mut(&id).map_or(f64::NAN, |core|
        if visual == 0 { core.random.next() } else { core.visual_random.next() }))
}

#[no_mangle]
pub extern "C" fn core_project(id: u32) -> u32 {
    REGISTRY.with_borrow_mut(|r| r.cores.get_mut(&id).map_or(0, |core| {
        crate::projection::project(core);
        crate::projection::readback_ships() as u32
    }))
}

#[no_mangle]
pub extern "C" fn core_next_numeric_id(id: u32, visual: u32) -> f64 {
    REGISTRY.with_borrow_mut(|r| r.cores.get_mut(&id).map_or(f64::NAN, |core|
        if visual == 0 { core.random.next_id() } else { core.visual_random.next_id() }))
}
