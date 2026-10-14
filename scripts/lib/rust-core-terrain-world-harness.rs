//! Isolated actual resident terrain, damage, hulk source lifecycle and FX.
#[path="../../native/combat-core/src/random.rs"]mod random;
#[path="../../native/combat-core/src/motion.rs"]mod motion;
#[path="../../native/combat-core/src/flux.rs"]mod flux;
#[path="../../native/combat-core/src/lifecycle.rs"]mod lifecycle;
#[path="../../native/combat-core/src/shield.rs"]mod shield;
#[path="../../native/combat-core/src/armor.rs"]mod armor;
#[path="../../native/combat-core/src/component.rs"]mod component;
#[path="../../native/combat-core/src/weapon.rs"]mod weapon;
#[path="../../native/combat-core/src/engine.rs"]mod engine;
#[path="../../native/combat-core/src/contact.rs"]mod contact;
#[path="../../native/combat-core/src/readiness.rs"]mod readiness;
#[path="../../native/combat-core/src/readiness_owner.rs"]mod readiness_owner;
#[path="../../native/combat-core/src/ship_state.rs"]mod ship_state;
#[path="../../native/combat-core/src/ship_effects.rs"]mod ship_effects;
#[path="../../native/combat-core/src/explosion_effects.rs"]mod explosion_effects;
#[path="../../native/combat-core/src/world_damage.rs"]mod world_damage;
mod battle{
    #[derive(Clone)]pub struct CombatShip{pub size:u32,pub team:u32,pub attrs:[f64;20],pub readiness:Option<crate::readiness_owner::Owned>,pub query:Option<Query>}
    #[derive(Clone)]pub struct Query{pub target:Option<crate::state::Handle>}
    impl CombatShip{pub fn valid(&self)->bool{true}}
}
// This death fixture has no ship-system world extension (world=None); actual
// ShipState live modifiers use their real default. Any unexpected extension
// damage hook fails rather than replacing gameplay with a record-only service.
mod system_owner{
    #[derive(Clone)]pub struct Meta{pub kind:crate::ship_effects::Kind,pub regen:f64}
    #[derive(Clone)]pub struct Owned{pub metas:std::collections::BTreeMap<u32,Meta>}
    impl Owned{pub fn valid(&self)->bool{true}}
    pub fn damage(s:&mut crate::ship_state::ShipState,_:f64){assert!(s.world.is_none());}
}
mod state{
    #[derive(Clone,Copy,PartialEq,Eq)]pub struct Handle{pub slot:u32,pub generation:u32}
    #[derive(Clone)]pub struct Body{pub id:u32,pub handle:Handle,pub order:f64,pub motion:[f64;crate::motion::WIDTH],pub ship:Option<crate::ship_state::ShipState>}
}
#[path="../../native/combat-core/src/terrain_world.rs"]mod terrain_world;
use std::{cell::RefCell,collections::BTreeMap};use terrain_world as t;
fn identity(id:f64)->t::Identity{t::Identity{id,generation:1}}
struct Host{ships:Vec<t::Ship>,states:Vec<ship_state::ShipState>,rows:Vec<Vec<f64>>,terrain_speed:Vec<f64>,particles:u32}
impl Host{
    fn row(&mut self,r:Vec<f64>){self.rows.push(r);}
    fn index(&self,id:t::Identity)->Result<usize,u32>{self.ships.iter().position(|s|s.id==id).ok_or(4)}
    fn new(scene:u32)->Self{let mut ships=Vec::new();let mut states=Vec::new();for i in 0..2{
        let mut state=ship_state::ShipState::new(&[100000.0,0.0,1.0,1.0,1.0,0.0,1.0,0.0,0.0,0.0,2.0,1.0,0.0,1.0,0.0,0.0,0.0]);
        state.armor=Some(armor::Armor::new(&[9.0,7.0,10.0,10.0,27.0,-45.0,-35.0,10000.0,10000.0,1.0,1.0,0.85,1.0,1.0,0.0,0.0,0.0]));
        state.damage_policy=[1.23,1.13,1.19,1.17,1.09,100.0,1.0,1.0];
        if scene>=30{let mut shield=shield::Shield::new(&[2.0,180.0,33.0,0.83,0.0,1.0,1.0,0.5,0.5,2.0,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0]);
            shield.data[7]=80.0;shield.data[8]=1.4;shield.data[10]=0.35;state.shield=Some(shield);
            let spec=lifecycle::Spec::new(&[0.0,0.0,0.0,0.0,1.0,1.0,0.0,0.0,0.0]);
            for id in 1..=2{let mut system=lifecycle::System::new(id,1,&spec);system.state=lifecycle::COOLDOWN;system.cooling=true;system.cooldown_timer=0.4;system.stage_timer=0.4;system.disabled=true;state.systems.push(system);}}
        let mut init=random::Random::new(0);state.components.push(component::Component::new(&[1.0,0.0,0.0,3.0,-4.0,1.0,1.0],&mut init));
        let p=if i==0{[0.0,0.0]}else{[if scene%7==0{0.0}else if scene%7==1{75.0}else{24.0},if scene%4==0{9.0}else{0.0}]};
        let bounds=if scene%6==0{Vec::new()}else if scene%6==1{vec![[-30.0,-20.0],[30.0,-20.0],[30.0,20.0],[4.0,20.0],[4.0,4.0],[-30.0,4.0]]}else{vec![[-30.0,-20.0],[30.0,-20.0],[30.0,20.0],[-30.0,20.0]]};
        ships.push(t::Ship{id:identity((i+1)as f64),stable_id:format!("{}",i+1),root:identity((i+1)as f64),team:Some(if scene%5==0{0}else{i as u32}),dead:scene==17&&i==0,collisionless:scene==18&&i==1,
            position:p,velocity:if i==0{[75.0,3.0]}else{[-15.0,-2.0]},facing:if i==0{0.27}else{-0.37},radius:30.0,mass:if i==0{if scene%3==0{100.0}else{500.0}}else{200.0},station:scene%8==0&&i==1,
            bounds,shield:t::Shield{active:scene%3!=0,kind:2,center:[p[0]+if i==0{4.0}else{-3.0},p[1]+2.0],radius:33.0,arc:if scene%4==0{360.0}else{80.0},facing:if i==0{0.1}else{3.2},void:scene%5==0},cr_taken:1.13,system_shield:1.11});states.push(state);
    }Self{ships,states,rows:Vec::new(),terrain_speed:vec![0.3;2],particles:0}}
}
impl t::Host for Host{
    fn ships(&self)->Vec<t::Identity>{self.ships.iter().map(|s|s.id).collect()}fn ship(&self,id:t::Identity)->Option<t::Ship>{self.ships.iter().find(|s|s.id==id).cloned()}
    fn move_root(&mut self,id:t::Identity,p:[f64;2],v:[f64;2])->Result<(),u32>{let i=self.index(id)?;let s=&mut self.ships[i];s.position[0]+=p[0];s.position[1]+=p[1];s.shield.center[0]+=p[0];s.shield.center[1]+=p[1];s.velocity[0]+=v[0];s.velocity[1]+=v[1];Ok(())}
    fn sync_modules(&mut self,id:t::Identity)->Result<(),u32>{self.index(id)?;Ok(())}
    fn terrain_speed(&mut self,id:t::Identity,value:f64)->Result<(),u32>{let i=self.index(id)?;self.terrain_speed[i]=value;Ok(())}
    fn shield_contact(&mut self,id:t::Identity,d:f64)->Result<(),u32>{self.index(id)?;self.row(vec![0.0,id.id,d]);Ok(())}
    fn shield_absorb(&mut self,id:t::Identity,d:f64,kind:u32,angle:f64)->Result<t::Absorption,u32>{self.index(id)?;self.row(vec![1.0,id.id,d,kind as f64,angle]);Ok(t::Absorption{flux:d*2.0*0.83,absorbed:d,remainder:0.0})}
    fn shield_flux(&mut self,id:t::Identity,d:f64)->Result<(),u32>{let i=self.index(id)?;self.states[i].flux_operation(0,d,true,&mut Vec::new());self.row(vec![2.0,id.id,d]);Ok(())}
    fn armor(&mut self,id:t::Identity,p:[f64;2],d:f64,kind:u32,strength:f64,v:&mut random::Random)->Result<t::Damage,u32>{let i=self.index(id)?;let a=self.states[i].armor_impact(&[p[0],p[1],d,kind as f64,1.0,strength,0.0,0.0],v,&mut Vec::new())?;self.row(vec![3.0,id.id,p[0],p[1],d,kind as f64,strength,a[0],a[1]]);Ok(t::Damage{armor:a[0],hull:a[1]})}
    fn components(&mut self,id:t::Identity,p:[f64;2],d:t::Damage,source:Option<t::Identity>,r:&mut random::Random)->Result<(),u32>{let i=self.index(id)?;self.states[i].propagate(p,[d.armor,d.hull],0.0,if source.is_some(){[1.17,1.09]}else{[1.0,1.0]},r,&mut Vec::new())}
    fn armor_sparks(&mut self,id:t::Identity,p:[f64;2],damage:f64,v:&mut random::Random)->Result<(),u32>{let i=self.index(id)?;let s=&self.ships[i];let off=contact::rotate(p,s.facing);let point=[s.position[0]+off[0],s.position[1]+off[1]];let particles=world_damage::armor_particles(point,damage,v);
        self.particles+=particles.len()as u32;let mut row=vec![4.0,id.id,p[0],p[1],damage,particles.len()as f64];for p in particles{row.extend([p.position[0],p.position[1],p.velocity[0],p.velocity[1],p.size]);}self.row(row);Ok(())}
    fn hull(&mut self,id:t::Identity,d:f64)->Result<(),u32>{let i=self.index(id)?;let s=&mut self.states[i];s.armor.as_mut().unwrap().apply_hull(d,false,&mut s.shield);self.row(vec![5.0,id.id,d]);Ok(())}
    fn debris(&mut self,p:[f64;2],count:u32,c:[u8;3],speed:f64,v:&mut random::Random)->Result<(),u32>{let particles=world_damage::debris(p,count as usize,c,speed,v);self.row(vec![6.0,p[0],p[1],count as f64,speed,particles.len()as f64]);Ok(())}
    fn sparks(&mut self,p:[f64;2],count:u32,c:[u8;3],v:&mut random::Random)->Result<(),u32>{let particles=t::spark_particles(p,t::spark_count(count,self.particles),c,v);self.particles+=particles.len()as u32;
        let mut row=vec![7.0,p[0],p[1],count as f64,c[0]as f64,c[1]as f64,c[2]as f64,particles.len()as f64];for s in particles{row.extend([s.position[0],s.position[1],s.velocity[0],s.velocity[1],s.life,s.size,s.end_size,s.color[0],s.color[1],s.color[2],s.peak_alpha,s.drag,s.rotation,s.stretch]);}self.row(row);Ok(())}
    fn explosion_visual(&mut self,p:[f64;2],r:f64,c:[u8;3],v:&mut random::Random)->Result<(),u32>{let e=t::impact_explosion(p,r,c,true,2.0,[0.0;2],v).unwrap();
        let mut row=vec![8.0,p[0],p[1],r,c[0]as f64,c[1]as f64,c[2]as f64,e.id,e.radius,e.maximum_radius,e.duration,e.rotation,e.shockwave,e.maximum_shockwave,e.puffs.len()as f64];
        for p in e.puffs{row.extend([p.texture as f64,p.start,p.end,p.rotation,p.offset[0],p.offset[1],p.velocity[0],p.velocity[1]]);}self.row(row);Ok(())}
    fn output(&mut self,event:t::Output){self.row(match event{t::Output::Floating{point,amount,color}=>vec![9.0,point[0],point[1],amount,color[0]as f64,color[1]as f64,color[2]as f64],
        t::Output::Ripple{point,radius,color}=>vec![10.0,point[0],point[1],radius,color[0]as f64,color[1]as f64,color[2]as f64],t::Output::Sound{key,point,volume}=>vec![11.0,key as f64,point[0],point[1],volume],
        t::Output::Shake{amount,duration}=>vec![12.0,amount,duration],t::Output::Text{point}=>vec![13.0,point[0],point[1]],t::Output::Detach{projectile}=>vec![14.0,projectile]});}
    fn split_armor(&mut self,id:t::Identity,initial:bool,seam:&[[f64;2]],v:&mut random::Random)->Result<(),u32>{let i=self.index(id)?;t::resident_split_armor(&mut self.states[i],initial,seam,v)}
    fn cool_hulk_source(&mut self,id:t::Identity,dt:f64,facing:f64,v:&mut random::Random)->Result<(),u32>{let i=self.index(id)?;let specs=BTreeMap::from([(1,lifecycle::Spec::new(&[0.0,0.0,0.0,0.0,1.0,1.0,0.0,0.0,0.0]))]);t::resident_cool_hulk_source(&mut self.states[i],dt,facing,self.ships[i].position,&specs,v)}
}
impl t::EnvironmentHost for Host{
    // The independent terrain oracle verifies this boundary/order. Registered
    // effect and immediate chain services are covered by their own world probe
    // and MUST be supplied by the production Rust owner.
    fn environment_impact(&mut self,id:f64,p:[f64;2],v:[f64;2],_:Option<f64>,_:&mut random::Random,_:&mut random::Random)->Result<(),u32>{self.row(vec![15.0,id,p[0],p[1],v[0],v[1]]);Ok(())}
}
struct Fixture{input:Vec<f64>,output:Vec<f64>}
thread_local!{static F:RefCell<Fixture>=RefCell::new(Fixture{input:Vec::new(),output:Vec::new()});}
#[no_mangle]pub extern "C" fn test_input(n:u32)->u32{F.with_borrow_mut(|f|{f.input.resize(n as usize,0.0);f.input.as_mut_ptr()as u32})}
#[no_mangle]pub extern "C" fn test_run()->u32{F.with_borrow_mut(|f|{
    let scene=f.input[0]as u32;let mut terrain=t::Terrain::default();let mut host=Host::new(scene);let mut random=random::Random::new(8127);let mut visual=random::Random::new(15181);f.output.clear();
    if scene<20{t::nebula(&mut host).unwrap();let result=t::ship_collision(identity(1.0),identity(2.0),&mut host,&mut random,&mut visual).unwrap();f.output.push(result as u32 as f64);}
    else if scene==20{terrain.initialize_asteroids();terrain.advance_asteroids(270.0);terrain.initialize_nebulae(&[t::NebulaDefinition{sprite:"/game-assets/authored/terrain/nebula-soft-veil-01/nebula.png".into(),position:[600.0,-500.0],opacity:0.24}]);}
    else if scene<30{
        for i in 0..3{terrain.asteroids.push(t::Asteroid{id:identity((i+1)as f64),position:[if i==0{20.0}else if i==1{25.0}else{130.0},i as f64*2.0],velocity:[-17.0+i as f64*4.0,3.0],facing:0.37,angular:0.13,radius:if i==0{40.0}else{18.0},mass:if i==0{1200.0}else{243.0},hp:if scene%3==0{70.0}else{600.0},max_hp:600.0,sprite:2,fixed:scene%4==0&&i==0});}
        if scene<25{terrain.resolve_asteroids(&mut host,&mut random,&mut visual).unwrap();}
        else{let p=t::Projectile{id:0.73,previous:[-100.0,0.0],position:[200.0,0.0],radius:3.0,damage:if scene%2==0{750.0}else{30.0},rocket:true,damaged_asteroids:if scene==29{vec![1.0]}else{Vec::new()},damaged_hulks:Vec::new()};
            if let Some(hit)=terrain.query_projectile(&p){f.output.extend([hit.index as f64,hit.t,hit.point[0],hit.point[1]]);terrain.commit_projectile(&p,hit,scene%2==0,&mut host,&mut random,&mut visual).unwrap();}else{f.output.extend([-1.0;4]);}}
    }else{
        let shape=(scene-30)%4;let bounds=match shape{0=>vec![[-100.0,-70.0],[100.0,-70.0],[100.0,70.0],[-100.0,70.0]],1=>vec![[-80.0,-60.0],[80.0,-60.0],[80.0,60.0],[0.0,30.0],[-80.0,60.0]],2=>vec![[0.0,0.0],[1.0,0.0],[0.0,1.0]],_=>vec![[0.0,0.0],[100.0,100.0],[100.0,0.0],[0.0,100.0]]};
        terrain.admit_hulk(world_damage::Hulk{id:1.0,source:identity(1.0),position:[20.0,-30.0],velocity:[7.0,-3.0],facing:0.27,angular:0.07,bounds,radius:140.0,slots:vec![1,2,3],
            breakup:Some(world_damage::Breakup{remaining:3,interval:0.11,elapsed:0.0,next_interval:0.08})},Some(if scene%2==0{5}else{2}),250.0,&[(1,[-50.0,0.0]),(2,[50.0,0.0]),(3,[0.0,0.0])]).unwrap();
        terrain.hulks[0].age=if scene==37{10.45}else{0.0};terrain.hulks[0].fixed=scene==38;terrain.hulks[0].managed=scene==39;
        if scene==37{terrain.hulks[0].size=Some(1);}
        if scene<40{for _ in 0..5{terrain.advance_hulks(0.13,&mut host,&mut visual).unwrap();}}
        else{let p=t::Projectile{id:0.73,previous:if scene==41{[20.0,-30.0]}else{[-200.0,if scene==43{500.0}else{-30.0}]},position:[200.0,if scene==43{500.0}else{-30.0}],radius:3.0,damage:45.0,rocket:true,damaged_asteroids:Vec::new(),damaged_hulks:if scene==42{vec![1.0]}else{Vec::new()}};
            if let Some(hit)=terrain.query_hulk(&p){f.output.extend([hit.id,hit.t,hit.point[0],hit.point[1],hit.velocity[0],hit.velocity[1],hit.radius]);terrain.commit_hulk(&p,hit,&mut host,&mut random,&mut visual).unwrap();}
            else{f.output.extend([-1.0;7]);}}
    }
    f.output.extend([random.cursor,visual.cursor,visual.ids]);
    for (i,s)in host.ships.iter().enumerate(){let a=host.states[i].armor.as_ref().unwrap();f.output.extend(s.position);f.output.extend(s.velocity);f.output.extend([a.data[14],host.states[i].flux.hard,host.terrain_speed[i],a.data[12],a.data[19],a.data[20]]);f.output.extend(a.cells.iter().map(|v|*v as f64));f.output.push(a.scars.len()as f64);for scar in &a.scars{f.output.extend(*scar);}for c in &host.states[i].components{f.output.extend(c.data);}
        if scene>=30{let shield=host.states[i].shield.as_ref().unwrap();f.output.extend([shield.data[7],shield.data[8],shield.data[10]]);for system in &host.states[i].systems{f.output.extend(system.words());}}
    }
    f.output.push(terrain.asteroids.len()as f64);for a in &terrain.asteroids{f.output.extend([a.id.id,a.position[0],a.position[1],a.velocity[0],a.velocity[1],a.facing,a.angular,a.radius,a.mass,a.hp,a.max_hp,a.sprite as f64,a.fixed as u32 as f64]);}
    f.output.push(terrain.hulks.len()as f64);for h in &terrain.hulks{f.output.extend([h.id,h.age,h.position[0],h.position[1],h.velocity[0],h.velocity[1],h.facing,h.angular,h.offset[0],h.offset[1],h.radius,h.sequence.unwrap_or(0)as f64,h.bounds.len()as f64]);for p in &h.bounds{f.output.extend(*p);}f.output.push(h.visual.as_ref().map_or(0,|p|p.len())as f64);if let Some(v)=&h.visual{for p in v{f.output.extend(*p);}}f.output.push(h.slots.len()as f64);for (id,_)in &h.slots{f.output.push(*id as f64);}}
    f.output.push(terrain.nebulae.len()as f64);for c in &terrain.nebulae{f.output.extend([c.id as f64,c.position[0],c.position[1],c.thickness,c.atlas[0]as f64,c.atlas[1]as f64,c.sprite.encode_utf16().count()as f64]);f.output.extend(c.sprite.encode_utf16().map(|c|c as f64));}
    f.output.push(host.rows.len()as f64);for row in &host.rows{f.output.push(row.len()as f64);f.output.extend(row);}f.output.as_ptr()as u32
})}
#[no_mangle]pub extern "C" fn test_output_words()->u32{F.with_borrow(|f|f.output.len()as u32)}

