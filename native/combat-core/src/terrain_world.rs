//! Actual Web terrain and physical contact order. Host mutations are synchronous
//! resident Rust calls; no frozen damage batch or JavaScript solver callbacks.
use crate::{contact::{self,Point,Surface},explosion_effects as e,random::Random};
use std::{collections::BTreeMap,f64::consts::PI};
pub type Identity=e::Identity;
fn add(a:Point,b:Point)->Point{[a[0]+b[0],a[1]+b[1]]}fn sub(a:Point,b:Point)->Point{[a[0]-b[0],a[1]-b[1]]}
fn scale(a:Point,n:f64)->Point{[a[0]*n,a[1]*n]}fn add_scaled(a:Point,b:Point,n:f64)->Point{[a[0]+b[0]*n,a[1]+b[1]*n]}
fn dot(a:Point,b:Point)->f64{a[0]*b[0]+a[1]*b[1]}fn length(a:Point)->f64{contact::length(a)}
fn norm(a:Point)->Point{let n=length(a);if n>0.00001{[a[0]/n,a[1]/n]}else{a}}
fn hypot(a:Point)->f64{let m=a[0].abs().max(a[1].abs());if m==0.0{return 0.0;}let x=a[0].abs()/m;let y=a[1].abs()/m;(x*x+y*y).sqrt()*m}
fn unit(a:Point)->Point{let n=length(a);if n>1e-6{scale(a,1.0/n)}else{[1.0,0.0]}}
#[derive(Clone)]pub struct Shield{pub active:bool,pub kind:u32,pub center:Point,pub radius:f64,pub arc:f64,pub facing:f64,pub void:bool}
impl Shield{
    pub fn active(&self)->bool{self.active&&self.arc>5.0&&self.radius>0.0&&self.kind!=0&&self.kind!=3}
    pub fn covers(&self,p:Point)->bool{if !self.active(){return false;}let radial=sub(p,self.center);let mut d=radial[1].atan2(radial[0])-self.facing;
        while d>PI{d-=2.0*PI;}while d< -PI{d+=2.0*PI;}d.abs()<=self.arc*PI/360.0}
}
#[derive(Clone)]pub struct Ship{
    pub id:Identity,pub stable_id:String,pub root:Identity,pub team:Option<u32>,pub dead:bool,pub collisionless:bool,
    pub position:Point,pub velocity:Point,pub facing:f64,pub radius:f64,pub mass:f64,pub station:bool,
    pub bounds:Vec<Point>,pub shield:Shield,pub cr_taken:f64,pub system_shield:f64,
}
#[derive(Clone)]pub struct Asteroid{pub id:Identity,pub position:Point,pub velocity:Point,pub facing:f64,pub angular:f64,
    pub radius:f64,pub mass:f64,pub hp:f64,pub max_hp:f64,pub sprite:u32,pub fixed:bool}
#[derive(Clone)]pub struct Projectile{pub id:f64,pub previous:Point,pub position:Point,pub radius:f64,pub damage:f64,pub rocket:bool,pub damaged_asteroids:Vec<f64>,pub damaged_hulks:Vec<f64>}
#[derive(Clone,Copy)]pub struct Contact{pub point:Point,pub normal:Point,pub penetration:f64}
#[derive(Clone,Copy)]pub struct PairContact{pub point:Point,pub normal:Point,pub penetration:f64,pub first:Surface,pub second:Surface}
#[derive(Clone,Copy)]struct Extent{distance:f64,point:Point,surface:Surface}
fn hull_extent(s:&Ship,d:Point)->Extent{
    let d=unit(d);let local=contact::rotate(d,-s.facing);let distance=if s.bounds.len()<3{s.radius.max(0.0)}else{s.bounds.iter().fold(f64::NEG_INFINITY,|v,p|v.max(dot(*p,local))).max(0.0)};
    Extent{distance,point:add_scaled(s.position,d,distance),surface:Surface::Hull}
}
fn shield_extent(s:&Ship,d:Point)->Option<Extent>{if !s.shield.active(){return None;}let d=unit(d);let p=add_scaled(s.shield.center,d,s.shield.radius);
    if !s.shield.covers(p){return None;}let distance=dot(sub(s.shield.center,s.position),d)+s.shield.radius;
    if distance<0.0{None}else{Some(Extent{distance,point:p,surface:Surface::Shield})}}
pub fn shield_circle(s:&Ship,p:Point,r:f64)->Option<Contact>{if !s.shield.active(){return None;}
    let radial=sub(p,s.shield.center);let distance=length(radial);let penetration=s.shield.radius+r.max(0.0)-distance;if penetration<=0.0{return None;}
    let normal=if distance>1e-6{scale(radial,1.0/distance)}else{[s.shield.facing.cos(),s.shield.facing.sin()]};
    let point=add_scaled(s.shield.center,normal,s.shield.radius);if !s.shield.covers(point){return None;}Some(Contact{point,normal,penetration})}
