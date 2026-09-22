import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import type { Plugin } from 'vite';

/** Conservative same-code guard for durable replay; never a network authentication token. */
export function combatReplayBuildPlugin(): Plugin {
  const root = process.cwd();
  const fingerprint = () => {
    const hash = createHash('sha256');
    const walk = (directory: string) => {
      for (const entry of readdirSync(directory, {withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))) {
        const file = resolve(directory, entry.name);
        if (entry.isDirectory()) walk(file);
        else if (entry.isFile()) { hash.update(relative(root, file).replaceAll('\\','/')); hash.update('\0'); hash.update(readFileSync(file)); hash.update('\0'); }
      }
    };
    walk(resolve(root, 'src'));
    hash.update(readFileSync(resolve(root, 'package-lock.json')));
    return JSON.stringify(hash.digest('hex'));
  };
  return {
    name:'combat-replay-build',
    config: () => ({define:{__COMBAT_REPLAY_BUILD__:fingerprint()}}),
    handleHotUpdate({file, server}) {
      if (!file.replaceAll('\\','/').startsWith(resolve(root,'src').replaceAll('\\','/')+'/')) return;
      // Even a same-dev-server reload must not accept logs from old logic.
      server.config.define.__COMBAT_REPLAY_BUILD__ = fingerprint();
      server.moduleGraph.invalidateAll();
      server.ws.send({type:'full-reload'});
      return [];
    },
  };
}
