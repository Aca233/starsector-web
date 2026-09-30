export const en_US: Record<string, string> = {
  'app.title': 'Starsector Web Modern Architecture - Onslaught vs Paragon',
  'app.subtitle': 'Decoupled 60Hz Sim Tick / Variable Refresh Rate Render | Pure Modular Data-Driven',
  'app.switch_ship': 'Switch Piloted Ship',
  'app.switch_to_onslaught': 'Pilot Onslaught-class',
  'app.switch_to_paragon': 'Pilot Paragon-class',
  'app.reset_battle': 'Reset Battle',
  'app.mod_manager': 'Ship Mod Workshop',
  'app.controls': 'Controls: W Accelerate | S Reverse | X Brake | A/D Strafe | Mouse Aim | LMB Fire | RMB Shield Toggle | V / Space Vent Flux | F Ship System (Burn Drive / Fortress Shield)',

  'hud.hull': 'Hull Integrity',
  'hud.flux': 'Flux Level',
  'hud.flux_soft': 'Soft Flux',
  'hud.flux_hard': 'Hard Flux',
  'combat.overloaded': 'OVERLOADED!',
  'hud.overloaded': 'SYSTEM OVERLOADED! Cooling down: {time}s',
  'hud.venting': 'Venting flux... {progress}%',
  'hud.system_burn_drive': 'Burn Drive System',
  'hud.system_fortress_shield': 'Fortress Shield System',
  'hud.system_ready': 'READY',
  'hud.system_active': 'ACTIVE',
  'hud.system_cooldown': 'COOLDOWN: {time}s',
  'hud.weapon_groups': 'Weapon Groups',
  'hud.group_linked': 'LINKED',
  'hud.group_alternating': 'ALT',
  'hud.group_auto': 'AUTO',
  'hud.group_active': 'ACTIVE [LMB]',
  'hud.armor_grid': '2D Armor Grid Damage Matrix (Localized Cell Pooling)',
  'hud.fps_render': 'Render Rate: {fps} FPS',
  'hud.fps_sim': 'Sim Rate: {tps} TPS (Fixed 60Hz Deterministic)',
  'hud.interpolation_alpha': 'Sub-tick Alpha α: {alpha}',
  'hud.system_mine_strike': 'Mine Strike System',

  // Broadsword and lightmg

  // Dagger Bomber & Atropos

  // Tactical Map
  'hud.btn_tactical_map': 'Tactical Map (TAB)',
  'hud.tactical_map_title': 'TAC-OPS BATTLEFIELD RADAR OVERVIEW',
  'hud.command_points': 'Command Points',
  'hud.btn_recall_fighters': 'Recall Fighters (Z)',
  'hud.countermeasures_ready': 'Flares Ready',
  'hud.countermeasures_cooldown': 'Flares Cooldown: {time}s',
  'hud.command_engage': 'Order: ENGAGE TARGET',
  'hud.command_waypoint': 'Order: WAYPOINT',

  'combat.shield_malfunction': 'Shield failure!',

  // Combat presentation availability
  'combat.availability.loading_title': 'Preparing combat display',
  'combat.availability.loading_detail': 'Loading combat resources and initializing WebGL2.',
  'combat.availability.context_lost_title': 'Combat display temporarily unavailable',
  'combat.availability.context_lost_detail': 'The WebGL context was lost. Combat progression is paused while the browser recovers it.',
  'combat.availability.restoring_title': 'Restoring combat display',
  'combat.availability.restoring_detail': 'Rebuilding GPU resources and preparing required textures.',
  'combat.availability.failed_title': 'Unable to display combat',
  'combat.availability.failed_detail': 'Combat requires working WebGL2. Check that browser graphics acceleration is available, then refresh the page.',
  'combat.availability.webgl2_unsupported': 'This environment could not create the WebGL2 combat context.',
  'combat.availability.renderer_init_failed': 'The WebGL2 combat renderer could not be initialized.',
  'combat.availability.resource_prepare_failed': 'Required combat graphics resources could not be prepared.',
  'combat.availability.context_restore_failed': 'The combat display could not be restored.',
  'combat.availability.refresh': 'Refresh page'
};
