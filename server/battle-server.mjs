import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLanServer } from './lan-server.mjs';
import { createAuthorityFactory } from './ServerBattleAuthority.mjs';

// Separate opt-in entry. Ordinary LAN and Steam launchers remain unchanged.
const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(process.env.BATTLE_DIST ?? path.join(here, 'web'));
const host = process.env.HOST ?? '127.0.0.1';
const port = Number(process.env.PORT ?? 32120);
const publicOrigin = process.env.PUBLIC_ORIGIN || null;
if (!['127.0.0.1','::1','localhost'].includes(host) && !publicOrigin)
  throw Error('Binding outside loopback requires an explicit PUBLIC_ORIGIN; do not disable Host/Origin checks.');
if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('Invalid PORT');
const authorityFactory = createAuthorityFactory({assets:dist,
  maxBattles:Number(process.env.MAX_BATTLES ?? 4), memoryMb:768});
const app = await createLanServer({host, port, dist, authorityFactory, publicOrigin, maxRooms:16});
console.log(JSON.stringify({service:'starsector-dedicated-combat',host,port,publicOrigin,dist,maximumBattles:Number(process.env.MAX_BATTLES ?? 4),authority:'server'}));
let stopping = false;
const stop = async () => { if(stopping)return; stopping=true; await app.close(); await authorityFactory.close(); };
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{void stop().then(()=>process.exit(0));});
