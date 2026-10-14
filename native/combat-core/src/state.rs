use crate::{armor::{self, Armor}, component::{self, Component}, engine::{self, Controller}, weapon::{self,Group}, motion, random::Random, lifecycle::{self, Spec, System}, ship_state::{self, ShipState, Notice}, shield::{self, Shield}};
use std::{borrow::Cow, collections::{BTreeMap, BTreeSet}};

pub const COMMAND_WIDTH: usize = 4 + motion::WIDTH;
pub const OUTPUT_HEADER: usize = 44;
pub const BODY_WIDTH: usize = 4 + motion::WIDTH + 1 + ship_state::WIDTH;
pub const SYSTEM_WIDTH: usize = 3 + lifecycle::WIDTH + lifecycle::POLICY_WIDTH + 1;
pub const SHIELD_WIDTH: usize = 3 + shield::WIDTH;
pub const ARMOR_WIDTH: usize = 3 + armor::WIDTH + 2;
pub const SCAR_WIDTH: usize = 3 + armor::SCAR_WIDTH;
pub const COMPONENT_WIDTH: usize = 3 + component::WIDTH;
pub const ENGINE_CONTROLLER_WIDTH: usize = 3 + engine::WIDTH + 2;
pub const ENGINE_WIDTH: usize = 3 + engine::SLOT_WIDTH;
pub const WEAPON_CONTROLLER_WIDTH:usize=3+weapon::WIDTH+4;
pub const WEAPON_MOUNT_WIDTH:usize=3+weapon::MOUNT_WIDTH;
pub const WEAPON_GROUP_WIDTH:usize=3+weapon::GROUP_WIDTH+2;
pub const EVENT_WIDTH: usize = 10;
pub const ABI: u32 = 13;
// Foundations only: never advertise complete ability/content/battle readiness.
pub const DOMAIN_MASK: u32 = 524287;
const MAX_INTEGER: f64 = 9_007_199_254_740_991.0;

#[derive(Clone, Copy, PartialEq, Eq)]
pub struct Handle { pub slot: u32, pub generation: u32 }
pub struct Body {
    pub id: u32, pub handle: Handle, pub order: f64,
    pub motion: [f64; motion::WIDTH], pub ship: Option<ShipState>,
}
impl Clone for Body {
    fn clone(&self) -> Self {
        Self {id: self.id, handle: self.handle, order: self.order, motion: self.motion, ship: self.ship.clone()}
    }
    fn clone_from(&mut self, source: &Self) {
        self.id = source.id; self.handle = source.handle; self.order = source.order;
        self.motion = source.motion; self.ship.clone_from(&source.ship);
    }
}
#[derive(Clone)]pub struct Slot { pub generation: u32, pub body: Option<Body> }
#[derive(Clone)]pub struct Event { body: u32, handle: Handle, tick: f64, sequence: f64, notice: Notice }
enum Structure { Spawn(u32, [f64; motion::WIDTH]), Despawn(u32) }
#[derive(Clone)]pub struct Core {
    pub tick: f64, pub time: f64, pub random: Random, pub visual_random: Random,
    pub slots: Vec<Slot>, free: Vec<u32>, pub roster: Vec<Handle>, ids: BTreeMap<u32, Handle>,
    next_order: f64, specs: BTreeMap<u32, Spec>, events: Vec<Event>, sequence: f64, acknowledged: f64,
    next_numeric_id:u32,
    births:BTreeMap<u32,crate::flight_admission::Born>,
    pub input: Vec<f64>, pub output: Vec<f64>, scratch: Vec<Body>, notices: Vec<(u32, Handle, Notice)>,
    pub scene_output:Vec<f64>,pub summary_output:[f64;10],pub audio_output:Vec<f64>,
    command_results:Vec<crate::scene_commands::Outcome>,
    local_notices: Vec<Notice>,
    pub ordnance:crate::battle::Ordnance,ordnance_scratch:crate::battle::Ordnance,
    world:Option<crate::world_owner::Owned>,
    pub scene:Option<crate::scene_owner::Owned>,
    startup_random_installed:bool,
    startup_states:BTreeMap<u32,crate::startup_wire::Initial>,
}
fn integer(value: f64) -> Option<u32> {
    if value.is_finite() && value >= 0.0 && value <= u32::MAX as f64 && value.fract() == 0.0 {
        Some(value as u32)
    } else { None }
}
fn flux_config(row: &[f64]) -> bool {
    row[0] >= 0.0 && row[1] >= 0.0 && integer(row[2]).is_some_and(|n| n <= 4)
        && [3, 4, 6, 7].iter().all(|&field| row[field] >= 0.0)
}
fn valid_spec(row: &[f64]) -> bool {
    [0, 1, 2, 3, 4, 6, 7].iter().all(|&field| row[field] >= 0.0)
        && row[0] + row[2] < f64::INFINITY
        && row[4].fract() == 0.0 && row[4] <= MAX_INTEGER
        && (row[5] == -1.0 || (row[5] >= 0.0 && row[5].fract() == 0.0 && row[5] <= MAX_INTEGER))
        && integer(row[8]).is_some_and(|n| n <= 127) && row[9] == 0.0
        && (row[1].is_finite() || (row[8] as u32 & lifecycle::TOGGLE != 0))
}
fn boolean(value: f64) -> bool { value == 0.0 || value == 1.0 }
fn explosion_spec(row:&[f64])->Result<crate::explosion_effects::Spec,u32>{use crate::explosion_effects::{Spec,Collision};let collision=match integer(row[4]).ok_or(2u32)?{
    0=>Collision::ShipsAndAsteroids,1=>Collision::MissileFF,2=>Collision::MissileNoFF,3=>Collision::ProjectileFF,4=>Collision::ProjectileNoFF,5=>{if !boolean(row[5]){return Err(2);}Collision::Other{no_ff:row[5]==1.0}},_=>return Err(2)};
    let s=Spec{radius:row[0],core:row[1],duration:row[2],minimum_fraction:row[3],collision};if s.valid(){Ok(s)}else{Err(2)}}
