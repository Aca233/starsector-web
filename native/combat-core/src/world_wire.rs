//! Read-only complete world publication. Tagged records preserve source order.
//! This codec is a presentation/witness boundary, not a recovery import.
use crate::{explosion_effects as e,terrain_world as t,world_damage as w,world_owner::{Owned,Output},
    weapon_effects as fx,weapon_effects_owner::Record,state::Body};
fn flag(b:bool)->f64{b as u32 as f64}
fn id(v:e::Identity)->[f64;2]{[v.id,v.generation as f64]}
fn optional(v:Option<e::Identity>)->[f64;3]{[flag(v.is_some()),v.map_or(0.0,|v|v.id),v.map_or(0,|v|v.generation)as f64]}
fn string(out:&mut Vec<f64>,s:&str){let s:Vec<_>=s.encode_utf16().collect();out.push(s.len()as f64);out.extend(s.into_iter().map(|v|v as f64));}
fn points(out:&mut Vec<f64>,v:&[[f64;2]]){out.push(v.len()as f64);out.extend(v.iter().flatten().copied());}
fn identities(out:&mut Vec<f64>,v:&[e::Identity]){out.push(v.len()as f64);for &v in v{out.extend(id(v));}}
fn collision(c:e::Collision)->[f64;2]{match c{e::Collision::ShipsAndAsteroids=>[0.0,0.0],e::Collision::MissileFF=>[1.0,0.0],e::Collision::MissileNoFF=>[2.0,0.0],
    e::Collision::ProjectileFF=>[3.0,0.0],e::Collision::ProjectileNoFF=>[4.0,0.0],e::Collision::Other{no_ff}=>[5.0,flag(no_ff)]}}
fn spec(out:&mut Vec<f64>,s:e::Spec){out.extend([s.radius,s.core,s.duration,s.minimum_fraction]);out.extend(collision(s.collision));}
fn delivery(out:&mut Vec<f64>,d:&crate::projectile::Delivery){out.extend([d.spawn_type as f64,d.length,d.fade,d.damage_type as f64,d.weapon_type as f64,d.radius,flag(d.arming.is_some()),d.arming.unwrap_or(0.0),d.angular,
    flag(d.flight.is_some()),d.flight.unwrap_or(0.0),flag(d.missile),d.flameout,d.missile_fade,flag(d.fizzle_range),flag(d.no_collision_fade),flag(d.reduce_damage_fade),flag(d.collision_after_none),d.beam_speed,flag(d.beam_hard)]);
    out.push(flag(d.explosion.is_some()));if let Some(s)=d.explosion{spec(out,s);}out.push(flag(d.fuse.is_some()));if let Some(f)=d.fuse{out.extend([f.range,f.radius,flag(f.core.is_some()),f.core.unwrap_or(0.0),flag(f.source_explosion.is_some())]);if let Some(s)=f.source_explosion{spec(out,s);}}
    out.extend([flag(d.intercepts),flag(d.pass_missiles),flag(d.pass_fighters),flag(d.pass_fighters_destroyed),flag(d.terrain_penetration.is_some())]);if let Some(p)=d.terrain_penetration{out.extend(p);}
    let v=&d.visual;out.extend([v.hit_glow_radius,v.width,v.texture as f64,v.scroll,v.pixels,flag(v.moving_speed.is_some()),v.moving_speed.unwrap_or(0.0),flag(v.source_move_speed)]);out.extend(v.fringe.map(|v|v as f64));out.extend(v.core.map(|v|v as f64));
    out.push(flag(v.missile.is_some()));if let Some(m)=&v.missile{out.push(m.radius);out.extend(m.color.map(|v|v as f64));out.push(flag(m.hit_glow));}out.extend([v.custom as f64,flag(v.heavy_torpedo)]);string(out,&v.fuse_sound);out.extend(v.fuse_color.map(|v|v as f64));out.extend([flag(d.hitpoints.is_some()),d.hitpoints.unwrap_or(0.0)]);
    out.extend([flag(d.is_mine),flag(d.fizzle_at_range),flag(d.system_fuse.is_some()),d.system_fuse.unwrap_or(0.0),flag(d.system_fade_in.is_some()),d.system_fade_in.unwrap_or(0.0),flag(d.system_explosion_sound.is_some())]);if let Some(s)=&d.system_explosion_sound{string(out,s);}}
