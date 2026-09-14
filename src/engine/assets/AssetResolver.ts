import { runtimeAssetUrl } from '../runtime/RuntimePaths';

export type AssetKind = 'image' | 'audio' | 'font' | 'data' | 'other';

export interface AssetManifestEntry {
  id: string;
  path: string;
  type: AssetKind | string;
  bytes?: number;
  hash?: string;
  group?: string;
  sampler?: {
    wrap?: 'clamp' | 'repeat';
    minFilter?: 'nearest' | 'linear';
    magFilter?: 'nearest' | 'linear';
    mipmap?: boolean;
  };
  font?: {
    family: string;
    glyphAtlases: string[];
  };
}

/**
 * Single runtime asset URL policy. Runtime content is always served from the
 * application's own public/game-assets tree; it never reads Starsector files.
 */
export class AssetResolver {
  public readonly baseUrl: string;

  constructor(baseUrl = runtimeAssetUrl('')) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  public normalize(resource: string): string {
    let value = resource.trim().replace(/\\/g, '/').replace(/^\.\//, '');
    const legacyPrefix = '/game-assets/';
    if (value.startsWith(legacyPrefix)) value = value.slice(legacyPrefix.length);
    if (value.startsWith('game-assets/')) value = value.slice('game-assets/'.length);
    const normalizedBase = this.baseUrl.replace(/^\.\//, '').replace(/^\/+/, '');
    if (normalizedBase && value.startsWith(normalizedBase + '/')) value = value.slice(normalizedBase.length + 1);
    value = value.replace(/^\/+/, '');

    const parts: string[] = [];
    for (const part of value.split('/')) {
      if (!part || part === '.') continue;
      if (part === '..') {
        if (parts.length === 0) throw new Error(`Asset path escapes bundle root: ${resource}`);
        parts.pop();
        continue;
      }
      parts.push(part);
    }
    return parts.join('/');
  }

  public url(resource: string): string {
    return `${this.baseUrl}/${this.normalize(resource)}`;
  }
}

export const assetResolver = new AssetResolver();

export class AssetManager {
  private manifest = new Map<string, AssetManifestEntry>();
  private manifestByPath = new Map<string, AssetManifestEntry>();
  private loadPromise: Promise<void> | null = null;
  private loaded = false;

  public async loadManifest(url = assetResolver.url('asset-manifest.json')): Promise<void> {
    if (this.loaded) return;
    if (this.loadPromise) return this.loadPromise;
    this.loadPromise = (async () => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Failed to load asset manifest: ${response.status}`);
      const entries = (await response.json()) as unknown;
      if (!Array.isArray(entries)) throw new Error('Asset manifest must be an array');
      const byId = new Map<string, AssetManifestEntry>();
      const byPath = new Map<string, AssetManifestEntry>();
      for (const [index, raw] of entries.entries()) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`Asset manifest entry ${index} must be an object`);
        const entry = raw as AssetManifestEntry;
        if (!entry.id?.trim() || !entry.path?.trim() || !entry.type?.trim() || !entry.group?.trim()) throw new Error(`Asset manifest entry ${index} is missing id/path/type/group`);
        if (!Number.isSafeInteger(entry.bytes) || (entry.bytes ?? -1) < 0) throw new Error(`Asset ${entry.id} has invalid bytes`);
        if (!entry.hash || !/^[a-f0-9]{64}$/i.test(entry.hash)) throw new Error(`Asset ${entry.id} has invalid SHA-256 hash`);
        if (entry.type === 'image') {
          const sampler = entry.sampler;
          if (!sampler || !['clamp', 'repeat'].includes(String(sampler.wrap)) || !['nearest', 'linear'].includes(String(sampler.minFilter)) || !['nearest', 'linear'].includes(String(sampler.magFilter)) || typeof sampler.mipmap !== 'boolean') {
            throw new Error(`Image asset ${entry.id} is missing explicit sampler metadata`);
          }
        }
        if (entry.type === 'font') {
          if (!entry.font?.family?.trim() || !Array.isArray(entry.font.glyphAtlases)) throw new Error(`Font asset ${entry.id} is missing font/glyph-atlas metadata`);
        }
        const normalizedPath = assetResolver.normalize(entry.path);
        if (byId.has(entry.id)) throw new Error(`Duplicate asset id: ${entry.id}`);
        if (byPath.has(normalizedPath)) throw new Error(`Duplicate asset path: ${entry.path}`);
        byId.set(entry.id, entry);
        byPath.set(normalizedPath, entry);
      }
      this.manifest = byId;
      this.manifestByPath = byPath;
      this.loaded = true;
    })();
    try {
      await this.loadPromise;
    } finally {
      if (!this.loaded) this.loadPromise = null;
    }
  }

  public async ensureManifestLoaded(): Promise<void> {
    await this.loadManifest();
  }

  public get isLoaded(): boolean { return this.loaded; }

  public getByPath(path: string): AssetManifestEntry | undefined {
    return this.manifestByPath.get(assetResolver.normalize(path));
  }

  public hasPath(path: string): boolean {
    return this.getByPath(path) !== undefined;
  }

  public resolve(idOrPath: string): string {
    const entry = this.manifest.get(idOrPath);
    return assetResolver.url(entry?.path ?? idOrPath);
  }

  public get(id: string): AssetManifestEntry | undefined {
    return this.manifest.get(id);
  }
}

export const assetManager = new AssetManager();
