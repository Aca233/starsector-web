//! Resident Web Shield state. Full collision/armor/Ship effects are not admitted
//! by this module. Standard segment brightness remains presentation-only.
use crate::{flux::Flux, motion};
use std::f64::consts::PI;

pub const WIDTH: usize = 64;
pub const NONE: u32 = 0;
pub const FRONT: u32 = 1;
pub const OMNI: u32 = 2;
pub const PHASE: u32 = 3;
pub const ACTIVE_FLAG: usize = 6;
pub const EFFECT: usize = 15;

#[derive(Clone)]
pub struct VoidShield { pub data: [f64; 19] }
impl VoidShield {
    pub fn new(row: &[f64]) -> Self {
        let mut d = [0.0; 19]; d[..5].copy_from_slice(&row[..5]);
        d[5] = row[0] * row[1]; d[9] = 1.0; d[16] = 1.4; Self {data: d}
    }
    pub fn absorb(&mut self, damage: f64, angle: f64) -> (f64, f64) {
        if damage <= 0.0 { return (0.0, 0.0); }
        let d = &mut self.data; d[7] = d[3];
        let before = (d[5] / d[1]).ceil();
        let absorbed = d[5].min(damage); d[5] = (d[5] - absorbed).max(0.0);
        let broken = before - (d[5] / d[1]).ceil(); d[11] += broken;
        if absorbed > 0.0 {
            d[12] = 0.65; d[13] = angle; d[14] = (0.3 + (absorbed / d[1]).sqrt()).min(1.0);
        }
        if broken > 0.0 { d[15] = 1.2; d[18] = (d[5] == 0.0) as u32 as f64; }
        if absorbed > 0.0 && d[5] == 0.0 { d[8] = d[4]; d[6] = 0.0; }
        (absorbed, (1.0 - absorbed / damage).max(0.0))
    }
    pub fn advance(&mut self, dt: f64) {
        if dt <= 0.0 { return; }
        let d = &mut self.data;
        for i in [12, 15, 16, 17] { d[i] = (d[i] - dt).max(0.0); }
        if d[10] != 0.0 { return; }
        let wait = d[7].max(d[8]); d[7] = (d[7] - dt).max(0.0); d[8] = (d[8] - dt).max(0.0);
        let recovering = (dt - wait).max(0.0); if recovering == 0.0 { return; }
        let mut repair = recovering * d[2];
        if d[5] == 0.0 {
            let need = d[1] - d[6];
            if repair < need { d[6] += repair; return; }
            repair -= need; d[5] = d[1]; d[6] = 0.0;
            d[16] = (1.4 - repair / d[2]).max(0.0);
        }
        d[5] = (d[5] + repair).min(d[0] * d[1]);
    }
}

