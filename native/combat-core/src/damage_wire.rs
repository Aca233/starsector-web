//! Domain diagnostic operations use the actual resident hull listeners too.
use crate::{lifecycle::Spec,phase_runtime,random::Random,ship_state::{self,Notice},state::{Body,Handle},world_owner};
use std::collections::BTreeMap;
fn int(v:f64)->Result<u32,u32>{if v.is_finite()&&v>=0.0&&v<=u32::MAX as f64&&v.fract()==0.0{Ok(v as u32)}else{Err(2)}}
fn flag(v:f64)->bool{v==0.0||v==1.0}
pub fn apply(tag:u32,data:&[f64],world:&mut world_owner::Owned,bodies:&mut[Body],specs:&BTreeMap<u32,Spec>,r:usize,source:[f64;2],random:&mut Random,visual:&mut Random,events:&mut Vec<(u32,Handle,Notice)>)->Result<(),u32>{
    phase_runtime::with_ship(world,bodies,r,specs,events,|s,h,n|{
        match tag{
            26=>{if int(data[3])?>3||![4,6,7].iter().all(|i|flag(data[*i])){return Err(2);}
                let armor=s.armor.as_mut().ok_or(8u32)?;let mut repair=s.world.as_mut().and_then(|w|w.repair.as_mut());
                let result=armor.impact_with_damage(data,visual,&mut s.shield,n,|d|{if let Some(r)=&mut repair{r.on_damage(d);}});
                for(kind,value)in[(ship_state::ARMOR_DAMAGE,result[0]),(ship_state::ARMOR_HULL,result[1]),(ship_state::ARMOR_RESIDUAL,result[2])]{if !value.is_finite(){return Err(7);}n.push(Notice{system:0,kind,value,detail:[0.0;2]});}
                if data[7]==1.0{s.apply_hull_with(result[1],n,h)?;}},
            31=>{s.apply_hull_with(data[0],n,h)?;},
            37=>{if int(data[0])?!=2||!flag(data[2]){return Err(2);}let context=s.engine_context();let e=s.engines.as_mut().ok_or(8u32)?;
                if !e.complete(){return Err(8);}let index=int(data[1])? as usize;if index>=e.engines.len(){return Err(8);}
                let newly=e.malfunction(index,context,data[2]==1.0);let point=[e.engines[index].data[1],e.engines[index].data[2]];
                n.push(Notice{system:0,kind:ship_state::ENGINE_RESULT,value:newly as u32 as f64,detail:[index as f64,data[2]]});s.critical_damage_with(point,random,visual,n,h)?;},
            40=>{if int(data[3])?>3||![4,6,7].iter().all(|i|flag(data[*i])){return Err(2);}
                let result=s.armor_impact_with(data,visual,n,h)?;s.propagate([data[0],data[1]],[result[0],result[1]],data[8],source,random,n)?;},
            47=>{if s.weapons.as_ref().is_none_or(|w|!w.complete())||s.armor.is_none(){return Err(8);}if !flag(data[1]){return Err(2);}
                let index=s.components.iter().position(|c|c.data[0]==data[0]).ok_or(8u32)?;let newly=s.disable_weapon(index,data[1]==1.0,random,n);
                if data[1]==1.0{s.weapons.as_mut().unwrap().finalize(index);}n.push(Notice{system:0,kind:ship_state::COMPONENT_RESULT,value:newly as u32 as f64,detail:[data[0],data[1]]});
                let c=&s.components[index].data;let point=[c[3],c[4]];s.critical_damage_with(point,random,visual,n,h)?;},
            _=>return Err(2)
        }Ok(())
    })
}
