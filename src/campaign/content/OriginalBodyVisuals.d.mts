/** Colors are native byte RGBA, not 0..1. Floats preserve PlanetSpec float loading. */
export type BodyVisualRGBA = readonly [number, number, number, number];
export interface BodyVisualAudit {
  readonly supportedLayers: readonly string[];
  readonly unsupported: readonly string[];
  readonly sourceIds: readonly string[];
  readonly overriddenFields: readonly string[];
}
export interface OriginalPlanetVisual {
  readonly kind: 'planet'; readonly isStar: boolean; readonly texture: string;
  readonly planetColor: BodyVisualRGBA; readonly tilt: number; readonly pitch: number; readonly rotation: number;
  readonly cloudTexture: string | null; readonly cloudColor: BodyVisualRGBA; readonly cloudRotation: number; readonly cloudAlpha: number;
  readonly glowTexture: string | null; readonly glowColor: BodyVisualRGBA; readonly useReverseLightForGlow: boolean;
  readonly atmosphereColor: BodyVisualRGBA; readonly atmosphereThickness: number; readonly atmosphereThicknessMin: number;
  readonly coronaTexture: string | null; readonly coronaColor: BodyVisualRGBA; readonly coronaSize: number;
  readonly lightPosition: readonly [number, number, number]; readonly audit: BodyVisualAudit;
}
export interface OriginalCustomVisual {
  readonly kind: 'custom'; readonly sprite: string | null; readonly width: number; readonly height: number;
  readonly color: BodyVisualRGBA; readonly alphaMult: number; readonly additive: boolean; readonly showInCampaign: boolean;
  readonly useLightColor: boolean; readonly renderShadow: boolean; readonly facingOffsetDegrees: -90;
  readonly nativeLayers: readonly string[]; readonly pluginClass: string | null;
  readonly pluginRender: 'none' | 'inherited-noop' | 'partial-base-sprite'; readonly audit: BodyVisualAudit;
}
export type OriginalBodyVisual = OriginalPlanetVisual | OriginalCustomVisual;
export interface OriginalBodyVisualQuery { readonly kind: 'star' | 'planet' | 'custom'; readonly nativeType: string; readonly sourceHandle?: string | null }
export interface OriginalBodyVisualResolver { resolve(input: OriginalBodyVisualQuery): OriginalBodyVisual | null }
/** Accepts imported JSON as unknown, validates/copies/freezes it; no Node runtime dependency. */
export function createOriginalBodyVisuals(data: unknown): OriginalBodyVisualResolver;
