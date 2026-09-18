import { DwellReader } from './DwellTooltip';
import { hullModDefinitions } from '../engine/extensions/HullMods';
import { modDescriptions } from './DesignModel';
import { RefitExplanationText, RefitHoverTerm } from './RefitHoverTerms';
export function ModInformation({ id }: { id: string }) {
  const definition = hullModDefinitions.get(id);
  return <DwellReader>
    <p className="equipment-design">设计类型：{definition?.refit?.manufacturer || '未分类'}</p>
    <p><RefitExplanationText highlightNumbers text={modDescriptions[id] ?? '当前仅保留原版元数据，效果尚未实现。'} /></p>
    {definition?.sMod && <section className="equipment-smod"><h4><RefitHoverTerm term="sMod">S-mod 固化效果</RefitHoverTerm></h4>
      <p><RefitExplanationText highlightNumbers text={definition.sMod.description} /></p><small>仅固化或增强内置时生效；普通安装不应用该项。外装固化免除 <RefitHoverTerm term="op">OP</RefitHoverTerm> 费用。</small></section>}
    {definition?.support?.scope === 'mixed' && <p className="equipment-state">{definition.support.summary}</p>}
    {definition?.support?.scope === 'campaign-only' ? <p className="equipment-state">仅战役 · 当前无战役模拟</p>
      : definition?.status === 'metadata-only' ? <p className="equipment-state">尚未实现 · 当前仅保留原版资料，未应用战斗效果</p> : null}
  </DwellReader>;
}

