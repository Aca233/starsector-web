//! Bounded startup JSON and complete pure constructor decoding. No serde/network
//! dependency and no deserialization of evolving ShipState or RNG trackers.
use crate::{battle,flight_owner as o,flight_world as f,lifecycle::Spec,ship_effects as e};
use std::collections::{BTreeMap,BTreeSet};

#[derive(Clone)]pub enum Value{Number(f64),Bool(bool),String(String),Array(Vec<Value>),Object(BTreeMap<String,Value>),Null}
pub struct Object<'a>{map:&'a BTreeMap<String,Value>,used:BTreeSet<&'a str>}
impl Value{
    pub fn object(&self)->Result<Object<'_>,u32>{if let Self::Object(map)=self{Ok(Object{map,used:BTreeSet::new()})}else{Err(2)}}
    pub fn array(&self)->Result<&[Value],u32>{if let Self::Array(v)=self{Ok(v)}else{Err(2)}}
    pub fn number(&self)->Result<f64,u32>{if let Self::Number(n)=self{Ok(*n)}else{Err(2)}}
    pub fn int(&self)->Result<u32,u32>{integer(self.number()?)}
    pub fn bool(&self)->Result<bool,u32>{if let Self::Bool(b)=self{Ok(*b)}else{Err(2)}}
    pub fn text(&self)->Result<&str,u32>{if let Self::String(s)=self{Ok(s)}else{Err(2)}}
    pub fn numbers<const N:usize>(&self)->Result<[f64;N],u32>{let a=self.array()?;if a.len()!=N{return Err(2);}let mut out=[0.0;N];for(i,v)in a.iter().enumerate(){out[i]=v.number()?;}Ok(out)}
}
impl<'a> Object<'a>{
    pub fn get(&mut self,key:&str)->Result<&'a Value,u32>{let(k,v)=self.map.get_key_value(key).ok_or(8u32)?;self.used.insert(k.as_str());Ok(v)}
    pub fn optional(&mut self,key:&str)->Option<&'a Value>{self.map.get_key_value(key).map(|(k,v)|{self.used.insert(k.as_str());v})}
    pub fn done(self)->Result<(),u32>{if self.used.len()==self.map.len(){Ok(())}else{Err(8)}}
}
pub fn integer(n:f64)->Result<u32,u32>{if n.is_finite()&&n>=0.0&&n<=u32::MAX as f64&&n.fract()==0.0{Ok(n as u32)}else{Err(2)}}
fn flag(n:f64)->Result<bool,u32>{match n{0.0=>Ok(false),1.0=>Ok(true),_=>Err(2)}}
fn nonempty(v:&Value)->Result<String,u32>{let s=v.text()?;if s.is_empty(){Err(8)}else{Ok(s.to_owned())}}
fn opt_number(v:Option<&Value>)->Result<Option<f64>,u32>{v.map(Value::number).transpose()}
pub fn parse(units:&[u16])->Result<Value,u32>{
    if units.is_empty()||units.len()>16_000_000{return Err(2);}let s=String::from_utf16(units).map_err(|_|2u32)?;
    let mut p=Parser{data:s.as_bytes(),at:0,nodes:0};let value=p.value(0)?;p.space();if p.at!=p.data.len(){return Err(2);}Ok(value)
}
struct Parser<'a>{data:&'a[u8],at:usize,nodes:usize}
impl Parser<'_>{
    fn space(&mut self){while self.at<self.data.len()&&matches!(self.data[self.at],b' '|b'\t'|b'\r'|b'\n'){self.at+=1;}}
    fn byte(&mut self,b:u8)->Result<(),u32>{if self.data.get(self.at)!=Some(&b){return Err(2);}self.at+=1;Ok(())}
    fn literal(&mut self,s:&[u8])->Result<(),u32>{if self.data.get(self.at..self.at+s.len())!=Some(s){return Err(2);}self.at+=s.len();Ok(())}
    fn hex(&mut self)->Result<u16,u32>{let mut n=0u16;for _ in 0..4{let b=*self.data.get(self.at).ok_or(2u32)?;self.at+=1;let d=match b{b'0'..=b'9'=>b-b'0',b'a'..=b'f'=>b-b'a'+10,b'A'..=b'F'=>b-b'A'+10,_=>return Err(2)};n=n*16+d as u16;}Ok(n)}
    fn string(&mut self)->Result<String,u32>{self.byte(b'"')?;let mut units=Vec::new();loop{let b=*self.data.get(self.at).ok_or(2u32)?;self.at+=1;
        if b==b'"'{return String::from_utf16(&units).map_err(|_|2);}if b<32{return Err(2);}if b==b'\\'{let escaped=*self.data.get(self.at).ok_or(2u32)?;self.at+=1;
            units.push(match escaped{b'"'=>34,b'\\'=>92,b'/'=>47,b'b'=>8,b'f'=>12,b'n'=>10,b'r'=>13,b't'=>9,b'u'=>self.hex()?,_=>return Err(2)});
        }else if b<128{units.push(b as u16);}else{self.at-=1;let count=match b{0xc2..=0xdf=>2,0xe0..=0xef=>3,0xf0..=0xf4=>4,_=>return Err(2)};
            let bytes=self.data.get(self.at..self.at+count).ok_or(2u32)?;let c=std::str::from_utf8(bytes).map_err(|_|2u32)?.chars().next().ok_or(2u32)?;self.at+=count;let mut buffer=[0u16;2];units.extend_from_slice(c.encode_utf16(&mut buffer));}
        if units.len()>1_000_000{return Err(2);}
    }}
    fn value(&mut self,depth:usize)->Result<Value,u32>{self.space();self.nodes+=1;if depth>64||self.nodes>2_000_000{return Err(2);}let b=*self.data.get(self.at).ok_or(2u32)?;
        match b{
            b'"'=>Ok(Value::String(self.string()?)),b't'=>{self.literal(b"true")?;Ok(Value::Bool(true))},b'f'=>{self.literal(b"false")?;Ok(Value::Bool(false))},b'n'=>{self.literal(b"null")?;Ok(Value::Null)},
            b'['=>{self.at+=1;self.space();let mut out=Vec::new();if self.data.get(self.at)==Some(&b']'){self.at+=1;return Ok(Value::Array(out));}loop{out.push(self.value(depth+1)?);if out.len()>1_000_000{return Err(2);}self.space();match self.data.get(self.at){Some(b']')=>{self.at+=1;break},Some(b',')=>self.at+=1,_=>return Err(2)}}Ok(Value::Array(out))},
            b'{'=>{self.at+=1;self.space();let mut out=BTreeMap::new();if self.data.get(self.at)==Some(&b'}'){self.at+=1;return Ok(Value::Object(out));}loop{self.space();let key=self.string()?;self.space();self.byte(b':')?;let v=self.value(depth+1)?;if out.insert(key,v).is_some(){return Err(8);}self.space();match self.data.get(self.at){Some(b'}')=>{self.at+=1;break},Some(b',')=>self.at+=1,_=>return Err(2)}}Ok(Value::Object(out))},
            b'-'|b'0'..=b'9'=>{let begin=self.at;if b==b'-'{self.at+=1;}match self.data.get(self.at){Some(b'0')=>self.at+=1,Some(b'1'..=b'9')=>{self.at+=1;while self.data.get(self.at).is_some_and(u8::is_ascii_digit){self.at+=1;}},_=>return Err(2)}
                if self.data.get(self.at)==Some(&b'.'){self.at+=1;let start=self.at;while self.data.get(self.at).is_some_and(u8::is_ascii_digit){self.at+=1;}if start==self.at{return Err(2);}}
                if self.data.get(self.at).is_some_and(|b|*b==b'e'||*b==b'E'){self.at+=1;if self.data.get(self.at).is_some_and(|b|*b==b'+'||*b==b'-'){self.at+=1;}let start=self.at;while self.data.get(self.at).is_some_and(u8::is_ascii_digit){self.at+=1;}if start==self.at{return Err(2);}}
                let n=std::str::from_utf8(&self.data[begin..self.at]).map_err(|_|2u32)?.parse::<f64>().map_err(|_|2u32)?;if !n.is_finite(){return Err(2);}Ok(Value::Number(n))},_=>Err(2)
        }
    }
}
pub fn role(v:&Value)->Result<f::CraftRole,u32>{Ok(match v.text()?{"ORDINARY"=>f::CraftRole::Ordinary,"ARK_INTERCEPTOR"=>f::CraftRole::ArkInterceptor,"ARK_STRIKER"=>f::CraftRole::ArkStriker,"FURY"=>f::CraftRole::Fury,"STARHAWK"=>f::CraftRole::Starhawk,"THUNDERHAWK"=>f::CraftRole::Thunderhawk,_=>return Err(8)})}
pub fn footprint(v:&Value)->Result<f::Footprint,u32>{let mut p=v.object()?;let radius=p.get("radius")?.number()?;let width=p.get("width")?.number()?;let height=p.get("height")?.number()?;let pivot_x=p.get("pivotX")?.number()?;let pivot_y=p.get("pivotY")?.number()?;
    let bounds=p.get("bounds")?.array()?.iter().map(|p|{let [x,y]=p.numbers()?;Ok(f::Vec2{x,y})}).collect::<Result<_,u32>>()?;p.done()?;if radius<0.0||width<0.0||height<0.0{return Err(2);}Ok(f::Footprint{radius,width,height,pivot_x,pivot_y,bounds})}
