import assert from 'node:assert/strict';

export function checkEncoderFieldAudit(api) {
  const {CombatPresentationEncoder: Encoder, BeforeCombatPresentationEncoder: Observed} = api;
  assert(Observed,'instrumented reference encoder is required');
  const plain=new Encoder(774,'render','ui'),observed=new Observed(774,'render','ui');
  const record=Object.fromEntries(Array.from({length:12},(_,i)=>['a'+i,i]));record.a1=NaN;record.a2=-0;record.a3='label';
  const hud={record},map={},deployment={},presence=[];
  let left,right,checks=0;const frames=[];
  const normalized=p=>({...p,buffer:new Uint8Array(p.buffer,0,p.length*8)});
  const run=(name,change,savedUnits,sparseRows)=>{
    change();const root={kind:'lan-presentation-ui',hud,map,deployment,presence};
    left=plain.captureUi(root,0,left?.buffer);right=observed.captureUi(root,0,right?.buffer);
    assert.deepEqual(normalized(left),normalized(right),name+'/exact full packet');checks++;
    const counts={...globalThis.benchmarkGraphFields};
    assert.equal(counts.savedUnits,savedUnits,name+'/expected unit estimate');checks++;
    assert.equal(counts.sparseRows,sparseRows,name+'/expected sparse rows');checks++;
    assert.equal(counts.graphUnits,right.length);assert.equal(counts.hypotheticalGraphUnits,right.length-savedUnits);checks+=2;
    assert(counts.changedFields<=counts.stableFields);checks++;
    frames.push({name,...counts});
  };
  run('new rows',()=>{},0,0);
  run('one numeric field',()=>record.a0++,21,1);
  run('NaN unchanged',()=>{record.a1=NaN;},0,0);
  run('negative zero changes',()=>{record.a2=0;},21,1);
  run('tag and payload change counts once',()=>{record.a3={v:'x'};},21,1);
  run('undefined field',()=>{record.a4=undefined;},21,1);
  run('key order change',()=>{const v=record.a0;delete record.a0;record.a0=v;},0,0);
  run('field removed',()=>{delete record.a5;},0,0);
  run('field added',()=>{record.a5=5;},0,0);
  run('retire record',()=>{hud.record=null;},0,0);
  run('reenter record',()=>{hud.record=record;},0,0);
  run('infinity',()=>{record.a0=Infinity;},21,1);
  for(const Constructor of [Encoder,Observed]){
    const invalid=new Constructor(775,'render','ui');
    assert.throws(()=>invalid.captureUi({kind:'lan-presentation-ui',hud:{bad:()=>{}},map,deployment,presence},0),/Unsupported presentation value/);checks++;
    assert.throws(()=>invalid.captureUi({kind:'lan-presentation-ui',hud:{},map,deployment,presence},0),/failed/);checks++;
  }
  return {checks,exactPackets:frames.length,frames,scope:'UI counts and unchanged original packet bytes only; instrumentation does not alter the codec.'};
}
