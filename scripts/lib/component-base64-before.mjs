// Test-only old entry modules; unchanged dependencies share the frozen class graph.
import fs from 'node:fs';
import path from 'node:path';
export function componentBase64BeforePlugin(snapshotFile) {
  const snapshot=JSON.parse(fs.readFileSync(snapshotFile,'utf8'));
  const files=new Map(snapshot.files.map(r=>[path.resolve(r.file).replaceAll('\\','/'),r.code]));
  const names=new Set(['MotionFrame.mjs','CriticalCombatState.mjs','ProjectileVisualPacket.mjs','AuthorityComponents.mjs']);
  const prefix='\0component-base64-before:';
  return {name:'component-base64-before',enforce:'pre',
    resolveId(id,importer) {
      if(id.startsWith('component-before/'))return prefix+path.resolve('src/network',id.slice('component-before/'.length)).replaceAll('\\','/');
      if(importer?.startsWith(prefix)&&id.startsWith('.')) {
        const file=path.resolve(path.dirname(importer.slice(prefix.length)),id).replaceAll('\\','/');
        return names.has(path.basename(file))?prefix+file:file;
      }
    },
    load(id) {if(id.startsWith(prefix)){const code=files.get(id.slice(prefix.length));if(code===undefined)throw Error('Missing frozen baseline '+id);return code;}},
  };
}