pub fn stats(v:&Value)->Result<f::CarrierStats,u32>{let mut p=v.object()?;let out=f::CarrierStats{range_multiplier:p.get("rangeMultiplier")?.number()?,refit_multiplier:p.get("refitMultiplier")?.number()?,rearm_fraction:p.get("rearmFraction")?.number()?,decrease_multiplier:p.get("decreaseMultiplier")?.number()?,increase_percent:p.get("increasePercent")?.number()?,increase_multiplier:p.get("increaseMultiplier")?.number()?,reserve_deck:p.get("reserveDeck")?.bool()?,point_defense_skill:opt_number(p.optional("pointDefenseSkill"))?};p.done()?;Ok(out)}
pub fn wing(v:&Value)->Result<f::WingSpec,u32>{let mut p=v.object()?;let out=f::WingSpec{template:p.get("template")?.int()?,spec_id:nonempty(p.get("specId")?)?,role:match p.get("role")?.text()?{"FIGHTER"=>f::WingRole::Fighter,"BOMBER"=>f::WingRole::Bomber,_=>return Err(8)},tags:p.get("tags")?.array()?.iter().map(nonempty).collect::<Result<_,_>>()?,count:p.get("count")?.int()?as usize,rebuild_seconds:opt_number(p.optional("rebuildSeconds"))?,range:opt_number(p.optional("range"))?,special_name:p.get("specialName")?.bool()?};p.done()?;
    if out.template==0||out.count==0||out.rebuild_seconds.is_some_and(|v|v<0.0)||out.range.is_some_and(|v|v<0.0){return Err(2);}Ok(out)}
