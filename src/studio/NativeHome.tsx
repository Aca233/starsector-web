import { useEffect } from 'react';
import { NativeButton } from '../ui/NativeChrome';
import { runtimeAssetUrl } from '../engine/runtime/RuntimePaths';
import { hullCount, weaponCount } from 'virtual:studio-summary';

export function NativeHome({ onEnter, onLan }: { onEnter: () => void; onLan?: () => void }) {
  useEffect(() => { document.title = "远行星号 · 舰船设计"; }, []);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (!event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === 'r') onEnter();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onEnter]);
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
        {onLan && <NativeButton onClick={onLan}>局域网联机</NativeButton>}
        <p className="native-content-count">{hullCount} 艘可改装舰船 · {weaponCount} 种可安装武器</p>
      </div>
      <span className="native-home-version">
        Starsector Web · 舰船改装与模拟战斗
      </span>
    </main>
  );
}
