//! FIRE_QUERY observes the resident world once at the real post-motion barrier.
//! Cross-step target identities, tracker RNG and group clocks stay in CombatShip.
use crate::{battle::Ordnance,contact,fire_control as f,ship_state,state::{Body,Handle},weapon};
use std::collections::BTreeMap;
use std::f64::consts::PI;

pub const WIDTH:usize=30;
#[derive(Clone)]
pub struct MountQuery {
    pub flags:u32,pub hints:u32,pub base:f64,pub arc:f64,pub turn:f64,pub size_scale:f64,pub accuracy:f64,
    pub pass_fighters:bool,pub proximity:Option<f64>,pub salt:u32,pub idle:f64,pub memory:Option<f::Memory>,
    pub policy:Option<f::Policy>,pub cadence:Option<f::CadenceMode>,pub system_allows:bool,pub sample_hz20:bool,pub sample_native:bool,
    pub decision:f::Decision,pub start_group:Option<usize>,
    /// Authored force mount certificate, installed with the resident gravity owner.
    pub force_kind:u8,pub heldcontact:Option<[f64;2]>,
}
impl MountQuery {
    pub fn new(row:&[f64])->Self{Self{flags:row[1]as u32,hints:row[2]as u32,base:row[3],arc:row[4],turn:row[5],size_scale:row[6],accuracy:row[7],
        pass_fighters:row[8]==1.0,proximity:if row[9]==1.0{Some(row[10])}else{None},salt:row[11]as u32,idle:row[12],memory:None,policy:None,cadence:None,
        system_allows:true,sample_hz20:row.get(13)==Some(&1.0),sample_native:row.get(14)==Some(&1.0),decision:f::Decision::NoTarget,start_group:None,force_kind:0,heldcontact:None}}
    pub fn words(&self,component:u32)->[f64;WIDTH]{
        let m=self.memory.as_ref();let c=m.and_then(|m|m.cadence);
        [component as f64,self.memory.is_some()as u32 as f64,m.map_or(0,|m|m.target.kind)as f64,
            m.map_or(0,|m|m.target.identity.handle)as f64,m.map_or(0,|m|m.target.identity.generation)as f64,
            m.map_or(0.0,|m|m.scan_in),m.map_or(0.0,|m|m.firing_time),m.map_or(0.0,|m|m.idle_fire_time),m.is_none_or(|m|m.ammo_allowed)as u32 as f64,
            m.map_or(self.salt,|m|m.random.seed)as f64,m.map_or(self.salt as f64,|m|m.random.cursor),m.map_or(0.0,|m|m.random.ids),
            self.idle,self.decision as u32 as f64,c.is_some()as u32 as f64,c.map_or(0.0,|c|if c.mode==f::CadenceMode::Multirate{2.0}else{1.0}),
            c.map_or(0.0,|c|c.aim_in),c.map_or(0.0,|c|c.scan_in),c.map_or(0.0,|c|c.x),c.map_or(0.0,|c|c.y),
            c.is_some_and(|c|c.point)as u32 as f64,c.is_some_and(|c|c.initialized)as u32 as f64,
            self.policy.is_some()as u32 as f64,self.policy.map_or(0.0,|p|if p.priority==f::Priority::Escort{1.0}else{2.0}),
            self.policy.is_some_and(|p|p.suspended)as u32 as f64,self.system_allows as u32 as f64,
            self.start_group.is_some()as u32 as f64,self.start_group.unwrap_or(0)as f64,self.salt as f64,0.0]
    }
}
#[derive(Clone)]
pub struct ShipQuery {
    pub expected_teams:usize,pub visible:BTreeMap<u32,bool>,pub expected_scope:usize,pub scope:Vec<Handle>,
    pub player:bool,pub vast:bool,pub no_fire_through:bool,pub native_threat:bool,pub pd_ignore:f64,pub accuracy:f64,
    pub finish:f64,pub pressure:f64,pub tie:u32,pub adaptive_budget:bool,
    pub aim:[f64;2],pub trigger:bool,pub selected:Option<usize>,pub target:Option<Handle>,pub hold:bool,
}
impl ShipQuery {
    pub fn new(row:&[f64])->Self{Self{expected_teams:row[0]as usize,visible:BTreeMap::new(),expected_scope:row[1]as usize,scope:Vec::new(),
        player:row[2]==1.0,vast:row[3]==1.0,no_fire_through:row[4]==1.0,native_threat:row[5]==1.0,pd_ignore:row[6],accuracy:row[7],
        finish:row[8],pressure:row[9],tie:row[10]as u32,adaptive_budget:row[11]==1.0,aim:[0.0;2],trigger:false,selected:None,target:None,hold:false}}
    pub fn complete(&self)->bool{self.visible.len()==self.expected_teams&&self.scope.len()==self.expected_scope}
}
fn identity(h:Handle)->f::Identity{f::Identity{handle:h.slot,generation:h.generation}}
fn groups(c:&weapon::Controller,offset:usize)->Vec<f::Group>{c.groups.iter().map(|g|f::Group{
    rows:g.members.iter().map(|id|c.mounts.iter().position(|m|m.data[0]==*id as f64).map(|i|offset+i)).collect(),
    linked:g.data[1]==0.0,automatic:g.data[2]==1.0,index:g.data[3]as i64,elapsed:g.data[5],was_firing:g.data[7]==1.0,switched:g.data[9]==1.0,
    elapsed_present:g.data[4]==1.0,was_firing_present:g.data[6]==1.0,switched_present:g.data[8]==1.0}).collect()}
