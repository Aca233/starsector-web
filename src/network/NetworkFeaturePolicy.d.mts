export interface NetworkFeaturePolicy { mode: 'auto' | 'off' | 'experimental'; motion: boolean; motionReference: boolean; visuals: boolean; combat: boolean; }
export interface NetworkFeatureStatus { policy: NetworkFeaturePolicy['mode']; negotiated: boolean; motionRequested: boolean; motion: boolean; visuals: boolean; combat: boolean; motionWire: boolean; bulkChunks: boolean; binaryDelta: boolean; binarySnapshots: boolean; reason: string; }
export function networkFeaturePolicy(env?: Record<string, unknown>): Readonly<NetworkFeaturePolicy>;
export function networkHelloFeatures(transport: 'lan' | 'steam', policy: NetworkFeaturePolicy): Record<string, number>;
export function networkFeatureStatus(transport: 'lan' | 'steam', policy: NetworkFeaturePolicy, welcome?: Record<string, unknown> | null): NetworkFeatureStatus;