pub fn hull_circle(s:&Ship,p:Point,r:f64)->Option<Contact>{let r=r.max(0.0);
    if s.bounds.len()<3{let radial=sub(p,s.position);let distance=length(radial);let radius=s.radius.max(0.0);let penetration=radius+r-distance;
        if penetration<=1e-7*1.0f64.max(radius).max(r).max(distance){return None;}let normal=if distance>1e-12{scale(radial,1.0/distance)}else{[1.0,0.0]};return Some(Contact{point:add_scaled(s.position,normal,radius),normal,penetration});}
    let local=contact::rotate(sub(p,s.position),-s.facing);let mut inside=false;let mut area=0.0;let mut closest=[0.0;2];let mut edge=[0.0;2];let mut squared=f64::INFINITY;
    for i in 0..s.bounds.len(){let a=s.bounds[i];let b=s.bounds[(i+1)%s.bounds.len()];let d=sub(b,a);area+=a[0]*b[1]-b[0]*a[1];
        if (a[1]>local[1])!=(b[1]>local[1])&&local[0]<a[0]+(local[1]-a[1])*d[0]/d[1]{inside=!inside;}
        let len=dot(d,d);if len<=1e-12{continue;}let t=(dot(sub(local,a),d)/len).clamp(0.0,1.0);let q=add_scaled(a,d,t);let off=sub(local,q);let distance=off[0].powi(2)+off[1].powi(2);
        if distance<squared{squared=distance;closest=q;edge=d;}}
    if !squared.is_finite(){return None;}let distance=squared.sqrt();let penetration=if inside{r+distance}else{r-distance};
    if penetration<=1e-7*1.0f64.max(r).max(local[0].abs()).max(local[1].abs()){return None;}
    let normal=if distance>1e-12{scale(sub(local,closest),if inside{-1.0/distance}else{1.0/distance})}else{scale([edge[1],-edge[0]],if area>=0.0{1.0}else{-1.0}/hypot(edge))};
    Some(Contact{point:add(contact::rotate(closest,s.facing),s.position),normal:contact::rotate(normal,s.facing),penetration})
}
fn shield_pair(a:&Ship,b:&Ship)->Option<PairContact>{if !a.shield.active()||!b.shield.active(){return None;}
    let delta=sub(b.shield.center,a.shield.center);let d=length(delta);let penetration=a.shield.radius+b.shield.radius-d;if penetration<=0.0{return None;}
    let normal=if d>1e-6{scale(delta,1.0/d)}else{let diff=sub(b.position,a.position);unit(if length(diff)>1e-6{diff}else{[a.facing.cos(),a.facing.sin()]})};
    let pa=add_scaled(a.shield.center,normal,a.shield.radius);let pb=add_scaled(b.shield.center,normal,-b.shield.radius);
    let mut point=None;if a.shield.covers(pa)&&b.shield.covers(pb){point=Some(scale(add(pa,pb),0.5));}
    else if d>1e-6&&d>=(a.shield.radius-b.shield.radius).abs()-1e-6{
        let along=(a.shield.radius*a.shield.radius-b.shield.radius*b.shield.radius+d*d)/(2.0*d);let squared=a.shield.radius*a.shield.radius-along*along;
        if squared>= -1e-6{let base=add_scaled(a.shield.center,normal,along);let tangent=[-normal[1],normal[0]];let height=squared.max(0.0).sqrt();
            let mut candidates=if height<=1e-6{vec![base]}else{vec![add_scaled(base,tangent,height),add_scaled(base,tangent,-height)]};
            candidates.retain(|p|a.shield.covers(*p)&&b.shield.covers(*p));candidates.sort_by(|a,b|a[0].total_cmp(&b[0]).then(a[1].total_cmp(&b[1])));point=candidates.first().copied();}}
    point.map(|point|PairContact{point,normal,penetration,first:Surface::Shield,second:Surface::Shield})
}
pub fn pair_contact(a:&Ship,b:&Ship)->Option<PairContact>{
    let same=a.team.is_some()&&a.team==b.team;let pass_a=a.shield.void&&same;let pass_b=b.shield.void&&same;
    if !pass_a&&!pass_b{if let Some(contact)=shield_pair(a,b){return Some(contact);}}
    let d=sub(b.position,a.position);let distance=length(d);let normal=if distance>1e-12{scale(d,1.0/distance)}else{[if a.stable_id<b.stable_id{1.0}else{-1.0},0.0]};
    let ah=hull_extent(a,normal);let bh=hull_extent(b,scale(normal,-1.0));let mut candidates=vec![(ah,bh)];
    if !pass_a{if let Some(sh)=shield_extent(a,normal){candidates.push((sh,bh));}}
    if !pass_b{if let Some(sh)=shield_extent(b,scale(normal,-1.0)){candidates.push((ah,sh));}}
    let mut best:Option<PairContact>=None;for (x,y)in candidates{let penetration=x.distance+y.distance-distance;if penetration<=0.0||best.is_some_and(|c|penetration<=c.penetration){continue;}
        best=Some(PairContact{point:scale(add(x.point,y.point),0.5),normal,penetration,first:x.surface,second:y.surface});}best
}
#[derive(Clone,Copy)]pub struct Damage{pub armor:f64,pub hull:f64}
#[derive(Clone,Copy)]pub struct Absorption{pub flux:f64,pub absorbed:f64,pub remainder:f64}
#[derive(Clone)]pub enum Output{
    Floating{point:Point,amount:f64,color:[u8;3]},Ripple{point:Point,radius:f64,color:[u8;3]},
    Sound{key:u32,point:Point,volume:f64},Shake{amount:f64,duration:f64},Text{point:Point},Detach{projectile:f64},
}
pub trait Host{
    fn ships(&self)->Vec<Identity>;fn ship(&self,id:Identity)->Option<Ship>;
    fn ship_near_circle(&self,id:Identity,_position:Point,_radius:f64)->Result<Option<Ship>,u32>{self.ship(id).ok_or(4u32).map(Some)}
    fn move_root(&mut self,id:Identity,position_delta:Point,velocity_delta:Point)->Result<(),u32>;
    fn sync_modules(&mut self,id:Identity)->Result<(),u32>;
    fn terrain_speed(&mut self,id:Identity,value:f64)->Result<(),u32>;
    fn shield_contact(&mut self,id:Identity,damage:f64)->Result<(),u32>;
    fn shield_absorb(&mut self,id:Identity,damage:f64,kind:u32,angle:f64)->Result<Absorption,u32>;
    fn shield_flux(&mut self,id:Identity,flux:f64)->Result<(),u32>;
    fn armor(&mut self,id:Identity,local:Point,damage:f64,kind:u32,strength:f64,visual:&mut Random)->Result<Damage,u32>;
    fn components(&mut self,id:Identity,local:Point,damage:Damage,source:Option<Identity>,random:&mut Random)->Result<(),u32>;
    fn armor_sparks(&mut self,id:Identity,local:Point,damage:f64,visual:&mut Random)->Result<(),u32>;
    fn hull(&mut self,id:Identity,damage:f64)->Result<(),u32>;
    fn debris(&mut self,point:Point,count:u32,color:[u8;3],speed:f64,visual:&mut Random)->Result<(),u32>;
    fn sparks(&mut self,point:Point,count:u32,color:[u8;3],visual:&mut Random)->Result<(),u32>;
    fn explosion_visual(&mut self,point:Point,radius:f64,color:[u8;3],visual:&mut Random)->Result<(),u32>;
    fn output(&mut self,event:Output);
    fn visual_output(&mut self,event:Output,_visual:&mut Random)->Result<(),u32>{self.output(event);Ok(())}
    /// Actual source grid/decals: clear all if initial then clear seam and sync.
    fn split_armor(&mut self,id:Identity,initial:bool,seam:&[Point],visual:&mut Random)->Result<(),u32>;
    fn cool_hulk_source(&mut self,id:Identity,dt:f64,facing:f64,visual:&mut Random)->Result<(),u32>;
}
/// The owner resolves the resident projectile and runs its REAL Rust impact
/// services, including registered effect hooks and immediate chain explosions.
/// Deferred action records or a JavaScript implementation are invalid here.
pub trait EnvironmentHost:Host{
    fn environment_impact(&mut self,projectile:f64,point:Point,velocity:Point,asteroid:Option<f64>,random:&mut Random,visual:&mut Random)->Result<(),u32>;
}
#[derive(Clone)]pub struct NebulaDefinition{pub sprite:String,pub position:Point,pub opacity:f64}
#[derive(Clone)]pub struct NebulaCloud{pub id:u32,pub sprite:String,pub position:Point,pub thickness:f64,pub atlas:[u32;2]}
#[derive(Clone)]pub struct Spark{pub position:Point,pub velocity:Point,pub life:f64,pub size:f64,pub end_size:f64,pub color:[f64;3],pub peak_alpha:f64,pub drag:f64,pub rotation:f64,pub stretch:f64}
/// CombatFXSystem NORMAL budget, including source particles and resident recipes.
pub fn spark_count(requested:u32,occupied:u32)->u32{if requested==0||occupied>=720{return 0;}let load=occupied as f64/720.0;
    let density=if load<0.55{1.0}else if load<0.75{0.78}else if load<0.9{0.5}else{0.25};
    requested.min(720-occupied).min(1u32.max((requested as f64*density).floor()as u32))}
