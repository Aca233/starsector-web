//! Actual fixed terrain and opening radio, installed once without random draws.
use crate::{flight_static_wire as j,random::Random,scene_owner,terrain_world,world_owner};
#[derive(Clone)]pub struct Radio{pub id:Option<f64>,pub sender:String,pub text:String,pub color:[u8;3]}
#[derive(Clone,Default)]pub struct Owned{pub nebulae:Vec<terrain_world::NebulaDefinition>,pub radio:Option<Radio>,pub audio:Option<Vec<crate::combat_visuals::Audio>>,pub installed:bool,pub admission:Option<(usize,Vec<u16>)>}
fn audio(v:&j::Value)->Result<Vec<crate::combat_visuals::Audio>,u32>{
    use crate::combat_visuals::Audio;let rows=v.array()?;if rows.len()>8192{return Err(7);}let mut out=Vec::new();
    for v in rows{let mut a=v.object()?;let event=match a.get("kind")?.text()?{
        "play"=>Audio::Play{key:a.get("key")?.text()?.into(),volume:a.get("volume")?.number()?,rate:a.get("rate")?.number()?,position:a.optional("position").map(|v|v.numbers::<2>()).transpose()?,listener:a.optional("listener").map(|v|v.numbers::<2>()).transpose()?,maximum:a.optional("maxDistance").map(|v|v.number()).transpose()?},
        "loop"=>Audio::Loop{key:a.get("key")?.text()?.into(),volume:a.get("volume")?.number()?,active:a.get("active")?.bool()?},
        "muffled"=>Audio::Muffled(a.get("value")?.bool()?),_=>return Err(8)};a.done()?;out.push(event);}
    let mut validation=crate::combat_visuals::Owned::default();for a in &out{validation.emit_audio(a.clone())?;}Ok(out)
}
impl Owned{
    pub fn apply(&mut self,tag:u32,v:&[f64])->Result<(),u32>{
        if v.len()!=22{return Err(2);}match tag{
            194=>{if self.installed||self.admission.is_some()||v[0]!=1.0||v[2..].iter().any(|n|*n!=0.0){return Err(8);}let n=j::integer(v[1])?as usize;if n==0||n>1_000_000{return Err(2);}self.admission=Some((n,Vec::new()));},
            195=>{let at=j::integer(v[0])?as usize;let n=j::integer(v[1])?as usize;if n==0||n>20||v[2+n..].iter().any(|n|*n!=0.0){return Err(2);}let(expected,units)=self.admission.as_mut().ok_or(8u32)?;if at!=units.len()||at+n>*expected{return Err(8);}for c in &v[2..2+n]{units.push(u16::try_from(j::integer(*c)?).map_err(|_|2u32)?);}},
            196=>{if v.iter().any(|n|*n!=0.0){return Err(2);}let(n,units)=self.admission.as_ref().ok_or(8u32)?;if units.len()!=*n{return Err(8);}let value=j::parse(units)?;let mut p=value.object()?;let mut nebulae=Vec::new();for v in p.get("nebulae")?.array()?{let mut v=v.object()?;let sprite=v.get("spriteUrl")?.text()?.to_owned();let position=v.get("position")?.numbers()?;let opacity=v.get("opacity")?.number()?;v.done()?;if sprite.is_empty()||!(0.0..=1.0).contains(&opacity){return Err(2);}nebulae.push(terrain_world::NebulaDefinition{sprite,position,opacity});}if nebulae.len()>4096{return Err(2);}let mut r=p.get("radio")?.object()?;let id=r.optional("id").map(|v|v.number()).transpose()?;if id.is_some_and(|id|id<=0.0||id.fract()!=0.0||!id.is_finite()){return Err(2);}let sender=r.get("sender")?.text()?.to_owned();let text=r.get("text")?.text()?.to_owned();let raw=r.get("color")?.numbers::<3>()?;r.done()?;self.audio=p.optional("audio").map(audio).transpose()?;p.done()?;if sender.is_empty()||text.is_empty(){return Err(2);}let mut color=[0;3];for i in 0..3{color[i]=u8::try_from(j::integer(raw[i])?).map_err(|_|2u32)?;}self.nebulae=nebulae;self.radio=Some(Radio{id,sender,text,color});self.installed=true;self.admission=None;},
            _=>return Err(2)
        }Ok(())
    }
    pub fn finish(&self,scene:&mut scene_owner::Owned,world:&mut world_owner::Owned,visual:&mut Random)->Result<(),u32>{
        if !self.installed||self.admission.is_some()||!scene.radio.is_empty(){return Err(8);}let r=self.radio.as_ref().ok_or(8u32)?;
        world.terrain.terrain.initialize_nebulae(&self.nebulae);
        let id=if let Some(id)=r.id{if id>visual.ids{return Err(8);}id}else{visual.next_id()};
        scene.radio.push(scene_owner::Radio{id,sender:r.sender.clone(),faction:"HQ".into(),text:r.text.clone(),color:r.color,time:0.0});
        if let Some(audio)=&self.audio{for event in audio{world.visual.emit_audio(event.clone())?;}Ok(())}else{world.visual.play("comm_radio",0.65,1.0,None,false)}
    }
}

