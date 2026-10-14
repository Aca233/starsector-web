#[path="../../native/combat-core/src/motion_owner.rs"]mod motion_owner;
#[path="../../native/combat-core/src/scene_prelude.rs"]mod scene_prelude;
#[path="../../native/combat-core/src/flight_runtime.rs"]mod flight_runtime;
#[path="../../native/combat-core/src/flight_static_wire.rs"]mod flight_static_wire;
#[path="../../native/combat-core/src/flight_wire.rs"]mod flight_wire;
#[path="../../native/combat-core/src/flight_admission.rs"]mod flight_admission;
#[path="../../native/combat-core/src/flight_allocator.rs"]mod flight_allocator;
//! Actual mine authority oracle. Reuses only existing real world fixture and
//! exact real factories; no fake damage/explosion services are introduced.
#[path="../../native/combat-core/src/gravity_world.rs"]mod gravity_world;
#[path="../../native/combat-core/src/gravity_owner.rs"]mod gravity_owner;
#[path="../../native/combat-core/src/gravity_runtime.rs"]mod gravity_runtime;
#[path="../../native/combat-core/src/gravity_wire.rs"]mod gravity_wire;
#[path="../../native/combat-core/src/aux_world.rs"]mod aux_world;
include!("rust-core-weapon-world-harness.rs");
struct AuxServices{spawned:Vec<f64>,retired:Vec<f64>}
impl aux_world::Services for AuxServices{
    fn projectile_spawned(&mut self,_:&mut w::Owned,p:&projectile::Projectile)->Result<(),u32>{self.spawned.push(p.serial);Ok(())}
    fn projectile_retired(&mut self,_:&mut w::Owned,p:&projectile::Projectile)->Result<(),u32>{self.retired.push(p.serial);Ok(())}
    fn phased(&self,bodies:&[Body],_:&w::Owned,_:&std::collections::BTreeMap<u32,lifecycle::Spec>,id:e::Identity)->Result<bool,u32>{let b=bodies.iter().find(|b|w::identity(b)==id).ok_or(4u32)?;let s=b.ship.as_ref().ok_or(8u32)?;
        Ok(s.flags&(ship_state::DOCKED|ship_state::RETREATED)!=0||s.shield.as_ref().is_some_and(|sh|sh.kind()==3&&(sh.data[14]==1.0||sh.data[14]==2.0||sh.data[14]==3.0&&sh.data[15]>0.5)))}
}
fn aux_spec(weapon:u32)->aux_world::MineSpec{aux_world::MineSpec::new(&[weapon as f64,2000.0,50.0,500.0,20.0,if weapon==1{450.0}else{350.0},500.0,175.0,3.0,1.0,250.0,200.0,0.1,
    148.0,if weapon==1{100.0}else{0.0},if weapon==1{50.0}else{211.0},if weapon==1{255.0}else{190.0},if weapon==1{100.0}else{60.0},if weapon==1{100.0}else{255.0}]).unwrap()}
