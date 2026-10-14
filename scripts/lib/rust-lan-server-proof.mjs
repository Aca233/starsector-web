import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const digest=data=>createHash('sha256').update(data).digest('hex');
/** Bind the real Node worker bundle to its build inputs and the same plain Wasm. */
export async function verifyRustLanServerBuild(base,sha256){
 const runtime=path.join(base,'server-runtime'),manifest=JSON.parse(await fs.readFile(path.join(runtime,'authority-build-manifest.json'),'utf8'));
 if(manifest.version!==1||!manifest.sourceFingerprints||typeof manifest.bundleSHA256!=='string')throw Error('Actual authority build manifest differs');
 const bundle=await fs.readFile(path.join(runtime,'authority-worker.mjs'));
 if(bundle.length!==manifest.bundleBytes||digest(bundle)!==manifest.bundleSHA256)throw Error('Actual authority bundle changed after build');
 const qualification=JSON.parse(await fs.readFile(path.join(base,'result.json'),'utf8'));
 if(qualification.diagnostic||qualification.wasmSHA256!==sha256)throw Error('Actual Node authority uses a different production Wasm');
 const files={...manifest.sourceFingerprints,...Object.fromEntries(Object.entries(qualification.sourceFingerprints).filter(([file])=>file.startsWith('native/')))};
 const changed=(await Promise.all(Object.entries(files).map(async([file,hash])=>digest(await fs.readFile(file))!==hash?file:null))).filter(Boolean);
 if(changed.length)throw Error('Actual authority build sources changed: '+changed.join(', '));
 const changedSinceQualification=(await Promise.all(Object.entries(qualification.sourceFingerprints).map(async([file,hash])=>digest(await fs.readFile(file))!==hash?file:null))).filter(Boolean);
 return {bundleSHA256:manifest.bundleSHA256,sourceFiles:Object.keys(files).length,sourceFingerprints:files,currentPlainAuthorityQualified:qualification.passed===true&&changedSinceQualification.length===0,changedSinceQualification};
}
