import type { CSSProperties } from 'react';
import type { Ship } from '../../engine/simulation/Ship';
import { dispatchShipCommand } from '../../engine/runtime/CombatCommands';
import { i18n } from '../../engine/i18n/LocalizationManager';
import { runtimeAssetUrl } from '../../engine/runtime/RuntimePaths';
import { summarizeGroupAmmo } from './hudUtils';
import type { WeaponHudGroup } from './WeaponHudModel';

const damageLabels = { KINETIC: '动能', HIGH_EXPLOSIVE: '高爆', ENERGY: '能量', FRAGMENTATION: '破片' };

/** Source group composition and diagonal stacking, with readable system text. */
export interface WeaponGroupControls {
  /** Route selection through an authority (LAN); absent keeps local solo controls. */
  onSelectGroup?: (index: number) => void;
  readOnlyFireModes?: boolean;
  onToggleMode?: (index: number) => void;
  onToggleAutofire?: (index: number) => void;
}
export function WeaponGroupConsole({ player, groups, onSelectGroup, onToggleMode, onToggleAutofire, readOnlyFireModes = false }: { player: Ship; groups: WeaponHudGroup[] } & WeaponGroupControls) {
  return (
    <section className="hud-weapon-groups" aria-label="武器组">
      <div className="hud-weapon-heading hud-text">武器组</div>
      {groups.map(({ group, arrayIndex, entries, height, shift }) => {
        const selected = player.selectedGroupIndex === arrayIndex;
        return (
          <div key={group.index} className="hud-weapon-group" data-group-index={group.index} data-selected={selected}
            style={{ height, '--group-shift': `${shift}px`, '--group-opacity': selected ? 1 : 0.5 } as CSSProperties}>
            <button type="button" className="hud-weapon-select" aria-label={`选择武器组 ${group.index + 1}`} aria-pressed={selected}
              onClick={() => onSelectGroup ? onSelectGroup(group.index) : dispatchShipCommand(player, { kind: 'group', value: group.index })}>
              <span className="hud-group-number hud-text">{group.index + 1}.</span>
              <span className="hud-weapon-entries">
                {entries.map(({ specId, mounts }) => {
                  const spec = mounts[0].spec;
                  const name = i18n.t(spec.nameKey).split(' (')[0];
                  const ammo = summarizeGroupAmmo(mounts);
                  const title = `${mounts.length}x ${name}；伤害类型：${damageLabels[spec.type]}${ammo.limited ? `；弹药 ${ammo.remaining}/${ammo.capacity}` : ''}`;
                  const icon = spec.turretSpriteUrl || spec.hardpointSpriteUrl;
                  const iconSize = spec.mountSize === 'LARGE' ? 26 : spec.mountSize === 'MEDIUM' ? 26 * 5 / 6 : 26 * 2 / 3;
                  return (
                    <span key={specId} className="hud-weapon-entry" data-weapon-id={specId} title={title}>
                      <span className="hud-weapon-icon" aria-hidden="true">
                        {icon && <img src={runtimeAssetUrl(icon)} alt="" style={{ width: iconSize, height: iconSize }} />}
                      </span>
                      <span className="hud-weapon-name hud-text">{mounts.length}x {name}</span>
                      <span className="hud-weapon-damage hud-text">伤害类型：{damageLabels[spec.type]}</span>
                    </span>
                  );
                })}
              </span>
            </button>
            <button type="button" className="hud-group-mode hud-text" disabled={readOnlyFireModes} title={readOnlyFireModes ? "联机使用预设射击模式" : `切换武器组 ${group.index + 1} 的射击模式`}
              aria-label={`武器组 ${group.index + 1} 射击模式：${group.mode === 'LINKED' ? '齐射' : '交替'}`}
              onClick={() => onToggleMode ? onToggleMode(group.index) : dispatchShipCommand(player, { kind: 'mode', value: group.index })}>
              {group.mode === 'LINKED' ? '齐射' : '交替'}
            </button>
            <button type="button" className="hud-group-autofire hud-text" role="switch" aria-checked={group.isAutofire}
              aria-label={`武器组 ${group.index + 1} 自动开火`} disabled={readOnlyFireModes} title={readOnlyFireModes ? "联机使用预设自动开火状态" : `[Ctrl+${group.index + 1}] 切换自动开火`}
              style={{ opacity: selected || group.isAutofire ? 1 : 0.5 }} onClick={() => onToggleAutofire ? onToggleAutofire(group.index) : dispatchShipCommand(player, { kind: 'autofire', value: group.index })}>
              自动开火：<span aria-hidden="true" className="hud-autofire-indicator" data-active={group.isAutofire} />
            </button>
          </div>
        );
      })}
    </section>
  );
}
