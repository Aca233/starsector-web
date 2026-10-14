// Included inside actual state::Core. Only controlled test setup writes HP;
// every derived stage calls the production scene_prelude authority unchanged.
impl Core{
    pub(crate) fn test_prelude_install(&self,prior:&Option<crate::scene_prelude::Owned>,packet:&[f64])->Result<crate::scene_prelude::Owned,u32>{
        if self.tick!=0.0||self.time!=0.0||packet.len()%COMMAND_WIDTH!=0{return Err(8);}
        let bodies:Vec<_>=self.roster.iter().map(|h|self.slots[h.slot as usize].body.as_ref().unwrap().clone()).collect();let mut owned=prior.clone();
        for full in packet.chunks_exact(COMMAND_WIDTH){let id=integer(full[1]).ok_or(2u32)?;let h=Handle{slot:integer(full[2]).ok_or(2u32)?,generation:integer(full[3]).ok_or(2u32)?};
            let r=bodies.iter().position(|b|b.id==id&&b.handle==h).ok_or(4u32)?;
            crate::scene_prelude::apply(integer(full[0]).ok_or(2u32)?,&full[4..],&mut owned,&bodies,r)?;}
        let o=owned.ok_or(8u32)?;o.validate(&bodies)?;Ok(o)
    }
    pub(crate) fn test_prelude_run(&mut self,owned:&mut crate::scene_prelude::Owned,packet:&[f64])->Result<(),u32>{
        let kind=integer(*packet.first().ok_or(2u32)?).ok_or(2u32)?;let count=integer(*packet.get(1).ok_or(2u32)?).ok_or(2u32)?as usize;
        let width=if kind==4{3}else{2};if packet.len()!=2+count*width{return Err(2);}
        let mut bodies:Vec<_>=self.roster.iter().map(|h|self.slots[h.slot as usize].body.as_ref().unwrap().clone()).collect();let mut candidate=owned.clone();let mut handles=Vec::new();
        for p in packet[2..].chunks_exact(width){let h=Handle{slot:integer(p[0]).ok_or(2u32)?,generation:integer(p[1]).ok_or(2u32)?};
            if handles.contains(&h){return Err(8);}let r=bodies.iter().position(|b|b.handle==h).ok_or(4u32)?;handles.push(h);
            if kind==4{if !p[2].is_finite()||p[2]<0.0{return Err(2);}bodies[r].ship.as_mut().ok_or(8u32)?.armor.as_mut().ok_or(8u32)?.data[14]=p[2];}}
        match kind{0=>candidate.observe(&mut bodies,&handles)?,1=>candidate.shared_flux(&bodies,&handles)?,
            2=>for h in handles{let r=bodies.iter().position(|b|b.handle==h).unwrap();candidate.prepare_ship(&mut bodies,r)?;},4=>{},_=>return Err(2)}
        for b in bodies{let slot=b.handle.slot as usize;self.slots[slot].body=Some(b);}*owned=candidate;Ok(())
    }
    pub(crate) fn test_prelude_publish(&self,owned:&crate::scene_prelude::Owned)->Result<Vec<f64>,u32>{
        let bodies:Vec<_>=self.roster.iter().map(|h|self.slots[h.slot as usize].body.as_ref().unwrap().clone()).collect();owned.validate(&bodies)?;let mut words=vec![bodies.len()as f64];
        for b in &bodies{let e=owned.entry(b.handle)?;let s=b.ship.as_ref().ok_or(8u32)?;let q=s.combat.as_ref().ok_or(8u32)?.query.as_ref().ok_or(8u32)?;
            words.extend([b.handle.slot as f64,b.handle.generation as f64,e.public_visible as u8 as f64,e.module_bonus,e.module_hard,e.fleet_speed,e.ecm_penalty,s.engines.as_ref().ok_or(8u32)?.motion[7],s.combat.as_ref().unwrap().attrs[18],s.flux.base,s.hard_fraction]);
            words.extend(q.target.map_or([0.0;3],|h|[1.0,h.slot as f64,h.generation as f64]));
            words.push(q.visible.len()as f64);for(t,v)in &q.visible{words.extend([*t as f64,*v as u8 as f64]);}
            words.push(if s.world.as_ref().ok_or(8u32)?.parent.is_none(){owned.is_doomed(&bodies,self.world.as_ref().ok_or(8u32)?,b.handle)?as u8 as f64}else{-1.0});
        }Ok(words)
    }
}
