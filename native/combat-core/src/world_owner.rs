//! Shared resident death/explosion authority. All callbacks remain inside Rust.
use crate::{battle::Ordnance,contact::{self,Point},explosion_effects as e,lifecycle::Spec,
    motion,random::Random,ship_state::{self,Notice},state::{Body,Handle},terrain_world as t,world_damage as w};
use std::collections::BTreeMap;

#[derive(Clone)]
pub struct Meta {
    pub spec:w::Spec,pub ship_name:String,pub hull_name:String,pub transient:bool,
    pub explosion_damage:f64,pub explosion_radius:f64,pub break_probability:f64,
    pub sprite_height:f64,pub slot_positions:Vec<(u32,Point)>,pub missile_percent:f64,pub missile_multiplier:f64,
    pub strings:[Vec<u16>;4],
    pub terrain:Option<[f64;6]>,
}
impl Meta {
    pub fn new(row:&[f64],size:u32,radius:f64,bounds:&[Point])->Self{Self{
        spec:w::Spec{id:String::new(),size:if size<5{Some(size+1)}else{None},radius,bounds:bounds.to_vec(),min_pieces:row[3],max_pieces:row[4],mount_slots:Vec::new(),
            explosion_color:[row[5]as u8,row[6]as u8,row[7]as u8],flash_color:[row[8]as u8,row[9]as u8,row[10]as u8],debris_color:[row[11]as u8,row[12]as u8,row[13]as u8]},
        ship_name:String::new(),hull_name:String::new(),transient:row[14]==1.0,explosion_damage:row[0],explosion_radius:row[1],break_probability:row[2],
        sprite_height:row[15],slot_positions:Vec::new(),missile_percent:row[16],missile_multiplier:row[17],strings:std::array::from_fn(|_|Vec::new()),terrain:None}}
    pub fn valid(&self)->bool{[self.explosion_damage,self.explosion_radius,self.break_probability,self.sprite_height,self.missile_percent,self.missile_multiplier,self.spec.min_pieces,self.spec.max_pieces].into_iter().all(f64::is_finite)
        &&self.spec.bounds.iter().flatten().all(|v|v.is_finite())&&self.slot_positions.iter().all(|(_,p)|p.iter().all(|v|v.is_finite()))}
    pub fn complete(&self)->bool{self.strings.iter().all(|s|!s.is_empty()&&String::from_utf16(s).is_ok())&&self.terrain.is_some()}
    pub fn append(&mut self,field:usize,offset:usize,chunk:&[u16])->Result<(),u32>{let s=self.strings.get_mut(field).ok_or(2u32)?;if s.len()!=offset{return Err(8);}s.extend_from_slice(chunk);
        if let Ok(value)=String::from_utf16(s){match field{0=>self.spec.id=value,1=>self.ship_name=value,2=>self.hull_name=value,3=>{},_=>return Err(2)}}Ok(())}
}
#[derive(Clone)]pub enum Output {
    Death(w::Output),Explosion(e::Output),Terrain(t::Output),Sparks(Vec<t::Spark>),Impact(t::ImpactExplosion),Effect(crate::weapon_effects_owner::Record),Weapon(crate::weapon_world::Output),
}
#[derive(Clone)]pub struct Owned {
    pub player:e::Identity,pub enemy:e::Identity,pub suppressed:bool,pub time:f64,
    pub stats:w::Stats,pub losses:w::Losses,pub explosions:Vec<e::Explosion>,pub terrain:crate::terrain_owner::Owned,
    pub output:Vec<Output>,pub particles:Vec<f64>,pub floating:Vec<crate::weapon_world::Floating>,pub retired_projectiles:Vec<crate::projectile::Projectile>,pub radio:Vec<crate::scene_owner::Radio>,
    pub error:Option<u32>,
    pub visual:crate::combat_visuals::Owned,
    pub gravity:Option<crate::gravity_runtime::Owned>,
    pub aux:Option<crate::aux_world::Owned>,
    pub phase:Option<crate::phase_runtime::Owned>,
    pub ai:Option<crate::ai_resident::Owned>,
    pub flight:Option<crate::flight_runtime::Owned>,
    pub motion:Option<crate::motion_owner::Owned>,
    /// Actual source ships membership at the current synchronous barrier.
    /// None is the legacy domain fixture; a production scene installs Some.
    pub scope:Option<Vec<Handle>>,
}
impl Owned {
    pub fn new(player:e::Identity,enemy:e::Identity)->Self{Self{player,enemy,suppressed:false,time:0.0,stats:w::Stats::default(),losses:w::Losses::default(),
        explosions:Vec::new(),terrain:crate::terrain_owner::Owned::default(),output:Vec::new(),particles:Vec::new(),floating:Vec::new(),retired_projectiles:Vec::new(),radio:Vec::new(),error:None,visual:crate::combat_visuals::Owned::default(),gravity:None,aux:None,phase:None,ai:None,flight:None,motion:None,scope:None}}
    /// Capture sampled factory output at its true source call site. The legacy
    /// domain fixtures do not install a listener; production begins a FX frame.
    pub fn emit(&mut self,event:Output){if let Err(error)=self.visual.capture(&event){self.error.get_or_insert(error);}self.output.push(event);}
    /// The real factory samples the numeric ID and plays audio immediately.
    /// Scene consumes these already created messages between ordered barriers.
    pub fn message(&mut self,sender:&str,faction:&str,text:&str,color:[u8;3],visual:&mut Random)->Result<(),u32>{
        self.radio.push(crate::scene_owner::Radio{id:visual.next_id(),sender:sender.into(),faction:faction.into(),text:text.into(),color,time:self.time});
        if self.radio.len()>8{self.radio.remove(0);}if self.visual.listener.is_some(){self.visual.play("comm_radio",0.65,1.0,None,false)?;}Ok(())
    }
    pub fn drain_radio(&mut self,scene:&mut crate::scene_owner::Owned){scene.radio.append(&mut self.radio);if scene.radio.len()>8{scene.radio.drain(..scene.radio.len()-8);}}
    pub fn set_scope(&mut self,b:&[Body],scope:Vec<Handle>)->Result<(),u32>{for(i,h)in scope.iter().enumerate(){if scope[..i].contains(h)||!b.iter().any(|b|b.handle==*h){return Err(4);}}self.scope=Some(scope);Ok(())}
    pub fn contains(&self,b:&Body)->bool{self.scope.as_ref().is_none_or(|s|s.contains(&b.handle))}
    pub fn rows(&self,b:&[Body])->Result<Vec<usize>,u32>{match &self.scope{Some(s)=>s.iter().map(|h|b.iter().position(|b|b.handle==*h).ok_or(4)).collect(),None=>Ok((0..b.len()).collect())}}
    pub fn advance_particles(&mut self,dt:f64){for life in &mut self.particles{*life-=dt;}self.particles.retain(|life|*life>0.0);}
    pub fn sync_explosion_projectiles(&mut self,ordnance:&Ordnance){for explosion in &mut self.explosions{if let Some(serial)=explosion.referenced_projectile{
        if let Some(p)=ordnance.projectiles.iter().find(|p|p.serial==serial).or_else(||self.retired_projectiles.iter().find(|p|p.serial==serial)){explosion.payload=payload(p);}
    }}}
    pub fn sparks(&mut self,point:Point,count:u32,color:[u8;3],visual:&mut Random){let occupied=if self.visual.listener.is_some(){self.visual.particles.len()}else{self.particles.len()};let count=t::spark_count(count,occupied as u32);let particles=t::spark_particles(point,count,color,visual);
        self.particles.extend(particles.iter().map(|p|p.life));self.emit(Output::Sparks(particles));}
    pub fn impact(&mut self,point:Point,radius:f64,color:[u8;3],visual:&mut Random){if let Some(e)=t::impact_explosion(point,radius,color,true,2.0,[0.0;2],visual){self.emit(Output::Impact(e));}}
    pub fn install_terrain(&mut self,bodies:&[Body],specs:&BTreeMap<u32,Spec>)->Result<(),u32>{
        for b in bodies{let s=b.ship.as_ref().ok_or(8u32)?;let c=s.combat.as_ref().ok_or(8u32)?;let meta=c.death.as_ref().filter(|m|m.complete()).ok_or(8u32)?;let cfg=meta.terrain.ok_or(8u32)?;
            let world=s.world.as_ref();let module=world.and_then(|w|w.parent).map(|h|{let p=bodies.iter().find(|b|b.handle==h).ok_or(4u32)?;
                Ok::<_,u32>(crate::terrain_owner::Module{parent:identity(p),offset:[cfg[2],cfg[3]],angle:cfg[4],independent:cfg[5]==1.0})}).transpose()?;
            let children=world.map_or(Ok(Vec::new()),|w|w.children.iter().map(|h|bodies.iter().find(|b|b.handle==*h).map(identity).ok_or(4u32)).collect())?;
            self.terrain.ships.push(crate::terrain_owner::Meta{identity:identity(b),handle:b.handle,stable_id:String::from_utf16(&meta.strings[3]).map_err(|_|2u32)?,mass:cfg[0],station:cfg[1]==1.0,
                module,children,sprite_height:meta.sprite_height,slots:meta.slot_positions.clone(),terrain_speed:1.0,emergency_phase_used:false,fighter_recall:false});
            self.terrain.active.push(identity(b));
        }self.terrain.validate(bodies,specs)
    }
    pub fn nebula_stage(&mut self,bodies:&mut[Body],ordnance:&mut Ordnance,specs:&BTreeMap<u32,Spec>,events:&mut Vec<(u32,Handle,Notice)>)->Result<(),u32>{
        let rows=self.rows(bodies)?;let mut terrain=std::mem::take(&mut self.terrain);terrain.active=rows.into_iter().filter_map(|i|{let b=&bodies[i];b.ship.as_ref().filter(|s|s.flags&(ship_state::DOCKED|ship_state::RETREATED)==0).map(|_|identity(b))}).collect();
        let mut adapter=TerrainWorld{world:self};let mut host=crate::terrain_owner::Host::new_resident(bodies,&mut terrain,ordnance,specs,&mut adapter,events);
        let result=host.nebula();self.terrain=terrain;result
    }
    pub fn terrain_stage(&mut self,bodies:&mut[Body],ordnance:&mut Ordnance,specs:&BTreeMap<u32,Spec>,dt:f64,random:&mut Random,visual:&mut Random,events:&mut Vec<(u32,Handle,Notice)>)->Result<(),u32>{
        let mut terrain=std::mem::take(&mut self.terrain);
        let result=(||{let ids:Vec<_>=terrain.active.iter().copied().filter(|id|bodies.iter().find(|b|identity(b)==*id).is_some_and(|b|b.ship.as_ref().and_then(|s|s.combat.as_ref()).is_some_and(|c|c.size!=0))).collect();
            let roots:Vec<_>=terrain.ships.iter().filter(|m|m.module.is_none()&&ids.contains(&m.identity)).map(|m|m.identity).collect();
            let mut adapter=TerrainWorld{world:self};let mut host=crate::terrain_owner::Host::new_resident(bodies,&mut terrain,ordnance,specs,&mut adapter,events);
            crate::gravity_terrain::advance_owned(dt,&mut host,random,visual)?;
            host.owned.terrain.advance_asteroids(dt);host.asteroid_collisions(random,visual)?;
            for i in 0..ids.len(){for j in i+1..ids.len(){host.pair(ids[i],ids[j],random,visual)?;}}
            for root in roots{t::Host::sync_modules(&mut host,root)?;}Ok(())
        })();self.terrain=terrain;result
    }
    pub fn hulk_stage(&mut self,bodies:&mut[Body],ordnance:&mut Ordnance,specs:&BTreeMap<u32,Spec>,dt:f64,visual:&mut Random,events:&mut Vec<(u32,Handle,Notice)>)->Result<(),u32>{
        let mut terrain=std::mem::take(&mut self.terrain);let mut adapter=TerrainWorld{world:self};let mut host=crate::terrain_owner::Host::new_resident(bodies,&mut terrain,ordnance,specs,&mut adapter,events);
        let result=host.advance_hulks(dt,visual);self.terrain=terrain;result
    }
}
pub struct TerrainWorld<'a>{pub world:&'a mut Owned}
impl crate::terrain_owner::World for TerrainWorld<'_>{
    fn phased(&self,bodies:&[Body],owned:&crate::terrain_owner::Owned,specs:&BTreeMap<u32,Spec>,target:e::Identity)->Result<bool,u32>{
        crate::phase_runtime::phased_world(self.world,bodies,owned.row(bodies,target)?,specs)
    }
    fn hull(&mut self,bodies:&mut[Body],owned:&mut crate::terrain_owner::Owned,_:&mut Ordnance,specs:&BTreeMap<u32,Spec>,id:e::Identity,damage:f64,notices:&mut Vec<(u32,Handle,Notice)>)->Result<f64,u32>{
        let row=owned.row(bodies,id)?;let root=owned.root(id)?;let root_row=owned.row(bodies,root)?;let s=bodies[row].ship.as_ref().ok_or(8u32)?;let a=s.armor.as_ref().ok_or(8u32)?;
        let eligible=damage>0.0&&s.flags&(ship_state::DEAD|ship_state::RETREATED)==0&&a.data[15]!=1.0&&a.data[16]!=1.0;
        let damage=crate::phase_runtime::hull(self.world,bodies,row,damage,specs,notices)?;
        if eligible&&damage>0.0&&root_row!=row{if let Some(v)=bodies[root_row].ship.as_mut().and_then(|s|s.shield.as_mut()).and_then(|sh|sh.void.as_mut()){v.data[7]=v.data[3];}}Ok(damage)
    }
    fn retreat(&mut self,bodies:&mut[Body],owned:&mut crate::terrain_owner::Owned,ordnance:&mut Ordnance,specs:&BTreeMap<u32,Spec>,id:e::Identity,notices:&mut Vec<(u32,Handle,Notice)>)->Result<(),u32>{
        let row=owned.row(bodies,id)?;let _=ordnance;crate::phase_runtime::retreat(self.world,bodies,row,specs,notices)
    }
    fn armor_sparks(&mut self,point:Point,damage:f64,visual:&mut Random)->Result<(),u32>{let particles=w::armor_particles(point,damage,visual);self.world.particles.extend(particles.iter().map(|_|1.0));
        self.world.emit(Output::Death(w::Output::ArmorParticles{source:e::Identity{id:0.0,generation:0},local:point,damage,particles}));Ok(())}
    fn debris(&mut self,point:Point,count:u32,color:[u8;3],speed:f64,visual:&mut Random)->Result<(),u32>{let p=w::debris(point,count as usize,color,speed,visual);self.world.emit(Output::Death(w::Output::Debris(p)));Ok(())}
    fn sparks(&mut self,point:Point,count:u32,color:[u8;3],visual:&mut Random)->Result<(),u32>{self.world.sparks(point,count,color,visual);Ok(())}
    fn explosion_visual(&mut self,point:Point,radius:f64,color:[u8;3],visual:&mut Random)->Result<(),u32>{self.world.impact(point,radius,color,visual);Ok(())}
    fn audio_notices(&mut self,notices:&[Notice])->Result<(),u32>{self.world.visual.notices(notices)}
    fn audio_listener(&mut self,bodies:&[Body])->Result<(),u32>{if self.world.visual.listener.is_none(){return Ok(());}let row=w::body_index(bodies,self.world.player)?;self.world.visual.begin_frame([bodies[row].motion[motion::X],bodies[row].motion[motion::Y]])}
    fn output(&mut self,event:t::Output){self.world.emit(Output::Terrain(event));}
    fn visual_output(&mut self,event:t::Output,visual:&mut Random)->Result<(),u32>{crate::weapon_world::terrain_visual(self.world,event,visual)}
    fn environment_impact(&mut self,bodies:&mut[Body],owned:&mut crate::terrain_owner::Owned,ordnance:&mut Ordnance,specs:&BTreeMap<u32,Spec>,id:crate::terrain_owner::ProjectileIdentity,
        point:Point,velocity:Point,asteroid:Option<f64>,random:&mut Random,visual:&mut Random,notices:&mut Vec<(u32,Handle,Notice)>)->Result<(),u32>{
        let p=ordnance.projectiles.iter().find(|p|p.serial==id.serial&&p.id==id.id).ok_or(4u32)?.clone();
        let asteroid=asteroid.and_then(|id|owned.terrain.asteroids.iter().find(|a|a.id.id==id).map(|a|a.id));
        crate::weapon_world::environment_with_terrain(bodies,owned,ordnance,specs,self.world,&p,point,velocity,asteroid,random,visual,notices)
    }
}
pub fn payload(p:&crate::projectile::Projectile)->e::Payload{e::Payload{identity:e::Identity{id:p.serial,generation:1},source_ship:p.source,allegiance:e::Allegiance{team:Some(p.team),player:p.player},damage:p.damage,damage_type:p.delivery.damage_type,soft_flux:p.soft,
    position:p.pos,previous:p.prev,velocity:p.velocity,radius:p.delivery.radius,range_remaining:p.range,rocket:p.delivery.missile||p.guidance.as_ref().is_some_and(|s|s.rocket),flare:p.guidance.as_ref().is_some_and(|s|s.flare),did_damage:p.did_damage,
    moving_ray:p.delivery.spawn_type==2,intercepts_missiles:p.delivery.intercepts,target_projectile:p.target_projectile.map(|id|e::Identity{id:id as f64,generation:1}),pass_through_missiles:p.delivery.pass_missiles,
    damaged_projectiles:p.damaged_projectiles.iter().map(|id|e::Identity{id:*id,generation:1}).collect(),void_blocked_root:p.void_blocked,
    source_binding:Some(e::SourceBinding{handle:p.source_handle,weapon_type:p.delivery.weapon_type,origin:p.origin,outgoing:p.outgoing,flux:p.source_flux,captured:p.gravity_captured.is_some()})}}
