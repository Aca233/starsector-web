// Direct value/capability tests, not keyboard/mouse dispatch or gameplay input fixtures.
import { assetManager } from '../../src/engine/assets/AssetResolver';
import { contentManifestManager } from '../../src/engine/content/ContentManifest';
import { CameraController } from '../../src/engine/runtime/CameraController';
import { clientToCombatWorld, zoomCombatView } from '../../src/engine/runtime/PlayerControls';
import { Vector2 } from '../../src/engine/math/Vector2';
import { sameTeam } from '../../src/engine/simulation/CombatTeams';
import { createLanDisplayWorld } from '../../src/network/LanDisplayBootstrap';
import { decodeBinaryFrame } from '../../src/network/BinarySnapshot.mjs';
import { submitRealtimeInput } from '../../src/network/RealtimeSendPolicy.mjs';
const assert = (ok, text) => { if (!ok) throw Error(text); };
const vector = v => [v.x, v.y];
const bytes = text => Uint8Array.from(atob(text), c => c.charCodeAt(0));
const capture = (canvas, rect) => ({ width: canvas.width, height: canvas.height,
  rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height } });

export async function controlTrace(data, mode, supplied) {
  await assetManager.ensureManifestLoaded(); await contentManifestManager.ensureLoaded();
  const world = createLanDisplayWorld(data.match, 0, decodeBinaryFrame(bytes(data.cases[0].wire))).world;
  const numeric = mode !== 'legacy';
  const controls = numeric ? new (await import('../../src/network/LanPresentationControls')).LanPresentationControls() : null;
  const camera = controls?.camera ?? new Vector2(); camera.copy(world.playerShip.pos);
  const controller = controls?.controller ?? new CameraController();
  const readViewport = numeric ? (await import('../../src/engine/runtime/CombatViewport')).readCombatViewport : null;
  let canvas, reads = 0, pointer = {x:0,y:0}, pointerActive = false, zoom = .65;
  if (!supplied) {
    canvas = document.createElement('canvas');
    Object.assign(canvas.style, { position:'absolute', opacity:'0', pointerEvents:'none', transformOrigin:'0 0', border:'0', padding:'0' });
    document.body.append(canvas);
    const nativeRead = canvas.getBoundingClientRect.bind(canvas);
    canvas.getBoundingClientRect = () => { reads++; return nativeRead(); };
  } else assert(typeof document === 'undefined', 'Numeric worker trace must run in the actual Worker');
  const rows = [];
  try {
    for (let i=0;i<84;i++) {
      const began = reads;
      if (canvas) {
        canvas.width = [1280,720,960][i%3]; canvas.height = [720,480,600][i%3];
        canvas.style.width = (i===62 ? 0 : [640,600,480][i%3])+'px'; canvas.style.height = [360,400,300][i%3]+'px';
        canvas.style.left = (20+i*.125)+'px'; canvas.style.top = (30-i*.25)+'px';
        canvas.style.transform = i%4 ? 'none' : 'translate(17px, 11px) scale(.75, 1.25)';
      }
      const viewport = supplied ? supplied[i].viewport : numeric ? readViewport(canvas) : capture(canvas,canvas.getBoundingClientRect());
      const r=viewport.rect;
      if (i%8!==7) {
        pointer={x:r.left+r.width*([.75,.5,1.01,0][i%4]),y:r.top+r.height*.35}; pointerActive=true;
        if (i===70) pointer.x=NaN;
        if (controls) controls.samplePointer(pointer.x,pointer.y); else controller.samplePointer(pointer.x,pointer.y);
      }
      if (i%11===10) { pointerActive=false; if(controls)controls.pointerActive=false; }
      if (i%19===18) controller.suspendPointer();
      if (i===42) controller.reset(); // Camera reset must not erase held pointer aim.
      if (i%7===0) { const delta=i%2?100:-100; zoom=zoomCombatView(zoom,delta); controls?.wheel(delta); }
      const p=world.playerShip;
      p.pos.set(100+i*.375,-50+i*.125); p.prevPos.set(98+i*.25,-52+i*.0625);
      p.aimTargetWorld.set(4000+i,-2000-i); // Read the latest authority aim, not a projection.
      p.isDead=i>=58&&i<70; world.isTacticalMap=i>=30&&i<35;
      if(i===22||i===40)p.teleportCameraOffset.add(new Vector2(110,-20));
      const active=i%17!==16, dt=[1/30,1/60,1/144,0,.2][i%5], alpha=[0,.3,1][i%3];
      const preCamera=vector(camera), actions=[];
      const input=controls ? controls.readInput(world,viewport,i,3,false,actions) : (()=>{
        const aim=pointerActive?clientToCombatWorld(pointer,canvas,camera,zoom):p.aimTargetWorld;
        return {seq:i,keys:3,aim:vector(aim),firing:false,pointerActive,actions};
      })();
      assert(input.actions===actions,'Presentation claimed ownership of action list');
      const hudZoom=controls?controls.hudZoom(viewport):zoom/(viewport.width/Math.max(1,r.width));
      if(controls)controls.follow(world,alpha,viewport,dt,active);
      else {
        const focus=p.isDead?(world.capitalShips.find(s=>!s.isDead&&sameTeam(s,p))??p):p;
        controller.follow(camera,focus.interpolatedPos(alpha),canvas,zoom,dt,active&&!world.isTacticalMap,focus);
      }
      const layoutReads=reads-began;
      let eventViewport=null,eventAim=null;
      if(i%10===0) {
        if(canvas)canvas.style.transform='translate(33px, -17px)';
        eventViewport=supplied?supplied[i].eventViewport:numeric?readViewport(canvas):capture(canvas,canvas.getBoundingClientRect());
        eventAim=vector(controls?controls.pointerAim(eventViewport):clientToCombatWorld(pointer,canvas,camera,zoom));
      }
      rows.push({viewport,eventViewport,eventAim,preCamera,input,camera:vector(camera),hudZoom,zoom:controls?.zoom??zoom,layoutReads});
    }
  } finally { canvas?.remove(); }
  return rows;
}

