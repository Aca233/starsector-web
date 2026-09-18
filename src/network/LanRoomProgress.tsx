import { NativeButton } from '../ui/NativeChrome';
import { roomWorkflow } from './room-workflow.mjs';
import type { Room } from './protocol';

export function LanRoomProgress({room,id,editable,onAddOpponent,onRules,onSettings}:{
  room:Room; id:string; editable:boolean; onAddOpponent:()=>void; onRules:()=>void; onSettings:()=>void;
}) {
  const workflow=roomWorkflow(room,id), host=room.hostId===id;
  const waiting=room.members.filter(member=>member.id!==room.hostId&&(!member.ready||!member.connected||member.editing));
  const title=!editable?'房间暂不可操作':!workflow.blocked?'可以开始战斗':workflow.offline?'等待断线玩家重连':workflow.opponentsMissing?'还缺一个对手':workflow.deploymentBlocked?'需要调整战斗规模':workflow.editing.length?'等待配装确认':'等待玩家就绪';
  return <section className="lan-room-progress" aria-label="开战准备进度">
    <details><summary><strong>{title}</strong><span>{workflow.ready}/{workflow.guests} 就绪 · 详情</span></summary>
    <ol>
      <li data-done={!workflow.editing.length}><span>{workflow.editing.length?'○':'✓'}</span>配装确认<small>{workflow.editing.length?'未应用：'+workflow.editing.join('、'):'全部已同步'}</small></li>
      <li data-done={!workflow.opponentsMissing}><span>{workflow.opponentsMissing?'○':'✓'}</span>敌对阵营<small>{workflow.opponentsMissing?'至少两方有舰船':'同队协作，异队交战'}</small></li>
      <li data-done={workflow.ready===workflow.guests}><span>{workflow.ready===workflow.guests?'✓':'○'}</span>真人准备<small>{waiting.length?waiting.map(member=>member.name+(!member.connected?'（断线）':member.editing?'（改装中）':'')).join('、'):workflow.guests?'全部客机已准备':'无需坐满；房主直接开始'}</small></li>
    </ol></details>
    {workflow.opponentsMissing&&<div className="lan-room-next-actions">
      {host&&<NativeButton disabled={!editable} onClick={onAddOpponent}>添加 AI 对手</NativeButton>}
      <NativeButton onClick={onRules}>调整分队</NativeButton>
    </div>}
    {workflow.deploymentBlocked&&!workflow.opponentsMissing&&host&&<NativeButton onClick={onSettings}>调整战斗规模</NativeButton>}
    <p role="status">{!host&&workflow.ownReady?'你已准备，等待房主开始。':workflow.blocked||'房主点击下方「开始战斗」。'}</p>
  </section>;
}
