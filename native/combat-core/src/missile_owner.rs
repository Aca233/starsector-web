//! Resident ordnance bridge; observations are built at each reverse-loop item.
use crate::{missile_guidance as g,projectile::{Delivery,Projectile},state::{Body,Handle},contact,ship_state};
#[derive(Clone)]
pub struct Spec{pub rocket:bool,pub guided:bool,pub inertial:bool,pub acceleration:Option<f64>,pub speed:Option<f64>,pub turn_rate:Option<f64>,pub turn_accel:Option<f64>,
    pub hp:Option<f64>,pub bonus:Option<f64>,pub eccm:Option<f64>,pub indicator:Option<bool>,pub mirv:Option<g::Mirv>,pub child:Option<Box<Delivery>>,pub flare:Option<g::FlareSpec>,pub flare_life:Option<f64>}
impl Spec{
    pub fn new(r:&[f64])->Self{Self{rocket:r[0]==1.0,guided:r[1]==1.0,inertial:r[2]==1.0,hp:if r[3]==1.0{Some(r[4])}else{None},
        acceleration:if r[5]==1.0{Some(r[6])}else{None},speed:if r[7]==1.0{Some(r[8])}else{None},turn_rate:if r[9]==1.0{Some(r[10])}else{None},
        turn_accel:if r[11]==1.0{Some(r[12])}else{None},bonus:if r[13]==1.0{Some(r[14])}else{None},eccm:if r[15]==1.0{Some(r[16])}else{None},
        indicator:if r[17]==1.0{Some(r[18]==1.0)}else{None},mirv:None,child:None,flare:None,flare_life:None}}
    pub fn complete(&self)->bool{self.mirv.is_none()||self.child.is_some()}
}
pub fn identity(h:Handle)->g::Identity{g::Identity{handle:h.slot,generation:h.generation}}
pub fn projectile_identity(p:&Projectile)->g::Identity{g::Identity{handle:p.serial as u32,generation:1}}
pub fn observe_ship(b:&Body)->Option<g::Ship>{let s=b.ship.as_ref()?;let c=s.combat.as_ref()?;
    Some(g::Ship{identity:identity(b.handle),allegiance:g::Allegiance{team:Some(c.team),is_player:c.player},
        position:[b.motion[0],b.motion[1]],velocity:[b.motion[2],b.motion[3]],radius:c.radius,dead:s.flags&ship_state::DEAD!=0,
        phased:s.flags&(ship_state::DOCKED|ship_state::RETREATED)!=0||s.shield.as_ref().is_some_and(|sh|sh.kind()==3&&(sh.data[14]==1.0||sh.data[14]==2.0||sh.data[14]==3.0&&sh.data[15]>0.5)),
        retreated:s.flags&ship_state::RETREATED!=0,collisionless:c.collisionless(b),fighter:c.size==0,visible_to_source:true,
        shield_center:s.shield.as_ref().map_or([b.motion[0],b.motion[1]],|sh|contact::shield_center(sh,&b.motion)),shield_radius:s.shield.as_ref().map_or(0.0,|sh|sh.data[2]),
        shield_none:s.shield.as_ref().is_none_or(|sh|sh.kind()==0)})}
