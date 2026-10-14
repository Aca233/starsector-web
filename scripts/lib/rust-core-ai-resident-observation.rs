// Included in actual ai_resident by the joint harness; pure diagnostic witness.
pub(crate) fn test_defense_words(o:&Owned,bodies:&[Body],ordnance:&Ordnance,specs:&BTreeMap<u32,Spec>,world:&crate::world_owner::Owned,observer:Identity)->Result<Vec<f64>,Error>{
    let active:Vec<_>=bodies.iter().map(|b|b.handle).collect();let c=Cache::build(o,bodies,ordnance,specs,world,&active)?;let r=row(bodies,observer)?;let b=&c.defense_bodies[r];let phase=b.shield_type==3;
    let window=1.0+if phase{b.phase_up_duration}else{0.0};let recovery=2.0+if phase{b.phase_down_duration+b.phase_cooldown_duration}else{b.shield_unfold_duration};let horizon=window.max(b.vent_time+recovery);
    let v=c.observation(o,a::Settings{multirate:false,compact_forecast_eligible:false,weapon_frame_eligible:false,tactical_interval:0.05,forecast_interval:0.05})?;
    let mut assessment=d::Assessment::default();d::assess_into(&v.defense,di(observer),horizon,window,horizon,false,&mut assessment,&mut d::Scratch::default())?;
    let mut out=vec![horizon,window,assessment.threats.len()as f64,b.shield_x,b.shield_y,b.radius,b.shield_radius,b.vx,b.vy];
    for t in assessment.threats{out.extend([match t.kind{d::Kind::Projectile=>0.0,d::Kind::Beam=>1.0,d::Kind::Weapon=>2.0},t.source.map_or(-1.0,|h|h.handle as f64-1.0),t.mount.map_or(-1.0,|v|v as f64),t.eta,t.damage,t.shield_flux,t.direction]);}
    out.push(c.projectiles.len()as f64);for p in &c.projectiles{out.extend([p.source.map_or(-1.0,|h|h.handle as f64-1.0),p.explicit_team.unwrap_or(f64::NAN),p.flags as f64,p.did_damage as u8 as f64,p.damage,p.remaining_life,p.x,p.y,p.vx,p.vy,p.radius,p.fuse]);}
    out.push(c.defense_weapons.len()as f64);for w in &c.defense_weapons{out.extend([w.owner.handle as f64-1.0,w.disabled as u8 as f64,w.ammo,w.dps,w.flags as f64,w.muzzle_x,w.muzzle_y,w.effective_range,w.max_speed,w.base_angle,w.angle,w.fixed as u8 as f64,w.authored_half_arc,w.turn_rate,w.readiness,w.burst_size,w.damage,w.beam_duration]);}
    Ok(out)
}
