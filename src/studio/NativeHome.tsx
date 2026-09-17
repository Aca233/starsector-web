import { useEffect, useState } from 'react';
import { Modal } from '../ui/core/UI';
import { LocalBattleSizeSettings } from '../ui/BattleSizeControl';
import { NativeButton } from '../ui/NativeChrome';
import { runtimeAssetUrl } from '../engine/runtime/RuntimePaths';
import { hullCount, weaponCount } from 'virtual:studio-summary';

export function NativeHome({ onEnter, onSkills, onLan }: { onEnter: () => void; onSkills: () => void; onLan?: () => void }) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  useEffect(() => { document.title = "远行星号 · 舰船设计"; }, []);
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
    <main className="native-home">
      <img
        className="native-title-logo"
        src={runtimeAssetUrl(
          "/game-assets/graphics/ui/starsector_title_alpha.png",
        )}
        alt="Starsector 远行星号"
      />
      <div className="native-home-menu">
        <NativeButton shortcut="R" onClick={onEnter}>
          舰船设计
        </NativeButton>
        <NativeButton shortcut="C" onClick={onSkills} data-skills-entry>角色技能</NativeButton>
        {onLan && <NativeButton onClick={onLan}>局域网联机</NativeButton>}
        <NativeButton onClick={() => setSettingsOpen(true)}>游戏设置</NativeButton>
        <p className="native-content-count">{hullCount} 艘可改装舰船 · {weaponCount} 种可安装武器</p>
      </div>
      <span className="native-home-version">
        Starsector Web · 舰船改装与模拟战斗
      </span>
      {settingsOpen && <Modal title="游戏设置" eyebrow="" onClose={()=>setSettingsOpen(false)} footer={<NativeButton onClick={()=>setSettingsOpen(false)}>返回</NativeButton>}><LocalBattleSizeSettings/></Modal>}
    </main>
  );
}
