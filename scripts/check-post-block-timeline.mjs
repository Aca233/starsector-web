import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import ts from 'typescript';
import {postBlockTimelinePlugin,summarizePostBlockTimeline} from './lib/post-block-timeline.mjs';
const fixture=()=>({evidence:{end:200,edges:[{at:10,keys:1}],blocks:[{from:11,to:81}],frames:[{at:100,keys:1,active:true}]},timeline:{frames:[{start:90,rafStamp:75,viewport:91,apply:94,pose:96,follow:97,draw:101,end:103}],receives:[{start:83,end:85},{start:87,end:88}]}});
test('post-block decomposition partitions one actual draw, not independent quantiles',()=>{
 const {evidence,timeline}=fixture(),s=summarizePostBlockTimeline(evidence,timeline),r=s.rows[0];
 assert.equal(s.missing,0);assert.equal(r.wait,9);assert.equal(r.work,10);assert.equal(r.total,19);assert.equal(r.receiveMs,3);assert.deepEqual(r.stages,{viewport:1,apply:3,pose:2,follow:1,render:3});
});
test('post-block missing or ambiguous callback never manufactures zero',()=>{
 for(const frames of [[],[fixture().timeline.frames[0],fixture().timeline.frames[0]]]){
  const {evidence,timeline}=fixture();timeline.frames=frames;const s=summarizePostBlockTimeline(evidence,timeline);assert.equal(s.missing,1);assert.equal(s.metrics.wait.p95,null);
 }
 const {evidence,timeline}=fixture();evidence.edges.push({at:95,keys:2});assert.equal(summarizePostBlockTimeline(evidence,timeline).missing,1);
});
test('post-block invalid stage ordering is rejected',()=>{
 const {evidence,timeline}=fixture();timeline.frames[0].apply=99;assert.throws(()=>summarizePostBlockTimeline(evidence,timeline),/monotonic/);
});
test('diagnostic transform is opt-in and compiles both actual instrumented sources',()=>{
 for(const file of ['src/network/LanBattle.tsx','src/network/protocol.ts']){
  const code=fs.readFileSync(file,'utf8'),id='/'+file;
  assert.equal(postBlockTimelinePlugin(false).transform(code,id),undefined);
  const transformed=postBlockTimelinePlugin(true).transform(code,id);
  assert.ok(transformed.includes('postBlockClock'));
  const result=ts.transpileModule(transformed,{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX},reportDiagnostics:true});
  assert.deepEqual(result.diagnostics,[]);
 }
});

test('pose probe preserves both supported clock arguments and rejects ambiguous anchors',()=>{
 const code=fs.readFileSync('src/network/LanBattle.tsx','utf8'),id='/src/network/LanBattle.tsx';
 for(const argument of ['now','poseNow']){
  const variant=code.replace(/presentation\.renderPose\((?:now|poseNow),/,'presentation.renderPose('+argument+',');
  const result=postBlockTimelinePlugin(true).transform(variant,id);
  assert.ok(result.includes("postBlockFrame.apply=postBlockClock();\n        presentation.renderPose("+argument+','));
 }
 const duplicate=code+'\n        presentation.renderPose(now, null, false);';
 assert.throws(()=>postBlockTimelinePlugin(true).transform(duplicate,id),/one real pose call/);
});

const {lanRestoreStagePlugin}=await import('./lib/lan-restore-stages.mjs');
test('restore stages retain executable actual snapshot source and are opt-in',()=>{
 const file='src/network/LanDisplaySnapshot.ts',code=fs.readFileSync(file,'utf8');
 assert.equal(lanRestoreStagePlugin(false).transform(code,'/'+file),undefined);
 const source=lanRestoreStagePlugin(true).transform(code,'/'+file);
 assert.ok(source.includes('postRestoreworld'));assert.ok(source.includes('postRestoreships'));assert.ok(source.includes('postRestorevalidate'));
 const result=ts.transpileModule(source,{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022},reportDiagnostics:true});assert.deepEqual(result.diagnostics,[]);
});