fn modifiers(v:&Value)->Result<e::Modifiers,u32>{let mut p=v.object()?;let scalars=["disableWeapons","disableDefense","disableMotion","disableVenting","disableSystems","collisionDisabled","visualAlphaMultiplier","sightRadiusFlat","sightRadiusPercent","shieldDamageMultiplier","shieldUpkeepMultiplier","hullDamageMultiplier","armorDamageMultiplier","empDamageMultiplier","repairTimeMultiplier","timeMultiplier","beamDamageMultiplier","recoilMultiplier","fighterDamageMultiplier","hardFluxPerSecond","softFluxPerSecond","speedFlat","speedPercent","accelerationFlat","decelerationFlat","dissipationMultiplier","zeroFluxBoostSuppressed","accelerationPercent","decelerationPercent","turnRateFlat","turnRatePercent","turnAccelerationFlat","turnAccelerationPercent"];
    let mut m=e::Modifiers::default();for(i,key)in scalars.iter().enumerate(){if let Some(v)=p.optional(key){m.set(i,v.number()?);}}
    if let Some(v)=p.optional("weapons"){let mut w=v.object()?;for(kind,key)in ["BALLISTIC","ENERGY","MISSILE"].iter().enumerate(){if let Some(v)=w.optional(key){let mut fields=v.object()?;for(i,key)in ["damageMultiplier","rateOfFireMultiplier","fluxCostMultiplier","rangePercent","projectileSpeedPercent","ammoRegenMultiplier"].iter().enumerate(){if let Some(v)=fields.optional(key){m.weapon(kind,i,v.number()?);}}fields.done()?;}}w.done()?;}p.done()?;Ok(m)}
