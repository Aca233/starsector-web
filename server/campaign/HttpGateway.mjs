import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { isRecord, requireThat, identifier } from '../../src/campaign/core/Values.mjs';
const commands = new Set(['market.trade-basket', 'market.buy', 'market.sell', 'fleet.approach', 'fleet.set-course', 'fleet.stop', 'fleet.jump', 'logistics.set-repairs', 'logistics.set-fleet-repairs', 'logistics.set-mothballed', 'cargo.jettison', 'cargo.collect', 'party.invite', 'party.accept', 'party.decline', 'party.leave']);
const nativeCommands=new Set(['native.fleet.navigate','native.fleet.set-destination','native.fleet.go-slow','native.loot.actions','native.ability.press','native.ability-bar.change','native.colony.construction']);
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.ogg': 'audio/ogg', '.ttf': 'font/ttf', '.fnt': 'text/plain; charset=utf-8' };
const digest = token => createHash('sha256').update(token).digest('hex');
const response = (res, status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); };
function readJSON(req) {
  return new Promise((resolve, reject) => {
    let size = 0, failed = false; const chunks = [];
    req.on('data', chunk => { if (failed) return; size += chunk.length;
      if (size > 65536) { failed = true; reject(Object.assign(Error(), { code: 'BODY_LIMIT' })); } else chunks.push(chunk); });
    req.on('end', () => { if (failed) return; try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(Object.assign(Error(), { code: 'INVALID_JSON' })); } });
    req.on('error', reject);
  });
}
/** Local/LAN gateway. Tokens are provisioned by the host, never chosen by a client.
 * service is owned by the caller; gateway close only closes HTTP connections.
 */
