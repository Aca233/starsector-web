import { useState } from 'react';
import { runtimeAssetUrl } from '../../engine/runtime/RuntimePaths';
export interface TacticalAction { id: string; icon: string; label: string; key?: string; description: string; unavailable?: string; active?: boolean }
export interface TacticalActionGroup { label: string; actions: TacticalAction[] }
export function TacticalCommandDock({ groups, onAction }: { groups: TacticalActionGroup[]; onAction: (action: TacticalAction) => void }) {
  const [hover,setHover]=useState<TacticalAction|null>(null);
  return <nav className="tactical-command-dock" data-groups={groups.length} aria-label="战术指令" onMouseLeave={()=>setHover(null)}>
    {hover&&<aside className="tactical-command-tooltip" role="tooltip"><strong>{hover.label}{hover.key?' ['+hover.key+']':''}</strong><p>{hover.unavailable||hover.description}</p>{hover.unavailable&&<small>当前不可用</small>}</aside>}
    {groups.map((group,index)=><div key={index} className="tactical-command-group"><div className="tactical-command-tiles">
      {group.actions.map(action=><button key={action.id} className="tactical-command-tile" aria-label={action.label} aria-disabled={!!action.unavailable} aria-pressed={action.active}
        onMouseEnter={()=>setHover(action)} onFocus={()=>setHover(action)} onBlur={()=>setHover(null)} onClick={()=>onAction(action)}>
        <span className="tactical-command-tile-face"><img src={runtimeAssetUrl('graphics/warroom/taskicons/'+action.icon+'.png')} alt="" /></span>{action.key&&<kbd>{action.key}</kbd>}
      </button>)}
    </div><span className="tactical-command-group-title">{group.label}</span></div>)}
  </nav>;
}
