import { useMemo } from 'react';
import { createDesign, data, evaluate, type Design } from '../studio/DesignModel';
import { RefitInspection, type InspectionTarget } from '../studio/RefitInspection';
import { LoadoutSection } from '../studio/VariantInspection';
import { RefitHint } from '../studio/RefitHint';
import { costs } from '../engine/data/generated/simulation-roster.json';
import type { OpenWeaponCodex } from '../studio/useInspectionCodex';
import { LanHullThumbnail } from './LanHullThumbnail';
import { NativeBitmapText } from '../ui/NativeBitmapText';
import './lan-ai-inspection.css';
import { teamName } from './protocol';

interface AiInspectionData {
  hull: string; name: string; design: Design | null; count?: number; team?: number | null;
  warnings?: string[]; error?: string;
  /** Only legacy room entries actually spawn the default design. Failed imports must not use it. */
  defaultLoadout?: boolean;
}
export function LanAiInspection({ entry, children, onOpenCodex, onLockChange, enabled = true }: {
  entry: AiInspectionData; children: InspectionTarget; onOpenCodex: OpenWeaponCodex;
  onLockChange?: (locked: boolean) => void; enabled?: boolean;
}) {
  return <RefitInspection native hideTitle title={entry.name + ' · AI 配装'} className="refit-loadout-inspection lan-ai-inspection"
    enabled={enabled} onLockChange={onLockChange} dismissOnClick={!!children.props.onClick}
    content={<AiInformation entry={entry} onOpenCodex={onOpenCodex} />}>{children}</RefitInspection>;
}
function AiInformation({ entry, onOpenCodex }: { entry: AiInspectionData; onOpenCodex: OpenWeaponCodex }) {
  const resolved = useMemo(() => {
    try {
      const design = entry.design ?? (entry.defaultLoadout ? createDesign(entry.hull) : null);
      return design ? { design, result: evaluate(design), error: '' } : null;
    } catch (cause) { return { design: null, result: null, error: cause instanceof Error ? cause.message : '无法读取配装' }; }
  }, [entry.design, entry.hull, entry.defaultLoadout]);
  const notices = [...new Set([...(entry.warnings ?? []), ...(resolved?.result?.errors ?? []), entry.error, resolved?.error].filter(Boolean))];
  const dp = (costs as Record<string, number>)[entry.hull];
  return <>
    <header className="lan-ai-inspection-heading">
      <LanHullThumbnail hull={entry.hull} name={data.ships[entry.hull]?.name ?? entry.hull} />
      <div><h3><NativeBitmapText font="body" color="currentColor">{entry.name}</NativeBitmapText></h3>
        <p>{data.ships[entry.hull]?.name ?? entry.hull}{data.ships[entry.hull]?.designation ? '级 · ' + data.ships[entry.hull].designation : ''}</p>
        <p className="equipment-state">AI 配装{entry.count !== undefined && ` · ${entry.count} 艘`}{entry.team !== undefined && ` · ${entry.team === null ? '各自独立成队' : teamName(entry.team)}`}</p>
      </div>
    </header>
    {Number.isFinite(dp) && dp > 0 && <p><RefitHint text="部署点是舰船入场占用的额度，不是装配点（OP）。房间按参战阵营分配战斗规模；本组总 DP 不代表同时入场，超过额度的 AI 可能作为预备舰等待增援。各自为战时每艘独立计入自己的阵营。"><span>单艘部署点（DP）</span></RefitHint> {dp}
      {entry.count !== undefined && ` · 本组 ${dp * entry.count} DP`}</p>}
    {resolved?.design && resolved.result ? <LoadoutSection compact draft={resolved.design} spec={resolved.result.spec} onOpenCodex={onOpenCodex} />
      : <p className="equipment-state">未能读取此方案的完整装配，不以其他配装代替。</p>}
    <p className="lan-ai-inspection-footnote">只读资料 · 查看不会改变房间编成</p>
    {notices.length > 0 && <RefitInspection title="配装适配说明" content={<ul>{notices.map((text, index) => <li key={index}>{text}</li>)}</ul>}>
      <button type="button" className="lan-ai-inspection-notices">适配说明 / 配装限制 · {notices.length} 项</button>
    </RefitInspection>}

  </>;
}
