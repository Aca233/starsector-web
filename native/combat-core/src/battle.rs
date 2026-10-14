//! Resident weapon emission and immediate conventional contact commits.
//! Special effect admission and full authority adapters remain separate work.
use crate::{contact::{self,Point,Surface},motion,projectile::{Delivery,Projectile,BeamClock},
    random::Random,ship_state::{self,Notice},state::{Body,Handle},weapon_fire::{self,FireSpec,FireMountState,FireContext,FireInput,Emission,EmissionKind}};
pub const BEAM_WIDTH:usize=29;
pub const SHOT_SPAWNED:u32=38;
pub const SHOT_CONTACT:u32=39;
pub const SHOT_RETIRED:u32=40;
pub const BEAM_SPAWNED:u32=41;
pub const BEAM_RETIRED:u32=42;
pub const BEAM_REFRESHED:u32=46;

#[derive(Clone)]
pub struct RangeInputs{pub base:f64,pub percent:f64,pub multiplier:f64,pub flat:f64,pub threshold:Option<f64>,pub past:f64,pub ship_multiplier:f64,pub authored_range:f64,pub authored_speed:f64,pub speed_bonus:f64,pub carrier_flat:f64}
impl RangeInputs{
    pub fn new(r:&[f64])->Self{Self{base:r[1],percent:r[2],multiplier:r[3],flat:r[4],threshold:if r[5]==1.0{Some(r[6])}else{None},past:r[7],ship_multiplier:r[8],authored_range:r[9],authored_speed:r[10],speed_bonus:r[11],carrier_flat:r[12]}}
    pub fn words(&self)->[f64;12]{[self.base,self.percent,self.multiplier,self.flat,self.threshold.is_some()as u32 as f64,self.threshold.unwrap_or(0.0),self.past,self.ship_multiplier,self.authored_range,self.authored_speed,self.speed_bonus,self.carrier_flat]}
}
pub fn weapon_geometry(e:&FireEntry,kind:usize,live:&crate::ship_effects::Modifiers,ecm:f64)->(f64,f64){
    let Some(r)=&e.range_inputs else{return(e.range,e.speed);};
    let percent=if kind==0{0.0}else{live.weapon_value(kind-1,crate::ship_effects::RANGE)};
    let range=(r.base*(1.0+(r.percent+percent)/100.0)*r.multiplier*(1.0-ecm/100.0)+r.flat+r.carrier_flat)*r.ship_multiplier;
    let range=if kind==3||r.threshold.is_none_or(|t|range<=t){range}else{let t=r.threshold.unwrap();t+(range-t)*r.past};
    let speed_percent=if kind==0{0.0}else{live.weapon_value(kind-1,crate::ship_effects::PROJECTILE_SPEED)};
    (range.max(0.0),e.speed*(1.0+(r.speed_bonus+speed_percent)/100.0)/(1.0+r.speed_bonus/100.0))
}
struct FireHooks<'a>{reader:&'a crate::system_owner::Reader,kind:usize,damage:f64,beam:f64,support:f64,compensation:Option<&'a mut crate::ship_effects::Compensation>,railgun:bool,eligible:bool,attitude:bool}
impl weapon_fire::Hooks for FireHooks<'_>{
    fn read(&mut self,flux:&crate::flux::Flux,ctx:&mut FireContext){let m=self.reader.read(flux);
        ctx.weapon_damage_multiplier=self.damage*((if self.kind==0{1.0}else{m.weapon_value(self.kind-1,crate::ship_effects::DAMAGE)})*self.support);
        ctx.beam_damage_multiplier=self.beam*m.get(crate::ship_effects::BEAM_DAMAGE);
    }
    fn recoil(&mut self,flux:&mut crate::flux::Flux,delta:[f64;2]){if let Some(c)=&mut self.compensation{c.on_recoil(self.railgun,self.eligible,self.attitude,delta[0],delta[1],flux);}}
}

