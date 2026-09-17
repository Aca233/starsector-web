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
  const slots = designWingSlots(draft);
  const builtins = builtInWingIds(draft.hullId);
  if (!slots.length) return null;
  return <section className="refit-fighter-decks" aria-label="战机甲板" inert={inert}>
    <h2>战机甲板</h2>
    <div className="refit-deck-slots">
      {slots.map((id, index) => {
        const wing = id ? nativeRefit.wings?.[id] : null;
        const builtin = index < builtins.length;
        const label = `战机甲板 ${index + 1}，${wing ? wing.name + '，' + wing.count + ' 架' : '空甲板'}${builtin ? '，内置联队' : wing ? '，' + wing.op + ' OP' : ''}`;
        return <button type="button" key={index} className="refit-deck-slot" data-deck-index={index} aria-label={label}
          aria-pressed={selected === index} title={`${label}\n${builtin ? '内置联队，点击查看' : '点击更换联队；右键或 Delete 卸下'}`}
          onClick={() => onSelect(index)} onContextMenu={e => { e.preventDefault(); if (!builtin && id) onRemove(index); }}
          onKeyDown={e => { if (e.key === 'Delete' && !builtin && id) {e.preventDefault(); e.stopPropagation(); onRemove(index);} }}>
          {id ? <WingFormation id={id} /> : <span className="refit-deck-empty" aria-hidden="true">+</span>}
          <span className="refit-deck-op">{builtin ? '内置' : wing?.op ?? ''}</span>
          <span className="refit-deck-index" aria-hidden="true">{index + 1}</span>
        </button>;
      })}
    </div>
  </section>;
}