pub fn identity(b:&Body)->e::Identity{e::Identity{id:b.id as f64,generation:b.handle.generation}}
fn interception_missile(p:&crate::projectile::Projectile,id:e::Identity)->e::Missile{let g=p.guidance.as_ref();
    e::Missile{identity:id,source_ship:p.source,allegiance:e::Allegiance{team:Some(p.team),player:p.player},position:p.pos,radius:p.delivery.radius,rocket:p.delivery.missile||g.is_some_and(|s|s.rocket),
        collision_disabled:p.collision_disabled,did_damage:p.did_damage,flare:g.is_some_and(|s|s.flare),flare_fizzling:g.is_some_and(|s|s.flare_fizzling),decoy:p.fighter_decoy,hp:p.hp()}}
pub struct Host<'a>{pub bodies:&'a mut[Body],pub specs:&'a BTreeMap<u32,Spec>,pub ordnance:&'a mut Ordnance,pub owned:&'a mut Owned,pub events:&'a mut Vec<(u32,Handle,Notice)>}
impl Host<'_>{
    fn index(&self,id:e::Identity)->Result<usize,u32>{w::body_index(self.bodies,id)}
    pub fn refresh(&mut self,row:usize)->Result<(),u32>{let s=self.bodies.get(row).and_then(|b|b.ship.as_ref()).ok_or(8u32)?;
        if s.world.is_some(){let m=crate::system_owner::modifiers(self.bodies,row,self.specs)?;self.bodies[row].ship.as_mut().unwrap().live=m;}Ok(())}
    fn touch_root(&mut self,id:e::Identity)->Result<(),u32>{let root=self.root(id)?;let row=self.index(root)?;
        if let Some(v)=self.bodies[row].ship.as_mut().and_then(|s|s.shield.as_mut()).and_then(|sh|sh.void.as_mut()){v.data[7]=v.data[3];}Ok(())}
    pub fn armor_damage(&mut self,id:e::Identity,point:Point,damage:f64,kind:u32,strength:Option<f64>,beam:bool,visual:&mut Random)->Result<e::Damage,u32>{
        let row=self.index(id)?;self.refresh(row)?;let mut notices=Vec::new();let s=self.bodies[row].ship.as_mut().ok_or(8u32)?;
        let r=s.armor_impact(&[point[0],point[1],damage,kind as f64,strength.is_some()as u32 as f64,strength.unwrap_or(0.0),beam as u32 as f64,0.0],visual,&mut notices)?;
        if notices.iter().any(|n|n.kind==ship_state::CELL_DAMAGE&&n.value>0.0){self.touch_root(id)?;}self.emit(row,notices);Ok(e::Damage{armor:r[0],hull:r[1]})}
    fn emit(&mut self,row:usize,notices:Vec<Notice>){if let Err(error)=self.owned.visual.notices(&notices){self.owned.error.get_or_insert(error);}let b=&self.bodies[row];self.events.extend(notices.into_iter().map(|n|(b.id,b.handle,n)));}
    pub fn root(&self,id:e::Identity)->Result<e::Identity,u32>{let mut id=id;for _ in 0..=self.bodies.len(){let b=&self.bodies[self.index(id)?];
        let parent=b.ship.as_ref().and_then(|s|s.world.as_ref()).and_then(|w|w.parent);
        match parent{None=>return Ok(id),Some(h)=>id=identity(self.bodies.iter().find(|b|b.handle==h).ok_or(4u32)?)}
    }Err(8)}
    pub fn death_ship(&self,id:e::Identity)->Result<w::Ship,u32>{let b=&self.bodies[self.index(id)?];let s=b.ship.as_ref().ok_or(8u32)?;let c=s.combat.as_ref().ok_or(8u32)?;let meta=c.death.as_ref().ok_or(8u32)?;
        let children=s.world.as_ref().map_or(Ok(Vec::new()),|o|o.children.iter().map(|h|self.bodies.iter().find(|b|b.handle==*h).map(identity).ok_or(4u32)).collect())?;
        Ok(w::Ship{identity:id,dead:s.flags&ship_state::DEAD!=0,attached:s.world.as_ref().is_some_and(|w|w.parent.is_some()),transient:meta.transient,player:c.player.unwrap_or(false),team:c.team,children,
            position:[b.motion[0],b.motion[1]],velocity:[b.motion[2],b.motion[3]],shield_center:s.shield.as_ref().map_or([b.motion[0],b.motion[1]],|sh|contact::shield_center(sh,&b.motion)),
            facing:b.motion[4],angular:b.motion[5],max_flux:s.flux.max,cr_taken:c.attrs[1],explosion_damage:meta.explosion_damage,explosion_radius:meta.explosion_radius,
            break_probability:meta.break_probability,decals_suppressed:s.armor.as_ref().is_some_and(|a|a.data[18]==1.0),ship_name:meta.ship_name.clone(),hull_name:meta.hull_name.clone(),spec:meta.spec.clone()})}
    pub fn explosion_ship(&self,id:e::Identity)->Result<e::Ship,u32>{let row=self.index(id)?;let b=&self.bodies[row];let s=b.ship.as_ref().ok_or(8u32)?;let c=s.combat.as_ref().ok_or(8u32)?;let sh=s.shield.as_ref();
        let live=if s.world.is_some(){crate::system_owner::modifiers(self.bodies,row,self.specs)?}else{s.live.clone()};
        Ok(e::Ship{identity:id,root:self.root(id)?,allegiance:e::Allegiance{team:Some(c.team),player:c.player},dead:s.flags&ship_state::DEAD!=0,collisionless:c.collisionless(b)||crate::phase_runtime::phased_world(self.owned,self.bodies,row,self.specs)?,fighter:c.size==0,
            position:[b.motion[0],b.motion[1]],facing:b.motion[4],radius:c.radius,bounds:c.bounds.clone(),shield:e::ShieldGeometry{active:sh.is_some_and(|sh|sh.active()),kind:sh.map_or(0,|sh|sh.kind()),
                center:sh.map_or([b.motion[0],b.motion[1]],|sh|contact::shield_center(sh,&b.motion)),facing:sh.map_or(b.motion[4],|sh|if sh.kind()==1{b.motion[4]}else{sh.data[8]}),
                arc:sh.map_or(0.0,|sh|sh.data[7]),radius:sh.map_or(0.0,|sh|sh.data[2]),void:sh.is_some_and(|sh|sh.void.is_some())},
            cr_taken:c.attrs[1],system_shield:c.attrs[2]*live.get(crate::ship_effects::SHIELD_DAMAGE),
            shield_taken:sh.map_or([1.0;4],|sh|{let ordinary=(sh.data[40]*c.graviton_multiplier)*sh.data[42];[ordinary*sh.data[41],ordinary,ordinary,ordinary]})})}
    fn fuse_ship_at(&self,row:usize,id:e::Identity)->Option<e::FuseShip<'_>>{
        let b=&self.bodies[row];let s=b.ship.as_ref()?;let c=s.combat.as_ref()?;let sh=s.shield.as_ref();
        if s.world.is_some(){crate::system_owner::validate_modifier_observation(self.bodies,row,self.specs).ok()?;}
        let _=self.root(id).ok()?;
        let collisionless=c.collisionless(b)||crate::phase_runtime::phased_world(self.owned,self.bodies,row,self.specs).ok()?;
        Some(e::FuseShip{identity:id,allegiance:e::Allegiance{team:Some(c.team),player:c.player},dead:s.flags&ship_state::DEAD!=0,collisionless,
            position:[b.motion[0],b.motion[1]],facing:b.motion[4],radius:c.radius,bounds:std::borrow::Cow::Borrowed(&c.bounds),
            shield:e::ShieldGeometry{active:sh.is_some_and(|sh|sh.active()),kind:sh.map_or(0,|sh|sh.kind()),
                center:sh.map_or([b.motion[0],b.motion[1]],|sh|contact::shield_center(sh,&b.motion)),facing:sh.map_or(b.motion[4],|sh|if sh.kind()==1{b.motion[4]}else{sh.data[8]}),
                arc:sh.map_or(0.0,|sh|sh.data[7]),radius:sh.map_or(0.0,|sh|sh.data[2]),void:sh.is_some_and(|sh|sh.void.is_some())}})
    }
    pub fn spawn(&mut self,p:e::Payload,spec:e::Spec,point:Point,ship:Option<e::Identity>,asteroid:Option<e::Identity>,random:&mut Random,visual:&mut Random)->Result<(),u32>{
        if spec.radius<=0.0{return Ok(());}let mut explosion=e::Explosion::new(p,spec,point,ship,asteroid)?;
        let index=self.owned.explosions.len();self.owned.explosions.push(explosion.clone());explosion.apply(self,random,visual)?;self.owned.explosions[index]=explosion;Ok(())}
    pub fn advance_explosions(&mut self,dt:f64,random:&mut Random,visual:&mut Random)->Result<(),u32>{if dt<=0.0{return Ok(());}
        self.owned.sync_explosion_projectiles(self.ordnance);
        for index in (0..self.owned.explosions.len()).rev(){let mut e=self.owned.explosions[index].clone();e.life-=dt;
            if e.life< -1e-9{self.owned.explosions.remove(index);continue;}e.position[0]+=e.payload.velocity[0]*dt;e.position[1]+=e.payload.velocity[1]*dt;
            e.apply(self,random,visual)?;self.owned.explosions[index]=e;}Ok(())}
    pub fn destroy(&mut self,row:usize,random:&mut Random,visual:&mut Random)->Result<bool,u32>{w::destroy(identity(&self.bodies[row]),self,random,visual)}
    pub fn finish(&self)->Result<(),u32>{self.owned.error.map_or(Ok(()),Err)}
    pub fn armor_particles(&mut self,id:e::Identity,local:Point,damage:f64,visual:&mut Random)->Result<(),u32>{let row=self.index(id)?;let b=&self.bodies[row];let s=b.ship.as_ref().ok_or(8u32)?;
        if s.armor.as_ref().is_some_and(|a|a.data[18]==1.0){return Ok(());}let offset=contact::rotate(local,b.motion[4]);let point=[b.motion[0]+offset[0],b.motion[1]+offset[1]];
        let particles=w::armor_particles(point,damage,visual);self.owned.particles.extend(particles.iter().map(|_|1.0));
        self.owned.emit(Output::Death(w::Output::ArmorParticles{source:id,local,damage,particles}));Ok(())}
    pub fn hull_damage(&mut self,id:e::Identity,damage:f64)->Result<(),u32>{let row=self.index(id)?;self.refresh(row)?;
        let dealt=crate::phase_runtime::hull(self.owned,self.bodies,row,damage,self.specs,self.events)?;if dealt>0.0{self.touch_root(id)?;}Ok(())}
    fn shatter(&mut self,index:usize,random:&mut Random,visual:&mut Random)->Result<(),u32>{
        let mut asteroids=std::mem::take(&mut self.owned.terrain.terrain.asteroids);let mut terrain=t::Terrain::default();terrain.asteroids=std::mem::take(&mut asteroids);
        let result=terrain.shatter(index,&mut FxHost{owned:self.owned},random,visual);self.owned.terrain.terrain.asteroids=terrain.asteroids;result}
}
impl w::Host for Host<'_>{
    fn ship(&self,id:e::Identity)->Option<w::Ship>{self.death_ship(id).ok()}
    fn suppressed(&self)->bool{self.owned.suppressed}fn player_ship(&self)->e::Identity{self.owned.player}fn enemy_ship(&self)->e::Identity{self.owned.enemy}fn time(&self)->f64{self.owned.time}
    fn mark_dead(&mut self,id:e::Identity)->Result<(),u32>{let i=self.index(id)?;w::mark_body_dead(&mut self.bodies[i])}
    fn force_hull_zero(&mut self,id:e::Identity)->Result<(),u32>{let i=self.index(id)?;w::force_body_hull_zero(&mut self.bodies[i])}
    fn shutdown(&mut self,id:e::Identity)->Result<(),u32>{let i=self.index(id)?;w::clear_motion(&mut self.bodies[i]);let s=self.bodies[i].ship.as_mut().ok_or(8u32)?;
        if let Some(c)=&mut s.combat{if let Some(q)=&mut c.query{q.trigger=false;}for f in &mut c.fire{f.input.requested=false;f.input.trigger_held=false;}}
        let mut notices=Vec::new();w::shutdown_resources(s,self.specs,&mut notices,|_|Ok(()))?;
        crate::gravity_runtime::interrupt(self.owned,self.bodies,self.specs,self.bodies[i].handle,None,false)?;
        self.emit(i,notices);Ok(())}
    fn loss(&mut self,loss:w::Loss){self.owned.losses.push(loss);}fn fighter_kill(&mut self,player:bool){self.owned.stats.fighter_kill(player);}
    fn spawn_explosion(&mut self,p:e::Payload,spec:e::Spec,exclude:e::Identity,random:&mut Random,visual:&mut Random)->Result<(),u32>{let point=p.position;self.spawn(p,spec,point,Some(exclude),None,random,visual)}
    fn prepare_hulk(&mut self,id:e::Identity,bounds:&[Point],visual:&mut Random)->Result<(),u32>{let i=self.index(id)?;w::prepare_resident_hulk(self.bodies[i].ship.as_mut().ok_or(8u32)?,bounds,visual)}
    fn armor_disable(&mut self,id:e::Identity,local:Point,raw:f64,cr:f64,visual:&mut Random)->Result<f64,u32>{let i=self.index(id)?;let mut notices=Vec::new();
        let damage=w::resident_armor_disable(self.bodies[i].ship.as_mut().ok_or(8u32)?,local,raw,cr,visual,&mut notices)?;self.emit(i,notices);Ok(damage)}
    fn output(&mut self,event:w::Output){match &event{
        w::Output::Hulk(h)=>{if let Ok(i)=self.index(h.source){if let Some(meta)=self.bodies[i].ship.as_ref().and_then(|s|s.combat.as_ref()).and_then(|c|c.death.as_ref()){
            if let Err(error)=self.owned.terrain.admit_hulk(self.bodies,h.clone()){self.owned.error=Some(error);}
        }else{self.owned.error=Some(8);}}else{self.owned.error=Some(4);}},_=>{}}
        self.owned.emit(Output::Death(event));}
    fn visual_output(&mut self,event:w::Output,visual:&mut Random)->Result<(),u32>{crate::weapon_world::death_visual(self.owned,event,visual)}
}
impl e::Host for Host<'_>{
    fn ships(&self)->Vec<e::Identity>{self.owned.rows(self.bodies).expect("validated resident scope").into_iter().filter_map(|i|{let b=&self.bodies[i];b.ship.as_ref().filter(|s|s.flags&(ship_state::DOCKED|ship_state::RETREATED)==0).map(|_|identity(b))}).collect()}
    fn fighters(&self)->Vec<e::Identity>{e::Host::ships(self).into_iter().filter(|id|self.bodies[self.index(*id).unwrap()].ship.as_ref().is_some_and(|s|s.combat.as_ref().is_some_and(|c|c.size==0))).collect()}
    fn capitals(&self)->Vec<e::Identity>{e::Host::ships(self).into_iter().filter(|id|self.bodies[self.index(*id).unwrap()].ship.as_ref().is_some_and(|s|s.combat.as_ref().is_some_and(|c|c.size!=0))).collect()}
    fn ship(&self,id:e::Identity)->Option<e::Ship>{self.explosion_ship(id).ok()}
    fn fuse_ship(&self,id:e::Identity)->Option<e::FuseShip<'_>>{
        self.fuse_ship_at(self.index(id).ok()?,id)
    }
    fn visit_fuse_ships(&self,fighter:bool,visitor:&mut dyn FnMut(e::FuseShip<'_>)->bool)->bool{
        // Build the complete ordered list before any observation, just as
        // ships()->fighters()/capitals() did. Resolve duplicate IDs to the same
        // first body as index(); rows live only during this immutable query.
        let rows=self.owned.rows(self.bodies).expect("validated resident scope");
        let mut selected=Vec::new();for row in rows{
            let b=&self.bodies[row];if b.ship.as_ref().is_none_or(|s|s.flags&(ship_state::DOCKED|ship_state::RETREATED)!=0){continue;}
            let id=identity(b);let canonical=self.index(id).unwrap();
            if self.bodies[canonical].ship.as_ref().is_some_and(|s|s.combat.as_ref().is_some_and(|c|(c.size==0)==fighter)){selected.push((canonical,id));}
        }
        for (row,id) in selected{if let Some(s)=self.fuse_ship_at(row,id){if visitor(s){return true;}}}false
    }
    fn missiles(&self)->Vec<e::Identity>{self.ordnance.projectiles.iter().filter(|p|p.delivery.missile||p.guidance.as_ref().is_some_and(|s|s.rocket)).map(|p|e::Identity{id:p.serial,generation:1}).collect()}
    fn missile(&self,id:e::Identity)->Option<e::Missile>{let p=self.ordnance.projectiles.iter().find(|p|p.serial==id.id&&id.generation==1)?;Some(interception_missile(p,id))}
    fn visit_interception_missiles(&self,visitor:&mut dyn FnMut(e::Missile)){
        for p in &self.ordnance.projectiles{if p.delivery.missile||p.guidance.as_ref().is_some_and(|s|s.rocket){visitor(interception_missile(p,e::Identity{id:p.serial,generation:1}));}}
    }
    fn asteroids(&self)->Vec<e::Identity>{self.owned.terrain.terrain.asteroids.iter().map(|a|a.id).collect()}
    fn asteroid(&self,id:e::Identity)->Option<e::Asteroid>{let a=self.owned.terrain.terrain.asteroids.iter().find(|a|a.id==id)?;Some(e::Asteroid{identity:id,position:a.position,radius:a.radius,hp:a.hp})}
    fn outgoing(&self,p:&e::Payload,target:Option<e::Identity>,point:Point)->f64{
        let Some(binding)=&p.source_binding else{return 1.0;};if binding.captured{return 1.0;}
        let source=self.bodies.iter().find(|b|b.id==p.source_ship&&b.handle==binding.handle).and_then(|b|b.ship.as_ref());
        let outgoing=source.and_then(|s|s.combat.as_ref()).map_or(binding.outgoing,|c|c.outgoing());let flux=source.map_or(binding.flux,|s|s.flux.percent());
        let size=target.and_then(|id|self.index(id).ok()).and_then(|i|self.bodies[i].ship.as_ref()).and_then(|s|s.combat.as_ref()).map_or(5,|c|c.size);
        crate::battle::outgoing_multiplier(outgoing,size,binding.weapon_type,Some(binding.origin),point,flux)}
    fn missile_damage(&self,p:&e::Payload,target:&e::Missile,damage:f64)->f64{let c=self.bodies.iter().find(|b|b.id==p.source_ship).and_then(|b|b.ship.as_ref()).and_then(|s|s.combat.as_ref());
        let Some(c)=c else{return damage;};if target.decoy{return damage*(1.0+(c.attrs[6]+if c.attrs[3]>0.0{50.0}else{0.0})/100.0)*c.attrs[7];}
        c.death.as_ref().map_or(damage,|m|damage*(1.0+m.missile_percent/100.0)*m.missile_multiplier)}
    fn absorb(&mut self,id:e::Identity,damage:f64,kind:u32,angle:f64)->Result<e::Absorption,u32>{let i=self.index(id)?;self.refresh(i)?;let s=self.bodies[i].ship.as_mut().ok_or(8u32)?;
        let graviton=s.combat.as_ref().ok_or(8u32)?.graviton_multiplier;let sh=s.shield.as_mut().ok_or(8u32)?;let saved=sh.data[40];sh.data[40]*=graviton;
        let (flux,absorbed,remainder)=sh.impact(damage,kind,angle);sh.data[40]=saved;Ok(e::Absorption{flux,absorbed,remainder})}
    fn shield_flux(&mut self,id:e::Identity,amount:f64,hard:bool)->Result<(),u32>{let i=self.index(id)?;let s=self.bodies[i].ship.as_mut().ok_or(8u32)?;let mut notices=Vec::new();s.flux_operation(0,amount,hard,&mut notices);s.sync_shield();self.emit(i,notices);Ok(())}
    fn armor(&mut self,id:e::Identity,point:Point,damage:f64,kind:u32,strength:Option<f64>,visual:&mut Random)->Result<e::Damage,u32>{self.armor_damage(id,point,damage,kind,strength,false,visual)}
    fn hull(&mut self,id:e::Identity,damage:f64)->Result<(),u32>{self.hull_damage(id,damage)}
    fn components(&mut self,id:e::Identity,point:Point,damage:e::Damage,emp:f64,source:u32,random:&mut Random)->Result<(),u32>{let i=self.index(id)?;let multiplier=self.bodies.iter().find(|b|b.id==source).and_then(|b|b.ship.as_ref()).map_or([1.0;2],|s|[s.damage_policy[3],s.damage_policy[4]]);
        let mut notices=Vec::new();self.bodies[i].ship.as_mut().ok_or(8u32)?.propagate(point,[damage.armor,damage.hull],emp,multiplier,random,&mut notices)?;self.emit(i,notices);Ok(())}
    fn armor_sparks(&mut self,id:e::Identity,local:Point,damage:f64,visual:&mut Random)->Result<(),u32>{self.armor_particles(id,local,damage,visual)}
    fn destroy_if_dead(&mut self,id:e::Identity,random:&mut Random,visual:&mut Random)->Result<bool,u32>{let i=self.index(id)?;if self.bodies[i].ship.as_ref().and_then(|s|s.armor.as_ref()).is_some_and(|a|a.data[14]<=0.0){self.destroy(i,random,visual)}else{Ok(false)}}
    fn subtract_missile_hp(&mut self,id:e::Identity,damage:f64)->Result<f64,u32>{let p=self.ordnance.projectiles.iter_mut().find(|p|p.serial==id.id&&id.generation==1).ok_or(4u32)?;
        Ok(p.subtract_hp(damage))}
    fn remove_missile(&mut self,id:e::Identity)->Result<(),u32>{let i=self.ordnance.projectiles.iter().position(|p|p.serial==id.id&&id.generation==1).ok_or(4u32)?;let p=self.ordnance.projectiles.remove(i);self.owned.retired_projectiles.push(p);Ok(())}
    fn asteroid_impact(&mut self,_:&e::Payload,id:e::Identity,damage:f64,point:Point,random:&mut Random,visual:&mut Random)->Result<(),u32>{let i=self.owned.terrain.terrain.asteroids.iter().position(|a|a.id==id).ok_or(4u32)?;
        self.owned.terrain.terrain.asteroids[i].hp-=damage;crate::weapon_world::floating_damage(self.owned,point,damage,[200,180,140],visual);
        self.owned.sparks(point,12,[255,180,80],visual);let debris=w::debris(point,4,[130,110,90],60.0,visual);self.owned.emit(Output::Death(w::Output::Debris(debris)));
        if self.owned.terrain.terrain.asteroids[i].hp<=0.0{self.shatter(i,random,visual)?;}Ok(())}
    fn missile_visual(&mut self,id:e::Identity,point:Point,color:[u8;3],visual:&mut Random)->Result<(),u32>{let p=self.ordnance.projectiles.iter().chain(self.owned.retired_projectiles.iter()).find(|p|p.serial==id.id&&id.generation==1).ok_or(4u32)?.clone();crate::weapon_world::missile_visual(self.owned,&p,point,color,visual);Ok(())}
    fn interception_effect(&mut self,p:&e::Payload,target:e::Identity,point:Point,random:&mut Random,visual:&mut Random)->Result<(),u32>{
        let effect=self.ordnance.projectiles.iter().find(|q|q.serial==p.identity.id).and_then(|q|q.delivery.effect);
        if effect==Some(crate::weapon_effects::Effect::Mote){let projectile=self.ordnance.projectiles.iter().find(|q|q.serial==p.identity.id).ok_or(4u32)?;let high=projectile.delivery.high_frequency;
            let m=e::Host::missile(self,target).ok_or(4u32)?;let damage=e::Host::missile_damage(self,p,&m,(if high{1000.0}else{200.0})*e::Host::outgoing(self,p,None,point));
            e::Host::subtract_missile_hp(self,target,damage)?;let record=crate::weapon_effects_owner::Record::Sound{sound:if high{crate::weapon_effects::Sound::MoteDamage}else{crate::weapon_effects::Sound::MoteNormal},point,volume:1.0,pitch:1.0};self.owned.emit(Output::Effect(record.clone()));self.ordnance.effect_records.push(record);
        }
        let _=random;Ok(())}
    fn ship_obstruction(&self,p:&e::Payload)->Option<f64>{self.bodies.iter().enumerate().filter_map(|(row,b)|{let s=b.ship.as_ref()?;let c=s.combat.as_ref()?;if b.id==p.source_ship||c.team==p.allegiance.team().unwrap_or(u32::MAX)||!s.can_advance()||c.collisionless(b){return None;}
        // This trait reader cannot return an error. Admission validates complete
        // scene metadata; an invalid post-admission read stops obstruction.
        if crate::phase_runtime::phased_world(self.owned,self.bodies,row,self.specs).ok()?{return None;}
        contact::projectile(p.previous,p.position,&b.motion,c.radius,&c.bounds,s.shield.as_ref()).map(|h|h.t)}).min_by(f64::total_cmp)}
    fn asteroid_obstruction(&self,p:&e::Payload)->Option<f64>{self.owned.terrain.terrain.asteroids.iter().filter(|a|a.hp>0.0).filter_map(|a|t::segment_impact(p.previous,p.position,a.position,a.radius+p.radius).map(|(t,_)|t)).min_by(f64::total_cmp)}
    fn wrecks(&self)->Vec<e::Wreck>{self.owned.terrain.terrain.hulks.iter().map(|h|e::Wreck{position:h.position,facing:h.facing,local_offset:h.offset,bounds:h.bounds.clone()}).collect()}
    fn player_id(&self)->u32{self.owned.player.id as u32}
    fn visual_output(&mut self,event:e::Output,visual:&mut Random)->Result<(),u32>{crate::weapon_world::visual_output(self.owned,event,visual)}
    fn output(&mut self,event:e::Output){match &event{e::Output::Damage{player,kind,layer,amount,emp,target_player}=>self.owned.stats.damage(*player,*kind,*amount,match layer{e::Layer::Shield=>w::Layer::Shield,e::Layer::Armor=>w::Layer::Armor,e::Layer::Hull=>w::Layer::Hull},*emp,*target_player),
        e::Output::ShotHit{player}=>self.owned.stats.shot_hit(*player),e::Output::MissileIntercepted{player}=>self.owned.stats.intercepted(*player),_=>{}}self.owned.emit(Output::Explosion(event));}
}
/// Shattering only calls the particle/output portion of Terrain::Host. All
/// physical services reject misuse; the full terrain adapter owns those calls.
struct FxHost<'a>{owned:&'a mut Owned}
impl t::Host for FxHost<'_>{
    fn ships(&self)->Vec<e::Identity>{Vec::new()}fn ship(&self,_:e::Identity)->Option<t::Ship>{None}
    fn move_root(&mut self,_:e::Identity,_:Point,_:Point)->Result<(),u32>{Err(8)}fn sync_modules(&mut self,_:e::Identity)->Result<(),u32>{Err(8)}
    fn terrain_speed(&mut self,_:e::Identity,_:f64)->Result<(),u32>{Err(8)}fn shield_contact(&mut self,_:e::Identity,_:f64)->Result<(),u32>{Err(8)}
    fn shield_absorb(&mut self,_:e::Identity,_:f64,_:u32,_:f64)->Result<t::Absorption,u32>{Err(8)}fn shield_flux(&mut self,_:e::Identity,_:f64)->Result<(),u32>{Err(8)}
    fn armor(&mut self,_:e::Identity,_:Point,_:f64,_:u32,_:f64,_:&mut Random)->Result<t::Damage,u32>{Err(8)}
    fn components(&mut self,_:e::Identity,_:Point,_:t::Damage,_:Option<e::Identity>,_:&mut Random)->Result<(),u32>{Err(8)}
    fn armor_sparks(&mut self,_:e::Identity,_:Point,_:f64,_:&mut Random)->Result<(),u32>{Err(8)}fn hull(&mut self,_:e::Identity,_:f64)->Result<(),u32>{Err(8)}
    fn debris(&mut self,point:Point,count:u32,color:[u8;3],speed:f64,visual:&mut Random)->Result<(),u32>{let debris=w::debris(point,count as usize,color,speed,visual);self.owned.emit(Output::Death(w::Output::Debris(debris)));Ok(())}
    fn sparks(&mut self,point:Point,count:u32,color:[u8;3],visual:&mut Random)->Result<(),u32>{self.owned.sparks(point,count,color,visual);Ok(())}
    fn explosion_visual(&mut self,point:Point,radius:f64,color:[u8;3],visual:&mut Random)->Result<(),u32>{self.owned.impact(point,radius,color,visual);Ok(())}
    fn output(&mut self,event:t::Output){self.owned.emit(Output::Terrain(event));}
    fn visual_output(&mut self,event:t::Output,visual:&mut Random)->Result<(),u32>{crate::weapon_world::terrain_visual(self.owned,event,visual)}
    fn split_armor(&mut self,_:e::Identity,_:bool,_:&[Point],_:&mut Random)->Result<(),u32>{Err(8)}
    fn cool_hulk_source(&mut self,_:e::Identity,_:f64,_:f64,_:&mut Random)->Result<(),u32>{Err(8)}
}
