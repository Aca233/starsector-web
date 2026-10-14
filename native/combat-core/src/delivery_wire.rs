//! Shared complete delivery admission for mounts, MIRV children and system launchers.
use crate::projectile::Delivery;
fn integer(v:f64)->Option<u32>{if v.is_finite()&&v>=0.0&&v<=u32::MAX as f64&&v.fract()==0.0{Some(v as u32)}else{None}}
fn boolean(v:f64)->bool{v==0.0||v==1.0}
fn explosion_spec(row:&[f64])->Result<crate::explosion_effects::Spec,u32>{use crate::explosion_effects::{Spec,Collision};let collision=match integer(row[4]).ok_or(2u32)?{
    0=>Collision::ShipsAndAsteroids,1=>Collision::MissileFF,2=>Collision::MissileNoFF,3=>Collision::ProjectileFF,4=>Collision::ProjectileNoFF,5=>{if !boolean(row[5]){return Err(2);}Collision::Other{no_ff:row[5]==1.0}},_=>return Err(2)};
    let s=Spec{radius:row[0],core:row[1],duration:row[2],minimum_fraction:row[3],collision};if s.valid(){Ok(s)}else{Err(2)}}
pub fn apply(tag:u32,row:&[f64],d:&mut Delivery)->Result<Option<(f64,f64,crate::effect_owner::BeamStyle)>,u32>{let mut beam=None;
                        let mask=1<<(tag-87);if d.admission&mask!=0&&tag!=91&&tag!=93{return Err(8);}
                        match tag{
                            87=>{if [2,3,4,5,6,10,17,19].iter().any(|&i|!boolean(row[i]))||row[7..10].iter().any(|v|*v<0.0)||row[11]<0.0||[12,13,14,15,16,21].iter().any(|&i|integer(row[i]).is_none_or(|v|v>255))||integer(row[18]).is_none_or(|n|n>3)||row[20]<0.0{return Err(2);}
                                d.intercepts=row[2]==1.0;d.pass_missiles=row[3]==1.0;d.pass_fighters=row[4]==1.0;d.pass_fighters_destroyed=row[5]==1.0;
                                d.terrain_penetration=if row[6]==1.0{Some(row[7..10].try_into().unwrap())}else{None};
                                d.visual.missile=if row[10]==1.0{Some(crate::weapon_world::MissileVisual{radius:row[11],color:[row[12]as u8,row[13]as u8,row[14]as u8],hit_glow:row[17]==1.0})}else{None};
                                d.visual.fuse_color=[row[15]as u8,row[16]as u8,row[21]as u8];d.visual.custom=row[18]as u32;d.visual.heavy_torpedo=row[19]==1.0;d.hitpoints=if row[20]>0.0{Some(row[20])}else{None};}
                            88=>{if !boolean(row[2])||!boolean(row[9])||!boolean(row[12])||!boolean(row[20])||row[3..5].iter().any(|v|*v<0.0)||[10,11,13].iter().any(|&i|row[i]<0.0){return Err(2);}
                                d.explosion=if row[2]==1.0{Some(explosion_spec(&row[3..9])?)}else{None};
                                d.fuse=if row[9]==1.0{Some(crate::explosion_effects::Fuse{range:row[10],radius:row[11],core:if row[12]==1.0{Some(row[13])}else{None},source_explosion:if row[20]==1.0{Some(explosion_spec(&row[14..20])?)}else{d.explosion}})}else{None};}
                            89=>{if row[2]<0.0||row[3]<0.0||integer(row[4]).is_none_or(|n|n>2)||[7,9].iter().any(|&i|!boolean(row[i]))||row[8]<0.0||row[10..18].iter().any(|v|integer(*v).is_none_or(|n|n>255))||row[18]<0.0||row[19]<0.0{return Err(2);}
                                d.visual.hit_glow_radius=row[2];d.visual.width=row[3];d.visual.texture=row[4]as u32;d.visual.scroll=row[5];d.visual.pixels=row[6];d.visual.moving_speed=if row[7]==1.0{Some(row[8])}else{None};d.visual.source_move_speed=row[9]==1.0;
                                d.visual.fringe=std::array::from_fn(|i|row[10+i]as u8);d.visual.core=std::array::from_fn(|i|row[14+i]as u8);
                                beam=Some((row[18],row[19],crate::effect_owner::BeamStyle{width:row[3],fringe:d.visual.fringe,core:d.visual.core}));}
                            90=>{if row[2]!=0.0{return Err(2);}d.sound_units.clear();d.visual.fuse_sound.clear();}
                            91=>{let offset=integer(row[2]).ok_or(2u32)?as usize;let count=integer(row[3]).ok_or(2u32)?as usize;
                                if d.admission&(1<<3)==0||count>18||offset!=d.sound_units.len()||row[4..4+count].iter().any(|v|integer(*v).is_none_or(|n|n>65535)){return Err(2);}d.sound_units.extend(row[4..4+count].iter().map(|v|*v as u16));
                                if let Ok(s)=String::from_utf16(&d.sound_units){d.visual.fuse_sound=s;}}
                            92=>{if [2,3,4,6,8,9,10].iter().any(|&i|!boolean(row[i]))||row[5]<0.0||row[7]<0.0{return Err(2);}
                                d.is_mine=row[2]==1.0;d.fizzle_at_range=row[3]==1.0;d.system_fuse=if row[4]==1.0{Some(row[5])}else{None};d.system_fade_in=if row[6]==1.0{Some(row[7])}else{None};
                                d.system_explosion_sound=if row[8]==1.0{Some(String::new())}else{None};d.system_sound_units.clear();d.mass_driver=row[9]==1.0;d.batch_ship_contacts=row[10]==1.0;}
                            93=>{let offset=integer(row[2]).ok_or(2u32)?as usize;let count=integer(row[3]).ok_or(2u32)?as usize;
                                if d.admission&(1<<5)==0||d.system_explosion_sound.is_none()||count>18||offset!=d.system_sound_units.len()||row[4..4+count].iter().any(|v|integer(*v).is_none_or(|n|n>65535)){return Err(2);}
                                d.system_sound_units.extend(row[4..4+count].iter().map(|v|*v as u16));if let Ok(s)=String::from_utf16(&d.system_sound_units){d.system_explosion_sound=Some(s);}}
                            _=>return Err(2),
                        }d.admission|=mask;

Ok(beam)
}
