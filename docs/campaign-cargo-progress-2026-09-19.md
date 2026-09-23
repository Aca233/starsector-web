# Recoverable cooperative cargo — 2026-09-19

Explicitly incomplete provider, **not native cargo-pod lifecycle parity**.

> 2026-09-20 audit: the transfer UI, first-click TakeAll fuel behavior, partial pickup, drift and conditional expiry are not native-equivalent. See `campaign-cargo-ui-native-audit-2026-09-20.md` and `campaign-cargo-pod-native-audit-2026-09-20.md` before further implementation. Existing passing conservation/retry tests do not establish original-game parity.

## Integration contract

- Export `cooperativeCargoProvider` from `src/campaign/rules/CooperativeCargo.mjs`.
- Metadata: `id: cooperative.cargo`, `service: cargo`, `version: 0.1.0`, `apiVersion: 1`.
- Methods: `validateWorld(world): void`; `canCollect(world, fleet, pod): boolean` (read-only, physical eligibility only, false for locked/unsupported/invalid targets). Projection must independently require an authorized player-controlled nearby fleet before showing contents.
- `cargo.jettison`: exact payload `{ fleetId, items: Record<commodityId, positive number> }`. Requires fleet expectation; member versions may be supplied but are not read because pod geometry is cargo-derived.
- `cargo.collect`: exact payload `{ fleetId, podId }`. Requires fleet, pod (`spaceEntities`) and **all fleet member** expectations, because member hull sizes determine `originalFleetRadius`.
- Both return `{ fleetId, podId }`; events `cargo.jettisoned` / `cargo.collected` contain those same identifiers, not private items.
- Persisted entity: `{ id, version: 0, name, locationId, position: [x,y], radius, tags: ['cargo-pod'], cargoPod: { schemaVersion: 1, items, createdAtTick, sourceFleetId, createdBy } }`. `createdBy` is the player ID string. Provenance IDs are historical identifiers, not live references or recovery ownership.
- No extra pod/entity metadata accepted. Name is `货物吊舱` or `冷冻吊舱`. No presentation, orbit or movement field. Deterministic world/request/actor hash ID; collisions fail closed. Normal repository receipts provide retry idempotency.

## Source and boundaries

`../decompiled/starfarer_api_source/com/fs/starfarer/api/impl/campaign/CargoPodsEntityPlugin.java:updateBaseMaxDays`: mass = commodity cargoSpace + fuel + personnel; pieces = clamp(floor(sqrt(mass)), 5, 40); radius = 10 + 10*sqrt(pieces-4); cryo iff personnel > cargoSpace + fuel. Personnel tags use integer counts per CargoAPI. Known non-meta commodities come from market/logistics references; no credits or ship-weapon fallback.

Transfers require a player with explicit `canCommandFleet`, and no encounter/jump lock. One jettison atomically debits all stacks and creates one pod at the exact fleet position. Collection requires same location and **strictly less** than fleet radius + pod radius; atomically takes every item and deletes the emptied pod. Native-style overcapacity is permitted. Any fleet navigation interaction referencing a pod blocks collection rather than leaving dangling references.

`lifecyclePolicy: persistent-until-collected` is present on the provider and in rules-lock evidence as a **temporary WEB policy**. Saves retain pods; expiry, drift, sensors, float32 arithmetic parity and the complete native lifecycle remain unfinished. Registry, gateway, DTO/privacy and UI integration belong to the parent task.

Bounded numeric policy: maximum 64 stacks, per-stack finite quantities <= Number.MAX_SAFE_INTEGER, exact integer personnel; unsafe precision/overflow rejects the entire transfer. Ordinary floating commodity roundoff is allowed, but swallowed or materially rounded transfers are rejected. This is not arbitrary-precision inventory or native float32 emulation.

## Verification

`node --test scripts/check-campaign-cargo.mjs`: 19 tests for permissions, native geometry, exact schemas, conservation, overcapacity, range/locks, member versions, source removal, navigation references, decimals/overflow, deterministic IDs/collisions, retries, stale pod races and SQLite reopen. No browser or shared-file changes in this provider work.

