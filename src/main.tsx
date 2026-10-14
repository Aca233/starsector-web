import { createRoot } from 'react-dom/client'
import './index.css'
import { initializeShipPacks } from './engine/modding/ShipPackBootstrap'
import { RuntimeErrorBoundary } from './ui/RuntimeErrorBoundary'
import { installBrowserGestureGuard } from './ui/browserGestureGuard'

document.documentElement.dataset.uiTheme = new URLSearchParams(location.search).get('ui') === 'classic' ? 'classic' : 'vanguard'
const root = document.getElementById('root')!
// Dialogs are portaled to body, outside the React root.
const removeGestureGuard = installBrowserGestureGuard(document.body)
if (import.meta.hot) import.meta.hot.dispose(removeGestureGuard)

const reactRoot = createRoot(root)
reactRoot.render(<div className="native-loading" role="status">正在读取舰船包…</div>)
async function start() {
  try {
    await initializeShipPacks()
    const { default: App } = await import('./App.tsx')
    reactRoot.render(<RuntimeErrorBoundary><App /></RuntimeErrorBoundary>)
  } catch (error) {
    const managePacks = async () => {
      try {
        const [{ShipPackPanel}, {readShipPackProfile}] = await Promise.all([import('./studio/ShipPackPanel'), import('./engine/modding/ShipPackStore')]);
        const profile = await readShipPackProfile();
        if (!Array.isArray(profile.installed) || !Array.isArray(profile.disabled) || profile.installed.some(file => !file.pack?.id)) throw new Error('安装记录结构损坏，需要从备份恢复。');
        reactRoot.render(<RuntimeErrorBoundary><main className="native-loading"><h1>舰船包恢复</h1><ShipPackPanel initialProfile={profile} /></main></RuntimeErrorBoundary>);
      } catch (cause) { reactRoot.render(<main className="native-loading" role="alert"><p>{String(cause)}</p><button type="button" onClick={() => window.location.reload()}>重新读取</button></main>); }
    }
    reactRoot.render(<main className="native-loading" role="alert"><p>舰船包未能启动：{error instanceof Error ? error.message : String(error)}</p>
      <p>安装记录与方案仍保留。</p><button type="button" onClick={() => window.location.reload()}>重新读取</button>
      <button type="button" onClick={() => void managePacks()}>管理舰船包</button></main>)
  }
}
void start()