export async function listenCampaignGateway({ service, worldId, grants, staticRoot, host = '127.0.0.1', port = 8788, development = false, allowInsecureLan = false, publicOrigin = null, runtime = 'reference' }) {
  identifier(worldId); requireThat(['127.0.0.1', '::1', 'localhost'].includes(host) || (allowInsecureLan && publicOrigin), 'INSECURE_BIND', 'Non-loopback HTTP requires explicit allowInsecureLan');
  requireThat(Array.isArray(grants) && grants.length > 0 && grants.length <= 64, 'ACCESS_CONFIG', 'Expected bounded player grants');
  if (publicOrigin) { const u = new URL(publicOrigin); requireThat(u.protocol === 'http:' && u.origin === publicOrigin, 'ACCESS_CONFIG', 'Expected an exact HTTP origin'); }
  requireThat(['reference','native-development'].includes(runtime),'ACCESS_CONFIG','Unknown campaign gateway runtime');const native=runtime==='native-development';
  if(native){requireThat(development===true&&(await service.ready()).nativeDevelopmentEnabled,'NATIVE_RUNTIME_DISABLED','Native gateway requires an explicit development host');await service.nativeDevelopmentStatus(worldId);}
  const initial = native?null:await service.read(worldId), tokens = new Map(), players = new Set();
  for (const grant of grants) {
    requireThat(isRecord(grant) && typeof grant.token === 'string' && /^[A-Za-z0-9_-]{43,128}$/.test(grant.token), 'ACCESS_CONFIG', 'Invalid access token');
    identifier(grant.playerId);requireThat(!players.has(grant.playerId) && !tokens.has(digest(grant.token)), 'ACCESS_CONFIG', 'Invalid or duplicate player grant');
    if(native)await service.projectNativeDevelopmentPlayer(worldId,grant.playerId);else requireThat(initial.players[grant.playerId],'ACCESS_CONFIG','Invalid player grant');
    tokens.set(digest(grant.token), { playerId: grant.playerId, budget: 80, at: Date.now(), pending: 0 }); players.add(grant.playerId);
  }
  const root = staticRoot ? await realpath(staticRoot) : null;
  let origin, active = 0;
  const server = createServer({ maxHeaderSize: 8192, requestTimeout: 10000, headersTimeout: 10000 }, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; font-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
    let session;
    try {
      requireThat(req.headers.host === new URL(origin).host, 'ORIGIN_DENIED', 'Unexpected Host');
      requireThat(!req.headers.origin || req.headers.origin === origin, 'ORIGIN_DENIED', 'Cross-origin requests are not allowed');
      const url = new URL(req.url, origin);
      if (!url.pathname.startsWith('/campaign-api/')) {
        requireThat(req.method === 'GET' || req.method === 'HEAD', 'METHOD_NOT_ALLOWED', 'Read-only static assets');
        if (url.pathname === '/') { res.writeHead(302, { Location: '/campaign.html' }); res.end(); return; }
        requireThat(root, 'NOT_FOUND', 'No static build configured');
        let pathname; try { pathname = decodeURIComponent(url.pathname); } catch { throw Object.assign(Error(), { code: 'NOT_FOUND' }); }
        requireThat(!/[\\\0:]/.test(pathname) && !pathname.split('/').includes('..'), 'NOT_FOUND', 'Invalid asset path');
        const assetBase = pathname.startsWith('/assets/') ? path.join(root, 'assets')
          : pathname.startsWith('/game-assets/graphics/') ? path.join(root, 'game-assets', 'graphics')
          : pathname.startsWith('/game-assets/sounds/sfx_abilities/') ? path.join(root, 'game-assets', 'sounds', 'sfx_abilities') : null;
        requireThat(pathname === '/campaign.html' || assetBase, 'NOT_FOUND', 'Not a campaign asset');
        const filename = await realpath(path.resolve(root, '.' + pathname));
        // Check the resolved file against its allowed subtree, not merely the build root.
        // This also rejects junctions/symlinks into private files elsewhere inside the build.
        const relative = path.relative(assetBase ?? root, filename);
        requireThat(assetBase || filename === path.join(root, 'campaign.html'), 'NOT_FOUND', 'Not the campaign entry');
        // Only the generated, public ship catalogue is needed by the fleet screen.
        // Arbitrary JSON (credentials/saves) must remain unreadable, including under assets.
        const catalogJson = /^\/assets\/native-catalog-ships-[A-Za-z0-9_-]+\.json$/.test(pathname) && path.basename(filename) === path.basename(pathname);
        const contentType = mime[path.extname(filename)] ?? (catalogJson ? 'application/json; charset=utf-8' : null);
        requireThat(relative && !relative.startsWith('..') && !path.isAbsolute(relative) && contentType, 'NOT_FOUND', 'Not a public asset');
        const bytes = await readFile(filename); res.writeHead(200, { 'Content-Type': contentType, 'Content-Length': bytes.length });
        res.end(req.method === 'HEAD' ? undefined : bytes); return;
      }
      requireThat(!url.search, 'INVALID_REQUEST', 'API credentials and parameters never belong in URLs');
      const header = req.headers.authorization;
      requireThat(typeof header === 'string' && header.startsWith('Bearer ') && header.length <= 140, 'UNAUTHENTICATED', 'Authentication required');
      const candidate = tokens.get(digest(header.slice(7))); requireThat(candidate, 'UNAUTHENTICATED', 'Authentication required');
      const now = Date.now(); candidate.budget = Math.min(80, candidate.budget + (now - candidate.at) * 0.04); candidate.at = now;
      requireThat(candidate.budget >= 1 && candidate.pending < 4 && active < 32, 'RATE_LIMIT', 'Gateway capacity exceeded');
      candidate.budget--; candidate.pending++; active++; session = candidate;
      if(native){
        if(url.pathname==='/campaign-api/native-session'&&req.method==='GET'){
          const [ready,view]=await Promise.all([service.ready(),service.projectNativeDevelopmentPlayer(worldId,session.playerId)]);response(res,200,{runtime:'native-development',epoch:ready.epoch,development:true,view,simulation:{status:'unavailable',error:{code:'NATIVE_WORLD_FRAME_UNAVAILABLE'}}});return;
        }
        requireThat(['/campaign-api/native-observations','/campaign-api/native-scene','/campaign-api/native-command','/campaign-api/native-frame-events'].includes(url.pathname)&&req.method==='POST','WORLD_RUNTIME_MISMATCH','Native and reference endpoints cannot be mixed');
        requireThat(req.headers['content-type']?.split(';')[0].trim()==='application/json'&&!req.headers['content-encoding'],'CONTENT_TYPE','Expected unencoded JSON');requireThat(!req.headers['content-length']||Number(req.headers['content-length'])<=65536,'BODY_LIMIT','Request is too large');const input=await readJSON(req);
        requireThat(isRecord(input)&&input.worldId===worldId,'FORBIDDEN','Wrong world');
        if(url.pathname==='/campaign-api/native-frame-events'){response(res,200,await service.projectNativeDevelopmentFrameEvents(worldId,session.playerId,input));return;}
         if(url.pathname==='/campaign-api/native-scene'){response(res,200,await service.projectNativeDevelopmentScene(worldId,session.playerId,input));return;}
        if(url.pathname==='/campaign-api/native-observations'){response(res,200,await service.projectNativeDevelopmentObservations(worldId,session.playerId,input));return;}
        requireThat(Object.keys(input).every(k=>['worldId','epoch','requestId','type','payload','expectedRevision'].includes(k)),'INVALID_COMMAND','Only native command fields are accepted');requireThat(nativeCommands.has(input.type),'FORBIDDEN_COMMAND','Not a native player command');response(res,200,await service.executeNativeDevelopment({kind:'player',id:session.playerId},input));return;
      }
      if (url.pathname === '/campaign-api/session' && req.method === 'GET') {
        const [ready, view, status] = await Promise.all([service.ready(), service.projectPlayer(worldId, session.playerId), service.simulationStatus(worldId)]);
        response(res, 200, { epoch: ready.epoch, development, view,
          simulation: { status: status.status, error: status.error ? { code: status.error.code } : null } });
      } else if (['/campaign-api/command', '/campaign-api/market-visit', '/campaign-api/market-quote', '/campaign-api/market-basket-quote', '/campaign-api/cargo-preview'].includes(url.pathname) && req.method === 'POST') {
        requireThat(req.headers['content-type']?.split(';')[0].trim() === 'application/json', 'CONTENT_TYPE', 'Expected JSON');
        requireThat(!req.headers['content-encoding'], 'CONTENT_TYPE', 'Encoded request bodies are not supported');
        requireThat(!req.headers['content-length'] || Number(req.headers['content-length']) <= 65536, 'BODY_LIMIT', 'Request is too large');
        const command = await readJSON(req);
        if (url.pathname === '/campaign-api/cargo-preview') {
          const quote = await service.quoteCargo(worldId, session.playerId, command); response(res, 200, quote); return;
        }
        if (url.pathname === '/campaign-api/market-visit') {
          const visit = await service.browseMarket(worldId, session.playerId, command); response(res, 200, visit); return;
        }
        if (url.pathname === '/campaign-api/market-basket-quote') {
          const quote = await service.quoteMarketBasket(worldId, session.playerId, command); response(res, 200, quote); return;
        }
        if (url.pathname === '/campaign-api/market-quote') {
          const quote = await service.quoteMarket(worldId, session.playerId, command); response(res, 200, quote); return;
        }
        requireThat(isRecord(command) && Object.keys(command).every(k => ['worldId', 'epoch', 'requestId', 'type', 'payload', 'expected'].includes(k)), 'INVALID_COMMAND', 'Only command fields are accepted');
        requireThat(command.worldId === worldId, 'FORBIDDEN', 'Wrong world');
        requireThat(commands.has(command.type), 'FORBIDDEN_COMMAND', 'Not a player command');
        const result = await service.execute({ kind: 'player', id: session.playerId }, command); response(res, 200, result);
      } else throw Object.assign(Error(), { code: 'NOT_FOUND' });
    } catch (error) {
      const code = typeof error.code === 'string' ? error.code : 'INTERNAL_ERROR';
      const status = code === 'UNAUTHENTICATED' ? 401 : ['FORBIDDEN', 'FORBIDDEN_COMMAND', 'ORIGIN_DENIED'].includes(code) ? 403
        : ['NOT_FOUND', 'ENOENT', 'ENOTDIR'].includes(code) ? 404 : code === 'RATE_LIMIT' ? 429 : code === 'BODY_LIMIT' ? 413
        : ['AUTHORITY_TIMEOUT', 'AUTHORITY_EXIT', 'STORE_CLOSED', 'AUTHORITY_REPLACED'].includes(code) ? 504 : code === 'INTERNAL_ERROR' ? 500 : 409;
      if (!res.headersSent && !res.destroyed) response(res, status, { error: { code: ['ENOENT', 'ENOTDIR'].includes(code) ? 'NOT_FOUND' : code } });
    } finally { if (session) { session.pending--; active--; } if (!req.readableEnded) req.resume(); }
  });
  server.maxConnections = 64; server.keepAliveTimeout = 5000;
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); });
  const address = server.address(); const addressHost = address.address.includes(':') ? '[' + address.address + ']' : address.address;
  origin = publicOrigin ?? ('http://' + addressHost + ':' + address.port);
  return { origin, close: () => new Promise((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); }) };
}
