import { useEffect, useState } from 'react';
import { hullModDefinitions } from '../engine/extensions/HullMods';
import { runtimeAssetUrl } from '../engine/runtime/RuntimePaths';
import { Modal } from '../ui/core/UI';
import { builtInModName } from './DesignModel';
import { EquipmentTooltip } from './EquipmentTooltip';
import { useEquipmentHover } from './useEquipmentHover';
import { ModInformation } from './HullModInformation';

/** Same card on the fitted-mod rail and the install list. F2 opens a real data view. */
export function useHullModTooltip(enabled = true, statusFor?: (id: string) => string) {
  const hover = useEquipmentHover();
  const [encyclopedia, setEncyclopedia] = useState<string | null>(null);
  const id = enabled ? hover.active?.id : undefined;
  const { hide } = hover;
  useEffect(() => { if (!enabled) hide(); }, [enabled, hide]);
  useEffect(() => {
    if (!id || encyclopedia) return;
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'F2' || event.repeat) return;
      event.preventDefault(); event.stopImmediatePropagation(); setEncyclopedia(id); hide();
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [id, encyclopedia, hide]);
  return { ...hover, content: <>
    {id && !encyclopedia && <EquipmentTooltip hover={hover}><h3>{builtInModName(id)}</h3><ModInformation id={id} />
      {statusFor && <p className="equipment-state">{statusFor(id)}</p>}
      <button className="equipment-encyclopedia" type="button" onClick={() => { setEncyclopedia(id); hide(); }}>按 <kbd>F2</kbd> 打开数据百科</button>
    </EquipmentTooltip>}
    {encyclopedia && <Modal title={`${builtInModName(encyclopedia)} · 数据百科`} width="small" onClose={() => { setEncyclopedia(null); hide(); }}>
      <article className="hullmod-encyclopedia">
        {hullModDefinitions.get(encyclopedia)?.refit?.icon && <img src={runtimeAssetUrl('/game-assets/' + hullModDefinitions.get(encyclopedia)!.refit!.icon)} alt="" />}
        <ModInformation id={encyclopedia} /><p>原版 ID：<code>{encyclopedia}</code></p><p>以上效果说明与当前 Web 插件定义一致。原版专属、战役及未实现机制不会作为当前增益计算。</p>
      </article>
    </Modal>}
  </> };
}
