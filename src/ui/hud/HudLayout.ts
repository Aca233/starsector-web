export type HudDensity = 'compact' | 'standard' | 'expanded';

export interface HudLayoutProfile {
  density: HudDensity;
  panelScale: number;
  floatingTagScale: number;
  safeInsetPx: number;
}

export const HUD_LAYOUT_PROFILES: Record<HudDensity, HudLayoutProfile> = {
  compact: { density: 'compact', panelScale: 0.88, floatingTagScale: 0.9, safeInsetPx: 10 },
  standard: { density: 'standard', panelScale: 1.0, floatingTagScale: 1.0, safeInsetPx: 14 },
  expanded: { density: 'expanded', panelScale: 1.08, floatingTagScale: 1.06, safeInsetPx: 18 }
};

export function getHudDensity(width: number, height: number): HudDensity {
  if (width <= 1366 || height <= 800) return 'compact';
  if (width >= 2400 && height >= 1300) return 'expanded';
  return 'standard';
}

export function getHudLayoutProfile(width: number, height: number): HudLayoutProfile {
  return HUD_LAYOUT_PROFILES[getHudDensity(width, height)];
}
