// Phase47 differential check; never overwrites Phase34's evidence or instruments its old pruning branches.
import {build} from 'esbuild';import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';import {navigationPlugin} from './lib/navigation-comparison.mjs';
const base='artifacts/network-stream-20260922/phase47/';
process.env.NAVIGATION_FROZEN??=base+'before.json';
process.env.NAVIGATION_CONTROL_SOURCE??=base+'TacticalNavigation.before.ts';
process.env.NAVIGATION_SOURCE??=base+'TacticalNavigation.candidate.ts';
const outfile=path.resolve(base+'check-navigation.mjs');fs.mkdirSync(path.dirname(outfile),{recursive:true});
await build({entryPoints:['scripts/check-navigation-bounds.mts'],outfile,bundle:true,platform:'node',format:'esm',packages:'external',plugins:[navigationPlugin()],define:{__LAN_BUILD_ID__:'"navigation-bounds-check"','import.meta.env':'{"BASE_URL":"/","DEV":false,"VITE_LAN_AI_WORKERS":"false","VITE_NAVIGATION_BOUNDS_STATS":"true"}'},logLevel:'warning'});
await import(pathToFileURL(outfile).href);
