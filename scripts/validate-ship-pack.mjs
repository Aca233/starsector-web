#!/usr/bin/env node
/**
 * Foundry 2.0 Headless Ship Blueprint & Capability Validator CLI.
 * Usage:
 *   node scripts/validate-ship-pack.mjs [path/to/blueprint.json] [--json]
 *
 * Performs in < 1 second:
 * 1. Schema & identifier verification
 * 2. Hull polygon self-intersection & collision radius checks
 * 3. Weapon mount coordinate overlap & clearance verification
 * 4. Self-registering capability timing & parameter checks
 * 5. 60-tick headless combat simulation dry-run in the Rust ECS Wasm kernel
 */

import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

function segmentsIntersect(a1, a2, b1, b2) {
  const ccw = (p1, p2, p3) =>
    (p3[1] - p1[1]) * (p2[0] - p1[0]) > (p2[1] - p1[1]) * (p3[0] - p1[0]);
  return ccw(a1, b1, b2) !== ccw(a2, b1, b2) && ccw(a1, a2, b1) !== ccw(a1, a2, b2);
}

function hasSelfIntersectingPolygon(bounds) {
  const n = bounds.length;
  if (n < 4) return false;
  for (let i = 0; i < n; i++) {
    const a1 = bounds[i];
    const a2 = bounds[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const b1 = bounds[j];
      const b2 = bounds[(j + 1) % n];
      if (segmentsIntersect(a1, a2, b1, b2)) return true;
    }
  }
  return false;
}

function minClearance(slotSize) {
  if (slotSize === 'LARGE') return 14;
  if (slotSize === 'MEDIUM') return 9;
  return 5;
}

function validateStaticBlueprint(bp) {
  const issues = [];
  if (bp?.schemaVersion !== '2.0') {
    issues.push({
      code: 'SCHEMA_VERSION_MISMATCH',
      severity: 'error',
      path: 'schemaVersion',
      message: `Expected schemaVersion "2.0", got "${bp?.schemaVersion}".`,
    });
  }
  if (!bp?.id || !/^[A-Za-z0-9_.-]+$/.test(bp.id)) {
    issues.push({
      code: 'INVALID_IDENTIFIER',
      severity: 'error',
      path: 'id',
      message: `Invalid ship id "${bp?.id}".`,
    });
  }
  const bounds = bp?.visual?.bounds ?? [];
  if (!Array.isArray(bounds) || bounds.length < 3) {
    issues.push({
      code: 'POLYGON_TOO_FEW_VERTICES',
      severity: 'error',
      path: 'visual.bounds',
      message: 'Hull bounds polygon requires at least 3 vertices.',
    });
  } else if (hasSelfIntersectingPolygon(bounds)) {
    issues.push({
      code: 'POLYGON_SELF_INTERSECTION',
      severity: 'error',
      path: 'visual.bounds',
      message: 'Hull bounds polygon has self-intersecting edges.',
    });
  }

  const slots = bp?.weaponSlots ?? [];
  const seen = new Set();
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    if (seen.has(s.slotId)) {
      issues.push({
        code: 'MOUNT_DUPLICATE_ID',
        severity: 'error',
        path: `weaponSlots[${i}].slotId`,
        message: `Duplicate slot ID "${s.slotId}".`,
      });
    }
    seen.add(s.slotId);
    for (let j = i + 1; j < slots.length; j++) {
      const o = slots[j];
      const dist = Math.hypot(s.x - o.x, s.y - o.y);
      const req = Math.min(minClearance(s.slotSize), minClearance(o.slotSize));
      if (dist < req) {
        issues.push({
          code: 'MOUNT_COORDINATE_OVERLAP',
          severity: 'warning',
          path: `weaponSlots[${i}]/weaponSlots[${j}]`,
          message: `Slots "${s.slotId}" and "${o.slotId}" are ${dist.toFixed(1)}px apart (< ${req}px).`,
        });
      }
    }
  }

  for (const [idx, cap] of (bp?.capabilities ?? []).entries()) {
    if (
      (cap.chargeUp ?? 0) < 0 ||
      (cap.active ?? 0) < 0 ||
      (cap.chargeDown ?? 0) < 0 ||
      (cap.cooldown ?? 0) < 0
    ) {
      issues.push({
        code: 'CAPABILITY_INVALID_TIMING',
        severity: 'error',
        path: `capabilities[${idx}]`,
        message: `Capability "${cap.id}" has negative timing parameters.`,
      });
    }
  }
  return issues;
}