pub fn spark_particles(point:Point,count:u32,color:[u8;3],visual:&mut Random)->Vec<Spark>{let mut particles=Vec::with_capacity(count as usize);
    for _ in 0..count{let angle=visual.next()*PI*2.0;let speed=70.0+visual.next()*230.0;let life=0.22+visual.next()*0.34;let size=1.5+visual.next()*2.8;
        let end_size=size*(0.35+visual.next()*0.25);let amount=0.12+visual.next()*0.28;let c=color.map(|c|c as f64+(255.0-c as f64)*amount);
        let peak_alpha=0.72+visual.next()*0.28;let drag=0.8+visual.next()*1.5;let stretch=1.4+visual.next()*1.8;
        particles.push(Spark{position:point,velocity:[angle.cos()*speed,angle.sin()*speed],life,size,end_size,color:c,peak_alpha,drag,rotation:angle,stretch});}particles}
#[derive(Clone)]pub struct ImpactExplosion{pub id:f64,pub position:Point,pub radius:f64,pub maximum_radius:f64,pub duration:f64,pub rotation:f64,pub color:[u8;3],pub rings:bool,pub shockwave:f64,pub maximum_shockwave:f64,pub puffs:Vec<crate::world_damage::Puff>}
pub fn impact_explosion(point:Point,radius:f64,color:[u8;3],rings:bool,duration:f64,velocity:Point,visual:&mut Random)->Option<ImpactExplosion>{
    if radius<=0.0||duration<=0.0{return None;}let id=visual.next();let rotation=visual.next()*PI*2.0;
    let puffs=crate::world_damage::explosion_puffs(radius*2.0,visual,rings,velocity);
    Some(ImpactExplosion{id,position:point,radius:radius*0.4,maximum_radius:radius,duration,rotation,color,rings,shockwave:6.0,maximum_shockwave:radius*1.6,puffs})}