fn hook(v:&Value)->Result<o::InstallHook,u32>{let mut p=v.object()?;let out=match p.get("kind")?.text()?{"LOCK_SHIELD"=>o::InstallHook::LockShield,"RUNTIME"=>{let id=match p.get("id")?.text()?{"web_gloriana_emergency_bulkheads"=>1,"phase_anchor"=>0xfffc0001,"phase_anchor_emergency"=>0xfffc0002,"shield_always_on"=>0xfffc0003,"escort_package"=>0xfffc0004,_=>return Err(8)};o::InstallHook::Runtime{id,modifiers:modifiers(p.get("modifiers")?)?}},_=>return Err(8)};p.done()?;Ok(out)}
fn lifecycle(v:&Value)->Result<Spec,u32>{let mut p=v.object()?;let active=p.get("active")?;let active=if matches!(active,Value::String(s)if s=="INFINITY"){f64::INFINITY}else{active.number()?};let out=Spec{up:p.get("chargeUp")?.number()?,active,down:p.get("chargeDown")?.number()?,cooldown:p.get("cooldown")?.number()?,max_charges:p.get("maxCharges")?.number()?,initial_charges:opt_number(p.optional("initialCharges"))?.unwrap_or(-1.0),regen:p.get("chargeRegen")?.number()?,flux_cost:p.get("fluxCostPerUse")?.number()?,flags:p.get("flags")?.int()?,max_duration:0.0};p.done()?;
    if [out.up,out.active,out.down,out.cooldown,out.max_charges,out.regen,out.flux_cost].iter().any(|n|*n<0.0)||out.initial_charges< -1.0||out.flags>8191{return Err(2);}let mut out=out;out.max_duration=if out.active.is_finite()&&out.active>0.0{out.active}else{out.up+out.down};Ok(out)}
