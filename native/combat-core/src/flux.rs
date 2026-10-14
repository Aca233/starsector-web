//! Exact existing Web FluxTracker arithmetic. Native-game differences are
//! documented in source notes; this migration does not change those rules.
pub const WIDTH: usize = 19;

#[derive(Clone)]
pub struct Flux {
    pub max: f64, pub base: f64, pub hull: u32, pub vent_mult: f64,
    pub overload_mult: f64, pub conversion: f64, pub dissipation_mult: f64,
    pub boost_delay: f64, pub soft: f64, pub hard: f64, pub since_increase: f64,
    pub overloaded: bool, pub overload_timer: f64, pub overload_duration: f64,
    pub venting: bool, pub vent_progress: f64, pub initial_vent: f64,
    pub zero_timer: f64, pub boost: bool,
}

impl Flux {
    pub fn new(row: &[f64]) -> Self {
        Self { max: row[0], base: row[1], hull: row[2] as u32, vent_mult: row[3],
            overload_mult: row[4], conversion: row[5], dissipation_mult: row[6],
            boost_delay: row[7], soft: row[8], hard: row[9], since_increase: 0.0,
            overloaded: false, overload_timer: 0.0, overload_duration: 0.0,
            venting: false, vent_progress: 0.0, initial_vent: 0.0, zero_timer: 0.0, boost: false }
    }
    pub fn total(&self) -> f64 { self.soft + self.hard }
    pub fn dissipation(&self) -> f64 { self.base * self.dissipation_mult }
    pub fn percent(&self) -> f64 {
        // Math.min propagates 0/0 for actual zero-capacity hulls. Rust's
        // f64::min would instead return 1 and change boost/system predicates.
        let ratio = self.total() / self.max;
        if ratio.is_nan() { ratio } else { ratio.min(1.0) }
    }
    pub fn words(&self) -> [f64; WIDTH] {
        [self.max, self.base, self.hull as f64, self.vent_mult, self.overload_mult,
            self.conversion, self.dissipation_mult, self.boost_delay, self.soft, self.hard,
            self.since_increase, self.overloaded as u32 as f64, self.overload_timer,
            self.overload_duration, self.venting as u32 as f64, self.vent_progress,
            self.initial_vent, self.zero_timer, self.boost as u32 as f64]
    }
    fn clamp(&mut self) {
        self.hard = self.hard.min(self.max).max(0.0);
        self.soft = self.soft.min(self.max - self.hard).max(0.0);
    }
    pub fn begin_overload(&mut self, excess: f64) -> bool {
        if self.overloaded || self.venting { return false; }
        self.overloaded = true;
        let mut duration = match self.hull { 0 | 4 => 10.0, 1 => 4.0, 2 => 6.0, 3 => 8.0, _ => 5.0 };
        if excess > 0.0 { duration += excess / 25.0; }
        duration = duration.min(15.0) * self.overload_mult;
        self.overload_duration = duration; self.overload_timer = duration;
        self.zero_timer = 0.0; self.boost = false;
        true
    }
    pub fn increase(&mut self, amount: f64, hard: bool, shield: bool) -> bool {
        if self.overloaded { return true; }
        if self.venting || !amount.is_finite() || (shield && amount <= 0.0) { return false; }
        if !shield && !hard && self.total() + amount > self.max { return false; }
        if shield {
            self.since_increase = 0.0;
            let soft = if hard { self.conversion.clamp(0.0, 1.0) } else { 1.0 };
            self.soft += amount * soft; self.hard += amount * (1.0 - soft);
        } else {
            if amount > 0.0 { self.since_increase = 0.0; }
            if hard { self.hard = (self.hard + amount).max(0.0); }
            else { self.soft = (self.soft + amount).max(0.0); }
        }
        let excess = self.total() - self.max;
        let overloaded = excess > 0.0 && self.begin_overload(if shield && !hard { 0.0 } else { excess });
        self.clamp(); overloaded
    }
    pub fn spend(&mut self, amount: f64) -> bool {
        if self.overloaded || self.venting || !amount.is_finite() || amount < 0.0
            || self.total() + amount > self.max { return false; }
        self.increase(amount, false, false); true
    }
    pub fn increase_clamped(&mut self, amount: f64, hard: bool) {
        if amount <= 0.0 { return; }
        self.since_increase = 0.0;
        if hard { self.hard = (self.hard + amount).min(self.max); self.clamp(); }
        else { self.soft = (self.soft + amount).min((self.max - self.hard).max(0.0)); }
    }
    pub fn overload_for(&mut self, seconds: f64) -> bool {
        if !seconds.is_finite() || seconds <= 0.0 || !self.begin_overload(0.0) { return false; }
        self.overload_duration = seconds * self.overload_mult;
        self.overload_timer = self.overload_duration; true
    }
    pub fn start_vent(&mut self) -> bool {
        if self.overloaded || self.total() <= 5.0 { return false; }
        self.venting = true; self.initial_vent = self.total(); self.vent_progress = 0.0;
        self.zero_timer = 0.0; self.boost = false; true
    }
    pub fn cancel_vent(&mut self) {
        self.venting = false; self.vent_progress = 0.0; self.initial_vent = 0.0;
    }
    fn dissipate(&mut self, mut amount: f64) {
        if self.soft > 0.0 {
            let sub = self.soft.min(amount); self.soft -= sub; amount -= sub;
        }
        if amount > 0.0 && self.hard > 0.0 { self.hard = (self.hard - amount).max(0.0); }
    }
    /// Returns the stop-loop notification, including vent completion.
    pub fn update(&mut self, dt: f64, shield: bool, allowed: bool) -> bool {
        if dt > 0.0 { self.since_increase = if self.overloaded || self.venting { 0.0 } else { self.since_increase + dt }; }
        if self.overloaded {
            self.overload_timer -= dt;
            let rate = if allowed { self.dissipation() * 0.5 * dt } else { 0.0 };
            self.dissipate(rate);
            if self.overload_timer <= 0.0 { self.overloaded = false; self.overload_timer = 0.0; }
            self.zero_timer = 0.0; self.boost = false; return false;
        }
        if self.venting {
            // Existing Web venting deliberately ignores allowDissipation.
            self.dissipate(self.dissipation() * 2.0 * self.vent_mult * dt);
            if self.initial_vent > 0.0 { self.vent_progress = (1.0 - self.total() / self.initial_vent).clamp(0.0, 1.0); }
            let finished = self.total() <= 0.0;
            if finished { self.soft = 0.0; self.hard = 0.0; self.cancel_vent(); }
            self.zero_timer = 0.0; self.boost = false; return finished;
        }
        let rate = if allowed { self.dissipation() * dt } else { 0.0 };
        if shield {
            if self.soft > 0.0 { self.soft = (self.soft - rate).max(0.0); }
        } else { self.dissipate(rate); }
        if self.total() <= 0.0 && !self.overloaded && !self.venting {
            self.zero_timer += dt; if self.zero_timer >= self.boost_delay { self.boost = true; }
        } else { self.zero_timer = 0.0; self.boost = false; }
        false
    }
}
