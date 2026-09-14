# M8 Worker Decision

M8 closes the Worker decision that follows the validated bounded Wasm collision runtime. No test files are added or modified by this milestone.

## Decision

Keep authoritative combat simulation on the browser main thread for now. Do not move only the projectile collision kernel into a Web Worker.

The current fixed-step contract is synchronous: a projectile advances, collision is resolved, and shield/armor/hull damage plus destruction/effects are applied in the same 60 Hz tick. Batched ordinary-ballistic collisions also preserve the existing descending projectile order. A collision-only Worker would therefore require one of two behaviors:

1. synchronously block the main thread until the Worker replies, which defeats the purpose of the Worker and violates the project requirement not to synchronously wait for it; or
2. accept a delayed result, which changes authoritative hit ordering and requires rollback/prediction or a wider simulation-pipeline redesign.

Neither is justified by the current evidence. The Wasm path is already deliberately bounded and falls back to exact TypeScript for unsupported/special cases. The existing 100-ship / 10,000-projectile benchmark is a stress case rather than a promised live battle scale, and real-browser telemetry is the authority for deciding whether main-thread simulation is a practical bottleneck.

## M8 implementation

M8 adds production collision telemetry without changing combat authority or hit semantics:

- collision-kernel wall time accumulated per rendered frame;
- TypeScript and Wasm batch counts;
- Wasm runtime-fallback count;
- projectile and candidate-pair counts;
- maximum candidate count for one projectile;
- current Wasm backend state (`idle`, `loading`, `ready`, or `failed`).

The Visual Lab shows current collision time/backend plus the performance-window P95 and batch totals. The same aggregate is available from `window.__combatPerformanceReport().collision` for scripted browser captures.

Collision time remains a sub-measurement of simulation time and is **not** added to `frameCpuMs`; doing so would double-count work already included in the simulation timing.

## Revisit criteria

Reconsider a full simulation Worker only when browser measurements show a sustained main-thread simulation bottleneck and collision or another movable simulation stage is a material contributor. The Worker design must then be treated as a simulation-ownership change rather than a geometry helper: main thread sends sequenced commands, Worker publishes timestamped snapshots, renderer interpolates snapshots, and pause/drop/latency behavior is explicit.

Shared memory, `SharedArrayBuffer`, atomics and multithreaded Wasm remain outside M8. They add synchronization and deployment-isolation requirements and need their own measured justification.
