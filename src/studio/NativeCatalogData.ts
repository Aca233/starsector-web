import { useEffect, useState } from 'react';
import { catalogPartUrls } from 'virtual:native-catalog';
import type { CatalogKind } from './CatalogRelations';

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type RecordData = { [key: string]: Json };
type Payloads = Record<CatalogKind, RecordData[]> & { report: RecordData };
type Part = keyof Payloads;
const loaded = new Map<Part, Payloads[Part]>();
const pending = new Map<Part, Promise<Payloads[Part]>>();

/** Share in-flight requests and successful results, but allow failed requests to retry. */
export function loadCatalogPart<K extends Part>(part: K): Promise<Payloads[K]> {
  const cached = loaded.get(part);
  if (cached !== undefined) return Promise.resolve(cached as Payloads[K]);
  const existing = pending.get(part);
  if (existing) return existing as Promise<Payloads[K]>;
  const request = fetch(catalogPartUrls[part]).then(async response => {
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const value: unknown = await response.json();
    if (part === 'report' ? !value || typeof value !== 'object' || Array.isArray(value) : !Array.isArray(value)) {
      throw new Error('目录数据格式无效');
    }
    loaded.set(part, value as Payloads[K]);
    return value as Payloads[K];
  }).finally(() => pending.delete(part));
  pending.set(part, request);
  return request;
}

export function useCatalogPart<K extends Part>(part: K) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ part: K; attempt: number; data?: Payloads[K]; error?: string }>(() => ({ part, attempt, data: loaded.get(part) as Payloads[K] | undefined }));
  useEffect(() => {
    let current = true;
    void loadCatalogPart(part).then(
      data => { if (current) setState({ part, attempt, data }); },
      error => { if (current) setState({ part, attempt, error: error instanceof Error ? error.message : String(error) }); },
    );
    // A shared fetch may finish and cache after navigation, but never update the old detail.
    return () => { current = false; };
  }, [part, attempt]);
  const visible = state.part === part && state.attempt === attempt ? state : { part, attempt, data: loaded.get(part) as Payloads[K] | undefined };
  return { ...visible, retry: () => setAttempt(value => value + 1) };
}
