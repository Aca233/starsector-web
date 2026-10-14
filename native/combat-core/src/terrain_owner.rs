//! Synchronous terrain adapter over the SAME resident Body/ShipState/Ordnance.
//! Metadata is admitted once, never refreshed from a JavaScript frame mirror.
use crate::{battle::Ordnance,contact::{self,Point},lifecycle::Spec,motion,projectile::Projectile,random::Random,
    ship_effects as effects,ship_state::{self,Notice},state::{Body,Handle},terrain_world as t};
use std::{cell::{Cell,RefCell},collections::BTreeMap};
pub type Identity=t::Identity;
pub fn identity(b:&Body)->Identity{Identity{id:b.id as f64,generation:b.handle.generation}}
#[derive(Clone)]pub struct Module{pub parent:Identity,pub offset:Point,pub angle:f64,pub independent:bool}
#[derive(Clone)]pub struct Meta{
    pub identity:Identity,pub handle:Handle,pub stable_id:String,pub mass:f64,pub station:bool,pub module:Option<Module>,pub children:Vec<Identity>,
    pub sprite_height:f64,pub slots:Vec<(u32,Point)>,pub terrain_speed:f64,
    /// These are real inherited assembly flags. World-owner services must use
    /// the same fields, not independently cached copies.
    pub emergency_phase_used:bool,pub fighter_recall:bool,
}
#[derive(Clone,Default)]pub struct Owned{pub ships:Vec<Meta>,pub active:Vec<Identity>,pub terrain:t::Terrain}
impl Owned{
    pub fn meta(&self,id:Identity)->Result<&Meta,u32>{self.ships.iter().find(|m|m.identity==id).ok_or(4)}
    pub fn row(&self,bodies:&[Body],id:Identity)->Result<usize,u32>{let m=self.meta(id)?;bodies.iter().position(|b|identity(b)==id&&b.handle==m.handle).ok_or(4)}
    pub fn root(&self,id:Identity)->Result<Identity,u32>{let mut root=id;for _ in 0..=self.ships.len(){match &self.meta(root)?.module{Some(m)=>root=m.parent,None=>return Ok(root)}}Err(8)}
    pub fn validate(&self,bodies:&[Body],specs:&BTreeMap<u32,Spec>)->Result<(),u32>{
        for(i,m)in self.ships.iter().enumerate(){if self.ships[..i].iter().any(|p|p.identity==m.identity||p.handle==m.handle){return Err(8);}let row=self.row(bodies,m.identity)?;
            let s=bodies[row].ship.as_ref().ok_or(8u32)?;let c=s.combat.as_ref().ok_or(8u32)?;if !c.complete(s.weapons.as_ref().map_or(0,|w|w.mounts.len()))||s.armor.is_none()||s.shield.is_none(){return Err(8);}
            if !m.mass.is_finite()||m.mass<=0.0||!m.sprite_height.is_finite()||m.sprite_height<=0.0||!m.terrain_speed.is_finite()||m.slots.iter().any(|(_,p)|!p.iter().all(|v|v.is_finite())){return Err(7);}
            for system in &s.systems{if !specs.contains_key(&system.spec){return Err(8);}}
            if let Some(module)=&m.module{if !module.offset.iter().all(|v|v.is_finite())||!module.angle.is_finite(){return Err(7);}if !self.meta(module.parent)?.children.contains(&m.identity){return Err(8);}}
            for(j,child)in m.children.iter().enumerate(){if m.children[..j].contains(child)||self.meta(*child)?.module.as_ref().is_none_or(|p|p.parent!=m.identity){return Err(8);}self.row(bodies,*child)?;}
            self.root(m.identity)?;
        }
        for(i,id)in self.active.iter().enumerate(){if self.active[..i].contains(id){return Err(8);}self.row(bodies,*id)?;}
        Ok(())
    }
    pub fn admit_hulk(&mut self,bodies:&[Body],h:crate::world_damage::Hulk)->Result<(),u32>{let row=self.row(bodies,h.source)?;let c=bodies[row].ship.as_ref().and_then(|s|s.combat.as_ref()).ok_or(8u32)?;
        let meta=self.meta(h.source)?;let(height,slots)=(meta.sprite_height,meta.slots.clone());self.terrain.admit_hulk(h,Some(c.size+1),height,&slots)}
    pub fn speed(&self,id:Identity)->Result<f64,u32>{Ok(self.meta(id)?.terrain_speed)}
}
#[derive(Clone,Copy)]pub struct ProjectileIdentity{pub serial:f64,pub id:f64}
/// Implemented by the full Rust world owner. These mandatory services are
/// actual mutations/factories; no deferred JS gameplay or no-op default exists.
pub trait World{
    fn phased(&self,bodies:&[Body],owned:&Owned,specs:&BTreeMap<u32,Spec>,target:Identity)->Result<bool,u32>;
    fn hull(&mut self,bodies:&mut[Body],owned:&mut Owned,ordnance:&mut Ordnance,specs:&BTreeMap<u32,Spec>,target:Identity,damage:f64,notices:&mut Vec<(u32,Handle,Notice)>)->Result<f64,u32>;
    fn retreat(&mut self,bodies:&mut[Body],owned:&mut Owned,ordnance:&mut Ordnance,specs:&BTreeMap<u32,Spec>,target:Identity,notices:&mut Vec<(u32,Handle,Notice)>)->Result<(),u32>;
    fn armor_sparks(&mut self,position:Point,damage:f64,visual:&mut Random)->Result<(),u32>;
    fn debris(&mut self,position:Point,count:u32,color:[u8;3],speed:f64,visual:&mut Random)->Result<(),u32>;
    fn sparks(&mut self,position:Point,count:u32,color:[u8;3],visual:&mut Random)->Result<(),u32>;
    fn explosion_visual(&mut self,position:Point,radius:f64,color:[u8;3],visual:&mut Random)->Result<(),u32>;
    fn audio_notices(&mut self,notices:&[Notice])->Result<(),u32>;
    fn audio_listener(&mut self,bodies:&[Body])->Result<(),u32>;
    fn output(&mut self,event:t::Output);
    fn visual_output(&mut self,event:t::Output,_visual:&mut Random)->Result<(),u32>{self.output(event);Ok(())}
    fn environment_impact(&mut self,bodies:&mut[Body],owned:&mut Owned,ordnance:&mut Ordnance,specs:&BTreeMap<u32,Spec>,projectile:ProjectileIdentity,
        point:Point,velocity:Point,asteroid:Option<f64>,random:&mut Random,visual:&mut Random,notices:&mut Vec<(u32,Handle,Notice)>)->Result<(),u32>;
}
pub struct Host<'a,W>{pub bodies:&'a mut[Body],pub owned:&'a mut Owned,pub ordnance:&'a mut Ordnance,pub specs:&'a BTreeMap<u32,Spec>,pub world:&'a mut W,
    pub notices:&'a mut Vec<(u32,Handle,Notice)>,pub projectile:Option<ProjectileIdentity>,error:Cell<Option<u32>>,
    identity_index:RefCell<Option<IdentityIndex>>,hull_extents:RefCell<BTreeMap<(u32,u32),f64>>,identity_index_valid:bool}