pub fn nebula<H:Host>(host:&mut H)->Result<(),u32>{for id in host.ships(){host.terrain_speed(id,1.0)?;}Ok(())}
pub fn ship_collision<H:Host>(first:Identity,second:Identity,host:&mut H,random:&mut Random,visual:&mut Random)->Result<bool,u32>{
    let a=host.ship(first).ok_or(4u32)?;let b=host.ship(second).ok_or(4u32)?;
    if a.root==b.root||a.dead||b.dead||a.collisionless||b.collisionless{return Ok(false);}let Some(hit)=pair_contact(&a,&b)else{return Ok(false);};
    let ra=host.ship(a.root).ok_or(4u32)?;let rb=host.ship(b.root).ok_or(4u32)?;let ma=ra.mass.max(1.0);let mb=rb.mass.max(1.0);
    let share_a=if ra.station{0.0}else if rb.station{1.0}else{mb/(ma+mb)};let share_b=if rb.station{0.0}else if ra.station{1.0}else{ma/(ma+mb)};
    host.move_root(a.root,scale(hit.normal,-hit.penetration*share_a),[0.0;2])?;host.move_root(b.root,scale(hit.normal,hit.penetration*share_b),[0.0;2])?;
    host.sync_modules(a.root)?;host.sync_modules(b.root)?;
    let a=host.ship(first).ok_or(4u32)?;let b=host.ship(second).ok_or(4u32)?;let speed=dot(sub(a.velocity,b.velocity),hit.normal);
    if speed<=20.0{return Ok(true);}host.output(Output::Sound{key:0,point:a.position,volume:0.85});
    host.move_root(a.root,[0.0;2],scale(hit.normal,-speed*0.8*share_a))?;host.move_root(b.root,[0.0;2],scale(hit.normal,speed*0.8*share_b))?;
    let mut result=[[0.0;3];2];
    for (index,(id,source,surface,share))in [(first,second,hit.first,share_a),(second,first,hit.second,share_b)].into_iter().enumerate(){
        let s=host.ship(id).ok_or(4u32)?;let mut raw=speed*8.0*2.0*share;
        if surface==Surface::Shield{let radial=sub(hit.point,s.shield.center);let absorption=host.shield_absorb(id,raw*s.system_shield*s.cr_taken,1,radial[1].atan2(radial[0]))?;
            host.shield_flux(id,absorption.flux)?;result[index][0]=absorption.absorbed;raw*=absorption.remainder;}
        if raw>0.0{let s=host.ship(id).ok_or(4u32)?;let local=contact::rotate(sub(hit.point,s.position),-s.facing);let damage=host.armor(id,local,raw*s.cr_taken,1,raw,visual)?;
            host.components(id,local,damage,Some(source),random)?;host.armor_sparks(id,local,damage.armor,visual)?;host.hull(id,damage.hull)?;result[index][1]=damage.armor;result[index][2]=damage.hull;}
    }
    for (i,surface)in [hit.first,hit.second].into_iter().enumerate(){let point=add(hit.point,if i==0{[-25.0,-25.0]}else{[25.0,25.0]});
        if surface==Surface::Shield||result[i][1]>0.0{host.visual_output(Output::Floating{point,amount:if surface==Surface::Shield{result[i][0]}else{result[i][1]},color:if surface==Surface::Shield{[80,200,255]}else{[255,175,40]}},visual)?;}
        if surface!=Surface::Shield&&result[i][2]>0.0{host.visual_output(Output::Floating{point,amount:result[i][2],color:[255,55,45]},visual)?;}}
    host.debris(hit.point,16,[130,115,100],120.0,visual)?;host.output(Output::Shake{amount:30.0f64.min(speed*0.25),duration:0.35});Ok(true)
}
fn sample(channel:&str,index:usize)->f64{
    // JS index product is binary64 then bitwise ToUint32, not u32 wrapping.
    let product=((index as f64*0x9e3779b9u32 as f64)%4294967296.0)as u32;
    let mut h=2166136261u32^0xa57e01d^product;for c in channel.encode_utf16(){h^=c as u32;h=h.wrapping_mul(16777619);}
    h^=h>>16;h=h.wrapping_mul(0x7feb352d);h^=h>>15;h=h.wrapping_mul(0x846ca68b);h^=h>>16;h as f64/4294967296.0
}
#[derive(Clone,Default)]pub struct Terrain{pub nebulae:Vec<NebulaCloud>,pub asteroids:Vec<Asteroid>,pub hulks:Vec<Hulk>,pub sequences:BTreeMap<u32,Sequence>,pub next_sequence:u32}
impl Terrain{
    pub fn initialize_nebulae(&mut self,definitions:&[NebulaDefinition]){self.nebulae=definitions.iter().enumerate().map(|(id,d)|NebulaCloud{id:id as u32,sprite:d.sprite.clone(),position:d.position,thickness:d.opacity,atlas:[0,0]}).collect();}
    /// Death already consumed the creation RNG. Slot order and every optional
    /// position are resolved once from resident source metadata by the owner.
    pub fn admit_hulk(&mut self,h:crate::world_damage::Hulk,size:Option<u32>,sprite_height:f64,slot_positions:&[(u32,Point)])->Result<(),u32>{
        let sequence=if let Some(s)=h.breakup{self.next_sequence=self.next_sequence.checked_add(1).ok_or(7u32)?;let id=self.next_sequence;
            if self.sequences.contains_key(&id){return Err(8);}self.sequences.insert(id,Sequence{remaining:s.remaining as i32,interval:s.interval,elapsed:s.elapsed,next:s.next_interval});Some(id)}else{None};
        let slots=h.slots.iter().filter_map(|id|slot_positions.iter().find(|(slot,_)|slot==id).copied()).collect();
        self.hulks.push(Hulk{id:h.id,source:h.source,size,sprite_height,position:h.position,velocity:h.velocity,facing:h.facing,angular:h.angular,
            age:0.0,bounds:h.bounds,visual:None,offset:[0.0;2],radius:h.radius,slots,sequence,fixed:false,managed:false});Ok(())
    }
    pub fn initialize_asteroids(&mut self){self.asteroids.clear();let outer:Vec<_>=(0..64).filter(|i|!matches!(i%8,3|4)||!matches!(i/8,3|4)).collect();
        for i in 0..18+outer.len(){let mut x=(sample("asteroid-x",i)-0.5)*3200.0;let mut y=(sample("asteroid-y",i)-0.5)*2200.0;
            if i>=18{let cell=outer[i-18];x= -6000.0+(cell as f64%8.0+0.15+sample("asteroid-field-x",cell)*0.7)*1500.0;y= -6000.0+((cell/8)as f64+0.15+sample("asteroid-field-y",cell)*0.7)*1500.0;}
            if x.abs()<400.0&&y.abs()<300.0{x+=if x>=0.0{450.0}else{-450.0};}
            let big=i%5==0;let medium=i%2==0&&!big;let r=sample("asteroid-radius",i);let radius=if big{50.0+r*22.0}else if medium{30.0+r*14.0}else{18.0+r*10.0};
            let hp=if big{1600.0}else if medium{750.0}else{350.0};let speed=15.0+sample("asteroid-speed",i)*28.0;let angle=sample("asteroid-drift-angle",i)*PI*2.0;
            self.asteroids.push(Asteroid{id:Identity{id:(i+1)as f64,generation:1},position:[x,y],velocity:[angle.cos()*speed,angle.sin()*speed],facing:sample("asteroid-facing",i)*PI*2.0,
                angular:(sample("asteroid-angular-velocity",i)*2.0-1.0)*0.175,radius,mass:radius*radius*0.75,hp,max_hp:hp,sprite:if big{4}else{(i%4)as u32},fixed:false});}}
    pub fn advance_asteroids(&mut self,dt:f64){for a in self.asteroids.iter_mut().rev(){if a.fixed{continue;}a.position=add_scaled(a.position,a.velocity,dt);a.facing+=a.angular*dt;
        for v in &mut a.position{if *v>6500.0||*v< -6500.0{*v=(((*v+6500.0)%13000.0+13000.0)%13000.0)-6500.0;}}}}
    pub fn shatter<H:Host>(&mut self,index:usize,host:&mut H,random:&mut Random,visual:&mut Random)->Result<(),u32>{let Some(a)=self.asteroids.get(index).cloned()else{return Ok(());};
        host.output(Output::Sound{key:2,point:a.position,volume:0.75});host.explosion_visual(a.position,a.radius*1.5,[255,160,60],visual)?;
        host.debris(a.position,16,[140,120,95],140.0,visual)?;host.visual_output(Output::Text{point:a.position},visual)?;
        if a.radius>32.0{let r=a.radius*0.55;for _ in 0..2{let angle=random.next()*PI*2.0;let id=random.next();let speed=40.0+random.next()*30.0;
            let facing=random.next()*PI*2.0;let angular=(random.next()-0.5)*0.8;
            self.asteroids.push(Asteroid{id:Identity{id,generation:a.id.generation},position:add(a.position,[angle.cos()*r,angle.sin()*r]),velocity:add(a.velocity,[angle.cos()*speed,angle.sin()*speed]),
                facing,angular,radius:r,mass:r*r*0.75,hp:250.0,max_hp:250.0,sprite:3,fixed:false});}}
        self.asteroids.remove(index);Ok(())
    }
    pub fn query_projectile(&self,p:&Projectile)->Option<AsteroidHit>{let mut best:Option<AsteroidHit>=None;
        for (index,a)in self.asteroids.iter().enumerate(){if a.hp<=0.0||p.damaged_asteroids.contains(&a.id.id){continue;}
            if let Some((t,point))=segment_impact(p.previous,p.position,a.position,a.radius+p.radius){if best.is_none_or(|h|t<h.t){best=Some(AsteroidHit{index,t,point,identity:a.id});}}}best}
    pub fn commit_projectile<H:Host>(&mut self,p:&Projectile,hit:AsteroidHit,feedback:bool,host:&mut H,random:&mut Random,visual:&mut Random)->Result<(),u32>{
        let Some(a)=self.asteroids.get_mut(hit.index)else{return Ok(());};if a.id!=hit.identity{return Err(4);}if a.hp<=0.0{return Ok(());}a.hp-=p.damage;
        host.visual_output(Output::Floating{point:hit.point,amount:p.damage,color:[200,180,140]},visual)?;host.sparks(hit.point,12,[255,180,80],visual)?;host.debris(hit.point,4,[130,110,90],60.0,visual)?;
        if p.rocket&&!feedback{host.output(Output::Detach{projectile:p.id});host.explosion_visual(hit.point,60.0,[255,120,40],visual)?;host.output(Output::Sound{key:3,point:hit.point,volume:0.5});}
        if self.asteroids[hit.index].hp<=0.0{self.shatter(hit.index,host,random,visual)?;}Ok(())
    }
    pub fn resolve_asteroids<H:Host>(&mut self,host:&mut H,random:&mut Random,visual:&mut Random)->Result<(),u32>{let ids=host.ships();let mut i=0;
        while i<self.asteroids.len(){if self.asteroids[i].hp<=0.0{i+=1;continue;}
            for &id in &ids{let a=self.asteroids[i].clone();let Some(s)=host.ship_near_circle(id,a.position,a.radius)?else{continue;};if s.dead||s.collisionless{continue;}
                if let Some(hit)=shield_circle(&s,a.position,a.radius){let impulse=80.0f64.max(length(sub(a.velocity,s.velocity))*(a.mass/(a.mass+s.mass*20.0)));let flux=impulse*2.2;
                    host.shield_contact(id,flux)?;host.shield_flux(id,flux)?;host.output(Output::Ripple{point:hit.point,radius:40.0+a.radius,color:[100,200,255]});
                    host.visual_output(Output::Floating{point:hit.point,amount:flux,color:[80,200,255]},visual)?;host.output(Output::Sound{key:1,point:hit.point,volume:0.6});
                    if a.fixed{host.move_root(s.root,scale(hit.normal,-hit.penetration),[0.0;2])?;}else{let a=&mut self.asteroids[i];a.velocity=add_scaled(a.velocity,hit.normal,(impulse/a.mass)*80.0);a.position=add_scaled(a.position,hit.normal,hit.penetration);}continue;}
                if let Some(hit)=hull_circle(&s,a.position,a.radius){let raw=600.0f64.min(80.0+a.mass*0.15);let local=contact::rotate(sub(hit.point,s.position),-s.facing);
                    let damage=host.armor(id,local,raw,1,raw,visual)?;host.components(id,local,damage,None,random)?;host.armor_sparks(id,local,damage.armor,visual)?;host.hull(id,damage.hull)?;
                    if damage.armor>0.0{host.visual_output(Output::Floating{point:hit.point,amount:damage.armor,color:[255,180,50]},visual)?;}if damage.hull>0.0{host.visual_output(Output::Floating{point:hit.point,amount:damage.hull,color:[255,60,60]},visual)?;}
                    host.debris(hit.point,6,[140,120,100],80.0,visual)?;host.output(Output::Sound{key:1,point:hit.point,volume:0.7});
                    if a.fixed{host.move_root(s.root,scale(hit.normal,-hit.penetration),[0.0;2])?;}else{let a=&mut self.asteroids[i];a.velocity=add_scaled(a.velocity,hit.normal,60.0);a.position=add_scaled(a.position,hit.normal,hit.penetration);}
                    self.asteroids[i].hp-=raw*0.5;if self.asteroids[i].hp<=0.0{self.shatter(i,host,random,visual)?;break;}
                }
            }i+=1;
        }
        for i in 0..self.asteroids.len(){for j in i+1..self.asteroids.len(){let (left,right)=self.asteroids.split_at_mut(j);let a=&mut left[i];let b=&mut right[0];if a.fixed&&b.fixed{continue;}
            let r=a.radius+b.radius;let diff=sub(b.position,a.position);let d=length(diff);if d>=r{continue;}let n=if d>1e-12{scale(diff,1.0/d)}else{[1.0,0.0]};
            let inv_a=if a.fixed{0.0}else{1.0/a.mass};let inv_b=if b.fixed{0.0}else{1.0/b.mass};let kick=(2.0*dot(sub(a.velocity,b.velocity),n)/(inv_a+inv_b)).max(0.0);
            if !a.fixed{a.velocity=add_scaled(a.velocity,n,-kick*inv_a);a.position=add_scaled(a.position,n,-(r-d)*inv_a/(inv_a+inv_b));}
            if !b.fixed{b.velocity=add_scaled(b.velocity,n,kick*inv_b);b.position=add_scaled(b.position,n,(r-d)*inv_b/(inv_a+inv_b));}
            if visual.next()<0.25{host.output(Output::Sound{key:2,point:a.position,volume:0.35});}
        }}Ok(())
    }
}
#[derive(Clone,Copy)]pub struct AsteroidHit{pub index:usize,pub identity:Identity,pub t:f64,pub point:Point}
pub fn segment_impact(start:Point,end:Point,center:Point,r:f64)->Option<(f64,Point)>{let d=sub(end,start);let f=sub(start,center);let a=dot(d,d);
    if a<=1e-12{return if length(f)<=r{Some((0.0,start))}else{None};}let b=2.0*dot(f,d);let c=dot(f,f)-r*r;let discriminant=b*b-4.0*a*c;
    if discriminant<0.0{return None;}let root=discriminant.sqrt();let t1=(-b-root)/(2.0*a);let t2=(-b+root)/(2.0*a);let t=if(0.0..=1.0).contains(&t1){t1}else if(0.0..=1.0).contains(&t2){t2}else{return None;};Some((t,add_scaled(start,d,t)))
}
// Remaining hulk implementation follows below; no rectangle fallback.
#[derive(Clone)]pub struct Hulk{pub id:f64,pub source:Identity,pub size:Option<u32>,pub sprite_height:f64,pub position:Point,pub velocity:Point,pub facing:f64,pub angular:f64,
    pub age:f64,pub bounds:Vec<Point>,pub visual:Option<Vec<Point>>,pub offset:Point,pub radius:f64,pub slots:Vec<(u32,Point)>,pub sequence:Option<u32>,pub fixed:bool,pub managed:bool}