fn aux_record(q:&mut Vec<f64>,world:&w::Owned){let mut records=Vec::<Vec<f64>>::new();for x in &world.output{match x{
    w::Output::Death(world_damage::Output::ArmorParticles{particles,..})=>{let mut a=vec![0.0,particles.len()as f64];for p in particles{a.extend(p.position);a.extend(p.velocity);a.push(p.size);}records.push(a);},
    w::Output::Death(world_damage::Output::Debris(p))=>{let mut a=vec![1.0,0.0,p.len()as f64];for d in p{debris_words(&mut a,d);}records.push(a);},
    w::Output::Sparks(p)=>{let mut a=vec![2.0,p.len()as f64];for p in p{a.extend(p.position);a.extend(p.velocity);a.extend([p.life,p.size,p.end_size]);a.extend(p.color);a.extend([p.peak_alpha,p.drag,p.rotation,p.stretch]);}records.push(a);},
    w::Output::Impact(p)=>{let mut a=vec![3.0,p.id,p.position[0],p.position[1],p.maximum_radius,p.duration,p.rotation,p.rings as u32 as f64,p.puffs.len()as f64];for p in &p.puffs{a.extend([p.texture as f64,p.start,p.end,p.rotation]);a.extend(p.offset);a.extend(p.velocity);}records.push(a);},
    w::Output::Weapon(fx::Output::Floating(x))=>records.push(vec![4.0,x.id,x.text.parse::<f64>().unwrap_or(-1.0)]),
    w::Output::Weapon(fx::Output::Sound{key,point,volume})=>records.push(vec![5.0,match key.as_str(){"mine_spawn"=>0.0,"mine_teleport"=>1.0,"mine_ping"=>2.0,"mine_windup_heavy"=>3.0,"mine_explosion"=>4.0,_=>99.0},point[0],point[1],*volume]),
    w::Output::Explosion(e::Output::DetachContrail{target})=>records.push(vec![7.0,target.id]),_=>{}}}
    q.push(records.len()as f64);for a in records{q.push(a.len()as f64);q.extend(a);}
}
fn aux_snapshot(q:&mut Vec<f64>,bodies:&[Body],ord:&battle::Ordnance,world:&w::Owned,aux:&aux_world::Owned,r:&random::Random,v:&random::Random,services:&AuxServices){
    q.extend([r.cursor,v.cursor,v.ids]);q.extend(aux.words());for body in bodies{let s=body.ship.as_ref().unwrap();let a=s.armor.as_ref().unwrap();let sh=s.shield.as_ref().unwrap();q.extend([a.data[14],s.flux.hard,s.flux.soft,s.flux.overloaded as u32 as f64,s.flux.overload_timer,sh.active()as u32 as f64,sh.data[7],sh.data[28],(s.flags&ship_state::DEAD!=0)as u32 as f64]);
        q.extend(a.cells.iter().map(|v|*v as f64));q.extend(s.components[0].data);q.extend([sh.void.as_ref().map_or(0.0,|v|v.data[5]),sh.void.as_ref().map_or(0.0,|v|v.data[7]),sh.void.as_ref().map_or(0.0,|v|v.data[8]),sh.void.as_ref().map_or(0.0,|v|v.data[11])]);}
    q.extend(world.stats.player);q.extend(world.stats.enemy);q.push(ord.projectiles.len()as f64);for p in &ord.projectiles{q.extend([p.serial,p.id,p.source as f64,p.pos[0],p.pos[1],p.prev[0],p.prev[1],p.velocity[0],p.velocity[1],p.damage,p.base_damage,p.hp(),p.range,p.total_range,p.elapsed,p.disarmed as u32 as f64,p.delivery.is_mine as u32 as f64,p.delivery.missile as u32 as f64,p.origin[0],p.origin[1]]);}
    q.push(world.explosions.len()as f64);for x in &world.explosions{q.extend([x.position[0],x.position[1],x.life,x.ships.len()as f64,x.asteroids.len()as f64,x.missiles.len()as f64]);}
    q.push(world.floating.len()as f64);for x in &world.floating{q.extend([x.id,x.position[0],x.position[1],x.velocity[0],x.velocity[1],x.text.parse::<f64>().unwrap_or(-1.0),x.size,x.life,x.maximum_life]);q.extend(x.color.map(|v|v as f64));}
    q.push(services.spawned.len()as f64);q.extend(&services.spawned);q.push(services.retired.len()as f64);q.extend(&services.retired);aux_record(q,world);
}
#[no_mangle]pub extern "C" fn test_aux()->u32{F.with_borrow_mut(|f|{let scene=f.input[0]as u32;let(mut bodies,mut ord,mut world)=fixture(0);ord.projectiles.clear();ord.serial=0.0;
    let mut aux=aux_world::Owned::default();aux.install_spec(aux_spec(1)).unwrap();aux.install_spec(aux_spec(2)).unwrap();
    for i in 0..3{if scene==8&&i==1{let s=bodies[i].ship.as_mut().unwrap();s.flux.max=100.0;s.shield.as_mut().unwrap().data[6]=1.0;s.shield.as_mut().unwrap().configure_void(&[1.0,30.0,0.0,0.4,1.0]);}
        if scene==9&&i==1{let a=bodies[i].ship.as_mut().unwrap().armor.as_mut().unwrap();a.data[14]=12.0;for c in &mut a.cells{*c=0.0;}}
        if scene==12&&i==1{let sh=bodies[i].ship.as_mut().unwrap().shield.as_mut().unwrap();sh.data[0]=3.0;sh.data[14]=2.0;}
        if scene<7||scene==11||scene==12||scene==20{if i>0{bodies[i].motion[0]=3000.0+i as f64*100.0;}}if scene==7||scene==11{if i>0{bodies[i].motion[0]=5000.0;}}
        if scene==1&&i==0{let c=bodies[i].ship.as_mut().unwrap().combat.as_mut().unwrap();c.attrs[11]=1.17;c.attrs[16]=1.23;}
        let payload=aux_world::Payload{damage:2000.0,launch_speed:50.0,hp:500.0,flight:if scene==1{16.0}else{20.0}};
        aux.install_ship(aux_world::ShipMeta{identity:w::identity(&bodies[i]),handle:bodies[i].handle,payloads:[payload;2],stealth:if (14..20).contains(&scene)&&i<2{Some(if i==0&&scene%2==1{1}else{2})}else{None},ineligible:scene==19&&i==2,drone:scene==19&&i==2,travel_systems:Vec::new()}).unwrap();
    }
    let(mut r,mut v)=(random::Random::new(8127),random::Random::new(15181));let specs=BTreeMap::new();let mut events=Vec::new();let mut services=AuxServices{spawned:Vec::new(),retired:Vec::new()};
    if scene<14||scene==20{let mut h=aux_world::Host{bodies:&mut bodies,specs:&specs,ordnance:&mut ord,world:&mut world,owned:&mut aux,services:&mut services,events:&mut events};
        if scene==2||scene==3||scene==4{for _ in 0..if scene==4{14}else{1}{h.deploy(if scene==3{[5000.0,0.0]}else{[3100.0,0.0]},id(1),1000.0,&mut r,&mut v).unwrap();}}
        else{h.spawn(if matches!(scene,8|9|10|13){[100.0,0.0]}else{[0.0,0.0]},id(1),if scene==1{1}else{2},aux_world::SpawnOptions{life:if scene==1{None}else{Some(if scene==5{0.2}else{0.25})},stationary:scene==0, ..Default::default()},&mut r,&mut v).unwrap();}
    }
    if scene==7||scene==11{let mut p=shot(2.0,if scene==11{1}else{2},50.0,0.0,0.0,1.0,0);p.id=0.777;p.delivery.missile=true;p.hitpoints=Some(500.0);ord.projectiles.push(p);ord.serial=2.0;}
    let o=&mut f.output;o.clear();let ticks=if scene==1{210}else if scene==2||scene==3||scene==4{90}else if (14..20).contains(&scene){75}else{42};
    for tick in 0..ticks{
        if (scene==5||scene==6)&&tick==3{if scene==5{ord.projectiles[0].disarmed=true;}else{ord.projectiles.clear();}}
        if scene==13&&tick==3{bodies[0].ship.as_mut().unwrap().flags|=ship_state::DEAD;}
        if scene==16&&tick==14{bodies[1].ship.as_mut().unwrap().flags|=ship_state::DEAD;}
        if scene==17&&tick==14{bodies[0].ship.as_mut().unwrap().flags|=ship_state::DEAD;}
        if scene==18&&tick==14{aux.clear();ord.projectiles.clear();}
        if (14..20).contains(&scene){for i in 0..2{let mut h=aux_world::Host{bodies:&mut bodies,specs:&specs,ordnance:&mut ord,world:&mut world,owned:&mut aux,services:&mut services,events:&mut events};h.stealth(id(i+1),0.1,&mut r,&mut v).unwrap();}}
        if scene==20&&tick==1{ord.projectiles[0].pos=[350.0,12.0];ord.projectiles[0].velocity=[14.0,-3.0];ord.projectiles[0].disarmed=true;}
        if scene==10&&tick==3{ord.projectiles.clear();}
        let mut h=aux_world::Host{bodies:&mut bodies,specs:&specs,ordnance:&mut ord,world:&mut world,owned:&mut aux,services:&mut services,events:&mut events};h.advance(0.1,&mut r,&mut v).unwrap();
        aux_snapshot(o,&bodies,&ord,&world,&aux,&r,&v,&services);world.output.clear();
    }o.as_ptr()as u32})}

