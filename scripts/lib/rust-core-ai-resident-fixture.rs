// Included INSIDE the actual state module by the isolated joint harness.
// All bodies, specs, world, ordnance, effects, RNGs and rollback are actual Core.
struct AIReader<'a>{v:&'a[f64],at:usize}
impl AIReader<'_>{
    fn n(&mut self)->Result<f64,u32>{let n=*self.v.get(self.at).ok_or(2u32)?;self.at+=1;Ok(n)}
    fn int(&mut self)->Result<u32,u32>{integer(self.n()?).ok_or(2)}
    fn flag(&mut self)->Result<bool,u32>{let n=self.n()?;if !boolean(n){return Err(2);}Ok(n==1.0)}
    fn string(&mut self)->Result<String,u32>{let count=self.int()?as usize;if count>10000{return Err(2);}let words=(0..count).map(|_|self.int().and_then(|n|u16::try_from(n).map_err(|_|2))).collect::<Result<Vec<_>,_>>()?;String::from_utf16(&words).map_err(|_|2)}
    fn handle(&mut self)->Result<crate::tactical_ai::Identity,u32>{crate::ai_resident::identity(Handle{slot:self.int()?,generation:self.int()?}).map_err(|_|4)}
    fn option_handle(&mut self)->Result<Option<crate::tactical_ai::Identity>,u32>{if self.flag()?{Ok(Some(self.handle()?))}else{Ok(None)}}
}
impl Core{
    pub(crate) fn test_ai_clone(&self)->Self{self.clone()}
    pub(crate) fn test_ai_defense_words(&self,ai:&crate::ai_resident::Owned,slot:u32)->Result<Vec<f64>,u32>{
        let bodies:Vec<_>=self.roster.iter().map(|h|self.slots[h.slot as usize].body.as_ref().unwrap().clone()).collect();
        let h=bodies.iter().find(|b|b.handle.slot==slot).ok_or(4u32)?.handle;
        crate::ai_resident::test_defense_words(ai,&bodies,&self.ordnance,&self.specs,self.world.as_ref().ok_or(8u32)?,crate::ai_resident::identity(h).map_err(|_|4u32)?).map_err(|_|8)
    }
    pub(crate) fn test_ai_install(&mut self,packet:&[f64])->Result<crate::ai_resident::Owned,u32>{
        if self.tick!=0.0||self.time!=0.0||packet.len()%COMMAND_WIDTH!=0{return Err(8);}
        let mut world=self.world.clone().ok_or(8u32)?;let mut bodies:Vec<_>=self.roster.iter().map(|h|self.slots[h.slot as usize].body.as_ref().unwrap().clone()).collect();
        for full in packet.chunks_exact(COMMAND_WIDTH){let id=integer(full[1]).ok_or(2u32)?;let h=Handle{slot:integer(full[2]).ok_or(2u32)?,generation:integer(full[3]).ok_or(2u32)?};
            let own=bodies.iter().position(|b|b.id==id&&b.handle==h).ok_or(4u32)?;
            crate::ai_wire::apply(integer(full[0]).ok_or(2u32)?,&full[4..],&mut world,&mut bodies,&self.specs,own)?;
        }
        let ai=world.ai.as_ref().ok_or(8u32)?.clone();ai.validate(&bodies,&self.specs).map_err(|_|8u32)?;self.world=Some(world);Ok(ai)
    }
    pub(crate) fn test_ai_phase(&mut self,owned:&mut crate::ai_resident::Owned,packet:&[f64])->Result<(),u32>{use crate::{ai_resident as r,ai_owner as a,tactical_ai as t};let mut p=AIReader{v:packet,at:0};let fleet=p.flag()?;let count=p.int()?;let mut entries=Vec::new();let mut ai=self.world.as_ref().and_then(|w|w.ai.clone()).ok_or(8u32)?;
        for _ in 0..count{let owner=p.handle()?;let dt=p.n()?;let sample_decision=p.flag()?;let settings=a::Settings{multirate:p.flag()?,compact_forecast_eligible:p.flag()?,weapon_frame_eligible:p.flag()?,tactical_interval:p.n()?,forecast_interval:p.n()?};
            ai.actor_mut(owner).map_err(|_|4u32)?.order=if p.flag()?{Some(a::Order{id:p.string()?,kind:match p.int()?{0=>t::OrderKind::Engage,1=>t::OrderKind::Avoid,2=>t::OrderKind::Defend,3=>t::OrderKind::Escort,4=>t::OrderKind::Waypoint,_=>return Err(2)},target:p.option_handle()?,point:if p.flag()?{Some([p.n()?,p.n()?])}else{None},issued_time:p.n()?})}else{None};
            entries.push(r::Entry{owner,dt,sample_decision,settings});
        }
        let mut active=Vec::new();let mut manual=Vec::new();if p.at==packet.len(){active=self.roster.clone();}else{let n=p.int()?;for _ in 0..n{active.push(r::core_handle(p.handle()?).map_err(|_|4u32)?);}let n=p.int()?;for _ in 0..n{manual.push(r::Manual{owner:p.handle()?,player_target:p.option_handle()?.map(r::core_handle).transpose().map_err(|_|4u32)?});}}
        if p.at!=packet.len(){return Err(2);}let mut bodies:Vec<_>=self.roster.iter().map(|h|self.slots[h.slot as usize].body.as_ref().unwrap().clone()).collect();let mut world=self.world.clone().ok_or(8u32)?;
        let mut ordnance=self.ordnance.clone();let mut random=self.random.clone();let mut visual=self.visual_random.clone();let mut notices=Vec::new();let mut scratch=r::Scratch::default();
        let mut resident=r::Resident{bodies:&mut bodies,ordnance:&mut ordnance,specs:&self.specs,world:&mut world,random:&mut random,visual:&mut visual,events:&mut notices};
        ai.phase_controlled(&mut resident,&entries,&active,&manual,fleet,&mut scratch).map_err(|e|match e{a::Error::StaleIdentity=>4u32,a::Error::InvalidNumber=>2u32,_=>8u32})?;world.ai=Some(ai.clone());
        for b in bodies{let slot=b.handle.slot as usize;self.slots[slot].body=Some(b);}self.world=Some(world);self.ordnance=ordnance;self.random=random;self.visual_random=visual;self.append(notices.into_iter());*owned=ai;Ok(())
    }
}

