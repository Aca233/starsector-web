//! Actual installed PhaseAnchor listener. The scene and listener are persistent
//! transaction state; Body/ShipState remains the sole physical/resource owner.
//! See phase-anchor source notes and plan for the mandatory shared integration.
use crate::{lifecycle::Spec,shield,ship_effects as e,ship_state::{self,ShipState},state::Body};
use std::collections::BTreeMap;

pub const ENHANCED:u32=0xfffc0001;
pub const EMERGENCY:u32=0xfffc0002;
#[derive(Clone,Copy,Debug,Default)]pub struct Encounter{pub emergency_dive_used:bool}
#[derive(Clone,Copy,Debug,PartialEq,Eq)]pub enum Sound{Activate,Vanish}
#[derive(Clone,Copy,Debug,PartialEq,Eq)]pub enum Failure{InvalidNumber,Unsupported,Host}
#[derive(Clone,Debug)]pub struct State{pub emergency:bool,pub progress:f64,pub alpha:f64,pub vanishing:bool,pub enhanced:bool,pub deployment_cr_cost:f64}
impl State{
    pub fn install(ship:&mut ShipState,deployment_cr_cost:f64)->Result<Self,Failure>{
        if !deployment_cr_cost.is_finite()||deployment_cr_cost<0.0{return Err(Failure::InvalidNumber);}
        let cloak=ship.shield.as_mut().filter(|s|s.kind()==shield::PHASE).ok_or(Failure::Unsupported)?;
        if ship.world.is_none(){return Err(Failure::Host);}cloak.data[20]=0.0;ship.anchor_installed=true;
        Ok(Self{emergency:false,progress:0.0,alpha:1.0,vanishing:false,enhanced:false,deployment_cr_cost})
    }
    pub fn valid(&self)->bool{self.progress.is_finite()&&self.progress>=0.0&&self.alpha.is_finite()&&self.alpha>=0.0&&self.alpha<=1.0&&self.deployment_cr_cost.is_finite()&&self.deployment_cr_cost>=0.0}
    pub fn words(&self)->[f64;6]{[self.emergency as u32 as f64,self.progress,self.alpha,self.vanishing as u32 as f64,self.enhanced as u32 as f64,self.deployment_cr_cost]}
    /// This is a real extra phase reader, not visual alpha alone. Both combat
    /// contact and every isPhased call must consume its presence.
    pub fn external_phase(&self)->Option<f64>{self.emergency.then_some(self.alpha.min(0.25))}
    pub fn before_hull<H:Services>(&mut self,bodies:&mut [Body],row:usize,encounter:&mut Encounter,damage:f64,specs:&BTreeMap<u32,Spec>,host:&mut H,sounds:&mut Vec<(crate::state::Handle,Sound)>)->Result<bool,Failure>{
        if !damage.is_finite()||!self.valid(){return Err(Failure::InvalidNumber);}
        let body=bodies.get(row).ok_or(Failure::Host)?;let s=body.ship.as_ref().ok_or(Failure::Host)?;let a=s.armor.as_ref().ok_or(Failure::Host)?;
        // Matches Ship.applyHullDamage qualification, before listener traversal.
        if !(damage>0.0)||s.flags&(ship_state::DEAD|ship_state::RETREATED)!=0||a.data[15]==1.0||a.data[16]==1.0{return Ok(false);}
        if self.emergency{return Ok(true);}
        let cr=s.combat.as_ref().and_then(|c|c.readiness.as_ref()).ok_or(Failure::Host)?.state.current_cr;
        if damage<a.data[14]||encounter.emergency_dive_used||cr<self.deployment_cr_cost{return Ok(false);}
        let phased=host.phased(bodies,row,self)?;let identity=body.handle;
        encounter.emergency_dive_used=true;
        let s=bodies[row].ship.as_mut().unwrap();s.armor.as_mut().unwrap().data[14]=1.0;s.flags|=ship_state::RETREATING;
        host.charge_cr_loss(bodies,row,self.deployment_cr_cost)?;self.emergency=true;
        if !phased{sounds.push((identity,Sound::Activate));}
        let mut immune=e::Modifiers::default();immune.set(e::HULL_DAMAGE,0.0);runtime_set(bodies[row].ship.as_mut().unwrap(),EMERGENCY,immune)?;
        // Exactly allSystems.deactivate(), including idle/out slots and their
        // real onInterrupt/held input behavior. No default/no-op service exists.
        host.deactivate_systems(bodies,row,specs)?;Ok(true)
    }
    pub fn advance<H:Services>(&mut self,bodies:&mut [Body],row:usize,dt:f64,specs:&BTreeMap<u32,Spec>,host:&mut H,sounds:&mut Vec<(crate::state::Handle,Sound)>)->Result<(),Failure>{
        if !dt.is_finite()||dt<0.0||!self.valid(){return Err(Failure::InvalidNumber);}if dt==0.0{return Ok(());}
        let s=bodies.get(row).and_then(|b|b.ship.as_ref()).ok_or(Failure::Host)?;
        if s.flags&(ship_state::DEAD|ship_state::RETREATED)!=0{return Ok(());}
        if self.emergency{
            let body=&mut bodies[row];let s=body.ship.as_mut().unwrap();s.flags|=ship_state::RETREATING;
            s.combat.as_mut().and_then(|c|c.query.as_mut()).ok_or(Failure::Host)?.trigger=false;
            let sh=s.shield.as_mut().ok_or(Failure::Host)?;self.progress+=dt*sh.data[17];
            sh.data[25]=1.0;sh.data[26]=1.0f64.min(sh.data[15].max(self.progress));
            if self.progress>=1.0{
                if !self.vanishing{self.vanishing=true;sounds.push((body.handle,Sound::Vanish));self.alpha-=dt;}else{self.alpha-=2.0*dt;}
                if self.alpha<=0.0{self.alpha=0.0;host.retreat(bodies,row,specs)?;return Ok(());}
            }
        }
        let phased=host.phased(bodies,row,self)?;
        let s=bodies[row].ship.as_mut().unwrap();let enhanced=phased&&s.shield.as_ref().ok_or(Failure::Host)?.data[14]!=3.0;
        if enhanced==self.enhanced{return Ok(());}self.enhanced=enhanced;
        if enhanced{let mut mods=e::Modifiers::default();mods.set(e::DISSIPATION,2.0);for kind in 0..3{mods.weapon(kind,e::RATE,2.0);mods.weapon(kind,e::AMMO_REGEN,2.0);}runtime_set(s,ENHANCED,mods)?;}
        else{s.world.as_mut().ok_or(Failure::Host)?.runtime.retain(|(id,_)|*id!=ENHANCED);}Ok(())
    }
}
fn runtime_set(ship:&mut ShipState,key:u32,modifiers:e::Modifiers)->Result<(),Failure>{let runtime=&mut ship.world.as_mut().ok_or(Failure::Host)?.runtime;
    if let Some((_,m))=runtime.iter_mut().find(|(id,_)|*id==key){*m=modifiers;}else{runtime.push((key,modifiers));}Ok(())}
/// The caller owns actual shared pendingCR storage, system hooks and module
/// tree. These methods execute inside the complete world's rollback boundary.
pub trait Services{
    fn phased(&self,bodies:&[Body],row:usize,listener:&State)->Result<bool,Failure>;
    fn charge_cr_loss(&mut self,bodies:&mut[Body],row:usize,amount:f64)->Result<(),Failure>;
    fn deactivate_systems(&mut self,bodies:&mut[Body],row:usize,specs:&BTreeMap<u32,Spec>)->Result<(),Failure>;
    fn retreat(&mut self,bodies:&mut[Body],row:usize,specs:&BTreeMap<u32,Spec>)->Result<(),Failure>;
}