pub fn same_spec(a:&Spec,b:&Spec)->bool{a.up==b.up&&a.active==b.active&&a.down==b.down&&a.cooldown==b.cooldown&&a.max_charges==b.max_charges&&a.initial_charges==b.initial_charges&&a.regen==b.regen&&a.flux_cost==b.flux_cost&&a.flags==b.flags}
fn death(v:&Value,size:u32,fp:&f::Footprint)->Result<crate::world_owner::Meta,u32>{let mut p=v.object()?;let spec_id=nonempty(p.get("specId")?)?;let stable_id=nonempty(p.get("stableId")?)?;let ship_name=nonempty(p.get("shipName")?)?;let hull_name=nonempty(p.get("hullName")?)?;
    let mut row=vec![p.get("explosionDamage")?.number()?,p.get("explosionRadius")?.number()?,p.get("breakProbability")?.number()?,p.get("minPieces")?.number()?,p.get("maxPieces")?.number()?];
    for key in ["explosionColor","flashColor","debrisColor"]{let a=p.get(key)?.numbers::<3>()?;if a.iter().any(|v|integer(*v).is_err()||*v>255.0){return Err(2);}row.extend(a);}
    row.extend([p.optional("transient").map(Value::bool).transpose()?.unwrap_or(false)as u32 as f64,p.get("spriteHeight")?.number()?,p.get("missileDamagePercent")?.number()?,p.get("missileDamageMultiplier")?.number()?]);
    if row[..5].iter().any(|n|*n<0.0)||row[2]>1.0||row[4]<row[3]||row[15]<0.0||row[17]<0.0{return Err(2);}let bounds=fp.bounds.iter().map(|p|[p.x,p.y]).collect::<Vec<_>>();let mut out=crate::world_owner::Meta::new(&row,size,fp.radius,&bounds);
    out.strings=[spec_id.encode_utf16().collect(),ship_name.encode_utf16().collect(),hull_name.encode_utf16().collect(),stable_id.encode_utf16().collect()];out.spec.id=spec_id;out.ship_name=ship_name;out.hull_name=hull_name;
    for v in p.get("slots")?.array()?{let mut s=v.object()?;let id=s.get("id")?.int()?;let pos=s.get("position")?.numbers()?;s.done()?;if out.spec.mount_slots.contains(&id){return Err(8);}out.spec.mount_slots.push(id);out.slot_positions.push((id,pos));}
    let offset=p.optional("moduleOffset").map(Value::numbers::<2>).transpose()?.unwrap_or([0.0;2]);out.terrain=Some([p.get("mass")?.number()?,p.optional("station").map(Value::bool).transpose()?.unwrap_or(false)as u32 as f64,offset[0],offset[1],opt_number(p.optional("moduleAngle"))?.unwrap_or(0.0),p.optional("independentRotation").map(Value::bool).transpose()?.unwrap_or(false)as u32 as f64]);p.done()?;
    if out.terrain.unwrap()[0]<=0.0||!out.complete()||!out.valid(){return Err(2);}Ok(out)}

