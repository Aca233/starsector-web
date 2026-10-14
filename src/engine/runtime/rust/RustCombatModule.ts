import { runtimeWorkerAssetUrl } from '../RuntimePaths';
/** The browser and Electron load exactly the same verified native artifact. */
export interface RustCombatModule { readonly module: WebAssembly.Module; readonly sha256: string }
let pending: Promise<RustCombatModule> | undefined;
export function loadRustCombatModule(): Promise<RustCombatModule> {
  return pending ??= (async () => {
    const [manifestResponse, wasmResponse] = await Promise.all([
      fetch(runtimeWorkerAssetUrl('runtime/combat-core.json')), fetch(runtimeWorkerAssetUrl('runtime/combat-core.wasm')),
    ]);
    if (!manifestResponse.ok || !wasmResponse.ok) throw Error('Rust 战斗内核资源加载失败');
    const manifest: unknown = await manifestResponse.json(), bytes = await wasmResponse.arrayBuffer();
    if (!manifest || typeof manifest !== 'object' || !('sha256' in manifest) || !('bytes' in manifest)
      || typeof manifest.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(manifest.sha256)
      || manifest.bytes !== bytes.byteLength) throw Error('Rust 战斗内核构建清单无效');
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('');
    if (hash !== manifest.sha256) throw Error('Rust 战斗内核与构建清单不符');
    return { module: await WebAssembly.compile(bytes), sha256: hash };
  })();
}