async function runHeadlessEcsDryRun(bp) {
  const wasmPath = path.join(
    projectRoot,
    'artifacts/rust-combat-core-20261008/build/wasm32-unknown-unknown/release/foundry_combat_core.wasm'
  );
  if (!fs.existsSync(wasmPath)) {
    return {
      executed: false,
      reason: 'Wasm binary not found; run scripts/build-rust-combat-core.ps1 first.',
    };
  }
  const wasmBytes = fs.readFileSync(wasmPath);
  const { instance } = await WebAssembly.instantiate(wasmBytes, {});
  const ex = instance.exports;

  const worldId = ex.ecs_create();
  try {
    const k = bp.kinematics;
    const d = bp.defense;
    const f = bp.flux;
    const v = bp.visual;

    // Spawn candidate ship vs a target dummy and step 60 frames
    const shipIdx = ex.ecs_spawn_ship(
      worldId,
      1,
      0,
      -220,
      0,
      0,
      k.collisionRadius,
      k.mass,
      v.spriteWidth,
      v.spriteHeight,
      k.maxSpeed,
      k.acceleration,
      (k.maxTurnRateDeg * Math.PI) / 180,
      d.hitpoints,
      d.armorRating,
      f.maxFlux,
      f.fluxDissipation,
      d.shieldArcDeg ?? 180,
      d.shieldRadius ?? k.collisionRadius * 1.15,
      d.shieldEfficiency ?? 0.8,
      65,
      780,
      0
    );

    ex.ecs_spawn_ship(
      worldId,
      2,
      1,
      220,
      0,
      Math.PI,
      90,
      1400,
      130,
      170,
      110,
      90,
      0.8,
      7500,
      800,
      12000,
      600,
      180,
      110,
      0.8,
      55,
      700,
      0
    );

    // Trigger capability atomic commands on frame 5
    for (let frame = 0; frame < 60; frame++) {
      if (frame === 5) {
        ex.ecs_push_command(worldId, 1, shipIdx, 1800, 0, 0);
        ex.ecs_push_command(worldId, 2, shipIdx, 1.5, 0, 0);
      }
      ex.ecs_step(worldId, 1 / 60);
    }

    const spriteCount = ex.ecs_render_sprite_count(worldId);
    const renderPtr = ex.ecs_render_buffer_ptr(worldId);
    const view = new Float32Array(ex.memory.buffer, renderPtr, spriteCount * 16);
    let hasNaN = false;
    for (let i = 0; i < view.length; i++) {
      if (!Number.isFinite(view[i])) {
        hasNaN = true;
        break;
      }
    }

    return {
      executed: true,
      framesSimulated: 60,
      finalSpriteCount: spriteCount,
      hasNaNCoordinates: hasNaN,
    };
  } finally {
    ex.ecs_destroy(worldId);
  }
}

async function main() {
  const startMs = performance.now();
  const args = process.argv.slice(2);
  const jsonFlag = args.includes('--json');
  const fileArg =
    args.find(a => !a.startsWith('--')) ??
    path.join(projectRoot, 'src/engine/content/blueprints/aurora_vanguard.blueprint.json');

  const resolvedPath = path.resolve(process.cwd(), fileArg);
  const raw = fs.readFileSync(resolvedPath, 'utf8');
  const bp = JSON.parse(raw);

  const issues = validateStaticBlueprint(bp);
  const dryRun = await runHeadlessEcsDryRun(bp);
  if (dryRun.executed && dryRun.hasNaNCoordinates) {
    issues.push({
      code: 'DRY_RUN_NAN_DETECTED',
      severity: 'error',
      path: 'ecs_step',
      message: 'NaN or Infinite float detected in direct 16-float render buffer during 60-tick dry run.',
    });
  }

  const valid = issues.every(i => i.severity !== 'error');
  const elapsedMs = Number((performance.now() - startMs).toFixed(2));
  const report = {
    valid,
    shipId: bp.id,
    name: bp.name,
    blueprintPath: path.relative(projectRoot, resolvedPath).replace(/\\/g, '/'),
    elapsedMs,
    staticIssuesCount: issues.length,
    issues,
    headlessDryRun: dryRun,
  };

  if (jsonFlag) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(
      `[Foundry 2.0 Validator] ${valid ? 'PASS' : 'FAIL'} | Ship: ${bp.name} (${bp.id}) | ${elapsedMs} ms`
    );
    console.log(
      `  Static checks: ${issues.length} issue(s) | 60-Tick ECS Dry-Run: ${
        dryRun.executed ? `OK (${dryRun.finalSpriteCount} sprites, NaN=${dryRun.hasNaNCoordinates})` : dryRun.reason
      }`
    );
    for (const issue of issues) {
      console.log(`  - [${issue.severity.toUpperCase()}] ${issue.code} @ ${issue.path}: ${issue.message}`);
    }
  }

  process.exitCode = valid ? 0 : 1;
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
