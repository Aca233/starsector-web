import { NativeButton } from '../ui/NativeChrome';
import { teamName, type Room } from './protocol';

export function LanAiTeamTabs({room,activeTeam,disabled,onChange}:{
  room:Room; activeTeam:number; disabled:boolean; onChange:(team:number)=>void;
}) {
  return <div className="lan-ai-team-tabs" role="tablist" aria-label="AI 编成队伍"
    onKeyDown={event=>{
      const keys=['ArrowLeft','ArrowRight','Home','End'];
      if(disabled||!keys.includes(event.key))return;
      event.preventDefault();event.stopPropagation();
      const length=room.options.aiHulls.length;
      const next=event.key==='Home'?0:event.key==='End'?length-1:(activeTeam+(event.key==='ArrowRight'?1:-1)+length)%length;
      onChange(next);
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
    }}>
    {room.options.aiHulls.map((hulls,team)=><NativeButton key={team} role="tab" aria-selected={activeTeam===team}
      aria-controls="lan-ai-team-panel" tabIndex={activeTeam===team?0:-1} disabled={disabled}
      aria-label={teamName(team)+'，'+hulls.length+' 艘 AI'} onClick={()=>onChange(team)}>
      <strong>{teamName(team)}</strong><small>{hulls.length} AI · {room.members.filter(member=>member.team===team).length} 人</small>
    </NativeButton>)}
  </div>;
}
