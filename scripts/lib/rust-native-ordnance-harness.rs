// Oracle entry points operate on the actual Core, world and Ordnance.
pub mod ordnance_oracle{
 use super::*;
 impl Core{
  pub fn ordnance_fire(&mut self,id:u32,dt:f64)->Result<(),u32>{
   let mut bodies:Vec<_>=self.roster.iter().map(|h|self.slots[h.slot as usize].body.as_ref().unwrap().clone()).collect();
   let row=bodies.iter().position(|b|b.id==id).ok_or(4u32)?;let h=bodies[row].handle;
   let s=bodies[row].ship.as_mut().ok_or(8u32)?;s.clock[5]=dt;let weapons=s.weapons.as_mut().ok_or(8u32)?;weapons.data[20]=1.0;for mount in &mut weapons.mounts{mount.data[19]=dt;}
   for f in &mut s.combat.as_mut().ok_or(8u32)?.fire{f.input.requested=true;f.input.trigger_held=true;f.input.disabled=false;f.input.system_allows=true;f.input.suspended=false;f.input.recheck_flux_budget=false;}
   let w=self.world.as_mut().ok_or(8u32)?;w.visual.begin_frame([bodies[0].motion[0],bodies[0].motion[1]])?;
   self.ordnance.fire_selected_visual(&mut bodies,&self.specs,&[(h,None)],&mut self.random,&mut self.notices,&mut w.visual,&mut self.visual_random)?;
   for b in bodies{let slot=b.handle.slot as usize;self.slots[slot].body=Some(b);}Ok(())
  }
  pub fn ordnance_motion(&mut self,dt:f64)->Result<(),u32>{
   let mut bodies:Vec<_>=self.roster.iter().map(|h|self.slots[h.slot as usize].body.as_ref().unwrap().clone()).collect();let w=self.world.as_mut().ok_or(8u32)?;
   w.visual.begin_frame([bodies[0].motion[0],bodies[0].motion[1]])?;
   self.ordnance.advance_projectiles(&mut bodies,&self.specs,Some(w),dt,&mut self.random,&mut self.visual_random,&mut self.notices)?;
   self.ordnance.advance_beams(&mut bodies,&self.specs,Some(w),dt,&mut self.random,&mut self.visual_random,&mut self.notices)?;
   for b in bodies{let slot=b.handle.slot as usize;self.slots[slot].body=Some(b);}Ok(())
  }
  pub fn ordnance_words(&mut self)->Result<(),u32>{let b=self.roster.iter().map(|h|self.slots[h.slot as usize].body.as_ref().unwrap().clone()).collect::<Vec<_>>();
   self.scene_output=crate::ordnance_publication::words(&self.ordnance,&b,self.world.as_ref().ok_or(8u32)?)?;Ok(())}
  pub fn ordnance_reset_mounts(&mut self)->Result<(),u32>{for h in &self.roster{let s=self.slots[h.slot as usize].body.as_mut().ok_or(8u32)?.ship.as_mut().ok_or(8u32)?;for m in &mut s.weapons.as_mut().ok_or(8u32)?.mounts{for i in [16,20,21,23,24]{m.data[i]=0.0;}}}Ok(())}
  pub fn ordnance_generated(&mut self,kind:u32)->Result<(),u32>{let mut b=self.roster.iter().map(|h|self.slots[h.slot as usize].body.as_ref().unwrap().clone()).collect::<Vec<_>>();let w=self.world.as_mut().ok_or(8u32)?;
   if kind==0{let s=b[0].ship.as_ref().ok_or(8u32)?;let muzzle=s.world.as_ref().ok_or(8u32)?.muzzle.ok_or(8u32)?;let p=crate::contact::rotate(muzzle,b[0].motion[4]);let spawn=crate::system_world::SpawnYamato{source:crate::system_world::Identity{slot:b[0].handle.slot,generation:b[0].handle.generation},position:[b[0].motion[0]+p[0],b[0].motion[1]+p[1]],velocity:[b[0].motion[2],b[0].motion[3]],facing:b[0].motion[4]};
    let mut host=crate::system_owner::Host{bodies:&mut b,specs:&self.specs,ordnance:&mut self.ordnance,random:&mut self.random,events:&mut self.notices,asteroids:None};crate::system_world::Host::spawn_yamato(&mut host,spawn).map_err(crate::system_owner::error)?;
   }else if kind==1{let p=[b[0].motion[0]+2000.0,b[0].motion[1]+2000.0];crate::aux_runtime::deploy(w,&mut b,&mut self.ordnance,&self.specs,0,p,1000.0,&mut self.random,&mut self.visual_random,&mut self.notices)?;
   }else if kind==2{let h=b[0].handle;let pose=b[0].motion;let point=[pose[0]+pose[4].cos()*1500.0,pose[1]+pose[4].sin()*1500.0];
    let s=b[0].ship.as_mut().ok_or(8u32)?;s.world.as_mut().ok_or(8u32)?.aim=point;s.combat.as_mut().ok_or(8u32)?.query.as_mut().ok_or(8u32)?.aim=point;
    let sid=s.systems.iter().find(|x|s.world.as_ref().unwrap().metas.get(&x.id).is_some_and(|m|m.kind==crate::ship_effects::Kind::Yamato)).ok_or(8u32)?.id;
    let mut slot=crate::system_owner::slot(s,h,sid,&self.specs)?;
    {let host=crate::system_owner::Host{bodies:&mut b,specs:&self.specs,ordnance:&mut self.ordnance,random:&mut self.random,events:&mut self.notices,asteroids:None};
     slot.activate(&host,crate::ship_effects::ActivationInput{point,origin:[pose[0],pose[1]],velocity:[pose[2],pose[3]],facing:pose[4],target:None,gravity_anchor_serial:None}).map_err(crate::system_owner::error)?;}
    slot.update(2.0);crate::system_owner::restore(b[0].ship.as_mut().unwrap(),slot)?;
    crate::gravity_runtime::dispatch(w,&mut b,&mut self.ordnance,&self.specs,0.0,&mut self.random,&mut self.visual_random,&mut self.notices)?;
   }else{return Err(2);}
   for body in b{let slot=body.handle.slot as usize;self.slots[slot].body=Some(body);}Ok(())}
 }
}
#[no_mangle]pub extern "C" fn test_fire(id:u32,owner:u32,dt:f64)->u32{REGISTRY.with_borrow_mut(|r|r.cores.get_mut(&id).ok_or(1u32).and_then(|c|c.ordnance_fire(owner,dt)).map_or_else(|e|e,|_|0))}
#[no_mangle]pub extern "C" fn test_motion(id:u32,dt:f64)->u32{REGISTRY.with_borrow_mut(|r|r.cores.get_mut(&id).ok_or(1u32).and_then(|c|c.ordnance_motion(dt)).map_or_else(|e|e,|_|0))}
#[no_mangle]pub extern "C" fn test_ordnance(id:u32)->u32{REGISTRY.with_borrow_mut(|r|r.cores.get_mut(&id).and_then(|c|c.ordnance_words().ok().map(|_|c.scene_output.as_ptr()as u32)).unwrap_or(0))}
#[no_mangle]pub extern "C" fn test_ordnance_len(id:u32)->u32{REGISTRY.with_borrow(|r|r.cores.get(&id).map_or(0,|c|c.scene_output.len()as u32))}
#[no_mangle]pub extern "C" fn test_reset_mounts(id:u32)->u32{REGISTRY.with_borrow_mut(|r|r.cores.get_mut(&id).ok_or(1u32).and_then(|c|c.ordnance_reset_mounts()).map_or_else(|e|e,|_|0))}
#[no_mangle]pub extern "C" fn test_generated(id:u32,kind:u32)->u32{REGISTRY.with_borrow_mut(|r|r.cores.get_mut(&id).ok_or(1u32).and_then(|c|c.ordnance_generated(kind)).map_or_else(|e|e,|_|0))}
