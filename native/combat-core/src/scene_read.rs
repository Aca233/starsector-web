//! Startup-only scalar inputs for live read facts, shared by generated actors.
use crate::state::{Body,Handle};
#[derive(Clone)]pub struct Meta{pub ship:Handle,pub sight_flat:f64,pub sight_percent:f64,pub weapon_repair:f64}
#[derive(Clone,Default)]pub struct Owned{pub ships:Vec<Meta>,pub expected:Option<usize>}
impl Meta{pub fn valid(&self)->bool{self.ship.generation>0&&[self.sight_flat,self.sight_percent,self.weapon_repair].iter().all(|n|n.is_finite())&&self.weapon_repair>=0.0}}
impl Owned{
    pub fn admit(&mut self,m:Meta)->Result<(),u32>{if self.expected.is_some()||!m.valid()||self.ships.iter().any(|s|s.ship==m.ship){return Err(8);}self.ships.push(m);Ok(())}
    pub fn get(&self,h:Handle)->Result<&Meta,u32>{self.ships.iter().find(|s|s.ship==h).ok_or(8)}
    pub fn validate(&self,b:&[Body])->Result<(),u32>{if self.expected.is_some()||self.ships.len()!=b.len(){return Err(8);}for(i,s)in self.ships.iter().enumerate(){if !s.valid()||self.ships[..i].iter().any(|p|p.ship==s.ship)||!b.iter().any(|b|b.handle==s.ship){return Err(8);}}Ok(())}
    pub fn apply(&mut self,tag:u32,v:&[f64],b:&[Body])->Result<(),u32>{
        fn integer(n:f64)->Result<u32,u32>{if n.is_finite()&&n>=0.0&&n<=u32::MAX as f64&&n.fract()==0.0{Ok(n as u32)}else{Err(2)}}
        let used=match tag{186=>1,187=>5,188=>0,_=>return Err(2)};if v.len()!=22||v[used..].iter().any(|n|*n!=0.0){return Err(2);}
        match tag{186=>{if self.expected.is_some()||!self.ships.is_empty(){return Err(8);}self.expected=Some(integer(v[0])?as usize);},
            187=>{let count=self.expected.ok_or(8u32)?;let m=Meta{ship:Handle{slot:integer(v[0])?,generation:integer(v[1])?},sight_flat:v[2],sight_percent:v[3],weapon_repair:v[4]};
                if self.ships.len()>=count||!m.valid()||self.ships.iter().any(|s|s.ship==m.ship)||!b.iter().any(|b|b.handle==m.ship){return Err(8);}self.ships.push(m);},
            188=>{let count=self.expected.take().ok_or(8u32)?;if count!=self.ships.len(){return Err(8);}self.validate(b)?;},_=>unreachable!()}Ok(())
    }
}
