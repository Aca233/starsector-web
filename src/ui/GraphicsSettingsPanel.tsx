import { useId, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { Monitor } from 'lucide-react';
import { getGraphicsSettings, subscribeGraphicsSettings, updateGraphicsSettings, resetGraphicsSettings, GRAPHICS_PRESETS, type GraphicsSettings } from '../engine/runtime/GraphicsSettings';
import { FullscreenButton } from './FullscreenButton';
import './graphics-settings.css';

export function GraphicsSettingsPanel() {
  const settings = useSyncExternalStore(subscribeGraphicsSettings, getGraphicsSettings, getGraphicsSettings);
  const id = useId();
  const [message, setMessage] = useState('');
  const preset = Object.entries(GRAPHICS_PRESETS).find(([, value]) => Object.keys(value).every(key => value[key] === settings[key]))?.[0] ?? 'custom';
  const change = (patch: Partial<GraphicsSettings>) => { updateGraphicsSettings(patch); setMessage(''); };
  const shake = Math.round(settings.screenShake * 100);
  return <section className="graphics-settings" aria-labelledby={`${id}-heading`}>
    <header className="graphics-settings-heading"><h3 id={`${id}-heading`}><Monitor size={18} aria-hidden="true"/>画面设置</h3><span>即时生效 · 本机保存</span></header>
    <label className="graphics-settings-row"><span>画质预设<small>也可以单独调整下方选项</small></span>
      <select aria-label="画质预设" value={preset} onChange={event => change(GRAPHICS_PRESETS[event.target.value])}>
        <option value="quality">画质优先</option><option value="balanced">均衡</option><option value="performance">性能优先</option><option value="custom" disabled>自定义</option>
      </select>
    </label>
    <label className="graphics-settings-row"><span>渲染分辨率<small>仅影响战场清晰度，界面文字保持清晰</small></span>
      <select aria-label="渲染分辨率" value={settings.renderScale} onChange={event => change({ renderScale: Number(event.target.value) as GraphicsSettings['renderScale'] })}>
        <option value="1">100% · 原始分辨率</option><option value="0.75">75% · 均衡</option><option value="0.5">50% · 更低 GPU 负载</option>
      </select>
    </label>
    <label className="graphics-settings-row"><span>画面帧率上限<small>只限制画面绘制，不改变战斗模拟速度</small></span>
      <select aria-label="画面帧率上限" value={settings.maxFrameRate} onChange={event => change({ maxFrameRate: Number(event.target.value) as GraphicsSettings['maxFrameRate'] })}>
        <option value="0">跟随屏幕刷新率</option><option value="120">120 FPS</option><option value="60">60 FPS</option><option value="30">30 FPS · 节能</option>
      </select>
    </label>
    <label className="graphics-settings-row"><span>粒子细节<small>精简模式减少烟尘、火花和装饰碎片</small></span>
      <select aria-label="粒子细节" value={settings.detailedParticles ? 'full' : 'simple'} onChange={event => change({ detailedParticles: event.target.value === 'full' })}>
        <option value="full">完整</option><option value="simple">精简</option>
      </select>
    </label>
    <label className="graphics-settings-row"><span>背景星空<small>关闭后使用纯色深空；保留战场星云与小行星</small></span>
      <input type="checkbox" role="switch" aria-label="背景星空" checked={settings.background} onChange={event => change({ background: event.target.checked })}/>
    </label>
    <div className="graphics-settings-shake">
      <div><label htmlFor={`${id}-shake`}>镜头震动强度</label><output htmlFor={`${id}-shake`}>{shake}%</output></div>
      <input type="range" id={`${id}-shake`} min="0" max="100" step="1" value={shake} aria-valuetext={`${shake}%`}
        style={{ '--graphics-level': `${shake}%` } as CSSProperties} onChange={event => change({ screenShake: Number(event.target.value) / 100 })}/>
      <small>设为 0% 关闭爆炸震屏，不影响瞄准和命中判定。</small>
    </div>
    <div className="graphics-settings-actions"><FullscreenButton/><button type="button" onClick={() => { resetGraphicsSettings(); setMessage('已恢复默认画面设置，声音设置保持不变。'); }}>恢复画面默认值</button></div>
    <p role="status">{message || '画质调整不会隐藏弹丸、光束、护盾或水雷，也不会更改联机房间设置。'}</p>
  </section>;
}
