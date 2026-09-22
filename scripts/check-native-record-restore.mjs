import assert from 'node:assert/strict';import fs from 'node:fs';import crypto from 'node:crypto';import path from 'node:path';import {build} from 'esbuild';import {pathToFileURL} from 'node:url';
import {receiverFieldsPlugin} from './lib/receiver-fields-comparison.mjs';import {receiverFieldsReference} from './lib/receiver-fields-reference.mjs';
const root='artifacts/network-stream-20260922/phase38';
fs.mkdirSync(root,{recursive:true});
assert.equal(crypto.createHash('sha256').update(receiverFieldsReference).digest('hex'),'a92dd079f09612202398905537461ee3ff52d51cd2f005afbcd30846dd32352c');
process.env.RECEIVER_FIELDS_SOURCE='src/network/CombatSnapshot.ts';
const outfile=path.resolve(root,'check.mjs');const result=await build({entryPoints:['scripts/check-native-record-restore.mts'],outfile,bundle:true,platform:'node',format:'esm',packages:'external',metafile:true,plugins:[receiverFieldsPlugin()],define:{__LAN_BUILD_ID__:'"fixed-restore-test"','import.meta.env':'{"BASE_URL":"/","DEV":false,"VITE_LAN_AI_WORKERS":"false"}'},logLevel:'warning'});
assert.ok(!Object.keys(result.metafile.inputs).some(p=>/(^|\/)campaign(\/|\.)/.test(p)));await import(pathToFileURL(outfile).href);
