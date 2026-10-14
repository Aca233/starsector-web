//! Resident real damage adapter for weapon_effects. No TS/host solver.
//! Caller uses the live body slice and a synchronous Rust world destruction
//! function, and drains ordered records only after the whole step commits.
use crate::{random::Random, ship_state::{self, Notice}, state::{Body, Handle}, weapon_effects as e};
#[derive(Clone)]
pub enum Record {
    Notice { target: u32, handle: Handle, notice: Notice },
    ArmorSparks { target: u32, local: [f64;2], armor: f64 },
    EmpArc(e::EmpArc),
    Sound { sound: e::Sound, point: [f64;2], volume: f64, pitch: f64 },
    EnergyDamage { player: bool, layer: e::DamageLayer, damage: f64, emp: f64 },
    Cosmetic(e::CosmeticImpact),
}
pub struct OwnerSink<'a, D> {
    pub bodies: &'a mut [Body], pub output: &'a mut Vec<Record>,
    pub component_source: [f64;2], pub destruction: D,
    /// Failed lookup/hull/flux/destruction is checked before commit.
    /// Armor/components propagate errors directly into caller rollback.
    pub error: Option<u32>,
}
impl<'a, D> OwnerSink<'a, D> where D: FnMut(&mut [Body], usize, &mut Random, &mut Random, &mut Vec<Record>) -> Result<(),u32> {
    pub fn finish(&self) -> Result<(),u32> { self.error.map_or(Ok(()), Err) }
    fn index(&self, target: u32) -> Result<usize,u32> { self.bodies.iter().position(|b|b.id==target).ok_or(4) }
    fn notices(&mut self, index:usize, notices:Vec<Notice>) {
        let body=&self.bodies[index];
        self.output.extend(notices.into_iter().map(|notice|Record::Notice{target:body.id,handle:body.handle,notice}));
    }
    fn fail(&mut self, error:u32) { if self.error.is_none(){self.error=Some(error);} }
}
impl<D> e::Sink for OwnerSink<'_, D> where D: FnMut(&mut [Body],usize,&mut Random,&mut Random,&mut Vec<Record>)->Result<(),u32> {
    fn armor_energy(&mut self,target:u32,point:[f64;2],damage:f64,visual:&mut Random)->Result<e::Damage,u32> {
        if let Some(error)=self.error{return Err(error);}let index=self.index(target)?;
        let ship=self.bodies[index].ship.as_mut().ok_or(8u32)?;let mut notices=Vec::new();
        let result=ship.armor_impact(&[point[0],point[1],damage,0.0,0.0,0.0,0.0,0.0],visual,&mut notices)?;
        self.notices(index,notices);Ok(e::Damage{armor:result[0],hull:result[1]})
    }
    fn hull(&mut self,target:u32,damage:f64) {
        if self.error.is_some(){return;}let operation=(||{
            let index=self.index(target)?;let ship=self.bodies[index].ship.as_mut().ok_or(8u32)?;
            let mut notices=Vec::new();ship.apply_hull(damage,&mut notices)?;self.notices(index,notices);Ok(())
        })();if let Err(error)=operation{self.fail(error);}
    }
    fn components(&mut self,target:u32,point:[f64;2],damage:e::Damage,emp:f64,random:&mut Random)->Result<(),u32> {
        if let Some(error)=self.error{return Err(error);}let index=self.index(target)?;
        let ship=self.bodies[index].ship.as_mut().ok_or(8u32)?;let mut notices=Vec::new();
        ship.propagate(point,[damage.armor,damage.hull],emp,self.component_source,random,&mut notices)?;
        self.notices(index,notices);Ok(())
    }
    fn shield_flux(&mut self,target:u32,amount:f64,hard:bool) {
        if self.error.is_some(){return;}let operation=(||{
            let index=self.index(target)?;let ship=self.bodies[index].ship.as_mut().ok_or(8u32)?;let mut notices=Vec::new();
            if !amount.is_finite(){return Err(7);}ship.flux_operation(0,amount,hard,&mut notices);ship.sync_shield();self.notices(index,notices);Ok(())
        })();if let Err(error)=operation{self.fail(error);}
    }
    fn armor_sparks(&mut self,target:u32,local:[f64;2],armor:f64) {self.output.push(Record::ArmorSparks{target,local,armor});}
    fn emp_arc(&mut self,arc:e::EmpArc){self.output.push(Record::EmpArc(arc));}
    fn sound(&mut self,sound:e::Sound,point:[f64;2],volume:f64,pitch:f64){self.output.push(Record::Sound{sound,point,volume,pitch});}
    fn record_energy(&mut self,player:bool,layer:e::DamageLayer,damage:f64,emp:f64){self.output.push(Record::EnergyDamage{player,layer,damage,emp});}
    fn destroy_if_dead(&mut self,target:u32,random:&mut Random,visual:&mut Random) {
        if self.error.is_some(){return;}let operation=(||{
            let index=self.index(target)?;let body=&self.bodies[index];let ship=body.ship.as_ref().ok_or(8u32)?;
            let armor=ship.armor.as_ref().ok_or(8u32)?;
            if armor.data[14]<=0.0{(self.destruction)(self.bodies,index,random,visual,self.output)?;}Ok(())
        })();if let Err(error)=operation{self.fail(error);}
    }
    fn cosmetic(&mut self,impact:e::CosmeticImpact){self.output.push(Record::Cosmetic(impact));}
}