#[derive(Clone)]pub struct Sequence{pub remaining:i32,pub interval:f64,pub elapsed:f64,pub next:f64}
#[derive(Clone)]pub struct Cut{pub bounds:Vec<Point>,pub visual:Vec<Point>,pub seam:Vec<Point>}
#[derive(Clone,Copy)]pub struct BoxBounds{pub min:Point,pub max:Point,pub center:Point,pub width:f64,pub height:f64,pub radius:f64}
fn near(a:Point,b:Point)->bool{(a[0]-b[0]).abs()<0.1&&(a[1]-b[1]).abs()<0.1}
pub fn hull_box(p:&[Point])->BoxBounds{let mut min=[f64::INFINITY;2];let mut max=[f64::NEG_INFINITY;2];let mut center=p.first().copied().unwrap_or([f64::NAN;2]);
    for point in p{for i in 0..2{min[i]=min[i].min(point[i]);max[i]=max[i].max(point[i]);center[i]+=point[i];}}
    center=scale(center,1.0/(p.len()+1)as f64);BoxBounds{min,max,center,width:max[0]-min[0],height:max[1]-min[1],
        radius:hypot([(center[0]-min[0]).max(max[0]-center[0]),(center[1]-min[1]).max(max[1]-center[1])])+20.0}}
