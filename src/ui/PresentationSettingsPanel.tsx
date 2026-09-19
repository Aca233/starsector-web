import { useId, useState } from 'react';
import { AudioSettingsPanel } from './AudioSettingsPanel';
import { GraphicsSettingsPanel } from './GraphicsSettingsPanel';

/** Keep graphics/audio accessible without adding another screenful of settings to the menu. */
export function PresentationSettingsPanel() {
  const id = useId();
  const [tab, setTab] = useState<'audio' | 'graphics'>('audio');
  return <div className="presentation-settings">
    <div className="presentation-settings-tabs" role="tablist" aria-label="声音与画面设置">
      {(['audio', 'graphics'] as const).map(key => <button key={key} type="button" role="tab"
        id={`${id}-${key}-tab`} aria-controls={`${id}-${key}-panel`} aria-selected={tab === key} tabIndex={tab === key ? 0 : -1}
        onClick={() => setTab(key)} onKeyDownCapture={event => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault(); event.stopPropagation();
          const next = event.key === 'Home' ? 'audio' : event.key === 'End' ? 'graphics' : key === 'audio' ? 'graphics' : 'audio';
          setTab(next); document.getElementById(`${id}-${next}-tab`)?.focus();
        }}>{key === 'audio' ? '声音' : '画面'}</button>)}
    </div>
    <div role="tabpanel" id={`${id}-audio-panel`} aria-labelledby={`${id}-audio-tab`} hidden={tab !== 'audio'}><AudioSettingsPanel/></div>
    <div role="tabpanel" id={`${id}-graphics-panel`} aria-labelledby={`${id}-graphics-tab`} hidden={tab !== 'graphics'}><GraphicsSettingsPanel/></div>
  </div>;
}
