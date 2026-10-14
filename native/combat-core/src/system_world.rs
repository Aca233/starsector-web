//! Accepted commands and synchronous seven-pack lifecycle world effects.
//! Host is implemented by the resident Rust world, never a JS callback bridge.
use crate::lifecycle::{self,Spec,System,IN,ACTIVE,OUT,COOLDOWN};
use crate::ship_effects::{self,ActivationInput,Kind,Owner,TacticalJump,JumpGate,JumpObstacle,JumpWorld,JumpPose};
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct Identity {pub slot:u32,pub generation:u32}
#[derive(Clone, Copy)]
pub struct WeaponRead {pub weapon_type:usize,pub disabled:bool,pub ammo:f64,pub point_defense:bool}
#[derive(Clone)]
pub struct ShipRead {
    pub identity:Identity,pub owner:Owner,pub maximum_hp:f64,pub position:[f64;2],pub velocity:[f64;2],pub facing:f64,
    pub radius:f64,pub shield_radius:f64,pub shield_active:bool,pub attached:bool,pub gloriana:bool,pub parent:Option<Identity>,pub carrier_root:Option<Identity>,
    pub module_side:i32,pub blocks_weapons:bool,pub hyperion:bool,pub reactor_installed:bool,pub focus:bool,
    pub current_total_flux:f64,pub max_flux:f64,pub brake:bool,pub flameout_ratio:f64,pub controller_flamed:bool,
    pub compensating:bool,pub controller_disabled:bool,pub weapons:Vec<WeaponRead>,pub aim:[f64;2],pub range_multiplier:f64,pub manual:bool,
    pub yamato_muzzle:Option<[f64;2]>,
}
#[derive(Clone, Copy)]
pub struct SystemRead {pub id:u32,pub kind:Kind,pub active:bool,pub disabled:bool,pub charges:f64,pub pending_flux:f64}
#[derive(Clone, Copy)]
pub struct SpawnYamato {pub source:Identity,pub position:[f64;2],pub velocity:[f64;2],pub facing:f64}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Failure {Unavailable,InactiveOwner,Disabled,Cooldown,Out,Active,Retreating,Overloaded,Venting,Flux,Charges,
    WeaponMissing,WeaponOffline,CoreMissing,CoreOffline,SharedBusy,SharedCharges,Aim,Side,Battery,Shield,NoRepairTarget,Compensating,Brake,Engine,
    Reassigning,Jump(ship_effects::JumpFailure),StaleIdentity,Unsupported,Host}

/// Every mutation is synchronous within the caller's complete combat-step
/// transaction. Err must abort that transaction, rolling back world RNG/spawns.
pub trait Host {
    fn ship(&self,id:Identity)->Result<ShipRead,Failure>;
    /// Ordered actual owner.allSystems, including a placeholder for the currently
    /// borrowed slot at its original position. Slot patches that entry in place.
    fn systems(&self,owner:Identity)->Result<Vec<SystemRead>,Failure>;
    fn assembly(&self,owner:Identity)->Result<Vec<Identity>,Failure>;
    fn children(&self,owner:Identity)->Result<Vec<Identity>,Failure>;
    fn roster(&self)->Vec<Identity>;
    fn stock(&self,owner:Identity,core:Kind)->Result<Option<SystemRead>,Failure>;
    fn spend_stock(&mut self,owner:Identity,core:Kind,amount:f64)->Result<(),Failure>;
    fn set_regen(&mut self,owner:Identity,slot:u32,rate:f64)->Result<(),Failure>;
    fn heal(&mut self,target:Identity,amount:f64)->Result<(),Failure>;
    /// Creates real resident entity using installed system-only weapon, consumes
    /// its actual gameplay RNG and source initializer. Err aborts the complete
    /// caller transaction, including partial allocator or RNG mutations.
    fn spawn_yamato(&mut self,spawn:SpawnYamato)->Result<(),Failure>;
    fn play_yamato(&mut self,source:Identity)->Result<(),Failure>;
    fn jump_obstacles(&self)->Result<(Vec<JumpObstacle>,Option<Vec<ship_effects::JumpAsteroid>>),Failure>;
    fn jump_pose(&self,source:Identity)->Result<JumpPose,Failure>;
    fn apply_jump_pose(&mut self,source:Identity,pose:JumpPose)->Result<(),Failure>;
}