#[no_mangle]pub extern "C" fn test_aux_guards()->u32{F.with_borrow_mut(|f|{let(mut bodies,mut ord,mut world)=fixture(0);ord.projectiles.clear();ord.serial=0.0;let mut aux=aux_world::Owned::default();aux.install_spec(aux_spec(2)).unwrap();
    for b in &bodies{aux.install_ship(aux_world::ShipMeta{identity:w::identity(b),handle:b.handle,payloads:[aux_world::Payload{damage:2000.0,launch_speed:50.0,hp:500.0,flight:20.0};2],stealth:None,ineligible:false,drone:false,travel_systems:Vec::new()}).unwrap();}
    let(mut r,mut v)=(random::Random::new(8127),random::Random::new(15181));let specs=BTreeMap::new();let mut events=Vec::new();let mut services=AuxServices{spawned:Vec::new(),retired:Vec::new()};let o=&mut f.output;o.clear();
    for case in 0..4{let before=(r.cursor,v.cursor,v.ids,ord.serial,world.output.len(),aux.words());let mut h=aux_world::Host{bodies:&mut bodies,specs:&specs,ordnance:&mut ord,world:&mut world,owned:&mut aux,services:&mut services,events:&mut events};
        let result=match case{0=>h.spawn([0.0;2],id(1),999,Default::default(),&mut r,&mut v),1=>h.spawn([0.0;2],e::Identity{id:1.0,generation:2},2,Default::default(),&mut r,&mut v),
            2=>h.spawn([f64::NAN,0.0],id(1),2,Default::default(),&mut r,&mut v),_=>h.deploy([0.0;2],id(1),f64::INFINITY,&mut r,&mut v)};
        o.extend([result.unwrap_err()as f64,(before==(r.cursor,v.cursor,v.ids,ord.serial,world.output.len(),aux.words()))as u32 as f64,ord.projectiles.len()as f64,services.spawned.len()as f64]);
    }o.as_ptr()as u32})}
