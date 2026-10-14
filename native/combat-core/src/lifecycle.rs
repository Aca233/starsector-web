//! Generic Web ShipSystem lifecycle only. A spec is NOT content admission for
//! any AI, targeting, modifier, isExecuting, or effect callback implementation.
pub const WIDTH: usize = 17;
pub const IDLE: u32 = 0;
pub const IN: u32 = 1;
pub const ACTIVE: u32 = 2;
pub const OUT: u32 = 3;
pub const COOLDOWN: u32 = 4;
pub const AVAILABLE: u32 = 1;
pub const TOGGLE: u32 = 2;
pub const CHARGES: u32 = 4;
pub const HARD: u32 = 8;
pub const POLICY_WIDTH: usize = 8;

#[derive(Clone)]
pub struct Spec {
    pub up: f64, pub active: f64, pub down: f64, pub cooldown: f64,
    pub max_charges: f64, pub initial_charges: f64, pub regen: f64,
    pub flux_cost: f64, pub flags: u32,
    pub max_duration: f64,
}
impl Spec {
    pub fn new(row: &[f64]) -> Self {
        Self { up: row[0], active: row[1], down: row[2], cooldown: row[3],
            max_charges: row[4], initial_charges: row[5], regen: row[6], flux_cost: row[7],
            flags: row[8] as u32,
            max_duration: if row[1].is_finite() && row[1] > 0.0 { row[1] } else { row[0] + row[2] } }
    }
}

#[derive(Clone)]
pub struct System {
    pub id: u32, pub spec: u32, pub state: u32, pub effect: f64, pub active: bool,
    pub cooling: bool, pub active_timer: f64, pub cooldown_timer: f64, pub charges: f64,
    pub serial: f64, pub pending_flux: f64, pub pending_activation: f64, pub pending_active: f64,
    pub regen_timer: f64, pub stage_timer: f64, pub out_level: f64, pub disabled: bool,
    /// gate mask, soft flat, hard flat/fraction, shield base/slope, controls, boost suppression.
    pub upkeep: [f64; POLICY_WIDTH], pub defense: bool,
}
impl System {
    pub fn new(id: u32, spec: u32, d: &Spec) -> Self {
        Self {id, spec, state: IDLE, effect: 0.0, active: false, cooling: false,
            active_timer: 0.0, cooldown_timer: 0.0,
            charges: if d.initial_charges < 0.0 { d.max_charges } else { d.max_charges.min(d.initial_charges) },
            serial: 0.0, pending_flux: 0.0, pending_activation: 0.0, pending_active: 0.0,
            regen_timer: 0.0, stage_timer: 0.0, out_level: 0.0, disabled: false,
            upkeep: [0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0], defense: false }
    }
    pub fn words(&self) -> [f64; WIDTH] {
        [self.id as f64, self.spec as f64, self.state as f64, self.effect,
            self.active as u32 as f64, self.cooling as u32 as f64, self.active_timer,
            self.cooldown_timer, self.charges, self.serial, self.pending_flux,
            self.pending_activation, self.pending_active, self.regen_timer,
            self.stage_timer, self.out_level, self.disabled as u32 as f64]
    }
    pub fn activate(&mut self, d: &Spec) {
        if self.active { self.begin_out(d); return; }
        if d.flags & CHARGES != 0 { self.charges -= 1.0; }
        self.serial += 1.0; self.pending_flux += d.flux_cost; self.pending_activation += 1.0;
        self.state = IN; self.active = true; self.effect = 0.0;
        self.stage_timer = d.up; self.active_timer = d.up;
        if self.stage_timer == 0.0 { self.begin_active(d); }
    }
    pub fn controls(&self) -> u32 {
        let bits = self.upkeep[6] as u32;
        if self.active && !(self.state == OUT && bits & 16 != 0) { bits } else { 0 }
    }
    pub fn resource_modifiers(&self, d: &Spec, capacity: f64) -> [f64; 4] {
        if d.flags & AVAILABLE == 0 || !self.active || self.upkeep[0] as u32 & (1 << self.state) == 0 {
            return [0.0, 0.0, 1.0, 0.0];
        }
        [self.upkeep[1], self.upkeep[2] + capacity * self.upkeep[3],
            self.upkeep[4] + self.upkeep[5] * self.effect, self.upkeep[7]]
    }
    pub fn interrupt(&mut self, d: &Spec) {
        self.pending_active = 0.0; self.pending_activation = 0.0;
        if self.state == IN || self.state == ACTIVE { self.begin_out(d); }
    }
    pub fn reset(&mut self, d: &Spec) {
        self.state = IDLE; self.effect = 0.0; self.active = false; self.cooling = false;
        self.serial += 1.0; self.active_timer = 0.0; self.cooldown_timer = 0.0;
        self.stage_timer = 0.0; self.regen_timer = 0.0; self.out_level = 0.0;
        // Reset intentionally doesn't clamp initialCharges or clear disabled.
        self.charges = if d.initial_charges < 0.0 { d.max_charges } else { d.initial_charges };
        self.pending_flux = 0.0; self.pending_active = 0.0; self.pending_activation = 0.0;
    }
    fn begin_active(&mut self, d: &Spec) {
        self.state = ACTIVE; self.effect = 1.0; self.active = true;
        self.stage_timer = d.active;
        self.active_timer = if d.active.is_finite() { d.active } else { d.max_duration };
        self.pending_active += 1.0;
        if d.active == 0.0 { self.begin_out(d); }
    }
    fn begin_out(&mut self, d: &Spec) {
        self.out_level = self.effect.clamp(0.0, 1.0);
        self.state = OUT; self.active = true;
        self.stage_timer = d.down * self.effect.clamp(0.0, 1.0); self.active_timer = self.stage_timer;
        if self.stage_timer <= 0.0 { self.finish_out(d); }
    }
    fn finish_out(&mut self, d: &Spec) {
        self.effect = 0.0; self.active = false; self.active_timer = 0.0;
        self.cooling = d.cooldown > 0.0;
        self.state = if self.cooling { COOLDOWN } else { IDLE };
        self.stage_timer = d.cooldown; self.cooldown_timer = d.cooldown;
    }
    pub fn update(&mut self, d: &Spec, dt: f64) {
        if !dt.is_finite() || dt <= 0.0 { return; }
        let mut remaining = dt;
        while remaining > 1e-9 && self.state != IDLE {
            if self.stage_timer == f64::INFINITY { self.effect = 1.0; break; }
            let used = remaining.min(self.stage_timer);
            self.stage_timer = (self.stage_timer - used).max(0.0); remaining -= used;
            if self.state == COOLDOWN { self.cooldown_timer = self.stage_timer; }
            else { self.active_timer = self.stage_timer; }
            if self.state == IN { self.effect = if d.up != 0.0 { 1.0 - self.stage_timer / d.up } else { 1.0 }; }
            else if self.state == OUT { self.effect = if d.down != 0.0 { self.stage_timer / d.down } else { 0.0 }; }
            if self.stage_timer > 1e-9 { break; }
            match self.state {
                IN => self.begin_active(d), ACTIVE => self.begin_out(d), OUT => self.finish_out(d),
                _ => { self.state = IDLE; self.cooling = false; self.cooldown_timer = 0.0; }
            }
        }
        if self.charges < d.max_charges && d.regen > 0.0 {
            self.regen_timer += dt;
            let interval = 1.0 / d.regen;
            while self.regen_timer >= interval && self.charges < d.max_charges {
                self.charges += 1.0; self.regen_timer -= interval;
            }
            if self.charges == d.max_charges { self.regen_timer = 0.0; }
        }
    }
}