pub fn observe(p:&Projectile)->g::Missile{
    let mut state=p.guidance.clone().unwrap_or_default();state.identity=projectile_identity(p);state.id=p.id;state.source=identity(p.source_handle);
    state.allegiance=g::Allegiance{team:Some(p.team),is_player:p.player};state.position=p.pos;state.velocity=p.velocity;state.radius=p.delivery.radius;
    state.elapsed=p.elapsed;state.facing=Some(p.angle);state.flight_remaining=p.flight;state.damage=p.damage;state.base_damage=Some(p.base_damage);
    state.guided=p.guided;state.fade=p.fade;state.disarmed=p.disarmed;state.collision_disabled=p.collision_disabled;state.did_damage=p.did_damage;state
}
/// Borrowed only for one reverse-loop item. Previous contacts, captures, locks
/// and births are already in these resident entities; nothing survives the item.
pub struct Targets<'a>{pub bodies:&'a [Body],pub rows:&'a [usize],pub projectiles:&'a [Projectile]}
impl g::TargetWorld for Targets<'_>{
    fn ships(&self)->impl Iterator<Item=g::Ship>{self.rows.iter().filter_map(|&i|observe_ship(&self.bodies[i]))}
    fn projectiles(&self)->impl Iterator<Item=g::Missile>{self.projectiles.iter().map(observe)}
    fn ship(&self,id:g::Identity)->Option<g::Ship>{self.rows.iter().filter_map(|&i|{
        let b=&self.bodies[i];if identity(b.handle)==id{observe_ship(b)}else{None}
    }).next()}
    fn ship_any(&self,id:g::Identity)->Option<g::Ship>{self.ship(id).or_else(||self.bodies.iter().filter_map(|b|{
        if identity(b.handle)==id{observe_ship(b)}else{None}
    }).next())}
    fn projectile(&self,id:g::Identity)->Option<g::Missile>{self.projectiles.iter().find(|p|projectile_identity(p)==id).map(observe)}
}
pub fn initialize(p:&mut Projectile,multiplier:f64,targets:&[(u32,Handle)]){
    let Some(spec)=p.delivery.guidance.as_ref()else{return;};p.guided=spec.guided;
    let state=g::Missile{identity:projectile_identity(p),id:p.id,source:identity(p.source_handle),allegiance:g::Allegiance{team:Some(p.team),is_player:p.player},
        position:p.pos,velocity:p.velocity,radius:p.delivery.radius,elapsed:0.0,facing:Some(p.angle),turn_velocity:Some(0.0),guided:spec.guided,rocket:spec.rocket,
        render_target_indicator:spec.indicator,target_ship:p.target_ship.and_then(|id|targets.iter().find(|(n,h)|*n==id&&Some(*h)==p.target_handle).map(|(_,h)|identity(*h))),
        target_projectile:p.target_projectile.map(|id|g::Identity{handle:id,generation:1}),flight_remaining:p.flight,
        acceleration:spec.acceleration,max_speed:spec.speed,max_turn_rate:spec.turn_rate,max_turn_acceleration:spec.turn_accel,guidance_bonus:spec.bonus,eccm_chance:spec.eccm,
        hitpoints:spec.hp,damage:p.damage,base_damage:Some(p.base_damage),source_damage_multiplier:Some(multiplier),flare:spec.flare.is_some(),
        flare_life:spec.flare_life,flare_max_life:spec.flare_life,..g::Missile::default()};p.guidance=Some(state);
}
pub fn sync(p:&mut Projectile,state:g::Missile,bodies:&[Body],projectiles:&[Projectile]){
    p.pos=state.position;p.velocity=state.velocity;p.angle=state.facing.unwrap_or_else(||p.velocity[1].atan2(p.velocity[0]));p.guided=state.guided;p.fade=state.fade;
    p.target_ship=state.target_ship.and_then(|id|bodies.iter().find(|b|identity(b.handle)==id).map(|b|b.id));
    p.target_handle=state.target_ship.map(|h|Handle{slot:h.handle,generation:h.generation});
    let target=state.target_projectile.map(|id|id.handle);
    p.target_numeric=target.and_then(|id|if p.target_projectile==Some(id){p.target_numeric.or_else(||projectiles.iter().find(|q|projectile_identity(q).handle==id).map(|q|q.id))}else{projectiles.iter().find(|q|projectile_identity(q).handle==id).map(|q|q.id)});
    p.target_projectile=target;p.guidance=Some(state);
}
pub fn valid(p:&Projectile)->bool{
    if let Some(s)=&p.guidance{let numbers=[s.turn_velocity,s.hitpoints,s.split_distance,s.flare_life,s.source_damage_multiplier];
        if numbers.into_iter().flatten().any(|v|!v.is_finite()){return false;}}
    p.flare_state.as_ref().is_none_or(|f|f.wait.is_finite()&&f.spin.is_finite()&&(f.seek_after.is_finite()||f.seek_after==f64::INFINITY))
}
pub const WIDTH:usize=30;
pub fn words(p:&Projectile,immune_offset:usize)->[f64;WIDTH]{
    let s=p.guidance.as_ref().unwrap();let f=p.flare_state.as_ref();let mut r=[0.0;WIDTH];
    r[..14].copy_from_slice(&[p.serial,s.turn_velocity.unwrap_or(0.0),s.hitpoints.is_some()as u32 as f64,s.hitpoints.unwrap_or(0.0),s.stage_triggered as u32 as f64,
        s.split_distance.is_some()as u32 as f64,s.split_distance.unwrap_or(0.0),s.target_ship.is_some()as u32 as f64,s.target_ship.map_or(0,|h|h.handle)as f64,s.target_ship.map_or(0,|h|h.generation)as f64,
        s.target_projectile.is_some()as u32 as f64,s.target_projectile.map_or(0,|h|h.handle)as f64,s.flare as u32 as f64,s.flare_fizzling as u32 as f64]);
    r[14]=s.flare_life.unwrap_or(0.0);r[15]=f.is_some()as u32 as f64;r[25]=immune_offset as f64;
    if let Some(f)=f{r[16..26].copy_from_slice(&[f.wait,f.spin,f.seek_after,f.target.is_some()as u32 as f64,f.target.map_or(0,|h|h.handle)as f64,
        f.orbit_target.is_some()as u32 as f64,f.orbit_target.map_or(0,|h|h.handle)as f64,f.orbit_target.map_or(0,|h|h.generation)as f64,f.immune.len()as f64,immune_offset as f64]);}
    r[26]=s.source_damage_multiplier.unwrap_or(1.0);r[27]=s.rocket as u32 as f64;r[28]=p.player.is_some()as u32 as f64;r[29]=p.player.unwrap_or(false)as u32 as f64;r
}
pub fn child(parent:&Projectile,serial:f64,c:g::Child,mut d:Delivery)->Projectile{
    d.radius=c.radius;d.damage_type=c.damage_type;d.spawn_type=c.spawn_type;
    let emission=crate::weapon_fire::Emission{kind:crate::weapon_fire::EmissionKind::Projectile,id:c.id,component_id:parent.component,cycle_id:parent.cycle,
        position:c.position,velocity:c.velocity,angle:c.angle,barrel_offset:[0.0;2],base_damage:c.base_damage,source_damage_multiplier:c.source_damage_multiplier.unwrap_or(1.0),
        damage:c.damage,emp:c.emp,range:c.range,duration:0.0,target_ship:None,target_projectile:None,armed_while_fizzling:None,flight_time:None,source_velocity:c.inherited_velocity,recoil_delta:[0.0;2]};
    let mut p=Projectile::new(serial,parent.source,parent.source_handle,parent.team,d,&emission,c.launch_speed,parent.outgoing,parent.source_flux);
    p.player=parent.player;
    p.birth.kind=1;p.birth.owner=parent.birth.owner;p.birth.weapon_type=parent.birth.weapon_type;p.birth.multiplier=parent.birth.multiplier;p.birth.barrel=None;p.birth.max_hp=Some(c.hitpoints);
    p.guidance=Some(g::Missile{identity:projectile_identity(&p),source:identity(parent.source_handle),hitpoints:Some(c.hitpoints),source_damage_multiplier:c.source_damage_multiplier,..g::Missile::default()});p
}