fn payload(out:&mut Vec<f64>,p:&e::Payload){out.extend(id(p.identity));out.extend([p.source_ship as f64,flag(p.allegiance.team.is_some()),p.allegiance.team.unwrap_or(0)as f64,
    flag(p.allegiance.player.is_some()),flag(p.allegiance.player.unwrap_or(false)),p.damage,p.damage_type as f64,flag(p.soft_flux)]);
    out.extend(p.position);out.extend(p.previous);out.extend(p.velocity);out.extend([p.radius,p.range_remaining,flag(p.rocket),flag(p.flare),flag(p.did_damage),flag(p.moving_ray),flag(p.intercepts_missiles)]);
    out.extend(optional(p.target_projectile));out.push(flag(p.pass_through_missiles));out.extend(optional(p.void_blocked_root));identities(out,&p.damaged_projectiles);
    out.push(flag(p.source_binding.is_some()));if let Some(b)=&p.source_binding{out.extend([b.handle.slot as f64,b.handle.generation as f64,b.weapon_type as f64]);out.extend(b.origin);out.extend(b.outgoing);out.extend([b.flux,flag(b.captured)]);}}
fn puff(out:&mut Vec<f64>,p:&w::Puff){out.extend([p.texture as f64,p.start,p.end,p.rotation]);out.extend(p.offset);out.extend(p.velocity);}
fn flash(out:&mut Vec<f64>,p:&w::Flash){out.extend([p.diameter,flag(p.core.is_some()),p.core.unwrap_or(0.0)]);out.extend(p.color.map(|v|v as f64));out.push(p.duration);out.extend(p.velocity);}
fn flare(out:&mut Vec<f64>,p:Option<&w::Flare>){out.push(flag(p.is_some()));if let Some(p)=p{out.extend([p.width,p.height]);out.extend(p.color.map(|v|v as f64));out.extend(p.velocity);}}
fn debris(out:&mut Vec<f64>,p:&w::Debris){out.extend(p.position);out.extend(p.velocity);out.extend([p.rotation,p.angular,p.size,p.life]);out.extend(p.color.map(|v|v as f64));out.extend([p.texture as f64,flag(p.glowing)]);}
fn floating(out:&mut Vec<f64>,p:&crate::weapon_world::Floating){out.push(p.id);out.extend(p.position);out.extend(p.velocity);string(out,&p.text);out.extend(p.color.map(|v|v as f64));out.extend([p.size,p.life,p.maximum_life]);}
fn hulk(out:&mut Vec<f64>,h:&t::Hulk){out.push(h.id);out.extend(id(h.source));out.extend([flag(h.size.is_some()),h.size.unwrap_or(0)as f64,h.sprite_height]);out.extend(h.position);out.extend(h.velocity);
    out.extend([h.facing,h.angular,h.age]);out.extend(h.offset);out.extend([h.radius,flag(h.sequence.is_some()),h.sequence.unwrap_or(0)as f64,flag(h.fixed),flag(h.managed)]);
    points(out,&h.bounds);out.push(flag(h.visual.is_some()));if let Some(v)=&h.visual{points(out,v);}out.push(h.slots.len()as f64);for(slot,p)in &h.slots{out.push(*slot as f64);out.extend(p);}}
fn death_hulk(out:&mut Vec<f64>,h:&w::Hulk){out.push(h.id);out.extend(id(h.source));out.extend(h.position);out.extend(h.velocity);out.extend([h.facing,h.angular,h.radius]);points(out,&h.bounds);
    out.push(h.slots.len()as f64);out.extend(h.slots.iter().map(|v|*v as f64));out.push(flag(h.breakup.is_some()));if let Some(s)=&h.breakup{out.extend([s.remaining as f64,s.interval,s.elapsed,s.next_interval]);}}
