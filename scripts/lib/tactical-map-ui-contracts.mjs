import assert from 'node:assert/strict';
import fs from 'node:fs';

/** Same map scenario, now also driving the actual default view and a Worker-only map. */
export async function checkTacticalMapUI(page) {
  await page.evaluate(async () => {
    const url=new URL(location.href);url.searchParams.set("combat","inline");history.replaceState(null,"",url);
    await import('/src/index.css'); await import('/src/ui/core/motion.css');await import('/src/ui/native-chrome.css');
    const React = (await import('/node_modules/.vite/deps/react.js')).default;
    const {createRoot} = (await import('/node_modules/.vite/deps/react-dom_client.js')).default;
    const {CombatView} = await import('/src/CombatView.tsx');
    const element=document.createElement('div');element.id='map-ui';Object.assign(element.style,{position:'fixed',inset:'0',zIndex:'100',background:'#030712'});document.body.append(element);
    window.__mapRoot=createRoot(element);window.__mapRoot.render(React.createElement(CombatView));
  });
  await page.waitForFunction(()=>window.__combatSession?.isPresentationReady()&&window.__combatSession.getAuthorityStatus().tick>=12,null,{timeout:120000});
  await page.locator('#map-ui canvas').first().focus();await page.keyboard.press('Space');
  await page.waitForFunction(()=>window.__combatSession.state==='paused');
  const start=await page.evaluate(()=>{
    const s=window.__combatSession,dispatch=s.dispatchControl.bind(s);window.__mapCommands=[];
    s.dispatchControl=command=>{window.__mapCommands.push(structuredClone(command));return dispatch(command);};
    return {tick:s.getAuthorityStatus().tick,cp:s.engine.commandPoints};
  });
  await page.keyboard.press('Tab');await page.getByRole('region',{name:'战术地图',exact:true}).waitFor();
  await page.keyboard.press('a');await page.waitForFunction(()=>window.__combatSession.engine.selectedUnitId==='fleet');
  const assault=page.getByRole('button',{name:'全面进攻!',exact:true});await assault.click();
  await page.waitForFunction(()=>window.__combatSession.engine.orders.has('fleet'));
  await page.keyboard.press('Delete');await page.waitForFunction(()=>!window.__combatSession.engine.orders.has('fleet'));
  await page.keyboard.press('Tab');await page.waitForFunction(()=>!window.__combatSession.engine.isTacticalMap);
  const inline=await page.evaluate(()=>{
    const s=window.__combatSession,result={tick:s.getAuthorityStatus().tick,cp:s.engine.commandPoints,commands:window.__mapCommands,map:s.tacticalMapView.read().map};
    window.__mapRoot.unmount();return result;
  });
  assert.equal(inline.tick,start.tick);assert.equal(inline.cp,start.cp-1);assert.equal(inline.map,null);
  assert(inline.commands.some(c=>c.kind==='tactical'&&c.command.action==='select'));
  assert(inline.commands.some(c=>c.kind==='tactical'&&c.command.action==='close'));
  // The LAN world fixture registers encounter hulls globally. A real Worker must
  // start in a clean document with the same content, never bypass its signature guard.
  await page.reload({waitUntil:'domcontentloaded'});
  await page.evaluate(async()=>{
    await import('/src/index.css');await import('/src/ui/core/motion.css');await import('/src/ui/native-chrome.css');
    const {loadNativeFont}=await import('/src/ui/native-fonts.ts');await Promise.all(['action','button','caption'].map(loadNativeFont));
    const element=document.createElement('div');element.id='map-ui';Object.assign(element.style,{position:'fixed',inset:'0',zIndex:'100',background:'#030712'});document.body.append(element);
    const {LocalWorkerHost}=await import('/src/engine/runtime/local/LocalWorkerHost.ts');
    const host=window.__mapHost=new LocalWorkerHost({playerHull:'onslaught',enemyHull:'paragon',seed:92,presentation:'render'});
    await host.ready;await host.commands([{kind:'toggle-map'}]);
    const React=(await import('/node_modules/.vite/deps/react.js')).default,{createRoot}=(await import('/node_modules/.vite/deps/react-dom_client.js')).default;
    const {TacticalMap}=await import('/src/ui/tactical/TacticalMap.tsx');
    window.__workerMap={closed:0,autopilot:false,commands:[],before:host.tacticalMapView.read()};
    const dispatch=async command=>(await host.commands([command])).results[0];
    window.__mapRoot=createRoot(document.querySelector('#map-ui'));
    window.__mapRoot.render(React.createElement(TacticalMap,{source:host.tacticalMapView,paused:true,onPausedChange:()=>{},autopilot:false,
      onAutopilotChange:value=>{window.__workerMap.autopilot=value;},inputBlocked:false,onClosed:()=>{window.__workerMap.closed++;},onControl:command=>{
        window.__workerMap.commands.push(structuredClone(command));
        if(command.kind==='tactical'&&command.command.action==='order'){
          if(window.__denyWorkerOrder)return Promise.resolve({accepted:false,reason:'测试拒绝：不扣指挥点'});
          if(window.__delayWorkerOrder){window.__delayWorkerOrder=false;return new Promise(resolve=>{window.__acceptWorkerOrder=()=>dispatch(command).then(resolve);});}
        }
        return dispatch(command);
      }}));
  });
  const region=page.getByRole('region',{name:'战术地图',exact:true});await region.waitFor();
  await page.keyboard.press('a');await page.waitForFunction(()=>window.__mapHost.tacticalMapView.read().map.selectedUnitId==='fleet');
  await assault.click();await page.waitForFunction(()=>window.__mapHost.tacticalMapView.read().map.orders.fleet?.type==='ASSAULT');
  assert.equal(await page.evaluate(()=>window.__mapHost.tacticalMapView.read().map.commandPoints),4);
  await page.keyboard.press('Delete');await page.waitForFunction(()=>!window.__mapHost.tacticalMapView.read().map.orders.fleet);
  await page.evaluate(()=>{window.__denyWorkerOrder=true;});await assault.click();await region.getByRole('status').filter({hasText:'测试拒绝'}).waitFor();
  assert.equal(await page.evaluate(()=>window.__mapHost.tacticalMapView.read().map.commandPoints),4);
  await page.evaluate(()=>{window.__denyWorkerOrder=false;window.__delayWorkerOrder=true;});await assault.click();await page.waitForFunction(()=>!!window.__acceptWorkerOrder);
  assert.equal(await page.evaluate(()=>!!window.__mapHost.tacticalMapView.read().map.orders.fleet),false);
  await page.evaluate(()=>window.__acceptWorkerOrder());await page.waitForFunction(()=>window.__mapHost.tacticalMapView.read().map.commandPoints===3);
  await page.keyboard.press('F2');await region.getByRole('complementary',{name:'战术信息',exact:true}).waitFor();await page.keyboard.press('F2');
  const artifactDir=process.env.MAP_CHECK_ARTIFACTS;
  if(artifactDir){fs.mkdirSync(artifactDir,{recursive:true});await page.screenshot({path:artifactDir+'/worker-tactical-map.png'});}
  await page.keyboard.press('Delete');await page.waitForFunction(()=>!window.__mapHost.tacticalMapView.read().map.orders.fleet);
  const canvas=region.getByRole('img',{name:/实时战术地图/});
  const emptyPoint=await canvas.evaluate(async canvas=>{
    const {fitTacticalView,pickMapShip}=await import('/src/ui/tactical/TacticalMapPainter.ts'),{Vector2}=await import('/src/engine/math/Vector2.ts');
    const frame=window.__mapHost.tacticalMapView.read().map,width=canvas.clientWidth,height=canvas.clientHeight,view=fitTacticalView(frame,width,height),rect=canvas.getBoundingClientRect();
    for(const y of [.2,.4,.6])for(const x of [.2,.5,.8]){
      const point={x:x*width,y:y*height};
      if(document.elementFromPoint(rect.left+point.x,rect.top+point.y)===canvas&&!pickMapShip(frame,new Vector2(point.x,point.y),view,width,height))return point;
    }
    throw Error('No visible unobstructed blank chart point');
  });
  await canvas.click({button:'right',position:emptyPoint});
  await page.waitForFunction(()=>window.__mapHost.tacticalMapView.read().map.orders.fleet?.type==='WAYPOINT');
  const waypoint=await page.evaluate(()=>{
    const host=window.__mapHost,view=host.tacticalMapView.read().map,position=view.orders.fleet.targetPos;
    return {position,hasVectorMethods:'clone' in position,cp:view.commandPoints,tick:host.latest.tick,
      shipPrototype:Object.getPrototypeOf(view.playerShip)===Object.prototype,armorFrozen:Object.isFrozen(view.playerShip.armor.cells),
      beforeCP:window.__workerMap.before.map.commandPoints,autopilot:window.__workerMap.autopilot};
  });
  assert(Number.isFinite(waypoint.position.x)&&Number.isFinite(waypoint.position.y));assert.equal(waypoint.hasVectorMethods,false);
  assert.equal(waypoint.cp,2);assert.equal(waypoint.tick,0);assert.equal(waypoint.beforeCP,5);assert(waypoint.shipPrototype&&waypoint.armorFrozen&&waypoint.autopilot);
  await page.keyboard.press('Delete');await page.waitForFunction(()=>!window.__mapHost.tacticalMapView.read().map.orders.fleet);
  await page.keyboard.press('Tab');await page.waitForFunction(()=>window.__workerMap.closed===1&&window.__mapHost.tacticalMapView.read().map===null);
  await region.waitFor({state:'hidden'});
  const worker=await page.evaluate(async()=>{
    const host=window.__mapHost,f=window.__workerMap;
    const stepped=await host.step({autopilot:true,blocked:false,keys:{},aim:[0,0],firing:false,mouseSteering:false,pointerActive:false});
    const result={commands:f.commands,closed:f.closed,tick:stepped.tick,mapClosed:host.tacticalMapView.read().map===null,status:host.status};
    window.__mapRoot.unmount();host.dispose();result.availableAfterDispose=host.tacticalMapView.read().available;return result;
  });
  assert.equal(worker.tick,1);assert.equal(worker.closed,1);assert(worker.mapClosed);assert.equal(worker.status,'ready');assert.equal(worker.availableAfterDispose,false);
  const result={start,inline,waypoint,worker};if(artifactDir)fs.writeFileSync(artifactDir+'/map-ui-contracts.json',JSON.stringify(result,null,2));return result;
}
