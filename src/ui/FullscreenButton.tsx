import { useEffect, useId, useState } from 'react';
import type { ComponentProps } from 'react';
import { NativeButton } from './NativeChrome';
import './fullscreen.css';

type FullscreenButtonProps = Pick<ComponentProps<typeof NativeButton>, 'className' | 'font' | 'align'>;

/** Fullscreen the document, not the canvas: body-portaled menus must remain visible. */
export function FullscreenButton(props: FullscreenButtonProps) {
  const [fullscreen, setFullscreen] = useState(() => Boolean(document.fullscreenElement));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const errorId = useId();
  const supported = document.fullscreenEnabled && typeof document.documentElement.requestFullscreen === 'function';

  useEffect(() => {
    const sync = () => { setFullscreen(Boolean(document.fullscreenElement)); setError(''); };
    document.addEventListener('fullscreenchange', sync);
    sync();
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  const toggle = async () => {
    if (pending) return;
    setPending(true);
    setError('');
    const exiting = Boolean(document.fullscreenElement);
    try {
      // Call directly from the click to retain the browser's user activation.
      if (exiting) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
      setFullscreen(Boolean(document.fullscreenElement));
    } catch {
      setError(exiting ? '退出全屏失败，请按 Esc 退出。' : '无法进入全屏，请检查浏览器全屏权限后重试。');
    } finally {
      setPending(false);
    }
  };

  const label = fullscreen ? '退出全屏' : supported ? '进入全屏' : '不支持全屏';
  return <>
    <NativeButton {...props} data-fullscreen-toggle aria-label={label} aria-pressed={fullscreen}
      aria-describedby={error ? errorId : undefined} aria-busy={pending}
      disabled={pending || (!fullscreen && !supported)}
      title={!supported && !fullscreen ? '当前浏览器或嵌入环境不支持网页全屏。' : '全屏显示整个游戏；按 Esc 可退出全屏。'}
      onClick={() => void toggle()}>{label}</NativeButton>
    {error && <span className="fullscreen-error" id={errorId} role="alert">{error}</span>}
  </>;
}
