export function particleReferenceAngle(angle: number, speed: number): [number, number];
export function particleReferenceDrag(x: number): number;
export function encodeParticleMotionResidual(actual: number[], reference: number[]): number[];
export function decodeParticleMotionResidual(value: unknown, reference: number[]): number[];
export function validateParticleMotion(value: unknown): void;