#[derive(Clone)]
pub struct FireEntry{
    pub spec:FireSpec,pub delivery:Option<Delivery>,pub state:FireMountState,pub input:FireInput,
    pub range:f64,pub speed:f64,pub offsets:usize,pub aux:bool,
    pub query:Option<crate::fire_query::MountQuery>,
    pub input_target:Option<Handle>,pub cycle_target:Option<Handle>,pub cycle_projectile_numeric:Option<f64>,
    pub beam_style:crate::effect_owner::BeamStyle,
    pub beam_hit_radius:f64,pub beam_hit_brighten:f64,
    pub railgun:bool,pub pd_role:bool,pub range_inputs:Option<RangeInputs>,
}
impl FireEntry{
    pub fn new(row:&[f64])->Self{
        let spec=FireSpec{burst_size:row[1],interruptible:row[2]==1.0,auto_charge:row[3]==1.0,
            flux_per_shot:row[4],flux_per_second:row[5],beam_chargeup:row[6],beam_chargedown:row[7],beam_duration:row[8],
            beam_fire_only_full:row[9]==1.0,beam_sustained:row[10]==1.0,max_spread:row[11],spread_per_shot:row[12],
            relative_pos:[row[13],row[14]],damage_per_shot:row[15],damage_per_second:row[16],emp_per_shot:row[17],emp_per_second:row[18],
            physical_recoil_speed:row[19],point_defense:row[20]==1.0,..FireSpec::default()};
        Self{spec,delivery:None,state:FireMountState::default(),input:FireInput{requested:false,trigger_held:false,disabled:false,
                    system_allows:true,suspended:false,recheck_flux_budget:true,step_dt:0.0,target_ship:None,target_projectile:None},range:0.0,speed:0.0,offsets:row[21] as usize,aux:false,query:None,input_target:None,cycle_target:None,cycle_projectile_numeric:None,beam_style:crate::effect_owner::BeamStyle::default(),beam_hit_radius:0.0,beam_hit_brighten:1.0,railgun:false,pd_role:false,range_inputs:None}
    }
    pub fn configure(&mut self,row:&[f64]){self.spec.rocket=row[1]==1.0;self.spec.source_missile_lifecycle=row[2]==1.0;
        self.spec.dud_probability=row[3];self.spec.flight_time=if row[4]==1.0{Some(row[5])}else{None};self.spec.launch_speed=row[6];self.range=row[7];self.speed=row[8];self.aux=true;}
    pub fn complete(&self)->bool{self.aux&&self.delivery.as_ref().is_some_and(|d|(d.spawn_type!=4||d.guidance.is_some())&&d.guidance.as_ref().is_none_or(|g|g.complete()))&&self.spec.offsets.len()==self.offsets}
    pub fn valid(&self)->bool{self.spec.valid()&&self.range.is_finite()&&self.speed.is_finite()&&self.range_inputs.as_ref().is_none_or(|r|r.words().into_iter().all(f64::is_finite))}
}
pub struct CombatShip{
    pub team:u32,pub size:u32,pub radius:f64,pub expected_bounds:usize,pub bounds:Vec<Point>,pub attrs:[f64;20],pub fire:Vec<FireEntry>,
    pub player:Option<bool>,
    pub graviton:crate::weapon_effects::GravitonHits,pub graviton_multiplier:f64,pub shield_pierced:f64,
    pub query:Option<crate::fire_query::ShipQuery>,
    pub readiness:Option<crate::readiness_owner::Owned>,
    pub death:Option<crate::world_owner::Meta>,
}
impl Clone for CombatShip{
    fn clone(&self)->Self{Self{team:self.team,size:self.size,radius:self.radius,expected_bounds:self.expected_bounds,bounds:self.bounds.clone(),attrs:self.attrs,fire:self.fire.clone(),player:self.player,graviton:self.graviton.clone(),graviton_multiplier:self.graviton_multiplier,shield_pierced:self.shield_pierced,query:self.query.clone(),readiness:self.readiness.clone(),death:self.death.clone()}}
    fn clone_from(&mut self,s:&Self){self.team=s.team;self.size=s.size;self.radius=s.radius;self.expected_bounds=s.expected_bounds;self.bounds.clone_from(&s.bounds);self.attrs=s.attrs;self.fire.clone_from(&s.fire);self.player=s.player;self.graviton.clone_from(&s.graviton);self.graviton_multiplier=s.graviton_multiplier;self.shield_pierced=s.shield_pierced;self.query.clone_from(&s.query);self.readiness.clone_from(&s.readiness);self.death.clone_from(&s.death);}
}
impl CombatShip{
    pub fn new(row:&[f64])->Self{let mut attrs=[0.0;20];attrs[1..3].fill(1.0);attrs[7]=1.0;attrs[11..18].fill(1.0);
        Self{team:row[0] as u32,size:row[1] as u32,radius:row[2],expected_bounds:row[3] as usize,bounds:Vec::new(),attrs,fire:Vec::new(),player:if row[4]==1.0{Some(row[5]==1.0)}else{None},graviton:crate::weapon_effects::GravitonHits::default(),graviton_multiplier:1.0,shield_pierced:1.0,query:None,readiness:None,death:None}}
    pub fn complete(&self,mounts:usize)->bool{self.bounds.len()==self.expected_bounds&&(self.fire.is_empty()||self.fire.len()==mounts&&self.fire.iter().all(FireEntry::complete))
        &&self.query.as_ref().is_none_or(|q|q.complete()&&self.fire.iter().all(|e|e.query.is_some()))}
    pub fn valid(&self)->bool{self.attrs.iter().all(|v|v.is_finite())&&self.bounds.iter().flatten().all(|v|v.is_finite())&&self.fire.iter().all(FireEntry::valid)&&self.readiness.as_ref().is_none_or(|r|r.valid())&&self.graviton.valid()&&self.graviton_multiplier.is_finite()&&self.shield_pierced.is_finite()}
    pub fn collisionless(&self,body:&Body)->bool{self.attrs[0]>0.0||body.ship.as_ref().is_some_and(|s|s.flags&(ship_state::DOCKED|ship_state::RETREATED)!=0||s.shield.as_ref().is_some_and(|sh|
        sh.kind()==crate::shield::PHASE&&(sh.data[14]==1.0||sh.data[14]==2.0||sh.data[14]==3.0&&sh.data[15]>0.5)))}
    pub fn outgoing(&self)->[f64;8]{self.attrs[3..11].try_into().unwrap()}
}
#[derive(Clone)]
pub struct Beam{
    pub serial:f64,pub id:f64,pub source:u32,pub source_handle:Handle,pub component:u32,pub cycle:f64,pub team:u32,
    pub start:Point,pub end:Point,pub previous_end:Point,pub barrel:Point,pub elapsed:f64,pub duration:f64,pub max_duration:f64,pub scale_glow:Option<bool>,pub damage:f64,pub emp:f64,
    pub brightness:f64,pub damage_active:bool,pub active_born:bool,pub refreshed:bool,pub reset_cycle:bool,pub barrel_value:bool,pub advanced:bool,pub ray_value:bool,pub sampled:bool,pub hitting:bool,pub clock:BeamClock,
    pub effect:Option<crate::weapon_effects::Effect>,pub effect_state:crate::weapon_effects::BeamEffectState,pub style:crate::effect_owner::BeamStyle,pub base_emp:f64,pub player:bool,
    pub player_known:bool,pub base_damage:f64,pub hit_radius:f64,pub hit_brighten:f64,pub visual:crate::weapon_world::BeamVisual,
}
impl Beam{
    pub fn new(serial:f64,source:u32,handle:Handle,team:u32,e:&Emission)->Self{Self{serial,id:e.id,source,source_handle:handle,component:e.component_id,cycle:e.cycle_id,
        team,start:e.position,end:e.position,previous_end:e.position,barrel:e.barrel_offset,elapsed:0.0,duration:e.duration,max_duration:e.duration,scale_glow:None,damage:e.damage,emp:e.emp,
        brightness:0.0,damage_active:true,active_born:matches!(e.kind,EmissionKind::BeamActive),refreshed:false,reset_cycle:false,barrel_value:matches!(e.kind,EmissionKind::BeamActive),advanced:false,ray_value:false,sampled:false,hitting:false,clock:BeamClock::default(),effect:None,effect_state:crate::weapon_effects::BeamEffectState::default(),style:crate::effect_owner::BeamStyle::default(),base_emp:0.0,player:false,player_known:false,base_damage:e.damage,hit_radius:0.0,hit_brighten:1.0,visual:crate::weapon_world::BeamVisual{size_mult:1.0,..Default::default()}}}
    pub fn words(&self)->[f64;BEAM_WIDTH]{[self.serial,self.id,self.source as f64,self.source_handle.slot as f64,self.source_handle.generation as f64,self.component as f64,self.cycle,self.team as f64,
        self.start[0],self.start[1],self.end[0],self.end[1],self.previous_end[0],self.previous_end[1],self.barrel[0],self.barrel[1],self.elapsed,self.duration,self.damage,self.emp,
        self.brightness,self.damage_active as u32 as f64,self.hitting as u32 as f64,self.clock.elapsed.is_some() as u32 as f64,self.clock.elapsed.unwrap_or(0.0),self.clock.integral,self.clock.duration,self.clock.multiplier,0.0]}
}
pub struct Ordnance{pub projectiles:Vec<Projectile>,pub beams:Vec<Beam>,pub serial:f64,pub emissions:Vec<Emission>,pub effect_records:Vec<crate::weapon_effects_owner::Record>}
impl Clone for Ordnance{
    fn clone(&self)->Self{Self{projectiles:self.projectiles.clone(),beams:self.beams.clone(),serial:self.serial,emissions:Vec::new(),effect_records:Vec::new()}}
    fn clone_from(&mut self,s:&Self){self.projectiles.clone_from(&s.projectiles);self.beams.clone_from(&s.beams);self.serial=s.serial;self.emissions.clear();self.effect_records.clear();}
}
impl Ordnance{
    pub fn new()->Self{Self{projectiles:Vec::new(),beams:Vec::new(),serial:0.0,emissions:Vec::new(),effect_records:Vec::new()}}
    pub fn valid(&self)->bool{self.projectiles.iter().all(Projectile::valid)&&self.beams.iter().all(|b|b.words().iter().all(|n|n.is_finite())&&b.effect_state.valid())}
    pub fn fire(&mut self,bodies:&mut [Body],specs:&std::collections::BTreeMap<u32,crate::lifecycle::Spec>,random:&mut Random,events:&mut Vec<(u32,Handle,Notice)>)->Result<(),u32>{
        let queued:Vec<_>=bodies.iter().map(|b|(b.handle,None)).collect();self.fire_selected(bodies,specs,&queued,random,events)
    }
    /// Commit only the actual queued owners, in source queue/mount order. A
    /// selected component lets ordinary and tractor mounts share that order.
    pub fn fire_selected(&mut self,bodies:&mut[Body],specs:&std::collections::BTreeMap<u32,crate::lifecycle::Spec>,queued:&[(Handle,Option<u32>)],random:&mut Random,events:&mut Vec<(u32,Handle,Notice)>)->Result<(),u32>{
        self.fire_selected_inner(bodies,specs,queued,random,events,None)
    }
    pub fn fire_selected_visual(&mut self,bodies:&mut[Body],specs:&std::collections::BTreeMap<u32,crate::lifecycle::Spec>,queued:&[(Handle,Option<u32>)],random:&mut Random,events:&mut Vec<(u32,Handle,Notice)>,fx:&mut crate::combat_visuals::Owned,visual:&mut Random)->Result<(),u32>{
        self.fire_selected_inner(bodies,specs,queued,random,events,Some((fx,visual)))
    }
    fn fire_selected_inner(&mut self,bodies:&mut[Body],specs:&std::collections::BTreeMap<u32,crate::lifecycle::Spec>,queued:&[(Handle,Option<u32>)],random:&mut Random,events:&mut Vec<(u32,Handle,Notice)>,mut fx:Option<(&mut crate::combat_visuals::Owned,&mut Random)>)->Result<(),u32>{
        let mut target_handles:Option<Vec<(u32,Handle)>>=None;
        let mut readers=std::collections::BTreeMap::new();let mut support=std::collections::BTreeMap::new();
        for &(handle,_) in queued{let row=bodies.iter().position(|b|b.handle==handle).ok_or(4u32)?;
            if readers.contains_key(&row){continue;}
            readers.insert(row,crate::system_owner::reader(bodies,row,specs)?);
            let factor=bodies[row].ship.as_ref().and_then(|s|s.world.as_ref()).and_then(|w|w.carrier).and_then(|h|bodies.iter().find(|b|b.handle==h))
                .and_then(|b|b.ship.as_ref()).filter(|s|s.flags&ship_state::DEAD==0&&s.armor.as_ref().is_some_and(|a|a.data[14]>0.0)).map_or(1.0,|s|s.live.get(crate::ship_effects::FIGHTER_DAMAGE));
            support.insert(row,factor);
        }
        for &(handle,component) in queued{let row=bodies.iter().position(|b|b.handle==handle).ok_or(4u32)?;
            if target_handles.is_none()&&bodies[row].ship.as_ref().and_then(|s|s.weapons.as_ref()).is_some_and(|w|w.mounts.iter().any(|m|m.data[2]!=1.0&&component.is_none_or(|id|m.data[0]==id as f64))){
                target_handles=Some(bodies.iter().map(|b|(b.id,b.handle)).collect());
            }
            let body=&mut bodies[row];
            let Some(ship)=body.ship.as_mut().filter(|s|s.can_advance())else{continue;};
            let permits=[crate::system_owner::can_fire(ship,false),crate::system_owner::can_fire(ship,true)];
            let support=*support.get(&row).ok_or(8u32)?;
            let eligible=crate::system_owner::compensation_eligible(ship);let attitude=ship.systems.iter().any(|x|x.active&&ship.world.as_ref().is_some_and(|w|w.metas.get(&x.id).is_some_and(|m|m.kind==crate::ship_effects::Kind::RocAttitude)));
            let Some(combat)=ship.combat.as_mut()else{continue;};if combat.fire.is_empty(){continue;}
            let w=ship.weapons.as_mut().ok_or(8u32)?;if combat.fire.len()!=w.mounts.len(){return Err(8);}
            for index in 0..w.mounts.len(){
                if component.is_some_and(|id|w.mounts[index].data[0]!=id as f64){continue;}
                if ship.world.as_ref().is_some_and(|owner|owner.gravity_mounts.contains(&(w.mounts[index].data[0]as u32))){continue;}
                let entry=&mut combat.fire[index];let kind=w.mounts[index].data[1] as usize;
                let live=&ship.live;let cost=if kind==0{1.0}else{live.weapon_value(kind-1,crate::ship_effects::COST)};
                let damage=if kind==0{1.0}else{live.weapon_value(kind-1,crate::ship_effects::DAMAGE)};
                let (range,speed)=weapon_geometry(entry,kind,live,combat.attrs[18]);
                let mut ctx=FireContext{position:[body.motion[motion::X],body.motion[motion::Y]],velocity:[body.motion[motion::VX],body.motion[motion::VY]],facing:body.motion[motion::FACING],
                    can_ship_fire:w.data[20]==1.0,ai_control:combat.attrs[19]==1.0,flux_cost_multiplier:combat.attrs[12]*cost,recoil_multiplier:combat.attrs[13]*live.get(crate::ship_effects::RECOIL),cr_damage_multiplier:combat.attrs[11],
                    weapon_damage_multiplier:(if kind==0{1.0}else{combat.attrs[13+kind]})*(damage*support),beam_damage_multiplier:combat.attrs[17]*live.get(crate::ship_effects::BEAM_DAMAGE),effective_range:range,projectile_speed:speed,ecm_range_penalty:combat.attrs[18]};
                let mut input=entry.input;input.disabled=ship.components[index].data[7]==1.0;input.step_dt=ship.clock[5];input.system_allows&=permits[entry.spec.point_defense as usize];
                let mut recoil=FireHooks{reader:readers.get(&row).ok_or(8u32)?,kind,damage:if kind==0{1.0}else{combat.attrs[13+kind]},beam:combat.attrs[17],support,
                    compensation:ship.world.as_mut().and_then(|x|x.compensation.as_mut()),railgun:entry.railgun,eligible,attitude};
                self.emissions.clear();let result=weapon_fire::commit_mount_with_recoil(&mut w.mounts[index],&mut entry.state,&entry.spec,&mut ship.flux,random,&mut ctx,input,&mut self.emissions,&mut recoil);
                if result.started{entry.cycle_target=entry.input_target;entry.cycle_projectile_numeric=input.target_projectile.and_then(|id|self.projectiles.iter().find(|p|p.serial==id as f64).map(|p|p.id));if let Some((v,_))=fx.as_mut(){v.fire_started(body.handle,w.mounts[index].data[0]as u32,combat.player.unwrap_or(false))?;}}
                if result.flux_budget_rejected{if let Some(q)=&mut entry.query{q.decision=crate::fire_control::Decision::FluxBudget;}}
                if result.started{if let Some(group)=entry.query.as_ref().and_then(|q|q.start_group){
                    let g=w.groups.get_mut(group).ok_or(8u32)?;let component=w.mounts[index].data[0] as u32;
                    let active=g.members.iter().position(|&m|m==component).ok_or(8u32)?;
                    g.data[3]=active as f64;g.data[4]=1.0;g.data[5]=0.0;g.data[6]=1.0;g.data[7]=1.0;g.data[8]=1.0;g.data[9]=1.0;
                }}
                body.motion[motion::VX]=ctx.velocity[0];body.motion[motion::VY]=ctx.velocity[1];
                for e in self.emissions.drain(..){let mut event=BEAM_SPAWNED;let serial;
                    if let Some((v,r))=fx.as_mut(){v.shot(body.handle,e.component_id,&e,combat.player.unwrap_or(false),r)?;}
                    if e.kind==EmissionKind::Projectile{
                        self.serial+=1.0;if self.serial>u32::MAX as f64{return Err(5);}serial=self.serial;event=SHOT_SPAWNED;
                        let mut p=Projectile::new(self.serial,body.id,body.handle,combat.team,entry.delivery.clone().ok_or(8u32)?,&e,speed,combat.attrs[3..11].try_into().unwrap(),ship.flux.percent());
                        p.player=combat.player;p.target_handle=entry.cycle_target;
                        p.target_numeric=p.target_projectile.and(entry.cycle_projectile_numeric);
                        // Identities do not change within this ordered firing call.
                        let handles=target_handles.as_ref().ok_or(8u32)?;
                        crate::missile_owner::initialize(&mut p,e.source_damage_multiplier,handles);self.projectiles.push(p);
                    }else{let existing=self.beams.iter().position(|b|b.source==body.id&&b.component==e.component_id);let mut beam;
                        if let Some(index)=existing{let previous=&self.beams[index];serial=previous.serial;let new_cycle=previous.cycle!=e.cycle_id;
                            event=if new_cycle||!previous.damage_active{BEAM_SPAWNED}else{BEAM_REFRESHED};
                            beam=if new_cycle{let mut next=Beam::new(serial,body.id,body.handle,combat.team,&e);next.id=previous.id;next.scale_glow=Some(true);next.active_born=previous.active_born;next.advanced=previous.advanced;next.hitting=previous.hitting;next.brightness=previous.brightness;next.reset_cycle=true;next.visual.glow_written=true;next.visual.pulse_written=true;next}else{previous.clone()};beam.refreshed=true;beam.sampled=false;
                        }else{self.serial+=1.0;if self.serial>u32::MAX as f64{return Err(5);}serial=self.serial;beam=Beam::new(serial,body.id,body.handle,combat.team,&e);}
                        beam.damage=e.damage;beam.emp=e.emp;beam.duration=e.duration;beam.max_duration=e.duration;beam.barrel=e.barrel_offset;beam.barrel_value=matches!(e.kind,EmissionKind::BeamActive);beam.cycle=e.cycle_id;beam.damage_active=true;
                        beam.effect=entry.delivery.as_ref().and_then(|d|d.effect);beam.style=entry.beam_style;beam.base_emp=entry.spec.emp_per_second;beam.base_damage=entry.spec.damage_per_second;
                        beam.player=combat.player.unwrap_or(false);beam.player_known=combat.player.is_some();beam.hit_radius=entry.beam_hit_radius;beam.hit_brighten=entry.beam_hit_brighten;
                        if let Some(index)=existing{self.beams[index]=beam;}else{self.beams.push(beam);}}
                    events.push((body.id,body.handle,Notice{system:e.component_id,kind:event,value:serial,detail:[e.id,e.cycle_id]}));
                }
            }
        }Ok(())
    }
    pub fn advance_projectiles(&mut self,bodies:&mut [Body],specs:&std::collections::BTreeMap<u32,crate::lifecycle::Spec>,mut world:Option<&mut crate::world_owner::Owned>,dt:f64,random:&mut Random,visual:&mut Random,events:&mut Vec<(u32,Handle,Notice)>)->Result<(),u32>{
        let ship_index=world.as_deref().map(|w|crate::weapon_world::ShipIndex::capture(bodies,w,specs)).transpose()?;let mut batch=crate::weapon_world::ProjectileBatch::default();
        let mut cursor=self.projectiles.len();while cursor>0{cursor=cursor.min(self.projectiles.len());if cursor==0{break;}cursor-=1;let index=cursor;
            // Capture the actual shot before an unsupported pre-begin flush can
            // shrink the resident array; source keeps this object reference.
            let mut p=self.projectiles[index].clone();
            if !crate::weapon_world::can_batch(&p){if let(Some(owned),Some(ship_index))=(world.as_deref_mut(),ship_index.as_ref()){
                let mut host=crate::world_owner::Host{bodies,specs,ordnance:self,owned,events};batch.flush(&mut host,ship_index,random,visual)?;
            }}
            // Flush callbacks may mutate this already captured source object.
            // Read the real retained shot before beginning its own lifecycle.
            if let Some(current)=self.projectiles.iter().find(|q|q.serial==p.serial).or_else(||world.as_deref().and_then(|w|w.retired_projectiles.iter().find(|q|q.serial==p.serial))){p=current.clone();}
            if p.delivery.is_mine{continue;}
            let source=bodies.iter().find(|b|b.id==p.source&&b.handle==p.source_handle);
            let dud=source.and_then(|b|b.ship.as_ref()).and_then(|s|Some((s.combat.as_ref()?,s.weapons.as_ref()?))).and_then(|(c,w)|w.mounts.iter().position(|m|m.data[0]==p.component as f64).and_then(|i|c.fire.get(i))).map_or(0.0,|e|e.spec.dud_probability);
            let was_fizzling=p.fizzle.is_some();let mut retire=p.begin(dt,random,dud);let mut detached=false;crate::weapon_world::store(self,&p);
            if !was_fizzling&&p.fizzle.is_some(){if let Some(owned)=world.as_deref_mut(){owned.emit(crate::world_owner::Output::Explosion(crate::explosion_effects::Output::DetachContrail{target:crate::explosion_effects::Identity{id:p.serial,generation:1}}));}detached=true;}
            let mut children=Vec::new();
            if !retire&&p.guidance.is_some(){
                let rows=world.as_deref().map_or_else(||Ok((0..bodies.len()).collect()),|w|w.rows(bodies))?;
                let guidance_world=crate::missile_owner::Targets{bodies,rows:&rows,projectiles:&self.projectiles};
                let mut state=crate::missile_owner::observe(&p);let spec=p.delivery.guidance.as_ref();let mut locks=Vec::new();
                if state.flare{retire=crate::missile_guidance::advance_flare(&mut state,&mut p.flare_state,dt,spec.and_then(|g|g.flare.as_ref()),&guidance_world,random,&mut locks);}
                if !retire{if p.delivery.angular!=0.0{state.facing=Some(state.facing.unwrap_or(0.0)+p.delivery.angular*dt);}
                    if spec.is_some_and(|s|s.rocket&&!s.inertial)&&!state.flare&&p.fizzle.is_none()&&!p.disarmed{
                        retire=crate::missile_guidance::advance_missile(&mut state,dt,&guidance_world,spec.and_then(|s|s.mirv.as_ref()),random,&mut children);
                    }
                }
                crate::missile_owner::sync(&mut p,state,bodies,&self.projectiles);crate::weapon_world::store(self,&p);
                for lock in locks{let numeric=self.projectiles.iter().find(|p|crate::missile_owner::projectile_identity(p)==lock.decoy).map(|p|p.id).ok_or(4u32)?;
                    if let Some(target)=self.projectiles.iter_mut().find(|p|crate::missile_owner::projectile_identity(p)==lock.missile){
                    target.target_projectile=Some(lock.decoy.handle);target.target_numeric=Some(numeric);if let Some(g)=&mut target.guidance{g.target_projectile=Some(lock.decoy);}}}
            }else if !retire&&p.delivery.angular!=0.0{p.angle+=p.delivery.angular*dt;}
            if !children.is_empty(){let parent=p.clone();let delivery=parent.delivery.guidance.as_ref().and_then(|s|s.child.as_ref()).ok_or(8u32)?;
                for child in children{self.serial+=1.0;if self.serial>u32::MAX as f64{return Err(5);}let p=crate::missile_owner::child(&parent,self.serial,child,(**delivery).clone());
                    events.push((p.source,p.source_handle,Notice{system:p.component,kind:SHOT_SPAWNED,value:p.serial,detail:[p.id,p.cycle]}));self.projectiles.push(p);}
                if let Some(owned)=world.as_deref_mut(){owned.visual.mirv_split(&parent,visual)?;}
            }
            if !retire{retire=p.advance_motion(dt);}
            let mut system_fired=false;
            if !retire{if let Some(fuse)=p.delivery.system_fuse{p.fade=p.delivery.system_fade_in.filter(|f|*f!=0.0).map_or(0.0,|f|(1.0-p.elapsed/f).max(0.0));
                if p.elapsed+1e-9>=fuse{p.system_fuse_triggered=true;crate::weapon_world::store(self,&p);
                    let owned=world.as_deref_mut().ok_or(8u32)?;
                    if let Some(spec)=&p.delivery.visual.missile{if let Some(e)=crate::weapon_world::missile_explosion(spec,p.pos,visual){crate::weapon_world::emit(owned,crate::weapon_world::Output::MissileExplosion(e));}}
                    if let Some(key)=&p.delivery.system_explosion_sound{crate::weapon_world::sound(owned,key,p.pos,1.0);}
                    let exclude=bodies.iter().find(|b|b.id==p.source&&b.handle==p.source_handle).map(crate::world_owner::identity);
                    let mut host=crate::world_owner::Host{bodies,specs,ordnance:self,owned,events};crate::weapon_world::spawn(&mut host,&p,p.pos,exclude,None,random,visual)?;retire=true;system_fired=true;
                }
            }}
            if !retire&&!p.collision_disabled&&!p.disarmed&&!p.guidance.as_ref().is_some_and(|s|s.flare_fizzling)&&!p.did_damage{if let Some(owned)=world.as_deref_mut(){owned.visual.missile_trail(&p)?;}}
            if !retire&&!p.collision_disabled&&!p.disarmed&&!p.guidance.as_ref().is_some_and(|s|s.flare_fizzling)&&p.delivery.fizzle_at_range&&p.range<=0.0{
                if let Some(owned)=world.as_deref_mut(){owned.emit(crate::world_owner::Output::Explosion(crate::explosion_effects::Output::DetachContrail{target:crate::explosion_effects::Identity{id:p.serial,generation:1}}));}detached=true;retire=true;
            }
            let mut buffered=false;
            if !retire&&!p.did_damage&&!p.collision_disabled&&!p.disarmed&&!p.guidance.as_ref().is_some_and(|s|s.flare_fizzling){
                if let Some(owned)=world.as_deref_mut(){let mut host=crate::world_owner::Host{bodies,specs,ordnance:self,owned,events};
                    let ship_index=ship_index.as_ref().ok_or(8u32)?;let mut consumed=crate::weapon_world::projectile_precontacts(&mut host,&mut p,random,visual)?;
                    if !consumed{consumed=crate::weapon_world::projectile_terrain_contacts(&mut host,&mut p,Some(ship_index),random,visual,&mut |host,r,v|batch.flush(host,ship_index,r,v))?;}
                    if !consumed{if crate::weapon_world::can_batch(&p){crate::weapon_world::store(host.ordnance,&p);
                        let expired=!p.delivery.source()&&!p.guidance.as_ref().is_some_and(|s|s.flare)&&p.range<=0.0&&p.flight.is_none();batch.push(&p,expired);buffered=true;
                    }else{consumed=crate::weapon_world::projectile_ship_contacts_indexed(&mut host,&mut p,ship_index,random,visual)?;}}
                    if consumed{detached=crate::weapon_world::rocket(&p);retire=!p.impact(p.pos);}
                }else{
                if p.delivery.fuse.is_some()||p.delivery.explosion.is_some()||p.delivery.intercepts||p.delivery.pass_missiles||p.delivery.pass_fighters||p.delivery.terrain_penetration.is_some(){return Err(8);}
                let end=p.pos;
                for _ in 0..bodies.len(){
                    let mut best=None;
                    for (row,body) in bodies.iter().enumerate(){
                        let Some(s)=body.ship.as_ref().filter(|s|s.can_advance())else{continue;};let Some(c)=s.combat.as_ref()else{continue;};
                        if body.id==p.source||c.team==p.team||c.collisionless(body){continue;}
                        if let Some(hit)=contact::projectile(p.prev,p.pos,&body.motion,c.radius,&c.bounds,s.shield.as_ref()){
                            if best.is_none_or(|(_,h):(_,contact::Hit)|hit.t<h.t){best=Some((row,hit));}
                        }
                    }
                    let Some((row,hit))=best else{break;};
                    let source=bodies.iter().find(|b|b.id==p.source&&b.handle==p.source_handle).and_then(|b|b.ship.as_ref());
                    let outgoing=source.and_then(|s|s.combat.as_ref()).map_or(p.outgoing,|c|c.outgoing());let source_flux=source.map_or(p.source_flux,|s|s.flux.percent());
                    let component_source=source.map_or([1.0;2],|s|[s.damage_policy[3],s.damage_policy[4]]);
                    let target=&mut bodies[row];let ship=target.ship.as_mut().unwrap();let c=ship.combat.as_ref().unwrap();
                    let impact=p.damage*outgoing_multiplier(outgoing,c.size,p.delivery.weapon_type,Some(p.origin),hit.point,source_flux);
                    p.pos=hit.point;let mut local=Vec::new();
                    if hit.surface==Surface::Shield{
                        let center=contact::shield_center(ship.shield.as_ref().unwrap(),&target.motion);
                        let damage=impact*c.attrs[2]*ship.live.get(crate::ship_effects::SHIELD_DAMAGE)*c.attrs[1]*c.graviton_multiplier;let (flux,absorbed,remaining)=ship.shield.as_mut().unwrap().impact(damage,p.delivery.damage_type,(hit.point[1]-center[1]).atan2(hit.point[0]-center[0]));
                        ship.flux_operation(0,flux,!p.soft,&mut local);ship.sync_shield();
                        local.push(Notice{system:0,kind:ship_state::IMPACT_ABSORBED,value:absorbed,detail:[p.serial,remaining]});
                        events.push((target.id,target.handle,Notice{system:p.component,kind:SHOT_CONTACT,value:p.serial,detail:[p.source as f64,1.0]}));
                        events.extend(local.into_iter().map(|n|(target.id,target.handle,n)));
                        if remaining>0.0{p.damage*=remaining;p.base_damage*=remaining;p.emp*=remaining;p.pos=end;continue;}
                    }else{
                        let taken=impact*c.attrs[1];let armor_row=[hit.local[0],hit.local[1],taken,p.delivery.damage_type as f64,1.0,impact,0.0,0.0];
                        let result=ship.armor_impact(&armor_row,visual,&mut local)?;
                        if let Some(world)=world.as_deref_mut(){let id=crate::world_owner::identity(target);let mut host=crate::world_owner::Host{bodies,specs,ordnance:self,owned:world,events};
                            host.armor_particles(id,hit.local,result[0],visual)?;
                            if result[0]>0.0{host.owned.stats.damage(p.player.unwrap_or(false),p.delivery.damage_type,result[0],crate::world_damage::Layer::Armor,p.emp,None);}
                            if result[1]>0.0{host.owned.stats.damage(p.player.unwrap_or(false),p.delivery.damage_type,result[1],crate::world_damage::Layer::Hull,0.0,None);}}
                        let target=&mut bodies[row];let ship=target.ship.as_mut().unwrap();ship.apply_hull(result[1],&mut local)?;
                        ship.propagate(hit.local,[result[0],result[1]],p.emp,component_source,random,&mut local)?;
                        events.push((target.id,target.handle,Notice{system:p.component,kind:SHOT_CONTACT,value:p.serial,detail:[p.source as f64,0.0]}));
                        events.extend(local.into_iter().map(|n|(target.id,target.handle,n)));
                    }
                    self.projectiles[index]=p.clone();
                    if let Some(effect)=p.delivery.effect{if let Some(world)=world.as_deref_mut(){let mut host=crate::world_owner::Host{bodies,specs,ordnance:self,owned:world,events};
                        crate::effect_owner::hit_world(&mut host,row,&p,effect,hit.point,hit.surface==Surface::Shield,component_source,random,visual)?;
                    }else{crate::effect_owner::hit(bodies,row,&p,effect,hit.point,hit.surface==Surface::Shield,component_source,random,visual,&mut self.effect_records)?;}}
                    if let Some(world)=world.as_deref_mut(){if hit.surface==Surface::Hull&&bodies[row].ship.as_ref().and_then(|s|s.armor.as_ref()).is_some_and(|a|a.data[14]<=0.0){
                        let mut host=crate::world_owner::Host{bodies,specs,ordnance:self,owned:world,events};host.destroy(row,random,visual)?;host.finish()?;}}
                    retire=!p.impact(hit.point);break;
                }
                }
                if !buffered&&!p.did_damage&&!p.delivery.source()&&!p.guidance.as_ref().is_some_and(|s|s.flare)&&p.range<=0.0&&p.flight.is_none(){retire=true;}
            }
            if !p.valid(){return Err(7);}if let Some(index)=self.projectiles.iter().position(|q|q.serial==p.serial){cursor=index;
                if retire{self.projectiles.remove(index);if let Some(owned)=world.as_deref_mut(){if crate::weapon_world::rocket(&p)&&!detached&&!system_fired{owned.emit(crate::world_owner::Output::Explosion(crate::explosion_effects::Output::DetachContrail{target:crate::explosion_effects::Identity{id:p.serial,generation:1}}));}owned.retired_projectiles.push(p.clone());}events.push((p.source,p.source_handle,Notice{system:p.component,kind:SHOT_RETIRED,value:p.serial,detail:[p.id,0.0]}));}
                else{self.projectiles[index]=p;}}
        }
        if let(Some(owned),Some(ship_index))=(world.as_deref_mut(),ship_index.as_ref()){let mut host=crate::world_owner::Host{bodies,specs,ordnance:self,owned,events};batch.flush(&mut host,ship_index,random,visual)?;}
        Ok(())
    }
    pub fn advance_beams(&mut self,bodies:&mut [Body],specs:&std::collections::BTreeMap<u32,crate::lifecycle::Spec>,mut world:Option<&mut crate::world_owner::Owned>,dt:f64,random:&mut Random,visual:&mut Random,events:&mut Vec<(u32,Handle,Notice)>)->Result<(),u32>{
        for index in (0..self.beams.len()).rev(){let mut beam=self.beams[index].clone();
            // Each beam reads live modifiers after the preceding beam's damage.
            // Source pressure systems depend on flux changed within this loop.
            if let Some(r)=bodies.iter().position(|b|b.id==beam.source&&b.handle==beam.source_handle){
                let carrier=bodies[r].ship.as_ref().and_then(|s|s.world.as_ref()).and_then(|w|w.carrier);
                if let Some(h)=carrier{let cr=bodies.iter().position(|b|b.handle==h).ok_or(4u32)?;
                    let mods=crate::system_owner::modifiers(bodies,cr,specs)?;bodies[cr].ship.as_mut().ok_or(8u32)?.live=mods;}
                let mods=crate::system_owner::modifiers(bodies,r,specs)?;bodies[r].ship.as_mut().ok_or(8u32)?.live=mods;
            }
            let source=bodies.iter().find(|b|b.id==beam.source&&b.handle==beam.source_handle);
            let support=source.and_then(|b|b.ship.as_ref()).and_then(|s|s.world.as_ref()).and_then(|w|w.carrier).and_then(|h|bodies.iter().find(|b|b.handle==h)).and_then(|b|b.ship.as_ref())
                .filter(|s|s.flags&ship_state::DEAD==0&&s.armor.as_ref().is_some_and(|a|a.data[14]>0.0)).map_or(1.0,|s|s.live.get(crate::ship_effects::FIGHTER_DAMAGE));
            let source_data=source.and_then(|b|{
                let s=b.ship.as_ref()?;if !s.can_advance()||s.flux.overloaded||s.flux.venting{return None;}
                let c=s.combat.as_ref()?;let w=s.weapons.as_ref()?;let row=w.mounts.iter().position(|m|m.data[0]==beam.component as f64)?;
                let m=&w.mounts[row].data;if s.components[row].data[7]==1.0||m[23]==0.0||m[26]!=beam.cycle{return None;}
                let e=&c.fire[row];let d=e.delivery.as_ref()?;let length=contact::length([beam.end[0]-beam.start[0],beam.end[1]-beam.start[1]]);
                let mount=browser_rotate(e.spec.relative_pos,b.motion[motion::FACING]);let barrel=browser_rotate(if beam.barrel_value{beam.barrel}else{e.spec.offsets.first().copied().unwrap_or([0.0;2])},m[15]);
                let start=[b.motion[motion::X]+mount[0]+barrel[0],b.motion[motion::Y]+mount[1]+barrel[1]];
                let dt=dt*s.subjective_multiplier();let(range,_)=weapon_geometry(e,m[1]as usize,&s.live,c.attrs[18]);let front=range.min(length+dt*d.beam_speed);let dir=[crate::canonical_math::cos(m[15]),crate::canonical_math::sin(m[15])];
                let end=[start[0]+dir[0]*front,start[1]+dir[1]*front];let previous=[start[0]+dir[0]*length,start[1]+dir[1]*length];
                let brightness=match m[23] as u32{2=>1.0,1=>(1.0-m[24]/e.spec.beam_chargeup.max(0.001)).clamp(0.0,1.0),3=>(m[24]/e.spec.beam_chargedown.max(0.001)).clamp(0.0,1.0),_=>0.0};
                let kind=m[1] as usize;let damage=e.spec.damage_per_second*c.attrs[11]*((if kind==0{1.0}else{c.attrs[13+kind]})*(if kind==0{1.0}else{s.live.weapon_value(kind-1,crate::ship_effects::DAMAGE)})*support)*c.attrs[17]*s.live.get(crate::ship_effects::BEAM_DAMAGE);
                Some((start,end,previous,dt,brightness,if m[24].is_finite(){m[24].max(0.0)}else{9_007_199_254_740_991.0},damage,e.spec.emp_per_second*c.attrs[11],
                    m[23]==3.0,m[3]==1.0,e.spec.beam_chargedown,d.damage_type,d.weapon_type,d.beam_hard,c.outgoing(),s.flux.percent(),[s.damage_policy[3],s.damage_policy[4]],m[23]==2.0))
            });
            let Some((start,end,previous,dt,brightness,duration,damage,emp,down,burst,down_time,kind,weapon_type,hard,outgoing,flux,component_source,active))=source_data else{
                let b=self.beams.remove(index);events.push((b.source,b.source_handle,Notice{system:b.component,kind:BEAM_RETIRED,value:b.serial,detail:[b.id,0.0]}));continue;};
            if let Some(w)=bodies.iter_mut().find(|b|b.id==beam.source&&b.handle==beam.source_handle)
                .and_then(|b|b.ship.as_mut()).and_then(|s|s.weapons.as_mut()){
                if let Some(m)=w.mounts.iter_mut().find(|m|m.data[0]==beam.component as f64){m.data[29]=brightness;}
            }
            beam.elapsed+=dt;beam.duration=duration;beam.start=start;beam.end=end;beam.previous_end=previous;beam.brightness=brightness;beam.damage=damage;beam.emp=emp;beam.hitting=false;beam.advanced=true;beam.ray_value=true;beam.sampled=true;
            beam.visual.advance(dt,active,beam.hit_brighten);
            let sample=beam.clock.advance(dt,beam.damage_active,brightness,damage,emp,down,burst,down_time,random);let mut remainder=1.0;let mut effect_target=None;
            if let Some(owned)=world.as_deref_mut(){let mut host=crate::world_owner::Host{bodies,specs,ordnance:self,owned,events};crate::weapon_world::beam_contacts(&mut host,&mut beam,sample,kind,weapon_type,hard,outgoing,flux,component_source,active,dt,random,visual)?;
                self.beams[index]=beam;continue;}
            for _ in 0..bodies.len(){let mut best=None;
                for (row,b) in bodies.iter().enumerate(){let Some(s)=b.ship.as_ref().filter(|s|s.can_advance())else{continue;};let Some(c)=s.combat.as_ref()else{continue;};
                    if b.id==beam.source||c.team==beam.team||c.collisionless(b){continue;}
                    if let Some(t)=contact::beam_distance(beam.start,beam.end,&b.motion,c.radius,&c.bounds,s.shield.as_ref()){if best.is_none_or(|(_,prior):(_,f64)|t<prior){best=Some((row,t));}}
                }
                let Some((row,_))=best else{break;};let target=&bodies[row];let s=target.ship.as_ref().unwrap();let c=s.combat.as_ref().unwrap();
                let Some(hit)=contact::beam(beam.start,beam.end,&target.motion,c.radius,&c.bounds,s.shield.as_ref())else{break;};beam.end=hit.point;beam.hitting=beam.damage_active;effect_target=Some(row);
                let Some(sample)=sample.filter(|v|v.damage>0.0)else{break;};let target=&mut bodies[row];let s=target.ship.as_mut().unwrap();let c=s.combat.as_ref().unwrap();
                let mult=outgoing_multiplier(outgoing,c.size,weapon_type,Some(beam.start),beam.end,flux);let mut notices=Vec::new();
                if hit.surface==Surface::Shield{
                    let taken=sample.damage*mult*remainder*c.attrs[2]*s.live.get(crate::ship_effects::SHIELD_DAMAGE)*c.attrs[1]*c.graviton_multiplier;let center=contact::shield_center(s.shield.as_ref().unwrap(),&target.motion);
                    let (flux,absorbed,left)=s.shield.as_mut().unwrap().impact(taken,kind,(hit.point[1]-center[1]).atan2(hit.point[0]-center[0]));
                    s.flux_operation(0,flux,hard,&mut notices);s.sync_shield();notices.push(Notice{system:0,kind:ship_state::IMPACT_ABSORBED,value:absorbed,detail:[beam.serial,left]});
                    events.extend(notices.into_iter().map(|n|(target.id,target.handle,n)));if left>0.0{remainder*=left;beam.end=end;continue;}
                }else{
                    let taken=sample.damage*mult*remainder*c.attrs[1];let strength=sample.effective_dps*mult*c.attrs[1]*remainder;
                    let r=s.armor_impact(&[hit.local[0],hit.local[1],taken,kind as f64,1.0,strength,1.0,0.0],visual,&mut notices)?;
                    if let Some(world)=world.as_deref_mut(){let id=crate::world_owner::identity(target);let mut host=crate::world_owner::Host{bodies,specs,ordnance:self,owned:world,events};
                        host.armor_particles(id,hit.local,r[0],visual)?;let tick_emp=sample.emp*remainder;
                        if r[0]>0.0{host.owned.stats.damage(beam.player,kind,r[0],crate::world_damage::Layer::Armor,tick_emp,None);}
                        if r[1]>0.0{host.owned.stats.damage(beam.player,kind,r[1],crate::world_damage::Layer::Hull,if r[0]>0.0{0.0}else{tick_emp},None);}}
                    let target=&mut bodies[row];let s=target.ship.as_mut().unwrap();s.apply_hull(r[1],&mut notices)?;
                    s.propagate(hit.local,[r[0],r[1]],sample.emp*remainder,component_source,random,&mut notices)?;
                    events.extend(notices.into_iter().map(|n|(target.id,target.handle,n)));
                }
                if let Some(world)=world.as_deref_mut(){if bodies[row].ship.as_ref().and_then(|s|s.armor.as_ref()).is_some_and(|a|a.data[14]<=0.0){let mut host=crate::world_owner::Host{bodies,specs,ordnance:self,owned:world,events};host.destroy(row,random,visual)?;host.finish()?;}}break;
            }
            if let Some(world)=world.as_deref_mut(){let mut host=crate::world_owner::Host{bodies,specs,ordnance:self,owned:world,events};crate::effect_owner::beam_world(&mut host,effect_target,&mut beam,component_source,random,visual)?;}
            else{crate::effect_owner::beam(bodies,effect_target,&mut beam,component_source,random,visual,&mut self.effect_records)?;}
            self.beams[index]=beam;
        }Ok(())
    }
}
fn browser_rotate(p:Point,angle:f64)->Point{let c=crate::canonical_math::cos(angle);let s=crate::canonical_math::sin(angle);[p[0]*c-p[1]*s,p[0]*s+p[1]*c]}
pub fn outgoing_multiplier(a:[f64;8],size:u32,weapon_type:u32,from:Option<Point>,point:Point,flux:f64)->f64{
    let analysis=a[1];let bonus=match size{0=>(if a[0]>0.0{50.0}else{0.0})+a[3],1=>a[5]+if analysis==2.0{5.0}else{0.0},
        2=>a[6]+if analysis==2.0{10.0}else{0.0},3=>a[7]+if analysis>0.0{15.0}else{0.0},4=>if analysis>0.0{20.0}else{0.0},_=>0.0};
    let mut mult=(1.0+bonus/100.0)*if size==0{a[4]}else{1.0};
    if a[2]>0.0&&weapon_type==2{if let Some(from)=from{let factor=((1000.0-contact::length([from[0]-point[0],from[1]-point[1]]))/400.0).clamp(0.0,1.0);mult*=1.0+0.3*flux.clamp(0.0,1.0)*factor;}}mult
}