fn cross(a:Point,b:Point)->f64{a[0]*b[1]-a[1]*b[0]}
fn area(p:&[Point])->f64{let mut sum=0.0;for i in 0..p.len(){sum+=cross(p[i],p[(i+1)%p.len()]);}sum/2.0}
fn intersect(a:Point,b:Point,c:Point,d:Point)->Option<f64>{let ab=sub(b,a);let cd=sub(d,c);let ca=sub(c,a);let den=cross(ab,cd);
    if den.abs()<1e-8{return None;}let t=cross(ca,cd)/den;let u=cross(ca,ab)/den;
    if(-1e-7..=1.0+1e-7).contains(&t)&&(-1e-7..=1.0+1e-7).contains(&u){Some(t.clamp(0.0,1.0))}else{None}}
pub fn point_in_hulk(p:Point,poly:&[Point])->bool{e::wreck_hit(p,p,poly)==Some(0.0)}
pub fn valid_polygon(p:&[Point])->bool{if p.len()<3||area(p).abs()<0.01{return false;}
    for i in 0..p.len(){for j in i+1..p.len(){if j==i+1||i==0&&j==p.len()-1{continue;}let a=p[i];let b=p[(i+1)%p.len()];let c=p[j];let d=p[(j+1)%p.len()];
        if [a,b].iter().any(|p|near(*p,c)||near(*p,d)){continue;}if intersect(a,b,c,d).is_some(){return false;}}}true}
fn distance_segment(p:Point,a:Point,b:Point)->(f64,f64){let d=sub(b,a);let squared=dot(d,d);let t=(dot(sub(p,a),d)/if squared==0.0{1.0}else{squared}).clamp(0.0,1.0);(length(sub(p,add_scaled(a,d,t))),t)}
fn noise(count:usize,random:&mut Random)->Vec<f64>{let mut n=2;while n<count{n*=2;}let mut values=vec![-1.0;n];values[0]=1.0;values[n-1]=1.0;
    fn fill(values:&mut[f64],a:usize,b:usize,depth:i32,random:&mut Random){if a+1>=b{return;}let mid=(a+b)/2;
        values[mid]=(values[a]+values[b])/2.0+0.7f64.powf(depth as f64)*(random.next()-0.5);fill(values,a,mid,depth+1,random);fill(values,mid,b,depth+1,random);}
    fill(&mut values,0,n-1,1,random);let min=values.iter().copied().fold(f64::INFINITY,f64::min);let max=values.iter().copied().fold(f64::NEG_INFINITY,f64::max);
    if max>min{for v in &mut values{*v=(*v-min)/(max-min);}}values}
fn visual_outline(poly:&[Point],seam:&[Point],old:&[Point],visual:Option<&[Point]>,random:&mut Random)->Vec<Point>{let ccw=area(poly)>0.0;let on=|p|seam.iter().any(|s|near(*s,p));
    poly.iter().enumerate().map(|(i,&p)|{if on(p){return p;}if let Some(visual)=visual{return old.iter().position(|o|near(*o,p)).map_or(p,|index|visual[index]);}
        let previous=poly[(i+poly.len()-1)%poly.len()];let next=poly[(i+1)%poly.len()];if on(previous)||on(next){return p;}
        let incoming=norm(sub(p,previous));let outgoing=norm(sub(next,p));let normal=scale(norm([incoming[1]+outgoing[1],-incoming[0]-outgoing[0]]),if ccw{1.0}else{-1.0});
        add_scaled(p,normal,random.next()*10.0)
    }).collect()}