#[derive(Clone)]
pub struct Slot {
    pub owner:Identity,pub kind:Kind,pub lifecycle:System,pub spec:Spec,
    pub input:Option<ActivationInput>,pub jump:TacticalJump,pub regen:f64,
}
impl Slot {
    pub fn new(owner:Identity,id:u32,kind:Kind,spec_id:u32,spec:Spec)->Self {
        let regen=spec.regen;Self {owner,kind,lifecycle:System::new(id,spec_id,&spec),spec,input:None,jump:TacticalJump::default(),regen}
    }
    fn current(&self)->SystemRead {SystemRead {id:self.lifecycle.id,kind:self.kind,active:self.lifecycle.active,
        disabled:self.lifecycle.disabled,charges:self.lifecycle.charges,pending_flux:self.lifecycle.pending_flux}}
    fn systems<H:Host>(&self,host:&H)->Result<Vec<SystemRead>,Failure> {
        let mut entries=host.systems(self.owner)?;if let Some(entry)=entries.iter_mut().find(|s|s.id==self.lifecycle.id){*entry=self.current();}
        else{return Err(Failure::Host);}Ok(entries)
    }
    fn core<H:Host>(&self,host:&H,kind:Kind)->Result<Option<SystemRead>,Failure> {
        if self.kind==kind {Ok(Some(self.current()))}else{host.stock(self.owner,kind)}
    }
    fn shared<H:Host>(&self,host:&H,owner:&ShipRead,cost:f64,ark:bool)->Result<SystemRead,Failure> {
        if !ark&&(!owner.hyperion||!owner.reactor_installed){return Err(Failure::CoreMissing);}
        let kind=if ark{Kind::ArkForge}else{Kind::Yamato};let core=self.core(host,kind)?.ok_or(Failure::CoreMissing)?;
        // Ark's existing reason intentionally does not test core.disabled.
        if !ark&&(core.disabled||owner.owner.disable_systems>0.0){return Err(Failure::CoreOffline);}
        if self.systems(host)?.iter().any(|s|s.id!=self.lifecycle.id&&s.active&&if ark{matches!(s.kind,Kind::ArkForge|Kind::ArkBarrier|Kind::ArkRepair)}else{matches!(s.kind,Kind::Yamato|Kind::Jump)}){return Err(Failure::SharedBusy);}
        if core.charges<cost{return Err(Failure::SharedCharges);}Ok(core)
    }
    fn spend<H:Host>(&mut self,host:&mut H,core:Kind,amount:f64)->Result<(),Failure> {
        if self.kind==core {self.lifecycle.charges-=amount;Ok(())}else{host.spend_stock(self.owner,core,amount)}
    }
    fn shared_at_execution<H:Host>(&self,host:&H,owner:&ShipRead,cost:f64,ark:bool)->Result<bool,Failure> {
        match self.shared(host,owner,cost,ark) {Ok(_)=>Ok(true),Err(Failure::CoreMissing|Failure::CoreOffline|Failure::SharedBusy|Failure::SharedCharges)=>Ok(false),Err(e)=>Err(e)}
    }
    pub fn activation_reason<H:Host>(&self,host:&H)->Result<(),Failure> {
        if self.spec.flags&lifecycle::AVAILABLE==0||self.kind==Kind::None{return Err(Failure::Unavailable);}
        if matches!(self.kind,Kind::GravityWell|Kind::GravityBattleWell|Kind::GravityOther){return Err(Failure::Unsupported);}
        let s=host.ship(self.owner)?;let o=s.owner;
        if !o.alive(){return Err(Failure::InactiveOwner);}if self.lifecycle.disabled||o.disable_systems>0.0{return Err(Failure::Disabled);}
        if self.lifecycle.state==COOLDOWN||self.lifecycle.cooling{return Err(Failure::Cooldown);}
        if self.lifecycle.active {
            if self.lifecycle.state==OUT{return Err(Failure::Out);}
            if self.spec.flags&lifecycle::TOGGLE==0{return Err(Failure::Active);}
            if self.kind==Kind::RocFire&&self.lifecycle.state==IN{return Err(Failure::Reassigning);}return Ok(());
        }
        if o.retreating{return Err(Failure::Retreating);}if o.overloaded{return Err(Failure::Overloaded);}if o.venting{return Err(Failure::Venting);}
        let reserved=self.systems(host)?.iter().fold(0.0,|sum,s|sum+s.pending_flux);
        if s.current_total_flux+self.spec.flux_cost+reserved>s.max_flux{return Err(Failure::Flux);}
        if self.spec.flags&lifecycle::CHARGES!=0&&self.lifecycle.charges<=0.0{return Err(Failure::Charges);}
        match self.kind {
            Kind::Eclipse=>usable_weapon(&s,ship_effects::ENERGY),
            Kind::Edict=>{
                if !s.gloriana||s.attached{return Err(Failure::CoreMissing);}let side=ship_effects::broadside(s.aim,s.position,s.facing);if side==0{return Err(Failure::Side);}
                for id in host.children(self.owner)?{let child=host.ship(id)?;if child.parent==Some(self.owner)&&child.module_side==side&&usable_battery(&child){return Ok(());}}
                Err(Failure::Battery)
            },
            Kind::Yamato=>{self.shared(host,&s,if s.focus{45.0}else{60.0},false)?;
                if ship_effects::yamato_aim_failure(s.aim,s.position,s.facing)!=0{Err(Failure::Aim)}else{Ok(())}},
            Kind::Jump=>{self.shared(host,&s,75.0,false)?;ship_effects::jump_failure(obstacle(&s),s.aim,1800.0*s.range_multiplier,None).map_or(Ok(()),|f|Err(Failure::Jump(f)))},
            Kind::ArkForge=>{self.shared(host,&s,40.0,true)?;
                for id in host.assembly(self.owner)?{let part=host.ship(id)?;if part.owner.alive()&&part.weapons.iter().any(|w|!w.disabled&&w.ammo!=0.0){return Ok(());}}Err(Failure::WeaponOffline)},
            Kind::ArkBarrier=>{self.shared(host,&s,35.0,true)?;if s.shield_active{Ok(())}else{Err(Failure::Shield)}},
            Kind::ArkRepair=>{self.shared(host,&s,50.0,true)?;
                for id in host.assembly(self.owner)?{let part=host.ship(id)?;if part.owner.alive()&&part.owner.hp<part.maximum_hp{return Ok(());}}
                for id in host.roster(){let craft=host.ship(id)?;if craft.carrier_root==Some(self.owner)&&craft.owner.alive()&&craft.owner.hp<craft.maximum_hp
                    &&length([craft.position[0]-s.position[0],craft.position[1]-s.position[1]])<s.shield_radius{return Ok(());}}Err(Failure::NoRepairTarget)},
            Kind::RocAttitude=>if s.compensating{Err(Failure::Compensating)}else if s.brake{Err(Failure::Brake)}else if s.flameout_ratio>=1.0||s.controller_flamed{Err(Failure::Engine)}else{Ok(())},
            Kind::Zhefeng=>if !s.shield_active{Err(Failure::Shield)}else if s.weapons.iter().all(|w|w.point_defense||w.disabled){Err(Failure::WeaponOffline)}else{Ok(())},
            Kind::RocFire=>Ok(()),
            _=>Err(Failure::Unsupported),
        }
    }
    pub fn activate<H:Host>(&mut self,host:&H,input:ActivationInput)->Result<(),Failure> {
        self.activation_reason(host)?;if self.lifecycle.active{self.lifecycle.activate(&self.spec);return Ok(());}
        if let Some((slot,generation))=input.target {host.ship(Identity{slot,generation})?;}
        self.input=Some(input);self.jump.input=Some(input);self.lifecycle.activate(&self.spec);Ok(())
    }
    pub fn interrupt(&mut self) {self.lifecycle.interrupt(&self.spec);}
    pub fn reset(&mut self) {self.jump.on_reset();self.lifecycle.reset(&self.spec);self.input=None;self.jump.input=None;}
    /// Caller consumes pending activation flux at its original prepare barrier.
    pub fn consume_flux(&mut self)->(f64,bool) {let cost=self.lifecycle.pending_flux;self.lifecycle.pending_flux=0.0;(cost,self.spec.flags&lifecycle::HARD!=0)}
    pub fn update(&mut self,dt:f64) {let mut spec=self.spec.clone();spec.regen=self.regen;self.lifecycle.update(&spec,dt);}
    /// Original Ship.prepareStep navigation cancellation, before lifecycle update.
    /// Dead/docked/retreated ships skip ordinary update at the caller's barrier.
    pub fn cancel_before_update<H:Host>(&mut self,host:&H,dt:f64)->Result<(),Failure> {
        let s=host.ship(self.owner)?;
        if s.owner.dead||s.owner.retreated||s.owner.hp<=0.0 {
            if matches!(self.kind,Kind::RocAttitude|Kind::RocFire|Kind::Zhefeng){self.interrupt();}return Ok(());
        }
        if dt>0.0&&self.kind==Kind::RocAttitude&&(s.brake||s.owner.retreating){self.interrupt();}
        if dt>0.0&&self.kind==Kind::Zhefeng&&s.owner.retreating{self.interrupt();}Ok(())
    }
    /// After applyCombatReadiness, before actual defense and weapon permissions.
    pub fn cancel_after_readiness<H:Host>(&mut self,host:&H)->Result<(),Failure> {
        let s=host.ship(self.owner)?;
        if s.owner.overloaded||s.owner.venting||self.lifecycle.active&&self.kind==Kind::RocAttitude&&(s.flameout_ratio>=1.0||s.controller_flamed){self.interrupt();}Ok(())
    }
    /// Like source dispatchEvents, copies both queues before callbacks run.
    pub fn dispatch<H:Host>(&mut self,host:&mut H,dt:f64)->Result<(),Failure> {
        let starts=self.lifecycle.pending_activation as usize;let active=self.lifecycle.pending_active as usize;
        self.lifecycle.pending_activation=0.0;self.lifecycle.pending_active=0.0;
        if self.spec.flags&lifecycle::AVAILABLE==0{return Ok(());}
        for _ in 0..starts{self.on_activate(host)?;}for _ in 0..active{self.on_active(host)?;}self.on_advance(host,dt)
    }
    fn on_activate<H:Host>(&mut self,host:&mut H)->Result<(),Failure> {
        if matches!(self.kind,Kind::ArkForge|Kind::ArkBarrier|Kind::ArkRepair){let s=host.ship(self.owner)?;
            let amount=match self.kind{Kind::ArkForge=>40.0,Kind::ArkBarrier=>35.0,_=>50.0};
            if !ark_online(s.owner)||!self.shared_at_execution(host,&s,amount,true)?{self.interrupt();return Ok(());}
            self.spend(host,Kind::ArkForge,amount)?;
        }else if self.kind==Kind::Jump {
            let s=host.ship(self.owner)?;let gate=self.jump_gate(host,&s)?;let (ships,rocks)=host.jump_obstacles()?;let world=JumpWorld {ships:&ships,asteroids:rocks.as_deref()};
            let charges=self.core(host,Kind::Yamato)?.map_or(0.0,|c|c.charges);self.jump.input=self.input;
            if !self.jump.on_activate(gate,charges,obstacle(&s),1800.0*s.range_multiplier,s.manual,self.lifecycle.serial,&world){self.interrupt();}
        }Ok(())
    }
    fn on_active<H:Host>(&mut self,host:&mut H)->Result<(),Failure> {
        if self.kind==Kind::Yamato {
            let s=host.ship(self.owner)?;let cost=if s.focus{45.0}else{60.0};
            if !s.owner.online()||self.lifecycle.disabled||self.input.is_none()||!self.shared_at_execution(host,&s,cost,false)?{return Ok(());}
            let Some(muzzle)=s.yamato_muzzle else{return Ok(());};let c=s.facing.cos();let n=s.facing.sin();
            host.spawn_yamato(SpawnYamato {source:self.owner,position:[muzzle[0]*c-muzzle[1]*n+s.position[0],muzzle[0]*n+muzzle[1]*c+s.position[1]],velocity:s.velocity,facing:s.facing})?;
            self.spend(host,Kind::Yamato,cost)?;host.play_yamato(self.owner)?;
        }else if self.kind==Kind::Jump {
            let s=host.ship(self.owner)?;let gate=self.jump_gate(host,&s)?;let (ships,rocks)=host.jump_obstacles()?;let world=JumpWorld {ships:&ships,asteroids:rocks.as_deref()};
            let mut charges=self.core(host,Kind::Yamato)?.map_or(0.0,|c|c.charges);let before=charges;let mut pose=host.jump_pose(self.owner)?;self.jump.input=self.input;
            if self.jump.on_active(gate,&mut charges,obstacle(&s),1800.0*s.range_multiplier,&mut pose,&world){
                self.spend(host,Kind::Yamato,before-charges)?;host.apply_jump_pose(self.owner,pose)?;
            }
        }Ok(())
    }
    fn on_advance<H:Host>(&mut self,host:&mut H,dt:f64)->Result<(),Failure> {
        let s=host.ship(self.owner)?;
        match self.kind {
            Kind::Yamato=>if self.lifecycle.active&&(!s.owner.online()||self.lifecycle.disabled){self.input=None;self.interrupt();},
            Kind::Jump=>{let gate=self.jump_gate(host,&s)?;let view=self.system_view();self.jump.input=self.input;
                if self.jump.on_advance(gate,view){self.input=None;self.interrupt();}},
            Kind::ArkForge=>{let any=self.systems(host)?.iter().any(|s|s.active);self.regen=ship_effects::ark_regen(s.owner,any);host.set_regen(self.owner,self.lifecycle.id,self.regen)?;
                if self.lifecycle.active&&!ark_online(s.owner){self.interrupt();}},
            Kind::ArkBarrier=>if self.lifecycle.active&&!ark_online(s.owner){self.interrupt();},
            Kind::ArkRepair=>{
                if self.lifecycle.active&&!ark_online(s.owner){self.interrupt();return Ok(());}if self.lifecycle.state!=ACTIVE{return Ok(());}
                for id in host.assembly(self.owner)?{let part=host.ship(id)?;if part.owner.alive(){host.heal(id,part.maximum_hp*0.015*dt)?;}}
                for id in host.roster(){let craft=host.ship(id)?;if craft.carrier_root==Some(self.owner)&&craft.owner.alive()
                    &&length([craft.position[0]-s.position[0],craft.position[1]-s.position[1]])<s.shield_radius{host.heal(id,craft.maximum_hp*0.12*dt)?;}}
            },
            Kind::Edict=>if self.lifecycle.active&&(s.owner.overloaded||s.owner.venting||s.owner.retreating||self.lifecycle.disabled){self.input=None;if self.lifecycle.state!=OUT{self.interrupt();}},
            Kind::RocFire=>if (s.owner.venting||s.owner.overloaded)&&(self.lifecycle.state==IN||self.lifecycle.state==ACTIVE){self.interrupt();},
            _=>{},
        }Ok(())
    }
    fn jump_gate<H:Host>(&self,host:&H,s:&ShipRead)->Result<JumpGate,Failure>{
        let core=self.core(host,Kind::Yamato)?;let others=self.systems(host)?;
        Ok(JumpGate {owner:s.owner,system_disabled:self.lifecycle.disabled,core_present:s.hyperion&&s.reactor_installed&&core.is_some(),
            core_online:core.is_some_and(|c|!c.disabled)&&s.owner.disable_systems<=0.0,
            other_active:others.iter().any(|o|o.id!=self.lifecycle.id&&matches!(o.kind,Kind::Yamato|Kind::Jump)&&o.active)})
    }
    pub fn system_view(&self)->ship_effects::SystemView {ship_effects::SystemView {kind:self.kind,state:self.lifecycle.state,level:self.lifecycle.effect,
        retained:if self.lifecycle.state==OUT{self.lifecycle.out_level}else{self.lifecycle.effect},active:self.lifecycle.active,
        available:self.spec.flags&lifecycle::AVAILABLE!=0,disabled:self.lifecycle.disabled,cooldown:self.lifecycle.cooldown_timer,
        max_cooldown:self.spec.cooldown,jump_origin:self.jump.visual.is_some_and(|v|v.origin.is_some()),gravity_collapse:false,
        locked_side:self.input.map_or(0,|i|ship_effects::broadside(i.point,i.origin,i.facing))}}
}
fn usable_weapon(s:&ShipRead,kind:usize)->Result<(),Failure> {let mut found=false;for w in &s.weapons{if w.weapon_type==kind{found=true;if !w.disabled&&w.ammo!=0.0{return Ok(());}}}
    Err(if found{Failure::WeaponOffline}else{Failure::WeaponMissing})}
fn usable_battery(s:&ShipRead)->bool {s.owner.alive()&&!s.owner.overloaded&&!s.owner.venting&&!s.blocks_weapons&&usable_weapon(s,ship_effects::BALLISTIC).is_ok()}
fn ark_online(o:Owner)->bool {o.alive()&&!o.overloaded&&!o.venting}
fn obstacle(s:&ShipRead)->JumpObstacle {JumpObstacle {identity:s.identity.slot,position:s.position,radius:s.radius,fighter:false}}
fn length(v:[f64;2])->f64 {let a=v[0].abs();let b=v[1].abs();let max=if a>b{a}else{b};if max==f64::INFINITY{return max;}if max==0.0&&a==0.0{return 0.0;}let ratio=if a>b{b}else{a}/max;(1.0+ratio*ratio).sqrt()*max}
