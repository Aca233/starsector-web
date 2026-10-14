//! Resident current Web EngineController. Critical damage is executed by
//! ShipState BETWEEN interval handling and repair, never deferred to a notice.
use crate::{motion, random::Random, ship_state::{Notice, ENGINE_DISABLED, ENGINE_REPAIRED, ENGINE_FLAMEOUT, ENGINE_RESTART}};
pub const SLOT_WIDTH: usize = 27;
pub const MOTION_WIDTH: usize = 21;
pub const WIDTH: usize = 20 + MOTION_WIDTH + 3;
pub const READY: f64 = 0.0;
pub const FLAMING: f64 = 1.0;
pub const DISABLED: f64 = 2.0;
#[derive(Clone)]
pub struct Engine { pub data: [f64; SLOT_WIDTH] }
pub struct Controller {
    // hull, radius, health multiplier, count; state/cooldown/permanent fraction;
    // pending public flags; glow interlocks/force; health policy; motion present.
    pub data: [f64; 20], pub engines: Vec<Engine>, pub just_disabled: Vec<usize>,
    pub motion: [f64; MOTION_WIDTH],
}
impl Clone for Controller {
    fn clone(&self)->Self {Self {data:self.data,engines:self.engines.clone(),just_disabled:self.just_disabled.clone(),motion:self.motion}}
    fn clone_from(&mut self,source:&Self) {
        self.data=source.data; self.motion=source.motion;
        self.engines.clone_from(&source.engines); self.just_disabled.clone_from(&source.just_disabled);
    }
}
#[derive(Clone, Copy)]
pub struct Context { pub extended: bool, pub system_active: bool, pub accelerating: bool, pub spreading: bool, pub maneuver: [f64;3] }
impl Controller {
    pub fn new(row: &[f64]) -> Self {
        let mut data = [0.0;20]; data[..4].copy_from_slice(&row[..4]);
        data[10] = 0.05; data[11] = 0.05; data[14] = 1.0; data[15] = 1.0;
        Self {data,engines:Vec::new(),just_disabled:Vec::new(),motion:[0.0;MOTION_WIDTH]}
    }
    pub fn install(&mut self, row: &[f64], random: &mut Random) {
        let mut d = [0.0;SLOT_WIDTH]; d[..10].copy_from_slice(&row[..10]);
        let base = match self.data[0] as u32 {0=>100.0,1=>200.0,2=>400.0,3=>600.0,4=>800.0,_=>10.0};
        let duration = match self.data[0] as u32 {0=>4.0,1=>8.0,2=>12.0,3=>15.0,4=>20.0,_=>10.0};
        d[10] = base * (0.75 + (row[3]+row[4]).clamp(25.0,100.0) / 100.0 * 0.5) * self.data[2]; d[11] = d[10];
        d[14] = duration * (0.9 + random.next() * 0.2); d[16] = 0.5 + random.next();
        d[20] = (row[2] / (self.data[1] * 0.3).max(0.000001)).clamp(-1.0,1.0);
        d[23] = if row[6] == 1.0 {0.0} else {0.4}; d[24] = d[23];
        self.engines.push(Engine {data:d});
        if self.complete() {
            let mut total = self.engines.iter().filter(|e| e.data[5] == 0.0 && e.data[6] == 0.0).fold(0.0,|sum,e| sum + e.data[11]);
            if total <= 0.0 { total = self.engines.iter().fold(0.0,|sum,e| sum + e.data[11]); }
            if total <= 0.0 { total = 100.0; }
            for e in &mut self.engines { e.data[19] = if e.data[6] == 1.0 {0.0} else {e.data[11] / total}; }
        }
    }
    pub fn complete(&self) -> bool { self.engines.len() as f64 == self.data[3] }
    pub fn fraction(&self, raw: bool) -> f64 {
        let mut fraction = 0.0; let mut temporary = 0.0;
        for e in &self.engines { let d = &e.data;
            if d[12] == 0.0 || d[5] == 1.0 {continue;}
            fraction += d[19]; if d[21] == 1.0 && d[13] == 0.0 {temporary += d[19];}
        }
        if !raw && fraction < 1.0 {
            let excluded = self.data[6] + temporary;
            if excluded > 0.0 && excluded < 1.0 {fraction = (fraction - excluded) / (1.0 - excluded);}
        }
        fraction
    }
    pub fn multiplier(&self) -> f64 { (1.0 - self.fraction(true)).clamp(0.0,1.0) }
    pub fn drift(&self, turn: f64, extended: bool) -> f64 {
        if self.data[4] == DISABLED {return 0.0;}
        let mut drift = 0.0;
        for e in &self.engines {let d=&e.data; if d[12] == 1.0 && (d[5] == 0.0 || extended) {drift += d[19] * d[20] * 2.0;}}
        drift * turn
    }
    pub fn damage(&mut self, index: usize, damage: f64, extended: bool) -> f64 {
        let d = &mut self.engines[index].data;
        if damage <= 0.0 || self.data[4] == DISABLED || d[12] == 1.0 || (d[5] == 1.0 && !extended) {return 0.0;}
        let before=d[10]; d[10]=(d[10]-damage).max(0.0); d[15]=0.0; before-d[10]
    }
    pub fn disable(&mut self, index: usize, context: Context, permanent: bool) -> bool {
        if permanent {self.engines[index].data[13]=1.0;}
        if self.engines[index].data[12] == 0.0 && context.extended && context.system_active
            && !self.engines.iter().enumerate().any(|(i,e)| i != index && e.data[5] == 0.0 && e.data[12] == 0.0) {return false;}
        let d=&mut self.engines[index].data; let newly=d[12] == 0.0; d[12]=1.0; d[10]=0.0; newly
    }
    pub fn malfunction(&mut self, index: usize, context: Context, permanent: bool) -> bool {
        self.engines[index].data[21]=1.0;
        if permanent {self.data[6] += self.engines[index].data[19];}
        self.disable(index,context,permanent)
    }
    pub fn force(&mut self, suppress: bool) {self.data[12]=1.0; self.data[13]=suppress as u32 as f64;}
    pub fn clear_events(&mut self) {self.just_disabled.clear(); self.data[7]=0.0; self.data[8]=0.0;}
    pub fn restore(&mut self) {
        self.data[4..14].fill(0.0); self.data[10]=0.05; self.data[11]=0.05; self.clear_events();
        for e in &mut self.engines {let d=&mut e.data;
            d[10]=d[11]; d[12]=0.0; d[13]=0.0; d[15]=0.0; d[17]=0.0; d[18]=0.0;
            d[21]=0.0; d[22]=0.0; d[23]=if d[6] == 1.0 {0.0} else {0.4}; d[24]=d[23]; d[25]=0.0; d[26]=0.0;
        }
    }
    pub fn prepare(&mut self) {for e in &mut self.engines {e.data[24]=e.data[23]; e.data[26]=e.data[25];}}
    pub fn begin(&mut self, dt: f64) -> bool {self.data[5]=(self.data[5]-dt).max(0.0); self.data[4] == FLAMING}
    /// Returns true only when the caller must immediately execute critical damage.
    pub fn health_begin(&mut self, index: usize, dt: f64, flaming: bool, c: Context, random: &mut Random) -> bool {
        let d=&mut self.engines[index].data;
        if d[13] == 1.0 {return false;}
        if d[18] == 1.0 {d[16]=0.5+random.next(); d[17]=0.0; d[18]=0.0;}
        d[17] += dt * if flaming {2.5} else {1.0};
        if d[17] < d[16] {return false;}
        d[18]=1.0;
        if d[10] <= 0.0 || flaming {d[21]=0.0; self.disable(index,c,false); return false;}
        if d[5] == 0.0 && self.data[17] > 0.0 && (c.accelerating || c.spreading) && random.next() < self.data[17] {
            let critical=random.next() < self.data[18];
            let permanent=critical && self.data[6]+self.engines[index].data[19] <= 0.66;
            self.malfunction(index,c,permanent); return critical;
        }
        false
    }
    pub fn health_finish(&mut self, index: usize, dt: f64, flaming: bool, was_permanent: bool, events: &mut Vec<Notice>) {
        let d=&mut self.engines[index].data;
        if !was_permanent {
            d[15] += dt; let disabled=d[12] == 1.0;
            if d[10] < d[11] && self.data[14] == 1.0 && !flaming
                && (disabled || d[15] > 5.0 || (self.data[16] == 1.0 && d[10] > 0.0)) {
                let repair=dt / self.data[15].max(0.000001) * d[11] / d[14];
                d[10]=(d[10]+repair).min(d[11]); if disabled && d[10] >= d[11] {d[12]=0.0;}
            }
            if disabled && d[12] == 0.0 {events.push(Notice {system:0,kind:ENGINE_REPAIRED,value:0.0,detail:[index as f64,0.0]});}
        }
        if d[12] == 1.0 && d[22] == 0.0 {
            d[22]=1.0; self.just_disabled.push(index);
            events.push(Notice {system:0,kind:ENGINE_DISABLED,value:0.0,detail:[index as f64,0.0]});
        } else if d[12] == 0.0 && (d[22] == 1.0 || d[23] == 0.0) {d[22]=0.0; d[23]=0.0;}
    }
    pub fn finish(&mut self, dt: f64, c: Context, events: &mut Vec<Notice>) {
        if self.data[4] == FLAMING && self.engines.iter().all(|e| e.data[23] <= 0.0) {self.data[4]=DISABLED;}
        if !self.engines.is_empty() {
            let fraction=if self.data[12] == 1.0 {1.0} else {self.fraction(false)}; self.data[12]=0.0;
            let threshold=if c.extended {0.99} else {0.5};
            if self.data[4] == READY && ((self.data[5] <= 0.0 && fraction > threshold) || fraction >= 1.0) {
                self.data[4]=FLAMING; self.data[5]=match self.data[0] as u32 {1=>5.0,2=>7.0,3=>9.0,4=>11.0,_=>10.0};
                if self.data[13] == 0.0 {self.data[7]=1.0; events.push(Notice {system:0,kind:ENGINE_FLAMEOUT,value:0.0,detail:[0.0;2]});}
                self.data[13]=0.0;
            } else if self.data[4] == DISABLED && fraction <= threshold {
                self.data[4]=READY; self.data[8]=1.0; events.push(Notice {system:0,kind:ENGINE_RESTART,value:0.0,detail:[0.0;2]});
                for e in &mut self.engines {if e.data[12] == 0.0 {e.data[22]=0.0; e.data[23]=0.0;}}
            }
        }
        let mut accelerating=false; let mut spreading=false;
        if c.spreading && self.data[10] >= 0.05 {self.data[11]=0.0; spreading=true;}
        if c.accelerating && self.data[11] >= 0.05 {self.data[10]=0.0; accelerating=true; spreading=false;}
        self.data[10] += dt; self.data[11] += dt;
        for e in &mut self.engines {let d=&mut e.data;
            if d[6] == 1.0 {
                d[23]=if d[22] == 1.0 || d[12] == 1.0 || self.data[4] != READY {0.0}
                    else {(d[7]*c.maneuver[0]).max(d[8]*c.maneuver[1]).max(d[9]*c.maneuver[2]).max(0.0).min(1.0)};
                d[25]=0.0; continue;
            }
            if d[22] == 1.0 {d[23]=(d[23]-dt).max(0.0); continue;}
            if d[23] < 0.4 {d[23]=(d[23]+dt).min(0.4); continue;}
            self.data[9]=(accelerating || self.data[10] <= 0.05) as u32 as f64;
            let target=if self.data[9] == 1.0 {1.0} else {0.4}; let difference=target-d[23];
            d[23] += sign(difference) * difference.abs().min(dt);
            if spreading && d[23] <= 0.4 {d[23] += 0.01;}
            let target_spread=if spreading {90.0} else {0.0}; let difference=target_spread-d[25];
            d[25] += sign(difference) * difference.abs().min(dt*270.0);
        }
    }
    /// Source grouping/clamps and degree conversion retained for non-module ships.
    pub fn motion_row(&self, row: &mut [f64;motion::WIDTH], boost: bool, phase_speed: f64, extended: bool) {
        self.motion_row_live(row,boost,phase_speed,extended,&crate::ship_effects::Modifiers::default());
    }
    pub fn motion_row_live(&self, row: &mut [f64;motion::WIDTH], boost: bool, phase_speed: f64, extended: bool,live:&crate::ship_effects::Modifiers) {
        self.motion_row_propulsion(row,boost,phase_speed,extended,live,[1.0;3]);
    }
    /// Actual module speed/acceleration/turn factors retain ShipMotion's clamp
    /// and multiplication order, including its distinct disabled branch.
    pub fn motion_row_propulsion(&self,row:&mut[f64;motion::WIDTH],boost:bool,phase_speed:f64,extended:bool,live:&crate::ship_effects::Modifiers,propulsion:[f64;3]) {
        if self.data[19] == 0.0 {return;}
        use crate::ship_effects as e;
        let m=&self.motion; let mult=self.multiplier()*m[15]*m[16]; let disabled=self.data[4] == DISABLED;
        let minimum=|value:f64| if disabled {1.0} else {value.max(1.0)};
        row[motion::ACCELERATION]=minimum((m[0]+live.get(e::ACCEL_FLAT))*(1.0+(m[1]+live.get(e::ACCEL_PERCENT))/100.0)*m[2]*mult*propulsion[1]);
        row[motion::DECELERATION]=minimum((m[3]+live.get(e::DECEL_FLAT))*(1.0+(m[4]+live.get(e::DECEL_PERCENT))/100.0)*m[5]*mult);
        row[motion::MAX_SPEED]=minimum((m[6]+live.get(e::SPEED_FLAT)+if boost {50.0+m[19]} else {0.0})*(1.0+(m[7]+live.get(e::SPEED_PERCENT))/100.0)*m[8]*mult*propulsion[0]*phase_speed);
        row[motion::TURN_ACCELERATION]=minimum((m[9]+live.get(e::TURN_ACCEL_FLAT))*(1.0+(m[10]+live.get(e::TURN_ACCEL_PERCENT))/100.0)*m[11]*mult)*if disabled{1.0}else{propulsion[2]}*std::f64::consts::PI/180.0;
        row[motion::MAX_TURN]=minimum((m[12]+live.get(e::TURN_FLAT)+if boost {10.0*m[20]} else {0.0})*(1.0+(m[13]+live.get(e::TURN_PERCENT))/100.0)*m[14]*mult*propulsion[2])*std::f64::consts::PI/180.0;
        row[motion::DRIFT]=self.drift(row[motion::TURN_ACCELERATION],extended);
        row[motion::STRAFE_MULTIPLIER]=match self.data[0] as u32 {4=>0.25,3=>0.5,2|0=>0.75,_=>1.0};
    }
    pub fn valid(&self) -> bool {
        self.data.iter().chain(self.motion.iter()).all(|n| n.is_finite())
            && self.engines.iter().all(|e| e.data.iter().all(|n| n.is_finite()))
    }
    pub fn words(&self) -> [f64;WIDTH] {
        let mut row=[0.0;WIDTH]; row[..20].copy_from_slice(&self.data); row[20..41].copy_from_slice(&self.motion);
        row[41]=self.fraction(true); row[42]=self.fraction(false); row[43]=self.multiplier(); row
    }
}
fn sign(value:f64)->f64 {if value == 0.0 {value} else if value < 0.0 {-1.0} else {1.0}}