fn record(out:&mut Vec<f64>,count:&mut usize,tag:u32,data:Vec<f64>){*count+=1;out.extend([tag as f64,data.len()as f64]);out.extend(data);}
fn death(event:&w::Output)->(u32,Vec<f64>){let mut out=Vec::new();let tag=match event{
    w::Output::ExplosionSound{source,position,volume}=>{out.extend(id(*source));out.extend(position);out.push(*volume);100},
    w::Output::LargeDisabledSound{source,position}=>{out.extend(id(*source));out.extend(position);101},
    w::Output::Explosion(x)=>{out.extend([x.id,x.diameter,x.duration]);string(&mut out,&x.source_spec);out.extend(x.position);out.extend(x.color.map(|v|v as f64));out.extend([x.puff_duration,x.puff_cursor]);out.extend(x.velocity);flash(&mut out,&x.flash);flare(&mut out,x.flare.as_ref());out.push(x.puffs.len()as f64);for p in &x.puffs{puff(&mut out,p);}102},
    w::Output::Radio{flagship}=>{out.push(flag(*flagship));103},w::Output::Floating{flagship,position}=>{out.push(flag(*flagship));out.extend(position);104},
    w::Output::Debris(p)=>{out.push(p.len()as f64);for p in p{debris(&mut out,p);}105},w::Output::CameraShake{amount,duration}=>{out.extend([*amount,*duration]);106},
    w::Output::Hulk(h)=>{death_hulk(&mut out,h);107},w::Output::ArmorParticles{source,local,damage,particles}=>{out.extend(id(*source));out.extend(local);out.extend([*damage,particles.len()as f64]);for p in particles{out.extend(p.position);out.extend(p.velocity);out.push(p.size);}108},};(tag,out)}
fn explosion(event:&e::Output)->(u32,Vec<f64>){let mut out=Vec::new();let tag=match event{
    e::Output::Damage{player,kind,layer,amount,emp,target_player}=>{out.extend([flag(*player),*kind as f64,match layer{e::Layer::Shield=>0.0,e::Layer::Armor=>1.0,e::Layer::Hull=>2.0},*amount,*emp,flag(target_player.is_some()),flag(target_player.unwrap_or(false))]);200},
    e::Output::FloatingDamage{point,amount,color}=>{out.extend(point);out.push(*amount);out.extend(color.map(|v|v as f64));201},e::Output::FloatingText{point,kind}=>{out.extend(point);out.push(*kind as f64);202},
    e::Output::Sound{point,sound}=>{out.extend(point);out.extend(match sound{e::Sound::Fuse=>[0.0,0.0],e::Sound::Missile{volume}=>[1.0,*volume]});203},
    e::Output::AuthenticExplosion{point,radius,color,missile}=>{out.extend(point);out.push(*radius);out.extend(color.map(|v|v as f64));out.push(flag(*missile));204},
    e::Output::SourceExplosion{point,spec:s}=>{out.extend(point);spec(&mut out,*s);205},e::Output::Sparks{point,count,color}=>{out.extend(point);out.push(*count as f64);out.extend(color.map(|v|v as f64));206},
    e::Output::Smoke(s)=>{out.extend(s.position);out.extend(s.velocity);out.extend([s.life,s.size,s.max_size,s.rotation]);207},
    e::Output::ArmorSparks{target,local,damage}=>{out.extend(id(*target));out.extend(local);out.push(*damage);208},e::Output::ShieldRipple{point}=>{out.extend(point);209},e::Output::CameraShake=>210,
    e::Output::Radio{kind,count}=>{out.extend([*kind as f64,*count as f64]);211},e::Output::ShotHit{player}=>{out.push(flag(*player));212},e::Output::MissileIntercepted{player}=>{out.push(flag(*player));213},
    e::Output::DetachContrail{target}=>{out.extend(id(*target));214},};(tag,out)}
fn terrain(event:&t::Output)->(u32,Vec<f64>){let mut out=Vec::new();let tag=match event{
    t::Output::Floating{point,amount,color}=>{out.extend(point);out.push(*amount);out.extend(color.map(|v|v as f64));300},t::Output::Ripple{point,radius,color}=>{out.extend(point);out.push(*radius);out.extend(color.map(|v|v as f64));301},
    t::Output::Sound{key,point,volume}=>{out.push(*key as f64);out.extend(point);out.push(*volume);302},t::Output::Shake{amount,duration}=>{out.extend([*amount,*duration]);303},t::Output::Text{point}=>{out.extend(point);304},t::Output::Detach{projectile}=>{out.push(*projectile);305},};(tag,out)}