pub fn fracture(input:&[Point],visual:Option<&[Point]>,size:Option<u32>,random:&mut Random)->Option<[Cut;2]>{
    let mut clean:Vec<_>=input.iter().enumerate().filter_map(|(i,p)|if i==0||!near(*p,input[i-1]){Some(*p)}else{None}).collect();
    if clean.len()>1&&near(clean[0],clean[clean.len()-1]){clean.pop();}if !valid_polygon(&clean){return None;}
    let mut poly=Vec::new();for i in 0..clean.len(){let a=clean[i];let b=clean[(i+1)%clean.len()];let count=(length(sub(b,a))/20.0).ceil().max(1.0)as usize;
        for j in 0..count{poly.push(add_scaled(a,sub(b,a),j as f64/count as f64));}}
    let box_=hull_box(&poly);let n=poly.len();let scale=(box_.width.min(box_.height)/15.0).max(5.0)/10.0;let scale=scale.min(1.0);
    let attempts=if matches!(size,Some(4|5)){8}else{12};let mut fallbacks=vec![90.0,180.0,45.0,135.0];
    let crowded:Vec<_>=poly.iter().enumerate().map(|(i,p)|poly.iter().enumerate().any(|(j,q)|i!=j&&length(sub(*p,*q))<=2.0)).collect();
    for attempt in 0..attempts+4{
        let fraction_min=(0.2*0.9f64.powf(attempt as f64)).max(0.2*0.33);let mut angle=random.next()*PI*2.0;
        let mut center=add(box_.center,[(0.5-random.next())*box_.width*0.75,(0.5-random.next())*box_.height*0.75]);
        if attempt>=attempts{center=box_.center;let index=(random.next()*fallbacks.len()as f64).floor()as usize;angle=(fallbacks.remove(index)+15.0-30.0*random.next())*PI/180.0;}
        let distance=box_.width.max(box_.height)*2.0;let direction=[angle.cos()*distance,angle.sin()*distance];let from=add(center,direction);let to=sub(center,direction);
        let mut crossings=Vec::new();let mut invalid=false;
        for i in 0..n{let a=poly[i];let b=poly[(i+1)%n];let Some(t)=intersect(from,to,a,b)else{continue;};let p=add_scaled(from,sub(to,from),t);if near(p,a){continue;}
            let index=if length(sub(p,a))>length(sub(p,b))&&!crowded[(i+1)%n]{(i+1)%n}else{i};if crowded[index]{invalid=true;break;}crossings.push((index,t));}
        if invalid||crossings.len()<2||crossings.len()%2!=0{continue;}crossings.sort_by(|a,b|a.1.total_cmp(&b.1));
        let(mut ai,mut bi)=(crossings[0].0,crossings[1].0);if ai>bi{std::mem::swap(&mut ai,&mut bi);}let span=bi-ai;let fraction=span.min(n-span)as f64/(n+1)as f64;
        if span<3||n-span<3||fraction<fraction_min||fraction>0.5{continue;}let a=poly[ai];let b=poly[bi];let chord=sub(b,a);let len=length(chord);
        if len<1.0||!point_in_hulk(add_scaled(a,chord,1.0/len),&poly){continue;}
        for i in 0..n{let c=poly[i];let d=poly[(i+1)%n];if[c,d].iter().any(|p|near(*p,a)||near(*p,b)){continue;}
            if intersect(a,b,c,d).is_some(){invalid=true;break;}for p in [c,d]{let(distance,t)=distance_segment(p,a,b);if distance<20.0*(1.0-(0.5-t).abs()*2.0).sqrt(){invalid=true;break;}}
            if invalid{break;}}
        if invalid{continue;}let steps=(len/(10.0*scale)).ceil().max(7.0)as usize;let mut seam:Vec<_>=(0..=steps).map(|i|add_scaled(a,chord,i as f64/steps as f64)).collect();
        let values=noise(seam.len(),random);let normal=norm([-chord[1],chord[0]]);
        for i in 1..seam.len()-1{let index=((i*values.len())as f64/seam.len()as f64).floor()as usize;let offset=(((1.0-values[index.min(values.len()-1)])*20.0-10.0)*scale).min(length(sub(seam[i],seam[i-1])));seam[i]=add_scaled(seam[i],normal,offset);}
        let mut left=poly[ai..=bi].to_vec();left.extend(seam[1..seam.len()-1].iter().rev());let mut right=poly[bi..].to_vec();right.extend(&poly[..=ai]);right.extend(&seam[1..seam.len()-1]);
        if !valid_polygon(&left)||!valid_polygon(&right){continue;}
        let first=Cut{visual:visual_outline(&left,&seam,input,visual,random),bounds:left,seam:seam.clone()};
        let second=Cut{visual:visual_outline(&right,&seam,input,visual,random),bounds:right,seam};return Some([first,second]);
    }None
}
impl Terrain{
    pub fn split_hulk<H:Host>(&self,h:&Hulk,host:&mut H,visual:&mut Random)->Result<Option<[Hulk;2]>,u32>{
        let Some(mut cuts)=fracture(&h.bounds,h.visual.as_deref(),h.size,visual)else{return Ok(None);};
        host.split_armor(h.source,h.visual.is_none(),&cuts[0].seam,visual)?;
        if cuts[0].bounds.len()<cuts[1].bounds.len(){cuts.swap(0,1);}
        let origin=sub(h.position,contact::rotate(h.offset,h.facing));let grid=(h.sprite_height/10.0).clamp(15.0,30.0);let mut slots=[Vec::new(),Vec::new()];
        for &(id,pos)in &h.slots{if point_in_hulk(pos,&cuts[0].bounds){slots[0].push((id,pos));}else if point_in_hulk(pos,&cuts[1].bounds){slots[1].push((id,pos));}}
        let mut pieces=[h.clone(),h.clone()];
        for (i,cut)in cuts.into_iter().enumerate(){let box_=hull_box(&cut.bounds);let mut relative=sub(box_.center,h.offset);
            for v in &mut relative{*v=(*v/grid+0.5).floor()*grid;}let offset=add(h.offset,relative);let velocity=if i==1{add(h.velocity,scale(norm(contact::rotate(relative,h.facing)),0.5))}else{h.velocity};
            pieces[i].id=visual.next_id();pieces[i].position=add(origin,contact::rotate(offset,h.facing));pieces[i].velocity=velocity;
            pieces[i].bounds=cut.bounds;pieces[i].visual=Some(cut.visual);pieces[i].slots=std::mem::take(&mut slots[i]);pieces[i].offset=offset;pieces[i].radius=box_.radius;
        }Ok(Some(pieces))
    }
    pub fn advance_hulks<H:Host>(&mut self,dt:f64,host:&mut H,visual:&mut Random)->Result<(),u32>{let mut cooled=Vec::new();
        for i in (0..self.hulks.len()).rev(){let h=&mut self.hulks[i];h.age+=dt;if h.size==Some(1)&&h.age>=10.5{self.hulks.remove(i);continue;}
            if !h.fixed&&!h.managed{h.position=add_scaled(h.position,h.velocity,dt);h.facing+=h.angular*dt;}
            if !cooled.contains(&h.source){cooled.push(h.source);host.cool_hulk_source(h.source,dt,h.facing,visual)?;}}
        let mut sequences=Vec::new();for h in &self.hulks{if !h.fixed{if let Some(seq)=h.sequence{if !sequences.contains(&seq){sequences.push(seq);}}}}
        for seq in sequences{let(sequence_next,sequence_interval)={let sequence=self.sequences.get_mut(&seq).ok_or(8u32)?;sequence.elapsed+=dt;
            if sequence.elapsed<sequence.next{continue;}sequence.elapsed=0.0;(sequence.next,sequence.interval)};let _=sequence_next;
            let mut largest=None;let mut largest_area=0.0;for(i,h)in self.hulks.iter().enumerate(){if h.fixed||h.sequence!=Some(seq){continue;}let box_=hull_box(&h.bounds);let area=box_.width*box_.height;
                if largest.is_none()||area>largest_area{largest=Some(i);largest_area=area;}}
            if let Some(i)=largest{let h=self.hulks[i].clone();if let Some(pieces)=self.split_hulk(&h,host,visual)?{self.hulks.splice(i..=i,pieces);}}
            let sequence=self.sequences.get_mut(&seq).ok_or(8u32)?;sequence.remaining-=1;sequence.next=sequence_interval*(0.5+0.5*visual.next());
            if sequence.remaining<=0{for h in &mut self.hulks{if h.sequence==Some(seq){h.sequence=None;}}self.sequences.remove(&seq);}
        }Ok(())
    }
    pub fn query_hulk(&self,p:&Projectile)->Option<HulkHit>{let mut result=None;let mut first=f64::INFINITY;
        for h in &self.hulks{if p.damaged_hulks.contains(&h.id)||distance_segment(h.position,p.previous,p.position).0>h.radius+p.radius.max(0.0){continue;}
            let local=|point|add(contact::rotate(sub(point,h.position),-h.facing),h.offset);
            if let Some(t)=e::wreck_hit(local(p.previous),local(p.position),&h.bounds){if t<first{first=t;result=Some(HulkHit{id:h.id,t,point:add_scaled(p.previous,sub(p.position,p.previous),t),velocity:h.velocity,radius:h.radius});}}
        }result
    }
    /// Order is applyEnvironmentImpact then actual sparks and debris. No hulk
    /// HP, source-hull damage, pierced id or projectile removal is invented.
    pub fn commit_hulk<H:EnvironmentHost>(&self,p:&Projectile,hit:HulkHit,host:&mut H,random:&mut Random,visual:&mut Random)->Result<(),u32>{
        if !self.hulks.iter().any(|h|h.id==hit.id){return Err(4);}hulk_impact(p.id,hit,host,random,visual)
    }
}
#[derive(Clone,Copy)]pub struct HulkHit{pub id:f64,pub t:f64,pub point:Point,pub velocity:Point,pub radius:f64}
/// A reentrant owner validates the live hulk identity before entering here.
/// No Terrain borrow is held while an impact immediately damages the world.
pub fn hulk_impact<H:EnvironmentHost>(projectile:f64,hit:HulkHit,host:&mut H,random:&mut Random,visual:&mut Random)->Result<(),u32>{
    host.environment_impact(projectile,hit.point,hit.velocity,None,random,visual)?;
    host.sparks(hit.point,10,[255,160,60],visual)?;host.debris(hit.point,1,[80,75,70],50.0,visual)?;Ok(())
}
pub fn resident_split_armor(ship:&mut crate::ship_state::ShipState,initial:bool,seam:&[Point],visual:&mut Random)->Result<(),u32>{
    let armor=ship.armor.as_mut().ok_or(8u32)?;if initial{for c in 0..armor.data[0]as i64{for r in 0..armor.data[1]as i64{armor.set_cell(c,r,0.0);}}}
    for point in seam{let(c,r)=armor.grid(point[0],point[1]);armor.set_cell(c,r,0.0);}armor.sync_scars(visual);Ok(())
}
/// Actual FX hulk-source update: scars, shield with fragment-facing arguments,
/// then only the primary generic lifecycle. No other systems or Ship.update.
pub fn resident_cool_hulk_source(ship:&mut crate::ship_state::ShipState,dt:f64,facing:f64,position:Point,specs:&BTreeMap<u32,crate::lifecycle::Spec>,visual:&mut Random)->Result<(),u32>{
    ship.armor.as_mut().ok_or(8u32)?.advance_scars(dt,visual);
    if let Some(shield)=&mut ship.shield{let mut pose=[0.0;crate::motion::WIDTH];pose[crate::motion::X]=position[0];pose[crate::motion::Y]=position[1];pose[crate::motion::FACING]=facing;
        let previous=[shield.data[33],shield.data[34]];shield.data[33]=1.0;shield.data[34]=facing;
        let suppressed=shield.void.as_ref().is_some_and(|v|v.data[10]!=0.0);let result=shield.update(dt,&pose,&mut ship.flux,suppressed);
        shield.data[33]=previous[0];shield.data[34]=previous[1];result?;
    }
    if let Some(system)=ship.systems.first_mut(){system.update(specs.get(&system.spec).ok_or(8u32)?,dt);}Ok(())
}
