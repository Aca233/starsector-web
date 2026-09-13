# Rust/Wasm collision pilot

This is an intentionally isolated prototype for projectile/ray-to-hull collision queries. It is not a runtime dependency.

On the current Runner, `rustc`, `cargo`, `rustup`, and `wasm-bindgen` are unavailable, so the Rust/Wasm branch cannot be built or timed locally. `npm run benchmark:collision` still benchmarks the baseline object-oriented JavaScript/TypeScript-equivalent algorithm and an optimized typed-array implementation at the required small, medium, and large workloads. The project therefore does **not** adopt Wasm at this stage; doing so without boundary-transfer and end-to-end measurements would be speculative.
