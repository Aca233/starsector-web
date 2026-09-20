# Dedicated combat authority — 2026-09-20

## Scope before implementation
This is an explicitly requested multiplayer infrastructure extension, not a native gameplay/UI restoration. Native installation evidence: ../starsector-core/data/config/settings.json declares the original renderer fps setting (60); this is NOT evidence of a native multiplayer server or a physics tick rate. Existing Web authority source src/network/host.worker.ts already executes fixedUpdate(1/60), input freshness, AI takeover, deployment validation, snapshots and battle reports. Reuse that implementation unchanged; do not invent native multiplayer rules or alter damage/AI/physics. No original desktop interaction is required or authorized for this infrastructure change. Native UI equivalence is not claimed.

Expected: an opt-in server mode, isolated worker per match, no human client owns authority, all clients use the existing replica path. Closing/reloading the room creator's browser must not kill a running server match; frozen match controller seats stay stable. Existing host-compute LAN/Steam remain the default. Empty rooms release workers; server failure ends a match explicitly, without invented recovery checkpoints. Public hosting is gated on explicit origin configuration and verified access, not disabled Host/Origin checks.

Validation plan: actual Node worker using production engine; real WebSocket clients including seat 0; input/deployment permissions, creator disconnect/rejoin/leave, worker shutdown/failure/capacity; browser entry with no host worker; ARM 8/16/32 ship measurements at unchanged target and overload protections. Never infer fleet capacity from CPU count. Build a combat-only private test artifact, exclude campaign and never commit/push/release unrelated changes.

Status: implementation and testing in progress; public deployment not yet verified.
