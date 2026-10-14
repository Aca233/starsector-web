//! Shared weapon health. The resident weapon owner supplies synchronous CR
//! side effects between begin and finish, before repair and firing cancellation.
use crate::{random::Random, ship_state::{Notice, COMPONENT_DISABLED, COMPONENT_REPAIRED}};
pub const WIDTH: usize = 20;
#[derive(Clone)]
pub struct Component { pub data: [f64; WIDTH] }
impl Component {
    pub fn new(row: &[f64], random: &mut Random) -> Self {
        let mut data = [0.0; WIDTH]; data[..5].copy_from_slice(&row[..5]);
        let health = match row[1] as u32 { 0 => 250.0, 1 => 500.0, _ => 800.0 }
            * if row[2] == 1.0 { 2.0 } else { 1.0 } * row[5];
        data[5] = health; data[6] = health; data[17] = 1.0; data[18] = 1.0;
        let mut component = Self {data}; if row[6] == 0.0 { component.ensure_tracker(random); } component
    }
    fn duration(&self) -> f64 {
        let base = match self.data[1] as u32 { 0 => 10.0, 1 => 15.0, _ => 20.0 };
        base + if self.data[2] == 1.0 { 5.0 } else { 0.0 }
    }
    fn ensure_tracker(&mut self, random: &mut Random) {
        if self.data[11] == 1.0 { return; }
        self.data[11] = 1.0; self.data[12] = self.duration(); self.data[14] = 0.5 + random.next();
    }
    pub fn damage(&mut self, damage: f64, random: &mut Random) -> f64 {
        if self.data[2] == 2.0 || self.data[7] == 1.0 || self.data[8] == 1.0 || damage <= 0.0 { return 0.0; }
        self.ensure_tracker(random); let before = self.data[5];
        self.data[5] = (self.data[5] - damage).max(0.0); self.data[13] = 0.0; before - self.data[5]
    }
    pub fn disable(&mut self, permanent: bool, random: &mut Random) -> bool {
        self.ensure_tracker(random); let newly = self.data[7] == 0.0;
        if permanent { self.data[8] = 1.0; } self.data[7] = 1.0; self.data[5] = 0.0;
        self.data[9] = self.data[12]; self.data[10] = if self.data[8] == 1.0 { f64::INFINITY } else { self.data[12] }; newly
    }
    pub fn begin(&mut self, dt:f64, random:&mut Random)->bool {
        self.ensure_tracker(random);
        if self.data[16] == 1.0 { self.data[14] = 0.5 + random.next(); self.data[15] = 0.0; self.data[16] = 0.0; }
        self.data[15] += dt;
        let due=self.data[15] >= self.data[14];if due {self.data[16]=1.0;}due
    }
    pub fn finish(&mut self,dt:f64,can_repair:bool,multiplier:f64,under_fire:bool)->bool {
        self.data[13] += dt; let was_disabled = self.data[7] == 1.0;
        if self.data[5] < self.data[6] && can_repair
            && (was_disabled || self.data[13] > 5.0 || (under_fire && self.data[5] > 0.0)) {
            let repair = dt / multiplier.max(0.000001) * self.data[6] / self.data[12];
            self.data[5] = (self.data[5] + repair).min(self.data[6]);
            if was_disabled && self.data[5] >= self.data[6] { self.data[7] = 0.0; }
        }
        let repaired = was_disabled && self.data[7] == 0.0;
        self.data[9] = self.data[12];
        self.data[10] = if self.data[8] == 1.0 { f64::INFINITY } else if self.data[7] == 1.0 {
            (self.data[6] - self.data[5]) / self.data[6] * self.data[12]
        } else { 0.0 };
        repaired
    }
    pub fn advance(&mut self, dt: f64, random: &mut Random, events: &mut Vec<Notice>) {
        if self.data[8] == 1.0 {return;}
        let due=self.begin(dt,random);let disabled=due && self.data[5] <= 0.0 && self.disable(false,random);
        let repaired=self.finish(dt,self.data[17] == 1.0,self.data[18],self.data[19] == 1.0);
        if disabled { events.push(Notice {system:0,kind:COMPONENT_DISABLED,value:0.0,detail:[self.data[0],0.0]}); }
        if repaired { events.push(Notice {system:0,kind:COMPONENT_REPAIRED,value:0.0,detail:[self.data[0],0.0]}); }
    }
    pub fn valid(&self) -> bool {
        self.data.iter().enumerate().all(|(i,n)| n.is_finite() || (i == 10 && self.data[8] == 1.0 && *n == f64::INFINITY))
    }
}
