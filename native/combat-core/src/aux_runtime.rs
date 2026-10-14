//! Mine/Stealth barriers inside the real shared authority transaction.
use crate::{aux_world as a,battle::Ordnance,explosion_effects::Identity,lifecycle::Spec,
    random::Random,ship_state::{self,Notice},state::{Body,Handle},world_owner as w};
use std::collections::BTreeMap;
struct Services;
impl a::Services for Services{
    fn projectile_spawned(&mut self,world:&mut w::Owned,p:&crate::projectile::Projectile)->Result<(),u32>{if let Some(g)=&mut world.gravity{
        g.owner.projectile_spawned(p.serial).map_err(crate::gravity_runtime::error)?;
        let m=g.owner.projectiles.iter_mut().find(|m|m.identity.slot as f64==p.serial).ok_or(8u32)?;m.mine=p.delivery.is_mine;
    }Ok(())}
    fn projectile_retired(&mut self,world:&mut w::Owned,p:&crate::projectile::Projectile)->Result<(),u32>{if let Some(g)=&mut world.gravity{
        g.owner.projectile_retired(crate::system_world::Identity{slot:p.serial as u32,generation:1});
    }Ok(())}
    fn phased(&self,bodies:&[Body],world:&w::Owned,specs:&BTreeMap<u32,Spec>,id:Identity)->Result<bool,u32>{
        let r=bodies.iter().position(|b|w::identity(b)==id).ok_or(4u32)?;
        crate::phase_runtime::world_phased(world,bodies,r,specs)
    }
}
fn registered(world:&mut w::Owned,ordnance:&Ordnance)->Result<(),u32>{
    if let Some(g)=&mut world.gravity{
        g.owner.reconcile_projectiles(ordnance).map_err(crate::gravity_runtime::error)?;
    }Ok(())
}
pub fn complete(aux:&a::Owned,bodies:&[Body],ordnance:&Ordnance)->Result<(),u32>{
    if !aux.valid()||aux.specs.len()!=2||bodies.len()!=aux.ships.len()||aux.hooks.len()!=bodies.len(){return Err(8);}
    aux.validate(bodies,ordnance)?;
    for b in bodies{let m=aux.ships.iter().find(|m|m.handle==b.handle&&m.identity==w::identity(b)).ok_or(8u32)?;
        let count=aux.hooks.iter().filter(|(h,_)|*h==b.handle).collect::<Vec<_>>();
        if count.len()!=1||count[0].1>2||m.stealth.is_some()!=(count[0].1>0){return Err(8);}
        let s=b.ship.as_ref().ok_or(8u32)?;if m.travel_systems.iter().enumerate().any(|(i,id)|m.travel_systems[..i].contains(id)||!s.systems.iter().any(|s|s.id==*id)){return Err(8);}
    }Ok(())
}
pub fn status(world:&mut w::Owned,bodies:&mut[Body],ordnance:&mut Ordnance,specs:&BTreeMap<u32,Spec>,row:usize,dt:f64,random:&mut Random,visual:&mut Random,events:&mut Vec<(u32,Handle,Notice)>)->Result<(),u32>{
    let Some(mut aux)=world.aux.take()else{return Ok(());};let result=(||{let b=bodies.get(row).ok_or(4u32)?;
        if b.ship.as_ref().ok_or(8u32)?.flags&(ship_state::DEAD|ship_state::RETREATED|ship_state::DOCKED)!=0{return Ok(());}
        let source=w::identity(b);let count=aux.hooks.iter().find(|(h,_)|*h==b.handle).ok_or(8u32)?.1;
        let mut services=Services;{
            let mut host=a::Host{bodies,specs,ordnance,world,owned:&mut aux,services:&mut services,events};
            for _ in 0..count{host.stealth(source,dt,random,visual)?;}
        }registered(world,ordnance)
    })();world.aux=Some(aux);result
}
pub fn advance(world:&mut w::Owned,bodies:&mut[Body],ordnance:&mut Ordnance,specs:&BTreeMap<u32,Spec>,dt:f64,random:&mut Random,visual:&mut Random,events:&mut Vec<(u32,Handle,Notice)>)->Result<(),u32>{
    let Some(mut aux)=world.aux.take()else{return Ok(());};let mut services=Services;
    let result=(||{{let mut host=a::Host{bodies,specs,ordnance,world,owned:&mut aux,services:&mut services,events};host.advance(dt,random,visual)?;}
        registered(world,ordnance)?;complete(&aux,bodies,ordnance)
    })();world.aux=Some(aux);result
}
pub fn deploy(world:&mut w::Owned,bodies:&mut[Body],ordnance:&mut Ordnance,specs:&BTreeMap<u32,Spec>,row:usize,point:[f64;2],range:f64,random:&mut Random,visual:&mut Random,events:&mut Vec<(u32,Handle,Notice)>)->Result<(),u32>{
    let source=w::identity(bodies.get(row).ok_or(4u32)?);let Some(mut aux)=world.aux.take()else{return Err(8);};let mut services=Services;
    let result=(||{{let mut host=a::Host{bodies,specs,ordnance,world,owned:&mut aux,services:&mut services,events};host.deploy(point,source,range,random,visual)?;}
        registered(world,ordnance)
    })();world.aux=Some(aux);result
}
