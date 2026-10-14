//! Private candidate construction only; never a running-world import API.
use crate::{ship_effects as e,ship_state::ShipState,state::Handle};
use std::collections::{BTreeMap,BTreeSet};
#[derive(Clone)]
pub struct Initial{pub handle:Handle,components:BTreeSet<u32>,engines:BTreeSet<u32>,runtime:Vec<(u32,u64)>,
    expected:[usize;3],controller:bool,readiness:bool,pub complete:bool,armor:Option<(usize,f64,Vec<f32>)>,armor_finished:bool}
fn int(v:f64)->Result<u32,u32>{if v.is_finite()&&v>=0.0&&v<=u32::MAX as f64&&v.fract()==0.0{Ok(v as u32)}else{Err(2)}}
fn flag(v:f64)->Result<bool,u32>{match v{0.0=>Ok(false),1.0=>Ok(true),_=>Err(2)}}
fn padding(r:&[f64],start:usize)->Result<(),u32>{if r[start..].iter().any(|v|*v!=0.0){Err(2)}else{Ok(())}}
fn tracker(r:&[f64])->Result<(),u32>{if r.len()!=5||r[..4].iter().any(|v|!v.is_finite()||*v<0.0)||r[0]<=0.0||r[2]<=0.0{return Err(2);}flag(r[4])?;Ok(())}
pub fn apply(tag:u32,r:&[f64],id:u32,h:Handle,s:&mut ShipState,installed:&mut BTreeMap<u32,Initial>)->Result<(),u32>{
    if tag==110{padding(r,3)?;if installed.contains_key(&id){return Err(8);}
        let expected=[int(r[0])? as usize,int(r[1])? as usize,int(r[2])? as usize];
        if expected[0]!=s.components.len()||expected[1]!=s.engines.as_ref().ok_or(8u32)?.engines.len()
            ||s.combat.as_ref().and_then(|c|c.readiness.as_ref()).is_none()||s.world.is_none(){return Err(8);}
        s.world.as_mut().unwrap().runtime.clear();installed.insert(id,Initial{handle:h,components:BTreeSet::new(),engines:BTreeSet::new(),runtime:Vec::new(),expected,controller:false,readiness:false,complete:false,armor:None,armor_finished:false});return Ok(());
    }
    let init=installed.get_mut(&id).ok_or(8u32)?;if init.handle!=h||init.complete{return Err(8);}
    match tag{
        179=>{padding(r,2)?;let count=int(r[0])?as usize;let dirty=r[1];if !dirty.is_finite()||dirty<0.0||dirty.fract()!=0.0||dirty>9_007_199_254_740_991.0{return Err(2);}if init.armor.is_some()||count!=s.armor.as_ref().ok_or(8u32)?.cells.len(){return Err(8);}init.armor=Some((count,dirty,Vec::new()));},
        180=>{let at=int(r[0])?as usize;let count=int(r[1])?as usize;if count==0||count>20{return Err(2);}padding(r,2+count)?;if init.armor_finished{return Err(8);}let(expected,_,values)=init.armor.as_mut().ok_or(8u32)?;if at!=values.len()||at+count>*expected||r[2..2+count].iter().any(|n|!n.is_finite()||*n<0.0||!(*n as f32).is_finite()){return Err(8);}values.extend(r[2..2+count].iter().map(|n|*n as f32));},
        181=>{padding(r,0)?;let(expected,dirty,values)=init.armor.as_ref().ok_or(8u32)?;if init.armor_finished||values.len()!=*expected{return Err(8);}let a=s.armor.as_mut().ok_or(8u32)?;a.cells.clone_from(values);a.data[12]=*dirty;init.armor_finished=true;},
        111=>{padding(r,13)?;let cid=int(r[0])?;if !init.components.insert(cid){return Err(8);}
            let c=s.components.iter_mut().find(|c|c.data[0]==cid as f64).ok_or(4u32)?;
            let disabled=flag(r[3])?;let permanent=flag(r[4])?;let present=flag(r[7])?;
            if r[1]<0.0||r[2]<=0.0||r[1]>r[2]||r[5]<0.0||r[6]<0.0||permanent&&!disabled
                ||(!r[6].is_finite()&&!(permanent&&r[6]==f64::INFINITY)){return Err(2);}
            if present{tracker(&r[8..13])?;}else if r[8..13].iter().any(|v|*v!=0.0){return Err(2);}
            c.data[5..11].copy_from_slice(&r[1..7]);c.data[11]=r[7];c.data[12..17].copy_from_slice(&r[8..13]);},
        112=>{padding(r,18)?;let index=int(r[0])?;if !init.engines.insert(index){return Err(8);}
            let c=s.engines.as_mut().ok_or(8u32)?;let d=&mut c.engines.get_mut(index as usize).ok_or(4u32)?.data;
            let disabled=flag(r[3])?;let permanent=flag(r[4])?;tracker(&r[5..10])?;flag(r[12])?;flag(r[13])?;
            if r[1]<0.0||r[2]<=0.0||r[1]>r[2]||r[10]<0.0||r[10]>1.0||r[11].abs()>1.0||permanent&&!disabled{return Err(2);}
            d[10..14].copy_from_slice(&r[1..5]);d[14..19].copy_from_slice(&r[5..10]);d[19..27].copy_from_slice(&r[10..18]);},
        113=>{padding(r,7)?;if init.controller{return Err(8);}if int(r[0])?>2||r[1]<0.0||!(0.0..=1.0).contains(&r[2])||r[3]<0.0||r[4]<0.0{return Err(2);}flag(r[5])?;flag(r[6])?;
            let c=s.engines.as_mut().ok_or(8u32)?;c.data[4..7].copy_from_slice(&r[..3]);c.data[10..14].copy_from_slice(&r[3..7]);init.controller=true;},
        114=>{padding(r,7)?;if init.readiness{return Err(8);}if !(0.0..=1.0).contains(&r[0])||r[1]!=-1.0&&!(0.0..=1.0).contains(&r[1])||r[2]<0.0||r[3]<0.0||r[4]<=0.0||r[6]<0.0{return Err(2);}let elapsed=flag(r[5])?;
            let owned=s.combat.as_mut().and_then(|c|c.readiness.as_mut()).ok_or(8u32)?;let v=&mut owned.state;
            if v.deployment_sequence.is_some(){return Err(8);}v.current_cr=r[0];v.cr_at_deployment=if r[1]<0.0{None}else{Some(r[1])};v.peak_performance_remaining=r[2];v.shield_timer=r[3];v.shield_interval=r[4];v.shield_interval_elapsed=elapsed;
            s.shield.as_mut().ok_or(8u32)?.data[28]=r[6];init.readiness=true;},
        115=>{padding(r,2)?;let key=int(r[0])?;if !matches!(key,1|0xfffc0001|0xfffc0002|0xfffc0003|0xfffc0004)||init.runtime.iter().any(|(k,_)|*k==key)
                ||r[1]<0.0||r[1].fract()!=0.0||r[1]>((1_u64<<e::WIDTH)-1)as f64{return Err(2);}
            init.runtime.push((key,r[1]as u64));s.world.as_mut().ok_or(8u32)?.runtime.push((key,e::Modifiers::default()));},
        116=>{padding(r,3)?;let key=int(r[0])?;let field=int(r[1])? as usize;if field>=e::WIDTH{return Err(2);}
            let expected=init.runtime.iter().find(|(k,_)|*k==key).ok_or(8u32)?.1;if expected&(1_u64<<field)==0{return Err(8);}
            let m=&mut s.world.as_mut().ok_or(8u32)?.runtime.iter_mut().find(|(k,_)|*k==key).ok_or(8u32)?.1;
            if m.field(field).is_some(){return Err(8);}m.set(field,r[2]);},
        117=>{padding(r,0)?;if init.components.len()!=init.expected[0]||init.engines.len()!=init.expected[1]||init.runtime.len()!=init.expected[2]||!init.controller||!init.readiness||init.armor.is_some()&&!init.armor_finished{return Err(8);}
            let w=s.world.as_ref().ok_or(8u32)?;for(key,mask)in &init.runtime{if w.runtime.iter().find(|(k,_)|k==key).ok_or(8u32)?.1.defined_mask()!=*mask{return Err(8);}}
            if !s.valid(){return Err(8);}init.complete=true;},
        _=>return Err(2)
    }Ok(())
}