#[derive(Clone)]
pub struct Shield {
    /// Wire indices are documented in RustShieldField. Index 27 is derived on
    /// publication; index 28 alone admits the never-hit Infinity sentinel.
    pub data: [f64; 44], pub void: Option<VoidShield>,
    hit_levels:Vec<f32>,hit_radius:f64,hit_arc:f64,
}
impl Shield {
    pub fn new(row: &[f64]) -> Self {
        let mut d = [0.0; 44]; d[28] = f64::INFINITY; d[36] = 1.0;
        d[40] = 1.0; d[41] = 1.0; d[42] = 1.0;
        let mut shield = Self {data: d, void: None,hit_levels:Vec::new(),hit_radius:-1.0,hit_arc:-1.0}; shield.configure(row); shield
    }
    pub fn configure(&mut self, row: &[f64]) {
        let d = &mut self.data;
        d[..5].copy_from_slice(&row[..5]); d[12] = row[5]; d[13] = row[6];
        d[17..23].copy_from_slice(&[row[7], row[8], row[9], row[10], row[11], row[14]]);
        d[16] = row[12]; d[5] = row[13]; d[29] = row[15]; d[30] = row[16]; d[43] = row[18];
    }
    pub fn kind(&self) -> u32 { self.data[0] as u32 }
    pub fn active(&self) -> bool { self.data[ACTIVE_FLAG] == 1.0 }
    pub fn requested(&self) -> bool { self.void.as_ref().map_or(self.active() || self.data[11] == 1.0, |v| v.data[9] == 1.0) }
    pub fn locked(&self) -> bool { self.data[5] == 1.0 }
    fn level_count(&self)->usize{let arc=2.0*PI*self.data[2].max(0.0)*self.data[1]/360.0;2usize.max((arc/20.0).floor()as usize+1).max((self.data[1]/5.0).floor()as usize+1)}
    fn levels(&mut self)->&mut Vec<f32>{if self.hit_radius!=self.data[2]||self.hit_arc!=self.data[1]{self.hit_levels=vec![100.0;self.level_count()];self.hit_radius=self.data[2];self.hit_arc=self.data[1];}&mut self.hit_levels}
    pub fn visual_levels(&self)->Vec<f32>{if self.hit_radius==self.data[2]&&self.hit_arc==self.data[1]{self.hit_levels.clone()}else{vec![100.0;self.level_count()]}}
    pub fn reset_visual_hits(&mut self){self.levels().fill(100.0);}
    pub fn visual_hit(&mut self,flux:f64,angle:f64){if !matches!(self.kind(),FRONT|OMNI){return;}let d=&self.data;let arc=(d[1]+10.0)*if d[1]<=0.0{0.0}else{(d[7]/d[1]).clamp(0.0,1.0)}*PI/180.0;if arc<=0.0||flux<=0.0{return;}let radius=d[2];let max_arc=d[1];let start=d[8]-arc/2.0;let tau=PI*2.0;let offset=(((angle-start)%tau)+tau)%tau;let levels=self.levels();let hit=(offset/arc*(levels.len()-1)as f64+0.5).floor();let distance=tau*radius*max_arc/360.0/(levels.len()-1)as f64;for(i,level)in levels.iter_mut().enumerate(){let weight=(1.0-(hit-i as f64).abs()*distance/50.0).max(0.0);*level=(*level as f64-flux*weight).max(0.0)as f32;}}
    pub fn phase_upkeep(&self) -> bool { self.data[14] == 1.0 || self.data[14] == 2.0 }
    pub fn configure_void(&mut self, row: &[f64]) {
        self.void = Some(VoidShield::new(row));
        self.data[0] = OMNI as f64; self.data[1] = 360.0; self.data[4] = 0.0;
        self.data[6] = 1.0; self.data[7] = 360.0; self.data[39] = 1.0;
    }
    pub fn set_active(&mut self, active: bool, flux: &mut Flux) {
        let was_active = self.active();
        if let Some(v) = &mut self.void {
            let online = active && v.data[10] == 0.0 && v.data[5] > 0.0;
            if online && !was_active { v.data[16] = 1.4; v.data[17] = 0.0; }
            else if !online && was_active { v.data[17] = 0.9; v.data[16] = 0.0; }
            v.data[9] = active as u32 as f64; self.data[6] = online as u32 as f64;
            self.data[7] = if online { 360.0 } else { 0.0 }; return;
        }
        if self.kind() == NONE { self.data[6] = 0.0; return; }
        if self.kind() != PHASE {
            self.data[11] = (active && self.data[10] > 0.0) as u32 as f64;
            if active && self.data[10] <= 0.0 { self.data[6] = 1.0; }
            else if !active && self.active() { self.data[6] = 0.0; self.data[10] = 0.35; }
            return;
        }
        if active { if self.data[14] == 0.0 { self.begin_in(flux); } return; }
        if self.phase_upkeep() { self.begin_out(); }
    }
    pub fn toggle(&mut self, flux: &mut Flux) -> bool {
        if self.locked() { return self.active(); }
        if let Some(v) = &self.void { self.set_active(v.data[9] == 0.0, flux); return self.active(); }
        if self.kind() == NONE { return false; }
        if self.kind() == PHASE {
            if self.data[14] == 0.0 { self.begin_in(flux); return true; }
            if self.phase_upkeep() { self.begin_out(); }
            return false;
        }
        self.set_active(!self.requested(), flux); self.active()
    }
    fn begin_in(&mut self, flux: &mut Flux) {
        self.data[14] = 1.0; self.data[23] = self.data[17].max(0.0);
        self.data[15] = if self.data[17] <= 0.0 { 1.0 } else { 0.0 }; self.data[6] = 1.0;
        if self.data[17] <= 0.0 { self.begin_active(); }
        if self.data[20] > 0.0 { self.data[24] += self.data[20]; self.flush_cost(flux); }
    }
    fn begin_active(&mut self) { self.data[14] = 2.0; self.data[15] = 1.0; self.data[23] = 0.0; }
    fn begin_out(&mut self) {
        self.data[14] = 3.0; self.data[23] = self.data[15].max(0.0) * self.data[18];
        if self.data[23] <= 0.0 { self.finish_out(); }
    }
    fn finish_out(&mut self) {
        self.data[15] = 0.0; self.data[6] = 0.0;
        if self.data[19] > 0.0 { self.data[14] = 4.0; self.data[23] = self.data[19]; }
        else { self.data[14] = 0.0; self.data[23] = 0.0; }
    }
    fn flush_cost(&mut self, flux: &mut Flux) {
        if self.data[24] <= 0.0 { return; }
        // Ship always injects increaseFluxClamped for phase activation, even
        // when a caller revises phaseCanNotCauseOverload afterward.
        flux.increase_clamped(self.data[24], true); self.data[24] = 0.0;
    }
    pub fn overload(&mut self, flux: &mut Flux) {
        if let Some(v) = &mut self.void { v.data[10] = 1.0; self.data[6] = 0.0; self.data[7] = 0.0; }
        else { self.set_active(false, flux); }
    }
    pub fn phase_speed(&self, hard_level: f64) -> f64 {
        if !(1.0..=3.0).contains(&self.data[14]) { return 1.0; }
        let threshold = 0.5 * self.data[16]; if threshold <= 0.0 { return 0.33; }
        let mut disruption = hard_level / threshold;
        if disruption > 1.0 { disruption = 1.0; }
        if disruption <= 0.0 { return 1.0; }
        0.33 + (1.0 - 0.33) * (1.0 - disruption * self.data[15])
    }
    pub fn impact(&mut self, damage: f64, kind: u32, angle: f64) -> (f64, f64, f64) {
        if damage > 0.0 { self.data[28] = 0.0; }
        if let Some(v) = &mut self.void {
            let (absorbed, remaining) = v.absorb(damage * self.data[42], angle);
            if v.data[5] <= 0.0 { self.data[6] = 0.0; self.data[7] = 0.0; }
            self.visual_hit(absorbed,angle);return (0.0, absorbed, remaining);
        }
        let mult = (self.data[40] * self.data[42]) * if kind == 0 { self.data[41] } else { 1.0 };
        let type_mult = match kind { 1 => 2.0, 2 => 0.5, 3 => 0.25, _ => 1.0 };
        let generated = damage * mult * type_mult * self.data[3];
        self.visual_hit(generated,angle);(generated, damage * mult, 0.0)
    }
    pub fn update(&mut self, dt: f64, pose: &[f64; motion::WIDTH], flux: &mut Flux, suppressed: bool) -> Result<(), u32> {
        let kind = self.kind();
        if let Some(v) = &mut self.void {
            v.data[10] = suppressed as u32 as f64; v.advance(dt);
            self.data[6] = (v.data[9] == 1.0 && v.data[10] == 0.0 && v.data[5] > 0.0) as u32 as f64;
            self.data[7] = if self.active() { 360.0 } else { 0.0 };
        }
        if kind == PHASE {
            if self.data[25] == 1.0 {
                self.data[14] = 1.0; self.data[6] = 1.0; self.data[15] = self.data[26].clamp(0.0, 1.0);
            } else {
                if self.data[22] == 1.0 { self.flush_cost(flux); }
                // No overshoot loop: Web phase advances only one stage per call.
                match self.data[14] as u32 {
                    1 => {
                        self.data[23] -= dt;
                        self.data[15] = if self.data[17] <= 0.0 { 1.0 } else { 1.0 - self.data[23].max(0.0) / self.data[17] };
                        if self.data[23] <= 0.0 { self.begin_active(); }
                    }
                    2 => self.data[15] = 1.0,
                    3 => {
                        self.data[23] -= dt;
                        self.data[15] = if self.data[18] <= 0.0 { 0.0 } else { self.data[23].max(0.0) / self.data[18] };
                        if self.data[23] <= 0.0 { self.finish_out(); }
                    }
                    4 => { self.data[23] -= dt; if self.data[23] <= 0.0 { self.data[14] = 0.0; self.data[23] = 0.0; } }
                    _ => (),
                }
            }
        }
        let opening = kind == OMNI && self.active() && self.data[7] == 0.0;
        if kind == FRONT || kind == OMNI {
            if self.active() {
                let rate = 100.0 * 180.0 / (PI * self.data[2].max(1.0)) * if kind == FRONT { 2.0 } else { 1.0 } * self.data[12];
                self.data[7] = (self.data[7] + rate * dt).min(self.data[1]);
            } else {
                self.data[10] = (self.data[10] - dt).max(0.0);
                if self.data[10] <= 1e-8 {
                    self.data[10] = 0.0; self.data[7] = 0.0;
                    if self.data[11] == 1.0 { self.data[11] = 0.0; self.data[6] = 1.0; }
                }
            }
        }
        let mut aim = (self.data[32] - pose[motion::Y]).atan2(self.data[31] - pose[motion::X]);
        if kind == OMNI {
            let cos = pose[motion::FACING].cos(); let sin = pose[motion::FACING].sin();
            let cx = pose[motion::X] + (self.data[29] * cos - self.data[30] * sin);
            let cy = pose[motion::Y] + (self.data[29] * sin + self.data[30] * cos);
            let dx = self.data[31] - cx; let dy = self.data[32] - cy;
            aim = if dx * dx + dy * dy > 1e-12 { dy.atan2(dx) } else { self.data[8] };
        }
        if self.data[33] == 1.0 { aim = self.data[34]; }
        if kind == FRONT { self.data[8] = pose[motion::FACING]; }
        else if kind == OMNI && self.active() {
            if opening || self.data[7] == 0.0 { self.data[8] = aim; }
            else {
                let mut diff = aim - self.data[8];
                while diff > PI { let next = diff - PI * 2.0; if next == diff { return Err(7); } diff = next; }
                while diff < -PI { let next = diff + PI * 2.0; if next == diff { return Err(7); } diff = next; }
                let speed = 100.0 / self.data[2].max(1.0) * self.data[13];
                self.data[8] += if diff == 0.0 { diff } else { diff.signum() } * diff.abs().min(speed * dt);
            }
        } else if kind == OMNI && self.data[10] == 0.0 { self.data[8] = pose[motion::FACING]; }
        if matches!(kind,FRONT|OMNI){for level in self.levels(){*level=(*level as f64+20.0*dt).min(100.0)as f32;}}
        Ok(())
    }
    pub fn valid(&self) -> bool {
        self.data.iter().enumerate().all(|(i, n)| n.is_finite() || (i == 28 && *n == f64::INFINITY))
            && self.data[1]>=0.0 && self.data[2]>=0.0
            && (2.0*PI*self.data[2]*self.data[1]/360.0/20.0).floor()<250_000.0 && (self.data[1]/5.0).floor()<250_000.0
            && self.void.as_ref().is_none_or(|v| v.data.iter().all(|n| n.is_finite()) && v.data[11] <= 9_007_199_254_740_991.0)
    }
    pub fn words(&self, hard_level: f64) -> [f64; WIDTH] {
        let mut row = [0.0; WIDTH]; row[..44].copy_from_slice(&self.data);
        row[27] = self.phase_speed(hard_level);
        if let Some(v) = &self.void { row[44..63].copy_from_slice(&v.data); }
        row
    }
}
