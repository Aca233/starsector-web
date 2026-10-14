//! Resident pre-fire state only. No query, emitter or shot debit is admitted.
use crate::{component::Component, random::Random, ship_state::{Notice, COMPONENT_DISABLED, COMPONENT_REPAIRED}};
pub const WIDTH:usize=23;
pub const MOUNT_WIDTH:usize=36;
pub const GROUP_WIDTH:usize=11;
#[derive(Clone)]
pub struct Mount {pub data:[f64;MOUNT_WIDTH],pub initialized:bool}
pub struct Group {pub data:[f64;GROUP_WIDTH],pub members:Vec<u32>}
impl Clone for Group {
    fn clone(&self)->Self {Self {data:self.data,members:self.members.clone()}}
    fn clone_from(&mut self,s:&Self){self.data=s.data;self.members.clone_from(&s.members);}
}
pub struct Controller {pub data:[f64;WIDTH],pub mounts:Vec<Mount>,pub groups:Vec<Group>,pub disabled:Vec<u32>,pub repaired:Vec<u32>}
impl Clone for Controller {
    fn clone(&self)->Self {Self {data:self.data,mounts:self.mounts.clone(),groups:self.groups.clone(),disabled:self.disabled.clone(),repaired:self.repaired.clone()}}
    fn clone_from(&mut self,s:&Self){self.data=s.data;self.mounts.clone_from(&s.mounts);self.groups.clone_from(&s.groups);self.disabled.clone_from(&s.disabled);self.repaired.clone_from(&s.repaired);}
}
impl Controller {
    pub fn new(row:&[f64])->Self {
        let mut data=[0.0;WIDTH];data[..4].copy_from_slice(&row[..4]);data[6]=1.0;data[10]=0.7;data[11..19].fill(1.0);
        Self {data,mounts:Vec::new(),groups:Vec::new(),disabled:Vec::new(),repaired:Vec::new()}
    }
    pub fn install(&mut self,row:&[f64]) {
        let mut data=[0.0;MOUNT_WIDTH];data[..15].copy_from_slice(&row[1..16]);self.mounts.push(Mount {data,initialized:false});
    }
    pub fn initialize(&mut self,index:usize,row:&[f64]) {
        let m=&mut self.mounts[index];m.data[15..35].copy_from_slice(&row[1..21]);m.data[35]=row[21];
        if row[21] == 1.0 {m.data[17]=f64::INFINITY;} m.initialized=true;
    }
    pub fn complete(&self)->bool {
        self.mounts.len() as f64 == self.data[1] && self.groups.len() as f64 == self.data[2] && self.mounts.iter().all(|m| m.initialized)
            && self.groups.iter().all(|g| g.members.len() as f64 == g.data[10])
    }
    pub fn valid(&self)->bool {
        self.data.iter().all(|n| n.is_finite()) && self.mounts.iter().all(|m| m.data.iter().enumerate().all(|(i,n)|
            n.is_finite() || (i == 17 && m.data[35] == 1.0 && *n == f64::INFINITY)
                || (i == 24 && m.data[2] == 1.0 && m.data[3] == 0.0 && m.data[23] == 2.0 && *n == f64::INFINITY))) && self.groups.iter().all(|g| g.data.iter().all(|n| n.is_finite()))
    }
    pub fn begin(&mut self,facing:f64,dt:f64,force:bool,blocked:bool,phased:bool,overloaded:bool,venting:bool) {
        let angle=facing-self.data[0];let turn=angle.sin().atan2(angle.cos());self.data[0]=facing;
        for m in &mut self.mounts {m.data[15]+=turn;}
        self.data[19]=(self.data[3] == 1.0 && !force) as u32 as f64;
        self.data[20]=(!overloaded && !venting && !blocked && self.data[4] == 0.0 && !phased && self.data[5] == 0.0) as u32 as f64;self.data[21]=dt;
    }
    pub fn advance_mount(&mut self,index:usize,dt:f64,alive:bool,disabled:bool) {
        let m=&mut self.mounts[index].data;let kind=m[1] as usize;
        let rate=if kind == 0 {1.0} else {self.data[12+kind].max(0.001)};
        let rate=if m[2] == 1.0 {if m[3] == 1.0 {rate} else {1.0}} else if rate <= 1.0 {rate} else {
            let delay=if m[20] > 0.0 {m[6]} else {m[4]+m[5]};if delay/rate < 0.05 {(delay/0.05).max(1.0)} else {rate}
        };
        let reload=m[27];m[27]=(reload-dt*rate).max(0.0);let weapon_dt=(dt*rate-reload).max(0.0);
        m[19]=if m[2] == 1.0 {((weapon_dt-m[16])/rate).max(0.0)} else {(weapon_dt-m[16]).max(0.0)};
        if m[16] > 0.0 {m[16]=(m[16]-weapon_dt).max(0.0);if m[16] < 1e-9 {m[16]=0.0;}}
        if m[17].is_finite() && m[9] == 1.0 && m[11] != 0.0 {
            let mult=if kind == 0 {1.0} else {self.data[15+kind]};m[18]+=m[11]*mult*dt;
            // Preserve each source +1/subtraction, including noninteger initial ammo.
            while m[18] >= 1.0 && m[17] < m[10] {m[17]+=1.0;m[18]-=1.0;}
            if m[17] >= m[10] {m[18]=0.0;}
        }
        if m[14] == 1.0 {
            let next=(((m[30]%2.0)+2.0)%2.0) as usize;let other=1-next;let count=m[17].floor().clamp(0.0,2.0);
            let mut levels=if m[32] == 1.0 {[m[33],m[34]]} else {[0.0,0.0]};
            if m[32] == 0.0 && m[16] <= 0.0 {levels[next]=if count >= 1.0 {1.0} else {0.0};levels[other]=if count >= 2.0 && m[20] <= 0.0 {1.0} else {0.0};}
            if count < 2.0 {levels[other]=0.0;}if count < 1.0 {levels[next]=0.0;}
            if alive && !disabled && m[20] <= 0.0 && m[16] <= 1.2 {let progress=(1.0-m[16]/1.2).clamp(0.0,1.0);
                if count >= 1.0 {levels[next]=levels[next].max(progress);}if count >= 2.0 {levels[other]=levels[other].max(progress);}}
            m[32]=1.0;m[33]=levels[0];m[34]=levels[1];
        }
        if m[28] > 0.0 {m[28]=(m[28]-dt/(m[4]*0.8).max(0.12)).max(0.0);}
        if m[29] > 0.0 {m[29]=(m[29]-dt*3.5).max(0.0);}
        if m[31] > m[12] {let decay=if m[13] == 0.0 {5.0} else {m[13]};m[31]=(m[31]-decay*self.data[12]*dt).max(m[12]);}
    }
    pub fn in_cycle(&self,index:usize,health:&Component)->bool {
        let m=&self.mounts[index].data;health.data[7] == 0.0 && health.data[2] != 2.0 && (m[23] != 0.0 || m[20] > 0.0 || m[16] > 0.0)
    }
    pub fn can_permanent(&self,index:usize,health:&[Component])->bool {
        if health[index].data[2] == 2.0 {return false;}if self.data[10] <= 0.0 {return true;}
        self.mounts.iter().enumerate().any(|(i,m)| i != index && health[i].data[8] == 0.0 && health[i].data[2] != 2.0
            && m.data[17] > 0.0 && (m.data[9] == 0.0 || m.data[10] > 20.0 || m.data[11] > 0.0))
    }
    pub fn finalize(&mut self,index:usize) {
        let m=&mut self.mounts[index].data;if m[17].is_finite() {m[17]=0.0;}let id=m[0] as u32;
        for g in &mut self.groups {g.members.retain(|member| *member != id);g.data[10]=g.members.len() as f64;}
    }
    pub fn cancel(&mut self,index:usize,permanent:bool,events:&mut Vec<Notice>) {
        let m=&mut self.mounts[index].data;
        if m[23] != 0.0 || m[20] > 0.0 {m[16]=m[16].max(if m[7] == 1.0 {m[8]} else {m[4]});}
        m[20]=0.0;m[21]=0.0;m[22]=0.0;m[23]=0.0;m[24]=0.0;m[25]=0.0;
        let id=m[0] as u32;self.disabled.push(id);events.push(Notice {system:0,kind:COMPONENT_DISABLED,value:0.0,detail:[id as f64,permanent as u32 as f64]});
    }
    pub fn repair_notice(&mut self,index:usize,events:&mut Vec<Notice>) {
        let id=self.mounts[index].data[0] as u32;self.repaired.push(id);events.push(Notice {system:0,kind:COMPONENT_REPAIRED,value:0.0,detail:[id as f64,0.0]});
    }
    pub fn clear_events(&mut self){self.disabled.clear();self.repaired.clear();}
}

// Kept here to make the conditional two-roll contract visible next to the cycle gate.
pub fn malfunction(random:&mut Random,chance:f64,critical_chance:f64)->Option<bool> {
    if chance > 0.0 && random.next() < chance {Some(random.next() < critical_chance)} else {None}
}
