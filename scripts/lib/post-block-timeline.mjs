import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

const helpers = `
const postBlockClock = () => performance.timeOrigin + performance.now();
const postBlockAppend = (kind: string, row: any) => {
 const trace = (globalThis as any).__postBlockTimeline;
 if (!trace || !row) return;
 if (trace[kind].length < 20000) trace[kind].push(row); else trace.overflow++;
};
`;
const replace = (code, needle, value) => {
 assert.equal(code.split(needle).length - 1, 1, 'post-block probe anchor: ' + needle);
 return code.replace(needle, value);
};
/** Diagnostic-only Vite transform; disabled mode returns no source changes. */
export function postBlockTimelinePlugin(enabled) {
 return {name: 'post-block-timeline-diagnosis', enforce: 'pre', transform(code, id) {
  if (!enabled) return;
  const file = id.replaceAll('\\', '/').split('?')[0];
  if (file.endsWith('/src/network/LanBattle.tsx')) {
   code = code.replaceAll('\r\n', '\n');
   code = replace(code, 'const frame = (now: number) => {', `const frame = (now: number) => {
      const postBlockFrame: any = (globalThis as any).__postBlockTimeline ? {start:postBlockClock(),rafStamp:performance.timeOrigin+now} : null;`);
   const mark = name => `if(postBlockFrame)postBlockFrame.${name}=postBlockClock();`;
   code = replace(code, '        let applyStarted = 0;', mark('viewport') + '\n        let applyStarted = 0;');
   const poseAnchors = code.match(/^        presentation\.renderPose\((?:now|poseNow),/gm) ?? [];
   assert.equal(poseAnchors.length, 1, 'one real pose call using the declared display clock');
   code = replace(code, poseAnchors[0], mark('apply') + '\n' + poseAnchors[0]);
   code = replace(code, '        const alpha = sample.alpha;', mark('pose') + '\n        const alpha = sample.alpha;');
   code = replace(code, '        const renderStarted = performance.now();', mark('follow') + '\n        const renderStarted = performance.now();');
   code = replace(code, '        renderMs = renderMs * .9', mark('draw') + '\n        renderMs = renderMs * .9');
   code = replace(code, '        ready = false;\n      }\n    };\n    frameId = requestAnimationFrame(frame);', `        ready = false;
      } finally {if(postBlockFrame){postBlockFrame.end=postBlockClock();postBlockAppend('frames',postBlockFrame);}}
    };
    frameId = requestAnimationFrame(frame);`);
   return helpers + code;
  }
  if (file.endsWith('/src/network/protocol.ts')) {
   // Find the real handler structurally; preserve its returns, exceptions and this.
   const source = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true);
   const handlers = [];
   const visit = node => {
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        node.left.getText(source) === 'socket.onmessage' && ts.isArrowFunction(node.right)) handlers.push(node.right.body);
    ts.forEachChild(node, visit);
   };
   visit(source);assert.equal(handlers.length, 1, 'one real socket.onmessage handler');
   const body = handlers[0];assert.ok(ts.isBlock(body));
   const from = body.getStart(source) + 1, to = body.end - 1;
   return helpers + code.slice(0, from) + `
      const postBlockReceive = (globalThis as any).__postBlockTimeline ? {start:postBlockClock(),binary:event.data instanceof ArrayBuffer,bytes:typeof event.data==='string'?event.data.length:event.data?.byteLength??null} : null;
      try {` + code.slice(from, to) + `
      } finally {if(postBlockReceive)postBlockAppend('receives',{...postBlockReceive,end:postBlockClock()});}
    ` + code.slice(to);
  }
 }};
}

