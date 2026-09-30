import type { HudShip as Ship } from '../../engine/runtime/CombatHudView';
import { i18n } from '../../engine/i18n/LocalizationManager';
import { runtimeAssetUrl } from '../../engine/runtime/RuntimePaths';
import { summarizeGroupAmmo } from './hudUtils';
import type { WeaponHudGroup } from './WeaponHudModel';

const damageLabels = { KINETIC: '动能', HIGH_EXPLOSIVE: '高爆', ENERGY: '能量', FRAGMENTATION: '破片' };

export interface WeaponGroupControls {
  /** Every write requires an authority callback; no callback means read-only. */
  onSelectGroup?: (index: number) => void;
  readOnlyFireModes?: boolean;
  onToggleMode?: (index: number) => void;
  onToggleAutofire?: (index: number) => void;
}
export function WeaponGroupConsole({ player, groups, onSelectGroup, onToggleMode, onToggleAutofire, readOnlyFireModes = false }: { player: Ship; groups: WeaponHudGroup[] } & WeaponGroupControls) {
  return (
    <section className="hud-weapon-groups" aria-label="武器组">
      <div className="hud-weapon-heading hud-text">武器组</div>
      <div className="hud-weapon-list">
        {groups.map(({ group, arrayIndex, entries }) => {
          const selected = player.selectedGroupIndex === arrayIndex;
          return <div key={group.index} className="hud-weapon-group" data-group-index={group.index} data-selected={selected}>
            <button type="button" className="hud-weapon-select" aria-label={`选择武器组 ${group.index + 1}`} aria-pressed={selected}
              disabled={!onSelectGroup} onClick={() => onSelectGroup?.(group.index)}>
              <span className="hud-group-number">{group.index + 1}</span>
              <span className="hud-weapon-entries">
                {entries.map(({ specId, mounts }) => {
                  const spec = mounts[0].spec;
                  const name = i18n.t(spec.nameKey).split(' (')[0];
                  const ammo = summarizeGroupAmmo(mounts);
                  const title = `${mounts.length}x ${name}；伤害类型：${damageLabels[spec.type]}${ammo.limited ? `；弹药 ${ammo.remaining}/${ammo.capacity}` : ''}`;
                  const icon = spec.displayIconUrl || spec.turretSpriteUrl || spec.hardpointSpriteUrl;
                  return <span key={specId} className="hud-weapon-entry" data-weapon-id={specId} title={title}>
                    <span className="hud-weapon-icon" aria-hidden="true">{icon && <img src={runtimeAssetUrl(icon)} alt="" />}</span>
                    <span className="hud-weapon-name">{mounts.length}× {name}</span>
                    <span className="hud-weapon-damage">{damageLabels[spec.type]}{ammo.limited ? ` · ${ammo.remaining}/${ammo.capacity}` : ''}</span>
                  </span>;
                })}
              </span>
            </button>
            <div className="hud-group-controls">
              <button type="button" className="hud-group-mode" disabled={readOnlyFireModes || !onToggleMode} title={readOnlyFireModes ? '联机使用预设射击模式' : `切换武器组 ${group.index + 1} 的射击模式`}
                aria-label={`武器组 ${group.index + 1} 射击模式：${group.mode === 'LINKED' ? '齐射' : '交替'}`} onClick={() => onToggleMode?.(group.index)}>
                {group.mode === 'LINKED' ? '齐射' : '交替'}
              </button>
              <button type="button" className="hud-group-autofire" role="switch" aria-checked={group.isAutofire}
                aria-label={`武器组 ${group.index + 1} 自动开火`} disabled={readOnlyFireModes || !onToggleAutofire} title={readOnlyFireModes ? '联机使用预设自动开火状态' : `[Ctrl+${group.index + 1}] 切换自动开火`}
                onClick={() => onToggleAutofire?.(group.index)}>
                自动<span aria-hidden="true" className="hud-autofire-indicator" data-active={group.isAutofire} />
              </button>
            </div>
          </div>;
        })}
        {!groups.length && <p className="hud-empty-weapons">未装备武器</p>}
      </div>
    </section>
  );
}
