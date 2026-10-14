//! Real-time resident observations and synchronous commits for registered effects.
use crate::{battle::{Beam,Ordnance},contact,projectile::Projectile,random::Random,ship_state,state::{Body,Handle},weapon_effects as e,weapon_effects_owner::{OwnerSink,Record}};
#[derive(Clone,Copy)]
pub struct BeamStyle{pub width:f64,pub fringe:[u8;4],pub core:[u8;4]}
impl Default for BeamStyle{fn default()->Self{Self{width:12.0,fringe:[255;4],core:[255;4]}}}
pub fn kind(id:u32)->Option<e::Effect>{Some(match id{1=>e::Effect::Tachyon,2=>e::Effect::Graviton,3=>e::Effect::Sabot,4=>e::Effect::Mote,5=>e::Effect::HyperionYamato,6=>e::Effect::GlorianaSiege,_=>return None})}
pub fn id(effect:e::Effect)->u32{match effect{e::Effect::Tachyon=>1,e::Effect::Graviton=>2,e::Effect::Sabot=>3,e::Effect::Mote=>4,e::Effect::HyperionYamato=>5,e::Effect::GlorianaSiege=>6}}
struct Target{body:Body,engines:Vec<[f64;2]>,weapons:Vec<e::EmpWeapon>}
impl Target{
    fn new(b:&Body)->Result<Self,u32>{let s=b.ship.as_ref().ok_or(8u32)?;let c=s.combat.as_ref().ok_or(8u32)?;
        Ok(Self{body:b.clone(),engines:s.engines.as_ref().map_or_else(Vec::new,|e|e.engines.iter().map(|e|[e.data[1],e.data[2]]).collect()),
            weapons:c.fire.iter().enumerate().map(|(i,f)|e::EmpWeapon{local:f.spec.relative_pos,hidden:s.components.get(i).is_some_and(|c|c.data[2]==2.0)}).collect()})}
    fn input(&self)->e::TargetInput<'_>{let b=&self.body;let s=b.ship.as_ref().unwrap();let c=s.combat.as_ref().unwrap();let sh=s.shield.as_ref();
        e::TargetInput{id:b.id,dead:s.flags&ship_state::DEAD!=0,fighter:c.size==0,position:[b.motion[0],b.motion[1]],facing:b.motion[4],engines:&self.engines,weapons:&self.weapons,
            shield:e::ShieldArc{active:sh.is_some_and(|sh|sh.active()),kind:sh.map_or(0,|sh|sh.kind()),center:sh.map_or([b.motion[0],b.motion[1]],|sh|contact::shield_center(sh,&b.motion)),
                facing:sh.map_or(b.motion[4],|sh|if sh.kind()==1{b.motion[4]}else{sh.data[8]}),arc_deg:sh.map_or(0.0,|sh|sh.data[7])},
            hard_flux:s.flux.hard,max_flux:s.flux.max,shield_pierced:c.shield_pierced,cr_damage_taken:c.attrs[1],system_shield_multiplier:c.attrs[2]*s.live.get(crate::ship_effects::SHIELD_DAMAGE),
            shield_efficiency:sh.map_or(1.0,|sh|sh.data[3]),energy_shield_multiplier:sh.map_or(1.0,|sh|sh.data[41])}}
}
// Until the complete world death/explosion owner is connected, lethal effect
// commits fail atomically. A no-op or just setting DEAD would lose chain effects.
fn destruction(_: &mut [Body],_:usize,_:&mut Random,_:&mut Random,_:&mut Vec<Record>)->Result<(),u32>{Err(8)}
pub struct WorldSink<'a,'b>{pub host:&'a mut crate::world_owner::Host<'b>,pub components:[f64;2],pub player:bool,pub cosmetic_id:f64,pub error:Option<u32>}
impl WorldSink<'_,'_>{
    fn index(&self,id:u32)->Result<usize,u32>{self.host.bodies.iter().position(|b|b.id==id).ok_or(4)}
    fn record(&mut self,row:usize,events:Vec<ship_state::Notice>){let result=self.host.owned.visual.notices(&events);self.capture(result);let b=&self.host.bodies[row];self.host.events.extend(events.into_iter().map(|n|(b.id,b.handle,n)));}
    fn capture(&mut self,result:Result<(),u32>){if let Err(e)=result{self.error.get_or_insert(e);}}
    fn finish(&self)->Result<(),u32>{self.error.map_or_else(||self.host.finish(),Err)}
}
impl e::Sink for WorldSink<'_,'_>{
    fn armor_energy(&mut self,id:u32,point:[f64;2],damage:f64,visual:&mut Random)->Result<e::Damage,u32>{let row=self.index(id)?;
        let r=self.host.armor_damage(crate::world_owner::identity(&self.host.bodies[row]),point,damage,0,None,false,visual)?;
        Ok(e::Damage{armor:r.armor,hull:r.hull})}
    fn hull(&mut self,id:u32,damage:f64){let result=(||{let row=self.index(id)?;self.host.hull_damage(crate::world_owner::identity(&self.host.bodies[row]),damage)})();self.capture(result);}
    fn components(&mut self,id:u32,point:[f64;2],damage:e::Damage,emp:f64,random:&mut Random)->Result<(),u32>{let row=self.index(id)?;let mut notices=Vec::new();
        self.host.bodies[row].ship.as_mut().ok_or(8u32)?.propagate(point,[damage.armor,damage.hull],emp,self.components,random,&mut notices)?;self.record(row,notices);Ok(())}
    fn shield_flux(&mut self,id:u32,amount:f64,hard:bool){let result=(||{let row=self.index(id)?;let mut notices=Vec::new();let s=self.host.bodies[row].ship.as_mut().ok_or(8u32)?;
        s.flux_operation(0,amount,hard,&mut notices);s.sync_shield();self.record(row,notices);Ok(())})();self.capture(result);}
    fn armor_sparks(&mut self,id:u32,local:[f64;2],armor:f64){self.host.ordnance.effect_records.push(Record::ArmorSparks{target:id,local,armor});}
    fn armor_sparks_immediate(&mut self,id:u32,local:[f64;2],armor:f64,visual:&mut Random)->Result<(),u32>{let row=self.index(id)?;self.host.armor_particles(crate::world_owner::identity(&self.host.bodies[row]),local,armor,visual)}
    fn emp_arc(&mut self,arc:e::EmpArc){self.host.ordnance.effect_records.push(Record::EmpArc(arc));}
    fn emp_arc_immediate(&mut self,arc:e::EmpArc,visual:&mut Random)->Result<(),u32>{if self.host.owned.visual.listener.is_some(){self.host.owned.visual.native_emp(arc,self.host.bodies,visual)?;}self.emp_arc(arc);Ok(())}
    fn sound(&mut self,sound:e::Sound,point:[f64;2],volume:f64,pitch:f64){let record=Record::Sound{sound,point,volume,pitch};self.host.owned.emit(crate::world_owner::Output::Effect(record.clone()));self.host.ordnance.effect_records.push(record);}
    fn record_energy(&mut self,player:bool,layer:e::DamageLayer,damage:f64,emp:f64){self.host.owned.stats.damage(player,0,damage,match layer{e::DamageLayer::Armor=>crate::world_damage::Layer::Armor,e::DamageLayer::Hull=>crate::world_damage::Layer::Hull},emp,None);
        self.host.ordnance.effect_records.push(Record::EnergyDamage{player,layer,damage,emp});}
    fn destroy_if_dead(&mut self,id:u32,random:&mut Random,visual:&mut Random){let result=(||{let row=self.index(id)?;
        if self.host.bodies[row].ship.as_ref().and_then(|s|s.armor.as_ref()).is_some_and(|a|a.data[14]<=0.0){self.host.destroy(row,random,visual)?;}Ok(())})();self.capture(result);}
    fn cosmetic(&mut self,impact:e::CosmeticImpact){self.host.ordnance.effect_records.push(Record::Cosmetic(impact));}
    fn cosmetic_immediate(&mut self,impact:e::CosmeticImpact,_visual:&mut Random)->Result<(),u32>{if self.host.owned.visual.listener.is_some(){self.host.owned.visual.cosmetic(impact.clone(),self.cosmetic_id)?;}self.cosmetic(impact);Ok(())}
}
pub fn hit_world(host:&mut crate::world_owner::Host<'_>,row:usize,p:&Projectile,effect:e::Effect,point:[f64;2],shield:bool,components:[f64;2],random:&mut Random,visual:&mut Random)->Result<(),u32>{
    host.refresh(row)?;let t=Target::new(&host.bodies[row])?;let input=t.input();let source=host.bodies.iter().find(|b|b.id==p.source&&b.handle==p.source_handle).and_then(|b|b.ship.as_ref());
    let out=source.and_then(|s|s.combat.as_ref()).map_or(p.outgoing,|c|c.outgoing());let flux=source.map_or(p.source_flux,|s|s.flux.percent());
    let outgoing=if p.gravity_captured.is_some(){1.0}else{crate::battle::outgoing_multiplier(out,t.body.ship.as_ref().unwrap().combat.as_ref().unwrap().size,p.delivery.weapon_type,Some(p.origin),point,flux)};
    let hit=e::HitInput{effect,point,shield,damage:p.damage,emp:p.emp,high_frequency:p.delivery.high_frequency,outgoing,facing:p.angle,velocity:[t.body.motion[2],t.body.motion[3]]};
    let mut sink=WorldSink{host,components,player:p.player.unwrap_or(false),cosmetic_id:p.id,error:None};e::hit_ship(hit,&input,random,visual,&mut sink)?;sink.finish()
}
pub fn beam_world(host:&mut crate::world_owner::Host<'_>,target:Option<usize>,beam:&mut Beam,components:[f64;2],random:&mut Random,visual:&mut Random)->Result<(),u32>{
    let Some(effect)=beam.effect else{return Ok(());};if effect==e::Effect::Graviton{return self::beam(host.bodies,target,beam,components,random,visual,&mut host.ordnance.effect_records);}
    if effect!=e::Effect::Tachyon{return Err(8);}let t=target.map(|row|Target::new(&host.bodies[row])).transpose()?;let target=t.as_ref().map(Target::input);
    let input=e::BeamInput{has_target:target.is_some(),brightness:beam.brightness,damage_active:beam.damage_active,dps_duration:beam.clock.duration,
        damage_per_second:beam.damage,damage_multiplier:beam.clock.multiplier,base_emp_per_second:beam.base_emp,from:beam.previous_end,endpoint:beam.end,
        width:beam.style.width,is_player:beam.player,fringe:beam.style.fringe,core:beam.style.core};
    let mut sink=WorldSink{host,components,player:beam.player,cosmetic_id:beam.id,error:None};e::tachyon(&mut beam.effect_state,&input,target.as_ref(),random,visual,&mut sink)?;sink.finish()
}
pub fn hit(bodies:&mut [Body],row:usize,p:&Projectile,effect:e::Effect,point:[f64;2],shield:bool,components:[f64;2],random:&mut Random,visual:&mut Random,records:&mut Vec<Record>)->Result<(),u32>{
    let t=Target::new(&bodies[row])?;let input=t.input();let out=bodies.iter().find(|b|b.id==p.source&&b.handle==p.source_handle).and_then(|b|b.ship.as_ref()).and_then(|s|s.combat.as_ref()).map_or(p.outgoing,|c|c.outgoing());
    let flux=bodies.iter().find(|b|b.id==p.source&&b.handle==p.source_handle).and_then(|b|b.ship.as_ref()).map_or(p.source_flux,|s|s.flux.percent());
    let outgoing=crate::battle::outgoing_multiplier(out,t.body.ship.as_ref().unwrap().combat.as_ref().unwrap().size,p.delivery.weapon_type,Some(p.origin),point,flux);
    let hit=e::HitInput{effect,point,shield,damage:p.damage,emp:p.emp,high_frequency:p.delivery.high_frequency,outgoing,facing:p.angle,velocity:[t.body.motion[2],t.body.motion[3]]};
    let mut sink=OwnerSink{bodies,output:records,component_source:components,destruction,error:None};e::hit_ship(hit,&input,random,visual,&mut sink)?;sink.finish()
}
pub fn beam(bodies:&mut [Body],target:Option<usize>,beam:&mut Beam,components:[f64;2],random:&mut Random,visual:&mut Random,records:&mut Vec<Record>)->Result<(),u32>{
    let Some(effect)=beam.effect else{return Ok(());};let t=target.map(|i|Target::new(&bodies[i])).transpose()?;let target=t.as_ref().map(Target::input);
    let input=e::BeamInput{has_target:target.is_some(),brightness:beam.brightness,damage_active:beam.damage_active,dps_duration:beam.clock.duration,
        damage_per_second:beam.damage,damage_multiplier:beam.clock.multiplier,base_emp_per_second:beam.base_emp,from:beam.previous_end,endpoint:beam.end,
        width:beam.style.width,is_player:beam.player,fringe:beam.style.fringe,core:beam.style.core};
    match effect{
        e::Effect::Tachyon=>{let mut sink=OwnerSink{bodies,output:records,component_source:components,destruction,error:None};
            e::tachyon(&mut beam.effect_state,&input,target.as_ref(),random,visual,&mut sink)?;sink.finish()?;}
        e::Effect::Graviton=>{if let Some(row)=target.as_ref().and_then(|_|target_index(t.as_ref().unwrap().body.handle,bodies)){
            let identity=e::WeaponIdentity{source:beam.source,slot:beam.source_handle.slot,generation:beam.source_handle.generation,component:beam.component};
            e::graviton(&mut beam.effect_state,&input,target.as_ref(),Some(identity),&mut bodies[row].ship.as_mut().unwrap().combat.as_mut().unwrap().graviton);
        }}
        _=>return Err(8),
    }Ok(())
}
fn target_index(h:Handle,bodies:&[Body])->Option<usize>{bodies.iter().position(|b|b.handle==h)}
pub fn listeners(bodies:&mut [Body],dt:f64){for b in bodies{if let Some(c)=b.ship.as_mut().and_then(|s|s.combat.as_mut()){
    c.graviton_multiplier=c.graviton.advance(dt).unwrap_or(1.0);}}}
pub fn beam_words(b:&Beam)->[f64;8]{let t=b.effect_state.tachyon.as_ref();[b.serial,b.effect.map_or(0,id)as f64,t.is_some()as u32 as f64,
    t.map_or(0.0,|t|t.interval),t.map_or(0.0,|t|t.elapsed),t.is_some_and(|t|t.interval_elapsed)as u32 as f64,
    t.is_none_or(|t|t.was_zero)as u32 as f64,b.effect_state.graviton_was_zero as u32 as f64]}
pub fn drain_notices(ordnance:&mut Ordnance,notices:&mut Vec<(u32,Handle,ship_state::Notice)>){
    for r in &ordnance.effect_records{if let Record::Notice{target,handle,notice}=r{notices.push((*target,*handle,notice.clone()));}}
}
