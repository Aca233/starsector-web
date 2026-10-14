#[path="../../native/combat-core/src/random.rs"]mod random;
mod motion{pub const WIDTH:usize=14;pub const X:usize=0;pub const Y:usize=1;pub const FACING:usize=4;}
mod shield{pub const NONE:u32=0;pub const FRONT:u32=1;pub const PHASE:u32=3;pub struct Shield{pub data:[f64;31]}impl Shield{pub fn kind(&self)->u32{self.data[0]as u32}pub fn active(&self)->bool{self.data[1]==1.0}}}
#[path="../../native/combat-core/src/contact.rs"]mod contact;
#[path="../../native/combat-core/src/explosion_effects.rs"]mod explosion_effects;
use std::cell::RefCell;use explosion_effects::*;
fn id(n:f64)->Identity{Identity{id:n,generation:1}}
struct World{ships:Vec<Ship>,missiles:Vec<Missile>,asteroids:Vec<Asteroid>,rows:Vec<Vec<f64>>,block:f64}
impl World{
    fn new()->Self{Self{ships:Vec::new(),missiles:Vec::new(),asteroids:Vec::new(),rows:Vec::new(),block:f64::INFINITY}}
    fn add(&mut self,row:Vec<f64>){self.rows.push(row);}
}
impl Host for World{
    fn ships(&self)->Vec<Identity>{self.ships.iter().map(|s|s.identity).collect()}
    fn fighters(&self)->Vec<Identity>{self.ships.iter().filter(|s|s.fighter).map(|s|s.identity).collect()}
    fn capitals(&self)->Vec<Identity>{self.ships.iter().filter(|s|!s.fighter).map(|s|s.identity).collect()}
    fn ship(&self,id:Identity)->Option<Ship>{self.ships.iter().find(|s|s.identity==id).cloned()}
    fn missiles(&self)->Vec<Identity>{self.missiles.iter().map(|s|s.identity).collect()}
    fn missile(&self,id:Identity)->Option<Missile>{self.missiles.iter().find(|s|s.identity==id).cloned()}
    fn asteroids(&self)->Vec<Identity>{self.asteroids.iter().map(|s|s.identity).collect()}
    fn asteroid(&self,id:Identity)->Option<Asteroid>{self.asteroids.iter().find(|s|s.identity==id).cloned()}
    fn outgoing(&self,_:&Payload,_:Option<Identity>,_:contact::Point)->f64{1.0}
    fn missile_damage(&self,_:&Payload,_:&Missile,d:f64)->f64{d*1.13}
    fn absorb(&mut self,target:Identity,d:f64,k:u32,a:f64)->Result<Absorption,u32>{self.add(vec![1.0,target.id,d,k as f64,a]);let void=self.ship(target).unwrap().shield.void;
        Ok(if void{Absorption{flux:0.0,absorbed:d*0.6,remainder:0.4}}else{Absorption{flux:d*0.83,absorbed:d,remainder:0.0}})}
    fn shield_flux(&mut self,target:Identity,d:f64,h:bool)->Result<(),u32>{self.add(vec![2.0,target.id,d,h as u32 as f64]);Ok(())}
    fn armor(&mut self,target:Identity,p:contact::Point,d:f64,k:u32,s:Option<f64>,_:&mut random::Random)->Result<Damage,u32>{self.add(vec![3.0,target.id,p[0],p[1],d,k as f64,s.unwrap_or(d)]);Ok(Damage{armor:d*0.7,hull:d*0.3})}
    fn hull(&mut self,t:Identity,d:f64)->Result<(),u32>{self.add(vec![4.0,t.id,d]);Ok(())}
    fn components(&mut self,t:Identity,p:contact::Point,d:Damage,emp:f64,source:u32,_:&mut random::Random)->Result<(),u32>{self.add(vec![5.0,t.id,p[0],p[1],d.armor,d.hull,emp,source as f64]);Ok(())}
    fn destroy_if_dead(&mut self,_:Identity,_:&mut random::Random,_:&mut random::Random)->Result<bool,u32>{Ok(false)}
    fn subtract_missile_hp(&mut self,t:Identity,d:f64)->Result<f64,u32>{let m=self.missiles.iter_mut().find(|m|m.identity==t).ok_or(4u32)?;m.hp-=d;let hp=m.hp;self.add(vec![7.0,t.id,hp]);Ok(hp)}
    fn remove_missile(&mut self,t:Identity)->Result<(),u32>{self.add(vec![8.0,t.id]);self.missiles.retain(|m|m.identity!=t);Ok(())}
    fn asteroid_impact(&mut self,_:&Payload,t:Identity,d:f64,p:contact::Point,_:&mut random::Random,_:&mut random::Random)->Result<(),u32>{self.add(vec![9.0,t.id,d,p[0],p[1]]);Ok(())}
    fn missile_visual(&mut self,_:Identity,p:contact::Point,c:[u8;3],_:&mut random::Random)->Result<(),u32>{self.output(Output::AuthenticExplosion{point:p,radius:35.0,color:c,missile:true});Ok(())}
    fn interception_effect(&mut self,_:&Payload,_:Identity,_:contact::Point,_:&mut random::Random,_:&mut random::Random)->Result<(),u32>{Ok(())}
    fn ship_obstruction(&self,_:&Payload)->Option<f64>{if self.block.is_finite(){Some(self.block)}else{None}}
    fn asteroid_obstruction(&self,_:&Payload)->Option<f64>{None}
    fn wrecks(&self)->Vec<Wreck>{Vec::new()}
    fn player_id(&self)->u32{71}
    fn output(&mut self,o:Output){let row=match o{
        Output::Damage{player,kind,layer,amount,emp,target_player}=>vec![11.0,player as u32 as f64,kind as f64,match layer{Layer::Shield=>0.0,Layer::Armor=>1.0,Layer::Hull=>2.0},amount,emp,target_player.map_or(-1.0,|p|p as u32 as f64)],
        Output::FloatingDamage{point,amount,color}=>vec![12.0,point[0],point[1],amount,color[0]as f64,color[1]as f64,color[2]as f64],
        Output::FloatingText{point,kind}=>vec![13.0,point[0],point[1],kind as f64],
        Output::Sound{point,sound}=>vec![14.0,point[0],point[1],match sound{Sound::Fuse=>0.6,Sound::Missile{volume}=>volume}],
        Output::AuthenticExplosion{point,radius,color,missile}=>vec![15.0,point[0],point[1],radius,color[0]as f64,color[1]as f64,color[2]as f64,missile as u32 as f64],
        Output::SourceExplosion{point,spec}=>vec![16.0,point[0],point[1],spec.radius],
        Output::Sparks{point,count,color}=>vec![17.0,point[0],point[1],count as f64,color[0]as f64,color[1]as f64,color[2]as f64],
        Output::Smoke(s)=>vec![18.0,s.position[0],s.position[1],s.velocity[0],s.velocity[1],s.life,s.size,s.max_size,s.rotation],
        Output::ArmorSparks{target,local,damage}=>vec![19.0,target.id,local[0],local[1],damage],
        Output::ShieldRipple{point}=>vec![20.0,point[0],point[1]],Output::CameraShake=>vec![21.0],Output::Radio{kind,count}=>vec![22.0,kind as f64,count as f64],
        Output::ShotHit{player}=>vec![23.0,player as u32 as f64],Output::MissileIntercepted{player}=>vec![24.0,player as u32 as f64],Output::DetachContrail{target}=>vec![25.0,target.id],
    };self.add(row);}
}
struct Fixture{input:Vec<f64>,output:Vec<f64>,world:World,explosions:Explosions,random:random::Random,visual:random::Random}
thread_local!{static F:RefCell<Fixture>=RefCell::new(Fixture{input:Vec::new(),output:Vec::new(),world:World::new(),explosions:Explosions::default(),random:random::Random::new(8427),visual:random::Random::new(17181)});}
#[no_mangle]pub extern "C" fn test_input(n:u32)->u32{F.with_borrow_mut(|f|{f.input.resize(n as usize,0.0);f.input.as_mut_ptr()as u32})}
fn payload(d:&[f64])->Payload{Payload{identity:id(900.0),source_ship:71,allegiance:Allegiance{team:Some(0),player:Some(true)},damage:197.0,damage_type:0,soft_flux:false,position:[d[1],d[2]],previous:[-60.0,0.0],velocity:[d[3],d[4]],radius:2.0,range_remaining:d[11],rocket:d[13]==1.0,flare:d[14]==1.0,did_damage:d[15]==1.0,moving_ray:d[16]==1.0,intercepts_missiles:d[17]==1.0,target_projectile:if d[18]>0.0{Some(id(d[18]))}else{None},pass_through_missiles:d[19]==1.0,damaged_projectiles:Vec::new(),void_blocked_root:if d[20]>0.0{Some(id(d[20]))}else{None},source_binding:None}}
fn spec(d:&[f64])->Spec{Spec{radius:d[5],core:d[6],duration:d[7],minimum_fraction:d[8],collision:match d[9]as u32{0=>Collision::ShipsAndAsteroids,1=>Collision::MissileFF,2=>Collision::MissileNoFF,3=>Collision::ProjectileFF,_=>Collision::ProjectileNoFF}}}
#[no_mangle]pub extern "C" fn test_reset()->u32{F.with_borrow_mut(|f|{
    let d=&f.input;f.world=World::new();f.explosions=Explosions::default();f.random=random::Random::new(8427);f.visual=random::Random::new(17181);
    for index in 0..4{let x=if index==0{0.0}else{(index as f64)*37.0};let identity=id((index+1)as f64);f.world.ships.push(Ship{identity,root:if index==3&&d[22]==1.0{id(2.0)}else{identity},allegiance:Allegiance{team:Some(if index==0{0}else{1}),player:Some(index==0)},dead:false,collisionless:false,fighter:index==2,position:[x,0.0],facing:0.0,radius:20.0,bounds:if d[24]==1.0{Vec::new()}else{vec![[-18.0,-13.0],[18.0,-13.0],[18.0,13.0],[-18.0,13.0]]},shield:ShieldGeometry{active:d[21]==1.0&&index==1,kind:2,center:[x+3.0,0.0],facing:d[26],arc:d[25],radius:32.0,void:d[22]==1.0&&index==1},cr_taken:1.13,system_shield:1.11,shield_taken:[1.17;4]});}
    for i in 0..3{f.world.missiles.push(Missile{identity:id(100.0+i as f64),source_ship:80+i,allegiance:Allegiance{team:Some(if i==2{0}else{1}),player:Some(i==2)},position:[27.0+i as f64*13.0,2.0],radius:3.0,rocket:true,collision_disabled:false,did_damage:false,flare:i==1,flare_fizzling:false,decoy:false,hp:if d[23]==1.0{100.0}else{1000.0}});}
    f.world.asteroids.push(Asteroid{identity:id(200.0),position:[60.0,30.0],radius:8.0,hp:100.0});0
})}
#[no_mangle]pub extern "C" fn test_run()->u32{F.with_borrow_mut(|f|{
    let d=&f.input;f.world.rows.clear();f.world.block=d[27];let mut p=payload(d);let spec=spec(d);let fuse=Fuse{range:d[10],radius:d[5],core:Some(d[6]),source_explosion:if d[12]==1.0{Some(spec)}else{None}};
    let value=match d[0]as u32{
        0=>{let s=f.world.ships[1].clone();let h=explosion_contact(&s,p.position,d[28]==1.0);f.world.add(vec![30.0,h.point[0],h.point[1],h.distance,h.shield as u32 as f64,shield_distance(&s.shield,p.position),hull_distance(&s,p.position)]);0.0},
        1=>{if f.explosions.spawn(p.clone(),spec,p.position,if d[29]>0.0{Some(id(d[29]))}else{None},None,&mut f.world,&mut f.random,&mut f.visual).is_err(){return 0;}0.0},
        2=>{if f.explosions.advance(d[30],&mut f.world,&mut f.random,&mut f.visual).is_err(){return 0;}0.0},
        3=>fuse_trigger(&p,fuse,&f.world.missiles(),&f.world)as u32 as f64,
        4=>{if fuse_commit(&p,fuse,&mut f.world,&mut f.explosions,&mut f.random,&mut f.visual).is_err(){return 0;}0.0},
        5=>{if let Some(hit)=interception_query(&p,&f.world){f.world.add(vec![31.0,hit.target.id,hit.t,hit.point[0],hit.point[1]]);1.0}else{0.0}},
        7=>{let poly=[[0.0,-10.0],[20.0,-10.0],[20.0,10.0],[0.0,10.0],[0.0,-10.0],[3.0,-3.0],[3.0,3.0],[7.0,3.0],[7.0,-3.0],[3.0,-3.0],[0.0,-10.0]];let t=wreck_hit(p.previous,p.position,&poly).unwrap_or(-1.0);f.world.add(vec![33.0,t]);t},
        _=>{if let Some(hit)=interception_query(&p,&f.world){let result=match interception_commit(&mut p,hit,&mut f.world,&mut f.explosions,None,&mut f.random,&mut f.visual){Ok(r)=>r,Err(_)=>return 0};f.world.add(vec![32.0,result.target.id,result.destroyed as u32 as f64,result.consumes as u32 as f64,p.position[0],p.position[1],p.damaged_projectiles.len()as f64]);1.0}else{0.0}},
    };
    f.output.clear();f.output.extend([value,f.random.cursor,f.visual.cursor,f.world.missiles.len()as f64]);for m in &f.world.missiles{f.output.extend([m.identity.id,m.hp]);}
    f.output.push(f.explosions.active.len()as f64);for e in &f.explosions.active{f.output.extend([e.position[0],e.position[1],e.life,e.ships.len()as f64,e.missiles.len()as f64,e.asteroids.len()as f64,e.screens.len()as f64]);
        for ids in [&e.ships,&e.missiles,&e.asteroids]{for id in ids{f.output.push(id.id);}}
        for s in &e.screens{f.output.extend([s.root.id,s.center[0],s.center[1],s.radius,s.team.map_or(-1.0,|t|t as f64),s.fraction]);}
    }
    f.output.push(f.world.rows.len()as f64);for row in &f.world.rows{f.output.push(row.len()as f64);f.output.extend(row);}f.output.as_ptr()as u32
})}
#[no_mangle]pub extern "C" fn test_output_words()->u32{F.with_borrow(|f|f.output.len()as u32)}
