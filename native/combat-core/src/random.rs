//! Exact current SimulationRandom semantics, including the untruncated JS cursor.

#[derive(Clone)]
pub struct Random {
    pub seed: u32,
    pub cursor: f64,
    pub ids: f64,
}

impl Random {
    pub fn new(seed: u32) -> Self {
        Self { seed, cursor: seed as f64, ids: 0.0 }
    }

    pub fn next(&mut self) -> f64 {
        // JS adds in binary64 before ToUint32. Wrapping a u32 cursor here changes
        // the replay witness and eventually also changes samples at large cursors.
        self.cursor += 0x6d2b79f5u32 as f64;
        let mut t = (self.cursor % 4_294_967_296.0) as u32;
        t = (t ^ (t >> 15)).wrapping_mul(t | 1);
        t ^= t.wrapping_add((t ^ (t >> 7)).wrapping_mul(t | 61));
        (t ^ (t >> 14)) as f64 / 4_294_967_296.0
    }

    pub fn next_id(&mut self) -> f64 {
        self.ids += 1.0;
        self.ids
    }
}
