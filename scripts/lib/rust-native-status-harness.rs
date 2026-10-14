// Real compiler commands install real Core bodies; these child-module oracle
// accessors inspect the same production state, never a substitute authority.
pub mod status_oracle{
 use super::*;
 impl Core{
  pub fn status_fixture(&mut self,mode:u32)->Result<(),u32>{
   for h in &self.roster{let b=self.slots[h.slot as usize].body.as_mut().ok_or(8u32)?;let s=b.ship.as_mut().ok_or(8u32)?;s.flags&=!(ship_state::DEAD|ship_state::DOCKED);s.flux.overloaded=false;s.flux.venting=false;
    let c=s.combat.as_mut().ok_or(8u32)?;c.readiness.as_mut().ok_or(8u32)?.state.just_shield_malfunction=false;
    if mode==0{if b.id==1{s.flux.overloaded=true;}if b.id==2{s.flux.venting=true;}}
    if mode==1{if b.id==1{c.readiness.as_mut().unwrap().state.just_shield_malfunction=true;s.flux.overloaded=true;}}
    let w=s.weapons.as_mut().ok_or(8u32)?;let e=s.engines.as_mut().ok_or(8u32)?;
    if mode<=2{if let Some(m)=s.components.first_mut(){m.data[8]=if mode==1{1.0}else{0.0};w.disabled.push(m.data[0]as u32);}if let Some(m)=s.components.get(1){w.repaired.push(m.data[0]as u32);}if !e.engines.is_empty(){e.just_disabled.push(0);}e.data[7]=1.0;e.data[8]=1.0;}
    if mode==2{if b.id==1{s.flags|=ship_state::DEAD;}if b.id==2{s.flags|=ship_state::DOCKED;}}
   }self.notices.clear();if mode<=1{let b=self.slots[self.roster[0].slot as usize].body.as_ref().unwrap();self.notices.extend([(b.id,b.handle,ship_state::Notice{system:0,kind:ship_state::CRITICAL_ARMOR,value:17.0,detail:[9.0,13.0]}),(b.id,b.handle,ship_state::Notice{system:0,kind:ship_state::CRITICAL_HULL,value:5.0,detail:[9.0,13.0]})]);}Ok(())
  }
  pub fn status_run(&mut self,capitals:&[Handle])->Result<(),u32>{let mut bodies:Vec<_>=self.roster.iter().map(|h|self.slots[h.slot as usize].body.as_ref().unwrap().clone()).collect();let w=self.world.as_mut().ok_or(8u32)?;w.visual.begin_frame([bodies[0].motion[0],bodies[0].motion[1]])?;
   let all=self.roster.clone();let radio=crate::combat_visuals::status(w,&mut bodies,capitals,&all,all[0],&self.specs,&self.notices,0.5,&mut self.visual_random)?;self.notices.clear();
   self.scene_output.clear();self.scene_output.push(radio.len()as f64);for r in radio{self.scene_output.push(r.id);for s in [&r.sender,&r.faction,&r.text]{self.scene_output.push(s.encode_utf16().count()as f64);self.scene_output.extend(s.encode_utf16().map(|v|v as f64));}self.scene_output.extend(r.color.map(|n|n as f64));self.scene_output.push(r.time);}
   let floats=crate::world_wire::words(w,&bodies,&self.ordnance);self.scene_output.push(floats.len()as f64);self.scene_output.extend(floats);let fx=crate::visual_wire::words(&w.visual,&bodies)?;self.scene_output.push(fx.len()as f64);self.scene_output.extend(fx);self.scene_output.extend([self.visual_random.seed as f64,self.visual_random.cursor,self.visual_random.ids]);
   for b in bodies{let slot=b.handle.slot as usize;self.slots[slot].body=Some(b);}Ok(())
  }
 }
 pub fn execute(core:&mut Core,mode:u32,capitals:&[Handle])->Result<(),u32>{if mode<3{core.status_fixture(mode)?;}if mode==3{let w=core.world.as_mut().ok_or(8u32)?;w.visual.ack_audio(w.visual.audio_sequence)?;}core.status_run(capitals)}
}
#[no_mangle]pub extern "C" fn test_status(id:u32,mode:u32)->u32{REGISTRY.with_borrow_mut(|r|{let Some(c)=r.cores.get_mut(&id)else{return 1;};let caps=c.input.chunks_exact(2).map(|a|state::Handle{slot:a[0]as u32,generation:a[1]as u32}).collect::<Vec<_>>();state::status_oracle::execute(c,mode,&caps).map_or_else(|e|e,|_|0)})}
#[no_mangle]pub extern "C" fn test_status_output(id:u32)->u32{REGISTRY.with_borrow(|r|r.cores.get(&id).map_or(0,|c|c.scene_output.as_ptr()as u32))}
#[no_mangle]pub extern "C" fn test_status_words(id:u32)->u32{REGISTRY.with_borrow(|r|r.cores.get(&id).map_or(0,|c|c.scene_output.len()as u32))}