pub fn static_ship(key:&str,raw:&BTreeMap<String,&Value>,specs:&mut BTreeMap<u32,Spec>,trail:&mut Vec<String>)->Result<o::StaticShip,u32>{
    if trail.len()>32||trail.iter().any(|k|k==key){return Err(8);}trail.push(key.to_owned());let mut p=raw.get(key).ok_or(8u32)?.object()?;
    let spec_id=nonempty(p.get("specId")?)?;let carrier_spec_key=nonempty(p.get("carrierSpecKey")?)?;let fp=footprint(p.get("footprint")?)?;let role=role(p.get("role")?)?;let hull_size=p.get("hullSize")?.int()?;
    let flux=p.get("flux")?.numbers()?;let armor=p.get("armor")?.numbers()?;let armor_stats=p.get("armorStats")?.numbers()?;let mut sh=p.get("shield")?.object()?;let shield=o::ShieldTemplate{install:sh.get("install")?.numbers()?,damage:sh.get("damage")?.numbers()?,void:sh.optional("void").map(Value::numbers::<5>).transpose()?};sh.done()?;
    let mounts=p.get("mounts")?.array()?.iter().map(|v|{let mut m=v.object()?;let out=o::MountTemplate{slot:nonempty(m.get("slot")?)?,generation:m.get("generation")?.int()?,component:m.get("component")?.numbers()?,install:m.get("install")?.numbers()?,min_spread:m.get("minSpread")?.number()?,fire:fire_rows(m.get("fireRows")?)?,system_only:m.get("systemOnly")?.bool()?,max_ammo_present:m.get("maxAmmoPresent")?.bool()?,regen_present:m.get("regenPresent")?.bool()?,guided_speed:opt_number(m.optional("guidedSpeed"))?};m.done()?;Ok(out)}).collect::<Result<Vec<_>,u32>>()?;
    let groups=p.get("groups")?.array()?.iter().map(|v|{let mut g=v.object()?;let out=o::GroupTemplate{index:g.get("index")?.int()?,linked:g.get("linked")?.bool()?,automatic:g.get("automatic")?.bool()?,members:g.get("members")?.array()?.iter().map(Value::int).collect::<Result<_,_>>()?};g.done()?;Ok(out)}).collect::<Result<Vec<_>,u32>>()?;
    let selected=p.optional("selected").map(Value::int).transpose()?.map(|n|n as usize);let damage_policy=p.get("damagePolicy")?.numbers()?;let weapon_policy=p.get("weaponPolicy")?.numbers()?;
    let mut systems=Vec::new();for v in p.get("systems")?.array()?{let mut s=v.object()?;let spec=s.get("spec")?.int()?;let d=lifecycle(s.get("definition")?)?;if let Some(old)=specs.get(&spec){if !same_spec(old,&d){return Err(8);}}else{specs.insert(spec,d);}
        let out=o::SystemTemplate{id:s.get("id")?.int()?,spec,defense:s.get("defense")?.bool()?,upkeep:s.get("upkeep")?.numbers()?,kind:e::Kind::from_id(s.get("kind")?.text()?).or_else(||match s.get("kind").ok()?.text().ok()?{"ECLIPSE"=>Some(e::Kind::Eclipse),"EDICT"=>Some(e::Kind::Edict),"YAMATO"=>Some(e::Kind::Yamato),"JUMP"=>Some(e::Kind::Jump),"ARK_FORGE"=>Some(e::Kind::ArkForge),"ARK_BARRIER"=>Some(e::Kind::ArkBarrier),"ARK_REPAIR"=>Some(e::Kind::ArkRepair),"ROC_ATTITUDE"=>Some(e::Kind::RocAttitude),"ROC_FIRE"=>Some(e::Kind::RocFire),"ZHEFENG"=>Some(e::Kind::Zhefeng),"GRAVITY_WELL"=>Some(e::Kind::GravityWell),"GRAVITY_BATTLE_WELL"=>Some(e::Kind::GravityBattleWell),"GRAVITY_OTHER"=>Some(e::Kind::GravityOther),_=>None}).ok_or(8u32)?};s.done()?;systems.push(out);}
    let mut children=Vec::new();for v in p.get("children")?.array()?{let mut m=v.object()?;let template=m.get("template")?.text()?;let offset=m.get("offset")?.numbers()?;let angle=m.get("angle")?.number()?;let independent=m.get("independent")?.bool()?;let manual=m.get("manual")?.bool()?;m.done()?;children.push(o::ModuleTemplate{template:Box::new(static_ship(template,raw,specs,trail)?),offset,angle,independent,manual});}
    let engines=p.get("engines")?.array()?.iter().map(Value::numbers::<10>).collect::<Result<_,_>>()?;let engine_health=p.get("engineHealth")?.number()?;let engine_motion=p.get("engineMotion")?.numbers()?;let engine_policy=p.get("enginePolicy")?.numbers()?;
    let attrs=p.get("attrs")?.numbers()?;let shield_pierced=p.get("shieldPierced")?.number()?;let motion_flags=p.get("motionFlags")?.int()?;let query=p.get("query")?.numbers()?;let mut visible=BTreeMap::new();for v in p.get("visible")?.array()?{let mut m=v.object()?;let team=m.get("team")?.int()?;let is=m.get("visible")?.bool()?;m.done()?;if visible.insert(team,is).is_some(){return Err(8);}}
    let readiness=p.get("readiness")?.numbers()?;let death=death(p.get("death")?,hull_size,&fp)?;let world_flags=p.get("worldFlags")?.int()?;let range_multiplier=p.get("rangeMultiplier")?.number()?;let side=p.get("side")?.number()?;if ![-1.0,0.0,1.0].contains(&side){return Err(2);}let muzzle=p.optional("muzzle").map(Value::numbers::<2>).transpose()?;
    let wings=p.get("wings")?.array()?.iter().map(wing).collect::<Result<_,_>>()?;let bays=p.get("bays")?.int()?as usize;let carrier_stats=stats(p.get("carrierStats")?)?;let hooks=p.get("hooks")?.array()?.iter().map(hook).collect::<Result<_,_>>()?;let hooks_complete=p.get("hooksComplete")?.bool()?;
    let spawn_admission=p.optional("spawnAdmission").map(crate::flight_admission::decode).transpose()?;if spawn_admission.as_ref().is_some_and(|s|s.spec_key!=key){return Err(8);}p.done()?;trail.pop();
    let out=o::StaticShip{spec_id,carrier_spec_key,footprint:fp,role,hull_size,flux,armor,armor_stats,shield,damage_policy,mounts,groups,selected,weapon_policy,systems,children,engine_health,engines,engine_motion,engine_policy,attrs,shield_pierced,motion_flags,query,visible,readiness,death,world_flags,range_multiplier,side:side as i32,muzzle,wings,bays,carrier_stats,hooks,hooks_complete,spawn_admission};out.validate(specs).map_err(crate::flight_runtime::error)?;Ok(out)
}

