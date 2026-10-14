import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
const args=process.argv.slice(2),option=(name,fallback)=>{const at=args.indexOf(name);return at<0?fallback:args[at+1];};
const local=option('--mode','lan')==='local';
const ticks=Number(option('--ticks','40')),warm=Number(option('--warm','10'));
if(!Number.isSafeInteger(ticks)||ticks<1||!Number.isSafeInteger(warm)||warm<0||warm>=ticks)throw Error('Invalid diagnostic tick window');
const out=path.resolve(option('--out','artifacts/rust-combat-core-20261008/profiling-hot-step'));
const copy=path.join(out,'native');fs.mkdirSync(copy,{recursive:true});
for(const f of fs.readdirSync('native/combat-core/src').filter(f=>f.endsWith('.rs')))fs.copyFileSync(path.join('native/combat-core/src',f),path.join(copy,f));
const functions=[['state.rs','pub fn step('],['state.rs','fn step_scene('],['state.rs','fn validate_scene_draft_with_specs('],['state.rs','fn scene_authority('],['ai_resident.rs','fn refresh('],['ai_resident.rs','fn build('],['ai_resident.rs','pub fn phase_with_fleet('],['scene_runtime.rs','pub fn advance('],['scene_runtime.rs','fn prepare('],['scene_runtime.rs','fn motion_stage('],['scene_runtime.rs','fn ai('],['fire_query.rs','pub fn plan_queued('],['gravity_runtime.rs','pub fn prepare('],['gravity_runtime.rs','pub fn fields('],['gravity_runtime.rs','pub fn weapons_selected('],['gravity_runtime.rs','pub fn dispatch_with_flight('],['world_owner.rs','pub fn terrain_stage('],['terrain_owner.rs','pub fn pair('],['terrain_owner.rs','pub fn asteroid_collisions('],['gravity_terrain.rs','pub fn advance_owned('],['fire_control.rs','pub fn advance('],['fire_control.rs','pub fn decide('],['fire_control.rs','pub fn should_fire('],['battle.rs','fn fire_selected_inner('],['battle.rs','pub fn advance_projectiles('],['battle.rs','pub fn advance_beams('],['phase_runtime.rs','pub fn with_ship_gravity('],['combat_visuals.rs','pub fn status_capitals('],['combat_visuals.rs','pub fn advance('],['scene_owner.rs','pub fn navigate_retreat(']];
const names=[];
functions.push(['ai_owner.rs','pub fn validate('],['ai_owner.rs','pub fn plan('],['ai_owner.rs','pub fn sample_decision('],['tactical_ai.rs','pub fn validate('],['tactical_ai.rs','pub fn hostile('],['tactical_ai.rs','pub fn profile('],['tactical_ai.rs','pub fn fleet('],['tactical_ai.rs','pub fn position('],['navigation_ai.rs','pub fn new(bodies:'],['defense_ai.rs','pub fn validate('],['defense_ai.rs','pub fn assess_into(']);
functions.push(['phase_runtime.rs','pub fn with_ship_gravity<T,F>'],['flight_runtime.rs','pub fn collect_wings<A:Authority>'],['flight_runtime.rs','pub fn collect_drones<A:Authority>'],['flight_runtime.rs','pub fn finish<A:Authority>'],['world_owner.rs','pub fn nebula_stage('],['world_owner.rs','pub fn hulk_stage(']);
functions.push(['flight_owner.rs','fn body('],['flight_runtime.rs','fn body('],['flight_runtime.rs','fn hostile('],['flight_owner.rs','fn mounts('],['flight_owner.rs','fn aim('],['system_owner.rs','pub fn reader('],['phase_runtime.rs','pub fn phased_world(']);
functions.push(['fire_control.rs','pub fn validate(&self)'],['fire_control.rs','pub fn aim('],['fire_query.rs','pub fn observe_ship('],['terrain_owner.rs','fn ship_near_circle(']);
function timer(file,signature){let s=fs.readFileSync(path.join(copy,file),'utf8');const i=s.indexOf(signature);if(i<0)return;const start=s.indexOf('{',i),id=names.length;names.push(file+':'+signature);s=s.slice(0,start+1)+`let _perf=crate::perf::Timer::new(${id});`+s.slice(start+1);fs.writeFileSync(path.join(copy,file),s);}
for(const [f,s]of functions)timer(f,s);
let state=fs.readFileSync(path.join(copy,'state.rs'),'utf8');
state=state.replace('let mut world=self.world.clone().ok_or(8u32)?;let mut scene=self.scene.clone().ok_or(8u32)?;',`let _clone=crate::perf::Timer::new(${names.length});let mut world=self.world.clone().ok_or(8u32)?;let mut scene=self.scene.clone().ok_or(8u32)?;`);
const cloneId=names.length;names.push('scene draft clones');
state=state.replace('let mut notices=Vec::new();\n        let elapsed=',`let mut notices=Vec::new();drop(_clone);\n        let elapsed=`);fs.writeFileSync(path.join(copy,'state.rs'),state);
fs.writeFileSync(path.join(copy,'perf.rs'),`use std::cell::RefCell;
#[link(wasm_import_module="perf")] extern "C" {fn now()->f64;}
thread_local!{static TOTAL:RefCell<([f64;64],[f64;64])>=const{RefCell::new(([0.0;64],[0.0;64]))};}
pub struct Timer{index:usize,start:f64}
impl Timer{pub fn new(index:usize)->Self{Self{index,start:unsafe{now()}}}}
impl Drop for Timer{fn drop(&mut self){let elapsed=unsafe{now()}-self.start;TOTAL.with_borrow_mut(|t|{t.0[self.index]+=elapsed;t.1[self.index]+=1.0;});}}
#[no_mangle]pub extern "C" fn perf_reset(){TOTAL.with_borrow_mut(|t|*t=([0.0;64],[0.0;64]));}
#[no_mangle]pub extern "C" fn perf_time(index:u32)->f64{TOTAL.with_borrow(|t|t.0[index as usize])}
#[no_mangle]pub extern "C" fn perf_count(index:u32)->f64{TOTAL.with_borrow(|t|t.1[index as usize])}
`);
fs.appendFileSync(path.join(copy,'lib.rs'),'\nmod perf;\n');
const compiler='C:/Users/Aca/.rustup/toolchains/stable-x86_64-pc-windows-msvc/bin/rustc.exe',sysroot=path.resolve('artifacts/rust-combat-core-20261008/toolchain/sysroot');
const host=spawnSync(compiler,['--print','sysroot'],{encoding:'utf8',windowsHide:true}).stdout.trim(),wasmPath=path.join(out,'profile.wasm');
const compiled=spawnSync(compiler,['--edition=2021','--crate-type=cdylib','--target=wasm32-unknown-unknown','--sysroot',sysroot,'-C','opt-level=3','-C',`linker=${host.replaceAll('\\','/')}/lib/rustlib/x86_64-pc-windows-msvc/bin/rust-lld.exe`,'-A','dead_code',path.join(copy,'lib.rs'),'-o',wasmPath],{encoding:'utf8',windowsHide:true});fs.writeFileSync(path.join(out,'compile.log'),compiled.stderr);if(compiled.status)throw Error(compiled.stderr);
const instantiate=WebAssembly.instantiate.bind(WebAssembly);WebAssembly.instantiate=(source,imports)=>instantiate(source,{...imports,perf:{now:()=>performance.now()}});
const source=`import {RustLanKernel} from './src/network/RustLanKernel';import {RustCombatKernel} from './src/engine/runtime/rust/RustCombatKernel';import {rustLanAcceptanceMatches} from './scripts/lib/rust-lan-authority-check';import {assetManager} from './src/engine/assets/AssetResolver';import manifest from './public/game-assets/asset-manifest.json';
export async function run(wasm){await assetManager.loadManifest('data:application/json,'+encodeURIComponent(JSON.stringify(manifest)));const module=await WebAssembly.compile(wasm),hulls=['web_zhuyuan','web_gloriana','web_sc2_hyperion'];
const kernel=${local?"await RustCombatKernel.create({playerHull:hulls[0],enemyHull:hulls[0],seed:917,multicore:false,additionalShips:Array.from({length:20},(_,i)=>({hull:hulls[i%3],isPlayer:i%2===0,position:[((i>>1)%8-3.5)*700,(i%2?1:-1)*(1300+Math.floor(i/16)*650)],facing:i%2?-Math.PI/2:Math.PI/2}))},1,{module,sha256:'profile'})":"await RustLanKernel.create(rustLanAcceptanceMatches()[1],1,{module,sha256:'profile',bytes:wasm.length})"};const core=kernel.core, exports=core.exports;
const inputs=${local?"{autopilot:true,blocked:false,keys:{},aim:[0,0],firing:false,mouseSteering:false,pointerActive:false}":"[...kernel.controlled.keys()].map(seat=>({seat,fresh:true,input:{seq:1,keys:0,aim:[0,0],firing:false,pointerActive:false,actions:[]},actions:[]}))"};
const samples=[];for(let i=0;i<${ticks};i++){${local?'':'inputs.forEach(x=>x.input.seq++);'}exports.perf_reset();kernel.${local?'stepScheduled':'step'}(inputs);if(i>=${warm})samples.push({timing:kernel.lastTiming,metrics:Array.from({length:${names.length}},(_,j)=>({name:${JSON.stringify(names)}[j],ms:exports.perf_time(j),calls:exports.perf_count(j)}))});}const data={diagnostic:true,actualKernel:true,local:${local},ticks:kernel.tick,bodies:kernel.snapshot.bodies.length,samples};kernel.dispose();return data;}`;
const plugins=[{name:'raw',setup(b){b.onResolve({filter:/\?raw$/},a=>({path:path.resolve(a.resolveDir,a.path.slice(0,-4)),namespace:'raw'}));b.onLoad({filter:/.*/,namespace:'raw'},a=>({contents:fs.readFileSync(a.path,'utf8'),loader:'text'}));}}];
const js=path.join(out,'profile.mjs');await build({stdin:{contents:source,resolveDir:process.cwd(),sourcefile:'rust-profile.ts',loader:'ts'},outfile:js,bundle:true,platform:'neutral',mainFields:['module','main'],format:'esm',target:'es2023',plugins,define:{'import.meta.env':JSON.stringify({BASE_URL:'./',DEV:false,PROD:true}),'__LAN_BUILD_ID__':JSON.stringify('rust-profile')}});
const result=await(await import(pathToFileURL(js).href)).run(fs.readFileSync(wasmPath));
const average=names.map((name,i)=>({name,ms:result.samples.reduce((n,s)=>n+s.metrics[i].ms,0)/result.samples.length,calls:result.samples.reduce((n,s)=>n+s.metrics[i].calls,0)/result.samples.length})).sort((a,b)=>b.ms-a.ms);
result.average=average;fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({ticks:result.ticks,crafts:result.crafts,average},null,2));