struct IdentityIndex{meta_rows:BTreeMap<(u64,u32),usize>,body_rows:BTreeMap<(u64,u32,u32,u32),usize>}
fn identity_key(id:Identity)->(u64,u32){(if id.id==0.0{0}else{id.id.to_bits()},id.generation)}
impl<'a,W:World> Host<'a,W>{
    pub fn new(bodies:&'a mut[Body],owned:&'a mut Owned,ordnance:&'a mut Ordnance,specs:&'a BTreeMap<u32,Spec>,world:&'a mut W,notices:&'a mut Vec<(u32,Handle,Notice)>)->Self{
        Self{bodies,owned,ordnance,specs,world,notices,projectile:None,error:Cell::new(None),identity_index:RefCell::new(None),hull_extents:RefCell::new(BTreeMap::new()),identity_index_valid:false}}
    pub(crate) fn new_resident(bodies:&'a mut[Body],owned:&'a mut Owned,ordnance:&'a mut Ordnance,specs:&'a BTreeMap<u32,Spec>,world:&'a mut W,notices:&'a mut Vec<(u32,Handle,Notice)>)->Self{
        let mut host=Self::new(bodies,owned,ordnance,specs,world,notices);host.identity_index_valid=true;host}
    fn ensure_index(&self){if self.identity_index.borrow().is_some(){return;}let mut meta_rows=BTreeMap::new();for(i,m)in self.owned.ships.iter().enumerate(){meta_rows.entry(identity_key(m.identity)).or_insert(i);}
        let mut body_rows=BTreeMap::new();for(i,b)in self.bodies.iter().enumerate(){let(k,g)=identity_key(identity(b));body_rows.entry((k,g,b.handle.slot,b.handle.generation)).or_insert(i);}
        *self.identity_index.borrow_mut()=Some(IdentityIndex{meta_rows,body_rows});}
    fn invalidate_callback(&mut self){*self.identity_index.get_mut()=None;self.hull_extents.get_mut().clear();}
    fn meta(&self,id:Identity)->Result<&Meta,u32>{if self.identity_index_valid{self.ensure_index();if let Some(&r)=self.identity_index.borrow().as_ref().unwrap().meta_rows.get(&identity_key(id)){if let Some(m)=self.owned.ships.get(r).filter(|m|m.identity==id){return Ok(m);}}}self.owned.meta(id)}
    fn row(&self,id:Identity)->Result<usize,u32>{let m=self.meta(id)?;let(k,g)=identity_key(id);if self.identity_index_valid{if let Some(&r)=self.identity_index.borrow().as_ref().unwrap().body_rows.get(&(k,g,m.handle.slot,m.handle.generation)){
        if self.bodies.get(r).is_some_and(|b|identity(b)==id&&b.handle==m.handle){return Ok(r);}}
        }self.bodies.iter().position(|b|identity(b)==id&&b.handle==m.handle).ok_or(4)}
    fn root(&self,id:Identity)->Result<Identity,u32>{let mut root=id;for _ in 0..=self.owned.ships.len(){match &self.meta(root)?.module{Some(m)=>root=m.parent,None=>return Ok(root)}}Err(8)}
    fn hull_extent(&self,b:&Body)->Result<f64,u32>{let s=b.ship.as_ref().ok_or(8u32)?;let c=s.combat.as_ref().ok_or(8u32)?;let key=(b.handle.slot,b.handle.generation);
        if !self.identity_index_valid{return Ok(c.bounds.iter().fold(c.radius,|r,p|r.max(contact::length(*p))));}
        if let Some(&r)=self.hull_extents.borrow().get(&key){return Ok(r);}let r=c.bounds.iter().fold(c.radius,|r,p|r.max(contact::length(*p)));self.hull_extents.borrow_mut().insert(key,r);Ok(r)}
    fn finish<T>(&self,result:Result<T,u32>)->Result<T,u32>{if let Some(e)=self.error.get(){Err(e)}else{result}}
    fn record(&mut self,row:usize,events:Vec<Notice>){if let Err(error)=self.world.audio_notices(&events){self.error.set(Some(error));}let b=&self.bodies[row];self.notices.extend(events.into_iter().map(|n|(b.id,b.handle,n)));}
    fn modifiers(&self,row:usize)->Result<effects::Modifiers,u32>{let s=self.bodies[row].ship.as_ref().ok_or(8u32)?;
        // Generic foundation ships have no world callback dictionaries. A
        // configured extension must resolve its real admitted metadata/specs.
        if s.world.is_none(){return Ok(s.live.clone());}for system in &s.systems{if !self.specs.contains_key(&system.spec)||s.world.as_ref().unwrap().metas.get(&system.id).is_none(){return Err(8);}}
        crate::system_owner::modifiers(self.bodies,row,self.specs)
    }
    fn refresh(&mut self,row:usize)->Result<(),u32>{let live=self.modifiers(row)?;self.bodies[row].ship.as_mut().ok_or(8u32)?.live=live;Ok(())}
    pub fn read(&self,id:Identity)->Result<t::Ship,u32>{let row=self.row(id)?;let meta=self.meta(id)?;let b=&self.bodies[row];let s=b.ship.as_ref().ok_or(8u32)?;let c=s.combat.as_ref().ok_or(8u32)?;
        let sh=s.shield.as_ref().ok_or(8u32)?;let live=self.modifiers(row)?;
        Ok(t::Ship{id,stable_id:meta.stable_id.clone(),root:self.root(id)?,team:Some(c.team),dead:s.flags&ship_state::DEAD!=0,collisionless:c.collisionless(b)||self.world.phased(self.bodies,self.owned,self.specs,id)?||live.get(effects::COLLISION_DISABLED)>0.0,
            position:[b.motion[motion::X],b.motion[motion::Y]],velocity:[b.motion[motion::VX],b.motion[motion::VY]],facing:b.motion[motion::FACING],radius:c.radius,mass:meta.mass,station:meta.station,bounds:c.bounds.clone(),
            shield:t::Shield{active:sh.active(),kind:sh.kind(),center:contact::shield_center(sh,&b.motion),radius:sh.data[2],arc:sh.data[7],facing:if sh.kind()==crate::shield::FRONT{b.motion[motion::FACING]}else{sh.data[8]},void:sh.void.is_some()},
            cr_taken:c.attrs[1],system_shield:c.attrs[2]*live.get(effects::SHIELD_DAMAGE)})
    }
    fn sync_tree(&mut self,id:Identity,path:&mut Vec<Identity>)->Result<(),u32>{if path.contains(&id){return Err(8);}path.push(id);let children=self.meta(id)?.children.clone();
        for child in children{let row=self.row(child)?;let parent=self.row(id)?;let module=self.meta(child)?.module.clone().ok_or(8u32)?;if module.parent!=id{return Err(8);}
            if self.bodies[row].ship.as_ref().ok_or(8u32)?.flags&ship_state::DEAD==0{let pose=self.bodies[parent].motion;let pc=self.bodies[parent].ship.as_ref().and_then(|s|s.combat.as_ref()).ok_or(8u32)?;let(team,player)=(pc.team,pc.player);
                let retreated=self.bodies[parent].ship.as_ref().unwrap().flags&ship_state::RETREATED!=0;let offset=contact::rotate(module.offset,pose[motion::FACING]);let b=&mut self.bodies[row];
                b.motion[motion::X]=pose[motion::X]+offset[0];b.motion[motion::Y]=pose[motion::Y]+offset[1];
                if !module.independent{b.motion[motion::FACING]=pose[motion::FACING]+module.angle;b.motion[motion::ANGULAR]=pose[motion::ANGULAR];}
                b.motion[motion::VX]=pose[motion::VX]+ -offset[1]*pose[motion::ANGULAR];b.motion[motion::VY]=pose[motion::VY]+offset[0]*pose[motion::ANGULAR];
                let c=b.ship.as_mut().unwrap().combat.as_mut().ok_or(8u32)?;c.team=team;c.player=player;
                let flags=self.meta(id)?;let(phase,recall)=(flags.emergency_phase_used,flags.fighter_recall);let cm=self.owned.ships.iter_mut().find(|m|m.identity==child).ok_or(4u32)?;cm.emergency_phase_used=phase;cm.fighter_recall=recall;
                if retreated{self.invalidate_callback();self.world.retreat(self.bodies,self.owned,self.ordnance,self.specs,child,self.notices)?;}
            }self.sync_tree(child,path)?;
        }path.pop();Ok(())
    }
    pub fn pair(&mut self,first:Identity,second:Identity,random:&mut Random,visual:&mut Random)->Result<bool,u32>{
        if self.root(first)?==self.root(second)?{return Ok(false);}
        let a=&self.bodies[self.row(first)?];let b=&self.bodies[self.row(second)?];
        let extent=|b:&Body|->Result<f64,u32>{let s=b.ship.as_ref().ok_or(8u32)?;let c=s.combat.as_ref().ok_or(8u32)?;let sh=s.shield.as_ref().ok_or(8u32)?;
            let hull=self.hull_extent(b)?;let _=c;
            let shield=if sh.active(){sh.data[2]+contact::length([sh.data[29],sh.data[30]])}else{0.0};Ok(hull.max(shield))};
        let span=extent(a)?+extent(b)?;let distance=contact::length([a.motion[0]-b.motion[0],a.motion[1]-b.motion[1]]);
        if distance>span+1e-7*distance.max(span).max(1.0){return Ok(false);}
        let result=t::ship_collision(first,second,self,random,visual);self.finish(result)
    }
    pub fn nebula(&mut self)->Result<(),u32>{let result=t::nebula(self);self.finish(result)}
    pub fn asteroid_collisions(&mut self,random:&mut Random,visual:&mut Random)->Result<(),u32>{let mut local=t::Terrain::default();local.asteroids=std::mem::take(&mut self.owned.terrain.asteroids);
        let result=local.resolve_asteroids(self,random,visual);self.owned.terrain.asteroids=local.asteroids;self.finish(result)}
    pub fn advance_hulks(&mut self,dt:f64,visual:&mut Random)->Result<(),u32>{let mut local=t::Terrain::default();local.hulks=std::mem::take(&mut self.owned.terrain.hulks);local.sequences=std::mem::take(&mut self.owned.terrain.sequences);local.next_sequence=self.owned.terrain.next_sequence;
        let result=local.advance_hulks(dt,self,visual);self.owned.terrain.hulks=local.hulks;self.owned.terrain.sequences=local.sequences;self.owned.terrain.next_sequence=local.next_sequence;self.finish(result)}
    pub fn asteroid_commit(&mut self,p:&t::Projectile,hit:t::AsteroidHit,feedback:bool,random:&mut Random,visual:&mut Random)->Result<(),u32>{let mut local=t::Terrain::default();local.asteroids=std::mem::take(&mut self.owned.terrain.asteroids);
        let result=local.commit_projectile(p,hit,feedback,self,random,visual);self.owned.terrain.asteroids=local.asteroids;self.finish(result)}
    pub fn hulk_commit(&mut self,projectile:ProjectileIdentity,hit:t::HulkHit,random:&mut Random,visual:&mut Random)->Result<(),u32>{if !self.owned.terrain.hulks.iter().any(|h|h.id==hit.id){return Err(4);}
        let old=self.projectile.replace(projectile);let result=t::hulk_impact(projectile.id,hit,self,random,visual);self.projectile=old;self.finish(result)}
    pub fn impact(&mut self,projectile:ProjectileIdentity,point:Point,velocity:Point,asteroid:Option<f64>,random:&mut Random,visual:&mut Random)->Result<(),u32>{
        let p=self.ordnance.projectiles.iter_mut().find(|p|p.serial==projectile.serial&&p.id==projectile.id).ok_or(4u32)?;p.pos=point;
        self.invalidate_callback();
        self.world.environment_impact(self.bodies,self.owned,self.ordnance,self.specs,projectile,point,velocity,asteroid,random,visual,self.notices)
    }
}
impl<W:World> t::Host for Host<'_,W>{
    fn ships(&self)->Vec<Identity>{self.owned.active.clone()}
    fn ship(&self,id:Identity)->Option<t::Ship>{match self.read(id){Ok(s)=>Some(s),Err(e)=>{self.error.set(Some(e));None}}}
    fn ship_near_circle(&self,id:Identity,position:Point,radius:f64)->Result<Option<t::Ship>,u32>{
        let b=&self.bodies[self.row(id)?];let s=b.ship.as_ref().ok_or(8u32)?;
        if s.flags&ship_state::DEAD!=0{return Ok(None);}
        let c=s.combat.as_ref().ok_or(8u32)?;let sh=s.shield.as_ref().ok_or(8u32)?;
        let hull=self.hull_extent(b)?;let _=c;
        let shield=if sh.active(){sh.data[2]+contact::length([sh.data[29],sh.data[30]])}else{0.0};
        let span=hull.max(shield)+radius.max(0.0);let distance=contact::length([b.motion[0]-position[0],b.motion[1]-position[1]]);
        if distance>span+1e-7*distance.max(span).max(1.0){return Ok(None);}self.read(id).map(Some)
    }
    fn move_root(&mut self,id:Identity,position:Point,velocity:Point)->Result<(),u32>{if self.root(id)?!=id{return Err(8);}let row=self.row(id)?;let b=&mut self.bodies[row];
        b.motion[motion::X]+=position[0];b.motion[motion::Y]+=position[1];b.motion[motion::VX]+=velocity[0];b.motion[motion::VY]+=velocity[1];Ok(())}
    fn sync_modules(&mut self,id:Identity)->Result<(),u32>{self.sync_tree(id,&mut Vec::new())}
    fn terrain_speed(&mut self,id:Identity,value:f64)->Result<(),u32>{self.owned.row(self.bodies,id)?;self.owned.ships.iter_mut().find(|m|m.identity==id).ok_or(4u32)?.terrain_speed=value;Ok(())}
    fn shield_contact(&mut self,id:Identity,damage:f64)->Result<(),u32>{let row=self.owned.row(self.bodies,id)?;let sh=self.bodies[row].ship.as_mut().and_then(|s|s.shield.as_mut()).ok_or(8u32)?;if damage>0.0{sh.data[28]=0.0;}Ok(())}
    fn shield_absorb(&mut self,id:Identity,damage:f64,kind:u32,angle:f64)->Result<t::Absorption,u32>{let row=self.owned.row(self.bodies,id)?;self.refresh(row)?;
        let s=self.bodies[row].ship.as_mut().ok_or(8u32)?;let sh=s.shield.as_mut().ok_or(8u32)?;let(flux,absorbed,remainder)=sh.impact(damage,kind,angle);s.sync_shield();
        if ![flux,absorbed,remainder].into_iter().all(f64::is_finite){return Err(7);}Ok(t::Absorption{flux,absorbed,remainder})}
    fn shield_flux(&mut self,id:Identity,flux:f64)->Result<(),u32>{let row=self.owned.row(self.bodies,id)?;let mut notices=Vec::new();self.bodies[row].ship.as_mut().ok_or(8u32)?.flux_operation(0,flux,true,&mut notices);self.record(row,notices);Ok(())}
    fn armor(&mut self,id:Identity,local:Point,damage:f64,kind:u32,strength:f64,visual:&mut Random)->Result<t::Damage,u32>{let row=self.owned.row(self.bodies,id)?;self.refresh(row)?;
        let mut notices=Vec::new();let s=self.bodies[row].ship.as_mut().ok_or(8u32)?;let result=s.armor_impact(&[local[0],local[1],damage,kind as f64,1.0,strength,0.0,0.0],visual,&mut notices)?;
        if notices.iter().any(|n|n.kind==crate::ship_state::CELL_DAMAGE&&n.value>0.0){let root=self.owned.root(id)?;let root_row=self.owned.row(self.bodies,root)?;
            if let Some(v)=self.bodies[root_row].ship.as_mut().and_then(|s|s.shield.as_mut()).and_then(|sh|sh.void.as_mut()){v.data[7]=v.data[3];}}
        self.record(row,notices);
        Ok(t::Damage{armor:result[0],hull:result[1]})}
    fn components(&mut self,id:Identity,local:Point,damage:t::Damage,source:Option<Identity>,random:&mut Random)->Result<(),u32>{let source=if let Some(source)=source{let row=self.owned.row(self.bodies,source)?;let s=self.bodies[row].ship.as_ref().ok_or(8u32)?;[s.damage_policy[3],s.damage_policy[4]]}else{[1.0;2]};
        let row=self.owned.row(self.bodies,id)?;self.refresh(row)?;let mut notices=Vec::new();self.bodies[row].ship.as_mut().ok_or(8u32)?.propagate(local,[damage.armor,damage.hull],0.0,source,random,&mut notices)?;self.record(row,notices);Ok(())}
    fn armor_sparks(&mut self,id:Identity,local:Point,damage:f64,visual:&mut Random)->Result<(),u32>{let row=self.owned.row(self.bodies,id)?;let b=&self.bodies[row];if b.ship.as_ref().and_then(|s|s.armor.as_ref()).ok_or(8u32)?.data[18]==1.0{return Ok(());}let off=contact::rotate(local,b.motion[motion::FACING]);
        self.world.armor_sparks([b.motion[motion::X]+off[0],b.motion[motion::Y]+off[1]],damage,visual)}
    fn hull(&mut self,id:Identity,damage:f64)->Result<(),u32>{self.row(id)?;self.invalidate_callback();self.world.hull(self.bodies,self.owned,self.ordnance,self.specs,id,damage,self.notices)?;Ok(())}
    fn debris(&mut self,p:Point,count:u32,c:[u8;3],speed:f64,v:&mut Random)->Result<(),u32>{self.world.debris(p,count,c,speed,v)}
    fn sparks(&mut self,p:Point,count:u32,c:[u8;3],v:&mut Random)->Result<(),u32>{self.world.sparks(p,count,c,v)}
    fn explosion_visual(&mut self,p:Point,r:f64,c:[u8;3],v:&mut Random)->Result<(),u32>{self.world.explosion_visual(p,r,c,v)}
    fn output(&mut self,event:t::Output){if matches!(event,t::Output::Sound{..}){if let Err(error)=self.world.audio_listener(self.bodies){self.error.set(Some(error));}}self.world.output(event)}
    fn visual_output(&mut self,event:t::Output,visual:&mut Random)->Result<(),u32>{self.world.visual_output(event,visual)}
    fn split_armor(&mut self,id:Identity,initial:bool,seam:&[Point],visual:&mut Random)->Result<(),u32>{let row=self.owned.row(self.bodies,id)?;t::resident_split_armor(self.bodies[row].ship.as_mut().ok_or(8u32)?,initial,seam,visual)}
    fn cool_hulk_source(&mut self,id:Identity,dt:f64,facing:f64,visual:&mut Random)->Result<(),u32>{let row=self.owned.row(self.bodies,id)?;let pose=self.bodies[row].motion;let s=self.bodies[row].ship.as_mut().ok_or(8u32)?;
        // Primary cooldown has real content-adjusted regen, including state
        // mutations made before death. Generic lifecycle alone cannot guess it.
        let mut specs=self.specs.clone();if let Some(system)=s.systems.first(){if let Some(w)=&s.world{let meta=w.metas.get(&system.id).ok_or(8u32)?;specs.get_mut(&system.spec).ok_or(8u32)?.regen=meta.regen;}}
        t::resident_cool_hulk_source(s,dt,facing,[pose[motion::X],pose[motion::Y]],&specs,visual)?;s.sync_shield();Ok(())}
}
impl<W:World> t::EnvironmentHost for Host<'_,W>{
    fn environment_impact(&mut self,id:f64,point:Point,velocity:Point,asteroid:Option<f64>,random:&mut Random,visual:&mut Random)->Result<(),u32>{let p=self.projectile.ok_or(8u32)?;if p.id!=id{return Err(4);}self.impact(p,point,velocity,asteroid,random,visual)}
}
pub fn projectile_input(p:&Projectile,damaged_asteroids:&[f64],damaged_hulks:&[f64])->t::Projectile{t::Projectile{id:p.id,previous:p.prev,position:p.pos,radius:p.delivery.radius,damage:p.damage,
    rocket:p.delivery.missile||p.guidance.as_ref().is_some_and(|g|g.rocket),damaged_asteroids:damaged_asteroids.to_vec(),damaged_hulks:damaged_hulks.to_vec()}}
