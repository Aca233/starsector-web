//! Isolated verification ABI; production world owns damage implementations.
#[path="../../native/combat-core/src/random.rs"] mod random;
mod motion { pub const WIDTH:usize=14; pub const X:usize=0;pub const Y:usize=1;pub const FACING:usize=4; }
mod shield {
    pub const NONE:u32=0;pub const FRONT:u32=1;pub const PHASE:u32=3;
    pub struct Shield {pub data:[f64;31]}
    impl Shield {pub fn kind(&self)->u32{self.data[0] as u32}pub fn active(&self)->bool{self.data[1]==1.0}}
}
#[path="../../native/combat-core/src/contact.rs"] mod contact;
#[path="../../native/combat-core/src/weapon_effects.rs"] mod effects;
use std::cell::RefCell;
use effects::*;
struct Fixture {input:Vec<f64>,output:Vec<f64>,state:BeamEffectState,hits:GravitonHits,random:random::Random,visual:random::Random}
thread_local! {static F:RefCell<Fixture>=RefCell::new(Fixture {input:Vec::new(),output:Vec::new(),state:BeamEffectState::default(),hits:GravitonHits::default(),random:random::Random::new(7127),visual:random::Random::new(9181)});}
#[no_mangle] pub extern "C" fn test_input(n:u32)->u32 {F.with_borrow_mut(|f| {f.input.resize(n as usize,0.0);f.input.as_mut_ptr() as u32})}
#[no_mangle] pub extern "C" fn test_reset()->u32 {F.with_borrow_mut(|f| {f.state=BeamEffectState::default();f.hits=GravitonHits::default();f.random=random::Random::new(7127);f.visual=random::Random::new(9181);0})}
fn effect(n:f64)->Effect {match n as u32{0=>Effect::Tachyon,1=>Effect::Graviton,2=>Effect::Sabot,3=>Effect::Mote,4=>Effect::HyperionYamato,_=>Effect::GlorianaSiege}}
struct Records { rows:Vec<Vec<f64>> }
impl Records { fn add(&mut self,row:Vec<f64>) {self.rows.push(row);} }
impl Sink for Records {
    fn armor_energy(&mut self,t:u32,p:contact::Point,d:f64,_:&mut random::Random)->Result<Damage,u32> {self.add(vec![1.0,t as f64,p[0],p[1],d]);Ok(Damage{armor:d*0.7,hull:d*0.3})}
    fn hull(&mut self,t:u32,d:f64) {self.add(vec![2.0,t as f64,d]);}
    fn components(&mut self,t:u32,p:contact::Point,d:Damage,e:f64,_:&mut random::Random)->Result<(),u32> {self.add(vec![3.0,t as f64,p[0],p[1],d.armor,d.hull,e]);Ok(())}
    fn shield_flux(&mut self,t:u32,a:f64,h:bool) {self.add(vec![4.0,t as f64,a,h as u32 as f64]);}
    fn armor_sparks(&mut self,t:u32,p:contact::Point,a:f64) {self.add(vec![5.0,t as f64,p[0],p[1],a]);}
    fn emp_arc(&mut self,a:EmpArc) {self.add(vec![6.0,a.target as f64,a.from[0],a.from[1],a.to[0],a.to[1],a.width,a.fringe[0] as f64,a.fringe[1] as f64,a.fringe[2] as f64,a.fringe[3] as f64,a.core[0] as f64,a.core[1] as f64,a.core[2] as f64,a.core[3] as f64]);}
    fn sound(&mut self,s:Sound,p:contact::Point,v:f64,pitch:f64) {self.add(vec![7.0,match s{Sound::Tachyon(i)=>i as f64,Sound::MoteEmp=>4.0,Sound::MoteNormal=>5.0,Sound::MoteDamage=>6.0},p[0],p[1],v,pitch]);}
    fn record_energy(&mut self,player:bool,layer:DamageLayer,d:f64,e:f64) {self.add(vec![8.0,player as u32 as f64,if layer==DamageLayer::Armor{0.0}else{1.0},d,e]);}
    fn destroy_if_dead(&mut self,t:u32,_:&mut random::Random,_:&mut random::Random) {self.add(vec![9.0,t as f64]);}
    fn cosmetic(&mut self,c:CosmeticImpact) {
        self.add(vec![10.0,if c.effect==Effect::HyperionYamato{4.0}else{5.0},c.position[0],c.position[1],c.radius,c.max_radius,c.life,c.rotation,c.color[0] as f64,c.color[1] as f64,c.color[2] as f64,c.shockwave as u32 as f64,c.shockwave_radius,c.max_shockwave_radius,c.puff_duration]);
        for p in c.puffs {self.add(vec![11.0,p.texture as f64,p.offset[0],p.offset[1],p.velocity[0],p.velocity[1],p.start_size,p.end_size,p.rotation]);}
        if let Some(p)=c.flare {self.add(vec![12.0,p.width,p.height,p.color[0] as f64,p.color[1] as f64,p.color[2] as f64,p.velocity[0],p.velocity[1]]);}
        if let Some(p)=c.flash {self.add(vec![13.0,p.diameter,p.core_diameter,p.color[0] as f64,p.color[1] as f64,p.color[2] as f64,p.duration,p.velocity[0],p.velocity[1]]);}
    }
}
#[no_mangle] pub extern "C" fn test_run()->u32 {F.with_borrow_mut(|f| {
    let d=&f.input;
    let eng_all=[[-12.0,7.0],[18.0,-11.0],[100001.0,0.0]];
    let weap_all=[EmpWeapon{local:[3.0,-4.0],hidden:false},EmpWeapon{local:[-7.0,6.0],hidden:true},EmpWeapon{local:[21.0,9.0],hidden:false}];
    let eng:Vec<_>=eng_all.into_iter().enumerate().filter(|(i,_)|(d[29] as u32)&(1<<i)!=0).map(|(_,p)|p).collect();
    let weapons:Vec<_>=weap_all.into_iter().enumerate().filter(|(i,_)|(d[30] as u32)&(1<<i)!=0).map(|(_,p)|p).collect();
    let shield=ShieldArc{active:d[6]==1.0,kind:d[7] as u32,center:[d[8],d[9]],facing:d[10],arc_deg:d[11]};
    let target=TargetInput{id:47,dead:d[20]==1.0,fighter:d[19]==1.0,position:[d[16],d[17]],facing:d[18],engines:&eng,weapons:&weapons,shield,
        hard_flux:d[21],max_flux:d[22],shield_pierced:d[23],cr_damage_taken:d[24],system_shield_multiplier:1.11,shield_efficiency:0.83,energy_shield_multiplier:1.17};
    let beam=BeamInput{has_target:d[4]==1.0,brightness:d[1],damage_active:d[2]==1.0,dps_duration:d[3],damage_per_second:d[36],damage_multiplier:d[38],base_emp_per_second:d[37],from:[d[12],d[13]],endpoint:[d[14],d[15]],width:7.0,is_player:true,fringe:[39,119,209,255],core:[255,245,235,255]};
    let hit=HitInput{effect:effect(d[28]),point:beam.from,shield:d[27]==1.0,damage:d[36],emp:d[37],high_frequency:d[26]==1.0,outgoing:d[25],facing:d[41],velocity:[d[39],d[40]]};
    let mut records=Records{rows:Vec::new()};let value=match d[0] as u32 {
        0=>f.state.tachyon_interval(&beam,&mut f.random) as u32 as f64,
        1=>{let p=pick_emp_target(&target,beam.from,&mut f.random);records.add(vec![20.0,p.local[0],p.local[1],p.weight,match p.kind{EmpKind::Engine=>0.0,EmpKind::Weapon=>1.0,EmpKind::Center=>2.0},p.index as f64]);0.0},
        2=>within_emp_arc(shield,beam.from) as u32 as f64,
        3=>graviton(&mut f.state,&beam,if beam.has_target{Some(&target)}else{None},if d[5]==1.0{Some(WeaponIdentity{source:d[32] as u32,slot:d[33] as u32,generation:d[34] as u32,component:d[35] as u32})}else{None},&mut f.hits) as u32 as f64,
        4=>{if hit_ship(hit,&target,&mut f.random,&mut f.visual,&mut records).is_err(){return 0;}0.0},
        5=>{if tachyon(&mut f.state,&beam,if beam.has_target{Some(&target)}else{None},&mut f.random,&mut f.visual,&mut records).is_err(){return 0;}0.0},
        6=>f.hits.advance(d[31]).unwrap_or(0.0),
        7=>{if let Some(c)=cosmetic(hit.effect,hit.point,hit.velocity,hit.facing,hit.shield){records.cosmetic(c);}0.0},
        _=>mote_projectile_damage(d[26]==1.0,d[25],d[42]==1.0,13.0,1.09,17.0,1.21,d[43]==1.0),
    };
    f.output.clear();f.output.extend([value,f.random.cursor,f.visual.cursor,f.state.tachyon.is_some() as u32 as f64]);
    if let Some(s)=&f.state.tachyon {f.output.extend([s.interval,s.elapsed,s.interval_elapsed as u32 as f64,s.was_zero as u32 as f64]);}else{f.output.extend([0.0;4]);}
    f.output.extend([f.state.graviton_was_zero as u32 as f64,f.hits.hits.len() as f64]);
    for (w,t) in &f.hits.hits {f.output.extend([w.source as f64,w.slot as f64,w.generation as f64,w.component as f64,*t]);}
    f.output.push(records.rows.len() as f64);for row in records.rows {f.output.push(row.len() as f64);f.output.extend(row);}
    f.output.as_ptr() as u32
})}
#[no_mangle]pub extern "C" fn test_output_words()->u32{F.with_borrow(|f| f.output.len() as u32)}
