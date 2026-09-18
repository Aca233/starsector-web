import { MotionPresence } from '../ui/core/MotionPresence';
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
  const [encyclopedia, setEncyclopedia] = useState<string | null>(null);
  const hover = useEquipmentHover({ enabled: enabled && !encyclopedia });
  const id = enabled ? hover.active?.id : undefined;
  const { hide } = hover;
  useEffect(() => {
    if (!enabled || encyclopedia) return;
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'F2' || event.repeat) return;
      const focused = document.activeElement?.closest<HTMLElement>('[data-inspect-mod]');
      const target = id ?? (focused && !focused.closest('[inert]') ? focused.dataset.inspectMod : undefined);
      if (!target) return;
      event.preventDefault(); event.stopImmediatePropagation(); setEncyclopedia(target); hide();
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [id, enabled, encyclopedia, hide]);
  return { ...hover, bind: (id: string) => ({ ...hover.bind(id), 'data-inspect-mod': id }), content: <>
    {id && !encyclopedia && <EquipmentTooltip hover={hover}><h3>{builtInModName(id)}</h3><ModInformation id={id} />
      {statusFor && <p className="equipment-state">{statusFor(id)}</p>}
      <button className="equipment-encyclopedia" type="button" onClick={() => { setEncyclopedia(id); hide(); }}>按 <kbd>F2</kbd> 打开数据百科</button>
    </EquipmentTooltip>}
    <MotionPresence>{encyclopedia && <Modal title={`${builtInModName(encyclopedia)} · 数据百科`} width="small" onClose={() => { setEncyclopedia(null); hide(); }}>
      <article className="hullmod-encyclopedia">
        {hullModDefinitions.get(encyclopedia)?.refit?.icon && <img src={runtimeAssetUrl('/game-assets/' + hullModDefinitions.get(encyclopedia)!.refit!.icon)} alt="" />}
        <ModInformation id={encyclopedia} /><p>原版 ID：<code>{encyclopedia}</code></p><p>以上效果说明与当前 Web 插件定义一致。原版专属、战役及未实现机制不会作为当前增益计算。</p>
      </article>
    </Modal>}</MotionPresence>
  </> };
}