fn shield_config(row: &[f64]) -> bool {
    integer(row[0]).is_some_and(|n| n <= 3)
        && (1..=11).all(|i| row[i] >= 0.0) && [13, 14, 17, 18].iter().all(|&i| boolean(row[i]))
}
impl Core {
    pub fn new(seed: u32, visual_seed: u32) -> Self {
        Self {tick: 0.0, time: 0.0, random: Random::new(seed), visual_random: Random::new(visual_seed),
            slots: Vec::new(), free: Vec::new(), roster: Vec::new(), ids: BTreeMap::new(), next_order: 0.0,
            specs: BTreeMap::new(), events: Vec::new(), sequence: 0.0, acknowledged: 0.0,
            next_numeric_id:1,births:BTreeMap::new(),
            input: Vec::new(), output: Vec::new(), scene_output:Vec::new(),summary_output:[0.0;10],audio_output:Vec::new(),command_results:Vec::new(), scratch: Vec::new(), notices: Vec::new(), local_notices: Vec::new(),
            ordnance:crate::battle::Ordnance::new(),ordnance_scratch:crate::battle::Ordnance::new(),world:None,scene:None,startup_random_installed:false,startup_states:BTreeMap::new()}
    }
    pub fn apply(&mut self, words: usize) -> Result<(), u32> {
        if words > self.input.len() || words % COMMAND_WIDTH != 0 { return Err(2); }
        if self.scene.is_some()&&self.startup_random_installed{return self.apply_scene_commands(words);}
        // Preview only addressed bodies; no full-world cloning or JS solver.
        let mut touched = BTreeMap::<u32, Body>::new();
        let mut specs = Cow::Borrowed(&self.specs);
        let mut born = BTreeSet::new(); let mut removed = BTreeSet::new();
        let mut structures = Vec::new(); let mut notices = Vec::new(); let mut spawn_count = 0usize;
        let mut random = self.random.clone(); let mut visual = self.visual_random.clone();
        let mut world=self.world.clone();
        let mut scene=self.scene.clone();
        let mut ordnance=self.ordnance.clone();
        let mut startup_random_installed=self.startup_random_installed;
        let mut startup_states=self.startup_states.clone();
        for cmd in self.input[..words].chunks_exact(COMMAND_WIDTH) {
            let tag = integer(cmd[0]).ok_or(2u32)?; let id = integer(cmd[1]).ok_or(2u32)?;
            let slot = integer(cmd[2]).ok_or(2u32)?; let generation = integer(cmd[3]).ok_or(2u32)?;
            let row: &[f64; motion::WIDTH] = cmd[4..].try_into().map_err(|_| 2u32)?;
            if !row.iter().enumerate().all(|(field, n)| n.is_finite() || (*n==f64::INFINITY&&
                ((tag==10&&field==1)||(tag==111&&field==6)||(tag==114&&field==6)))) { return Err(2); }
            if tag==104{
                if id!=0||slot!=0||generation!=0||self.tick!=0.0||self.time!=0.0||startup_random_installed
                    ||row[6..].iter().any(|n|*n!=0.0){return Err(8);}
                if startup_states.values().any(|s|!s.complete){return Err(8);}
                if let Some(w)=&world{if let Some(p)=&w.phase{
                    let bodies:Vec<_>=self.roster.iter().map(|h|{let b=self.slots[h.slot as usize].body.as_ref().unwrap();touched.get(&b.id).unwrap_or(b).clone()}).collect();
                    if !p.complete(&bodies,&specs){return Err(8);}
                }if let Some(ai)=&w.ai{let bodies:Vec<_>=self.roster.iter().map(|h|{let b=self.slots[h.slot as usize].body.as_ref().unwrap();touched.get(&b.id).unwrap_or(b).clone()}).collect();
                    ai.validate(&bodies,&specs).map_err(|_|8u32)?;}if let Some(m)=&w.motion{let bodies:Vec<_>=self.roster.iter().map(|h|{let b=self.slots[h.slot as usize].body.as_ref().unwrap();touched.get(&b.id).unwrap_or(b).clone()}).collect();m.validate(&bodies)?;}}
                if let Some(s)=&scene{let bodies:Vec<_>=self.roster.iter().map(|h|{let b=self.slots[h.slot as usize].body.as_ref().unwrap();touched.get(&b.id).unwrap_or(b).clone()}).collect();s.validate(&bodies)?;
                    s.prelude.as_ref().ok_or(8u32)?.validate(&bodies)?;s.read.validate(&bodies)?;s.system_read.validate(&bodies)?;let w=world.as_mut().ok_or(8u32)?;
                    if !w.phase.as_ref().ok_or(8u32)?.complete(&bodies,&specs)||!w.gravity.as_ref().ok_or(8u32)?.complete(&bodies,&ordnance){return Err(8);}
                    w.ai.as_ref().ok_or(8u32)?.validate(&bodies,&specs).map_err(|_|8u32)?;w.motion.as_ref().ok_or(8u32)?.validate(&bodies)?;
                    crate::aux_runtime::complete(w.aux.as_ref().ok_or(8u32)?,&bodies,&ordnance)?;let f=w.flight.as_ref().ok_or(8u32)?;
                    if !w.visual.installed||w.visual.admission.is_some()||w.visual.metas.len()!=bodies.len(){return Err(8);}
                    if f.admission.is_some()||f.stage!=crate::flight_runtime::Stage::Closed{return Err(8);}w.set_scope(&bodies,crate::scene_control::active(w,&bodies)?)?;
                    w.visual.begin_frame([bodies.iter().find(|b|b.handle==s.player).ok_or(4u32)?.motion[0],bodies.iter().find(|b|b.handle==s.player).unwrap().motion[1]])?;
                    for b in &bodies{w.visual.ship_prepare(b.handle,0.0,b.ship.as_ref().ok_or(8u32)?.flux.boost)?;}
                }
                for (offset,current) in [(0,&random),(3,&visual)]{
                    if integer(row[offset])!=Some(current.seed)||row[offset+1]<row[offset]||row[offset+1].fract()!=0.0
                        ||row[offset+2]<0.0||row[offset+2]>MAX_INTEGER||row[offset+2].fract()!=0.0{return Err(2);}
                }
                random.cursor=row[1];random.ids=row[2];visual.cursor=row[4];visual.ids=row[5];
                if let Some(s)=scene.as_mut(){let startup=s.startup.clone();startup.finish(s,world.as_mut().ok_or(8u32)?,&mut visual)?;}
                startup_random_installed=true;continue;
            }
            if tag == 10 {
                if slot != 0 || generation != 0 || !valid_spec(row) { return Err(2); }
                if specs.contains_key(&id) { return Err(8); }
                specs.to_mut().insert(id, Spec::new(row)); continue;
            }
            if tag == 1 {
                if self.ids.contains_key(&id) || !born.insert(id) || slot != 0 || generation != 0 || !motion::valid(row) { return Err(3); }
                spawn_count += 1; structures.push(Structure::Spawn(id, *row)); continue;
            }
            if removed.contains(&id) || self.ids.get(&id) != Some(&Handle {slot, generation}) { return Err(4); }
            if (110..=117).contains(&tag)||(179..=181).contains(&tag){
                if self.tick!=0.0||self.time!=0.0||startup_random_installed{return Err(8);}
                let b=touched.entry(id).or_insert_with(||self.slots[slot as usize].body.as_ref().unwrap().clone());
                crate::startup_wire::apply(tag,row,id,b.handle,b.ship.as_mut().ok_or(8u32)?,&mut startup_states)?;continue;
            }
            if tag==85{if world.is_some(){return Err(8);}let enemy=integer(row[0]).ok_or(2u32)?;
                let h=Handle{slot:integer(row[1]).ok_or(2u32)?,generation:integer(row[2]).ok_or(2u32)?};if self.ids.get(&enemy)!=Some(&h)||!boolean(row[3]){return Err(4);}
                let mut w=crate::world_owner::Owned::new(crate::explosion_effects::Identity{id:id as f64,generation},crate::explosion_effects::Identity{id:enemy as f64,generation:h.generation});
                let bodies:Vec<_>=self.roster.iter().map(|h|{let b=self.slots[h.slot as usize].body.as_ref().unwrap();touched.get(&b.id).unwrap_or(b).clone()}).collect();w.install_terrain(&bodies,&specs)?;
                if row[3]==1.0{w.terrain.terrain.initialize_asteroids();}world=Some(w);continue;}
            if tag == 4 { removed.insert(id); structures.push(Structure::Despawn(id)); continue; }
            if (94..=103).contains(&tag){let mut bodies:Vec<_>=self.roster.iter().filter_map(|h|{let b=self.slots[h.slot as usize].body.as_ref().unwrap();
                if removed.contains(&b.id){None}else{Some(touched.get(&b.id).unwrap_or(b).clone())}}).collect();let own=bodies.iter().position(|b|b.id==id).ok_or(4u32)?;
                crate::gravity_wire::apply(tag,row,world.as_mut().ok_or(8u32)?,&mut bodies,&mut ordnance,&specs,own,&mut random,&mut visual,&mut notices)?;
                for b in bodies{touched.insert(b.id,b);}continue;}
            if (105..=109).contains(&tag){let mut bodies:Vec<_>=self.roster.iter().filter_map(|h|{let b=self.slots[h.slot as usize].body.as_ref().unwrap();
                if removed.contains(&b.id){None}else{Some(touched.get(&b.id).unwrap_or(b).clone())}}).collect();let own=bodies.iter().position(|b|b.id==id).ok_or(4u32)?;
                if tag!=109&&self.tick!=0.0{return Err(8);}
                crate::aux_wire::apply(tag,row,world.as_mut().ok_or(8u32)?,&mut bodies,&mut ordnance,&specs,own,&mut random,&mut visual,&mut notices)?;
                for b in bodies{touched.insert(b.id,b);}continue;}
            if (118..=120).contains(&tag){if self.tick!=0.0||self.time!=0.0||startup_random_installed{return Err(8);}
                let mut bodies:Vec<_>=self.roster.iter().filter_map(|h|{let b=self.slots[h.slot as usize].body.as_ref().unwrap();if removed.contains(&b.id){None}else{Some(touched.get(&b.id).unwrap_or(b).clone())}}).collect();
                let own=bodies.iter().position(|b|b.id==id).ok_or(4u32)?;
                crate::phase_wire::apply(tag,row,world.as_mut().ok_or(8u32)?,&mut bodies,&specs,own)?;
                for b in bodies{touched.insert(b.id,b);}continue;}
            if (121..=130).contains(&tag){if self.tick!=0.0||self.time!=0.0||startup_random_installed{return Err(8);}
                let mut bodies:Vec<_>=self.roster.iter().filter_map(|h|{let b=self.slots[h.slot as usize].body.as_ref().unwrap();if removed.contains(&b.id){None}else{Some(touched.get(&b.id).unwrap_or(b).clone())}}).collect();
                let own=bodies.iter().position(|b|b.id==id).ok_or(4u32)?;crate::ai_wire::apply(tag,row,world.as_mut().ok_or(8u32)?,&mut bodies,&specs,own)?;
                for b in bodies{touched.insert(b.id,b);}continue;}
            if (133..=135).contains(&tag){if self.tick!=0.0||self.time!=0.0||startup_random_installed{return Err(8);}
                let bodies:Vec<_>=self.roster.iter().map(|h|{let b=self.slots[h.slot as usize].body.as_ref().unwrap();touched.get(&b.id).unwrap_or(b).clone()}).collect();
                let own=bodies.iter().position(|b|b.id==id).ok_or(4u32)?;crate::flight_wire::apply(tag,row,world.as_mut().ok_or(8u32)?,&bodies,specs.to_mut(),own)?;continue;}
            if (151..=159).contains(&tag)||tag==165{if tag<=154&&(self.tick!=0.0||self.time!=0.0||startup_random_installed){return Err(8);}
                let mut bodies:Vec<_>=self.roster.iter().filter_map(|h|{let b=self.slots[h.slot as usize].body.as_ref().unwrap();if removed.contains(&b.id){None}else{Some(touched.get(&b.id).unwrap_or(b).clone())}}).collect();
                let own=bodies.iter().position(|b|b.id==id).ok_or(4u32)?;
                let deployed=crate::scene_wire::apply(tag,row,&mut scene,&mut bodies,world.as_mut().ok_or(8u32)?,&specs,own,self.time,&mut visual,&mut notices)?;
                // A carrier deployment must create real decks in this same
                // transaction. Flight allocator integration follows; fail closed.
                if !deployed.is_empty(){return Err(8);}for b in bodies{touched.insert(b.id,b);}continue;}
            if (166..=168).contains(&tag){if self.tick!=0.0||self.time!=0.0||startup_random_installed{return Err(8);}
                let bodies:Vec<_>=self.roster.iter().map(|h|{let b=self.slots[h.slot as usize].body.as_ref().unwrap();touched.get(&b.id).unwrap_or(b).clone()}).collect();
                let own=bodies.iter().position(|b|b.id==id).ok_or(4u32)?;crate::motion_owner::install(tag,row,world.as_mut().ok_or(8u32)?,&bodies,own)?;continue;}
            if (176..=178).contains(&tag){if self.tick!=0.0||self.time!=0.0||startup_random_installed{return Err(8);}
                let bodies:Vec<_>=self.roster.iter().map(|h|{let b=self.slots[h.slot as usize].body.as_ref().unwrap();touched.get(&b.id).unwrap_or(b).clone()}).collect();
                let own=bodies.iter().position(|b|b.id==id).ok_or(4u32)?;
                crate::scene_prelude::apply(tag,row,&mut scene.as_mut().ok_or(8u32)?.prelude,&bodies,own)?;continue;}
            if (186..=188).contains(&tag){if self.tick!=0.0||self.time!=0.0||startup_random_installed{return Err(8);}
                let bodies:Vec<_>=self.roster.iter().map(|h|{let b=self.slots[h.slot as usize].body.as_ref().unwrap();touched.get(&b.id).unwrap_or(b).clone()}).collect();
                let s=scene.as_mut().ok_or(8u32)?;if (Handle{slot,generation})!=s.player{return Err(8);}s.read.apply(tag,row,&bodies)?;continue;}
            if (183..=185).contains(&tag){if self.tick!=0.0||self.time!=0.0||startup_random_installed{return Err(8);}
                let bodies:Vec<_>=self.roster.iter().map(|h|{let b=self.slots[h.slot as usize].body.as_ref().unwrap();touched.get(&b.id).unwrap_or(b).clone()}).collect();
                crate::visual_wire::apply(tag,row,&mut world.as_mut().ok_or(8u32)?.visual,&bodies)?;continue;}
            if (194..=196).contains(&tag){if self.tick!=0.0||self.time!=0.0||startup_random_installed{return Err(8);}
                let s=scene.as_mut().ok_or(8u32)?;if (Handle{slot,generation})!=s.player{return Err(8);}s.startup.apply(tag,row)?;continue;}
            if (189..=193).contains(&tag){if self.tick!=0.0||self.time!=0.0||startup_random_installed{return Err(8);}
                let bodies:Vec<_>=self.roster.iter().map(|h|{let b=self.slots[h.slot as usize].body.as_ref().unwrap();touched.get(&b.id).unwrap_or(b).clone()}).collect();
                let own=bodies.iter().position(|b|b.handle==(Handle{slot,generation})).ok_or(4u32)?;
                let s=scene.as_mut().ok_or(8u32)?;if matches!(tag,189|193)&&(Handle{slot,generation})!=s.player{return Err(8);}s.system_read.apply(tag,row,&bodies,own)?;
                if tag==193{world.as_mut().ok_or(8u32)?.motion.as_mut().ok_or(8u32)?.bind_propulsion(&s.system_read)?;}continue;}
            if tag==12&&matches!(row[1],1.0|2.0)&&world.as_ref().and_then(|w|w.gravity.as_ref()).is_some_and(|g|g.owner.ships.iter().any(|m|m.identity==crate::system_world::Identity{slot,generation}&&m.systems.iter().any(|s|s.id as f64==row[0]))){
                let mut bodies:Vec<_>=self.roster.iter().map(|h|{let b=self.slots[h.slot as usize].body.as_ref().unwrap();touched.get(&b.id).unwrap_or(b).clone()}).collect();
                crate::gravity_runtime::interrupt(world.as_mut().unwrap(),&mut bodies,&specs,Handle{slot,generation},Some(integer(row[0]).ok_or(2u32)?),row[1]==2.0)?;
                for b in bodies{touched.insert(b.id,b);}notices.push((id,Handle{slot,generation},Notice{system:row[0]as u32,kind:if row[1]==2.0{ship_state::RESET}else{ship_state::INTERRUPT},value:0.0,detail:[0.0;2]}));continue;}
            if tag==80{
                let sid=integer(row[0]).ok_or(2u32)?;if !boolean(row[4]){return Err(2);}
                let target=if row[4]==1.0{let tid=integer(row[5]).ok_or(2u32)?;let h=Handle{slot:integer(row[6]).ok_or(2u32)?,generation:integer(row[7]).ok_or(2u32)?};
                    if removed.contains(&tid)||self.ids.get(&tid)!=Some(&h){return Err(4);}Some((h.slot,h.generation))}else{None};
                let mut bodies:Vec<Body>=self.roster.iter().filter_map(|h|{let b=self.slots[h.slot as usize].body.as_ref().unwrap();if removed.contains(&b.id){None}else{Some(touched.get(&b.id).unwrap_or(b).clone())}}).collect();
                let own=bodies.iter().position(|b|b.id==id).ok_or(4u32)?;let b=&bodies[own];let s=b.ship.as_ref().ok_or(8u32)?;let mut system=crate::system_owner::slot(s,b.handle,sid,&specs)?;
                let facing=if system.kind==crate::ship_effects::Kind::Jump{row[3].sin().atan2(row[3].cos())}else{b.motion[4]};
                let input=crate::ship_effects::ActivationInput{point:[row[1],row[2]],origin:[b.motion[0],b.motion[1]],velocity:[b.motion[2],b.motion[3]],facing,target,gravity_anchor_serial:None};
                let s=bodies[own].ship.as_mut().unwrap();s.world.as_mut().ok_or(8u32)?.aim=input.point;if let Some(q)=s.combat.as_mut().and_then(|c|c.query.as_mut()){q.aim=input.point;}
                let gravity=bodies[own].ship.as_ref().and_then(|s|s.world.as_ref()).is_some_and(|w|w.gravity_systems.contains(&sid));
                let accepted=if gravity{crate::gravity_runtime::command(world.as_mut().ok_or(8u32)?,&mut bodies,&mut ordnance,&specs,own,sid,input,&mut random,&mut visual,&mut notices)?}
                else{let mut unused_events=Vec::new();let host=crate::system_owner::Host{bodies:&mut bodies,specs:&specs,ordnance:&mut ordnance,random:&mut random,events:&mut unused_events,asteroids:world.as_ref().map(|w|w.terrain.terrain.asteroids.as_slice())};
                    let accepted=match system.activate(&host,input){Ok(())=>true,Err(crate::system_world::Failure::StaleIdentity)=>return Err(4),Err(crate::system_world::Failure::Host|crate::system_world::Failure::Unsupported)=>return Err(8),Err(_)=>false};
                    crate::system_owner::restore(bodies[own].ship.as_mut().unwrap(),system)?;accepted};
                notices.push((id,Handle{slot,generation},Notice{system:sid,kind:ship_state::SYSTEM_RESULT,value:accepted as u32 as f64,detail:[0.0;2]}));for b in bodies{touched.insert(b.id,b);}continue;
            }
            let mut damage_source=[1.0;2];
            if tag == 39 || tag == 40 {
                let start=if tag == 39 {5} else {9}; if !boolean(row[start]) {return Err(2);}
                if row[start] == 1.0 {
                    let source_id=integer(row[start+1]).ok_or(2u32)?;
                    let source_handle=Handle {slot:integer(row[start+2]).ok_or(2u32)?,generation:integer(row[start+3]).ok_or(2u32)?};
                    if removed.contains(&source_id) || self.ids.get(&source_id) != Some(&source_handle) {return Err(4);}
                    let source=touched.get(&source_id).unwrap_or_else(|| self.slots[source_handle.slot as usize].body.as_ref().unwrap());
                    let source_ship=source.ship.as_ref().ok_or(8u32)?;
                    damage_source=[source_ship.damage_policy[3],source_ship.damage_policy[4]];
                }
            }
            if world.is_some()&&(matches!(tag,26|31|40|47)||tag==37&&row[0]==2.0){
                let mut bodies:Vec<_>=self.roster.iter().filter_map(|h|{let b=self.slots[h.slot as usize].body.as_ref().unwrap();if removed.contains(&b.id){None}else{Some(touched.get(&b.id).unwrap_or(b).clone())}}).collect();
                let own=bodies.iter().position(|b|b.id==id).ok_or(4u32)?;
                crate::damage_wire::apply(tag,row,world.as_mut().unwrap(),&mut bodies,&specs,own,damage_source,&mut random,&mut visual,&mut notices)?;
                for b in bodies{touched.insert(b.id,b);}continue;
            }
            let body = touched.entry(id).or_insert_with(|| self.slots[slot as usize].body.as_ref().unwrap().clone());
            if tag == 2 {
                if !(row[motion::BRAKE] == 0.0 || row[motion::BRAKE] == 1.0)
                    || integer(row[motion::FLAGS]).is_none_or(|n| n > 255) { return Err(2); }
                if body.ship.as_ref().and_then(|s| s.engines.as_ref()).is_some_and(|e|
                    (row[motion::FLAGS] as u32 & 1 != 0) != (e.data[4] != engine::READY)) {return Err(8);}
                body.motion[motion::TURN..=motion::FLAGS].copy_from_slice(&row[motion::TURN..=motion::FLAGS]);
            } else if tag == 3 {
                if body.ship.as_ref().is_some_and(|s| s.engines.is_some()) {return Err(8);}
                if [motion::ACCELERATION, motion::DECELERATION, motion::MAX_SPEED,
                    motion::TURN_ACCELERATION, motion::MAX_TURN, motion::STRAFE_MULTIPLIER]
                    .iter().any(|&field| row[field] < 0.0) { return Err(2); }
                body.motion[motion::ACCELERATION..=motion::STRAFE_MULTIPLIER].copy_from_slice(&row[motion::ACCELERATION..=motion::STRAFE_MULTIPLIER]);
            } else if tag == 5 {
                if body.ship.is_some() { return Err(8); }
                if !flux_config(row) || row[8] < 0.0 || row[9] < 0.0 || row[8] + row[9] > row[0]
                    || integer(row[10]).is_none_or(|n| n > 2047) || row[11] < 0.0
                    || !(0.0..=1.0).contains(&row[12]) || row[13] < 0.0 { return Err(2); }
                body.ship = Some(ShipState::new(row));
            } else {
                if !matches!(tag, 6..=9 | 11..=93) { return Err(2); }
                let ship = body.ship.as_mut().ok_or(8u32)?; let mut local_events = Vec::new();
                match tag {
                    6 => {
                        if !flux_config(row) { return Err(2); } let f = &mut ship.flux;
                        f.max = row[0]; f.base = row[1]; f.hull = row[2] as u32; f.vent_mult = row[3];
                        f.overload_mult = row[4]; f.conversion = row[5]; f.dissipation_mult = row[6]; f.boost_delay = row[7];
                    }
                    7 => {
                        if row[0] < 0.0 || !(0.0..=1.0).contains(&row[1]) || row[2] < 0.0 { return Err(2); }
                        if ship.shield.as_ref().is_some_and(|s| row[1] != s.data[shield::EFFECT]) { return Err(8); }
                        ship.clock[..3].copy_from_slice(&row[..3]);
                    }
                    8 => {
                        let flags = integer(row[0]).filter(|n| *n <= 2047).ok_or(2u32)?;
                        if ship.shield.as_ref().is_some_and(|s| (flags & ship_state::SHIELD != 0) != s.active()) { return Err(8); }
                        if ship.engines.is_some() && (flags & ship_state::FLAMED != 0) != ship.engine_flame_flag() {return Err(8);}
                        ship.flags = flags;
                        ship.hard_fraction = row[1]; ship.zero_minimum = row[2]; ship.allow_any = row[3];
                    }
                    9 => {
                        let op = integer(row[0]).filter(|n| *n <= 8).ok_or(2u32)?;
                        if row[2] != 0.0 && row[2] != 1.0 { return Err(2); }
                        ship.flux_operation(op, row[1], row[2] == 1.0, &mut local_events);
                    }
                    11 => {
                        let system = integer(row[0]).ok_or(2u32)?; let spec = integer(row[1]).ok_or(2u32)?;
                        let d = specs.get(&spec).ok_or(8u32)?;
                        if !boolean(row[2]) { return Err(2); }
                        if ship.systems.iter().any(|s| s.id == system) { return Err(8); }
                        let mut installed = System::new(system, spec, d); installed.defense = row[2] == 1.0;
                        ship.systems.push(installed);
                    }
                    12 => {
                        let system = integer(row[0]).ok_or(2u32)?; let op = integer(row[1]).filter(|n| *n <= 4).ok_or(2u32)?;
                        if ship.world.is_some()&&op==0{return Err(8);}if ship.world.is_some()&&op==2{let mut slot=crate::system_owner::slot(ship,body.handle,system,&specs)?;slot.reset();crate::system_owner::restore(ship,slot)?;
                            local_events.push(Notice{system,kind:ship_state::RESET,value:0.0,detail:[0.0;2]});}else{ship.system_operation(system, op, &specs, &mut local_events)?;}
                    }
                    13 => {if ship.world.is_some(){return Err(8);}ship.dispatch(&specs, &mut local_events)?;},
                    14 => {
                        if ship.shield.is_some() { return Err(8); }
                        if !shield_config(row) { return Err(2); }
                        let mut shield = Shield::new(row); shield.set_active(row[17] == 1.0, &mut ship.flux);
                        ship.shield = Some(shield); ship.sync_shield();
                    }
                    15 => {
                        if !shield_config(row) { return Err(2); }
                        let s = ship.shield.as_mut().ok_or(8u32)?;
                        if row[0] != s.data[0] || (s.void.is_some() && (row[1] != 360.0 || row[4] != 0.0)) { return Err(8); }
                        s.configure(row);
                    }
                    16 => {
                        if ![2, 4, 5].iter().all(|&i| boolean(row[i])) { return Err(2); }
                        let s = ship.shield.as_mut().ok_or(8u32)?;
                        s.data[31..36].copy_from_slice(&row[..5]);
                        s.data[25] = row[5]; s.data[26] = row[6];
                    }
                    17 => {
                        if row[0] < 1.0 || row[0].fract() != 0.0 || row[0] > MAX_INTEGER || row[1] <= 0.0
                            || row[2..5].iter().any(|n| *n < 0.0) || !(row[0] * row[1]).is_finite() { return Err(2); }
                        let s = ship.shield.as_mut().ok_or(8u32)?; if s.void.is_some() { return Err(8); }
                        s.configure_void(row); ship.sync_shield();
                    }
                    18 => {
                        let op = integer(row[0]).filter(|n| *n <= 4).ok_or(2u32)?;
                        ship.shield_operation(op, &specs, &mut local_events)?;
                    }
                    19 => {
                        if row[..3].iter().any(|n| *n < 0.0) { return Err(2); }
                        ship.shield.as_mut().ok_or(8u32)?.data[36..39].copy_from_slice(&row[..3]);
                    }
                    20 => {
                        let system = integer(row[0]).ok_or(2u32)?;
                        if integer(row[1]).is_none_or(|n| n > 31) || row[2..6].iter().any(|n| *n < 0.0)
                            || row[5] + row[6] < 0.0 || integer(row[7]).is_none_or(|n| n > 255) || row[8] < 0.0 { return Err(2); }
                        let s = ship.systems.iter_mut().find(|s| s.id == system).ok_or(8u32)?;
                        s.upkeep.copy_from_slice(&row[1..9]);
                    }
                    21 => {
                        let kind = integer(row[1]).filter(|n| *n <= 3).ok_or(2u32)?;
                        let s = ship.shield.as_mut().ok_or(8u32)?;
                        let (flux, absorbed, remaining) = s.impact(row[0], kind, row[2]);
                        if ![flux, absorbed, remaining].iter().all(|n| n.is_finite()) { return Err(7); }
                        for (kind, value) in [(ship_state::IMPACT_FLUX, flux), (ship_state::IMPACT_ABSORBED, absorbed),
                            (ship_state::IMPACT_REMAINING, remaining)] {
                            local_events.push(Notice {system: 0, kind, value,detail:[0.0; 2]});
                        }
                        ship.sync_shield();
                    }
                    22 => {
                        if row[..3].iter().any(|n| *n < 0.0) { return Err(2); }
                        ship.shield.as_mut().ok_or(8u32)?.data[40..43].copy_from_slice(&row[..3]);
                    }
                    23 => {
                        if ship.armor.is_some() { return Err(8); }
                        let cols = integer(row[0]).filter(|n| *n > 0).ok_or(2u32)? as usize;
                        let rows = integer(row[1]).filter(|n| *n > 0).ok_or(2u32)? as usize;
                        if cols.checked_mul(rows).and_then(|n| n.checked_mul(4)).is_none_or(|n| n > isize::MAX as usize)
                            || row[2] <= 0.0 || row[3] <= 0.0 || row[4] < 0.0 || row[7] <= 0.0
                            || row[8] < 0.0 || row[8] > row[7] || ![13,14,15,16].iter().all(|&i| boolean(row[i])) { return Err(2); }
                        ship.armor = Some(Armor::new(row));
                    }
                    24 => {
                        if ![12,13,14].iter().all(|&i| boolean(row[i])) { return Err(2); }
                        ship.armor.as_mut().ok_or(8u32)?.stats(row);
                    }
                    25 => {
                        if row[..2].iter().any(|n| n.fract() != 0.0 || n.abs() > MAX_INTEGER) { return Err(2); }
                        ship.armor.as_mut().ok_or(8u32)?.set_cell(row[0] as i64,row[1] as i64,row[2]);
                    }
                    26 => {
                        if integer(row[3]).is_none_or(|n| n > 3) || ![4,6,7].iter().all(|&i| boolean(row[i])) { return Err(2); }
                        let armor = ship.armor.as_mut().ok_or(8u32)?;
                        let mut repair=ship.world.as_mut().and_then(|w|w.repair.as_mut());
                        let result = armor.impact_with_damage(row,&mut visual,&mut ship.shield,&mut local_events,
                            |damage|{if let Some(r)=&mut repair{r.on_damage(damage);}});
                        for (kind,value) in [(ship_state::ARMOR_DAMAGE,result[0]),(ship_state::ARMOR_HULL,result[1]),(ship_state::ARMOR_RESIDUAL,result[2])] {
                            if !value.is_finite() { return Err(7); }
                            local_events.push(Notice {system:0,kind,value,detail:[0.0;2]});
                        }
                        if row[7] == 1.0 {
                            ship.apply_hull(result[1],&mut local_events)?;
                        }
                    }
                    27 => {
                        if ship.weapons.is_some() {return Err(8);}
                        let component_id = integer(row[0]).ok_or(2u32)?;
                        if integer(row[1]).is_none_or(|n| n > 3) || integer(row[2]).is_none_or(|n| n > 2)
                            || row[5] < 0.0 || !boolean(row[6]) { return Err(2); }
                        if ship.components.iter().any(|c| c.data[0] == component_id as f64) { return Err(8); }
                        ship.components.push(Component::new(row,&mut random));
                    }
                    28 | 29 | 30 => {
                        let component_id = integer(row[0]).ok_or(2u32)?;
                        let index=ship.components.iter().position(|c| c.data[0] == component_id as f64).ok_or(8u32)?;
                        if tag == 28 {
                            let dealt = ship.components[index].damage(row[1],&mut random);
                            local_events.push(Notice {system:0,kind:ship_state::COMPONENT_DAMAGE,value:dealt,detail:[row[0],0.0]});
                        } else if tag == 29 {
                            if !boolean(row[1]) { return Err(2); }
                            if ship.weapons.as_ref().is_some_and(|w| !w.complete()) {return Err(8);}
                            let newly = ship.disable_weapon(index,row[1] == 1.0,&mut random,&mut local_events);
                            local_events.push(Notice {system:0,kind:ship_state::COMPONENT_RESULT,value:newly as u32 as f64,detail:[row[0],row[1]]});
                        } else {
                            if ship.weapons.is_some() {return Err(8);}
                            if !boolean(row[1]) || !boolean(row[3]) { return Err(2); }
                            ship.components[index].data[17..20].copy_from_slice(&row[1..4]);
                        }
                    }
                    31 => {
                        ship.apply_hull(row[0],&mut local_events)?;
                    }
                    32 => ship.armor.as_mut().ok_or(8u32)?.sync_scars(&mut visual),
                    33 => {
                        if ship.engines.is_some() {return Err(8);}
                        if integer(row[0]).is_none_or(|n| n > 5) || row[1] < 0.0 || row[2] < 0.0 || integer(row[3]).is_none() {return Err(2);}
                        ship.engines=Some(Controller::new(row));
                    }
                    34 => {
                        let e=ship.engines.as_mut().ok_or(8u32)?;
                        if integer(row[0]).is_none() || row[0] != e.engines.len() as f64 || e.complete()
                            || ![5,6].iter().all(|&i| boolean(row[i])) || row[3] < 0.0 || row[4] < 0.0 {return Err(8);}
                        e.install(row,&mut random);
                    }
                    35 => {
                        if ![0,2].iter().all(|&i| boolean(row[i])) || !(0.0..=1.0).contains(&row[3]) || !(0.0..=1.0).contains(&row[4]) {return Err(2);}
                        if row[3] > 0.0 && ship.armor.is_none() {return Err(8);}
                        let e=ship.engines.as_mut().ok_or(8u32)?; e.data[14..19].copy_from_slice(&row[..5]);
                    }
                    36 => {
                        if [0,2,3,5,6,8,9,11,12,14,15,16,17,18,20].iter().any(|&i| row[i] < 0.0) {return Err(2);}
                        let e=ship.engines.as_mut().ok_or(8u32)?;
                        e.motion.copy_from_slice(&row[..engine::MOTION_WIDTH]); e.data[19]=1.0;
                    }
                    37 => {
                        let op=integer(row[0]).filter(|n| *n <= 5).ok_or(2u32)?; let context=ship.engine_context();
                        let e=ship.engines.as_mut().ok_or(8u32)?; if !e.complete() {return Err(8);}
                        if op <= 2 {
                            let index=integer(row[1]).filter(|n| (*n as usize) < e.engines.len()).ok_or(8u32)? as usize;
                            if op == 0 {let dealt=e.damage(index,row[2],context.extended);
                                local_events.push(Notice {system:0,kind:ship_state::ENGINE_DAMAGE,value:dealt,detail:[index as f64,0.0]});
                            } else {
                                if !boolean(row[2]) {return Err(2);} let permanent=row[2] == 1.0;
                                let newly=if op == 1 {e.disable(index,context,permanent)} else {e.malfunction(index,context,permanent)};
                                let point=[e.engines[index].data[1],e.engines[index].data[2]];
                                local_events.push(Notice {system:0,kind:ship_state::ENGINE_RESULT,value:newly as u32 as f64,detail:[index as f64,row[2]]});
                                if op == 2 {ship.critical_damage(point,&mut random,&mut visual,&mut local_events)?;}
                            }
                        } else if op == 3 {if !boolean(row[2]) {return Err(2);} e.force(row[2] == 1.0);}
                        else if op == 4 {e.restore();} else {e.clear_events();}
                    }
                    38 => ship.damage_policy.copy_from_slice(&row[..8]),
                    39 => ship.propagate([row[0],row[1]],[row[2],row[3]],row[4],damage_source,&mut random,&mut local_events)?,
                    40 => {
                        if integer(row[3]).is_none_or(|n| n > 3) || ![4,6,7].iter().all(|&i| boolean(row[i])) {return Err(2);}
                        let result=ship.armor_impact(row,&mut visual,&mut local_events)?;
                        ship.propagate([row[0],row[1]],[result[0],result[1]],row[8],damage_source,&mut random,&mut local_events)?;
                    }
                    41 => {
                        if ship.weapons.is_some() || integer(row[1]).is_none() || row[1] != ship.components.len() as f64
                            || integer(row[2]).is_none() || !boolean(row[3]) {return Err(8);}
                        ship.weapons=Some(weapon::Controller::new(row));
                    }
                    42 => {
                        let w=ship.weapons.as_mut().ok_or(8u32)?;let index=integer(row[0]).ok_or(2u32)? as usize;
                        if index != w.mounts.len() || index >= ship.components.len() || row[1] != ship.components[index].data[0] {return Err(8);}
                        if integer(row[2]).is_none_or(|n| n > 3) || ![3,4,8,10,15].iter().all(|&i| boolean(row[i]))
                            || [5,6,7,9,11,12].iter().any(|&i| row[i] < 0.0) {return Err(2);}
                        w.install(row);
                    }
                    43 => {
                        let w=ship.weapons.as_mut().ok_or(8u32)?;let index=integer(row[0]).filter(|n| (*n as usize) < w.mounts.len()).ok_or(8u32)? as usize;
                        if w.mounts[index].initialized {return Err(8);}
                        if ![8,11,18,21].iter().all(|&i| boolean(row[i])) || integer(row[9]).is_none_or(|n| n > 3)
                            || ![6,12].iter().all(|&i| row[i] >= 0.0 && row[i].fract() == 0.0 && row[i] <= MAX_INTEGER)
                            || row[16].fract() != 0.0 || row[16].abs() > MAX_INTEGER
                            || !(0.0..=1.0).contains(&row[19]) || !(0.0..=1.0).contains(&row[20]) {return Err(2);}
                        w.initialize(index,row);
                    }
                    44 => {
                        let w=ship.weapons.as_mut().ok_or(8u32)?;
                        if row[0] != w.groups.len() as f64 || w.groups.len() as f64 >= w.data[2] {return Err(8);}
                        if integer(row[1]).is_none() || integer(row[2]).is_none_or(|n| n > 1) || ![3,5,7,8,9,10].iter().all(|&i| boolean(row[i]))
                            || integer(row[11]).is_none() {return Err(2);}
                        w.groups.push(Group {data:row[1..12].try_into().unwrap(),members:Vec::new()});
                    }
                    45 => {
                        let w=ship.weapons.as_mut().ok_or(8u32)?;let index=integer(row[0]).filter(|n| (*n as usize) < w.groups.len()).ok_or(8u32)? as usize;
                        let g=&mut w.groups[index];let member=integer(row[2]).ok_or(2u32)?;
                        if row[1] != g.members.len() as f64 || g.members.len() as f64 >= g.data[10] {return Err(8);}
                        g.members.push(member);
                    }
                    46 => {
                        if ![0,1,2,4].iter().all(|&i| boolean(row[i])) || !(0.0..=1.0).contains(&row[5]) || !(0.0..=1.0).contains(&row[6]) {return Err(2);}
                        if row[5] > 0.0 && ship.armor.is_none() {return Err(8);}
                        let w=ship.weapons.as_mut().ok_or(8u32)?;w.data[3..19].copy_from_slice(&row[..16]);w.data[22]=row[16];
                    }
                    47 => {
                        if ship.weapons.as_ref().is_none_or(|w| !w.complete()) || ship.armor.is_none() {return Err(8);}if !boolean(row[1]) {return Err(2);}
                        let index=ship.components.iter().position(|c| c.data[0] == row[0]).ok_or(8u32)?;
                        let newly=ship.disable_weapon(index,row[1] == 1.0,&mut random,&mut local_events);
                        if row[1] == 1.0 {ship.weapons.as_mut().unwrap().finalize(index);}
                        local_events.push(Notice {system:0,kind:ship_state::COMPONENT_RESULT,value:newly as u32 as f64,detail:[row[0],row[1]]});
                        let c=&ship.components[index].data;let point=[c[3],c[4]];ship.critical_damage(point,&mut random,&mut visual,&mut local_events)?;
                    }
                    48 => ship.weapons.as_mut().ok_or(8u32)?.clear_events(),
                    49=>{
                        if ship.combat.is_some()||ship.armor.is_none()||integer(row[0]).is_none()||integer(row[1]).is_none_or(|v|v>5)
                            ||row[2]<0.0||integer(row[3]).is_none()||!boolean(row[4])||!boolean(row[5]){return Err(8);}
                        ship.combat=Some(crate::battle::CombatShip::new(row));
                    }
                    50=>{let c=ship.combat.as_mut().ok_or(8u32)?;if row[0]!=c.bounds.len() as f64||c.bounds.len()>=c.expected_bounds{return Err(8);}c.bounds.push([row[1],row[2]]);}
                    51=>{let c=ship.combat.as_mut().ok_or(8u32)?;if !boolean(row[0])||!boolean(row[19])||row[1..3].iter().any(|v|*v<0.0)||row[11..18].iter().any(|v|*v<0.0){return Err(2);}c.attrs.copy_from_slice(&row[..20]);}
                    52=>{
                        let w=ship.weapons.as_ref().ok_or(8u32)?;let c=ship.combat.as_mut().ok_or(8u32)?;
                        if row[0]!=c.fire.len() as f64||c.fire.len()>=w.mounts.len()||integer(row[21]).is_none()
                            ||[2,3,9,10,20].iter().any(|&i|!boolean(row[i]))||row[1]<1.0||row[1].fract()!=0.0{return Err(2);}
                        c.fire.push(crate::battle::FireEntry::new(row));
                    }
                    53=>{let index=integer(row[0]).ok_or(2u32)? as usize;let e=ship.combat.as_mut().and_then(|c|c.fire.get_mut(index)).ok_or(8u32)?;
                        if e.aux||[1,2,4].iter().any(|&i|!boolean(row[i]))||row[6..9].iter().any(|v|*v<0.0){return Err(2);}e.configure(row);}
                    54=>{let index=integer(row[0]).ok_or(2u32)? as usize;let e=ship.combat.as_mut().and_then(|c|c.fire.get_mut(index)).ok_or(8u32)?;
                        if row[1]!=e.spec.offsets.len() as f64||e.spec.offsets.len()>=e.offsets{return Err(8);}e.spec.offsets.push([row[2],row[3]]);}
                    55=>{let index=integer(row[0]).ok_or(2u32)? as usize;let e=ship.combat.as_mut().and_then(|c|c.fire.get_mut(index)).ok_or(8u32)?;
                        let d=&row[1..];if e.delivery.is_some()||integer(d[0]).is_none_or(|v|v>4)||integer(d[3]).is_none_or(|v|v>3)||integer(d[4]).is_none_or(|v|v>3)
                            ||[6,9,11,14,15,16,17,19].iter().any(|&i|!boolean(d[i]))||[1,2,5,7,10,12,13,18].iter().any(|&i|d[i]<0.0){return Err(2);}
                        e.delivery=Some(crate::projectile::Delivery::new(d));}
                    56=>{let index=integer(row[0]).ok_or(2u32)? as usize;let e=ship.combat.as_mut().and_then(|c|c.fire.get_mut(index)).ok_or(8u32)?;
                        if (1..=6).any(|i|!boolean(row[i]))||!boolean(row[7]){return Err(2);}
                        // Targets carry full owner generation; intent never accepts a stale id.
                        let target=if row[7]==1.0{let id=integer(row[8]).ok_or(2u32)?;let handle=Handle{slot:integer(row[9]).ok_or(2u32)?,generation:integer(row[10]).ok_or(2u32)?};
                            if removed.contains(&id)||self.ids.get(&id)!=Some(&handle){return Err(4);}Some(id)}else{None};
                        e.input=crate::weapon_fire::FireInput{requested:row[1]==1.0,trigger_held:row[2]==1.0,disabled:false,system_allows:row[3]==1.0,suspended:row[4]==1.0,
                            recheck_flux_budget:row[5]==1.0,step_dt:0.0,target_ship:target,target_projectile:None};
                        e.input_target=target.map(|_|Handle{slot:row[9]as u32,generation:row[10]as u32});
                        ship.weapons.as_mut().ok_or(8u32)?.mounts[index].data[15]=row[11];
                    }
                    57=>{
                        let c=ship.combat.as_mut().ok_or(8u32)?;
                        if c.query.is_some()||integer(row[0]).is_none()||integer(row[1]).is_none()||[2,3,4,5,11].iter().any(|&i|!boolean(row[i]))
                            ||row[6..10].iter().any(|v|*v<0.0)||integer(row[10]).is_none(){return Err(2);}
                        c.query=Some(crate::fire_query::ShipQuery::new(row));
                    }
                    58=>{let q=ship.combat.as_mut().and_then(|c|c.query.as_mut()).ok_or(8u32)?;let team=integer(row[0]).ok_or(2u32)?;
                        if !boolean(row[1])||q.visible.contains_key(&team)||q.visible.len()>=q.expected_teams{return Err(8);}q.visible.insert(team,row[1]==1.0);}
                    59=>{let q=ship.combat.as_mut().and_then(|c|c.query.as_mut()).ok_or(8u32)?;
                        let target_id=integer(row[1]).ok_or(2u32)?;let h=Handle{slot:integer(row[2]).ok_or(2u32)?,generation:integer(row[3]).ok_or(2u32)?};
                        if row[0]!=q.scope.len()as f64||q.scope.len()>=q.expected_scope||q.scope.contains(&h){return Err(8);}
                        if removed.contains(&target_id)||self.ids.get(&target_id)!=Some(&h){return Err(4);}q.scope.push(h);}
                    60=>{let index=integer(row[0]).ok_or(2u32)?as usize;let c=ship.combat.as_mut().ok_or(8u32)?;let e=c.fire.get_mut(index).ok_or(8u32)?;
                        if c.query.is_none()||e.query.is_some()||integer(row[1]).is_none_or(|n|n&!254!=0)||integer(row[2]).is_none_or(|n|n>511)
                            ||row[4..8].iter().any(|v|*v<0.0)||row[4]>360.0||!boolean(row[8])||!boolean(row[9])||row[10]<0.0||integer(row[11]).is_none()||row[12]<0.0||!boolean(row[13])||!boolean(row[14]){return Err(2);}
                        e.query=Some(crate::fire_query::MountQuery::new(row));}
                    61=>{let c=ship.combat.as_mut().ok_or(8u32)?;let q=c.query.as_mut().ok_or(8u32)?;
                        if [2,3,5,9].iter().any(|&i|!boolean(row[i])){return Err(2);}q.aim=[row[0],row[1]];q.trigger=row[2]==1.0;
                        q.selected=if row[3]==1.0{let n=integer(row[4]).ok_or(2u32)?as usize;if ship.weapons.as_ref().is_none_or(|w|n>=w.groups.len()){return Err(8);}Some(n)}else{None};
                        q.target=if row[5]==1.0{let tid=integer(row[6]).ok_or(2u32)?;let h=Handle{slot:integer(row[7]).ok_or(2u32)?,generation:integer(row[8]).ok_or(2u32)?};
                            if removed.contains(&tid)||self.ids.get(&tid)!=Some(&h){return Err(4);}Some(h)}else{None};q.hold=row[9]==1.0;
                        c.attrs[19]=row[10];if !boolean(row[10]){return Err(2);}ship.weapons.as_mut().ok_or(8u32)?.data[3]=1.0-row[10];
                    }
                    62=>{let index=integer(row[0]).ok_or(2u32)?as usize;let q=ship.combat.as_mut().and_then(|c|c.fire.get_mut(index)).and_then(|e|e.query.as_mut()).ok_or(8u32)?;
                        if integer(row[1]).is_none_or(|n|n>2)||!boolean(row[2])||integer(row[3]).is_none_or(|n|n>2)||!boolean(row[4]){return Err(2);}
                        q.policy=match row[1]as u32{1=>Some(crate::fire_control::Policy{priority:crate::fire_control::Priority::Escort,suspended:row[2]==1.0}),2=>Some(crate::fire_control::Policy{priority:crate::fire_control::Priority::Suppress,suspended:row[2]==1.0}),_=>None};
                        q.cadence=match row[3]as u32{1=>Some(crate::fire_control::CadenceMode::Hz20),2=>Some(crate::fire_control::CadenceMode::Multirate),_=>None};q.system_allows=row[4]==1.0;}
                    63=>{let w=ship.weapons.as_mut().ok_or(8u32)?;let index=integer(row[0]).ok_or(2u32)?as usize;if !boolean(row[1]){return Err(2);}w.groups.get_mut(index).ok_or(8u32)?.data[2]=row[1];}
                    64=>{
                        let c=ship.combat.as_ref().ok_or(8u32)?;
                        if c.readiness.is_some()||!(0.0..=1.0).contains(&row[0])||row[1..9].iter().any(|v|*v<0.0){return Err(2);}
                        let owned=crate::readiness_owner::Owned::new(row,c,ship.damage_policy[7],&mut random);
                        ship.combat.as_mut().unwrap().readiness=Some(owned);if let Some(s)=&mut ship.shield{s.data[28]=f64::INFINITY;}
                    }
                    65=>{if !(0.0..=1.0).contains(&row[0])||!boolean(row[1]){return Err(2);}crate::readiness_owner::deploy(ship,row[0],row[1]==1.0,&mut random)?;}
                    66=>{if !(0.0..=1.0).contains(&row[0]){return Err(2);}ship.combat.as_mut().and_then(|c|c.readiness.as_mut()).ok_or(8u32)?.state.current_cr=row[0];}
                    67=>{let index=integer(row[0]).ok_or(2u32)?as usize;
                        let d=ship.combat.as_mut().and_then(|c|c.fire.get_mut(index)).and_then(|e|e.delivery.as_mut()).ok_or(8u32)?;
                        let r=&row[1..];if d.guidance.is_some()||[0,1,2,3,5,7,9,11,13,15,17,18].iter().any(|&i|!boolean(r[i]))
                            ||[4,6,8,10,12,14,16].iter().any(|&i|r[i]<0.0){return Err(2);}
                        d.guidance=Some(crate::missile_owner::Spec::new(r));}
                    68=>{let index=integer(row[0]).ok_or(2u32)?as usize;
                        let g=ship.combat.as_mut().and_then(|c|c.fire.get_mut(index)).and_then(|e|e.delivery.as_mut()).and_then(|d|d.guidance.as_mut()).ok_or(8u32)?;
                        let r=&row[1..];if g.mirv.is_some()||[3,9,16,18].iter().any(|&i|!boolean(r[i]))||r[..20].iter().any(|v|*v<0.0)
                            ||integer(r[7]).is_none_or(|n|n>3)||integer(r[15]).is_none()||integer(r[19]).is_none_or(|n|n>4)||r[4]<1.0||r[4]>4096.0{return Err(2);}
                        g.mirv=Some(crate::missile_guidance::Mirv{split_range:r[0],split_range_range:r[1],min_time:r[2],can_split_early:r[3]==1.0,
                            shots:r[4],damage:r[5],emp:r[6],damage_type:r[7]as u32,child_hitpoints:r[8],even_spread:r[9]==1.0,arc_degrees:r[10],
                            inaccuracy_degrees:r[11],spread_speed:r[12],spread_speed_range:r[13],projectile_range:r[14],child_spec:r[15]as u32,
                            child_radius:if r[16]==1.0{Some(r[17])}else{None},child_spawn_type:if r[18]==1.0{Some(r[19]as u32)}else{None}});}
                    69=>{let index=integer(row[0]).ok_or(2u32)?as usize;
                        let g=ship.combat.as_mut().and_then(|c|c.fire.get_mut(index)).and_then(|e|e.delivery.as_mut()).and_then(|d|d.guidance.as_mut()).ok_or(8u32)?;
                        let d=&row[1..];if g.child.is_some()||g.mirv.is_none()||integer(d[0]).is_none_or(|n|n>3)||integer(d[3]).is_none_or(|n|n>3)||integer(d[4]).is_none_or(|n|n>3)
                            ||[6,9,11,14,15,16,17,19].iter().any(|&i|!boolean(d[i]))||[1,2,5,7,10,12,13,18].iter().any(|&i|d[i]<0.0)||d[11]!=0.0{return Err(2);}
                        g.child=Some(Box::new(crate::projectile::Delivery::new(d)));}
                    70=>{let index=integer(row[0]).ok_or(2u32)?as usize;
                        let g=ship.combat.as_mut().and_then(|c|c.fire.get_mut(index)).and_then(|e|e.delivery.as_mut()).and_then(|d|d.guidance.as_mut()).ok_or(8u32)?;
                        if g.flare.is_some()||integer(row[1]).is_none_or(|n|n>2)||row[2..7].iter().any(|v|*v<0.0){return Err(2);}
                        g.flare=Some(crate::missile_guidance::FlareSpec{mode:match row[1]as u32{1=>crate::missile_guidance::FlareMode::Seeker,2=>crate::missile_guidance::FlareMode::Jammer,_=>crate::missile_guidance::FlareMode::Standard},
                            effect_range:row[2],effect_chance:row[3],flameout_time:row[4],fade_time:row[5]});g.flare_life=Some(row[6]);}
                    71=>{let index=integer(row[0]).ok_or(2u32)?as usize;let effect=crate::effect_owner::kind(integer(row[1]).ok_or(2u32)?).ok_or(8u32)?;
                        if !boolean(row[12]){return Err(2);}let child=row[12]==1.0;
                        let e=ship.combat.as_mut().and_then(|c|c.fire.get_mut(index)).ok_or(8u32)?;let mut d=e.delivery.as_mut().ok_or(8u32)?;
                        if child{d=d.guidance.as_mut().and_then(|g|g.child.as_mut()).map(|d|d.as_mut()).ok_or(8u32)?;}
                        let beam=!child&&ship.weapons.as_ref().ok_or(8u32)?.mounts[index].data[2]==1.0;
                        if d.effect.is_some()||!boolean(row[2])||row[3]<0.0||row[4..12].iter().any(|v|integer(*v).is_none_or(|n|n>255))
                            ||beam&&!effect.has_beam()||!beam&&!effect.has_hit(){return Err(2);}
                        d.effect=Some(effect);d.high_frequency=row[2]==1.0;if !child{e.beam_style=crate::effect_owner::BeamStyle{width:row[3],fringe:std::array::from_fn(|i|row[4+i]as u8),core:std::array::from_fn(|i|row[8+i]as u8)};}}
                    72=>{if row[0]<0.0{return Err(2);}ship.combat.as_mut().ok_or(8u32)?.shield_pierced=row[0];}
                    73=>{if ship.world.is_some()||ship.combat.is_none()||integer(row[0]).is_none_or(|n|n>127)||[1,4,10].iter().any(|&i|!boolean(row[i]))
                            ||integer(row[7]).is_none_or(|n|n>4096)||![-1.0,0.0,1.0].contains(&row[8])||row[9]<=0.0{return Err(2);}
                        for i in [1usize,4]{if row[i]==1.0{let h=Handle{slot:integer(row[i+1]).ok_or(2u32)?,generation:integer(row[i+2]).ok_or(2u32)?};
                            if !self.roster.contains(&h)||h==body.handle{return Err(4);}}}
                        ship.world=Some(crate::system_owner::Owned::new(row,&body.motion));}
                    74=>{let sid=integer(row[0]).ok_or(2u32)?;let kind=crate::system_owner::kind(integer(row[1]).ok_or(2u32)?).ok_or(8u32)?;
                        let sys=ship.systems.iter().find(|s|s.id==sid).ok_or(8u32)?;let regen=specs.get(&sys.spec).ok_or(8u32)?.regen;
                        let w=ship.world.as_mut().ok_or(8u32)?;if w.metas.contains_key(&sid){return Err(8);}w.metas.insert(sid,crate::system_owner::Meta{kind,input:None,jump:crate::ship_effects::TacticalJump::default(),regen});}
                    75=>{let h=Handle{slot:integer(row[1]).ok_or(2u32)?,generation:integer(row[2]).ok_or(2u32)?};if !self.roster.contains(&h)||h==body.handle{return Err(4);}
                        let w=ship.world.as_mut().ok_or(8u32)?;if row[0]!=w.children.len()as f64||w.children.len()>=w.expected_children||w.children.contains(&h){return Err(8);}w.children.push(h);}
                    76=>{if row[..6].iter().any(|v|*v<0.0)||integer(row[6]).is_none_or(|n|n>3){return Err(2);}let w=ship.world.as_mut().ok_or(8u32)?;if w.launcher.is_some(){return Err(8);}
                        w.launcher=Some(crate::system_owner::Launcher{damage:row[0],emp:row[1],range:row[2],speed:row[3],launch_speed:row[4],speed_bonus:row[5],weapon_type:row[6]as u32,delivery:None});}
                    77=>{if integer(row[0]).is_none_or(|n|n>3)||integer(row[3]).is_none_or(|n|n>3)||integer(row[4]).is_none_or(|n|n>3)||row[11]!=0.0
                        ||[6,9,14,15,16,17,19].iter().any(|&i|!boolean(row[i]))||[1,2,5,7,10,12,13,18].iter().any(|&i|row[i]<0.0){return Err(2);}
                        let l=ship.world.as_mut().and_then(|w|w.launcher.as_mut()).ok_or(8u32)?;if l.delivery.is_some(){return Err(8);}let mut d=crate::projectile::Delivery::new(row);
                        d.effect=Some(crate::weapon_effects::Effect::HyperionYamato);l.delivery=Some(d);}
                    78=>{if [0,1,2].iter().any(|&i|!boolean(row[i])){return Err(2);}let mounts=crate::system_owner::repair_mounts(ship);let w=ship.world.as_mut().ok_or(8u32)?;
                        if w.bulkheads.is_some()||w.repair.is_some()||w.compensation.is_some(){return Err(8);}if row[0]==1.0{w.bulkheads=Some(crate::ship_effects::Bulkheads::default());}
                        if row[1]==1.0{w.repair=Some(crate::ship_effects::FieldRepair::new(&mounts));}if row[2]==1.0{w.compensation=Some(crate::ship_effects::Compensation::default());}}
                    79=>{let i=integer(row[0]).ok_or(2u32)?as usize;if !boolean(row[1])||!boolean(row[2]){return Err(2);}let e=ship.combat.as_mut().and_then(|c|c.fire.get_mut(i)).ok_or(8u32)?;e.railgun=row[1]==1.0;e.pd_role=row[2]==1.0;}
                    81=>{let i=integer(row[0]).ok_or(2u32)?as usize;if !boolean(row[5])||row[1]<0.0||row[3]<0.0||row[7]<0.0||row[8]<0.0||row[9]<0.0||row[10]<0.0||row[11]<=-100.0{return Err(2);}
                        let e=ship.combat.as_mut().and_then(|c|c.fire.get_mut(i)).ok_or(8u32)?;if e.range_inputs.is_some(){return Err(8);}e.range_inputs=Some(crate::battle::RangeInputs::new(row));}
                    82=>{if row[..5].iter().any(|v|*v<0.0)||row[2]>1.0||row[4]<row[3]||row[5..14].iter().any(|v|integer(*v).is_none_or(|n|n>255))||!boolean(row[14])||row[15]<0.0||row[17]<0.0{return Err(2);}
                        let c=ship.combat.as_mut().ok_or(8u32)?;if c.death.is_some()||c.bounds.len()!=c.expected_bounds{return Err(8);}c.death=Some(crate::world_owner::Meta::new(row,c.size,c.radius,&c.bounds));}
                    83=>{let field=integer(row[0]).ok_or(2u32)?as usize;let offset=integer(row[1]).ok_or(2u32)?as usize;let count=integer(row[2]).ok_or(2u32)?as usize;
                        if count>19||row[3..3+count].iter().any(|v|integer(*v).is_none_or(|n|n>65535)){return Err(2);}let chunk:Vec<u16>=row[3..3+count].iter().map(|v|*v as u16).collect();
                        ship.combat.as_mut().and_then(|c|c.death.as_mut()).ok_or(8u32)?.append(field,offset,&chunk)?;}
                    84=>{let slot=integer(row[0]).ok_or(2u32)?;let meta=ship.combat.as_mut().and_then(|c|c.death.as_mut()).ok_or(8u32)?;
                        if meta.spec.mount_slots.contains(&slot){return Err(8);}meta.spec.mount_slots.push(slot);meta.slot_positions.push((slot,[row[1],row[2]]));}
                    86=>{if row[0]<=0.0||!boolean(row[1])||!boolean(row[5]){return Err(2);}let meta=ship.combat.as_mut().and_then(|c|c.death.as_mut()).ok_or(8u32)?;
                        if meta.terrain.is_some(){return Err(8);}meta.terrain=Some(row[..6].try_into().unwrap());}
                    87..=93=>{let mount=integer(row[0]).ok_or(2u32)?as usize;let branch=integer(row[1]).ok_or(2u32)?;
                        if branch==2{if mount!=0{return Err(2);}let d=ship.world.as_mut().and_then(|w|w.launcher.as_mut()).and_then(|l|l.delivery.as_mut()).ok_or(8u32)?;
                            crate::delivery_wire::apply(tag,row,d)?;
                        }else{let e=ship.combat.as_mut().and_then(|c|c.fire.get_mut(mount)).ok_or(8u32)?;
                            let mut d=e.delivery.as_mut().ok_or(8u32)?;if branch==1{d=d.guidance.as_mut().and_then(|g|g.child.as_deref_mut()).ok_or(8u32)?;}else if branch!=0{return Err(2);}
                            let beam=crate::delivery_wire::apply(tag,row,d)?;
                            if branch==0{if let Some((radius,brighten,style))=beam{e.beam_hit_radius=radius;e.beam_hit_brighten=brighten;e.beam_style=style;}}
                        }
                    }
                    _ => return Err(2),
                }
                ship.sync_engines();
                if let Some(e)=&ship.engines {body.motion[motion::FLAGS]=((body.motion[motion::FLAGS] as u32 & !1) | if e.data[4] != engine::READY {1} else {0}) as f64;}
                notices.extend(local_events.into_iter().map(|n| (id, body.handle, n)));
            }
            if body.ship.as_ref().is_some_and(|s| !s.valid()) { return Err(7); }
        }
        if touched.values().any(|b| b.ship.as_ref().is_some_and(|s| s.engines.as_ref().is_some_and(|e| !e.complete())
            || s.weapons.as_ref().is_some_and(|w| !w.complete())
            || s.combat.as_ref().is_some_and(|c|!c.complete(s.weapons.as_ref().map_or(0,|w|w.mounts.len())))||s.world.as_ref().is_some_and(|w|!w.complete(s)))) {return Err(8);}
        if self.next_order + spawn_count as f64 > MAX_INTEGER || self.slots.len().saturating_add(spawn_count) > u32::MAX as usize
            || self.sequence + notices.len() as f64 > MAX_INTEGER { return Err(5); }
        if world.is_some(){for h in &self.roster{let b=self.slots[h.slot as usize].body.as_ref().unwrap();if removed.contains(&b.id){continue;}let b=touched.get(&b.id).unwrap_or(b);
            if b.ship.as_ref().and_then(|s|s.combat.as_ref()).and_then(|c|c.death.as_ref()).is_none_or(|m|!m.complete()||!m.valid()){return Err(8);}}}
        if let Some(g)=world.as_ref().and_then(|w|w.gravity.as_ref()){let bodies:Vec<_>=self.roster.iter().filter_map(|h|{let b=self.slots[h.slot as usize].body.as_ref().unwrap();
            if removed.contains(&b.id){None}else{Some(touched.get(&b.id).unwrap_or(b).clone())}}).collect();if !g.complete(&bodies,&ordnance){return Err(8);}}
        if let Some(aux)=world.as_ref().and_then(|w|w.aux.as_ref()){let bodies:Vec<_>=self.roster.iter().filter_map(|h|{let b=self.slots[h.slot as usize].body.as_ref().unwrap();
            if removed.contains(&b.id){None}else{Some(touched.get(&b.id).unwrap_or(b).clone())}}).collect();crate::aux_runtime::complete(aux,&bodies,&ordnance)?;}
        if let Cow::Owned(next) = specs { self.specs = next; }
        for structure in structures {
            match structure {
                Structure::Spawn(id, motion) => {
                    let slot = if let Some(slot) = self.free.pop() { slot }
                        else { let slot = self.slots.len() as u32; self.slots.push(Slot {generation: 1, body: None}); slot };
                    let handle = Handle {slot, generation: self.slots[slot as usize].generation};
                    self.slots[slot as usize].body = Some(Body {id, handle, order: self.next_order, motion, ship: None});
                    self.next_order += 1.0; self.roster.push(handle); self.ids.insert(id, handle);
                    self.next_numeric_id=self.next_numeric_id.max(id.saturating_add(1));
                }
                Structure::Despawn(id) => {
                    let handle = self.ids.remove(&id).unwrap(); let slot = &mut self.slots[handle.slot as usize]; slot.body = None;
                    if let Some(next) = slot.generation.checked_add(1) { slot.generation = next; self.free.push(handle.slot); }
                    self.roster.retain(|h| *h != handle); touched.remove(&id);
                }
            }
        }
        for (_, body) in touched { let slot = body.handle.slot as usize; self.slots[slot].body = Some(body); }
        self.random = random; self.visual_random = visual;self.world=world;self.scene=scene;self.ordnance=ordnance;self.startup_random_installed=startup_random_installed;self.startup_states=startup_states; self.append(notices); Ok(())
    }
    fn append(&mut self, notices: impl IntoIterator<Item = (u32, Handle, Notice)>) {
        for (body, handle, notice) in notices {
            self.sequence += 1.0; self.events.push(Event {body, handle, tick: self.tick, sequence: self.sequence, notice});
        }
    }
    pub fn acknowledge_audio(&mut self,sequence:f64)->Result<(),u32>{self.world.as_mut().ok_or(8u32)?.visual.ack_audio(sequence)}
    pub fn acknowledge(&mut self, sequence: f64) -> Result<(), u32> {
        if !sequence.is_finite() || sequence < 0.0 || sequence.fract() != 0.0 || sequence > self.sequence { return Err(2); }
        if sequence <= self.acknowledged { return Ok(()); }
        self.events.retain(|e| e.sequence > sequence); self.acknowledged = sequence; Ok(())
    }
    pub fn step(&mut self, expected_tick: f64, dt: f64) -> Result<(), u32> {
        if expected_tick != self.tick { return Err(6); }
        if !self.startup_states.is_empty()&&(!self.startup_random_installed||self.startup_states.values().any(|s|!s.complete)){return Err(8);}
        if !dt.is_finite() || dt <= 0.0 || !(self.time + dt).is_finite() { return Err(2); }
        let next = self.tick + 1.0; if next > MAX_INTEGER { return Err(5); } self.notices.clear();
        if self.scene.is_some(){return self.step_scene(next,dt);}
        if self.roster.iter().any(|h|self.slots[h.slot as usize].body.as_ref().unwrap().ship.as_ref().is_some_and(|s|s.combat.is_some())){
            return self.step_combat(next,dt);
        }
        let mut random = self.random.clone(); let mut visual = self.visual_random.clone();
        // Rust scratch retains per-body/system allocations between steps.
        for (index, h) in self.roster.iter().enumerate() {
            let body = self.slots[h.slot as usize].body.as_ref().unwrap();
            if index == self.scratch.len() { self.scratch.push(body.clone()); } else { self.scratch[index].clone_from(body); }
            let preview = &mut self.scratch[index];
            let effective = if let Some(ship) = &mut preview.ship {
                self.local_notices.clear();
                let effective = ship.advance(dt, &self.specs, &mut random, &mut self.local_notices)?;
                self.notices.extend(self.local_notices.drain(..).map(|n| (preview.id, preview.handle, n)));
                if !ship.valid() { return Err(7); } effective
            } else { dt };
            if preview.ship.as_ref().is_none_or(|s| s.can_advance()) {
                let before=preview.motion; let mut resident_motion=false;
                if let Some(ship)=&preview.ship {
                    if let Some(e)=&ship.engines {
                        if e.data[19] != 1.0 {return Err(8);} resident_motion=true;
                        e.motion_row(&mut preview.motion,ship.flux.boost,ship.motion_speed_multiplier(),ship.engine_context().extended);
                        preview.motion[motion::FLAGS]=((preview.motion[motion::FLAGS] as u32 & !1) | if e.data[4] != engine::READY {1} else {0}) as f64;
                    } else {preview.motion[motion::MAX_SPEED] *= ship.motion_speed_multiplier();}
                }
                if preview.motion.iter().any(|n| !n.is_finite()) {return Err(7);}
                if let Some(s)=&preview.ship{crate::motion_owner::gate(self.world.as_ref(),s,preview.handle,&self.specs,&mut preview.motion)?;}
                motion::advance(&mut preview.motion, effective);
                if !resident_motion {preview.motion[motion::MAX_SPEED]=before[motion::MAX_SPEED];}
                if let Some(ship) = &mut preview.ship {
                    ship.finish_shield(&preview.motion)?; if !ship.valid() { return Err(7); }
                    self.local_notices.clear();ship.finish_weapons(preview.motion[motion::FACING],&mut random,&mut visual,&mut self.local_notices)?;
                    ship.finish_damage(dt,&mut random,&mut visual,&mut self.local_notices);
                    ship.finish_engines(&preview.motion,&before,&mut random,&mut visual,&mut self.local_notices)?;
                    if let Some(e)=&ship.engines {preview.motion[motion::FLAGS]=((preview.motion[motion::FLAGS] as u32 & !1) | if e.data[4] != engine::READY {1} else {0}) as f64;}
                    self.notices.extend(self.local_notices.drain(..).map(|n| (preview.id,preview.handle,n)));
                    if !ship.valid() { return Err(7); }
                }
            }
            if preview.motion.iter().any(|n| !n.is_finite()) { return Err(7); }
        }
        if self.sequence + self.notices.len() as f64 > MAX_INTEGER { return Err(5); }
        for (index, h) in self.roster.iter().enumerate() { std::mem::swap(self.slots[h.slot as usize].body.as_mut().unwrap(), &mut self.scratch[index]); }
        self.time += dt; self.tick = next; self.random = random; self.visual_random = visual;
        let notices = std::mem::take(&mut self.notices); self.append(notices.iter().cloned()); self.notices = notices; Ok(())
    }
    fn scene_authority(&self,bodies:&[Body],world:&crate::world_owner::Owned)->Result<crate::flight_admission::Owned,u32>{
        let flight=world.flight.as_ref().ok_or(8u32)?;
        if flight.admission.is_some()||flight.stage!=crate::flight_runtime::Stage::Closed{return Err(8);}
        let stable:Vec<_>=flight.owner.ships.iter().map(|m|(Handle{slot:m.identity.handle,generation:m.identity.generation},m.stable_id.clone())).collect();
        let snapshot=crate::flight_allocator::Snapshot{generations:self.slots.iter().map(|s|s.generation).collect(),free:self.free.clone(),next_order:self.next_order,next_numeric_id:self.next_numeric_id};
        let allocator=crate::flight_allocator::Owned::new(snapshot,bodies,&stable).map_err(crate::flight_runtime::error)?;
        crate::flight_admission::Owned::new(allocator,flight.collation.clone(),crate::scene_control::active(world,bodies)?,bodies).map_err(crate::flight_runtime::error)
    }
    fn validate_scene_draft(&self,bodies:&[Body],world:&crate::world_owner::Owned,scene:&crate::scene_owner::Owned,ordnance:&crate::battle::Ordnance,authority:&crate::flight_admission::Owned,notices:&[(u32,Handle,Notice)])->Result<(),u32>{
        self.validate_scene_draft_with_specs(bodies,world,scene,ordnance,authority,notices,&self.specs)
    }
    fn validate_scene_draft_with_specs(&self,bodies:&[Body],world:&crate::world_owner::Owned,scene:&crate::scene_owner::Owned,ordnance:&crate::battle::Ordnance,authority:&crate::flight_admission::Owned,notices:&[(u32,Handle,Notice)],specs:&BTreeMap<u32,Spec>)->Result<(),u32>{
        if !ordnance.valid()||bodies.iter().any(|b|b.motion.iter().any(|n|!n.is_finite())||b.ship.as_ref().is_none_or(|s|!s.valid())){return Err(7);}
        if self.sequence+notices.len()as f64>MAX_INTEGER{return Err(5);}scene.validate(bodies)?;
        scene.prelude.as_ref().ok_or(8u32)?.validate(bodies)?;scene.read.validate(bodies)?;scene.system_read.validate(bodies)?;world.terrain.validate(bodies,specs)?;
        if !world.phase.as_ref().ok_or(8u32)?.complete(bodies,specs){return Err(8);}
        world.ai.as_ref().ok_or(8u32)?.validate(bodies,specs).map_err(|_|8u32)?;world.motion.as_ref().ok_or(8u32)?.validate(bodies)?;
        crate::aux_runtime::complete(world.aux.as_ref().ok_or(8u32)?,bodies,ordnance)?;
        if !world.gravity.as_ref().ok_or(8u32)?.complete(bodies,ordnance){return Err(8);}world.rows(bodies)?;
        let a=&authority.allocator;
        if bodies.len()!=self.roster.len()+a.born.len()||authority.born.len()!=a.born.len(){return Err(8);}
        for(i,b)in bodies.iter().enumerate(){if bodies[..i].iter().any(|p|p.id==b.id||p.handle==b.handle)
            ||a.snapshot.generations.get(b.handle.slot as usize)!=Some(&b.handle.generation){return Err(8);}
            if let Some(h)=self.ids.get(&b.id){if *h!=b.handle{return Err(4);}}
            else if !a.born.iter().any(|n|n.allocation.numeric_id==b.id&&n.allocation.identity.handle==b.handle.slot&&n.allocation.identity.generation==b.handle.generation&&n.allocation.order==b.order){return Err(8);}}
        for h in &self.roster{if !bodies.iter().any(|b|b.handle==*h){return Err(8);}}
        Ok(())
    }
    fn commit_scene_draft(&mut self,bodies:Vec<Body>,world:crate::world_owner::Owned,scene:crate::scene_owner::Owned,ordnance:crate::battle::Ordnance,authority:crate::flight_admission::Owned,random:Random,visual:Random,notices:Vec<(u32,Handle,Notice)>){
        let a=authority.allocator;
        for generation in &a.snapshot.generations[self.slots.len()..]{self.slots.push(Slot{generation:*generation,body:None});}
        for b in bodies{let slot=b.handle.slot as usize;self.slots[slot].body=Some(b);}
        for born in &a.born{let h=Handle{slot:born.allocation.identity.handle,generation:born.allocation.identity.generation};self.roster.push(h);self.ids.insert(born.allocation.numeric_id,h);}
        for born in authority.born{let id=self.slots[born.ship.slot as usize].body.as_ref().unwrap().id;self.births.insert(id,born);}
        self.free=a.snapshot.free;self.next_order=a.snapshot.next_order;self.next_numeric_id=a.snapshot.next_numeric_id;
        self.world=Some(world);self.scene=Some(scene);self.ordnance=ordnance;self.random=random;self.visual_random=visual;self.append(notices);
    }
    fn step_scene(&mut self,next:f64,dt:f64)->Result<(),u32>{
        if !self.startup_random_installed{return Err(8);}let mut world=self.world.clone().ok_or(8u32)?;let mut scene=self.scene.clone().ok_or(8u32)?;
        let mut bodies:Vec<_>=self.roster.iter().map(|h|self.slots[h.slot as usize].body.as_ref().unwrap().clone()).collect();
        let mut authority=self.scene_authority(&bodies,&world)?;let mut ordnance=self.ordnance.clone();let mut random=self.random.clone();let mut visual=self.visual_random.clone();let mut notices=Vec::new();
        let elapsed=crate::scene_runtime::advance(&mut scene,&mut bodies,&mut world,&mut ordnance,&self.specs,dt,&mut random,&mut visual,&mut notices,&mut authority)?;
        self.validate_scene_draft(&bodies,&world,&scene,&ordnance,&authority,&notices)?;
        if !(self.time+elapsed).is_finite(){return Err(7);}self.tick=next;self.time+=elapsed;
        self.commit_scene_draft(bodies,world,scene,ordnance,authority,random,visual,notices);Ok(())
    }
    /// A single sample only changes its pending scene value. Keep all existing
    /// authority/whole-world checks, borrowing the physical state synchronously
    /// and restoring it before any error, fallback or commit.
    fn apply_scene_sample(&mut self)->Result<Option<()>,u32>{
        if self.scene.as_ref().is_none_or(|s|!s.audio.is_empty()){return Ok(None);}
        self.scratch.clear();for h in &self.roster{self.scratch.push(self.slots[h.slot as usize].body.take().unwrap());}
        let result:Result<Option<crate::scene_owner::Owned>,u32>=(||{
            let world=self.world.as_ref().ok_or(8u32)?;let mut scene=self.scene.clone().ok_or(8u32)?;
            let authority=self.scene_authority(&self.scratch,world)?;let cmd=&self.input[..COMMAND_WIDTH];
            let _tag=integer(cmd[0]).ok_or(2u32)?;let id=integer(cmd[1]).ok_or(2u32)?;
            let h=Handle{slot:integer(cmd[2]).ok_or(2u32)?,generation:integer(cmd[3]).ok_or(2u32)?};
            if self.ids.get(&id)!=Some(&h){return Err(4);}
            let row:&[f64;motion::WIDTH]=cmd[4..].try_into().map_err(|_|2u32)?;if row.iter().any(|n|!n.is_finite()){return Err(2);}
            let own=self.scratch.iter().position(|b|b.handle==h).ok_or(4u32)?;
            crate::scene_wire::sample(&mut scene,self.scratch[own].handle,row)?;
            let active=crate::scene_control::active(world,&self.scratch)?;
            for(i,h)in active.iter().enumerate(){if active[..i].contains(h)||!self.scratch.iter().any(|b|b.handle==*h){return Err(4);}}
            if world.scope.as_ref()!=Some(&active){return Ok(None);}
            scene.system_read.capture_ordnance(&self.ordnance,world)?;
            self.validate_scene_draft(&self.scratch,world,&scene,&self.ordnance,&authority,&[])?;
            Ok(Some(scene))
        })();
        for body in self.scratch.drain(..){let slot=body.handle.slot as usize;self.slots[slot].body=Some(body);}
        if let Some(scene)=result?{self.scene=Some(scene);self.command_results.clear();Ok(Some(()))}else{Ok(None)}
    }
    fn apply_scene_commands(&mut self,words:usize)->Result<(),u32>{
        if words==COMMAND_WIDTH&&integer(self.input[0])==Some(165){if self.apply_scene_sample()?.is_some(){return Ok(());}}
        let mut world=self.world.clone().ok_or(8u32)?;let mut scene=Some(self.scene.clone().ok_or(8u32)?);
        let mut bodies:Vec<_>=self.roster.iter().map(|h|self.slots[h.slot as usize].body.as_ref().unwrap().clone()).collect();
        let mut authority=self.scene_authority(&bodies,&world)?;let mut ordnance=self.ordnance.clone();let mut random=self.random.clone();let mut visual=self.visual_random.clone();let mut notices=Vec::new();
        let mut results=Vec::new();let mut specs=self.specs.clone();let mut dynamic=crate::scene_dynamic_wire::Draft::default();
        for cmd in self.input[..words].chunks_exact(COMMAND_WIDTH){let tag=integer(cmd[0]).ok_or(2u32)?;let id=integer(cmd[1]).ok_or(2u32)?;let h=Handle{slot:integer(cmd[2]).ok_or(2u32)?,generation:integer(cmd[3]).ok_or(2u32)?};
            if !(155..=165).contains(&tag)&&!(197..=207).contains(&tag){return Err(8);}if self.ids.get(&id)!=Some(&h){return Err(4);}let row:&[f64;motion::WIDTH]=cmd[4..].try_into().map_err(|_|2u32)?;
            if row.iter().any(|n|!n.is_finite()){return Err(2);}let own=bodies.iter().position(|b|b.handle==h).ok_or(4u32)?;
            if (198..=200).contains(&tag){if h!=scene.as_ref().ok_or(8u32)?.player||scene.as_ref().unwrap().list.is_some(){return Err(8);}
                if let Some(value)=dynamic.apply(tag,row)?{results.push(crate::scene_dynamic::run(&value,scene.as_mut().unwrap(),&mut bodies,&mut world,&mut ordnance,&mut specs,&mut authority,&mut random,&mut visual,&mut notices)?);
                    crate::scene_runtime::flush_audio(scene.as_mut().unwrap(),&mut world)?;}continue;}
            if !dynamic.complete(){return Err(8);}
            if (201..=207).contains(&tag){if tag==201&&self.tick!=0.0{return Err(8);}let mut seats=scene.as_mut().unwrap().seats.take().unwrap_or_default();
                let applied=crate::scene_seat::apply(tag,row,&mut seats,scene.as_mut().unwrap(),&mut bodies,&mut world,&specs,own);
                scene.as_mut().unwrap().seats=Some(seats);let(deployed,result)=applied?;
                crate::scene_runtime::flush_audio(scene.as_mut().unwrap(),&mut world)?;
                crate::scene_runtime::deploy(scene.as_mut().unwrap(),&mut bodies,&mut world,&mut ordnance,&specs,&deployed,&mut random,&mut visual,&mut notices,&mut authority)?;
                if let Some(result)=result{results.push(result);}continue;}
            if (160..=164).contains(&tag){results.push(crate::scene_commands::apply(tag,row,scene.as_mut().ok_or(8u32)?,&mut bodies,&mut world,&mut ordnance,&specs,own,&mut random,&mut visual,&mut notices)?);
                crate::scene_runtime::flush_audio(scene.as_mut().unwrap(),&mut world)?;continue;}
            let (deployed,result)=crate::scene_wire::apply_control(tag,row,&mut scene,&mut bodies,&mut world,&specs,own,self.time,&mut visual,&mut notices)?;
            crate::scene_runtime::flush_audio(scene.as_mut().unwrap(),&mut world)?;
            crate::scene_runtime::deploy(scene.as_mut().unwrap(),&mut bodies,&mut world,&mut ordnance,&specs,&deployed,&mut random,&mut visual,&mut notices,&mut authority)?;
            if let Some(result)=result{results.push(result);}
        }
        let mut scene=scene.ok_or(8u32)?;if scene.list.is_some()||!dynamic.complete(){return Err(8);}world.set_scope(&bodies,crate::scene_control::active(&world,&bodies)?)?;
        scene.system_read.capture_ordnance(&ordnance,&world)?;
        self.validate_scene_draft_with_specs(&bodies,&world,&scene,&ordnance,&authority,&notices,&specs)?;
        self.commit_scene_draft(bodies,world,scene,ordnance,authority,random,visual,notices);self.specs=specs;self.command_results=results;Ok(())
    }
    fn step_combat(&mut self,next:f64,dt:f64)->Result<(),u32>{
        let mut random=self.random.clone();let mut visual=self.visual_random.clone();
        let mut world=self.world.clone();if let Some(w)=&mut world{w.time=self.time+dt;w.output.clear();w.retired_projectiles.clear();}
        self.ordnance_scratch.clone_from(&self.ordnance);
        self.scratch.truncate(self.roster.len());
        for (index,h) in self.roster.iter().enumerate(){let body=self.slots[h.slot as usize].body.as_ref().unwrap();
            if index==self.scratch.len(){self.scratch.push(body.clone());}else{self.scratch[index].clone_from(body);}
        }
        let mut prepared=Vec::with_capacity(self.scratch.len());let mut before=Vec::with_capacity(self.scratch.len());
        crate::effect_owner::listeners(&mut self.scratch,dt);
        // Same barriers as ShipStepBatch: prepare all, motion all, weapon state all,
        // query all (resident fire-control integration follows), ordered commit, finish.
        for index in 0..self.scratch.len(){
            if let Some(w)=&mut world{crate::phase_runtime::early_world(w,&mut self.scratch,index,dt,&self.specs,&mut self.notices)?;}
            if self.scratch[index].ship.as_ref().is_some_and(|s|s.world.is_some()){
                crate::system_owner::early(&mut self.scratch,index,dt)?;
                let m=crate::system_owner::modifiers(&self.scratch,index,&self.specs)?;self.scratch[index].ship.as_mut().unwrap().live=m;
            }
            self.local_notices.clear();
            if let Some(w)=&mut world{let scope:Vec<_>=self.scratch.iter().filter(|b|b.ship.as_ref().is_some_and(|s|s.flags&(ship_state::RETREATED|ship_state::DOCKED)==0)).map(|b|b.handle).collect();
                crate::readiness_owner::prepare_world(w,&mut self.scratch,index,dt,&scope,&self.specs,&mut random,&mut visual,&mut self.notices)?;
            }else{crate::readiness_owner::prepare(&mut self.scratch,index,dt,&mut random,&mut visual,&mut self.local_notices)?;}
            crate::system_owner::cancel(&mut self.scratch,index,&self.specs,&mut self.ordnance_scratch,dt,false,&mut random,&mut self.notices)?;
            let b=&mut self.scratch[index];
            self.notices.extend(self.local_notices.drain(..).map(|n|(b.id,b.handle,n)));
            before.push(b.motion);prepared.push(b.ship.as_ref().is_none_or(|s|s.can_advance()));
            if prepared[index]{if let Some(w)=&mut world{crate::motion_owner::sync(w,&mut self.scratch,index,&self.specs,&mut self.notices)?;}}
            let b=&mut self.scratch[index];
            if !world.as_ref().is_some_and(|w|w.gravity.is_some()){if let Some(s)=&mut b.ship{self.local_notices.clear();s.begin_advance(dt,&self.specs,&mut random,&mut self.local_notices)?;
                self.notices.extend(self.local_notices.drain(..).map(|n|(b.id,b.handle,n)));}}
            if world.as_ref().is_some_and(|w|w.gravity.is_some()){crate::gravity_runtime::prepare(world.as_mut().unwrap(),&mut self.scratch,&mut self.ordnance_scratch,index,&self.specs,dt,&mut random,&mut visual,&mut self.notices)?;}
            crate::system_owner::cancel(&mut self.scratch,index,&self.specs,&mut self.ordnance_scratch,dt,true,&mut random,&mut self.notices)?;
            if self.scratch[index].ship.as_ref().is_some_and(|s|s.world.is_some()){
                let m=crate::system_owner::modifiers(&self.scratch,index,&self.specs)?;self.scratch[index].ship.as_mut().unwrap().live=m;
                if let Some(w)=self.scratch[index].ship.as_mut().and_then(|s|s.world.as_mut()){w.previous=[before[index][0],before[index][1]];w.previous_facing=before[index][4];}
            }
            let b=&mut self.scratch[index];if let Some(s)=&mut b.ship{if s.can_advance(){self.local_notices.clear();s.finish_advance(&self.specs,&mut self.local_notices)?;
                self.notices.extend(self.local_notices.drain(..).map(|n|(b.id,b.handle,n)));}}
        }
        for index in 0..self.scratch.len(){if !prepared[index]{continue;}
            if let Some(w)=&mut world{crate::motion_owner::sync(w,&mut self.scratch,index,&self.specs,&mut self.notices)?;}
            let mut pose=self.scratch[index].motion;
            if let Some(s)=self.scratch[index].ship.as_ref().filter(|s|s.engines.is_some()){
                crate::motion_owner::stats(world.as_ref(),&self.scratch,index,&mut pose,&s.live)?;
            }
            let b=&mut self.scratch[index];
            let effective=b.ship.as_ref().map_or(dt,|s|s.clock[5]);let saved=b.motion[motion::MAX_SPEED];let mut resident=false;
            if let Some(s)=&b.ship{if let Some(e)=&s.engines{if e.data[19]!=1.0{return Err(8);}resident=true;
                b.motion=pose;
                b.motion[motion::FLAGS]=((b.motion[motion::FLAGS] as u32&!1)|if e.data[4]!=engine::READY{1}else{0}) as f64;
            }else{b.motion[motion::MAX_SPEED]*=s.motion_speed_multiplier();}}
            crate::motion_owner::advance(world.as_ref(),&mut self.scratch,index,&self.specs,effective)?;let b=&mut self.scratch[index];if !resident{b.motion[motion::MAX_SPEED]=saved;}
            if let Some(s)=&mut b.ship{s.finish_shield(&b.motion)?;}
        }
        for index in 0..self.scratch.len(){if self.scratch[index].ship.as_ref().is_some_and(|s|s.can_advance()){
            let facing=self.scratch[index].motion[motion::FACING];
            if let Some(w)=&mut world{crate::phase_runtime::with_ship(w,&mut self.scratch,index,&self.specs,&mut self.notices,|s,h,n|s.finish_weapons_with(facing,&mut random,&mut visual,n,h))?;
            }else{let b=&mut self.scratch[index];self.local_notices.clear();b.ship.as_mut().unwrap().finish_weapons(facing,&mut random,&mut visual,&mut self.local_notices)?;
                self.notices.extend(self.local_notices.drain(..).map(|n|(b.id,b.handle,n)));}}}
        if let Some(w)=&world{crate::gravity_runtime::query_inputs(w,&mut self.scratch)?;}
        crate::fire_query::plan_world(&mut self.scratch,&self.ordnance_scratch,&self.specs,world.as_ref())?;
        if let Some(w)=&mut world{crate::gravity_runtime::weapons(w,&mut self.scratch,&mut self.ordnance_scratch,&self.specs,dt,&mut random,&mut visual,&mut self.notices)?;}
        let fire_notices=self.notices.len();
        self.ordnance_scratch.fire(&mut self.scratch,&self.specs,&mut random,&mut self.notices)?;
        if let Some(w)=&mut world{for(id,h,n)in &self.notices[fire_notices..]{if n.kind==crate::battle::SHOT_SPAWNED||n.kind==crate::battle::BEAM_SPAWNED{
            let c=self.scratch.iter().find(|b|b.id==*id&&b.handle==*h).and_then(|b|b.ship.as_ref()).and_then(|s|s.combat.as_ref()).ok_or(4u32)?;w.stats.shot_fired(c.player.unwrap_or(false));}}}
        for index in 0..self.scratch.len(){if !prepared[index]{continue;}
            if self.scratch[index].ship.is_some(){let pose=self.scratch[index].motion;
                if let Some(w)=&mut world{crate::phase_runtime::with_ship(w,&mut self.scratch,index,&self.specs,&mut self.notices,|s,h,n|{
                    s.finish_damage(dt,&mut random,&mut visual,n);s.finish_engines_with(&pose,&before[index],&mut random,&mut visual,n,h)})?;
                }else{let b=&mut self.scratch[index];let s=b.ship.as_mut().unwrap();self.local_notices.clear();s.finish_damage(dt,&mut random,&mut visual,&mut self.local_notices);
                    s.finish_engines(&pose,&before[index],&mut random,&mut visual,&mut self.local_notices)?;self.notices.extend(self.local_notices.drain(..).map(|n|(b.id,b.handle,n)));}
                let b=&mut self.scratch[index];if let Some(e)=b.ship.as_ref().and_then(|s|s.engines.as_ref()){b.motion[motion::FLAGS]=((b.motion[motion::FLAGS]as u32&!1)|if e.data[4]!=engine::READY{1}else{0})as f64;}
            }
        }
        if let Some(w)=&mut world{w.nebula_stage(&mut self.scratch,&mut self.ordnance_scratch,&self.specs,&mut self.notices)?;}
        if let Some(w)=&mut world{crate::gravity_runtime::dispatch(w,&mut self.scratch,&mut self.ordnance_scratch,&self.specs,dt,&mut random,&mut visual,&mut self.notices)?;}else{crate::system_owner::dispatch(&mut self.scratch,&self.specs,&mut self.ordnance_scratch,dt,&mut random,&mut self.notices)?;}
        for row in 0..self.scratch.len(){if self.scratch[row].ship.as_ref().is_some_and(|s|s.world.is_some()){let m=crate::system_owner::modifiers(&self.scratch,row,&self.specs)?;self.scratch[row].ship.as_mut().unwrap().live=m;}}
        if let Some(w)=&mut world{crate::gravity_runtime::fields(w,&mut self.scratch,&mut self.ordnance_scratch,&self.specs,dt,&mut random,&mut visual,&mut self.notices)?;w.terrain_stage(&mut self.scratch,&mut self.ordnance_scratch,&self.specs,dt,&mut random,&mut visual,&mut self.notices)?;
            let mut host=crate::world_owner::Host{bodies:&mut self.scratch,specs:&self.specs,ordnance:&mut self.ordnance_scratch,owned:w,events:&mut self.notices};host.advance_explosions(dt,&mut random,&mut visual)?;host.finish()?;}
        self.ordnance_scratch.advance_projectiles(&mut self.scratch,&self.specs,world.as_mut(),dt,&mut random,&mut visual,&mut self.notices)?;
        if let Some(w)=&mut world{w.sync_explosion_projectiles(&self.ordnance_scratch);}
        self.ordnance_scratch.advance_beams(&mut self.scratch,&self.specs,world.as_mut(),dt,&mut random,&mut visual,&mut self.notices)?;
        if let Some(w)=&mut world{crate::aux_runtime::advance(w,&mut self.scratch,&mut self.ordnance_scratch,&self.specs,dt,&mut random,&mut visual,&mut self.notices)?;
            w.advance_particles(dt);crate::weapon_world::advance_floating(&mut w.floating,dt);w.hulk_stage(&mut self.scratch,&mut self.ordnance_scratch,&self.specs,dt,&mut visual,&mut self.notices)?;}
        if let Some(w)=&mut world{let mut host=crate::world_owner::Host{bodies:&mut self.scratch,specs:&self.specs,ordnance:&mut self.ordnance_scratch,owned:w,events:&mut self.notices};
            for row in 0..host.bodies.len(){if host.bodies[row].ship.as_ref().is_some_and(|s|s.flags&ship_state::DEAD==0&&s.armor.as_ref().is_some_and(|a|a.data[14]<=0.0)){host.destroy(row,&mut random,&mut visual)?;}}host.finish()?;}
        crate::effect_owner::drain_notices(&mut self.ordnance_scratch,&mut self.notices);
        if !self.ordnance_scratch.valid()||self.scratch.iter().any(|b|b.motion.iter().any(|n|!n.is_finite())||b.ship.as_ref().is_some_and(|s|!s.valid())){return Err(7);}
        if self.sequence+self.notices.len() as f64>MAX_INTEGER{return Err(5);}
        for (index,h) in self.roster.iter().enumerate(){std::mem::swap(self.slots[h.slot as usize].body.as_mut().unwrap(),&mut self.scratch[index]);}
        std::mem::swap(&mut self.ordnance,&mut self.ordnance_scratch);self.world=world;self.time+=dt;self.tick=next;self.random=random;self.visual_random=visual;
        let notices=std::mem::take(&mut self.notices);self.append(notices.iter().cloned());self.notices=notices;Ok(())
    }
    pub fn publish_summary(&mut self)->Result<&[f64],u32>{if !self.startup_random_installed{return Err(8);}let scene=self.scene.as_ref().ok_or(8u32)?;let world=self.world.as_ref().ok_or(8u32)?;
        self.summary_output=[1.0,self.tick,self.time,(scene.result.is_some()&&!world.visual.explosions.iter().any(|e|e.kind==3))as u32 as f64,
            scene.winning_team.is_some()as u32 as f64,scene.winning_team.unwrap_or(0)as f64,self.ordnance.projectiles.len()as f64,self.sequence,world.visual.audio_sequence,world.visual.audio.len()as f64];
        if self.summary_output.iter().any(|n|!n.is_finite()){return Err(7);}Ok(&self.summary_output)
    }
    pub fn publish_audio(&mut self)->Result<&[f64],u32>{if !self.startup_random_installed||self.scene.is_none(){return Err(8);}self.audio_output=crate::visual_wire::audio_words(&self.world.as_ref().ok_or(8u32)?.visual)?;Ok(&self.audio_output)}
    pub fn publish_scene(&mut self)->Result<&[f64],u32>{
        if !self.startup_random_installed{return Err(8);}let scene=self.scene.as_ref().ok_or(8u32)?;let world=self.world.as_ref().ok_or(8u32)?;
        // words() and all its readers are synchronous and have no external
        // calls. Move the same committed bodies into their contiguous read
        // scope; restore every slot before handling a rejected publication.
        self.scratch.clear();
        for h in &self.roster{self.scratch.push(self.slots[h.slot as usize].body.take().unwrap());}
        let words=crate::scene_publication::words(scene,&self.scratch,world,&self.ordnance,&self.specs,self.tick,self.time,&self.births,&self.command_results);
        for body in self.scratch.drain(..){let slot=body.handle.slot as usize;self.slots[slot].body=Some(body);}
        self.scene_output=words?;Ok(&self.scene_output)
    }
    pub fn publish(&mut self) -> &[f64] {
        let guidance_count=self.ordnance.projectiles.iter().filter(|p|p.guidance.is_some()).count();
        let immune_count=self.ordnance.projectiles.iter().filter_map(|p|p.flare_state.as_ref()).map(|f|f.immune.len()).sum::<usize>();
        let beam_effects=self.ordnance.beams.iter().filter(|b|b.effect.is_some()).count();let mut graviton_owners=0usize;let mut graviton_hits=0usize;
        for h in &self.roster{if let Some(c)=self.slots[h.slot as usize].body.as_ref().unwrap().ship.as_ref().and_then(|s|s.combat.as_ref()){
            if !c.graviton.hits.is_empty(){graviton_owners+=1;graviton_hits+=c.graviton.hits.len();}}}
        let systems = self.roster.iter().map(|h| self.slots[h.slot as usize].body.as_ref().unwrap().ship.as_ref().map_or(0, |s| s.systems.len())).sum::<usize>();
        let shields = self.roster.iter().filter(|h| self.slots[h.slot as usize].body.as_ref().unwrap().ship.as_ref().is_some_and(|s| s.shield.is_some())).count();
        let mut armors = 0usize; let mut cells = 0usize; let mut scars = 0usize; let mut components = 0usize;
        let mut controllers=0usize; let mut engines=0usize; let mut engine_indices=0usize;
        let mut weapon_controllers=0usize;let mut weapon_mounts=0usize;let mut weapon_groups=0usize;let mut weapon_members=0usize;let mut weapon_indices=0usize;
        let mut fire_memories=0usize;let mut readiness_count=0usize;let mut readiness_targets=0usize;
        let mut world_count=0usize;let mut world_words=0usize;let mut range_count=0usize;let mut ship_world_blocks=Vec::new();
        for h in &self.roster { if let Some(ship) = &self.slots[h.slot as usize].body.as_ref().unwrap().ship {
            if let Some(w)=&ship.world{let words=w.words(ship);let body=self.slots[h.slot as usize].body.as_ref().unwrap();world_count+=1;world_words+=words.len();ship_world_blocks.push((body.id,body.handle,words));}
            components += ship.components.len(); if let Some(a) = &ship.armor { armors += 1; cells += a.cells.len(); scars += a.scars.len(); }
            if let Some(e)=&ship.engines {controllers+=1; engines+=e.engines.len(); engine_indices+=e.just_disabled.len();}
            if let Some(w)=&ship.weapons {weapon_controllers+=1;weapon_mounts+=w.mounts.len();weapon_groups+=w.groups.len();
                weapon_members+=w.groups.iter().map(|g| g.members.len()).sum::<usize>();weapon_indices+=w.disabled.len()+w.repaired.len();}
            if let Some(c)=&ship.combat{fire_memories+=c.fire.iter().filter(|e|e.query.is_some()).count();range_count+=c.fire.iter().filter(|e|e.range_inputs.is_some()).count();
                if let Some(r)=&c.readiness{readiness_count+=1;readiness_targets+=r.state.deployment_sequence.as_ref().map_or(0,|s|s.targets.len());}}
        } }
        let world_block=self.world.as_ref().map_or(Vec::new(),|w|crate::world_wire::words_iter(w,self.roster.iter().map(|h|self.slots[h.slot as usize].body.as_ref().unwrap()),&self.ordnance));
        self.output.clear(); self.output.reserve(OUTPUT_HEADER + self.roster.len() * BODY_WIDTH + systems * SYSTEM_WIDTH + shields * SHIELD_WIDTH
            + armors * ARMOR_WIDTH + cells + scars * SCAR_WIDTH + components * COMPONENT_WIDTH
            + controllers*ENGINE_CONTROLLER_WIDTH+engines*ENGINE_WIDTH+engine_indices+self.events.len() * EVENT_WIDTH
            + weapon_controllers*WEAPON_CONTROLLER_WIDTH+weapon_mounts*WEAPON_MOUNT_WIDTH+weapon_groups*WEAPON_GROUP_WIDTH+weapon_members+weapon_indices
            +self.ordnance.projectiles.len()*crate::projectile::WIDTH+self.ordnance.beams.len()*crate::battle::BEAM_WIDTH+fire_memories*(3+crate::fire_query::WIDTH)
            +readiness_count*(3+crate::readiness_owner::WIDTH)+readiness_targets*2+guidance_count*crate::missile_owner::WIDTH+immune_count*2+beam_effects*8+graviton_owners*6+graviton_hits*5
            +world_count*5+world_words+range_count*16+world_block.len());
        self.output.extend_from_slice(&[ABI as f64, self.tick, self.time, self.roster.len() as f64,
            self.random.seed as f64, self.random.cursor, self.random.ids, self.visual_random.seed as f64,
            self.visual_random.cursor, self.visual_random.ids, DOMAIN_MASK as f64, self.next_order,
            systems as f64, self.events.len() as f64, self.sequence, self.acknowledged, shields as f64,
            armors as f64,cells as f64,scars as f64,components as f64,controllers as f64,engines as f64,engine_indices as f64,
            weapon_controllers as f64,weapon_mounts as f64,weapon_groups as f64,weapon_members as f64,weapon_indices as f64,
            self.ordnance.projectiles.len() as f64,self.ordnance.beams.len() as f64,self.ordnance.serial,fire_memories as f64,readiness_count as f64,readiness_targets as f64,guidance_count as f64,immune_count as f64,beam_effects as f64,graviton_owners as f64,graviton_hits as f64,
            world_count as f64,world_words as f64,range_count as f64,world_block.len()as f64]);
        for h in &self.roster {
            let body = self.slots[h.slot as usize].body.as_ref().unwrap();
            self.output.extend_from_slice(&[body.id as f64, body.handle.slot as f64, body.handle.generation as f64, body.order]);
            self.output.extend_from_slice(&body.motion);
            if let Some(ship) = &body.ship { self.output.push(1.0); self.output.extend_from_slice(&ship.words()); }
            else { self.output.extend_from_slice(&[0.0; 1 + ship_state::WIDTH]); }
        }
        for h in &self.roster {
            let body = self.slots[h.slot as usize].body.as_ref().unwrap();
            if let Some(ship) = &body.ship { for s in &ship.systems {
                self.output.extend_from_slice(&[body.id as f64, body.handle.slot as f64, body.handle.generation as f64]);
                self.output.extend_from_slice(&s.words()); self.output.extend_from_slice(&s.upkeep); self.output.push(s.defense as u32 as f64);
            } }
        }
        for h in &self.roster {
            let body = self.slots[h.slot as usize].body.as_ref().unwrap();
            if let Some(ship) = &body.ship { if let Some(shield) = &ship.shield {
                self.output.extend_from_slice(&[body.id as f64, body.handle.slot as f64, body.handle.generation as f64]);
                self.output.extend_from_slice(&shield.words(ship.flux.hard / ship.flux.max));
            } }
        }
        let mut cell_offset = 0usize;
        for h in &self.roster {
            let body = self.slots[h.slot as usize].body.as_ref().unwrap();
            if let Some(a) = body.ship.as_ref().and_then(|s| s.armor.as_ref()) {
                self.output.extend_from_slice(&[body.id as f64,body.handle.slot as f64,body.handle.generation as f64]);
                self.output.extend_from_slice(&a.words()); self.output.extend_from_slice(&[cell_offset as f64,a.cells.len() as f64]); cell_offset += a.cells.len();
            }
        }
        for h in &self.roster { if let Some(a) = self.slots[h.slot as usize].body.as_ref().unwrap().ship.as_ref().and_then(|s| s.armor.as_ref()) {
            self.output.extend(a.cells.iter().map(|n| *n as f64));
        } }
        for h in &self.roster {
            let body = self.slots[h.slot as usize].body.as_ref().unwrap();
            if let Some(a) = body.ship.as_ref().and_then(|s| s.armor.as_ref()) { for mark in &a.scars {
                self.output.extend_from_slice(&[body.id as f64,body.handle.slot as f64,body.handle.generation as f64]); self.output.extend_from_slice(mark);
            } }
        }
        for h in &self.roster {
            let body = self.slots[h.slot as usize].body.as_ref().unwrap();
            if let Some(ship) = &body.ship { for component in &ship.components {
                self.output.extend_from_slice(&[body.id as f64,body.handle.slot as f64,body.handle.generation as f64]); self.output.extend_from_slice(&component.data);
            } }
        }
        let mut engine_index_offset=0usize;
        for h in &self.roster {
            let b=self.slots[h.slot as usize].body.as_ref().unwrap();
            if let Some(e)=b.ship.as_ref().and_then(|s| s.engines.as_ref()) {
                self.output.extend_from_slice(&[b.id as f64,b.handle.slot as f64,b.handle.generation as f64]); self.output.extend_from_slice(&e.words());
                self.output.extend_from_slice(&[engine_index_offset as f64,e.just_disabled.len() as f64]); engine_index_offset+=e.just_disabled.len();
            }
        }
        for h in &self.roster {
            let b=self.slots[h.slot as usize].body.as_ref().unwrap();
            if let Some(e)=b.ship.as_ref().and_then(|s| s.engines.as_ref()) {for slot in &e.engines {
                self.output.extend_from_slice(&[b.id as f64,b.handle.slot as f64,b.handle.generation as f64]); self.output.extend_from_slice(&slot.data);
            }}
        }
        for h in &self.roster {if let Some(e)=self.slots[h.slot as usize].body.as_ref().unwrap().ship.as_ref().and_then(|s| s.engines.as_ref()) {
            self.output.extend(e.just_disabled.iter().map(|i| *i as f64));
        }}
        let mut weapon_index_offset=0usize;
        for h in &self.roster {
            let b=self.slots[h.slot as usize].body.as_ref().unwrap();if let Some(w)=b.ship.as_ref().and_then(|s| s.weapons.as_ref()) {
                self.output.extend_from_slice(&[b.id as f64,b.handle.slot as f64,b.handle.generation as f64]);self.output.extend_from_slice(&w.data);
                self.output.extend_from_slice(&[weapon_index_offset as f64,w.disabled.len() as f64,(weapon_index_offset+w.disabled.len()) as f64,w.repaired.len() as f64]);
                weapon_index_offset+=w.disabled.len()+w.repaired.len();
            }
        }
        for h in &self.roster {
            let b=self.slots[h.slot as usize].body.as_ref().unwrap();if let Some(w)=b.ship.as_ref().and_then(|s| s.weapons.as_ref()) {for m in &w.mounts {
                self.output.extend_from_slice(&[b.id as f64,b.handle.slot as f64,b.handle.generation as f64]);self.output.extend_from_slice(&m.data);
            }}
        }
        let mut member_offset=0usize;
        for h in &self.roster {
            let b=self.slots[h.slot as usize].body.as_ref().unwrap();if let Some(w)=b.ship.as_ref().and_then(|s| s.weapons.as_ref()) {for g in &w.groups {
                self.output.extend_from_slice(&[b.id as f64,b.handle.slot as f64,b.handle.generation as f64]);self.output.extend_from_slice(&g.data);
                self.output.extend_from_slice(&[member_offset as f64,g.members.len() as f64]);member_offset+=g.members.len();
            }}
        }
        for h in &self.roster {if let Some(w)=self.slots[h.slot as usize].body.as_ref().unwrap().ship.as_ref().and_then(|s| s.weapons.as_ref()) {
            for g in &w.groups {self.output.extend(g.members.iter().map(|n| *n as f64));}
        }}
        for h in &self.roster {if let Some(w)=self.slots[h.slot as usize].body.as_ref().unwrap().ship.as_ref().and_then(|s| s.weapons.as_ref()) {
            self.output.extend(w.disabled.iter().chain(w.repaired.iter()).map(|n| *n as f64));
        }}
        for p in &self.ordnance.projectiles{self.output.extend_from_slice(&p.words());}
        for b in &self.ordnance.beams{self.output.extend_from_slice(&b.words());}
        for h in &self.roster{let b=self.slots[h.slot as usize].body.as_ref().unwrap();if let Some(c)=b.ship.as_ref().and_then(|s|s.combat.as_ref()){
            for (i,e)in c.fire.iter().enumerate(){if let Some(q)=&e.query{self.output.extend_from_slice(&[b.id as f64,b.handle.slot as f64,b.handle.generation as f64]);
                self.output.extend_from_slice(&q.words(b.ship.as_ref().unwrap().weapons.as_ref().unwrap().mounts[i].data[0]as u32));}}
        }}
        let mut readiness_offset=0usize;
        for h in &self.roster{let b=self.slots[h.slot as usize].body.as_ref().unwrap();if let Some(r)=b.ship.as_ref().and_then(|s|s.combat.as_ref()).and_then(|c|c.readiness.as_ref()){
            self.output.extend_from_slice(&[b.id as f64,b.handle.slot as f64,b.handle.generation as f64]);self.output.extend_from_slice(&crate::readiness_owner::words(r,readiness_offset));
            readiness_offset+=r.state.deployment_sequence.as_ref().map_or(0,|s|s.targets.len());
        }}
        for h in &self.roster{if let Some(seq)=self.slots[h.slot as usize].body.as_ref().unwrap().ship.as_ref().and_then(|s|s.combat.as_ref()).and_then(|c|c.readiness.as_ref()).and_then(|r|r.state.deployment_sequence.as_ref()){
            for target in &seq.targets{let (kind,id)=match target{crate::readiness::Target::Weapon(id)=>(0,*id),crate::readiness::Target::Engine(id)=>(1,*id)};self.output.extend_from_slice(&[kind as f64,id as f64]);}
        }}
        let mut immune_offset=0usize;
        for p in &self.ordnance.projectiles{if p.guidance.is_some(){self.output.extend_from_slice(&crate::missile_owner::words(p,immune_offset));
            immune_offset+=p.flare_state.as_ref().map_or(0,|f|f.immune.len());}}
        for p in &self.ordnance.projectiles{if let Some(f)=&p.flare_state{for id in &f.immune{self.output.extend_from_slice(&[id.handle as f64,id.generation as f64]);}}}
        for b in &self.ordnance.beams{if b.effect.is_some(){self.output.extend_from_slice(&crate::effect_owner::beam_words(b));}}
        let mut graviton_offset=0usize;
        for h in &self.roster{let b=self.slots[h.slot as usize].body.as_ref().unwrap();if let Some(c)=b.ship.as_ref().and_then(|s|s.combat.as_ref()){
            if !c.graviton.hits.is_empty(){self.output.extend_from_slice(&[b.id as f64,b.handle.slot as f64,b.handle.generation as f64,c.graviton_multiplier,c.graviton.hits.len()as f64,graviton_offset as f64]);graviton_offset+=c.graviton.hits.len();}}}
        for h in &self.roster{if let Some(c)=self.slots[h.slot as usize].body.as_ref().unwrap().ship.as_ref().and_then(|s|s.combat.as_ref()){
            for (w,time)in &c.graviton.hits{self.output.extend_from_slice(&[w.source as f64,w.slot as f64,w.generation as f64,w.component as f64,*time]);}}}
        let mut world_offset=0usize;
        for(id,h,words)in &ship_world_blocks{let n=words.len();self.output.extend_from_slice(&[*id as f64,h.slot as f64,h.generation as f64,world_offset as f64,n as f64]);world_offset+=n;}
        for(_,_,words)in ship_world_blocks{self.output.extend(words);}
        for h in &self.roster{let b=self.slots[h.slot as usize].body.as_ref().unwrap();if let Some(c)=b.ship.as_ref().and_then(|s|s.combat.as_ref()){
            for(i,e)in c.fire.iter().enumerate(){if let Some(r)=&e.range_inputs{self.output.extend([b.id as f64,b.handle.slot as f64,b.handle.generation as f64,i as f64]);self.output.extend(r.words());}}}}
        self.output.extend(world_block);
        for e in &self.events { self.output.extend_from_slice(&[e.sequence, e.tick, e.body as f64, e.handle.slot as f64,
            e.handle.generation as f64, e.notice.system as f64, e.notice.kind as f64, e.notice.value,e.notice.detail[0],e.notice.detail[1]]); }
        &self.output
    }
}