fn fire_rows(v:&Value)->Result<battle::FireEntry,u32>{let mut entry=None;let mut seen=BTreeSet::new();let mut index=None;
    for row in v.array()?{let words=row.numbers::<23>()?;let tag=integer(words[0])?;let r=&words[1..];let n=integer(r[0])?;if index.is_some_and(|i|i!=n){return Err(8);}index=Some(n);
        let used=match tag{52|87=>22,53=>9,92=>11,54=>4,55|68|69|88=>21,60=>15,71|81=>13,67|89=>20,70=>7,79|90=>3,
            91|93=>{let count=integer(r[3])?as usize;if count==0||count>18{return Err(2);}4+count},_=>return Err(8)};
        if r[used..].iter().any(|v|*v!=0.0){return Err(2);}
        let branch=if (87..=93).contains(&tag){integer(r[1])?}else{0};if !matches!(tag,54|71|91|93)&&!seen.insert((tag,branch)){return Err(8);}match tag{
            52=>{if r[1]<1.0||integer(r[1]).is_err()||[2,3,9,10,20].iter().any(|i|flag(r[*i]).is_err())||integer(r[21]).is_err(){return Err(2);}entry=Some(battle::FireEntry::new(r));}
            53=>{let e=entry.as_mut().ok_or(8u32)?;if [1,2,4].iter().any(|i|flag(r[*i]).is_err())||r[6..9].iter().any(|n|*n<0.0){return Err(2);}e.configure(r);}
            54=>{let e=entry.as_mut().ok_or(8u32)?;if r[1]!=e.spec.offsets.len()as f64||e.spec.offsets.len()>=e.offsets{return Err(8);}e.spec.offsets.push([r[2],r[3]]);}
            55|69=>{let d=&r[1..];if integer(d[0])?>4||integer(d[3])?>3||integer(d[4])?>3||[6,9,11,14,15,16,17,19].iter().any(|i|flag(d[*i]).is_err())||[1,2,5,7,10,12,13,18].iter().any(|i|d[*i]<0.0){return Err(2);}let e=entry.as_mut().ok_or(8u32)?;
                if tag==55{e.delivery=Some(crate::projectile::Delivery::new(d));}else{let g=e.delivery.as_mut().and_then(|d|d.guidance.as_mut()).ok_or(8u32)?;if g.mirv.is_none()||d[11]!=0.0{return Err(8);}g.child=Some(Box::new(crate::projectile::Delivery::new(d)));}}
            60=>{if integer(r[1])?&!254!=0||integer(r[2])?>511||r[4]>360.0||r[4..8].iter().any(|n|*n<0.0)||[8,9,13,14].iter().any(|i|flag(r[*i]).is_err())||r[10]<0.0||integer(r[11]).is_err()||r[12]<0.0{return Err(2);}entry.as_mut().ok_or(8u32)?.query=Some(crate::fire_query::MountQuery::new(r));}
            67=>{let d=entry.as_mut().and_then(|e|e.delivery.as_mut()).ok_or(8u32)?;let r=&r[1..];if [0,1,2,3,5,7,9,11,13,15,17,18].iter().any(|i|flag(r[*i]).is_err())||[4,6,8,10,12,14,16].iter().any(|i|r[*i]<0.0){return Err(2);}d.guidance=Some(crate::missile_owner::Spec::new(r));}
            68=>{let g=entry.as_mut().and_then(|e|e.delivery.as_mut()).and_then(|d|d.guidance.as_mut()).ok_or(8u32)?;let r=&r[1..];if [3,9,16,18].iter().any(|i|flag(r[*i]).is_err())||r[..20].iter().any(|v|*v<0.0)||integer(r[7])?>3||integer(r[15]).is_err()||integer(r[19])?>4||r[4]<1.0||r[4]>4096.0{return Err(2);}
                g.mirv=Some(crate::missile_guidance::Mirv{split_range:r[0],split_range_range:r[1],min_time:r[2],can_split_early:r[3]==1.0,shots:r[4],damage:r[5],emp:r[6],damage_type:r[7]as u32,child_hitpoints:r[8],even_spread:r[9]==1.0,arc_degrees:r[10],inaccuracy_degrees:r[11],spread_speed:r[12],spread_speed_range:r[13],projectile_range:r[14],child_spec:r[15]as u32,child_radius:if r[16]==1.0{Some(r[17])}else{None},child_spawn_type:if r[18]==1.0{Some(r[19]as u32)}else{None}});}
            70=>{let g=entry.as_mut().and_then(|e|e.delivery.as_mut()).and_then(|d|d.guidance.as_mut()).ok_or(8u32)?;if integer(r[1])?>2||r[2..7].iter().any(|n|*n<0.0){return Err(2);}g.flare=Some(crate::missile_guidance::FlareSpec{mode:match r[1]as u32{1=>crate::missile_guidance::FlareMode::Seeker,2=>crate::missile_guidance::FlareMode::Jammer,_=>crate::missile_guidance::FlareMode::Standard},effect_range:r[2],effect_chance:r[3],flameout_time:r[4],fade_time:r[5]});g.flare_life=Some(r[6]);}
            71=>{let e=entry.as_mut().ok_or(8u32)?;let effect=crate::effect_owner::kind(integer(r[1])?).ok_or(8u32)?;let child=flag(r[12])?;let d=e.delivery.as_mut().ok_or(8u32)?;
                let d=if child{d.guidance.as_mut().and_then(|g|g.child.as_deref_mut()).ok_or(8u32)?}else{d};if d.effect.is_some()||r[3]<0.0||r[4..12].iter().any(|v|integer(*v).is_err()||*v>255.0){return Err(2);}d.effect=Some(effect);d.high_frequency=flag(r[2])?;if !child{e.beam_style=crate::effect_owner::BeamStyle{width:r[3],fringe:std::array::from_fn(|i|r[4+i]as u8),core:std::array::from_fn(|i|r[8+i]as u8)};}}
            79=>{let e=entry.as_mut().ok_or(8u32)?;e.railgun=flag(r[1])?;e.pd_role=flag(r[2])?;}
            81=>{if !flag(r[5]).is_ok()||[1,3,7,8,9,10].iter().any(|i|r[*i]<0.0)||r[11]<=-100.0{return Err(2);}entry.as_mut().ok_or(8u32)?.range_inputs=Some(battle::RangeInputs::new(r));}
            87..=93=>{let e=entry.as_mut().ok_or(8u32)?;let d=e.delivery.as_mut().ok_or(8u32)?;let d=match integer(r[1])?{0=>d,1=>d.guidance.as_mut().and_then(|g|g.child.as_deref_mut()).ok_or(8u32)?,_=>return Err(2)};
                if let Some((radius,brighten,style))=crate::delivery_wire::apply(tag,r,d)?{if r[1]==0.0{e.beam_hit_radius=radius;e.beam_hit_brighten=brighten;e.beam_style=style;}}}
            _=>return Err(8)
        }
    }let out=entry.ok_or(8u32)?;if !out.complete()||!out.valid()||out.query.is_none()||out.range_inputs.is_none(){return Err(8);}Ok(out)
}
