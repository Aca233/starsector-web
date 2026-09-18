import { useEffect, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode, type ButtonHTMLAttributes } from 'react';
import { NativeBorder, NativeMaterial, NativeButton } from './NativeChrome';
import { NativeBitmapText } from './NativeBitmapText';
import { DwellStatus } from '../studio/DwellTooltip';
import type { DwellHover } from '../studio/useDwellHover';
import './loadout-flyout.css';

export interface LoadoutDestinations {
  label: string;
  choices: readonly { id: string; name: string; detail?: string; color?: string }[];
  disabled?: boolean; status?: string;
  onChoose: (loadoutId: string, destinationId: string) => void;
}
export interface LoadoutFlyoutOption { id: string; name: string; detail: string; cost: string; error?: string }
/** Shared anchored fit selector used by in-battle deployment and LAN AI composition. */
export function LoadoutFlyout({ element, pinned, name, options, selected, onChoose, onInspect, onEnter, onLeave, onClose, action, destinations, disabled=false, renderOption, transient=false, dwell }: {
  element: HTMLButtonElement; pinned: boolean; name: string; options: readonly LoadoutFlyoutOption[]; selected: readonly string[];
  disabled?: boolean; destinations?: LoadoutDestinations; transient?: boolean; dwell?: DwellHover;
  /** Optional read-only inspection, without changing this shared selector's click or destination behavior. */
  renderOption?: (option: LoadoutFlyoutOption, button: ReactElement<ButtonHTMLAttributes<HTMLButtonElement>>) => ReactNode;
  action?: { label:string; disabled?:boolean; onClick:(id:string)=>void; status?:string };
  onChoose: (id: string) => void; onInspect?: (id: string) => void; onEnter: () => void; onLeave: () => void; onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const destinationPanel = useRef<HTMLElement>(null);
  const [pointedId, setPointedId] = useState<string | null>(null);
  const pointed = options.find(option => option.id === pointedId);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null), pointerX = useRef<number | null>(null);
  const cancelPointing = () => { if (hoverTimer.current !== null) { clearTimeout(hoverTimer.current); hoverTimer.current = null; } };
  const inspect = (id: string) => { cancelPointing(); if (disabled) return; setPointedId(id); onInspect?.(id); };
  const hover = (id: string, x: number) => {
    cancelPointing(); if (disabled) return;
    // A diagonal move toward the right pane may cross another fit. Give that
    // crossing a grace period; entering the destination pane cancels the switch.
    if (destinations && pointed && pointed.id !== id && pointerX.current !== null && x > pointerX.current + 1)
      hoverTimer.current = setTimeout(() => inspect(id), 300);
    else inspect(id);
  };
  useEffect(() => { cancelPointing(); return cancelPointing; }, [disabled, element]);
  const hasDestinations = !!destinations;
  useEffect(() => {
    if (!hasDestinations) return;
    // Modals stop key propagation at document capture, before React handlers.
    // Handle pane navigation at the same boundary, scoped to this popup only.
    const keydown = (event: KeyboardEvent) => {
      const focused = document.activeElement;
      if (event.defaultPrevented || disabled || !focused || !ref.current?.contains(focused)) return;
      let next: HTMLButtonElement | undefined | null;
      if (event.key === 'ArrowRight' && focused.matches('.sim-loadout-option'))
        next = destinationPanel.current?.querySelector<HTMLButtonElement>('button:not(:disabled)');
      else if (event.key === 'ArrowLeft' && destinationPanel.current?.contains(focused))
        next = Array.from(ref.current.querySelectorAll<HTMLButtonElement>('.sim-loadout-option')).find(button => button.dataset.loadoutOption === pointedId);
      if (next) { event.preventDefault(); event.stopPropagation(); next.focus(); }
    };
    document.addEventListener('keydown', keydown, true);
    return () => document.removeEventListener('keydown', keydown, true);
  }, [hasDestinations, pointedId, disabled]);
  const dwellEnabled = !!dwell;
  const [position, setPosition] = useState({ left: 0, top: 0 });
  useLayoutEffect(() => {
    const place = () => {
      const box = element.getBoundingClientRect(), popup = ref.current!.getBoundingClientRect();
      const margin = 12, gap = dwellEnabled ? 5 : 8, width = window.innerWidth, height = window.innerHeight;
      const left = box.right + gap + popup.width <= width - margin ? box.right + gap
        : box.left - gap - popup.width >= margin ? box.left - gap - popup.width
        : Math.max(margin, Math.min(box.left, width - popup.width - margin));
      const below = box.bottom + gap + popup.height <= height - margin;
      const overlaps = left < box.right && left + popup.width > box.left;
      const top = Math.max(margin, Math.min(overlaps ? (below ? box.bottom + gap : box.top - popup.height - gap) : box.top - 8, height - popup.height - margin));
      setPosition(current => current.left === Math.round(left) && current.top === Math.round(top) ? current : { left: Math.round(left), top: Math.round(top) });
    };
    place(); const observer = new ResizeObserver(place); observer.observe(ref.current!);
    window.addEventListener('resize', place); window.addEventListener('scroll', place, true);
    return () => { observer.disconnect(); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [element, dwellEnabled]);
  return <div ref={ref} id={dwell?.tooltipId ?? "sim-loadout-picker"} data-dwell-id={dwell?.tooltipId} data-dwell-owner={dwell?.ownerId} data-dwell-depth={dwell?.depth} data-dwell-locked={dwell?.locked} role="region" aria-label={name + '配装选择'} className="sim-loadout-picker native-frame native-chrome" data-native-surface="solid" data-pinned={pinned} data-destinations={!!destinations}
    style={position} onMouseEnter={onEnter} onMouseMove={event => { pointerX.current = event.clientX; }} onMouseLeave={() => { cancelPointing(); onLeave(); }} onFocusCapture={onEnter}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget) && event.relatedTarget !== element) onLeave(); }}>
    <NativeBorder/><NativeMaterial/>
    <header><div><strong><NativeBitmapText font="action" color="currentColor">{name}</NativeBitmapText></strong>
      <small><NativeBitmapText font="body" color="currentColor">{options.length + ' 项配装'}</NativeBitmapText></small></div>
      <NativeButton font="caption" aria-label="关闭配装选择" onClick={onClose}>关闭</NativeButton></header>
    <div className="sim-loadout-body"><div className="sim-loadout-list">{options.map(option => { const button = <NativeButton data-loadout-option={option.id} disabled={disabled} className="sim-loadout-option" align="left" title={renderOption ? undefined : option.name}
      aria-label={destinations ? '配装 ' + option.name : undefined} data-pointed={!!destinations && pointed?.id === option.id}
      aria-pressed={selected.includes(option.id)} aria-disabled={!!option.error} onMouseEnter={event => hover(option.id, event.clientX)} onMouseLeave={cancelPointing} onFocus={() => inspect(option.id)}
      onClick={() => { inspect(option.id); onChoose(option.id); }}>
      <span className="sim-loadout-check" aria-hidden="true"><NativeBitmapText font="caption" color="currentColor">{selected.includes(option.id) ? '[X]' : '[ ]'}</NativeBitmapText></span>
      <span className="sim-loadout-name"><strong><NativeBitmapText font="caption" color="currentColor">{option.name}</NativeBitmapText></strong>
        <small><NativeBitmapText font="body" color="currentColor">{option.detail}</NativeBitmapText></small>{option.error && <em>{option.error}</em>}</span>
      <b><NativeBitmapText font="caption" color="currentColor">{option.cost}</NativeBitmapText></b>
    </NativeButton>; return <div key={option.id} className={action?'sim-loadout-action-row':undefined}>{renderOption ? renderOption(option, button) : button}{action&&<NativeButton className="sim-loadout-quick-add" disabled={disabled||action.disabled||!!option.error}
      aria-label={option.name+' · '+action.label} title={option.error||action.label} onClick={()=>action.onClick(option.id)}>{action.label}</NativeButton>}</div>; })}</div>
    {destinations && <aside ref={destinationPanel} className="sim-loadout-destinations" aria-label="配装目标队伍" onMouseEnter={cancelPointing}>
      {pointed ? <>
        <header><strong title={pointed.name}>{pointed.name}</strong><span>{destinations.label}</span></header>
        {pointed.error && <p className="sim-loadout-destination-error">此配装需先修正，暂不能添加。</p>}
        <div className="sim-loadout-destination-list">{destinations.choices.map(choice => <NativeButton key={choice.id}
          className="sim-loadout-destination" align="left" disabled={disabled || destinations.disabled || !!pointed.error}
          aria-label={pointed.name + ' · ' + destinations.label + ' ' + choice.name} title={pointed.error || destinations.label + ' ' + choice.name}
          onClick={() => destinations.onChoose(pointed.id, choice.id)}>
          <strong style={{color:choice.color}}>{choice.name}</strong>{choice.detail && <small>{choice.detail}</small>} <span aria-hidden="true">＋</span>
        </NativeButton>)}</div>
      </> : <p className="sim-loadout-destination-empty">指向左侧配装<br/>在这里点队伍直接添加<br/><small>也可点击配装选择，再点队伍添加</small></p>}
    </aside>}
    </div>
    <footer><NativeBitmapText font="body" color="currentColor">{destinations ? '指向配装 → 点右侧队伍添加；点击配装不会添加。' : action ? '点配装只选择；点添加按钮才加入房间。' : transient ? '移入继续选择 · 移出自动收起' : pinned ? '窗口已固定 · 点击配装选择' : '点击舰体可固定此窗口'}</NativeBitmapText>{(action || destinations)&&<span className="sim-loadout-action-status" role="status">{destinations?.status ?? action?.status}</span>}</footer>
    {dwell && <DwellStatus hover={dwell} native />}
  </div>;
}