fn effect(event:&Record)->(u32,Vec<f64>){let mut out=Vec::new();let tag=match event{
    Record::Notice{target,handle,notice}=>{out.extend([*target as f64,handle.slot as f64,handle.generation as f64,notice.system as f64,notice.kind as f64,notice.value]);out.extend(notice.detail);500},
    Record::ArmorSparks{target,local,armor}=>{out.push(*target as f64);out.extend(local);out.push(*armor);501},Record::EmpArc(a)=>{out.extend(a.from);out.extend(a.to);out.extend([a.target as f64,a.width]);out.extend(a.fringe.map(|v|v as f64));out.extend(a.core.map(|v|v as f64));502},
    Record::Sound{sound,point,volume,pitch}=>{out.extend(match sound{fx::Sound::Tachyon(v)=>[0.0,*v as f64],fx::Sound::MoteEmp=>[1.0,0.0],fx::Sound::MoteNormal=>[2.0,0.0],fx::Sound::MoteDamage=>[3.0,0.0]});out.extend(point);out.extend([*volume,*pitch]);503},
    Record::EnergyDamage{player,layer,damage,emp}=>{out.extend([flag(*player),match layer{fx::DamageLayer::Armor=>1.0,fx::DamageLayer::Hull=>2.0},*damage,*emp]);504},
    Record::Cosmetic(c)=>{out.push(crate::effect_owner::id(c.effect)as f64);out.extend(c.position);out.extend([c.radius,c.max_radius,c.life,c.rotation]);out.extend(c.color.map(|v|v as f64));out.extend([flag(c.shockwave),c.shockwave_radius,c.max_shockwave_radius,c.puff_duration]);
        out.push(flag(c.flare.is_some()));if let Some(f)=c.flare{out.extend([f.width,f.height]);out.extend(f.color.map(|v|v as f64));out.extend(f.velocity);}
        out.push(flag(c.flash.is_some()));if let Some(f)=c.flash{out.extend([f.diameter,f.core_diameter]);out.extend(f.color.map(|v|v as f64));out.push(f.duration);out.extend(f.velocity);}
        out.push(c.puffs.len()as f64);for p in &c.puffs{out.push(p.texture as f64);out.extend(p.offset);out.extend(p.velocity);out.extend([p.start_size,p.end_size,p.rotation]);}505},};(tag,out)}
fn weapon(event:&crate::weapon_world::Output)->(u32,Vec<f64>){use crate::weapon_world::Output as O;let mut out=Vec::new();let tag=match event{
    O::Sound{key,point,volume}=>{string(&mut out,key);out.extend(point);out.push(*volume);600},O::CameraShake{amount,duration}=>{out.extend([*amount,*duration]);601},
    O::HitGlows(p)=>{out.push(p.len()as f64);for p in p{out.push(p.id);out.extend(p.position);out.extend(p.velocity);out.extend([p.diameter,p.life,p.alpha]);out.extend(p.color.map(|v|v as f64));out.push(p.custom as f64);}602},
    O::MovingRay(p)=>{out.push(p.id);out.extend(p.head);out.extend(p.tail);out.extend(p.direction);out.extend([p.speed,p.life,p.elapsed,p.length,p.width,p.texture as f64,p.scroll,p.pixels]);out.extend(p.fringe.map(|v|v as f64));out.extend(p.core.map(|v|v as f64));603},
    O::MissileExplosion(p)=>{out.push(p.id);out.extend(p.position);out.extend([p.radius,p.life,p.rotation]);out.extend(p.color.map(|v|v as f64));604},
    O::Floating(p)=>{floating(&mut out,p);605},O::Debris{category,particles}=>{out.extend([*category as f64,particles.len()as f64]);for p in particles{debris(&mut out,p);}606}};(tag,out)}
