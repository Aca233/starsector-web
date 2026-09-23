import type { DeepReadonly } from '../Types.js';
export class CampaignError extends Error { readonly code: string; constructor(code: string, message: string) }
export function requireThat(condition: unknown, code: string, message: string): asserts condition;
export function isRecord(value: unknown): value is Record<string, unknown>;
export function identifier(value: unknown, label?: string): string;
export function finite(value: unknown, label: string, minimum?: number, maximum?: number): number;
export function integer(value: unknown, label: string, minimum?: number): number;
export function jsonCopy<T>(value: T): T;
export function canonicalJSON(value: unknown): string;
export function deepFreeze<T>(value: T): DeepReadonly<T>;
export function immutableJSON<T>(value: T): DeepReadonly<T>;

export function slotIdentifier(value: unknown): string;
