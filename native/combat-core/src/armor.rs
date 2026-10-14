//! Current Web ArmorGrid + ShipDamageState. Cells deliberately retain f32
//! stores; damage arithmetic and HP remain f64. No hit selection or callbacks.
use crate::{random::Random, shield::Shield, ship_state::{Notice, CELL_DAMAGE}};
use std::{collections::BTreeMap, f64::consts::PI};
pub const WIDTH: usize = 31;
pub const SCAR_WIDTH: usize = 15;

pub struct Armor {
    pub data: [f64; 29], pub cells: Vec<f32>,
    pub scars: Vec<[f64; SCAR_WIDTH]>, scar_index: BTreeMap<usize, usize>,
}
impl Clone for Armor {
    fn clone(&self) -> Self {
        Self {data:self.data,cells:self.cells.clone(),scars:self.scars.clone(),scar_index:self.scar_index.clone()}
    }
    fn clone_from(&mut self, source: &Self) {
        self.data = source.data; self.cells.clone_from(&source.cells);
        self.scars.clone_from(&source.scars); self.scar_index.clone_from(&source.scar_index);
    }
}
impl Armor {
    pub fn new(row: &[f64]) -> Self {
        let mut d = [0.0; 29]; d[..7].copy_from_slice(&row[..7]);
        d[7] = (row[4] / 15.0).max(1.0); d[8..12].copy_from_slice(&row[9..13]);
        d[13] = row[7]; d[14] = row[8]; d[15] = row[15]; d[16] = row[16];
        d[17] = row[13]; d[18] = row[14]; d[20] = -1.0; d[21..29].fill(1.0);
        Self {cells: vec![d[7] as f32; row[0] as usize * row[1] as usize], data: d,
            scars: Vec::new(), scar_index: BTreeMap::new()}
    }
    pub fn stats(&mut self, row: &[f64]) {
        self.data[8..12].copy_from_slice(&row[..4]); self.data[21..29].copy_from_slice(&row[4..12]);
        self.data[15] = row[12]; self.data[16] = row[13]; self.data[18] = row[14];
    }
    fn cell(&self, c: i64, r: i64) -> f64 {
        if c < 0 || r < 0 || c >= self.data[0] as i64 || r >= self.data[1] as i64 { 0.0 }
        else { self.cells[r as usize * self.data[0] as usize + c as usize] as f64 }
    }
    pub fn set_cell(&mut self, c: i64, r: i64, value: f64) {
        if c < 0 || r < 0 || c >= self.data[0] as i64 || r >= self.data[1] as i64 { return; }
        let index = r as usize * self.data[0] as usize + c as usize;
        let next = value.max(0.0);
        // Compare BEFORE the f32 store, exactly like Float32Array setCell.
        if self.cells[index] as f64 != next { self.cells[index] = next as f32; self.data[12] += 1.0; }
    }
    pub fn grid(&self, x: f64, y: f64) -> (i64, i64) {
        let map = |point: f64, minimum: f64, width: f64, count: f64| {
            let origin = minimum / width; let rounded = (origin + 0.5).floor();
            let raw = if (origin - rounded).abs() < 1e-9 { (point / width).floor() - rounded }
                else { ((point - minimum) / width).floor() };
            raw.min(count - 1.0).max(0.0) as i64
        };
        (map(x,self.data[5],self.data[2],self.data[0]),map(y,self.data[6],self.data[3],self.data[1]))
    }
    fn effective(&self, c: i64, r: i64) -> f64 {
        let mut armor = 0.0;
        for dy in -2i64..=2 { for dx in -2i64..=2 {
            if dx.abs() == 2 && dy.abs() == 2 { continue; }
            let weight = if dx.abs() <= 1 && dy.abs() <= 1 { 0.06666667 } else { 0.033333335 } / 0.06666667;
            armor += self.cell(c + dx,r + dy) * weight;
        } }
        (armor * self.data[8] * self.data[9]).max(self.data[4] * 0.05 * self.data[11])
    }
    fn scar_contact(&mut self, c: i64, r: i64, damage: f64, random: &mut Random) {
        if self.data[17] == 0.0 || self.data[18] == 1.0 || c < 2 || r < 2
            || c >= self.data[0] as i64 - 2 || r >= self.data[1] as i64 - 2 { return; }
        let fraction = (self.cell(c,r) / self.data[7]).clamp(0.0,1.0);
        let cell = r as usize * self.data[0] as usize + c as usize;
        if !self.scar_index.contains_key(&cell) && fraction < 0.9 {
            let first = random.next(); let second = random.next();
            let kind = if second > 0.75 { 1.0 } else if first > 0.75 { 2.0 } else { 0.0 };
            let variant = if random.next() > 0.5 { 0.0 } else { 1.0 };
            let rotation = random.next() * PI * 2.0;
            let size = (self.data[2] * 1.5).max(40.0) * (1.0 + 0.5 * random.next());
            let period = 0.25 + 0.75 * random.next();
            // Intensity (4) is a presentation-only projection from heat/flash/phase.
            self.scar_index.insert(cell,self.scars.len());
            self.scars.push([cell as f64,self.data[5] + (c as f64 + 0.5) * self.data[2],
                self.data[6] + (r as f64 + 0.5) * self.data[3],0.0,0.0,0.0,0.0,0.0,0.0,0.0,
                period,size,rotation,kind,variant]); self.data[19] += 1.0;
        }
        if let Some(&index) = self.scar_index.get(&cell) {
            let mark = &mut self.scars[index]; let opacity = 1.0 - fraction;
            if mark[3] != opacity { mark[3] = opacity; self.data[19] += 1.0; }
            if damage > 0.0 { mark[5] = (mark[5] + 255.0 * damage / self.data[7] * 2.5).min(255.0); mark[6] = 1.0; }
        }
    }
    pub fn sync_scars(&mut self, random: &mut Random) {
        if self.data[17] == 0.0 || self.data[18] == 1.0 || self.data[20] == self.data[12] { return; }
        for c in 2..self.data[0] as i64 - 2 { for r in 2..self.data[1] as i64 - 2 { self.scar_contact(c,r,0.0,random); } }
        self.data[20] = self.data[12];
    }
    pub fn advance_scars(&mut self, dt: f64, random: &mut Random) {
        self.sync_scars(random);
        let health = (self.data[14] / self.data[13]).clamp(0.0,1.0);
        // Source advances existing marks even when suppressed; suppression gates creation/sync.
        for mark in &mut self.scars {
            let factor = health * mark[3]; mark[8] += dt;
            let interval = 0.325 * factor + 0.175;
            if mark[8] >= interval {
                mark[8] -= interval;
                if random.next() < 0.03 { mark[7] = (mark[7] + 100.0 + 155.0 * random.next() * (1.0 - factor)).min(255.0); }
            } else { mark[7] = (mark[7] - 1000.0 * dt).max(0.0); }
            if mark[6] == 0.0 { mark[5] = (mark[5] - 20.0 * dt).max(0.0); }
            mark[9] = (mark[9] + dt * (2.0 - health) / mark[10]) % (PI * 2.0); mark[6] = 0.0;
        }
    }
    pub fn impact(&mut self, row: &[f64], random: &mut Random, shield: &mut Option<Shield>, events: &mut Vec<Notice>) -> [f64; 3] {
        self.impact_with_damage(row,random,shield,events,|_|{})
    }
    pub fn impact_with_damage<F:FnMut(f64)>(&mut self, row: &[f64], random: &mut Random, shield: &mut Option<Shield>, events: &mut Vec<Notice>,mut damage_listener:F) -> [f64;3] {
        let (c,r) = self.grid(row[0],row[1]); let effective = self.effective(c,r);
        let kind = row[3] as usize;
        let armor_mult = match kind { 1 => 0.5, 2 => 2.0, 3 => 0.25, _ => 1.0 } * self.data[21 + kind * 2];
        let hull_mult = self.data[22 + kind * 2];
        if armor_mult <= 0.0 { return [0.0,0.0,effective]; }
        let modified = row[2] * armor_mult;
        let mut strength = if row[4] == 1.0 { row[5] } else { row[2] } * armor_mult;
        if row[6] == 1.0 { strength *= 0.5; } if strength < 1.0 { strength = 1.0; }
        let multiplier = (1.0 - self.data[10]).max(strength / (strength + effective));
        let reduced = modified * multiplier;
        let primary = reduced * 0.06666667; let secondary = reduced * 0.06666667; let tertiary = reduced * 0.033333335;
        let hull_factor = hull_mult / armor_mult;
        let mut armor_damage = 0.0; let mut hull_damage = 0.0;
        for dy in -2i64..=2 { for dx in -2i64..=2 {
            if dx.abs() == 2 && dy.abs() == 2 { continue; }
            let damage = if dx == 0 && dy == 0 { primary } else if dx.abs() <= 1 && dy.abs() <= 1 { secondary } else { tertiary };
            let current = self.cell(c + dx,r + dy); let next = (current - damage).max(0.0);
            let overflow = (damage - current).max(0.0); self.set_cell(c + dx,r + dy,next);
            if damage > 0.0 {
                if let Some(v) = shield.as_mut().and_then(|s| s.void.as_mut()) { v.data[7] = v.data[3]; }
                self.scar_contact(c + dx,r + dy,damage,random);
                damage_listener(damage);
                events.push(Notice {system:0,kind:CELL_DAMAGE,value:damage,detail:[(c + dx) as f64,(r + dy) as f64]});
            }
            // Preserve pre-f32-store arithmetic in returned damage totals.
            armor_damage += current - next; hull_damage += overflow * hull_factor;
        } }
        [armor_damage,hull_damage,self.effective(c,r)]
    }
    pub fn apply_hull(&mut self, damage: f64, inactive: bool, shield: &mut Option<Shield>) -> f64 {
        if damage <= 0.0 || inactive || self.data[15] == 1.0 || self.data[16] == 1.0 { return 0.0; }
        if let Some(v) = shield.as_mut().and_then(|s| s.void.as_mut()) { v.data[7] = v.data[3]; }
        let dealt = self.data[14].min(damage); self.data[14] -= dealt; dealt
    }
    pub fn valid(&self) -> bool {
        self.data.iter().all(|n| n.is_finite()) && self.cells.iter().all(|n| n.is_finite())
            && self.scars.iter().flatten().all(|n| n.is_finite())
            && [12,19].iter().all(|&i| self.data[i] <= 9_007_199_254_740_991.0)
    }
    pub fn words(&self) -> [f64; WIDTH] {
        let mut row = [0.0; WIDTH]; row[..29].copy_from_slice(&self.data);
        let total = self.cells.iter().fold(0.0,|sum,n| sum + *n as f64);
        let maximum = self.cells.len() as f64 * self.data[7]; row[29] = if maximum > 0.0 { total / maximum } else { 0.0 }; row
    }
}
