//! Cloneable allocation draft. Core supplies its actual free-list generations;
//! only Core commits the returned allocations after the whole battle succeeds.
use crate::{flight_owner::Allocation,flight_world::Error,state::{Body,Handle},tactical_ai::Identity};
use std::collections::BTreeSet;
const MAX_INTEGER:f64=9_007_199_254_740_991.0;
#[derive(Clone)]pub struct Snapshot{
    pub generations:Vec<u32>,pub free:Vec<u32>,pub next_order:f64,pub next_numeric_id:u32,
}
#[derive(Clone)]pub struct Born{pub stable_id:String,pub allocation:Allocation}
#[derive(Clone)]pub struct Owned{
    pub snapshot:Snapshot,pub born:Vec<Born>,ids:BTreeSet<u32>,stable:BTreeSet<String>,occupied:BTreeSet<u32>,
}
impl Owned{
    pub fn new(snapshot:Snapshot,bodies:&[Body],stable:&[(Handle,String)])->Result<Self,Error>{
        if !snapshot.next_order.is_finite()||snapshot.next_order<0.0||snapshot.next_order.fract()!=0.0||snapshot.next_order>MAX_INTEGER
            ||snapshot.next_numeric_id==0||snapshot.generations.len()>u32::MAX as usize||stable.len()!=bodies.len(){return Err(Error::InvalidIdentity);}
        let mut out=Self{snapshot,born:Vec::new(),ids:BTreeSet::new(),stable:BTreeSet::new(),occupied:BTreeSet::new()};
        for b in bodies{if b.id==0||b.handle.generation==0||out.snapshot.generations.get(b.handle.slot as usize)!=Some(&b.handle.generation)
                ||!out.ids.insert(b.id)||!out.occupied.insert(b.handle.slot)||!b.order.is_finite()||b.order>=out.snapshot.next_order{return Err(Error::InvalidIdentity);}
            let names:Vec<_>=stable.iter().filter(|(h,_)|*h==b.handle).collect();if names.len()!=1||names[0].1.is_empty()||!out.stable.insert(names[0].1.clone()){return Err(Error::InvalidIdentity);}}
        let mut free=BTreeSet::new();for &slot in &out.snapshot.free{if !free.insert(slot)||out.occupied.contains(&slot)
                ||out.snapshot.generations.get(slot as usize).is_none_or(|g|*g==0){return Err(Error::InvalidIdentity);}}
        if out.ids.contains(&out.snapshot.next_numeric_id){return Err(Error::InvalidIdentity);}Ok(out)
    }
    pub fn allocate(&mut self,stable:&str)->Result<Allocation,Error>{
        if stable.is_empty()||self.stable.contains(stable)||self.snapshot.next_order>=MAX_INTEGER{return Err(Error::InvalidIdentity);}
        let numeric_id=self.snapshot.next_numeric_id;if numeric_id==0||self.ids.contains(&numeric_id){return Err(Error::InvalidIdentity);}
        // Reserve a successor before mutating; exhaustion rejects atomically.
        let next=numeric_id.checked_add(1).ok_or(Error::InvalidIdentity)?;
        let slot=if let Some(&slot)=self.snapshot.free.last(){slot}else{u32::try_from(self.snapshot.generations.len()).map_err(|_|Error::InvalidIdentity)?};
        let generation=if self.snapshot.free.is_empty(){1}else{*self.snapshot.generations.get(slot as usize).ok_or(Error::InvalidIdentity)?};
        if generation==0||self.occupied.contains(&slot){return Err(Error::InvalidIdentity);}
        if self.snapshot.free.is_empty(){self.snapshot.generations.push(generation);}else{self.snapshot.free.pop();}
        let allocation=Allocation{numeric_id,identity:Identity{handle:slot,generation},order:self.snapshot.next_order};
        self.snapshot.next_numeric_id=next;self.snapshot.next_order+=1.0;self.ids.insert(numeric_id);self.stable.insert(stable.to_owned());self.occupied.insert(slot);
        self.born.push(Born{stable_id:stable.to_owned(),allocation});Ok(allocation)
    }
    /// Only an inactive simulator sentinel may be aliased by the scene owner.
    /// Check the whole tree before replacing any name in the allocation draft.
    pub fn rename(&mut self,names:&[(String,String)])->Result<(),Error>{
        let mut next=self.stable.clone();let mut old=BTreeSet::new();let mut replacements=BTreeSet::new();
        for(from,to)in names{if from.is_empty()||to.is_empty()||!old.insert(from)||!replacements.insert(to)
            ||!next.remove(from){return Err(Error::InvalidIdentity);}}
        for(_,to)in names{if !next.insert(to.clone()){return Err(Error::InvalidIdentity);}}
        for born in &mut self.born{if let Some((_,to))=names.iter().find(|(from,_)|*from==born.stable_id){born.stable_id=to.clone();}}
        self.stable=next;Ok(())
    }
}
