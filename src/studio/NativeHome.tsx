import { PresentationSettingsPanel } from '../ui/PresentationSettingsPanel';
import { SystemBindingSettings } from '../ui/SystemBindingSettings';
import { MotionPresence } from '../ui/core/MotionPresence';
import { FullscreenButton } from '../ui/FullscreenButton';
import { useEffect, useId, useState } from 'react';
import { Modal } from '../ui/core/UI';
import { LocalBattleSizeSettings } from '../ui/BattleSizeControl';
import { hullCount, weaponCount } from 'virtual:studio-summary';
import './native-home.css';

const settingsSections = [
  { id: 'presentation', label: '声音与画面', number: '01' },
  { id: 'battle', label: '战斗规模', number: '02' },
  { id: 'bindings', label: '快捷键', number: '03' },
] as const;
type SettingsSection = typeof settingsSections[number]['id'];

export function NativeHome({ onEnter, onSkills, onLan, onSteam, entryError, staticHosted, lanLabel }: { onEnter: () => void; onSkills: () => void; onLan?: () => void; onSteam?: () => void; entryError?: string; staticHosted?: boolean; lanLabel?: string }) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('presentation');
  const settingsId = useId();
  useEffect(() => { document.title = '星舰工坊 · 舰队指挥中心'; }, []);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || document.querySelector('[role="dialog"], [role="alertdialog"]') ||
        (event.target instanceof HTMLElement && event.target.closest('input,textarea,select,[contenteditable]'))) return;
      if (event.key.toLowerCase() === 'r') { event.preventDefault(); onEnter(); }
      if (event.key.toLowerCase() === 'c') { event.preventDefault(); onSkills(); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onEnter, onSkills]);
  return (
    <main className="native-home fleet-home">
      <div className="fleet-home-art" aria-hidden="true" />
      <div className="fleet-home-shade" aria-hidden="true" />
      <header className="fleet-masthead">
        <div className="fleet-wordmark">
          <span className="fleet-insignia" aria-hidden="true"><i /><i /><i /></span>
          <div>STARSHIP <span>FOUNDRY</span></div>
        </div>
        <div className="fleet-masthead-right"><FullscreenButton /></div>
      </header>

      <div className="fleet-home-body">
        <section className="fleet-home-command" aria-labelledby="command-title">
          <h1 id="command-title">舰队指挥</h1>

          <nav className="fleet-menu" aria-label="主菜单">
            <button type="button" className="fleet-launch" onClick={onEnter} aria-label="舰船设计" aria-keyshortcuts="R">
              <span className="fleet-launch-copy"><strong>舰船设计</strong></span>
              <span className="fleet-launch-end"><kbd>R</kbd><span aria-hidden="true">↗</span></span>
            </button>
            <button type="button" className="fleet-menu-item" onClick={onSkills} data-skills-entry aria-label="角色技能" aria-keyshortcuts="C">
              <span className="fleet-item-number" aria-hidden="true">02</span><span className="fleet-item-label">角色技能</span><kbd>C</kbd><span className="fleet-item-arrow" aria-hidden="true">↗</span>
            </button>
            {onLan && <button type="button" className="fleet-menu-item" onClick={onLan} aria-label={lanLabel ?? '局域网联机'}>
              <span className="fleet-item-number" aria-hidden="true">03</span><span className="fleet-item-label">{lanLabel ?? '局域网联机'}</span><span className="fleet-item-arrow" aria-hidden="true">↗</span>
            </button>}
            {onSteam && <button type="button" className="fleet-menu-item" onClick={onSteam} aria-label="Steam 联机">
              <span className="fleet-item-number" aria-hidden="true">04</span><span className="fleet-item-label">Steam 联机</span><span className="fleet-item-arrow" aria-hidden="true">↗</span>
            </button>}
          </nav>
          {staticHosted && <p className="native-static-note fleet-static-note">浏览器单机试玩 · 联机请使用 <a href="https://github.com/Aca233/starsector-web/releases/latest" target="_blank" rel="noopener noreferrer">桌面版 ↗</a></p>}
          {entryError && <p className="fleet-entry-error" role="alert">{entryError}</p>}
          <button type="button" className="fleet-settings-trigger" onClick={() => setSettingsOpen(true)} aria-label="游戏设置"><span aria-hidden="true">＋</span> 游戏设置</button>
        </section>

      </div>

      <footer className="fleet-home-footer">
        <div className="fleet-catalog-summary" aria-label="当前内容库">
          <div><strong>{hullCount.toLocaleString()}</strong><span>艘舰船</span></div>
          <span className="fleet-footer-divider" aria-hidden="true" />
          <div><strong>{weaponCount.toLocaleString()}</strong><span>种武器</span></div>
        </div>
      </footer>

      <MotionPresence>{settingsOpen && <Modal title="游戏设置" eyebrow="" className="fleet-settings" onClose={() => setSettingsOpen(false)} footer={<><button type="button" className="fleet-settings-done" onClick={() => setSettingsOpen(false)}>返回指挥中心 <kbd>Esc</kbd></button></>}>
        <div className="fleet-settings-tabs" role="tablist" aria-label="设置分类">
          {settingsSections.map((section, index) => <button type="button" role="tab" key={section.id} id={`${settingsId}-${section.id}-tab`} aria-controls={`${settingsId}-${section.id}-panel`} aria-selected={settingsSection === section.id} tabIndex={settingsSection === section.id ? 0 : -1}
            onClick={() => setSettingsSection(section.id)} onKeyDownCapture={event => {
              if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
              event.preventDefault(); event.stopPropagation();
              const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? settingsSections.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + settingsSections.length) % settingsSections.length;
              const next = settingsSections[nextIndex];
              setSettingsSection(next.id);
              document.getElementById(`${settingsId}-${next.id}-tab`)?.focus();
            }}><small>{section.number}</small>{section.label}</button>)}
        </div>
        <div className="fleet-settings-section" role="tabpanel" id={`${settingsId}-presentation-panel`} aria-labelledby={`${settingsId}-presentation-tab`} hidden={settingsSection !== 'presentation'}><PresentationSettingsPanel /></div>
        <div className="fleet-settings-section" role="tabpanel" id={`${settingsId}-battle-panel`} aria-labelledby={`${settingsId}-battle-tab`} hidden={settingsSection !== 'battle'}><LocalBattleSizeSettings /></div>
        <div className="fleet-settings-section" role="tabpanel" id={`${settingsId}-bindings-panel`} aria-labelledby={`${settingsId}-bindings-tab`} hidden={settingsSection !== 'bindings'}><SystemBindingSettings /></div>
      </Modal>}</MotionPresence>
    </main>
  );
}
