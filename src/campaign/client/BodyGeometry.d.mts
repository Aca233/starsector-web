export function mapPosition(p: readonly [number, number]): [number, number];
export function worldPosition(p: readonly [number, number]): [number, number];
export function screenPosition(p: readonly [number, number], center: readonly [number, number], width: number, height: number, zoom: number): [number, number];
export function planetRotationMatrix(tilt: number, pitch: number, angle: number): number[];
export function nativePlanetMesh(detail?: number): Float32Array;
export function planetLightPosition(position: readonly [number, number], radius: number, lightPosition: readonly number[], source: readonly [number, number] | null): number[];
export function bodySurfaceAngle(phase: number, rotation: number, gameSeconds: number): number;
