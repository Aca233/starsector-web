# Phase55 source notes — attribute pure-five stalls, not change gameplay

2026-09-22. Follow Phase54's user-requested five independent clients, five Onslaughts, zero AI, same seed 917, 20s warmup and 30s measurement. Reuse the sealed accepted artifact: this is not current-source equivalence and does not rebuild/install/release anything.

Existing diagnostics give 59.898Hz authority physics and roughly58Hz median full-state delivery, with short guest dips25–29Hz. The runtime long-task counters are lifetime-cumulative: host and guest4 have no new >50ms long task during that entire measurement; their134ms maxima belong before the window. Do not attribute the dips to those maxima. HUD/server telemetry is smoothed and may be stale, not raw aligned packet timestamps.

Extend only the existing compiled test's optional attribution mode: an in-process Node inspector CPU profile and bounded1s event-loop/CPU samples, alongside its existing authority Worker and viewer0/1 CPU profiles. The Node profile includes relay AND Playwright orchestration/console parsing; report them separately by stack. No public inspector port. Start after warmup; stop before saving other profiles or renderer-stall/reload probes. Always disconnect/disable observers on success or failure. Profiling has overhead: compare bottlenecks, not unprofiled performance percentages.

No original gameplay or UI changes, no content/render changes, no campaign, no lowered Hz, precision, queue bounds, timeouts or gates. No subagents or visible windows. Concentrated typecheck/oxlint and one existing compiled players-only scenario after implementation.
