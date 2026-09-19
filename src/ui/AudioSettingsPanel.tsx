import { useId, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { getAudioSettings, subscribeAudioSettings, updateAudioSettings, resetAudioSettings, type AudioChannel, type AudioSettings } from '../engine/audio/AudioSettings';
import { sound } from '../engine/audio/SoundManager';
import './audio-settings.css';

const channels = [
  { key: 'masterVolume', label: '主音量', detail: '控制所有声音的整体响度' },
  { key: 'effectsVolume', label: '战斗音效', detail: '武器、爆炸、引擎与舰船系统' },
  { key: 'interfaceVolume', label: '界面与提示音', detail: '按钮、战术指令、雷达与警报' },
] as const;

/** One settings surface for home, simulator and multiplayer; changes reach active sources. */
export function AudioSettingsPanel() {
  const settings = useSyncExternalStore(subscribeAudioSettings, getAudioSettings, getAudioSettings);
  const id = useId();
  const [previewing, setPreviewing] = useState<AudioChannel | null>(null);
  const [message, setMessage] = useState('');
  const change = (patch: Partial<AudioSettings>) => { updateAudioSettings(patch); setMessage(''); };
  const preview = async (channel: AudioChannel) => {
    setPreviewing(channel);
    setMessage('正在准备试听…');
    try {
      setMessage(await sound.preview(channel) ? '已播放试听，使用当前音量。' : '未能播放：请检查静音状态，或稍后重试。');
    } catch { setMessage('试听加载失败，请稍后重试。'); }
    finally { setPreviewing(null); }
  };
  const silent = settings.muted || settings.masterVolume === 0;
  return <section className="audio-settings" aria-labelledby={`${id}-heading`}>
    <header className="audio-settings-heading">
      <h3 id={`${id}-heading`}>{silent ? <VolumeX size={18} aria-hidden="true" /> : <Volume2 size={18} aria-hidden="true" />}声音设置</h3>
      <span>即时生效 · 本机保存</span>
    </header>
    <label className="audio-settings-toggle">
      <span>全部静音<small>保留各项音量，取消静音即可恢复</small></span>
      <input type="checkbox" role="switch" aria-label="全部静音" checked={settings.muted} onChange={event => change({ muted: event.target.checked })} />
    </label>
    <div className="audio-settings-sliders" data-muted={silent}>
      {channels.map(({ key, label, detail }) => {
        const value = Math.round(settings[key] * 100);
        return <div className="audio-settings-channel" key={key}>
          <div className="audio-settings-channel-heading">
            <label htmlFor={`${id}-${key}`}>{label}</label>
            <output htmlFor={`${id}-${key}`}>{value}<span>%</span></output>
          </div>
          <input id={`${id}-${key}`} type="range" min="0" max="100" step="1" value={value}
            aria-valuetext={`${value}%`} aria-describedby={`${id}-${key}-detail`}
            style={{ '--audio-level': `${value}%` } as CSSProperties}
            onChange={event => change({ [key]: Number(event.target.value) / 100 })} />
          <small id={`${id}-${key}-detail`}>{detail}</small>
        </div>;
      })}
    </div>
    <label className="audio-settings-toggle">
      <span>切到后台时静音<small>页面隐藏或窗口最小化时生效，返回后自动恢复</small></span>
      <input type="checkbox" role="switch" aria-label="切到后台时静音" checked={settings.muteInBackground} onChange={event => change({ muteInBackground: event.target.checked })} />
    </label>
    <div className="audio-settings-actions">
      <button type="button" disabled={silent || settings.effectsVolume === 0 || previewing !== null} onClick={() => void preview('effects')}>试听战斗音效</button>
      <button type="button" disabled={silent || settings.interfaceVolume === 0 || previewing !== null} onClick={() => void preview('interface')}>试听提示音</button>
      <button type="button" className="audio-settings-reset" onClick={() => { resetAudioSettings(); setMessage('已恢复默认声音设置。'); }}>恢复声音默认值</button>
    </div>
    <p className="audio-settings-status" role="status">{message || (settings.muted ? '当前已静音；仍可调整音量，取消静音后生效。' : settings.masterVolume === 0 ? '主音量为 0%，调高后即可试听。' : '主音量与分类音量叠加生效；方向键可微调滑块。')}</p>
  </section>;
}
