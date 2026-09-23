import test from 'node:test';
import assert from 'node:assert/strict';
import { mapPosition, worldPosition, screenPosition, planetRotationMatrix, nativePlanetMesh, planetLightPosition, bodySurfaceAngle } from '../src/campaign/client/BodyGeometry.mjs';
import { createDevelopmentCampaign } from '../server/campaign/DevelopmentWorld.mjs';
import { projectCampaignPlayer } from '../server/campaign/PlayerProjection.mjs';
import { createReferenceRuleset } from '../src/campaign/ReferenceRuleset.mjs';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const transform=(m,v)=>[0,1,2].map(i=>m[i]*v[0]+m[i+3]*v[1]+m[i+6]*v[2]);

test('world +Y is screen up and SVG click conversion is the inverse, including a panned camera',()=>{
  assert.deepEqual(mapPosition([25,80]),[25,-80]);assert.deepEqual(worldPosition(mapPosition([-15,90])),[-15,90]);
  assert.deepEqual(screenPosition([110,220],[100,200],800,600,2),[420,260]);
  assert.deepEqual(screenPosition([100,200],[100,200],800,600,.5),[400,300]);
});
test('GLU sphere produces the native 32x32 indexed-strip equivalent with finite UVs, outward normals and a closed seam',()=>{
  const m=nativePlanetMesh();assert.equal(m.length,32*32*6*5);
  for(let i=0;i<m.length;i+=5){near(Math.hypot(m[i],m[i+1],m[i+2]),1);assert.ok(m[i+3]>=0&&m[i+3]<=1&&m[i+4]>=0&&m[i+4]<=1);}
  assert.deepEqual([...m.slice(0,5)],[-0,0,1,0,1]);
  assert.throws(()=>nativePlanetMesh(0));assert.throws(()=>nativePlanetMesh(1024));
});
test('native surface rotation order preserves north pole, pitch, longitudinal rotation and axial tilt',()=>{
  const identity=planetRotationMatrix(0,0,0);const north=transform(identity,[0,0,1]);near(north[0],0);near(north[1],1);near(north[2],0);
  const tilted=transform(planetRotationMatrix(90,0,0),[0,0,1]);near(tilted[0],-1);near(tilted[1],0);near(tilted[2],0);
  const pole=transform(planetRotationMatrix(0,0,123),[0,0,1]);near(pole[1],1);
  const pitched=transform(planetRotationMatrix(0,30,0),[0,0,1]);near(pitched[1],Math.cos(Math.PI/6));near(pitched[2],.5);
});
test('campaign sunlight comes from the actual star offset with native 0.75 distance height',()=>{
  assert.deepEqual(planetLightPosition([300,400],100,[-2,-8,10],[0,0]),[-300,-400,375]);
  assert.deepEqual(planetLightPosition([300,400],100,[-2,-8,10],null),[-200,-800,1000]);
});
test('surface and cloud phases are explicit and use game seconds, independent of orbital days',()=>{
  assert.equal(bodySurfaceAngle(10,-3,10),340);assert.equal(bodySurfaceAngle(0,-5,10),310);
  assert.equal(bodySurfaceAngle(45,-3,120),45);
});
test('body projection whitelists render data, hides foreign locations and keeps point/body categories distinct',()=>{
  const w=structuredClone(createDevelopmentCampaign()),rules=createReferenceRuleset();
  w.spaceEntities.planet={id:'planet',version:0,name:'Planet',locationId:'system',position:[100,200],radius:80,tags:[],
    presentation:{kind:'planet',nativeType:'jungle',sourceHandle:'corvusII',secret:'do-not-project'},surfacePhase:37,cloudPhase:0,lightSourceId:'exit',cargo:{credits:7654321}};
  w.spaceEntities.remote={...structuredClone(w.spaceEntities.planet),id:'remote',locationId:'hyper'};
  const view=projectCampaignPlayer(w,'captain-a',rules);assert.deepEqual(view.points.map(p=>p.id),['exit']);assert.deepEqual(view.bodies.map(b=>b.id),['planet']);
  assert.equal(view.bodies[0].surfacePhase,37);assert.equal(view.bodies[0].cloudPhase,0);assert.equal(view.bodies[0].lightSourceId,'exit');
  assert.ok(!JSON.stringify(view).includes('7654321'));assert.ok(!JSON.stringify(view).includes('do-not-project'));assert.equal(Object.isFrozen(view.bodies[0]),true);
});
test('missing phases remain unknown instead of randomized, foreign light sources are not disclosed',()=>{
  const w=structuredClone(createDevelopmentCampaign());w.spaceEntities.planet={id:'planet',version:0,name:'Planet',locationId:'system',position:[0,0],radius:80,tags:[],presentation:{kind:'planet',nativeType:'jungle',sourceHandle:'corvusII'},lightSourceId:'well'};
  const b=projectCampaignPlayer(w,'captain-a').bodies[0];assert.equal(b.surfacePhase,null);assert.equal(b.cloudPhase,null);assert.equal(b.lightSourceId,null);
});