/** Trace is for causality clues, NEVER an uninstrumented performance verdict. */
export async function startPostBlockTimeline(page, directory) {
 const cdp = await page.context().newCDPSession(page);
 await cdp.send('Tracing.start', {categories: 'devtools.timeline,disabled-by-default-devtools.timeline,v8.execute,blink.user_timing', transferMode: 'ReturnAsStream'});
 await page.evaluate(() => {
  window.__postBlockTimeline = {frames: [], receives: [], restores: [], overflow: 0};
  const at = performance.timeOrigin + performance.now();
  console.timeStamp('lan-post-block-clock:' + at);
 });
 let finished = false;
 return {async stop(evidence) {
  if (finished) return;
  finished = true;
  let timeline;
  try {
   timeline = await page.evaluate(() => {const t=window.__postBlockTimeline;delete window.__postBlockTimeline;return t;});
  } finally {
   const complete = new Promise(resolve => cdp.once('Tracing.tracingComplete', resolve));
   await cdp.send('Tracing.end');
   const {stream} = await complete;assert.ok(stream);
   const output = await fs.open(path.join(directory, 'browser-timeline.json'), 'wx');
   try {
    for (;;) {const chunk=await cdp.send('IO.read',{handle:stream});await output.write(chunk.base64Encoded?Buffer.from(chunk.data,'base64'):chunk.data);if(chunk.eof)break;}
   } finally {await output.close();await cdp.send('IO.close',{handle:stream});await cdp.detach();}
  }
  await fs.writeFile(path.join(directory, 'post-block-raw.json'), JSON.stringify(timeline, null, 2));
  assert.equal(timeline.overflow, 0, 'post-block timeline overflow');
  if (evidence) {
   const summary = summarizePostBlockTimeline(evidence, timeline);
   await fs.writeFile(path.join(directory, 'post-block-summary.json'), JSON.stringify(summary, null, 2));
   assert.equal(summary.missing, 0, 'every busy draw must map to a real callback');
   return summary;
  }
 }};
}
const stats = values => {
 const sorted = values.toSorted((a,b)=>a-b);
 const percentile = q => {if (!sorted.length) return null;const i=(sorted.length-1)*q,lo=Math.floor(i);return sorted[lo]+(sorted[Math.ceil(i)]-sorted[lo])*(i-lo);};
 return {count:sorted.length,p50:percentile(.5),p95:percentile(.95),max:sorted.at(-1)??null};
};
export function summarizePostBlockTimeline(evidence, timeline) {
 const rows = evidence.blocks.map(block => {
  const index = evidence.edges.findLastIndex(e => e.at <= block.from);
  const edge = evidence.edges[index], until = evidence.edges[index+1]?.at ?? evidence.end;
  const draw = edge && evidence.frames.find(f => f.at >= block.to && f.at < until && f.active && f.keys === edge.keys);
  const callbacks = draw ? timeline.frames.filter(f => f.start <= draw.at && f.end >= draw.at) : [];
  if (callbacks.length !== 1) return {block,edge,draw:draw??null,missing:true,callbackMatches:callbacks.length};
  const frame = callbacks[0], boundaries = [frame.start,frame.viewport,frame.apply,frame.pose,frame.follow,draw.at,frame.draw,frame.end];
  assert.ok(boundaries.every((n,i)=>Number.isFinite(n)&&(!i||n>=boundaries[i-1])), 'monotonic callback phases');
  assert.ok(frame.start >= block.to, 'busy work must end before the selected callback');
  const stages = {viewport:frame.viewport-frame.start,apply:frame.apply-frame.viewport,pose:frame.pose-frame.apply,follow:frame.follow-frame.pose,render:draw.at-frame.follow};
  const wait = frame.start-block.to, work = draw.at-frame.start, total = draw.at-block.to;
  assert.ok(Math.abs(Object.values(stages).reduce((a,b)=>a+b,0)-work)<.001);
  assert.ok(Math.abs(wait+work-total)<.001);
  const receives = timeline.receives.filter(r=>r.start>=block.to&&r.end<=frame.start);
  return {block,edge,frame,draw,missing:false,wait,work,total,stages,receiveCount:receives.length,receiveMs:receives.reduce((sum,r)=>sum+r.end-r.start,0)};
 });
 const valid = rows.filter(r=>!r.missing);
 return {scope:'Diagnostic main-thread callback timing. Task gap is not proven idle/GPU wait. WebGL submission, not scanout. Separate percentile columns are NOT additive.',missing:rows.length-valid.length,metrics:Object.fromEntries(['wait','work','total','receiveCount','receiveMs'].map(k=>[k,stats(valid.map(r=>r[k]))])),stages:Object.fromEntries(['viewport','apply','pose','follow','render'].map(k=>[k,stats(valid.map(r=>r.stages[k]))])),rows};
}
