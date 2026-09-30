import type { NativeFont } from './native-fonts';
/** Live system text: selectable, accessible and independent of bundled game fonts. */
export function NativeBitmapText({ children, font = 'action', color = 'currentColor' }: {
  children: string; font?: NativeFont; color?: string;
}) {
  return <span className="native-bitmap-text" data-font={font} data-bitmap-ready="false" style={{ color }}>
    <span className="native-bitmap-fallback">{children}</span>
  </span>;
}
