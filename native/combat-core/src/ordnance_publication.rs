//! Real birth certificates and completed retained ordnance read publication.
//! No clocks, rules, random samples or JS callbacks execute while publishing.
use crate::{battle::Ordnance,contact::Point,state::{Body,Handle},world_owner};
pub const LIMIT:usize=250_000;
#[derive(Clone)]pub struct Hit{pub kind:u32,pub id:f64,pub generation:u32,pub numeric:f64}
#[derive(Clone)]pub struct Birth{
    /// 0 mounted, 1 MIRV child, 2 system resource, 3 native mine.
    pub kind:u32,pub owner:Handle,pub component:u32,pub system:u32,pub resource:Option<String>,pub weapon_type:u32,
    pub multiplier:f64,pub max_flight:Option<f64>,pub max_hp:Option<f64>,pub barrel:Option<Point>,pub begun:bool,pub impacted:bool,
    pub hits:Vec<Hit>,pub emp_resistance:Option<f64>,pub sprite_alpha:Option<f64>,pub intercepts:Option<bool>,
    pub inertial:Option<bool>,pub flare:bool,pub decoy:Option<bool>,pub mote:Option<[f64;3]>,
}
impl Birth{
    pub fn new(owner:Handle,component:u32,weapon_type:u32,multiplier:f64,max_flight:Option<f64>,barrel:Point)->Self{
        Self{kind:0,owner,component,system:0,resource:None,weapon_type,multiplier,max_flight,max_hp:None,barrel:Some(barrel),begun:false,impacted:false,hits:Vec::new(),
            emp_resistance:None,sprite_alpha:None,intercepts:None,inertial:None,flare:false,decoy:None,mote:None}
    }
    pub fn system(&mut self,system:u32,resource:String,slot_barrel:Option<Point>){self.kind=2;self.system=system;self.resource=Some(resource);self.barrel=slot_barrel;}
    pub fn mine(&mut self,weapon:u32){self.kind=3;self.system=weapon;self.barrel=None;}
    pub fn hit(&mut self,kind:u32,id:f64,generation:u32,numeric:f64)->Result<(),u32>{
        if kind>3||!id.is_finite()||!numeric.is_finite()||generation==0||self.hits.len()>=LIMIT||self.hits.iter().any(|h|h.kind==kind&&h.id==id&&h.generation==generation){return Err(8);}
        self.hits.push(Hit{kind,id,generation,numeric});Ok(())
    }
}
fn flag(v:bool)->f64{v as u32 as f64}
fn optional(o:&mut Vec<f64>,v:Option<f64>){o.extend([flag(v.is_some()),v.unwrap_or(0.0)]);}
fn string(o:&mut Vec<f64>,s:Option<&str>){o.push(flag(s.is_some()));if let Some(s)=s{let units=s.encode_utf16().collect::<Vec<_>>();o.push(units.len()as f64);o.extend(units.into_iter().map(|v|v as f64));}}
fn record(o:&mut Vec<f64>,tag:u32,v:Vec<f64>){o.extend([tag as f64,v.len()as f64]);o.extend(v);}
/// Numeric fullframe [version, records, (tag,length,data)...]. Tag1 certifies
/// projectile/beam/mine counts plus absence of authority prediction layers.
/// Caller binds this to the same completed scene/core publication barrier.
pub fn words(ord:&Ordnance,b:&[Body],w:&world_owner::Owned)->Result<Vec<f64>,u32>{
    let aux=w.aux.as_ref().ok_or(8u32)?;aux.validate(b,ord)?;
    if [ord.projectiles.len(),ord.beams.len(),aux.mines.len()].iter().any(|n|*n>LIMIT){return Err(7);}
    let mut o=vec![1.0,(1+ord.projectiles.len()+ord.beams.len()+aux.mines.len())as f64];
    record(&mut o,1,vec![ord.projectiles.len()as f64,ord.beams.len()as f64,aux.mines.len()as f64,0.0,0.0,0.0,0.0,0.0]);
    for p in &ord.projectiles{let a=&p.birth;
        if p.target_projectile.is_some()!=p.target_numeric.is_some()||p.target_numeric.is_some_and(|id|!id.is_finite())
            ||p.target_projectile.zip(p.target_numeric).is_some_and(|(serial,id)|ord.projectiles.iter().find(|q|q.serial==serial as f64).is_some_and(|q|q.id!=id)){return Err(8);}
        if a.owner.generation==0||!b.iter().any(|b|b.handle==a.owner)||a.kind>3||a.hits.len()>LIMIT||!a.multiplier.is_finite()
            ||a.max_flight.is_some_and(|v|!v.is_finite())||a.kind<2&&a.component==0||a.kind==2&&(a.system==0||a.resource.as_ref().is_none_or(String::is_empty))
            ||a.kind==3&&!matches!(a.system,1|2){return Err(8);}
        let mut expected=Vec::new();expected.extend(p.damaged_projectiles.iter().map(|&id|(0,id,1)));expected.extend(p.damaged_asteroids.iter().map(|&id|(1,id,1)));expected.extend(p.damaged_hulks.iter().map(|&id|(2,id,1)));expected.extend(p.damaged_ships.iter().map(|id|(3,id.id,id.generation)));
        if expected.len()!=a.hits.len()||expected.iter().any(|(kind,id,g)|!a.hits.iter().any(|h|h.kind==*kind&&h.id==*id&&h.generation==*g)){return Err(8);}
        let mut v=vec![p.serial,a.kind as f64,a.owner.slot as f64,a.owner.generation as f64,a.component as f64,a.system as f64,a.weapon_type as f64,
            flag(p.player.is_some()),flag(p.player.unwrap_or(false)),a.multiplier];
        optional(&mut v,a.max_flight);optional(&mut v,a.max_hp);v.push(flag(a.barrel.is_some()));if let Some(barrel)=a.barrel{v.extend(barrel);}
        v.extend([flag(a.begun),flag(a.impacted)]);string(&mut v,a.resource.as_deref());
        optional(&mut v,a.emp_resistance);optional(&mut v,a.sprite_alpha);optional(&mut v,a.intercepts.map(flag));optional(&mut v,a.inertial.map(flag));
        v.extend([flag(a.flare),flag(a.decoy.is_some()),flag(a.decoy.unwrap_or(false)),flag(a.mote.is_some())]);if let Some(mote)=a.mote{v.extend(mote);}
        v.extend([flag(p.delivery.intercepts),flag(p.delivery.is_mine),flag(p.delivery.fizzle_at_range)]);
        optional(&mut v,p.delivery.system_fuse);optional(&mut v,p.delivery.system_fade_in);string(&mut v,p.delivery.system_explosion_sound.as_deref());
        let g=p.guidance.as_ref();optional(&mut v,g.and_then(|g|g.flare_life));optional(&mut v,g.and_then(|g|g.flare_max_life));
        optional(&mut v,if a.kind==3{None}else{p.delivery.angular.ne(&0.0).then_some(p.delivery.angular)});
        v.push(a.hits.len()as f64);for h in &a.hits{v.extend([h.kind as f64,h.id,h.generation as f64,h.numeric]);}optional(&mut v,p.target_numeric);
        record(&mut o,2,v);
    }
    for beam in &ord.beams{let mut v=vec![beam.serial,beam.source_handle.slot as f64,beam.source_handle.generation as f64,beam.component as f64];
        // max_duration and scale are source values retained at each refresh.
        v.extend([beam.max_duration,flag(beam.scale_glow.is_some()),flag(beam.scale_glow.unwrap_or(false)),flag(beam.clock.elapsed.is_some()),flag(beam.visual.surface.is_some()),flag(beam.active_born),flag(beam.visual.glow_written),flag(beam.visual.recorded),flag(beam.visual.pulse_written),flag(beam.refreshed),flag(beam.reset_cycle),flag(beam.barrel_value),flag(beam.advanced),flag(beam.ray_value),flag(beam.sampled)]);record(&mut o,3,v);
    }
    for m in &aux.mines{let mut v=vec![m.serial,m.id,m.weapon as f64,m.source_handle.slot as f64,m.source_handle.generation as f64,flag(m.player.is_some()),flag(m.player.unwrap_or(false)),m.team as f64];
        v.extend(m.position);v.extend(m.velocity);v.extend([m.age,m.fade_in,m.rotation,flag(m.windup_played),m.timer,flag(m.detonating),m.trigger,m.visual_radius,m.damage,m.source_multiplier,m.life]);record(&mut o,4,v);
    }
    if o.len()>8_000_000||o.iter().any(|n|!n.is_finite()){return Err(7);}Ok(o)
}
