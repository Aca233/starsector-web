//! Real CombatVisibility, fleet EW, shared_flux_sink and vital station sweep.
//! Source/stage contracts: docs/rust-combat-scene-authority-plan-2026-10-09.md.
use crate::{ship_state::{self,ShipState},state::{Body,Handle},world_owner};

#[derive(Clone)]pub struct Meta{
    pub ship:Handle,pub station_module:bool,pub combat_module:bool,pub shared_flux:bool,
    pub ecm:f64,pub nav:f64,pub penalty_multiplier:f64,pub speed_percent:f64,
    pub dissipation:f64,pub hard_fraction:f64,
}
#[derive(Clone)]pub struct Entry{
    pub meta:Meta,pub module_bonus:f64,pub module_hard:f64,pub fleet_speed:f64,pub ecm_penalty:f64,
    pub public_visible:bool,
}
#[derive(Clone,Default)]pub struct Owned{pub entries:Vec<Entry>,pub expected:Option<usize>}
fn row(b:&[Body],h:Handle)->Result<usize,u32>{b.iter().position(|b|b.handle==h).ok_or(4)}
fn ship(b:&[Body],h:Handle)->Result<&ShipState,u32>{b[row(b,h)?].ship.as_ref().ok_or(8)}
fn int(n:f64)->Result<u32,u32>{if n.is_finite()&&n>=0.0&&n<=u32::MAX as f64&&n.fract()==0.0{Ok(n as u32)}else{Err(2)}}
fn pad(v:&[f64],n:usize)->Result<(),u32>{if v.len()!=22||v[n..].iter().any(|v|*v!=0.0){Err(2)}else{Ok(())}}
impl Meta{
    pub fn valid(&self)->bool{[self.ecm,self.nav,self.penalty_multiplier,self.speed_percent,self.dissipation,self.hard_fraction].iter().all(|v|v.is_finite())&&self.dissipation>=0.0}
}
impl Owned{
    pub fn entry(&self,h:Handle)->Result<&Entry,u32>{self.entries.iter().find(|e|e.meta.ship==h).ok_or(4)}
    pub fn entry_mut(&mut self,h:Handle)->Result<&mut Entry,u32>{self.entries.iter_mut().find(|e|e.meta.ship==h).ok_or(4)}
    pub fn validate(&self,b:&[Body])->Result<(),u32>{
        if self.expected.is_some()||self.entries.len()!=b.len(){return Err(8);}
        for(i,e)in self.entries.iter().enumerate(){if !e.meta.valid()||![e.module_bonus,e.module_hard,e.fleet_speed,e.ecm_penalty].iter().all(|v|v.is_finite())
            ||self.entries[..i].iter().any(|p|p.meta.ship==e.meta.ship){return Err(8);}let s=ship(b,e.meta.ship)?;
            if s.combat.as_ref().is_none_or(|c|c.query.is_none())||s.world.is_none()||s.engines.as_ref().is_none_or(|e|e.data[19]!=1.0){return Err(8);}}
        Ok(())
    }
    /// Generated craft and complete module trees receive one real source entry.
    /// The surrounding allocator transaction owns all other domain admissions.
    pub fn admit(&mut self,entry:Entry)->Result<(),u32>{
        if self.expected.is_some()||!entry.meta.valid()||![entry.module_bonus,entry.module_hard,entry.fleet_speed,entry.ecm_penalty].iter().all(|v|v.is_finite())
            ||self.entries.iter().any(|e|e.meta.ship==entry.meta.ship){return Err(8);}self.entries.push(entry);Ok(())
    }
    fn check_handles(&self,b:&[Body],handles:&[Handle])->Result<(),u32>{for(i,h)in handles.iter().enumerate(){if handles[..i].contains(h){return Err(8);}ship(b,*h)?;self.entry(*h)?;}Ok(())}
    /// CombatEngine846/847: actual public contact state and ordered fleet EW.
    /// Death uses flags here; HP<=0 is intentionally still observed before sweep.
    pub fn observe(&mut self,b:&mut[Body],active:&[Handle])->Result<(),u32>{
        self.validate(b)?;self.check_handles(b,active)?;
        let mut teams:Vec<(u32,f64,f64)>=Vec::new();
        for h in active{let s=ship(b,*h)?;let c=s.combat.as_ref().ok_or(8u32)?;let m=&self.entry(*h)?.meta;
            if s.flags&(ship_state::DEAD|ship_state::RETREATED)!=0||c.size==0||s.world.as_ref().ok_or(8u32)?.parent.is_some()||m.station_module{continue;}
            if let Some((_,ecm,nav))=teams.iter_mut().find(|(t,_,_)|*t==c.team){*ecm+=m.ecm;*nav+=m.nav;}else{teams.push((c.team,m.ecm,m.nav));}}
        for(_,ecm,_)in &mut teams{*ecm=ecm.max(0.0).trunc();}
        // Cover every resident team, including an inactive reserve's team, and
        // preserve installed spectator keys. Source visibility is public.
        let mut observer_teams=Vec::new();for body in b.iter(){let team=body.ship.as_ref().and_then(|s|s.combat.as_ref()).ok_or(8u32)?.team;if !observer_teams.contains(&team){observer_teams.push(team);}}
        for h in active{let r=row(b,*h)?;let s=b[r].ship.as_mut().ok_or(8u32)?;let c=s.combat.as_mut().ok_or(8u32)?;
            let visible=s.flags&(ship_state::DEAD|ship_state::RETREATED|ship_state::DOCKED)==0;let q=c.query.as_mut().ok_or(8u32)?;
            for team in &observer_teams{q.visible.entry(*team).or_insert(false);}
            q.expected_teams=q.visible.len();
            for(team,value)in &mut q.visible{*value=visible||*team==c.team;}
            let(_,own_ecm,own_nav)=teams.iter().find(|(t,_,_)|*t==c.team).copied().unwrap_or((c.team,0.0,0.0));
            let mut raw=0.0f64;for(t,other,_)in &teams{if *t!=c.team{let rate=if own_ecm>0.0&&*other>0.0{other/(own_ecm+other)}else{1.0};
                // JS Math.round is floor(x+.5), not Rust ties-away-from-zero.
                raw=raw.max((other.min(10.0)*rate+0.5).floor());}}
            let inactive=s.flags&(ship_state::DEAD|ship_state::RETREATED)!=0||c.size==0;
            let e=self.entry_mut(*h)?;e.public_visible=visible;e.fleet_speed=if inactive{0.0}else{own_nav.min(20.0)};
            e.ecm_penalty=if inactive{0.0}else{(raw*e.meta.penalty_multiplier).min(10.0).max(0.0)};
            c.attrs[18]=e.ecm_penalty;s.engines.as_mut().ok_or(8u32)?.motion[7]=e.meta.speed_percent+e.fleet_speed;
        }
        // Same-team contacts remain visible even when public contact is gone.
        // Do not conflate HP0, phase or absent active membership with visibility.
        for h in active{let r=row(b,*h)?;let c=b[r].ship.as_ref().ok_or(8u32)?.combat.as_ref().ok_or(8u32)?;
            let target=c.query.as_ref().ok_or(8u32)?.target;let observer=c.team;
            let visible=if let Some(target)=target{let t=ship(b,target)?;let tc=t.combat.as_ref().ok_or(8u32)?;
                tc.team==observer||tc.query.as_ref().ok_or(8u32)?.visible.get(&observer)==Some(&true)}else{true};
            if !visible{b[r].ship.as_mut().unwrap().combat.as_mut().unwrap().query.as_mut().unwrap().target=None;}}
        Ok(())
    }
    fn assembly(&self,b:&[Body],h:Handle,out:&mut Vec<Handle>,seen:&mut Vec<Handle>)->Result<(),u32>{
        if seen.contains(&h){return Err(8);}seen.push(h);out.push(h);let s=ship(b,h)?;let w=s.world.as_ref().ok_or(8u32)?;
        for child in &w.children{if ship(b,*child)?.world.as_ref().ok_or(8u32)?.parent!=Some(h){return Err(8);}self.entry(*child)?;self.assembly(b,*child,out,seen)?;}Ok(())
    }
    /// CombatEngine986–995: use capital insertion order and preorder children.
    /// Lost modules retain prior bookkeeping; only live children receive writes.
    pub fn shared_flux(&mut self,b:&[Body],capital:&[Handle])->Result<(),u32>{
        self.validate(b)?;self.check_handles(b,capital)?;
        for root in capital{if ship(b,*root)?.world.as_ref().ok_or(8u32)?.parent.is_some(){return Err(8);}let mut assembly=Vec::new();self.assembly(b,*root,&mut assembly,&mut Vec::new())?;
            for parent in assembly{if !self.entry(parent)?.meta.shared_flux{continue;}let children=&ship(b,parent)?.world.as_ref().ok_or(8u32)?.children;
                let mut live=Vec::new();let mut lost=0.0;let mut total=0.0;
                for child in children{let s=ship(b,*child)?;let m=&self.entry(*child)?.meta;let c=s.combat.as_ref().ok_or(8u32)?;
                    if !m.combat_module||c.query.as_ref().ok_or(8u32)?.vast{continue;}
                    if s.flags&ship_state::DEAD!=0||s.armor.as_ref().ok_or(8u32)?.data[14]<=0.0{lost+=m.dissipation*0.5;}
                    else{live.push(*child);total+=m.dissipation;}}
                for child in live{let e=self.entry_mut(child)?;e.module_bonus=if total>0.0{lost*e.meta.dissipation/total}else{0.0};
                    e.module_hard=e.module_bonus/(e.meta.dissipation+e.module_bonus).max(1.0)*0.2;}
            }
        }Ok(())
    }
    /// Source Ship.advanceHullModFlux: these writes occur on that ship's prepare,
    /// after stage-start AI has observed the previous prepared effective value.
    pub fn prepare_ship(&self,b:&mut[Body],r:usize)->Result<(),u32>{
        let h=b.get(r).ok_or(4u32)?.handle;let e=self.entry(h)?;let s=b[r].ship.as_mut().ok_or(8u32)?;
        if s.flags&(ship_state::DEAD|ship_state::RETREATED)!=0||s.armor.as_ref().ok_or(8u32)?.data[14]<=0.0{return Ok(());}
        if let Some(parent)=s.world.as_ref().ok_or(8u32)?.parent{if self.entry(parent)?.meta.shared_flux{s.flux.base=e.meta.dissipation+e.module_bonus;}}
        s.hard_fraction=e.meta.hard_fraction+e.module_hard;Ok(())
    }
    /// Called separately for each capital root, after the previous root's real
    /// synchronous death/explosion host has finished. Never cache this verdict.
    pub fn is_doomed(&self,b:&[Body],world:&world_owner::Owned,root:Handle)->Result<bool,u32>{
        self.validate(b)?;let s=ship(b,root)?;let r=row(b,root)?;self.entry(root)?;
        if s.world.as_ref().ok_or(8u32)?.parent.is_some(){return Err(8);}
        if s.flags&ship_state::DEAD!=0||!world.terrain.meta(crate::terrain_owner::identity(&b[r]))?.station||s.world.as_ref().unwrap().children.is_empty(){return Ok(false);}
        let mut assembly=Vec::new();self.assembly(b,root,&mut assembly,&mut Vec::new())?;let mut vital=0;
        for child in assembly.into_iter().skip(1){let m=&self.entry(child)?.meta;let s=ship(b,child)?;
            if !m.combat_module||s.combat.as_ref().ok_or(8u32)?.query.as_ref().ok_or(8u32)?.vast{continue;}
            vital+=1;if s.flags&ship_state::DEAD==0&&s.armor.as_ref().ok_or(8u32)?.data[14]>0.0{return Ok(false);}}
        Ok(vital>0)
    }
    /// Read-only candidate snapshot for inspection. Production sweeps must call
    /// is_doomed per root so a preceding root's blast can change later verdicts.
    pub fn doomed(&self,b:&[Body],world:&world_owner::Owned,capital:&[Handle])->Result<Vec<Handle>,u32>{
        self.validate(b)?;self.check_handles(b,capital)?;let mut out=Vec::new();
        for root in capital{if self.is_doomed(b,world,*root)?{out.push(*root);}}Ok(out)
    }
}
/// Startup-only complete fixed-width installation. Root owns timing and rollback.
pub fn apply(tag:u32,v:&[f64],owned:&mut Option<Owned>,b:&[Body],own:usize)->Result<(),u32>{
    match tag{
        176=>{pad(v,2)?;if v[0]!=1.0||owned.is_some(){return Err(8);}let expected=int(v[1])?as usize;if expected!=b.len(){return Err(8);}*owned=Some(Owned{entries:Vec::new(),expected:Some(expected)});}
        177=>{pad(v,12)?;let o=owned.as_mut().ok_or(8u32)?;let count=o.expected.ok_or(8u32)?;let h=b.get(own).ok_or(4u32)?.handle;let flags=int(v[1])?;
            if int(v[0])?as usize!=o.entries.len()||o.entries.len()>=count||o.entries.iter().any(|e|e.meta.ship==h)||flags>7||v[11]!=0.0{return Err(8);}
            let e=Entry{meta:Meta{ship:h,station_module:flags&1!=0,combat_module:flags&2!=0,shared_flux:flags&4!=0,
                ecm:v[2],nav:v[3],penalty_multiplier:v[4],speed_percent:v[5],dissipation:v[6],hard_fraction:v[7]},
                module_bonus:v[8],module_hard:v[9],fleet_speed:0.0,ecm_penalty:0.0,public_visible:v[10]==1.0};
            if !e.meta.valid()||![v[8],v[9]].iter().all(|v|v.is_finite())||!matches!(v[10],0.0|1.0){return Err(2);}o.entries.push(e);}
        178=>{pad(v,0)?;let o=owned.as_mut().ok_or(8u32)?;if o.expected.take()!=Some(o.entries.len()){return Err(8);}o.validate(b)?;}
        _=>return Err(2)
    }Ok(())
}
