// Actual resident weapon world oracle fixture; no mock damage/FX owner.
#[path="../../native/combat-core/src/flux.rs"]mod flux;
#[path="../../native/combat-core/src/armor.rs"]mod armor;
#[path="../../native/combat-core/src/component.rs"]mod component;
#[path="../../native/combat-core/src/weapon.rs"]mod weapon;
#[path="../../native/combat-core/src/weapon_fire.rs"]mod weapon_fire;
#[path="../../native/combat-core/src/contact.rs"]mod contact;
#[path="../../native/combat-core/src/projectile.rs"]mod projectile;
#[path="../../native/combat-core/src/battle.rs"]mod battle;
#[path="../../native/combat-core/src/fire_control.rs"]mod fire_control;
#[path="../../native/combat-core/src/fire_query.rs"]mod fire_query;
#[path="../../native/combat-core/src/readiness.rs"]mod readiness;
#[path="../../native/combat-core/src/readiness_owner.rs"]mod readiness_owner;
#[path="../../native/combat-core/src/missile_guidance.rs"]mod missile_guidance;
#[path="../../native/combat-core/src/missile_owner.rs"]mod missile_owner;
#[path="../../native/combat-core/src/weapon_effects.rs"]mod weapon_effects;
#[path="../../native/combat-core/src/weapon_effects_owner.rs"]mod weapon_effects_owner;
#[path="../../native/combat-core/src/effect_owner.rs"]mod effect_owner;
#[path="../../native/combat-core/src/ship_effects.rs"]mod ship_effects;
#[path="../../native/combat-core/src/system_world.rs"]mod system_world;
#[path="../../native/combat-core/src/system_owner.rs"]mod system_owner;
#[path="../../native/combat-core/src/engine.rs"]mod engine;
#[path="../../native/combat-core/src/lifecycle.rs"]mod lifecycle;
#[path="../../native/combat-core/src/motion.rs"]mod motion;
#[path="../../native/combat-core/src/random.rs"]mod random;
#[path="../../native/combat-core/src/shield.rs"]mod shield;
#[path="../../native/combat-core/src/ship_state.rs"]mod ship_state;
#[path="../../native/combat-core/src/state.rs"]mod state;
#[path="../../native/combat-core/src/explosion_effects.rs"]mod explosion_effects;
#[path="../../native/combat-core/src/world_damage.rs"]mod world_damage;
#[path="../../native/combat-core/src/terrain_world.rs"]mod terrain_world;
#[path="../../native/combat-core/src/terrain_owner.rs"]mod terrain_owner;
#[path="../../native/combat-core/src/world_owner.rs"]mod world_owner;
#[path="../../native/combat-core/src/world_wire.rs"]mod world_wire;
#[path="../../native/combat-core/src/weapon_world.rs"]mod weapon_world;
use std::{cell::RefCell,collections::BTreeMap};use state::{Body,Handle};use world_owner as w;use explosion_effects as e;use weapon_world as fx;
fn id(n:u32)->e::Identity{e::Identity{id:n as f64,generation:1}}
fn shot(serial:f64,source:u32,x:f64,y:f64,v:f64,damage:f64,kind:u32)->projectile::Projectile{let d=projectile::Delivery::new(&[0.0,10.0,0.0,kind as f64,2.0,2.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,1400.0,0.0]);let em=weapon_fire::Emission{kind:weapon_fire::EmissionKind::Projectile,id:serial/100.0,component_id:1,cycle_id:1.0,position:[x,y],velocity:[v,0.0],angle:0.0,barrel_offset:[0.0;2],base_damage:damage,source_damage_multiplier:1.0,damage,emp:13.0,range:1000.0,duration:1.0,target_ship:None,target_projectile:None,armed_while_fizzling:None,flight_time:None,source_velocity:[0.0;2],recoil_delta:[0.0;2]};let mut p=projectile::Projectile::new(serial,source,Handle{slot:source-1,generation:1},source-1,d,&em,v,[0.0,0.0,0.0,0.0,1.0,0.0,0.0,0.0],0.0);p.player=Some(source==1);p.delivery.visual=fx::Visual{hit_glow_radius:18.0,fringe:[200,130,90,255],..Default::default()};p}
fn blast()->e::Spec{e::Spec{radius:85.0,core:70.0,duration:0.1,minimum_fraction:0.0,collision:e::Collision::ShipsAndAsteroids}}
fn fixture(scene:u32)->(Vec<Body>,battle::Ordnance,w::Owned){let mut b=Vec::new();for i in 0..3u32{
    let mut s=ship_state::ShipState::new(&[if scene==1&&i==1{100.0}else{10000.0},0.0,1.0,1.0,1.0,0.0,1.0,0.0,0.0,0.0,2.0,1.0,0.0,1.0,0.0,0.0,0.0]);
    s.armor=Some(armor::Armor::new(&[9.0,7.0,10.0,10.0,27.0,-45.0,-35.0,10000.0,10000.0,1.0,1.0,0.85,1.0,1.0,0.0,0.0,0.0]));s.damage_policy=[1.23,1.13,1.19,1.17,1.09,100.0,1.0,1.0];
    let mut init=random::Random::new(0);s.components.push(component::Component::new(&[1.0,0.0,0.0,-20.0,0.0,1.0,1.0],&mut init));let size=if (scene==7||scene==8)&&i==1{0}else{1};
    let mut c=battle::CombatShip::new(&[if i==0{0.0}else{1.0},size as f64,30.0,4.0,1.0,(i==0)as u32 as f64]);c.bounds=vec![[-30.0,-20.0],[30.0,-20.0],[30.0,20.0],[-30.0,20.0]];c.attrs[1]=1.13;c.attrs[2]=1.11;c.graviton_multiplier=1.27;
    let mut meta=w::Meta::new(&[0.0,1.0,0.0,2.0,2.0,230.0,130.0,90.0,247.0,164.0,31.0,100.0,130.0,160.0,0.0,70.0,0.0,1.0],size,30.0,&c.bounds);meta.spec.id=format!("ship{}",i+1);meta.ship_name=format!("ship{}",i+1);meta.hull_name="fixture".into();meta.slot_positions=vec![(1,[-20.0,0.0])];meta.terrain=Some([100.0,0.0,0.0,0.0,0.0,0.0]);for j in 0..4{meta.strings[j]=format!("{}",i+1).encode_utf16().collect();}c.death=Some(meta);
    let mut sh=shield::Shield::new(&[2.0,360.0,42.0,0.83,0.0,1.0,1.0,0.5,0.5,2.0,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0]);sh.data[6]=(i==1&&[1,2,3,4,5,18,20].contains(&scene))as u32 as f64;sh.data[7]=360.0;sh.data[8]=0.0;sh.data[40]=1.19;sh.data[41]=1.07;sh.data[42]=1.13;
    if (scene==2||scene==20)&&i==1{sh.configure_void(&[1.0,30.0,0.0,0.4,1.0]);}s.shield=Some(sh);s.combat=Some(c);s.sync_shield();
    if scene==6&&i==1||scene==8&&i==1{for cell in &mut s.armor.as_mut().unwrap().cells{*cell=0.0;}}if scene==8&&i==1{s.armor.as_mut().unwrap().data[14]=12.0;}
    let mut pose=[0.0;motion::WIDTH];pose[0]=if i==0{-1000.0}else if i==1{100.0}else{if scene==9{160.0}else{240.0}};pose[1]=if i==2&&scene==9{30.0}else{0.0};pose[2]=i as f64*2.0;pose[3]=i as f64*-1.0;
    b.push(Body{id:i+1,handle:Handle{slot:i,generation:1},order:i as f64,motion:pose,ship:Some(s)});
}let mut world=w::Owned::new(id(1),if scene==8{id(99)}else{id(2)});world.install_terrain(&b,&BTreeMap::new()).unwrap();let mut ord=battle::Ordnance::new();
    let kind=match scene{3=>1,4=>2,5=>3,_=>0};let mut p=shot(1.0,1,0.0,0.0,2000.0,if scene==5{75.0}else if scene==17{470.0}else{220.0},kind);
    if scene==7||scene==8{p.delivery.pass_fighters=true;p.delivery.pass_fighters_destroyed=scene==8;}
    if scene==9{p.delivery.explosion=Some(blast());}if scene==10||scene==11{p.delivery.fuse=Some(e::Fuse{range:150.0,radius:90.0,core:None,source_explosion:if scene==11{Some(blast())}else{None}});}
    if [10,12,13].contains(&scene){let mut m=shot(2.0,2,40.0,0.0,0.0,10.0,0);m.emp=0.0;m.delivery.missile=true;m.armed=Some(true);m.hitpoints=Some(if scene==12{500.0}else{50.0});ord.projectiles.push(m);if scene==13{let mut m=shot(3.0,2,55.0,0.0,0.0,10.0,0);m.emp=0.0;m.delivery.missile=true;m.armed=Some(true);m.hitpoints=Some(60.0);ord.projectiles.push(m);p.delivery.pass_missiles=true;}}
    if scene==14{world.terrain.terrain.hulks.push(terrain_world::Hulk{id:1.0,source:id(1),size:Some(2),sprite_height:70.0,position:[40.0,0.0],velocity:[2.0,3.0],facing:0.0,angular:0.0,age:0.0,bounds:vec![[-8.0,-10.0],[8.0,-10.0],[8.0,10.0],[-8.0,10.0]],visual:None,offset:[0.0;2],radius:13.0,slots:Vec::new(),sequence:None,fixed:false,managed:false});p.delivery.terrain_penetration=Some([30.0,20.0,1.0]);}
    if scene==15{world.terrain.terrain.asteroids.push(terrain_world::Asteroid{id:id(1),position:[40.0,0.0],velocity:[2.0,3.0],facing:0.0,angular:0.0,radius:10.0,mass:100.0,hp:35.0,max_hp:35.0,sprite:0,fixed:false});p.delivery.terrain_penetration=Some([30.0,20.0,1.0]);}
    if scene==16{p.delivery.spawn_type=2;p.delivery.length=30.0;p.delivery.fade=0.15;p.delivery.visual.source_move_speed=true;}
    if scene==17{p.delivery.visual.custom=1;}
    if scene==25{p.delivery.is_mine=true;p.delivery.missile=true;p.flight=Some(0.01);}
    if scene==26{let mut m=shot(2.0,2,40.0,0.0,2000.0,10.0,0);m.delivery.is_mine=true;m.delivery.missile=true;m.hitpoints=Some(50.0);m.flight=Some(0.01);ord.projectiles.push(m);}
    if scene==27||scene==28{p.pos=[100.0,0.0];p.prev=p.pos;p.origin=p.pos;p.tail=p.pos;p.prev_tail=p.pos;p.velocity=[0.0;2];p.source_speed=0.0;p.range=0.0;p.delivery.missile=true;p.delivery.system_fuse=Some(if scene==27{0.3}else{0.1});p.delivery.system_fade_in=Some(0.2);p.delivery.system_explosion_sound=Some("missile_explosion".into());p.delivery.visual.missile=Some(fx::MissileVisual{radius:23.0,color:[90,150,220],hit_glow:true});p.delivery.explosion=Some(blast());p.collision_disabled=true;b[0].motion[0]=100.0;b[1].motion[0]=110.0;b[2].motion[0]=160.0;}
    if scene==29||scene==30{p.range=100.0;p.delivery.fizzle_at_range=scene==29;}
    if scene==31||scene==32{let mut row=[0.0;19];row[0]=1.0;row[2]=1.0;p.delivery.guidance=Some(missile_owner::Spec::new(&row));missile_owner::initialize(&mut p,1.0,&[]);if scene==31{p.delivery.missile=true;p.armed=Some(true);}else{p.flight=Some(0.05);}}
    ord.projectiles.push(p);ord.serial=3.0;
    if (18..=24).contains(&scene){ord.projectiles.clear();b[0].motion[0]=0.0;let source=b[0].ship.as_mut().unwrap();let mut controller=weapon::Controller::new(&[0.0,1.0,0.0,1.0]);let mut m=[0.0;weapon::MOUNT_WIDTH];m[0]=1.0;m[1]=2.0;m[2]=1.0;m[3]=(scene==22)as u32 as f64;m[23]=if scene==22{3.0}else{2.0};m[24]=if scene==22{0.08}else{1.0};m[26]=1.0;controller.mounts.push(weapon::Mount{data:m,initialized:true});source.weapons=Some(controller);
        let mut row=[0.0;22];row[6]=0.2;row[7]=0.3;row[16]=800.0;row[18]=13.0;let mut entry=battle::FireEntry::new(&row);entry.range=300.0;entry.delivery=Some(projectile::Delivery::new(&[0.0,0.0,0.0,0.0,2.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,1400.0,0.0]));source.combat.as_mut().unwrap().fire.push(entry);
        let em=weapon_fire::Emission{kind:weapon_fire::EmissionKind::BeamActive,id:0.01,component_id:1,cycle_id:1.0,position:[0.0;2],velocity:[0.0;2],angle:0.0,barrel_offset:[0.0;2],base_damage:800.0,source_damage_multiplier:1.0,damage:800.0,emp:13.0,range:300.0,duration:1.0,target_ship:None,target_projectile:None,armed_while_fizzling:None,flight_time:None,source_velocity:[0.0;2],recoil_delta:[0.0;2]};let mut beam=battle::Beam::new(1.0,1,b[0].handle,0,&em);beam.end=[300.0,0.0];beam.player=true;beam.player_known=true;beam.style.width=4.0;beam.damage_active=scene!=23;ord.beams.push(beam);
        if scene==21{let mut m=shot(2.0,2,40.0,0.0,0.0,10.0,0);m.delivery.missile=true;m.armed=Some(true);m.hitpoints=Some(50.0);ord.projectiles.push(m);}if scene==24{b[0].ship.as_mut().unwrap().flags|=ship_state::DEAD;}
    }(b,ord,world)
}
struct Fixture{input:Vec<f64>,output:Vec<f64>}thread_local!{static F:RefCell<Fixture>=RefCell::new(Fixture{input:Vec::new(),output:Vec::new()});}
#[no_mangle]pub extern "C" fn test_input(n:u32)->u32{F.with_borrow_mut(|f|{f.input.resize(n as usize,0.0);f.input.as_mut_ptr()as u32})}
#[no_mangle]pub extern "C" fn test_output_words()->u32{F.with_borrow(|f|f.output.len()as u32)}
#[no_mangle]pub extern "C" fn test_run()->u32{F.with_borrow_mut(|f|{let scene=f.input[0]as u32;let(mut b,mut ord,mut world)=fixture(scene);let(mut r,mut v)=(random::Random::new(8127),random::Random::new(15181));let specs=BTreeMap::new();let mut events=Vec::new();let ticks=if scene==16{4}else if (18..=24).contains(&scene){5}else{1};for _ in 0..ticks{if !(18..=24).contains(&scene){let mut h=w::Host{bodies:&mut b,specs:&specs,ordnance:&mut ord,owned:&mut world,events:&mut events};h.advance_explosions(0.1,&mut r,&mut v).unwrap();ord.advance_projectiles(&mut b,&specs,Some(&mut world),0.1,&mut r,&mut v,&mut events).unwrap();}else{ord.advance_beams(&mut b,&specs,Some(&mut world),0.1,&mut r,&mut v,&mut events).unwrap();}}
    let o=&mut f.output;o.clear();o.extend([r.cursor,v.cursor,v.ids as f64]);for body in &b{let s=body.ship.as_ref().unwrap();let sh=s.shield.as_ref().unwrap();let a=s.armor.as_ref().unwrap();o.extend([a.data[14],s.flux.hard,s.flux.soft,s.flux.overloaded as u32 as f64,s.flux.overload_timer,sh.active()as u32 as f64,sh.data[7],sh.data[28],(s.flags&ship_state::DEAD!=0)as u32 as f64]);o.extend(a.cells.iter().map(|c|*c as f64));o.extend(s.components[0].data);o.extend([sh.void.as_ref().map_or(0.0,|v|v.data[5]),sh.void.as_ref().map_or(0.0,|v|v.data[7]),sh.void.as_ref().map_or(0.0,|v|v.data[8]),sh.void.as_ref().map_or(0.0,|v|v.data[11])]);}
    o.extend(world.stats.player);o.extend(world.stats.enemy);o.push(ord.projectiles.len()as f64);for p in &ord.projectiles{o.extend([p.serial,p.pos[0],p.pos[1],p.prev[0],p.prev[1],p.damage,p.emp,p.base_damage,p.range,p.elapsed,p.fade,p.did_damage as u32 as f64,p.hp(),p.damaged_projectiles.len()as f64,p.damaged_ships.len()as f64,p.damaged_asteroids.len()as f64,p.damaged_hulks.len()as f64,p.void_hit_recorded as u32 as f64,p.system_fuse_triggered as u32 as f64,p.armed.map_or(-1.0,|a|a as u32 as f64)]);}
    if scene>=25{o.push(world.retired_projectiles.len()as f64);for p in &world.retired_projectiles{o.extend([p.serial,p.pos[0],p.pos[1],p.prev[0],p.prev[1],p.elapsed,p.range,p.flight.unwrap_or(-1.0),p.fade,p.did_damage as u32 as f64,p.system_fuse_triggered as u32 as f64,p.armed.map_or(-1.0,|a|a as u32 as f64)]);}}
    o.push(ord.beams.len()as f64);for beam in &ord.beams{o.extend([beam.start[0],beam.start[1],beam.end[0],beam.end[1],beam.elapsed,beam.duration,beam.damage,beam.emp,beam.brightness,beam.hitting as u32 as f64,beam.clock.elapsed.unwrap_or(0.0),beam.clock.integral,beam.clock.duration,beam.clock.multiplier,beam.visual.recorded as u32 as f64,beam.visual.was_shortened as u32 as f64,beam.visual.glow,beam.visual.size_mult,beam.visual.surface.map_or(0.0,|s|if s{1.0}else{2.0}),beam.visual.fx,beam.visual.sound]);}
    o.push(world.explosions.len()as f64);for x in &world.explosions{o.extend([x.position[0],x.position[1],x.life,x.ships.len()as f64,x.asteroids.len()as f64,x.missiles.len()as f64]);}
    o.push(world.terrain.terrain.asteroids.len()as f64);for a in &world.terrain.terrain.asteroids{o.extend([a.id.id,a.hp,a.position[0],a.position[1],a.velocity[0],a.velocity[1]]);}o.push(world.floating.len()as f64);for x in &world.floating{o.extend([x.id,x.position[0],x.position[1],x.velocity[0],x.velocity[1],x.text.parse::<f64>().unwrap_or(-1.0),x.size,x.life,x.maximum_life]);o.extend(x.color.map(|v|v as f64));}
    // Grouped output witness contains every actual armor/spark/debris/puff/glow,
    // not only factory counts. Root publication codec remains separately tested.
    let mut records=Vec::<Vec<f64>>::new();for x in &world.output{match x{
        w::Output::Death(world_damage::Output::ArmorParticles{particles,..})=>{let mut q=vec![0.0,particles.len()as f64];for p in particles{q.extend(p.position);q.extend(p.velocity);q.push(p.size);}records.push(q);},
        w::Output::Death(world_damage::Output::Debris(p))=>{let mut q=vec![1.0,0.0,p.len()as f64];for d in p{debris_words(&mut q,d);}records.push(q);},
        w::Output::Weapon(fx::Output::Debris{category,particles})=>{let mut q=vec![1.0,*category as f64,particles.len()as f64];for d in particles{debris_words(&mut q,d);}records.push(q);},
        w::Output::Sparks(p)=>{let mut q=vec![2.0,p.len()as f64];for p in p{q.extend(p.position);q.extend(p.velocity);q.extend([p.life,p.size,p.end_size]);q.extend(p.color);q.extend([p.peak_alpha,p.drag,p.rotation,p.stretch]);}records.push(q);},
        w::Output::Impact(p)=>{let mut q=vec![3.0,p.id,p.position[0],p.position[1],p.maximum_radius,p.duration,p.rotation,p.rings as u32 as f64,p.puffs.len()as f64];for a in &p.puffs{q.extend([a.texture as f64,a.start,a.end,a.rotation]);q.extend(a.offset);q.extend(a.velocity);}records.push(q);},
        w::Output::Weapon(fx::Output::Floating(x))=>records.push(vec![4.0,x.id,x.text.parse::<f64>().unwrap_or(-1.0)]),
        w::Output::Weapon(fx::Output::Sound{key,point,volume})=>records.push(vec![5.0,sound_id(key),point[0],point[1],*volume]),
        w::Output::Explosion(e::Output::Sound{point,sound})=>records.push(vec![5.0,match sound{e::Sound::Fuse=>4.0,e::Sound::Missile{..}=>5.0},point[0],point[1],match sound{e::Sound::Fuse=>0.6,e::Sound::Missile{volume}=>*volume}]),
        w::Output::Weapon(fx::Output::CameraShake{amount,duration})=>records.push(vec![6.0,*amount,*duration]),w::Output::Explosion(e::Output::CameraShake)=>records.push(vec![6.0,3.0,0.1]),
        w::Output::Explosion(e::Output::DetachContrail{target})=>records.push(vec![7.0,target.id]),
        w::Output::Weapon(fx::Output::HitGlows(p))=>{let mut q=vec![8.0,p.len()as f64];for p in p{q.extend([p.id,p.position[0],p.position[1],p.velocity[0],p.velocity[1],p.diameter,p.life,p.alpha]);q.extend(p.color.map(|v|v as f64));q.push(p.custom as f64);}records.push(q);},
        w::Output::Weapon(fx::Output::MovingRay(p))=>records.push(vec![9.0,p.id,p.head[0],p.head[1],p.tail[0],p.tail[1],p.speed,p.life,p.elapsed,p.length,p.width]),
        w::Output::Weapon(fx::Output::MissileExplosion(p))=>records.push(vec![10.0,p.id,p.position[0],p.position[1],p.radius,p.life,p.rotation,p.color[0]as f64,p.color[1]as f64,p.color[2]as f64]),_=>{}
    }}o.push(records.len()as f64);for q in records{o.push(q.len()as f64);o.extend(q);}o.as_ptr()as u32})}
