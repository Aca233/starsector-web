import { Children } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { NativeBitmapText } from "./NativeBitmapText";
import type { NativeFont } from "./native-fonts";
import "./native-chrome.css";

export type NativeSurface = "solid" | "glass" | "none";

/** Original eight-slice border: no synthetic CSS strokes, tint or corner cuts. */
export function NativeBorder() {
  return <div className="native-chrome-border" aria-hidden="true">{["n", "s", "e", "w", "nw", "ne", "sw", "se"].map((side) =>
    <i key={side} className={"native-chrome-tile native-chrome-tile-" + side} />
  )}</div>;
}
export function NativeMaterial() {
  return <div className="native-chrome-material" aria-hidden="true" />;
}
export function NativeFrame({ children, className = "", surface = "solid" }: {
  children: ReactNode; className?: string; surface?: NativeSurface;
}) {
  return <div className={"native-frame native-chrome " + className} data-native-surface={surface}>
    <NativeBorder /><NativeMaterial />{children}
  </div>;
}
/** Only flatten text. Icons, mixed markup and caller event handlers stay intact. */
export function NativeButtonLabel({ children, font = "button" }: { children: ReactNode; font?: NativeFont }) {
  const pieces = Children.toArray(children);
  return pieces.length && pieces.every((piece) => typeof piece === "string" || typeof piece === "number")
    ? <NativeBitmapText font={font} color="currentColor">{pieces.join("")}</NativeBitmapText>
    : <>{children}</>;
}
export function NativeButton({ children, shortcut, className = "", font = "button", align = "center", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
  shortcut?: string; font?: NativeFont; align?: "left" | "center" | "right";
}) {
  return <button type="button" className={"native-button native-action " + className} data-native-align={align} {...props}>
    <NativeButtonLabel font={font}>{children}</NativeButtonLabel>
    {shortcut && <span className="native-shortcut">[{shortcut}]</span>}
  </button>;
}
