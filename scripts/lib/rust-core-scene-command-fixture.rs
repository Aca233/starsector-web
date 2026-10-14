// Included inside actual Core. Only test setup sets controlled source states;
// commands, lifecycle, HUD and rollback call the unchanged production authority.
#[derive(Clone)]pub(crate) struct CommandTest{scene:crate::scene_owner::Owned,result:Option<crate::scene_commands::Outcome>}
impl Core{
    fn command_bodies(&self)->Vec<Body>{self.roster.iter().map(|h|self.slots[h.slot as usize].body.as_ref().unwrap().clone()).collect()}
    pub(crate) fn test_command_install(&mut self,packet:&[f64])->Result<CommandTest,u32>{
        if packet.len()%COMMAND_WIDTH!=0||self.tick!=0.0{return Err(2);}let mut draft=self.clone();let bodies=draft.command_bodies();let mut meta=crate::scene_system_publication::Owned::default();
        for full in packet.chunks_exact(COMMAND_WIDTH){let id=integer(full[1]).ok_or(2u32)?;let h=Handle{slot:integer(full[2]).ok_or(2u32)?,generation:integer(full[3]).ok_or(2u32)?};let r=bodies.iter().position(|b|b.id==id&&b.handle==h).ok_or(4u32)?;
            let tag=integer(full[0]).ok_or(2u32)?;if(133..=135).contains(&tag){crate::flight_wire::apply(tag,&full[4..],draft.world.as_mut().ok_or(8u32)?,&bodies,&mut draft.specs,r)?;}else{meta.apply(tag,&full[4..],&bodies,r)?;}}
        meta.validate(&bodies)?;let mut scene=crate::scene_owner::Owned::new(bodies.first().ok_or(8u32)?.handle,bodies.get(1).ok_or(8u32)?.handle);scene.system_read=meta;
        for h in &draft.roster{let s=draft.slots[h.slot as usize].body.as_mut().unwrap().ship.as_mut().ok_or(8u32)?;s.world.as_mut().ok_or(8u32)?.aim=s.combat.as_ref().and_then(|c|c.query.as_ref()).ok_or(8u32)?.aim;}
        draft.world.as_mut().ok_or(8u32)?.visual.begin_frame([bodies[0].motion[0],bodies[0].motion[1]])?;*self=draft;Ok(CommandTest{scene,result:None})
    }
    pub(crate) fn test_command_run(&mut self,prior:&mut CommandTest,packet:&[f64])->Result<(),u32>{
        if packet.len()%COMMAND_WIDTH!=0{return Err(2);}let mut bodies=self.command_bodies();let mut world=self.world.clone().ok_or(8u32)?;let mut ordnance=self.ordnance.clone();let mut random=self.random.clone();let mut visual=self.visual_random.clone();let mut test=prior.clone();let mut events=Vec::new();
        for full in packet.chunks_exact(COMMAND_WIDTH){let id=integer(full[1]).ok_or(2u32)?;let h=Handle{slot:integer(full[2]).ok_or(2u32)?,generation:integer(full[3]).ok_or(2u32)?};let own=bodies.iter().position(|b|b.id==id&&b.handle==h).ok_or(4u32)?;
            let tag=integer(full[0]).ok_or(2u32)?;if(160..=164).contains(&tag){test.result=Some(crate::scene_commands::apply(tag,&full[4..],&mut test.scene,&mut bodies,&mut world,&mut ordnance,&self.specs,own,&mut random,&mut visual,&mut events)?);}else{let mut scene=Some(test.scene);let(_,result)=crate::scene_wire::apply_control(tag,&full[4..],&mut scene,&mut bodies,&mut world,&self.specs,own,self.time,&mut visual,&mut events)?;test.scene=scene.ok_or(8u32)?;if result.is_some(){test.result=result;}}}
        if test.scene.list.is_some(){return Err(8);}
        for b in bodies{let slot=b.handle.slot as usize;self.slots[slot].body=Some(b);}self.world=Some(world);self.ordnance=ordnance;self.random=random;self.visual_random=visual;self.append(events);*prior=test;Ok(())
    }
    pub(crate) fn test_command_scene_install(&mut self,prior:&mut CommandTest,packet:&[f64])->Result<(),u32>{
        if packet.len()%COMMAND_WIDTH!=0{return Err(2);}let mut draft=self.clone();let mut b=draft.command_bodies();let mut scene=None;let mut events=Vec::new();for full in packet.chunks_exact(COMMAND_WIDTH){let id=integer(full[1]).ok_or(2u32)?;let h=Handle{slot:integer(full[2]).ok_or(2u32)?,generation:integer(full[3]).ok_or(2u32)?};let own=b.iter().position(|b|b.id==id&&b.handle==h).ok_or(4u32)?;
            crate::scene_wire::apply(integer(full[0]).ok_or(2u32)?,&full[4..],&mut scene,&mut b,draft.world.as_mut().ok_or(8u32)?,&draft.specs,own,draft.time,&mut draft.visual_random,&mut events)?;}
        let mut scene=scene.ok_or(8u32)?;scene.system_read=prior.scene.system_read.clone();prior.scene=scene;*self=draft;Ok(())
    }
    pub(crate) fn test_command_scene_state(&mut self,test:&mut CommandTest,packet:&[f64])->Result<(),u32>{
        if packet.len()!=3||packet.iter().any(|v|!v.is_finite()){return Err(2);}let field=integer(packet[0]).ok_or(2u32)?;let index=integer(packet[1]).ok_or(2u32)?as usize;let n=packet[2];match field{
            0=>test.scene.cp=n,1=>test.scene.enabled=n==1.0,2=>test.scene.simulation=n==1.0,3=>test.scene.limit=n,
            4=>test.scene.result=if n==1.0{Some(self.world.as_ref().ok_or(8u32)?.stats.finalize(true,self.time,"fixture".into(),"fixture".into(),1.0,1.0))}else{None},
            5=>test.scene.roots.get_mut(index).ok_or(4u32)?.pending=n==1.0,6=>test.scene.roots.get_mut(index).ok_or(4u32)?.station=n==1.0,_=>return Err(2)}Ok(())
    }
    pub(crate) fn test_command_state(&mut self,packet:&[f64])->Result<(),u32>{
        // body index, lifecycle id (0 = ship), field, value. No derived rule.
        if packet.len()%4!=0{return Err(2);}let mut draft=self.clone();
        for p in packet.chunks_exact(4){if p.iter().any(|n|!n.is_finite()){return Err(2);}let h=*draft.roster.get(integer(p[0]).ok_or(2u32)?as usize).ok_or(4u32)?;let s=draft.slots[h.slot as usize].body.as_mut().unwrap().ship.as_mut().ok_or(8u32)?;
            let sid=integer(p[1]).ok_or(2u32)?;let field=integer(p[2]).ok_or(2u32)?;let n=p[3];
            if sid==0{match field{0=>s.flags=integer(n).ok_or(2u32)?,1=>s.armor.as_mut().ok_or(8u32)?.data[14]=n,2=>s.flux.soft=n,3=>s.flux.hard=n,4=>s.flux.overloaded=n==1.0,5=>s.flux.venting=n==1.0,6=>s.flux.vent_mult=n,7=>s.shield.as_mut().ok_or(8u32)?.data[35]=n,
                8=>{let mut mods=crate::ship_effects::Modifiers::default();mods.set(crate::ship_effects::DISABLE_DEFENSE,n);mods.set(crate::ship_effects::DISABLE_VENTING,n);mods.set(crate::ship_effects::DISABLE_WEAPONS,n);mods.set(crate::ship_effects::DISABLE_SYSTEMS,n);s.world.as_mut().ok_or(8u32)?.runtime=vec![(99,mods)];},9=>s.shield.as_mut().ok_or(8u32)?.data[14]=n,_=>return Err(2)}}
            else{let life=s.systems.iter_mut().find(|s|s.id==sid).ok_or(8u32)?;match field{0=>{life.state=integer(n).ok_or(2u32)?;life.active=matches!(life.state,1|2|3);life.cooling=life.state==4;},1=>life.effect=n,2=>life.active_timer=n,3=>life.cooldown_timer=n,4=>life.charges=n,5=>life.pending_flux=n,6=>life.disabled=n==1.0,7=>life.out_level=n,_=>return Err(2)}}
        }*self=draft;Ok(())
    }
    pub(crate) fn test_command_publish(&self,test:&CommandTest)->Result<Vec<f64>,u32>{
        let b=self.command_bodies();crate::scene_system_publication::words(&test.scene.system_read,&b,self.world.as_ref().ok_or(8u32)?,&self.ordnance,&self.specs)
    }
    pub(crate) fn test_command_observe(&self,test:&CommandTest)->Result<Vec<f64>,u32>{
        fn string(v:&mut Vec<f64>,s:&str){let words:Vec<_>=s.encode_utf16().collect();v.push(words.len()as f64);v.extend(words.into_iter().map(|n|n as f64));}
        fn opt(v:&mut Vec<f64>,s:Option<&str>){v.push(s.is_some()as u32 as f64);if let Some(s)=s{string(v,s);}}
        let b=self.command_bodies();let mut v=vec![test.result.is_some()as u32 as f64];if let Some(r)=&test.result{v.push(r.accepted as u32 as f64);opt(&mut v,r.reason.as_deref());}
        v.extend([test.scene.manual_weapon.slot as f64,test.scene.manual_weapon.generation as f64]);v.push(test.scene.player_target.is_some()as u32 as f64);if let Some(h)=test.scene.player_target{v.extend([h.slot as f64,h.generation as f64]);}
        v.push(b.len()as f64);for body in b{let s=body.ship.as_ref().ok_or(8u32)?;let w=s.world.as_ref().ok_or(8u32)?;v.extend([body.id as f64,w.aim[0],w.aim[1]]);v.push(s.systems.len()as f64);for life in &s.systems{let input=self.world.as_ref().and_then(|w|w.gravity.as_ref()).and_then(|g|g.owner.ships.iter().find(|m|m.identity.slot==body.handle.slot&&m.identity.generation==body.handle.generation)).and_then(|m|m.systems.iter().find(|m|m.id==life.id)).map_or(w.metas[&life.id].input,|m|m.input);v.push(life.id as f64);v.push(input.is_some()as u32 as f64);if let Some(i)=input{v.extend(i.point);v.extend(i.origin);v.extend(i.velocity);v.push(i.facing);}}
            let f=self.world.as_ref().and_then(|w|w.flight.as_ref()).ok_or(8u32)?;let meta=f.owner.ship(crate::tactical_ai::Identity{handle:body.handle.slot,generation:body.handle.generation}).map_err(crate::flight_runtime::error)?;v.push(meta.recall as u32 as f64);}
        v.push(test.scene.texts.len()as f64);for t in &test.scene.texts{v.push(t.id);v.extend(t.position);string(&mut v,&t.text);v.extend(t.color.map(|n|n as f64));v.extend([t.size,t.life,t.max_life]);}
        use crate::combat_visuals::Audio;let audio=&self.world.as_ref().ok_or(8u32)?.visual.audio;
        v.push((audio.len()+test.scene.audio.len())as f64);for a in audio{match a{Audio::Play{key,volume,rate,position,listener,maximum}=>{v.push(0.0);string(&mut v,key);v.extend([*volume,*rate]);v.push(position.is_some()as u32 as f64);if let Some(p)=position{v.extend(p);}v.push(listener.is_some()as u32 as f64);if let Some(p)=listener{v.extend(p);}v.push(maximum.is_some()as u32 as f64);if let Some(n)=maximum{v.push(*n);}},Audio::Loop{key,volume,active}=>{v.push(1.0);string(&mut v,key);v.extend([*volume,*active as u32 as f64]);},Audio::Muffled(n)=>v.extend([2.0,*n as u32 as f64])}}
        for a in &test.scene.audio{v.push(0.0);string(&mut v,&a.key);v.extend([a.volume,1.0,0.0,0.0,0.0]);}
        fn unit(v:&mut Vec<f64>,u:crate::scene_owner::Unit){match u{crate::scene_owner::Unit::Fleet=>v.push(0.0),crate::scene_owner::Unit::Ship(h)=>v.extend([1.0,h.slot as f64,h.generation as f64])}}
        let o=&test.scene;v.extend([o.cp,o.order_sequence as f64,o.map as u32 as f64,o.simulation_limit]);v.push(o.selected.is_some()as u32 as f64);if let Some(u)=o.selected{unit(&mut v,u);}v.push(o.orders.len()as f64);for(u,a)in &o.orders{unit(&mut v,*u);string(&mut v,&a.id);v.push(match a.kind{crate::scene_owner::Kind::Assault=>0.0,crate::scene_owner::Kind::Engage=>1.0,crate::scene_owner::Kind::Avoid=>2.0,crate::scene_owner::Kind::Defend=>3.0,crate::scene_owner::Kind::Escort=>4.0,crate::scene_owner::Kind::Waypoint=>5.0});v.push(a.target.is_some()as u32 as f64);if let Some(h)=a.target{v.extend([h.slot as f64,h.generation as f64]);}v.push(a.point.is_some()as u32 as f64);if let Some(p)=a.point{v.extend(p);}v.push(a.time);}
        let b=self.command_bodies();v.push(o.roots.len()as f64);for r in &o.roots{v.extend([r.ship.slot as f64,r.ship.generation as f64,r.cost]);v.push(match o.status(&b,r)?{crate::scene_owner::Status::Reserve=>0.0,crate::scene_owner::Status::Deployed=>1.0,crate::scene_owner::Status::Retreating=>2.0,crate::scene_owner::Status::Retreated=>3.0,crate::scene_owner::Status::Destroyed=>4.0});}
        v.push(o.radio.len()as f64);for r in &o.radio{v.push(r.id);string(&mut v,&r.sender);string(&mut v,&r.faction);string(&mut v,&r.text);v.extend(r.color.map(|n|n as f64));v.push(r.time);}Ok(v)
    }
}
