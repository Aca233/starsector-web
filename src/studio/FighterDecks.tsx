import { useDwellHover } from './useDwellHover';
import { EquipmentTooltip } from './EquipmentTooltip';
import { WingInformation } from './WingInformation';
import { RefitHoverTerm } from './RefitHoverTerms';
import type { CSSProperties } from 'react';
import { contentRegistry } from '../engine/content/ContentRegistry';
import { runtimeAssetUrl } from '../engine/runtime/RuntimePaths';
import { builtInWingIds, designWingSlots, nativeRefit } from './DesignModel';
import type { Design } from './DesignModel';
import './fighter-decks.css';

/** Show each craft in the wing using its actual imported hull sprite. */
export function WingFormation({ id }: { id: string }) {
  const wing = nativeRefit.wings?.[id];
  const craft = wing && contentRegistry.getShip(wing.specId);
  if (!wing || !craft) return <span className="wing-no-sprite">?</span>;
  const columns = wing.count <= 4 ? Math.min(2, wing.count) : 3;
  return <span className="wing-formation" data-count={wing.count} style={{ '--wing-columns': columns } as CSSProperties} aria-hidden="true">
    {Array.from({length: wing.count}, (_, i) => <img key={i} src={runtimeAssetUrl(craft.spriteUrl)} alt="" draggable={false} />)}
  </span>;
}

export function FighterDecks({ draft, selected, inert, onSelect, onRemove }: {
  draft: Design; selected: number | null; inert?: boolean;
  onSelect: (index: number) => void; onRemove: (index: number) => void;
}) {
  const hover = useDwellHover({ enabled: !inert && selected === null });
  const slots = designWingSlots(draft);
  const builtins = builtInWingIds(draft.hullId);
  const activeIndex = hover.active ? Number(hover.active.id) : -1;
  const activeId = slots[activeIndex];
  const preview = activeId ? nativeRefit.wings?.[activeId] : undefined;
  const activeBuiltin = activeIndex >= 0 && activeIndex < builtins.length;
  if (!slots.length) return null;
  return <section className="refit-fighter-decks" aria-label="战机甲板" inert={inert}>
    <h2>战机甲板</h2>
    <div className="refit-deck-slots">
      {slots.map((id, index) => {
        const wing = id ? nativeRefit.wings?.[id] : null;
        const builtin = index < builtins.length;
        const label = `战机甲板 ${index + 1}，${wing ? wing.name + '，' + wing.count + ' 架' : '空甲板'}${builtin ? '，内置联队' : wing ? '，' + wing.op + ' OP' : ''}`;
        return <button type="button" key={index} className="refit-deck-slot" data-deck-index={index} aria-label={label}
          aria-pressed={selected === index} {...hover.bind(String(index))}
          onClick={() => { hover.hide(); onSelect(index); }} onContextMenu={e => { e.preventDefault(); if (!builtin && id) { hover.hide(); onRemove(index); } }}
          onKeyDown={e => { if (e.key === 'Delete' && !builtin && id) {e.preventDefault(); e.stopPropagation(); hover.hide(); onRemove(index);} }}>
          {id ? <WingFormation id={id} /> : <span className="refit-deck-empty" aria-hidden="true">+</span>}
          <span className="refit-deck-op">{builtin ? '内置' : wing?.op ?? ''}</span>
          <span className="refit-deck-index" aria-hidden="true">{index + 1}</span>
        </button>;
      })}
    </div>
    {hover.active && <EquipmentTooltip hover={hover} preferSide className="native-wing-tooltip">
      <h3>战机甲板 {activeIndex + 1} · {preview?.name ?? '空甲板'}</h3>
      <p className="equipment-state">{activeBuiltin ? '舰体内置 · 点击查看，不占装配点' : '点击更换联队；右键或 Delete 卸下'}</p>
      {preview ? <WingInformation wing={preview} /> : <p>此甲板未安装联队。点击选择战机，每个甲板安装一个联队，共享舰船的 <RefitHoverTerm term="op">OP</RefitHoverTerm> 预算。</p>}
    </EquipmentTooltip>}
  </section>;
}
