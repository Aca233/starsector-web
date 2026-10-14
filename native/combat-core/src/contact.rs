//! Ordered Web swept contacts; no frozen hit batch or host geometry callback.
use crate::{motion, shield::{self, Shield}};

pub type Point = [f64; 2];
pub fn rotate(p: Point, angle: f64) -> Point {
    let c = angle.cos(); let s = angle.sin(); [p[0]*c-p[1]*s,p[0]*s+p[1]*c]
}
pub fn local(p: Point, pose: &[f64;motion::WIDTH]) -> Point {
    rotate([p[0]-pose[motion::X],p[1]-pose[motion::Y]],-pose[motion::FACING])
}
pub fn lerp(a:Point,b:Point,t:f64)->Point {[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]}
pub fn length(v:Point)->f64 {
    let a=v[0].abs();let b=v[1].abs();let max=if a>b{a}else{b};
    if max==f64::INFINITY{return max;}if max==0.0&&a==0.0{return 0.0;}
    let ratio=if a>b{b}else{a}/max;(1.0+ratio*ratio).sqrt()*max
}
pub fn contains(p:Point,poly:&[Point])->bool {
    if poly.len()<3{return false;} let mut inside=false;let mut j=poly.len()-1;
    for i in 0..poly.len(){let a=poly[i];let b=poly[j];
        if (a[1]>p[1])!=(b[1]>p[1]) && p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0] {inside=!inside;}j=i;
    }inside
}
pub fn polygon(start:Point,end:Point,poly:&[Point])->Option<(f64,Point)> {
    if poly.len()<3{return None;}let d=[end[0]-start[0],end[1]-start[1]];let mut hit=None;let mut best=1.0;
    for i in 0..poly.len(){let a=poly[(i+poly.len()-1)%poly.len()];let b=poly[i];let e=[b[0]-a[0],b[1]-a[1]];
        let den=d[0]*e[1]-d[1]*e[0];if den.abs()<1e-8{continue;}
        let r=[start[0]-a[0],start[1]-a[1]];
        let t=(e[0]*r[1]-e[1]*r[0])/den;let u=(d[0]*r[1]-d[1]*r[0])/den;
        if (0.0..=1.0).contains(&t)&&(0.0..=1.0).contains(&u)&&t<=best {best=t;hit=Some((t,lerp(start,end,t)));}
    }
    hit.or_else(||if contains(end,poly){Some((1.0,end))}else{None})
}
pub fn roots(start:Point,end:Point,center:Point,radius:f64)->[Option<f64>;2] {
    let dx=end[0]-start[0];let dy=end[1]-start[1];let fx=start[0]-center[0];let fy=start[1]-center[1];
    let a=dx*dx+dy*dy;let c=fx*fx+fy*fy-radius*radius;
    if c<=0.0{return [Some(0.0),None];}if a<=1e-18{return [None,None];}
    let b=2.0*(fx*dx+fy*dy);let disc=b*b-4.0*a*c;if disc<0.0{return [None,None];}
    let root=disc.sqrt();let inv=0.5/a;let t0=(-b-root)*inv;let t1=(-b+root)*inv;
    [if (0.0..=1.0).contains(&t0){Some(t0)}else{None},if (0.0..=1.0).contains(&t1){Some(t1)}else{None}]
}
pub fn shield_center(s:&Shield,pose:&[f64;motion::WIDTH])->Point {
    let offset=rotate([s.data[29],s.data[30]],pose[motion::FACING]);[pose[motion::X]+offset[0],pose[motion::Y]+offset[1]]
}
pub fn shield_blocks(s:&Shield,pose:&[f64;motion::WIDTH],p:Point)->bool {
    let center=shield_center(s,pose);let radial=[p[0]-center[0],p[1]-center[1]];let len=length(radial);
    let facing=if s.kind()==shield::FRONT{pose[motion::FACING]}else{s.data[8]};
    let half=(s.data[7]*std::f64::consts::PI/360.0).cos();
    len<=1e-12||half<=-0.999999||(radial[0]*facing.cos()+radial[1]*facing.sin())/len>=half
}
#[derive(Clone,Copy,Debug,PartialEq,Eq)]
pub enum Surface{Shield,Hull}
#[derive(Clone,Copy,Debug)]
pub struct Hit{pub t:f64,pub point:Point,pub local:Point,pub surface:Surface}
pub fn projectile(start:Point,end:Point,pose:&[f64;motion::WIDTH],radius:f64,bounds:&[Point],s:Option<&Shield>)->Option<Hit>{
    let mut best=None;
    if let Some(s)=s.filter(|s|s.active()&&s.data[7]>5.0&&s.kind()!=shield::NONE&&s.kind()!=shield::PHASE){
        for t in roots(start,end,shield_center(s,pose),s.data[2]).into_iter().flatten(){let p=lerp(start,end,t);
            if shield_blocks(s,pose,p){best=Some(Hit{t,point:p,local:local(p,pose),surface:Surface::Shield});break;}
        }
    }
    let a=local(start,pose);let b=local(end,pose);
    let hull=if bounds.len()<3{roots(start,end,[pose[motion::X],pose[motion::Y]],radius).into_iter().flatten().next().map(|t|(t,local(lerp(start,end,t),pose)))}
        else if contains(a,bounds){Some((0.0,a))}else{polygon(a,b,bounds)};
    if let Some((t,p))=hull{if best.is_none_or(|h:Hit|t<h.t){best=Some(Hit{t,point:lerp(start,end,t),local:p,surface:Surface::Hull});}}best
}
fn ray_entry(start:Point,dir:Point,center:Point,r:f64)->Option<f64>{
    let v=[start[0]-center[0],start[1]-center[1]];let b=v[0]*dir[0]+v[1]*dir[1];let c=v[0]*v[0]+v[1]*v[1]-r*r;let disc=b*b-c;
    if disc<0.0||c<=0.0||b>=0.0{return None;}let t=-b-disc.sqrt();if t>0.0{Some(t)}else{None}
}
/// Beam origin-inside and polygon rules differ deliberately from projectile sweeps.
pub fn beam(start:Point,end:Point,pose:&[f64;motion::WIDTH],radius:f64,bounds:&[Point],s:Option<&Shield>)->Option<Hit>{
    beam_query(start,end,pose,radius,bounds,s,false)
}
pub fn beam_distance(start:Point,end:Point,pose:&[f64;motion::WIDTH],radius:f64,bounds:&[Point],s:Option<&Shield>)->Option<f64>{
    beam_query(start,end,pose,radius,bounds,s,true).map(|h|h.t)
}
fn beam_covered(s:&Shield,pose:&[f64;motion::WIDTH],p:Point)->bool{
    if !s.active()||s.data[7]<=5.0||s.kind()==shield::NONE||s.kind()==shield::PHASE{return false;}
    let center=shield_center(s,pose);let angle=(p[1]-center[1]).atan2(p[0]-center[0]);
    let facing=if s.kind()==shield::FRONT{pose[motion::FACING]}else{s.data[8]};let mut diff=angle-facing;
    while diff>std::f64::consts::PI{diff-=std::f64::consts::PI*2.0;}while diff< -std::f64::consts::PI{diff+=std::f64::consts::PI*2.0;}
    diff.abs()<=s.data[7]*std::f64::consts::PI/360.0
}
fn beam_query(start:Point,end:Point,pose:&[f64;motion::WIDTH],radius:f64,bounds:&[Point],s:Option<&Shield>,nearest:bool)->Option<Hit>{
    let delta=[end[0]-start[0],end[1]-start[1]];let len=length(delta);if len<=0.001{return None;}
    // Source target ranking scales by a reciprocal; actual contact normalizes by division.
    let unit=if nearest{let inv=1.0/len;[delta[0]*inv,delta[1]*inv]}else{[delta[0]/len,delta[1]/len]};let mut best=None;
    if let Some(s)=s.filter(|s|s.active()&&s.data[7]>0.0&&s.kind()!=shield::NONE&&s.kind()!=shield::PHASE){
        let center=shield_center(s,pose);let entry=ray_entry(start,unit,center,s.data[2]);
        let distance=length([start[0]-center[0],start[1]-center[1]]);
        let t=if let Some(t)=entry.filter(|&t|t<=len){let p=[start[0]+unit[0]*t,start[1]+unit[1]*t];if beam_covered(s,pose,p){Some(t)}else{None}}
            else if distance<=s.data[2]&&distance>radius*0.3&&unit[0]*(center[0]-start[0])+unit[1]*(center[1]-start[1])>0.0&&beam_covered(s,pose,start){Some(0.0)}else{None};
        // Keep the ray entry point arithmetic; reconstructing with lerp changes boundary qualification.
        if let Some(distance)=t{let p=[start[0]+unit[0]*distance,start[1]+unit[1]*distance];let t=distance/len;best=Some(Hit{t,point:p,local:local(p,pose),surface:Surface::Shield});}
    }
    let center=[pose[motion::X],pose[motion::Y]];let inside=length([start[0]-center[0],start[1]-center[1]])<=radius;
    let entry=ray_entry(start,unit,center,radius);if inside||entry.is_some_and(|t|t<=len){
        let hull=if bounds.len()>=3{polygon(local(start,pose),local(end,pose),bounds)}else{let t=entry.map_or(0.0,|t|t/len);Some((t,local(lerp(start,end,t),pose)))};
        if let Some((t,p))=hull {if best.is_none_or(|h:Hit|nearest&&t<h.t){
            let point=if bounds.len()>=3{let q=rotate(p,pose[motion::FACING]);[q[0]+pose[motion::X],q[1]+pose[motion::Y]]}else{lerp(start,end,t)};
            best=Some(Hit{t,point,local:p,surface:Surface::Hull});}}
    }best
}
