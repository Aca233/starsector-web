import assert from 'node:assert/strict';

const nameOf = frame => frame?.functionName ?? '';
const sourceOf = frame => ({ name: nameOf(frame), url: frame?.url ?? '', line: (frame?.lineNumber ?? -1) + 1, column: (frame?.columnNumber ?? -1) + 1 });
const keyOf = frame => JSON.stringify(sourceOf(frame));
// These are stack-based diagnostic buckets, not independent engine timers.
function stageOf(path) {
  if (path.includes('workerAudit')) return 'test-authority-audit';
  if (path.includes('captureGraph')) return 'display-graph';
  if (path.includes('captureDelta')) return 'display-projection-and-packed-visuals';
  if (path.some(name => ['fixedUpdate','prepareAIPhase','planFleetAI','updateShipAI'].includes(name))) return 'simulation';
  return 'other';
}
const add = (totals, key, value) => { totals[key] = (totals[key] ?? 0) + value; };

/** Approximate sampling evidence only. Inclusive rows overlap and must not be added. */
export function summarizeBrowserProfiles(cpu, heap, measuredTicks) {
  assert(Number.isInteger(measuredTicks) && measuredTicks > 0);
  const nodes = new Map(cpu.nodes.map(node => [node.id,node])), parents = new Map(), cpuRows = new Map(), cpuStages = {};
  assert.equal(nodes.size,cpu.nodes.length);
  for (const node of nodes.values()) for (const id of node.children ?? []) {
    assert(nodes.has(id)); assert(!parents.has(id), 'CPU profile must be a tree'); parents.set(id,node.id);
  }
  assert.equal(cpu.samples.length,cpu.timeDeltas.length);
  let cpuTotalMs=0;
  for (let i=0;i<cpu.samples.length;i++) {
    const elapsed=cpu.timeDeltas[i]/1000; assert(Number.isFinite(elapsed) && elapsed>=0);
    const leaf=nodes.get(cpu.samples[i]); assert(leaf); const path=[],chain=[],seen=new Set();
    for (let node=leaf;node;node=nodes.get(parents.get(node.id))) { assert(!seen.has(node.id));seen.add(node.id);path.push(nameOf(node.callFrame));chain.push(node); }
    const distinct=new Set();
    for (const node of chain) {
      const key=keyOf(node.callFrame);let row=cpuRows.get(key);if(!row){row={...sourceOf(node.callFrame),selfMs:0,inclusiveMs:0};cpuRows.set(key,row);}
      if(node===leaf)row.selfMs+=elapsed;if(!distinct.has(key)){row.inclusiveMs+=elapsed;distinct.add(key);}
    }
    const leafName=nameOf(leaf.callFrame),stage=leafName==='(garbage collector)'?'gc-unattributed':leafName==='(idle)'?'idle':stageOf(path);
    add(cpuStages,stage,elapsed);cpuTotalMs+=elapsed;
  }
  const result={measuredTicks,scope:'Statistical CPU/allocation samples, not a performance comparison. Inclusive rows overlap. Test audits are separated by their workerAudit ancestor; GC time cannot be attributed to the allocation stack from these profiles.',cpu:{sampleCount:cpu.samples.length,totalSampledMs:cpuTotalMs,stagesMs:cpuStages,self:[...cpuRows.values()].sort((a,b)=>b.selfMs-a.selfMs).slice(0,60),inclusive:[...cpuRows.values()].sort((a,b)=>b.inclusiveMs-a.inclusiveMs).slice(0,60)}};
  if(!heap)return result;
  const heapRows=new Map(),heapStages={},heapNodes=new Map(),paths=[];
  function walk(node,ancestors) {
    assert(!heapNodes.has(node.id),'Heap profile must be a tree');heapNodes.set(node.id,node);
    assert(Number.isFinite(node.selfSize) && node.selfSize>=0);
    const path=[...ancestors,nameOf(node.callFrame)],stage=stageOf(path);add(heapStages,stage,node.selfSize);
    let inclusive=node.selfSize;for(const child of node.children ?? [])inclusive+=walk(child,path);
    const key=keyOf(node.callFrame);let row=heapRows.get(key);if(!row){row={...sourceOf(node.callFrame),selfBytes:0,inclusiveBytes:0};heapRows.set(key,row);}
    row.selfBytes+=node.selfSize;row.inclusiveBytes+=inclusive;
    if(node.selfSize)paths.push({nodeId:node.id,...sourceOf(node.callFrame),stage,selfBytes:node.selfSize,path});
    return inclusive;
  }
  const totalBytes=walk(heap.head,[]);let sampleSizes=0;
  for(const sample of heap.samples){assert(heapNodes.has(sample.nodeId));assert(Number.isFinite(sample.size)&&sample.size>=0);sampleSizes+=sample.size;}
  result.heap={scope:'V8 sampling estimates include minor/major-GC-collected objects only when those options were enabled by the collector. Not a retained-heap or native/GPU memory measurement.',nodes:heapNodes.size,sampleCount:heap.samples.length,totalEstimatedBytes:totalBytes,sampleSizes,estimatedBytesPerTick:totalBytes/measuredTicks,stagesEstimatedBytes:heapStages,self:[...heapRows.values()].sort((a,b)=>b.selfBytes-a.selfBytes).slice(0,60),inclusive:[...heapRows.values()].sort((a,b)=>b.inclusiveBytes-a.inclusiveBytes).slice(0,60),paths:paths.sort((a,b)=>b.selfBytes-a.selfBytes).slice(0,80)};
  return result;
}