fn write_groups(c:&mut weapon::Controller,values:&[f::Group]){for(g,v)in c.groups.iter_mut().zip(values){
    g.data[3]=v.index as f64;g.data[4]=v.elapsed_present as u32 as f64;g.data[5]=v.elapsed;g.data[6]=v.was_firing_present as u32 as f64;
    g.data[7]=v.was_firing as u32 as f64;g.data[8]=v.switched_present as u32 as f64;g.data[9]=v.switched as u32 as f64;
}}
fn clock_rate(w:&weapon::Controller,m:&weapon::Mount,live:&crate::ship_effects::Modifiers)->f64{
    let d=&m.data;let kind=d[1]as usize;let rate=if kind==0{1.0}else{(w.data[12+kind]*live.weapon_value(kind-1,crate::ship_effects::RATE)).max(0.001)};
    if d[2]==1.0{return if d[3]==1.0{rate}else{1.0};}if rate<=1.0{return rate;}
    let delay=if d[20]>0.0{d[6]}else{d[4]+d[5]};if delay/rate<0.05{(delay/0.05).max(1.0)}else{rate}
}
pub fn observe_ship(body:&Body,row:usize)->Result<f::Body,u32>{
    let s=body.ship.as_ref().ok_or(8u32)?;let c=s.combat.as_ref().ok_or(8u32)?;let q=c.query.as_ref().ok_or(8u32)?;
    let a=s.armor.as_ref().ok_or(8u32)?;let d=&a.data;let sh=s.shield.as_ref();let center=sh.map_or([body.motion[0],body.motion[1]],|sh|contact::shield_center(sh,&body.motion));
    let active=sh.is_some_and(|sh|sh.active());let phase=sh.is_some_and(|sh|sh.kind()==crate::shield::PHASE&&(sh.data[14]==1.0||sh.data[14]==2.0||sh.data[14]==3.0&&sh.data[15]>0.5));
    let mut flags=0u32;if s.flags&ship_state::DEAD!=0||d[14]<=0.0{flags|=f::body_flag::DEAD;}
    if c.collisionless(body){flags|=f::body_flag::COLLISIONLESS;}if c.size==0{flags|=f::body_flag::FIGHTER;}
    if phase{flags|=f::body_flag::PHASED;}if s.flux.overloaded{flags|=f::body_flag::OVERLOADED;}if s.flux.venting{flags|=f::body_flag::VENTING;}
    if q.hold{flags|=f::body_flag::HOLD_FIRE;}
    let mut armor=f::Armor{cols:d[0]as usize,rows:d[1]as usize,width:d[2],height:d[3],min_x:d[5],min_y:d[6],cells:a.cells.clone(),effective:d[8],dynamic_effective:d[9],
        residual:d[4]*0.05*d[11],reduction:d[10],native:true,..f::Armor::default()};
    // f uses KINETIC/HE/ENERGY/FRAG, while the resident damage ABI uses ENERGY/KINETIC/HE/FRAG.
    for (t,k)in [1usize,2,0,3].into_iter().enumerate(){armor.armor_mult[t]=d[21+2*k]*s.live.get(crate::ship_effects::ARMOR_DAMAGE);armor.hull_mult[t]=d[22+2*k]*s.live.get(crate::ship_effects::HULL_DAMAGE);}
    let radius=sh.map_or(0.0,|sh|sh.data[2]);let typ=sh.map_or(0,|sh|sh.kind())as u8;
    Ok(f::Body{identity:identity(body.handle),x:body.motion[0],y:body.motion[1],vx:body.motion[2],vy:body.motion[3],facing:body.motion[4],angular_velocity:body.motion[5],radius:c.radius,
        team:c.team as f64,flags,assembly_root:row,hull:c.bounds.clone(),shield_x:center[0],shield_y:center[1],shield_radius:radius,shield_arc:sh.map_or(0.0,|sh|sh.data[7]*PI/180.0),
        shield_facing:sh.map_or(0.0,|sh|sh.data[8]),shield_type:typ,shield_on:active,shield_void:sh.is_some_and(|sh|sh.void.is_some()),hp:d[14],max_hp:d[13],flux_percent:s.flux.percent(),
        overload_timer:s.flux.overload_timer,vent_time:if s.flux.dissipation()*2.0*s.flux.vent_mult>0.0{s.flux.total()/(s.flux.dissipation()*2.0*s.flux.vent_mult)}else{0.0},size:c.size as u8,
        target_radius:c.radius.max(if active&&typ!=0&&typ!=3{radius+contact::length([center[0]-body.motion[0],center[1]-body.motion[1]])}else{0.0}),
        vast:q.vast,no_fire_through:q.no_fire_through,pd_ignore_flares:q.pd_ignore,accuracy:q.accuracy,current_target:q.target.map(identity),autonomous:c.attrs[19]==1.0,
        aim_x:q.aim[0],aim_y:q.aim[1],main_trigger:q.trigger,finish:q.finish,pressure:q.pressure,native_threat:q.native_threat,armor,tie:q.tie})
}
pub fn observe_weapons(body:&Body,own:usize,out:&mut Vec<f::Weapon>)->Result<(),u32>{
    let s=body.ship.as_ref().ok_or(8u32)?;let c=s.combat.as_ref().ok_or(8u32)?;let Some(w)=s.weapons.as_ref()else{return Ok(());};
    for (i,m)in w.mounts.iter().enumerate(){let e=c.fire.get(i).ok_or(8u32)?;let q=e.query.as_ref().ok_or(8u32)?;let d=&m.data;let delivery=e.delivery.as_ref().ok_or(8u32)?;
        let beam=d[2]==1.0;let rate=clock_rate(w,m,&s.live);let(range,speed)=crate::battle::weapon_geometry(e,d[1]as usize,&s.live,c.attrs[18]);
        let mut cycle=if beam{e.spec.beam_duration+(if d[7]==1.0{d[8]}else{0.0})+e.spec.beam_chargeup+e.spec.beam_chargedown}
            else if e.spec.burst_size>50.0{3.0}else{(e.spec.burst_size-1.0).max(0.0)*d[6]+d[4]+d[5]};
        if beam{if !(cycle>0.0){cycle=3.0;}cycle-=(if d[7]==1.0{d[8]}else{0.0})*(1.0-1.0/rate);}else{cycle/=rate;}
        let barrel=if e.spec.offsets.is_empty(){[0.0;2]}else{e.spec.offsets[(d[30]%e.spec.offsets.len()as f64)as usize]};
        out.push(f::Weapon{owner:own,flags:q.flags|if beam{f::weapon_flag::BEAM}else{0},angle:d[15],base_angle:body.motion[4]+q.base*PI/180.0,arc_rad:q.arc*PI/180.0,arc_deg:q.arc,
            effective_range:range,speed,turn_rate:q.turn*PI/180.0,charge_delay:if d[23]==1.0{d[24].max(0.0)}else if beam{e.spec.beam_chargeup}else{d[5]},
            ammo:d[17],max_ammo:d[10],disabled:s.components[i].data[7]==1.0,cooldown:d[16],burst_remaining:d[20],firing_state:d[23]as u8,
            damage_type:[2u8,0,1,3][delivery.damage_type as usize],projectile_radius:delivery.radius,hints:q.hints,pass_fighters:q.pass_fighters,
            missile_body:e.spec.rocket||delivery.spawn_type==4,beam_burst:d[3]==1.0,proximity:q.proximity.unwrap_or(0.0),has_proximity:q.proximity.is_some(),weapon_missile:d[1]==3.0,
            regen:d[11],size_scale:q.size_scale,accuracy_bonus:q.accuracy,idle:q.idle,has_muzzle_offset:!e.spec.offsets.is_empty(),offset_x:barrel[0],offset_y:barrel[1],reload:d[27],cycle,
            base_range:e.range_inputs.as_ref().map_or(e.range,|r|r.authored_range),base_speed:e.range_inputs.as_ref().map_or(e.speed,|r|r.authored_speed),authored_base_angle:q.base,relative_x:e.spec.relative_pos[0],relative_y:e.spec.relative_pos[1]});
    }Ok(())
}
pub fn plan(bodies:&mut [Body],ordnance:&Ordnance,specs:&BTreeMap<u32,crate::lifecycle::Spec>)->Result<(),u32>{
    plan_world(bodies,ordnance,specs,None)
}
/// Production reader at the single post-motion/pre-emission world barrier.
/// Legacy standalone fixtures use plan(); a resident world always supplies its
/// actual phase authority, assembly roots and current terrain.
pub fn plan_world(bodies:&mut [Body],ordnance:&Ordnance,specs:&BTreeMap<u32,crate::lifecycle::Spec>,resident:Option<&crate::world_owner::Owned>)->Result<(),u32>{
    let active:Vec<_>=bodies.iter().map(|b|b.handle).collect();
    let missiles=ordnance.projectiles.iter().filter(|p|p.delivery.missile||p.delivery.is_mine||p.guidance.as_ref().is_some_and(|g|g.flare))
        .map(|p|f::Identity{handle:p.serial as u32,generation:1}).collect::<Vec<_>>();
    let queue=bodies.iter().map(|b|Queued{owner:b.handle,dt:b.ship.as_ref().map_or(0.0,|s|s.clock[5]),
        ships:b.ship.as_ref().and_then(|s|s.combat.as_ref()).and_then(|c|c.query.as_ref()).map_or_else(Vec::new,|q|q.scope.clone()),missiles:missiles.clone()}).collect::<Vec<_>>();
    plan_queued(bodies,ordnance,specs,resident,&queue,&active)
}
/// A source ShipStepBatch enqueue entry. Scope is captured before motion, while
/// all queries read one global post-motion observation and shared fire budget.
#[derive(Clone)]pub struct Queued{pub owner:Handle,pub dt:f64,pub ships:Vec<Handle>,pub missiles:Vec<f::Identity>}
pub fn plan_queued(bodies:&mut[Body],ordnance:&Ordnance,specs:&BTreeMap<u32,crate::lifecycle::Spec>,resident:Option<&crate::world_owner::Owned>,queue:&[Queued],active:&[Handle])->Result<(),u32>{
    for(i,h)in active.iter().enumerate(){if active[..i].contains(h)||!bodies.iter().any(|b|b.handle==*h){return Err(4);}}
    for(i,e)in queue.iter().enumerate(){if !e.dt.is_finite()||e.dt<0.0{return Err(2);}if queue[..i].iter().any(|q|q.owner==e.owner)||!active.contains(&e.owner){return Err(8);}
        // Earlier source scopes retain contacts later recovered or retreated.
        // The global fire budget below still uses the current actual roster.
        for(j,h)in e.ships.iter().enumerate(){if e.ships[..j].contains(h)||!bodies.iter().any(|b|b.handle==*h){return Err(4);}}
        for(j,h)in e.missiles.iter().enumerate(){if e.missiles[..j].contains(h)||h.generation!=1||!ordnance.projectiles.iter().any(|p|p.serial==h.handle as f64){return Err(4);}}
    }
    if !bodies.iter().any(|b|b.ship.as_ref().and_then(|s|s.combat.as_ref()).is_some_and(|c|c.query.is_some())){return Ok(());}
    // Reject incomplete worlds. No absent visibility/scope/native hooks are guessed.
    let mut observed:Vec<f::Body>=bodies.iter().enumerate().map(|(i,b)|observe_ship(b,i)).collect::<Result<_,_>>()?;
    if let Some(world)=resident{for (r,body) in observed.iter_mut().enumerate(){
        let s=bodies[r].ship.as_ref().ok_or(8u32)?;let c=s.combat.as_ref().ok_or(8u32)?;
        if crate::phase_runtime::world_phased(world,bodies,r,specs)?{body.flags|=f::body_flag::PHASED|f::body_flag::COLLISIONLESS;}
        else{body.flags&=!f::body_flag::PHASED;if c.attrs[0]<=0.0{body.flags&=!f::body_flag::COLLISIONLESS;}}
        let root=world.terrain.root(crate::terrain_owner::identity(&bodies[r]))?;body.assembly_root=world.terrain.row(bodies,root)?;
    }}
    let ids:Vec<u32>=bodies.iter().map(|b|b.id).collect();
    let mut mounts=Vec::new();let mut starts=Vec::new();for (i,b)in bodies.iter().enumerate(){starts.push(mounts.len());observe_weapons(b,i,&mut mounts)?;}
    let mut teams:Vec<f64>=Vec::new();for b in &observed{if !teams.contains(&b.team){teams.push(b.team);}}
    let mut visibility=Vec::new();for b in bodies.iter(){let q=b.ship.as_ref().unwrap().combat.as_ref().unwrap().query.as_ref().unwrap();
        for &team in &teams{visibility.push(*q.visible.get(&(team as u32)).ok_or(8u32)? as u8);}}
    let mut projectiles=Vec::new();let mut budget_rows=vec![Vec::new();bodies.len()];
    for (i,p)in ordnance.projectiles.iter().enumerate(){if p.serial>u32::MAX as f64{return Err(5);}
        let source=bodies.iter().position(|b|b.id==p.source&&b.handle==p.source_handle);
        let eligible=p.damage.is_finite()&&p.damage>0.0&&p.range.is_finite()&&p.range>0.0&&!p.did_damage&&!p.disarmed&&!p.collision_disabled
            &&p.target_projectile.is_none()&&p.delivery.spawn_type!=2&&p.flight.is_none_or(|t|t>0.0);
        // InFlightFireBudget constructor accepts exactly existing actual launches at this barrier.
        if eligible{if let Some(row)=p.target_ship.and_then(|id|bodies.iter().position(|b|b.id==id&&Some(b.handle)==p.target_handle)){budget_rows[row].push(i);}}
        projectiles.push(f::Projectile{identity:f::Identity{handle:p.serial as u32,generation:1},x:p.pos[0],y:p.pos[1],vx:p.velocity[0],vy:p.velocity[1],radius:p.delivery.radius,source,
            flags:(if p.guided{f::projectile_flag::GUIDED}else{0})|(if p.collision_disabled{f::projectile_flag::NO_COLLISION}else{0}),damage:p.damage,damage_type:[2u8,0,1,3][p.delivery.damage_type as usize],
            range_remaining:p.range,hp:p.guidance.as_ref().and_then(|g|g.hitpoints).unwrap_or(0.0),
            decoy:p.delivery.guidance.as_ref().and_then(|g|g.flare.as_ref()).is_some_and(|f|f.mode==crate::missile_guidance::FlareMode::Jammer),flare:p.guidance.as_ref().is_some_and(|g|g.flare),
            flight_life:p.flight.unwrap_or(f64::INFINITY),flight_life_present:p.flight.is_some(),eligible_budget:eligible,
            arming:p.arming.unwrap_or(0.0),source_speed:p.source_speed,team:p.team as f64,explicit_team:p.team as f64,budget_team:p.team as f64,tie:i as u32,..f::Projectile::default()});
    }
    let asteroids:Vec<f::Asteroid>=resident.map_or_else(Vec::new,|world|world.terrain.terrain.asteroids.iter().map(|a|f::Asteroid{x:a.position[0],y:a.position[1],vx:a.velocity[0],vy:a.velocity[1],radius:a.radius,hp:a.hp}).collect());
    let budget_scope:Vec<u8>=bodies.iter().map(|b|active.contains(&b.handle)as u8).collect();
    let prepared_hulls=f::PreparedHulls::new(&observed);
    for entry in queue{
        let own=bodies.iter().position(|b|b.handle==entry.owner).ok_or(4u32)?;let dt=entry.dt;
        let scope:Vec<u8>=bodies.iter().map(|b|entry.ships.contains(&b.handle)as u8).collect();
        let missile_scope:Vec<u8>=projectiles.iter().map(|p|entry.missiles.contains(&p.identity)as u8).collect();
        let adaptive=bodies[own].ship.as_ref().unwrap().combat.as_ref().unwrap().query.as_ref().unwrap().adaptive_budget;
        let world=f::World{bodies:&observed,weapons:&mounts,projectiles:&projectiles,asteroids:&asteroids,teams:&teams,visibility:&visibility,scope:&scope,missile_scope:&missile_scope,
            budget_scope:&budget_scope,budget_rows:&budget_rows,budget_present:true,native_budget:true,budget_complete:true,adaptive_budget:adaptive};
        let validated=world.validated().map_err(|_|8u32)?;
        let source=bodies[own].ship.as_ref().unwrap();let permits:Vec<_>=source.combat.as_ref().unwrap().fire.iter().map(|e|crate::system_owner::can_fire(source,e.spec.point_defense)).collect();
        let policies:Vec<_>=source.combat.as_ref().unwrap().fire.iter().map(|e|crate::system_owner::autofire(source,e.pd_role,specs)).collect();
        let s=bodies[own].ship.as_mut().unwrap();if !s.can_advance(){continue;}let c=s.combat.as_mut().unwrap();let q=c.query.as_ref().unwrap();let Some(w)=s.weapons.as_mut()else{continue;};
        let offset=starts[own];let manual=w.data[19]==1.0;let can=w.data[20]==1.0;let mut gs=groups(w,offset);let attrs=c.attrs;
        let scheduler=f::Groups::new(&world,&gs,q.selected,own,dt,manual,can).map_err(|_|8u32)?;
        scheduler.writeback_manual(&mut gs).map_err(|_|8u32)?;write_groups(w,&gs);
        let mut requests=vec![0u8;mounts.len()];let mut program=f::Program::new_prepared(own,&prepared_hulls);
        for i in 0..w.mounts.len(){let row=offset+i;let e=&mut c.fire[i];let mq=e.query.as_mut().unwrap();mq.start_group=None;
            let allows=mq.system_allows&&permits[i];let policy=policies[i].or(mq.policy);
            e.input.requested=false;e.input.trigger_held=false;e.input.system_allows=allows;e.input.suspended=false;e.input.step_dt=dt;
            e.input.target_ship=None;e.input.target_projectile=None;
            e.input_target=None;
            if mounts[row].disabled{mq.memory=None;mq.decision=f::Decision::Unavailable;let m=&mut w.mounts[i].data;m[20]=0.0;m[22]=0.0;m[23]=0.0;m[24]=0.0;continue;}
            program.configure_mount(&world,row,dt).map_err(|_|8u32)?;
            if mq.force_kind==1{
                // The contact machine owns trigger admission; ordinary scheduler,
                // tracker cadence, shot budget and tracker memory never run here.
                let target=observed[own].current_target.and_then(|h|observed.iter().position(|b|b.identity==h));let point=mq.heldcontact.unwrap_or_else(||if !manual{
                    target.map_or(q.aim,|r|[observed[r].x,observed[r].y])
                }else{q.aim});
                program.turn(&world,Some((point[0],point[1])));w.mounts[i].data[15]=program.angle;mq.idle=program.idle;
                e.input.requested=can&&if manual{scheduler.active[row]!=0&&q.trigger}else{target.is_some()&&observed[own].flux_percent<0.65};
                continue;
            }
            if mq.force_kind==2{continue;}if mq.force_kind!=0{return Err(8);}
            if manual&&scheduler.active[row]!=0{
                mq.memory=None;mq.decision=f::Decision::NoTarget;program.turn(&world,Some((q.aim[0],q.aim[1])));
                requests[row]=scheduler.manual_request(&world,row)as u8;
            }else if manual&&scheduler.automatic[row]==0{
                mq.memory=None;mq.decision=f::Decision::NoTarget;let pivot=contact::rotate(e.spec.relative_pos,observed[own].facing);
                let near=f::signed_angle((q.aim[1]-observed[own].y-pivot[1]).atan2(q.aim[0]-observed[own].x-pivot[0])-mounts[row].base_angle).abs()<=(mq.arc+30.0)*PI/360.0;
                let point=if q.player&&mq.flags&f::weapon_flag::HARDPOINT==0&&(near||mq.flags&f::weapon_flag::ALWAYS_FIRE!=0){Some((q.aim[0],q.aim[1]))}else{None};program.turn(&world,point);
            }else{
                let memory=mq.memory.get_or_insert_with(||f::Memory::new(mq.salt));program.set_memory(&world,memory);
                program.aim_validated(&validated,memory,policy,if policy.is_some(){None}else{mq.cadence},mq.salt).map_err(|_|8u32)?;
                let target=program.target(&world);if target.kind==1{e.input.target_ship=bodies_id(&observed,&ids,target.identity);e.input_target=Some(Handle{slot:target.identity.handle,generation:target.identity.generation});}else if target.kind==2{e.input.target_projectile=Some(target.identity.handle);}
                if policy.is_some_and(|p|p.suspended){e.input.suspended=true;program.turn(&world,None);mq.decision=f::Decision::Reassigning;}
                else{program.turn_automatic(&world);mq.decision=program.decide(&world,memory,allows,false).map_err(|_|8u32)?;
                    if mq.decision==f::Decision::Fire&&!flux_budget(&s.flux,&w.mounts[i],&e.spec,dt,attrs,&s.live){mq.decision=f::Decision::FluxBudget;}
                    if mq.decision==f::Decision::Fire&&can&&w.mounts[i].data[16]<=0.0{requests[row]=1;}}
            }
            w.mounts[i].data[15]=program.angle;mq.idle=program.idle;
            e.input.recheck_flux_budget=!manual||scheduler.active[row]==0;
        }
        let mut scheduler=scheduler;scheduler.schedule_automatic(&world,&mut requests).map_err(|_|8u32)?;
        scheduler.writeback(&mut gs).map_err(|_|8u32)?;write_groups(w,&gs);
        for i in 0..w.mounts.len(){let row=offset+i;let e=&mut c.fire[i];if e.query.as_ref().unwrap().force_kind!=0{continue;}e.input.requested=requests[row]!=0;
            // ShipWeaponControlSystem resets held input during each query.
            // Only the actual ordered request can set it after admission.
            e.input.trigger_held=false;e.query.as_mut().unwrap().start_group=scheduler.starts[row];}
    }Ok(())
}
fn bodies_id(observed:&[f::Body],ids:&[u32],target:f::Identity)->Option<u32>{observed.iter().position(|b|b.identity==target).map(|r|ids[r])}
fn flux_budget(flux:&crate::flux::Flux,m:&weapon::Mount,spec:&crate::weapon_fire::FireSpec,dt:f64,attrs:[f64;20],live:&crate::ship_effects::Modifiers)->bool{
    let d=&m.data;let active=d[20]>0.0||d[23]==1.0||d[23]==2.0;
    let cost=if d[2]==1.0{spec.flux_per_second*dt.max(if !active&&d[3]==1.0{spec.beam_chargeup+spec.beam_duration}else{dt})}
        else if d[22]==1.0||active{0.0}else{spec.flux_per_shot*if spec.interruptible{1.0}else{spec.burst_size.max(1.0)}};
    let ceiling=if attrs[19]==1.0&&!spec.point_defense&&!active{0.95}else{1.0};
    let multiplier=attrs[12]*if d[1]==0.0{1.0}else{live.weapon_value(d[1]as usize-1,crate::ship_effects::COST)};
    !(cost>0.0&&flux.total()+cost*multiplier>flux.max*ceiling)
}
