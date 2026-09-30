/** Focused branch of the existing Gloriana real-app headless scenario. */
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
export async function runModuleWorldClickCheck(page,out){
 await page.mouse.move(1420,30);if(await page.locator('.dwell-popover').count())await page.keyboard.press('Escape');
 await page.locator('.dwell-popover').first().waitFor({state:'hidden'});
 await page.getByRole('button',{name:/模拟战斗/}).click();
 await page.waitForFunction(()=>window.__combatSession?.isPresentationReady(),{},{timeout:90000});
 await page.locator('.simulation-deployment').getByRole('button',{name:'取消',exact:true}).click();
 await page.keyboard.press('Tab');
 await page.waitForFunction(()=>!window.__combatReadView.isTacticalMap);
 await page.evaluate(()=>window.__combatRenderer.canvas.focus());await page.keyboard.press('Space');
 await page.getByText('战斗已暂停',{exact:true}).waitFor();
 await page.evaluate(()=>window.__combatSession.barrier());
 // Freeze only the test camera: SwiftShader/automation latency otherwise pans the hull
 // between locating a pixel and pressing it. Authority, input and ownership stay real.
 await page.evaluate(()=>{window.__combatSession.visualOptions.cameraLocked=true;});
 assert.equal(await page.evaluate(()=>!!window.__combatEngine),false,'must test actual Worker, not inline engine');
 const geometry=await page.evaluate(async()=>{
  const {pickModuleFireControl:pick}=await import('/src/engine/runtime/ModuleFireControl.ts');
  const {Vector2:V}=await import('/src/engine/math/Vector2.ts');
  const original=window.__combatReadView.playerShip;
  const partSpec={...original.spec,modules:[],bounds:[[-20,-8],[20,-8],[20,8],[-20,8]],collisionRadius:1000};
  const rootSpec={...partSpec,modules:[{x:80,y:0,angleDeg:0,spec:partSpec}]};
  const base={...original,spec:rootSpec,id:'own',pos:new V(),prevPos:new V(),facingRad:0,prevFacingRad:0,isDead:false,hullHp:100,isRetreated:false,isDocked:false,isVisibleTo:()=>true};
  const child={...base,id:'own:module:0',spec:partSpec,pos:new V(80,0),prevPos:new V(80,0)};
  const other={...child,id:'own-other:module:0'};
  const expect=(value,expected,label)=>{if(value!==expected)throw Error(label+': '+value+' != '+expected);};
  expect(pick(base,[base,other,child],new V(80,0)),1,'own module over core circle / other ship');
  expect(pick(base,[base,child],new V()),0,'core');
  expect(pick(base,[base,child],new V(80,9)),undefined,'transparent pixel outside polygon');
  expect(pick(base,[base,other],new V(80,0)),undefined,'other assembly');
  expect(pick({...base,spec:partSpec},[base,child],new V()),undefined,'non-modular firing unchanged');
  for(const field of ['isDead','isRetreated','isDocked'])expect(pick(base,[base,{...child,[field]:true}],new V(80,0)),undefined,field);
  expect(pick(base,[base,{...child,hullHp:0}],new V(80,0)),undefined,'zero hull');
  expect(pick({...base,isDead:true},[base,child],new V(80,0)),undefined,'dead root');
  expect(pick(base,[base,child],new V(NaN,0)),undefined,'non-finite point');
  expect(pick(base,[base,child],new V(80,0),NaN),undefined,'non-finite interpolation');
  const moving={...child,prevPos:new V(100,30),pos:new V(160,70),prevFacingRad:3.1,facingRad:-3.1};
  for(const alpha of [0,.3,.7,1]){
   const angle=3.1+Math.atan2(Math.sin(-6.2),Math.cos(-6.2))*alpha;
   const point=new V(100+60*alpha+15*Math.cos(angle),30+40*alpha+15*Math.sin(angle));
   expect(pick(base,[base,moving],point,alpha),1,'moving / wrapped angle '+alpha);
  }
  const nestedRoot={...base,spec:{...rootSpec,modules:[{...rootSpec.modules[0],spec:rootSpec}]}};
  const nested={...child,id:'own:module:0:module:0',pos:new V(200,0),prevPos:new V(200,0)};
  expect(pick(nestedRoot,[nestedRoot,child,nested],new V(200,0)),2,'nested stable index');
  return {ownOnly:true,strictPolygon:true,inactiveFiltered:true,interpolatedPose:true,nestedIndex:true};
 });
 await page.evaluate(()=>{
  const session=window.__combatSession,dispatch=session.dispatchControl.bind(session);window.__moduleClickTrace=[];
  session.dispatchControl=async command=>{const result=await dispatch(command);if(command.kind!=='stop-firing')window.__moduleClickTrace.push({command,result});return result;};
 });
 const initial=await page.evaluate(()=>({time:window.__combatReadView.combatTime,root:window.__combatReadView.playerShip.id,target:window.__combatReadView.playerShip.playerTargetId,group:window.__combatReadView.playerShip.selectedGroupIndex}));
 const pointFor=async index=>page.evaluate(async index=>{
  const {pickModuleFireControl}=await import('/src/engine/runtime/ModuleFireControl.ts');
  const {assemblyShipIds}=await import('/src/engine/content/ModuleGeometry.ts');
  const {Vector2}=await import('/src/engine/math/Vector2.ts');
  const read=window.__combatReadView,ids=assemblyShipIds(read.playerShip.id,read.playerShip.spec),ship=read.ships.find(s=>s.id===ids[index]);
  if(!ship)throw Error('missing module '+index);
  const canvas=window.__combatRenderer.canvas,rect=canvas.getBoundingClientRect(),matrix=window.__combatRenderer.batcher.currentViewProj;
  const alpha=window.__combatSession.state==='running'?window.__combatSession.scheduler.alpha:1;
  const a=ship.prevFacingRad+Math.atan2(Math.sin(ship.facingRad-ship.prevFacingRad),Math.cos(ship.facingRad-ship.prevFacingRad))*alpha;
  const origin=Vector2.lerp(ship.prevPos,ship.pos,alpha),c=Math.cos(a),s=Math.sin(a);
  const candidates=[...ship.spec.weaponSlots.map(slot=>[slot.x,slot.y]),[0,0]];
  const b=ship.spec.bounds,minX=Math.min(...b.map(p=>p[0])),maxX=Math.max(...b.map(p=>p[0])),minY=Math.min(...b.map(p=>p[1])),maxY=Math.max(...b.map(p=>p[1]));
  for(let x=minX+4;x<maxX;x+=8)for(let y=minY+4;y<maxY;y+=8)candidates.push([x,y]);
  for(const [lx,ly] of candidates){
   const point=new Vector2(origin.x+lx*c-ly*s,origin.y+lx*s+ly*c);
   if(pickModuleFireControl(read.playerShip,read.ships,point,alpha)!==index)continue;
   const x=rect.left+(matrix[0]*point.x+matrix[3]*point.y+matrix[6]+1)*rect.width/2;
   const y=rect.top+(1-(matrix[1]*point.x+matrix[4]*point.y+matrix[7]))*rect.height/2;
   if(x>30&&y>60&&x<rect.right-30&&y<rect.bottom-270&&document.elementFromPoint(x,y)===canvas)return window.__modulePickPoint={x,y,id:ship.id,index,world:[point.x,point.y]};
  }
  throw Error('no visible hull interior for '+index);
 },index);
 const owner=()=>page.evaluate(()=>window.__combatReadView.weaponShip.id);
 const noFire=async()=>assert(await page.evaluate(()=>!window.__combatReadView.playerShip.isFiringMain&&!window.__combatReadView.weaponShip.isFiringMain));
 const waitOwner=async id=>{try{await page.waitForFunction(id=>window.__combatReadView.weaponShip.id===id,id,{timeout:15000});await page.waitForFunction(id=>window.__combatRenderer.arcWeaponShipId===id,id,{timeout:15000});await page.waitForFunction(id=>document.querySelector('[data-testid="module-fire-control"]')?.dataset.weaponOwner===id,id);}catch(error){console.error(JSON.stringify(await page.evaluate(()=>({point:window.__modulePickPoint,trace:window.__moduleClickTrace.slice(-10),owner:window.__combatReadView.weaponShip.id,active:document.activeElement?.tagName})),null,2));throw error;}};
 const part=await pointFor(1);await page.mouse.click(part.x,part.y);await waitOwner(part.id);await noFire();
 assert.equal(await page.evaluate(()=>window.__combatReadView.combatTime),initial.time,'paused selection advanced simulation');
 assert.equal(await page.evaluate(()=>window.__combatReadView.playerShip.playerTargetId),initial.target,'selection changed locked target');
 const core=await pointFor(0);await page.mouse.click(core.x,core.y);await waitOwner(initial.root);await noFire();
 // A consumed selection press cannot become a trigger after moving to space or resuming.
 const second=await pointFor(2);await page.mouse.move(second.x,second.y);await page.mouse.down();await waitOwner(second.id);
 const blank=await page.evaluate(async()=>{
  const {pickModuleFireControl}=await import('/src/engine/runtime/ModuleFireControl.ts');
  const {Vector2}=await import('/src/engine/math/Vector2.ts');
  const canvas=window.__combatRenderer.canvas,rect=canvas.getBoundingClientRect(),m=window.__combatRenderer.batcher.currentViewProj,read=window.__combatReadView;
  for(let y=80;y<rect.bottom-280;y+=55)for(let x=80;x<rect.right-80;x+=70){
   if(document.elementFromPoint(x,y)!==canvas)continue;
   const point=new Vector2(((x-rect.left)/rect.width*2-1-m[6])/m[0],(1-(y-rect.top)/rect.height*2-m[7])/m[4]);
   if(pickModuleFireControl(read.playerShip,read.ships,point)===undefined)return {x,y};
  }throw Error('no open space');
 });
 await page.mouse.move(blank.x,blank.y);await page.keyboard.press('Space');await page.getByText('战斗已暂停',{exact:true}).waitFor({state:'hidden'});
 await page.waitForFunction(t=>window.__combatReadView.combatTime>t+.15,initial.time);await noFire();await page.mouse.up();
 // Fresh clicks in space fire only the selected module; movement stays on the root.
 await page.mouse.down();await page.waitForFunction(()=>window.__combatReadView.weaponShip.isFiringMain&&!window.__combatReadView.playerShip.isFiringMain);
 await page.keyboard.down('w');await page.waitForFunction(()=>window.__combatReadView.playerShip.throttle>0);await page.keyboard.up('w');
 await page.mouse.up();await page.waitForFunction(()=>!window.__combatReadView.weaponShip.isFiringMain);
 await page.keyboard.press('Space');await page.getByText('战斗已暂停',{exact:true}).waitFor();await page.evaluate(()=>window.__combatSession.barrier());
 const group=await page.evaluate(()=>window.__combatReadView.weaponShip.weaponGroups.filter(g=>g.weaponSlotIds.length).at(-1).index);
 await page.keyboard.press(String(group+1));await page.waitForFunction(group=>window.__combatReadView.weaponShip.weaponGroups[window.__combatReadView.weaponShip.selectedGroupIndex].index===group,group);
 assert.equal(await page.evaluate(()=>window.__combatReadView.playerShip.selectedGroupIndex),initial.group);
 await page.screenshot({path:resolve(out,'module-world-click.png'),animations:'disabled'});
 await page.locator('.combat-console').screenshot({path:resolve(out,'module-world-click-console.png')});
 // Existing pilot acknowledgement path is used, not a local-only ownership flag.
 await page.keyboard.press('u');await page.waitForFunction(()=>window.__combatReadView.playerShip.fireControlMode==='AI');
 const autoPoint=await pointFor(1);await page.mouse.click(autoPoint.x,autoPoint.y);await waitOwner(autoPoint.id);
 assert.equal(await page.evaluate(()=>window.__combatReadView.playerShip.fireControlMode),'MANUAL');await noFire();
 await page.keyboard.press('Tab');await page.waitForFunction(()=>window.__combatReadView.isTacticalMap);
 const map=page.locator('canvas[aria-label^="实时战术地图"]');
 const mapPoint=await map.evaluate(el=>{const rect=el.getBoundingClientRect();for(let y=160;y<rect.height-80;y+=80)for(let x=160;x<rect.width-80;x+=80)if(document.elementFromPoint(rect.left+x,rect.top+y)===el)return {x,y};throw Error('no exposed map pixel');});
 await map.click({position:mapPoint});assert.equal(await owner(),autoPoint.id);await noFire();
 await page.keyboard.press('Tab');await page.waitForFunction(()=>!window.__combatReadView.isTacticalMap);
 await page.getByRole('button',{name:'返回本体',exact:true}).click();await waitOwner(initial.root);await noFire();
 return {passed:true,scope:'Actual app + local Worker in isolated headless Chromium; not dual-device LAN',geometry,
  pausedWorldClick:true,coreReturn:true,dragDoesNotFire:true,freshPressFiresModule:true,rootMovement:true,weaponGroups:true,
  autopilotAcknowledgedTakeover:true,mapClickIsolated:true,hudReturn:true};
}
