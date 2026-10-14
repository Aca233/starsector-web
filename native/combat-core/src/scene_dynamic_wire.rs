//! One bounded roster payload, complete within the surrounding Core transaction.
use crate::flight_static_wire::{self as json,Value};
#[derive(Default)]pub struct Draft{expected:Option<usize>,units:Vec<u16>}
fn integer(v:f64)->Result<usize,u32>{Ok(json::integer(v)? as usize)}
fn pad(v:&[f64],used:usize)->Result<(),u32>{if v.len()!=22||v[used..].iter().any(|n|*n!=0.0){Err(2)}else{Ok(())}}
impl Draft{
    pub fn apply(&mut self,tag:u32,v:&[f64])->Result<Option<Value>,u32>{match tag{
        198=>{pad(v,2)?;let count=integer(v[1])?;if v[0]!=1.0||count==0||count>16_000_000||self.expected.is_some(){return Err(2);}self.expected=Some(count);self.units.clear();},
        199=>{let at=integer(v[0])?;let count=integer(v[1])?;if count==0||count>20{return Err(2);}pad(v,2+count)?;
            if at!=self.units.len()||at+count>self.expected.ok_or(8u32)?{return Err(8);}for n in &v[2..2+count]{let n=integer(*n)?;if n>65535{return Err(2);}self.units.push(n as u16);}},
        200=>{pad(v,0)?;if self.expected!=Some(self.units.len()){return Err(8);}let value=json::parse(&self.units)?;self.expected=None;self.units.clear();return Ok(Some(value));},
        _=>return Err(2)
    }Ok(None)}
    pub fn complete(&self)->bool{self.expected.is_none()&&self.units.is_empty()}
}
