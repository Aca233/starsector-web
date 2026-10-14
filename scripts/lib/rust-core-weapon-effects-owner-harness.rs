//! Actual resident damage adapter; no production ABI or TS rules callbacks.
#[path="../../native/combat-core/src/random.rs"]mod random;
#[path="../../native/combat-core/src/motion.rs"]mod motion;
#[path="../../native/combat-core/src/flux.rs"]mod flux;
#[path="../../native/combat-core/src/lifecycle.rs"]mod lifecycle;
#[path="../../native/combat-core/src/shield.rs"]mod shield;
#[path="../../native/combat-core/src/armor.rs"]mod armor;
#[path="../../native/combat-core/src/component.rs"]mod component;
#[path="../../native/combat-core/src/weapon.rs"]mod weapon;
#[path="../../native/combat-core/src/engine.rs"]mod engine;
#[path="../../native/combat-core/src/contact.rs"]mod contact;
#[path="../../native/combat-core/src/readiness.rs"]mod readiness;
#[path="../../native/combat-core/src/readiness_owner.rs"]mod readiness_owner;
#[path="../../native/combat-core/src/ship_state.rs"]mod ship_state;
#[path="../../native/combat-core/src/weapon_effects.rs"]mod weapon_effects;
#[path="../../native/combat-core/src/weapon_effects_owner.rs"]mod weapon_effects_owner;
mod battle {
    #[derive(Clone)]pub struct CombatShip {pub size:u32,pub team:u32,pub attrs:[f64;20],pub readiness:Option<crate::readiness_owner::Owned>,pub query:Option<Query>}
    #[derive(Clone)]pub struct Query{pub target:Option<crate::state::Handle>}
    impl CombatShip{pub fn valid(&self)->bool{true}}
}
mod state {
    #[derive(Clone,Copy,PartialEq,Eq)]pub struct Handle{pub slot:u32,pub generation:u32}
    #[derive(Clone)]pub struct Body{pub id:u32,pub handle:Handle,pub order:f64,pub motion:[f64;crate::motion::WIDTH],pub ship:Option<crate::ship_state::ShipState>}
}
use std::cell::RefCell;
use weapon_effects::*;
struct F{input:Vec<f64>,output:Vec<f64>,bodies:Vec<state::Body>,random:random::Random,visual:random::Random,state:BeamEffectState,records:Vec<weapon_effects_owner::Record>,destroyed:u32}
thread_local!{static F:RefCell<F>=RefCell::new(F{input:Vec::new(),output:Vec::new(),bodies:Vec::new(),random:random::Random::new(8127),visual:random::Random::new(15181),state:BeamEffectState::default(),records:Vec::new(),destroyed:0});}
#[no_mangle]pub extern "C" fn test_input(n:u32)->u32{F.with_borrow_mut(|f|{f.input.resize(n as usize,0.0);f.input.as_mut_ptr()as u32})}
#[no_mangle]pub extern "C" fn test_reset()->u32{F.with_borrow_mut(|f|{
    f.random=random::Random::new(8127);f.visual=random::Random::new(15181);f.state=BeamEffectState::default();f.destroyed=0;
    let mut ship=ship_state::ShipState::new(&[100000.0,0.0,1.0,1.0,1.0,0.0,1.0,0.0,0.0,0.0,2.0,1.0,0.0,1.0,0.0,0.0,0.0]);
    ship.armor=Some(armor::Armor::new(&[9.0,7.0,10.0,10.0,27.0,-45.0,-35.0,1000.0,1000.0,1.0,1.0,0.85,1.0,1.0,0.0,0.0,0.0]));
    ship.damage_policy=[1.23,1.13,1.19,1.17,1.09,100.0,1.0,1.0];
    for (i,p) in [[3.0,-4.0],[-7.0,6.0],[21.0,9.0]].iter().enumerate(){ship.components.push(component::Component::new(&[(i+1)as f64,0.0,if i==1{2.0}else{0.0},p[0],p[1],1.0,1.0],&mut f.random));}
    f.bodies=vec![state::Body{id:47,handle:state::Handle{slot:0,generation:1},order:0.0,motion:[0.0;motion::WIDTH],ship:Some(ship)}];0
})}
#[no_mangle]pub extern "C" fn test_run()->u32{F.with_borrow_mut(|f|{
    let d=&f.input;let dead=f.bodies[0].ship.as_ref().unwrap().flags&ship_state::DEAD!=0;
    let target=TargetInput{id:47,dead,fighter:d[1]==1.0,position:[100.0,-50.0],facing:0.27,engines:&[],weapons:&[EmpWeapon{local:[3.0,-4.0],hidden:false},EmpWeapon{local:[-7.0,6.0],hidden:true},EmpWeapon{local:[21.0,9.0],hidden:false}],
        shield:ShieldArc{active:d[2]==1.0,kind:2,center:[102.0,-47.0],facing:0.0,arc_deg:360.0},hard_flux:900.0,max_flux:1000.0,shield_pierced:1.0,cr_damage_taken:1.13,system_shield_multiplier:1.11,shield_efficiency:0.83,energy_shield_multiplier:1.17};
    let beam=BeamInput{has_target:true,brightness:1.0,damage_active:true,dps_duration:d[6],damage_per_second:d[4],damage_multiplier:0.83,base_emp_per_second:d[5],from:[d[7],d[8]],endpoint:[d[7],d[8]],width:7.0,is_player:true,fringe:[39,119,209,255],core:[255,245,235,255]};
    let effect=if d[0]==0.0{Effect::Sabot}else{Effect::Mote};
    let hit=HitInput{effect,point:beam.from,shield:d[2]==1.0,damage:d[4],emp:d[5],high_frequency:d[3]==1.0,outgoing:1.0,facing:0.37,velocity:[7.0,-3.0]};
    f.records.clear();let destroyed=&mut f.destroyed;
    let mut sink=weapon_effects_owner::OwnerSink{bodies:&mut f.bodies,output:&mut f.records,component_source:[1.17,1.09],
        destruction:|b:&mut[state::Body],index:usize,_:&mut random::Random,_:&mut random::Random,_:&mut Vec<weapon_effects_owner::Record>|{b[index].ship.as_mut().unwrap().flags|=ship_state::DEAD;*destroyed+=1;Ok(())},error:None};
    let result=if d[0]==2.0{tachyon(&mut f.state,&beam,Some(&target),&mut f.random,&mut f.visual,&mut sink)}else{hit_ship(hit,&target,&mut f.random,&mut f.visual,&mut sink)};
    if result.is_err()||sink.finish().is_err(){return 0;}
    f.output.clear();let s=f.bodies[0].ship.as_ref().unwrap();let armor=s.armor.as_ref().unwrap();
    f.output.extend([f.random.cursor,f.visual.cursor,f.destroyed as f64,s.flags as f64]);f.output.extend(armor.data);f.output.extend(armor.cells.iter().map(|v|*v as f64));
    f.output.push(armor.scars.len()as f64);for scar in &armor.scars{f.output.extend(*scar);}
    f.output.extend(s.flux.words());for c in &s.components{f.output.extend(c.data);}
    f.output.push(f.records.len()as f64);
    for r in &f.records{let row:Vec<f64>=match r{
        weapon_effects_owner::Record::Notice{notice,..}=>vec![0.0,notice.kind as f64,notice.value,notice.detail[0],notice.detail[1]],
        weapon_effects_owner::Record::ArmorSparks{target,local,armor}=>vec![1.0,*target as f64,local[0],local[1],*armor],
        weapon_effects_owner::Record::EmpArc(a)=>vec![2.0,a.target as f64,a.from[0],a.from[1],a.to[0],a.to[1],a.width],
        weapon_effects_owner::Record::Sound{sound,point,volume,pitch}=>vec![3.0,match sound{Sound::Tachyon(i)=>*i as f64,Sound::MoteEmp=>4.0,Sound::MoteNormal=>5.0,Sound::MoteDamage=>6.0},point[0],point[1],*volume,*pitch],
        weapon_effects_owner::Record::EnergyDamage{player,layer,damage,emp}=>vec![4.0,*player as u32 as f64,if *layer==DamageLayer::Armor{0.0}else{1.0},*damage,*emp],
        _=>vec![5.0],
    };f.output.push(row.len()as f64);f.output.extend(row);}
    f.output.as_ptr()as u32
})}
#[no_mangle]pub extern "C" fn test_output_words()->u32{F.with_borrow(|f|f.output.len()as u32)}
