import { parseArgs } from 'node:util';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { CampaignService } from '../server/campaign/CampaignService.mjs';
import { createCorvusDevelopmentCampaign } from '../server/campaign/CorvusDevelopmentWorld.mjs';
import { createDevelopmentCampaign } from '../server/campaign/DevelopmentWorld.mjs';
import { listenCampaignGateway } from '../server/campaign/HttpGateway.mjs';
const { values } = parseArgs({ options: { db: { type: 'string' }, access: { type: 'string' }, static: { type: 'string', default: 'dist' }, world: { type: 'string' },
  host: { type: 'string', default: '127.0.0.1' }, port: { type: 'string', default: '8788' }, 'public-origin': { type: 'string' }, 'allow-insecure-lan': { type: 'boolean' },
  'init-development': { type: 'boolean' }, 'init-corvus': { type: 'boolean' }, run: { type: 'boolean' } } });
if (values['init-development'] && values['init-corvus']) throw Error('Choose one development scenario, not both.');
if (values['init-corvus'] && values.run) throw Error('Corvus authored scene requires missing terrain/generation support; initialize it paused without --run.');
const initialize = values['init-development'] || values['init-corvus'];
if (!values.db || !values.access) throw Error('Required: --db <database> --access <private grants.json>. Optional: --init-development --run OR --init-corvus (paused authored scene) --static <build directory>');
const dbPath = path.resolve(values.db), accessPath = path.resolve(values.access), staticRoot = path.resolve(values.static);
const outside = filename => { const rel = path.relative(staticRoot, filename); return rel.startsWith('..') || path.isAbsolute(rel); };
if (!outside(dbPath) || !outside(accessPath)) throw Error('Database and credentials must be outside the public build directory');
const port = Number(values.port); if (!Number.isInteger(port) || port < 0 || port > 65535) throw Error('Invalid port');
if (initialize) {
  for (const filename of [dbPath, accessPath]) { try { await stat(filename); throw Error('Development initialization refuses to overwrite: ' + filename); } catch (e) { if (e.code !== 'ENOENT') throw e; } }
  await mkdir(path.dirname(dbPath), { recursive: true }); await mkdir(path.dirname(accessPath), { recursive: true });
}
if (!initialize) { await stat(dbPath); await stat(accessPath); }
const service = new CampaignService({ filename: dbPath }); let gateway;
try {
  await service.ready();
  if (initialize) {
    const world = values['init-corvus'] ? createCorvusDevelopmentCampaign() : createDevelopmentCampaign(); await service.create(world);
    await writeFile(accessPath, JSON.stringify({ schemaVersion: 1, worldId: world.id, development: true,
      grants: Object.keys(world.players).map(playerId => ({ playerId, token: randomBytes(32).toString('base64url') })) }, null, 2), { flag: 'wx', mode: 0o600 });
  }
  const access = JSON.parse(await readFile(accessPath, 'utf8'));
  if (access.schemaVersion !== 1 || (values.world && values.world !== access.worldId)) throw Error('Access file/world mismatch');
  gateway = await listenCampaignGateway({ service, worldId: access.worldId, grants: access.grants, staticRoot, development: access.development === true,
    host: values.host, port, publicOrigin: values['public-origin'] ?? null, allowInsecureLan: values['allow-insecure-lan'] === true });
  if (values.run) {
    const world = await service.read(access.worldId);
    if (world.extensions['cooperative.simulation:corvus-development']) throw Error('Authored Corvus is a paused inspection scene; missing terrain/generation must be implemented before running.');
    await service.startSimulation(access.worldId);
  }
  console.log('Campaign: ' + gateway.origin + '/campaign.html');
  console.log('Access codes are in the host-only file: ' + accessPath + ' (do not publish or commit it).');
  if (access.development) console.log('DEVELOPMENT SCENARIO: not a native sector/new game or a complete campaign.');
  let closing = false;
  const close = async () => { if (closing) return; closing = true; await gateway.close(); await service.close(); };
  process.once('SIGINT', () => { void close(); }); process.once('SIGTERM', () => { void close(); });
} catch (error) { await gateway?.close(); await service.close(); throw error; }
