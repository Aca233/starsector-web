import { dismissTopHover } from './hover-layers';
import { UI_EXIT_MS, useMotionExiting } from './motion-state';
import React, { forwardRef, useId, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, AlertTriangle, Info, CheckCircle2 } from 'lucide-react';
import { NativeBorder, NativeMaterial, NativeButtonLabel } from '../NativeChrome';
import type { NativeSurface } from '../NativeChrome';
import { NativeBitmapText } from '../NativeBitmapText';
import type { NativeFont } from '../native-fonts';

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';
export const Button = forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'sm' | 'md';
}>(function Button({ variant = 'secondary', size = 'md', className = '', type = 'button', children, ...props }, ref) {
  return <button ref={ref} type={type} className={`ui-button native-action ui-button--${variant} ui-button--${size} ${className}`} {...props}><NativeButtonLabel>{children}</NativeButtonLabel></button>;
});
export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: React.ReactNode }) {
  return <span className={`ui-badge ui-tone--${tone}`}>{children}</span>;
}
export function Keycap({ children }: { children: React.ReactNode }) { return <kbd className="ui-keycap">{children}</kbd>; }
export function Notice({ tone = 'info', children, onDismiss }: { tone?: Tone; children: React.ReactNode; onDismiss?: () => void }) {
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'warning' || tone === 'danger' ? AlertTriangle : Info;
  return <div className={`ui-notice ui-tone--${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
    <Icon size={17} aria-hidden="true" /><div>{children}</div>
    {onDismiss && <Button size="sm" variant="ghost" aria-label="关闭提示" onClick={onDismiss}><X size={16} /></Button>}
  </div>;
}
export function Section({ title, meta, children }: { title: React.ReactNode; meta?: React.ReactNode; children: React.ReactNode }) {
  return <section className="ui-section"><header className="ui-section-heading"><h3>{title}</h3>{meta}</header>{children}</section>;
}

// One focus/keyboard owner for every dialog, including nested confirmations.
const modalRoots: HTMLElement[] = [];
const previousInert = new Map<HTMLElement, boolean>();
function syncModalBackground() {
  const top = modalRoots.at(-1);
  if (!top) { for (const [element, inert] of previousInert) element.inert = inert; previousInert.clear(); return; }
  for (const element of Array.from(document.body.children)) {
    if (!(element instanceof HTMLElement)) continue;
    if (!previousInert.has(element)) previousInert.set(element, element.inert);
    element.inert = element !== top;
  }
}
function modalControls(panel: HTMLElement) {
  return Array.from(panel.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]'))
    .filter(element => element.getClientRects().length > 0 && !element.closest('[inert]'));
}
export function Modal({ title, eyebrow = '舰队指挥终端', description, onClose, children, footer, width = 'regular', onShortcut, role = 'dialog', initialFocus = 'first-control', surface = 'glass', titleFont = 'button', className = '' }: {
  title: string; eyebrow?: string; description?: string; onClose?: () => void; children: React.ReactNode;
  footer?: React.ReactNode; width?: 'small' | 'regular' | 'wide' | 'console'; role?: 'dialog' | 'alertdialog';
  onShortcut?: (key: string) => void; initialFocus?: 'first-control' | 'panel'; surface?: NativeSurface; titleFont?: NativeFont; className?: string;
}) {
  const exiting = useMotionExiting();
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onClose, onShortcut, exiting });
  useLayoutEffect(() => { callbacks.current = { onClose, onShortcut, exiting }; }, [onClose, onShortcut, exiting]);
  useLayoutEffect(() => {
    const root = rootRef.current!, panel = panelRef.current!;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusables = () => modalControls(panel);
    modalRoots.push(root); syncModalBackground();
    (initialFocus === 'panel' ? panel : focusables()[0] ?? panel).focus();
    // Snap the viewport-sized backdrop, not the panel: transforming a panel
    // would re-anchor fixed-position weapon tooltips to its top-left corner.
    const snap = () => {
      root.style.translate = 'none';
      const rect = panel.getBoundingClientRect();
      root.style.translate = (Math.round(rect.x) - rect.x) + 'px ' + (Math.round(rect.y) - rect.y) + 'px';
    };
    snap();
    const observer = new ResizeObserver(snap); observer.observe(panel);
    window.addEventListener('resize', snap);
    // Escape belongs to the top dialog even after clicking the dim backdrop
    // moves focus to body. Capture it before the combat window hotkeys.
    const escape = (event: KeyboardEvent) => {
      if (!root.isConnected || modalRoots.at(-1) !== root) return;
      // Inert content can move focus to body during exit. Do not let those keys
      // fall through to combat or the dialog underneath while the fade finishes.
      if (callbacks.current.exiting) { event.preventDefault(); event.stopImmediatePropagation(); return; }
      if (event.key !== 'Escape') return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (!event.repeat && !dismissTopHover()) callbacks.current.onClose?.();
    };
    const keydown = (event: KeyboardEvent) => {
      if (modalRoots.at(-1) !== root) return;
      if (callbacks.current.exiting) { event.preventDefault(); event.stopImmediatePropagation(); return; }
      if (event.key === 'Tab') {
        const controls = focusables(), current = controls.indexOf(document.activeElement as HTMLElement);
        if (!controls.length) { event.preventDefault(); panel.focus(); }
        else if (current < 0 || (event.shiftKey ? current === 0 : current === controls.length - 1)) {
          event.preventDefault(); (event.shiftKey ? controls.at(-1)! : controls[0]).focus();
        }
        event.stopImmediatePropagation(); return;
      }
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (!event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey && !target?.closest('input, textarea, select, [contenteditable="true"]')) {
        callbacks.current.onShortcut?.(event.key.toLowerCase());
      }
      // Prevent the global game keyboard handler from seeing modal typing/hotkeys.
      event.stopPropagation();
    };
    // Listen on the portal root: inputs receive ordinary keys; they never reach window bubbling.
    root.addEventListener('keydown', keydown);
    window.addEventListener('keydown', escape, true);
    return () => {
      observer.disconnect(); window.removeEventListener('resize', snap);
      root.removeEventListener('keydown', keydown);
      window.removeEventListener('keydown', escape, true);
      const wasTop = modalRoots.at(-1) === root;
      const index = modalRoots.indexOf(root); if (index >= 0) modalRoots.splice(index, 1);
      syncModalBackground();
      // An older dialog may finish fading beneath a newly opened one. Never
      // steal focus from that new dialog when the older portal unmounts.
      if (!wasTop) return;
      if (previousFocus?.isConnected && !previousFocus.closest('[inert]')) previousFocus.focus();
      else modalRoots.at(-1)?.querySelector<HTMLElement>('[role="dialog"], [role="alertdialog"]')?.focus();
    };
  }, [initialFocus]);
  useLayoutEffect(() => {
    const root = rootRef.current, panel = panelRef.current;
    // A rapid reopen reuses the portal instead of remounting the focus owner.
    if (exiting || !panel || modalRoots.at(-1) !== root || panel.contains(document.activeElement)) return;
    (initialFocus === 'panel' ? panel : modalControls(panel)[0] ?? panel).focus();
  }, [exiting, initialFocus]);
  return createPortal(<div ref={rootRef} className="ui-modal-backdrop" data-motion-state={exiting ? "exiting" : "present"} style={{ "--ui-exit-duration": UI_EXIT_MS + "ms" } as React.CSSProperties} data-combat-input-block>
    <div ref={panelRef} inert={exiting} role={role} aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={description ? `${id}-description` : undefined}
      tabIndex={-1} className={`ui-modal native-chrome ui-modal--${width} ${className}`} data-native-surface={surface}>
      <NativeBorder /><NativeMaterial />
      <header className="ui-modal-header"><div><div className="ui-eyebrow">{eyebrow}</div><h2 id={`${id}-title`}><NativeBitmapText font={titleFont}>{title}</NativeBitmapText></h2>
        {description && <p id={`${id}-description`} className="ui-muted">{description}</p>}</div>
        {onClose && <Button size="sm" variant="ghost" aria-label={`关闭${title}`} onClick={onClose}><X size={19} /></Button>}
      </header>
      <div className="ui-modal-body">{children}</div>
      {footer && <footer className="ui-modal-footer">{footer}</footer>}
    </div>
  </div>, document.body);
}
export interface Confirmation { title: string; description: string; action: () => void }
export function ConfirmDialog({ confirmation, onCancel, onConfirm }: { confirmation: Confirmation; onCancel: () => void; onConfirm: () => void }) {
  return <Modal title={confirmation.title} eyebrow="操作确认" description={confirmation.description} onClose={onCancel} width="small"
    footer={<><Button onClick={onCancel}>取消</Button><Button variant="danger" onClick={onConfirm}>确认继续</Button></>}>
    <Notice tone="warning">此操作会替换当前游戏和本地存档。建议先导出备份。</Notice>
  </Modal>;
}
