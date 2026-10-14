//! Existing Web GravityTerrain: real managed/fixed wreck polygons, resident
//! assembly impulses, and immediate terrain-owner damage. No mirrored world.
use crate::{contact::{self,Point},random::Random,terrain_owner,terrain_world as t};

#[derive(Clone)]pub struct Source{pub mass:f64,pub bounds:Vec<Point>}
/// Required live metadata. Missing sources/trees fail rather than invent mass.
pub trait Host:t::Host{
    /// Result preserves resident source/spec errors; Option would mask them as
    /// a stale identity or silently treat them as an absent collision.
    fn live_ship(&self,id:t::Identity)->Result<t::Ship,u32>;
    fn hulk_source(&self,id:t::Identity)->Result<Source,u32>;
    fn assembly_mass(&self,root:t::Identity)->Result<f64,u32>;
}
impl<W:terrain_owner::World> Host for terrain_owner::Host<'_,W>{
    fn live_ship(&self,id:t::Identity)->Result<t::Ship,u32>{self.read(id)}
    fn hulk_source(&self,id:t::Identity)->Result<Source,u32>{
        let row=self.owned.row(self.bodies,id)?;let meta=self.owned.meta(id)?;
        let bounds=self.bodies[row].ship.as_ref().and_then(|s|s.combat.as_ref()).ok_or(8u32)?.bounds.clone();
        if !meta.mass.is_finite()||meta.mass<=0.0||bounds.iter().any(|p|!p.iter().all(|v|v.is_finite())){return Err(7);}
        Ok(Source{mass:meta.mass,bounds})
    }
    fn assembly_mass(&self,root:t::Identity)->Result<f64,u32>{
        if self.owned.root(root)?!=root{return Err(8);}
        fn visit<W:terrain_owner::World>(h:&terrain_owner::Host<'_,W>,id:t::Identity,parent:Option<t::Identity>,seen:&mut Vec<t::Identity>,total:&mut f64)->Result<(),u32>{
            if seen.contains(&id){return Err(8);}seen.push(id);h.owned.row(h.bodies,id)?;let meta=h.owned.meta(id)?;
            if meta.module.as_ref().map(|m|m.parent)!=parent{return Err(8);}if !meta.mass.is_finite()||meta.mass<=0.0{return Err(7);}
            *total+=meta.mass;for child in &meta.children{visit(h,*child,Some(id),seen,total)?;}Ok(())
        }
        let mut total=0.0;visit(self,root,None,&mut Vec::new(),&mut total)?;if !total.is_finite(){return Err(7);}Ok(total)
    }
}
fn add(a:Point,b:Point)->Point{[a[0]+b[0],a[1]+b[1]]}
fn sub(a:Point,b:Point)->Point{[a[0]-b[0],a[1]-b[1]]}
fn scale(a:Point,n:f64)->Point{[a[0]*n,a[1]*n]}
fn add_scaled(a:Point,b:Point,n:f64)->Point{[a[0]+b[0]*n,a[1]+b[1]*n]}
fn dot(a:Point,b:Point)->f64{a[0]*b[0]+a[1]*b[1]}
fn cross(a:Point,b:Point)->f64{a[0]*b[1]-a[1]*b[0]}
fn hypot(p:Point)->f64{let m=p[0].abs().max(p[1].abs());if m==0.0{0.0}else{let a=p[0]/m;let b=p[1]/m;(a*a+b*b).sqrt()*m}}
fn area(points:&[Point])->f64{let mut sum=0.0;for(i,p)in points.iter().enumerate(){sum+=cross(*p,points[(i+1)%points.len()]);}sum/2.0}
fn intersection(a:Point,b:Point,c:Point,d:Point)->Option<Point>{
    let ab=sub(b,a);let cd=sub(d,c);let den=cross(ab,cd);if den.abs()<1e-9{return None;}
    let ac=sub(c,a);let t=cross(ac,cd)/den;let u=cross(ac,ab)/den;
    if(0.0..=1.0).contains(&t)&&(0.0..=1.0).contains(&u){Some(add_scaled(a,ab,t))}else{None}
}
fn deepest(best:&mut Option<t::Contact>,next:Option<t::Contact>,reverse:bool){
    if let Some(mut hit)=next{if best.is_none_or(|b|hit.penetration>b.penetration){if reverse{hit.normal=scale(hit.normal,-1.0);}*best=Some(hit);}}
}
/// Includes concavity, both vertex sets and thin crossings without contained
/// vertices. Equal depth retains source enumeration order.
pub fn polygon_contact(ship:&t::Ship,surface:&t::Ship,points:&[Point])->Option<t::Contact>{
    let mut best=None;for p in points{deepest(&mut best,t::hull_circle(ship,*p,0.0),false);}
    let ship_points:Vec<_>=ship.bounds.iter().map(|p|add(contact::rotate(*p,ship.facing),ship.position)).collect();
    for p in &ship_points{deepest(&mut best,t::hull_circle(surface,*p,0.0),true);}if best.is_some(){return best;}
    let mut crossings=Vec::new();for i in 0..points.len(){for j in 0..ship_points.len(){
        if let Some(p)=intersection(points[i],points[(i+1)%points.len()],ship_points[j],ship_points[(j+1)%ship_points.len()]){crossings.push(p);}
    }}
    if crossings.len()>=2{let center=scale(crossings.iter().fold([0.0;2],|a,p|add(a,*p)),1.0/crossings.len()as f64);
        deepest(&mut best,t::hull_circle(ship,center,0.0),false);deepest(&mut best,t::hull_circle(surface,center,0.0),true);
    }best
}
pub fn advance<H:Host>(dt:f64,terrain:&mut t::Terrain,host:&mut H,random:&mut Random,visual:&mut Random)->Result<(),u32>{
    if !dt.is_finite()||dt<0.0{return Err(7);}let ships=host.ships();
    for h in &mut terrain.hulks{
        if !h.managed&&!h.fixed{continue;}
        if !h.fixed{h.position=add_scaled(h.position,h.velocity,dt);h.facing+=h.angular*dt;}
        let bounds:Vec<_>=h.bounds.iter().map(|p|sub(*p,h.offset)).collect();
        let source=host.hulk_source(h.source)?;let mass=(source.mass*area(&h.bounds).abs()/area(&source.bounds).abs().max(1.0)).max(50.0);
        if !mass.is_finite(){return Err(7);}
        for id in &ships{
            let ship=host.live_ship(*id)?;if ship.dead||ship.collisionless{continue;}
            let hull_radius=ship.bounds.iter().fold(ship.radius,|radius,p|radius.max(hypot(*p)));
            let shield_radius=if ship.shield.active{ship.shield.radius+contact::length(sub(ship.shield.center,ship.position))}else{0.0};
            if contact::length(sub(ship.position,h.position))>hull_radius.max(shield_radius)+h.radius{continue;}
            let points:Vec<_>=bounds.iter().map(|p|add(contact::rotate(*p,h.facing),h.position)).collect();
            let mut shield_points=points.clone();if ship.shield.active{for i in 0..points.len(){
                let a=points[i];let b=points[(i+1)%points.len()];let ab=sub(b,a);let squared=dot(ab,ab);
                let fraction=(dot(sub(ship.shield.center,a),ab)/if squared==0.0{1.0}else{squared}).clamp(0.0,1.0);
                shield_points.push(add_scaled(a,ab,fraction));
            }}
            let mut shield=None;for point in shield_points{deepest(&mut shield,t::shield_circle(&ship,point,0.0),false);}
            let mut surface=ship.clone();surface.position=h.position;surface.facing=h.facing;surface.radius=h.radius;surface.bounds=bounds.clone();
            let Some(hit)=shield.or_else(||polygon_contact(&ship,&surface,&points))else{continue;};
            let root=host.live_ship(ship.root)?;let inv_ship=if root.station{0.0}else{1.0/host.assembly_mass(ship.root)?.max(1.0)};
            let inv_h=if h.fixed{0.0}else{1.0/mass};if inv_ship+inv_h<=0.0{continue;}
            let share=inv_ship/(inv_ship+inv_h);let closing=dot(sub(ship.velocity,h.velocity),hit.normal);
            host.move_root(ship.root,scale(hit.normal,-hit.penetration*share),[0.0;2])?;
            h.position=add_scaled(h.position,hit.normal,hit.penetration*(1.0-share));host.sync_modules(ship.root)?;
            if closing<=0.0{continue;}
            host.move_root(ship.root,[0.0;2],scale(hit.normal,-closing*0.8*share))?;
            if !h.fixed{h.velocity=add_scaled(h.velocity,hit.normal,closing*0.8*(1.0-share));}
            if closing<=20.0{continue;}
            let mut raw=(closing*8.0*share).min(600.0);
            if shield.is_some(){let s=host.live_ship(*id)?;let radial=sub(hit.point,s.shield.center);
                // GravityTerrain does not apply the ordinary weapon/system
                // shield multiplier here; Shield.impact supplies its own fold.
                let impact=host.shield_absorb(*id,raw*s.cr_taken,1,radial[1].atan2(radial[0]))?;
                host.shield_flux(*id,impact.flux)?;raw*=impact.remainder;
                host.visual_output(t::Output::Ripple{point:hit.point,radius:30.0,color:[90,190,230]},visual)?;
            }
            if raw>0.0{let s=host.live_ship(*id)?;let local=contact::rotate(sub(hit.point,s.position),-s.facing);
                let damage=host.armor(*id,local,raw*s.cr_taken,1,raw,visual)?;
                host.components(*id,local,damage,None,random)?;host.hull(*id,damage.hull)?;
                host.armor_sparks(*id,local,damage.armor,visual)?;
                if damage.hull>0.0{host.visual_output(t::Output::Floating{point:hit.point,amount:damage.hull,color:[255,90,70]},visual)?;}
            }
        }
    }Ok(())
}
/// Small borrowing boundary: always return hulks, including on failure. The
/// outer shared transaction restores all mutations/RNG/output on Err.
pub fn advance_owned<W:terrain_owner::World>(dt:f64,host:&mut terrain_owner::Host<'_,W>,random:&mut Random,visual:&mut Random)->Result<(),u32>{
    let mut local=t::Terrain::default();local.hulks=std::mem::take(&mut host.owned.terrain.hulks);
    let result=advance(dt,&mut local,host,random,visual);
    // Current real Hull services defer death to the source sweep. Unexpected
    // reentrant admission must fail, while retaining both arrays for rollback.
    if !host.owned.terrain.hulks.is_empty(){local.hulks.append(&mut host.owned.terrain.hulks);host.owned.terrain.hulks=local.hulks;return Err(8);}
    host.owned.terrain.hulks=local.hulks;result
}
