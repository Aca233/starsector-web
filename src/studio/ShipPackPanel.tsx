import { useRef, useState } from 'react';
import { bundledShipPacks } from '../engine/modding/BundledShipPacks';
import { shipPackProfile } from '../engine/modding/ShipPackSelection';
import { writeShipPackProfile } from '../engine/modding/ShipPackStore';
import { readShipPackFile, persistShipPackFile, preflightShipPackFile, profilePacks } from '../engine/modding/ShipPackInstaller';
import { validateRuntimeShipPacks } from '../engine/modding/ShipPackCapabilities';
import { assertShipPackUnused } from '../engine/modding/ShipPackReferences';
import type { ShipPack, ShipPackProfile } from '../engine/modding/ShipPack';
import './ship-pack-panel.css';
export function ShipPackPanel({initialProfile}: {initialProfile?: ShipPackProfile} = {}) {
  const [profile, setProfile] = useState(() => initialProfile ?? shipPackProfile());
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [pending, setPending] = useState(false);
  const operationPending = useRef(false);
  const installed = new Map(profile.installed.map(file => [file.pack.id,file]));
  const packs = [...bundledShipPacks.filter(pack => !installed.has(pack.id)), ...[...installed.values()].map(file => file.pack)];
  const run = async (operation: () => Promise<void>) => {
    if (operationPending.current) return;
    operationPending.current = true;
    setBusy(true); setError('');
    try { await operation(); setPending(true); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { operationPending.current = false; setBusy(false); }
  };
  const toggle = (pack: ShipPack) => run(async () => {
    const disabled = profile.disabled.includes(pack.id);
    if (!disabled) await assertShipPackUnused(pack);
    else if (installed.has(pack.id)) await preflightShipPackFile(installed.get(pack.id)!, profile);
    const next = {...profile, disabled: disabled ? profile.disabled.filter(id => id !== pack.id) : [...profile.disabled,pack.id]};
    validateRuntimeShipPacks(profilePacks(next));
    await writeShipPackProfile(next, profile.revision); setProfile({...next, revision: profile.revision + 1});
  });
  const uninstall = (pack: ShipPack) => run(async () => {
    await assertShipPackUnused(pack);
    const next = {...profile, installed: profile.installed.filter(file => file.pack.id !== pack.id), disabled: [...new Set([...profile.disabled,pack.id])]};
    validateRuntimeShipPacks(profilePacks(next));
    await writeShipPackProfile(next, profile.revision); setProfile({...next, revision: profile.revision + 1});
  });
  return <section className="ship-pack-panel" aria-label="舰船包管理">
    <p>一个包包含整舰、模块、武器、航空、素材及配装。安装与启停在刷新后生效；已保存方案保持原样。</p>
    <label className="ship-pack-import">安装单舰包<input type="file" accept=".ship-pack,.json" disabled={busy} onChange={event => {
      const file = event.currentTarget.files?.[0]; event.currentTarget.value = '';
      if (file) void run(async () => setProfile(await persistShipPackFile(await readShipPackFile(file), profile)));
    }} /></label>
    <ul>{packs.map(pack => <li key={pack.id}>
      <div><strong>{pack.name}</strong><span>v{pack.version} · {installed.has(pack.id) ? '已安装文件' : '内置包'} · {profile.disabled.includes(pack.id) ? '停用' : '启用'}</span><p>{pack.description}</p></div>
      <button type="button" disabled={busy} onClick={() => void toggle(pack)}>{profile.disabled.includes(pack.id) ? '启用' : '停用'}</button>
      {installed.has(pack.id) && <button type="button" disabled={busy} onClick={() => void uninstall(pack)}>卸载文件</button>}
    </li>)}</ul>
    {error && <p role="alert">{error}</p>}
    {busy && <p role="status">正在检查内容、素材与存档引用…</p>}
    {pending && <div role="status"><p>更改已保存。刷新后应用。</p><button type="button" disabled={busy} onClick={() => window.location.reload()}>应用并刷新</button></div>}
  </section>;
}