pub fn words(world:&Owned,bodies:&[Body],ordnance:&crate::battle::Ordnance)->Vec<f64>{words_iter(world,bodies,ordnance)}
pub fn words_iter<'a>(world:&Owned,bodies:impl IntoIterator<Item=&'a Body>+Clone,ordnance:&crate::battle::Ordnance)->Vec<f64>{let mut out=vec![1.0,0.0];let mut count=0;
    let mut header=Vec::new();header.extend(id(world.player));header.extend(id(world.enemy));header.extend([flag(world.suppressed),world.time,world.terrain.terrain.next_sequence as f64]);record(&mut out,&mut count,0,header);
    let mut stats=world.stats.player.to_vec();stats.extend(world.stats.enemy);record(&mut out,&mut count,1,stats);
    for l in &world.losses.entries{let mut data=id(l.identity).to_vec();data.extend([l.team as f64,l.time]);string(&mut data,&l.ship_name);string(&mut data,&l.hull_name);record(&mut out,&mut count,2,data);}
    for x in &world.explosions{let mut data=Vec::new();payload(&mut data,&x.payload);spec(&mut data,x.spec);data.extend(x.position);data.push(x.life);data.push(x.screens.len()as f64);
        for s in &x.screens{data.extend(id(s.root));data.extend(s.center);data.extend([s.radius,flag(s.team.is_some()),s.team.unwrap_or(0)as f64,s.fraction]);}identities(&mut data,&x.ships);identities(&mut data,&x.asteroids);identities(&mut data,&x.missiles);record(&mut out,&mut count,3,data);}
    for m in &world.terrain.ships{let mut data=id(m.identity).to_vec();data.extend([m.handle.slot as f64,m.handle.generation as f64,m.mass,flag(m.station),m.sprite_height,m.terrain_speed,flag(m.emergency_phase_used),flag(m.fighter_recall)]);string(&mut data,&m.stable_id);
        data.push(flag(m.module.is_some()));if let Some(p)=&m.module{data.extend(id(p.parent));data.extend(p.offset);data.extend([p.angle,flag(p.independent)]);}identities(&mut data,&m.children);data.push(m.slots.len()as f64);for(slot,p)in &m.slots{data.push(*slot as f64);data.extend(p);}record(&mut out,&mut count,4,data);}
    let mut active=Vec::new();identities(&mut active,&world.terrain.active);record(&mut out,&mut count,5,active);
    for n in &world.terrain.terrain.nebulae{let mut data=vec![n.id as f64];string(&mut data,&n.sprite);data.extend(n.position);data.push(n.thickness);data.extend(n.atlas.map(|v|v as f64));record(&mut out,&mut count,6,data);}
    for a in &world.terrain.terrain.asteroids{let mut data=id(a.id).to_vec();data.extend(a.position);data.extend(a.velocity);data.extend([a.facing,a.angular,a.radius,a.mass,a.hp,a.max_hp,a.sprite as f64,flag(a.fixed)]);record(&mut out,&mut count,7,data);}
    for h in &world.terrain.terrain.hulks{let mut data=Vec::new();hulk(&mut data,h);record(&mut out,&mut count,8,data);}
    for(i,s)in &world.terrain.terrain.sequences{record(&mut out,&mut count,9,vec![*i as f64,s.remaining as f64,s.interval,s.elapsed,s.next]);}
    record(&mut out,&mut count,10,world.particles.clone());
    for f in &world.floating{let mut data=Vec::new();floating(&mut data,f);record(&mut out,&mut count,16,data);}
    if let Some(aux)=&world.aux{record(&mut out,&mut count,21,aux.words());}
    if let Some(g)=&world.gravity{record(&mut out,&mut count,17,crate::gravity_wire::header(g));
        for m in &g.owner.ships{for s in &m.systems{record(&mut out,&mut count,18,crate::gravity_wire::system(m.identity,s));}for mount in &m.mounts{record(&mut out,&mut count,19,crate::gravity_wire::mount(mount));}}
        for p in &g.owner.projectiles{record(&mut out,&mut count,20,crate::gravity_wire::projectile(p));}}
    for b in bodies.clone(){if let Some(m)=b.ship.as_ref().and_then(|s|s.combat.as_ref()).and_then(|c|c.death.as_ref()){
        let mut data=vec![b.id as f64,b.handle.slot as f64,b.handle.generation as f64,flag(m.transient),m.explosion_damage,m.explosion_radius,m.break_probability,m.sprite_height,m.missile_percent,m.missile_multiplier,
            flag(m.spec.size.is_some()),m.spec.size.unwrap_or(0)as f64,m.spec.radius,m.spec.min_pieces,m.spec.max_pieces];data.extend(m.spec.explosion_color.map(|v|v as f64));data.extend(m.spec.flash_color.map(|v|v as f64));data.extend(m.spec.debris_color.map(|v|v as f64));
        string(&mut data,&m.spec.id);string(&mut data,&m.ship_name);string(&mut data,&m.hull_name);string(&mut data,&String::from_utf16_lossy(&m.strings[3]));points(&mut data,&m.spec.bounds);
        data.push(m.slot_positions.len()as f64);for(slot,p)in &m.slot_positions{data.push(*slot as f64);data.extend(p);}data.push(flag(m.terrain.is_some()));if let Some(c)=m.terrain{data.extend(c);}record(&mut out,&mut count,12,data);}}
    for b in bodies{if let Some(c)=b.ship.as_ref().and_then(|s|s.combat.as_ref()){for(i,f)in c.fire.iter().enumerate(){if let Some(d)=&f.delivery{
        let mut data=vec![b.id as f64,b.handle.slot as f64,b.handle.generation as f64,i as f64,0.0];delivery(&mut data,d);record(&mut out,&mut count,13,data);
        if let Some(child)=d.guidance.as_ref().and_then(|g|g.child.as_ref()){let mut data=vec![b.id as f64,b.handle.slot as f64,b.handle.generation as f64,i as f64,1.0];delivery(&mut data,child);record(&mut out,&mut count,13,data);}}}}}
    for p in &ordnance.projectiles{let mut data=vec![p.serial,flag(p.hitpoints.is_some()),p.hitpoints.unwrap_or(0.0),flag(p.void_hit_recorded),flag(p.gravity_captured.is_some()),p.gravity_captured.map_or(0,|h|h.slot)as f64,p.gravity_captured.map_or(0,|h|h.generation)as f64];
        for ids in [&p.damaged_projectiles,&p.damaged_asteroids,&p.damaged_hulks]{data.push(ids.len()as f64);data.extend(ids);}identities(&mut data,&p.damaged_ships);data.extend(optional(p.void_blocked));data.push(flag(p.system_fuse_triggered));record(&mut out,&mut count,14,data);}
    for b in &ordnance.beams{let v=&b.visual;let mut data=vec![b.serial,flag(b.player_known),flag(b.player),b.base_damage,b.hit_radius,b.hit_brighten,flag(v.recorded),flag(v.was_shortened),v.glow,v.size_mult,flag(v.surface.is_some()),flag(v.surface.unwrap_or(false)),v.fx,v.sound,b.base_emp,b.style.width];
        data.extend(b.style.fringe.map(|v|v as f64));data.extend(b.style.core.map(|v|v as f64));record(&mut out,&mut count,15,data);}
    for event in &world.output{let(tag,data)=match event{Output::Death(e)=>death(e),Output::Explosion(e)=>explosion(e),Output::Terrain(e)=>terrain(e),Output::Effect(e)=>effect(e),Output::Weapon(e)=>weapon(e),
        Output::Sparks(p)=>{let mut data=vec![p.len()as f64];for p in p{data.extend(p.position);data.extend(p.velocity);data.extend([p.life,p.size,p.end_size]);data.extend(p.color);data.extend([p.peak_alpha,p.drag,p.rotation,p.stretch]);}(400,data)},
        Output::Impact(x)=>{let mut data=vec![x.id];data.extend(x.position);data.extend([x.radius,x.maximum_radius,x.duration,x.rotation]);data.extend(x.color.map(|v|v as f64));data.extend([flag(x.rings),x.shockwave,x.maximum_shockwave,x.puffs.len()as f64]);for p in &x.puffs{puff(&mut data,p);}(401,data)}};record(&mut out,&mut count,tag,data);}
    out[1]=count as f64;out}
