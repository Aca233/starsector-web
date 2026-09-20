export function formatNativeDescription(template: string, parameters?: readonly (string | number | null | undefined)[]): { text: string; complete: boolean; missing: number };
export function nativeHighlightParameters(value: string): string[];