fn debris_words(q:&mut Vec<f64>,d:&world_damage::Debris){q.extend(d.position);q.extend(d.velocity);q.extend([d.rotation,d.angular,d.size,d.life]);q.extend(d.color.map(|v|v as f64));q.extend([d.texture as f64,d.glowing as u32 as f64]);}
fn sound_id(s:&str)->f64{match s{"shield_hit"=>0.0,"armor_hit_light"=>1.0,"armor_hit_solid"=>2.0,"armor_hit_heavy"=>3.0,"flak_explosion"=>4.0,"missile_explosion"=>5.0,"beam_hit"=>6.0,_=>99.0}}

// Actual resident Ordnance.fire, including phase upsert and cycle reset. The
// source oracle extracts CombatEngine's real closure and real private firing.
#[no_mangle]pub extern "C" fn test_beam_refresh()->u32{F.with_borrow_mut(|f|{let mode=f.input[0]as u32;let(mut bodies,mut ord,_)=fixture(18);ord.beams.clear();ord.serial=0.0;let source=bodies[0].ship.as_mut().unwrap();let controller=source.weapons.as_mut().unwrap();controller.data[20]=1.0;let m=&mut controller.mounts[0].data;m[3]=1.0;m[4]=0.4;m[17]=f64::INFINITY;m[35]=1.0;m[23]=0.0;m[24]=0.0;m[26]=0.0;m[19]=0.0;let entry=&mut source.combat.as_mut().unwrap().fire[0];entry.spec.beam_duration=0.25;entry.spec.beam_chargeup=0.2;entry.spec.beam_chargedown=0.3;entry.input.recheck_flux_budget=false;
    let mut random=random::Random::new(8127);let specs=BTreeMap::new();let mut events=Vec::new();let o=&mut f.output;o.clear();
    for step in 0..5{if step==1{let b=&mut ord.beams[0];b.start=[5.0,6.0];b.end=[75.0,8.0];b.elapsed=0.12;b.clock=projectile::BeamClock{elapsed:Some(0.04),integral:0.012,duration:0.1,multiplier:0.7};b.visual=fx::BeamVisual{recorded:true,was_shortened:true,glow:0.8,size_mult:1.2,surface:Some(true),fx:0.02,sound:0.09};b.damage_active=mode==0;}
        let source=bodies[0].ship.as_mut().unwrap();let mount=&mut source.weapons.as_mut().unwrap().mounts[0].data;mount[19]=if step==1{0.21}else{0.0};if step==3{mount[16]=0.0;mount[23]=0.0;mount[24]=0.0;}let entry=&mut source.combat.as_mut().unwrap().fire[0];entry.input.requested=step==0||step==3;entry.input.trigger_held=true;entry.input.system_allows=step!=2;let start=events.len();ord.fire(&mut bodies,&specs,&mut random,&mut events).unwrap();let beam=&ord.beams[0];
        o.extend([random.cursor,ord.serial,ord.beams.len()as f64,beam.serial,beam.cycle,beam.start[0],beam.start[1],beam.end[0],beam.end[1],beam.elapsed,beam.duration,beam.damage,beam.base_damage,beam.emp,beam.base_emp,beam.clock.elapsed.is_some()as u32 as f64,beam.clock.elapsed.unwrap_or(0.0),beam.clock.integral,beam.clock.duration,beam.clock.multiplier,beam.visual.recorded as u32 as f64,beam.visual.was_shortened as u32 as f64,beam.visual.glow,beam.visual.size_mult,beam.visual.surface.map_or(0.0,|x|if x{1.0}else{2.0}),beam.visual.fx,beam.visual.sound,beam.damage_active as u32 as f64,events.iter().filter(|(_,_,e)|e.kind==battle::BEAM_SPAWNED).count()as f64,events.len()as f64-start as f64]);for(_,_,event)in &events[start..]{o.push(event.kind as f64);}
    }o.as_ptr()as u32})}
