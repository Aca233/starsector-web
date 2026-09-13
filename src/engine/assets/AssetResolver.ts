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
}

/**
 * Single runtime asset URL policy. Runtime content is always served from the
 * application's own public/game-assets tree; it never reads Starsector files.
 */
export class AssetResolver {
  public readonly baseUrl: string;

  constructor(baseUrl = '/game-assets') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  public normalize(resource: string): string {
    let value = resource.trim().replace(/\\/g, '/');
    const legacyPrefix = '/game-assets/';
    if (value.startsWith(legacyPrefix)) value = value.slice(legacyPrefix.length);
    if (value.startsWith(this.baseUrl + '/')) value = value.slice(this.baseUrl.length + 1);
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

  public async loadManifest(url = '/game-assets/asset-manifest.json'): Promise<void> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to load asset manifest: ${response.status}`);
    const entries = (await response.json()) as AssetManifestEntry[];
    this.manifest = new Map(entries.map((entry) => [entry.id, entry]));
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