export async function controlContracts(data) {
  await assetManager.ensureManifestLoaded(); await contentManifestManager.ensureLoaded();
  const {LanPresentationControls}=await import('../../src/network/LanPresentationControls');
  const {LanPresentationPipeline}=await import('../../src/network/LanPresentationPipeline');
  const {readCombatViewport}=await import('../../src/engine/runtime/CombatViewport');
  const world=createLanDisplayWorld(data.match,0,decodeBinaryFrame(bytes(data.cases[0].wire))).world;
  const controls=new LanPresentationControls(), pipeline=new LanPresentationPipeline(data.match.id,0);
  const events=[], actions=[{id:1,kind:'shield'}]; let seq=0, creates=0;
  const now=123, inputWorld=world;
  pipeline.prediction.record=(input,time)=>events.push(['motion',input,time]);
  pipeline.turretPrediction.record=(input,time)=>events.push(['turret',input,time]);
  pipeline.firePrediction.record=(world,input,time,active)=>{assert(world===inputWorld&&active,'Fire admission arguments');events.push(['fire',input,time]);};
  for (const [canSend,budget,send] of [[false,true,true],[true,false,true],[true,true,false],[true,true,true]]) {
    const accepted=submitRealtimeInput({canSend:()=>canSend,takeBudget:()=>budget,
      createInput:()=>{creates++;return controls.readInput(world,undefined,seq+1,0,false,actions);},send:()=>send,
      accepted:input=>{seq=input.seq;pipeline.recordAcceptedInput(world,input,now,true);}});
    assert(accepted===!!(canSend&&budget&&send),'Admission result changed');
    if(!accepted)assert(seq===0&&events.length===0&&actions.length===1,'Rejected input consumed sequence/actions or prediction');
  }
  assert(seq===1&&creates===2&&events.length===3,'Admission counts');
  assert(events.map(e=>e[0]).join(',')==='motion,turret,fire'&&events.every(e=>e[1]===events[0][1]&&e[2]===now),'Accepted input identity/order');
  // Prove readInput runs after lane updates, without adding debug hooks or inputs
  // to the live game. Stub only this isolated pipeline's downstream render work.
  const order=[];
  pipeline.combat.apply=()=>{order.push('combat');};
  pipeline.motion.render=()=>{order.push('motion');world.playerShip.aimTargetWorld.set(791,-182);};
  pipeline.projectileVisuals.render=()=>{order.push('projectiles');};
  pipeline.motion.row=()=>null;
  pipeline.prediction.suspend=()=>{order.push('suspend');};
  pipeline.turretPrediction.render=(_world,input)=>{order.push('turret');assert(input.aim[0]===791&&input.aim[1]===-182,'Stale authority aim');};
  pipeline.renderPose(world,600,now,()=>{order.push('read');return controls.readInput(world,undefined,seq,0,false,[]);},false);
  assert(order.join(',')==='combat,motion,projectiles,read,suspend,turret','Pose sampling order changed');
  // Actual DOM rectangle capture, not a fake canvas. A later send must sample new layout.
  const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=720;
  Object.assign(canvas.style,{position:'absolute',left:'10px',top:'20px',width:'640px',height:'360px'});document.body.append(canvas);
  try {
    controls.samplePointer(200,100);const old=readCombatViewport(canvas);
    canvas.style.left='50px';
    const current=readCombatViewport(canvas), fresh=controls.readInput(world,current,2,0,false,[]), stale=controls.readInput(world,old,2,0,false,[]);
    assert(fresh.aim[0]!==stale.aim[0],'New input reused the old RAF rectangle');
    controls.pointerActive=false;
    assert(controls.readInput(world,undefined,3,0,false,[]).aim[0]===world.playerShip.aimTargetWorld.x,'Inactive pointer required layout');
  } finally {canvas.remove();}
  return {acceptedOnly:true,predictionOrder:true,latePoseRead:true,freshEventLayout:true,inactiveNoLayout:true,noInputEvents:true};
}
