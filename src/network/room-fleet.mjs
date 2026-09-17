import { registerAiLoadout, pruneAiLoadouts } from './ai-loadouts.mjs';
/** Labels stay unique beyond Z, independent of the finite display palette. */
export function teamName(team) {
  let name = "";
  for (let n = team + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + (n - 1) % 26) + name;
  return name + " 队";
}
const encoder = new TextEncoder();
export const wireBytes = value => encoder.encode(JSON.stringify(value)).byteLength;
/** Reserve solo row overhead for all human slots, including later joins. */
export function checkFleetBudget(options, limit, humans, extraHull = "", extraCount = 0) {
  let count = 0, hullBytes = 0;
  for (const row of options.aiHulls) for (const hull of row) { count++; hullBytes += wireBytes(hull) + 1; }
  const additions = extraCount * (wireBytes(extraHull) + 4);
  const normalizedBytes = 128 + hullBytes + (count + humans) * 3 + wireBytes(options.aiLoadouts ?? {});
  if (Math.max(wireBytes(options), normalizedBytes) + additions + 128 > limit)
    throw Error("AI 数量不设固定上限，但本次编成超过 1 MiB 通信安全预算，请减少本次添加数量。");
}

/** Atomic per-configuration edits; a refit preserves roster positions and solo teams. */
export function editAiFleet(options, edit, limit, humans) {
  if (edit.assignment !== options.assignment) throw Error('编队规则已改变，请重新操作。');
  if (!['add','adjust','set-count','refit','remove'].includes(edit.operation)) throw Error('无效 AI 编组操作');
  const solo=options.assignment==='solo', team=solo?0:edit.team;
  if(!Number.isSafeInteger(team)||team<0||team>=options.aiHulls.length)throw Error('无效队伍');
  const refit=edit.operation==='refit';
  if(refit && (edit.baseRevision !== (options.aiRevision ?? 0) || !['group','one'].includes(edit.scope)))throw Error('AI 编成已变化，草稿已保留；请返回编成确认后重新改装。');
  const positions=[];
  for(const [i,row] of options.aiHulls.entries()) if(solo||i===team)for(const [j,key] of row.entries())if(key===edit.hull)positions.push([i,j]);
  if(edit.operation!=='add'&&!positions.length)throw Error('该 AI 方案组已不存在，请重新选择。');
  let next=options,key=edit.hull;
  if(edit.design!==undefined){
    if(!['add','refit'].includes(edit.operation))throw Error('此操作不能更改配装');
    ({options:next,key}=registerAiLoadout(options,edit.design));
  }else if(refit)throw Error('请提供完整的 AI 配装');
  if(typeof key!=='string'||!key||key.length>160)throw Error('无效 AI 方案');
  if(edit.operation==='add'&&!edit.design&&!options.aiHulls.some(row=>row.includes(key)))throw Error('该方案已不存在，请重新添加舰船');
  let additions=0,removals=0;
  if(edit.operation==='add')additions=edit.count;
  if(edit.operation==='adjust'){
    if(edit.count!==1&&edit.count!==-1)throw Error('无效数量调整');
    if(positions.length+edit.count<1)throw Error('最后一艘请使用删除按钮');
    additions=Math.max(0,edit.count);removals=Math.max(0,-edit.count);
  }
  if(edit.operation==='set-count'){
    if(!Number.isSafeInteger(edit.count)||edit.count<1)throw Error('舰船数量必须是大于零的整数');
    additions=Math.max(0,edit.count-positions.length);removals=Math.max(0,positions.length-edit.count);
  }
  if(!Number.isSafeInteger(additions)||additions<0||(edit.operation==='add'&&additions<1))throw Error('舰船数量必须是大于零的整数');
  // Check the extra records BEFORE allocating them; include the shared design dictionary once.
  checkFleetBudget(next,limit,humans,key,additions);
  const rows=options.aiHulls.map(row=>[...row]);
  if(refit)for(const [i,j] of (edit.scope==='one'?positions.slice(0,1):positions))rows[i][j]=key;
  else if(edit.operation==='remove')for(const [i,j] of positions)rows[i][j]=null;
  else if(removals)for(const [i,j] of positions.slice(-removals))rows[i][j]=null;
  if(additions)rows[team]=rows[team].concat(Array(additions).fill(key));
  next=pruneAiLoadouts({...next,aiHulls:rows.map(row=>row.filter(key=>key!==null)),aiRevision:(options.aiRevision??0)+1});
  checkFleetBudget(next,limit,humans);
  return next;
}
