import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createServer } from 'vite';
import { createServer as netServer } from 'node:net';

// Export production definitions through Vite's real module graph. No desktop UI.
const { chromium } = createRequire('C:/Users/Aca/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json')('playwright');
const probe = netServer();
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const server = await createServer({ server: { host: '127.0.0.1', port, strictPort: true, open: false }, logLevel: 'error' });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  const page = await browser.newPage();
  await page.route('**/__gravity_export.html', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8">' }));
  await page.goto(`http://127.0.0.1:${port}/__gravity_export.html`);
  const data = await page.evaluate(async () => {
    const { gravityShips, gravityHull, gravityRefit } = await import('/src/engine/content/GravityPack.ts');
    const { gravityWeapons, gravityArmoryRefit } = await import('/src/engine/content/GravityArmory.ts');
    const { createGravityEscort, createGravityControl } = await import('/src/studio/GravityLoadouts.ts');
    const data = {
      mod: { id: 'web-gravity-ship-pack', name: '万有引力号', version: '0.2.0-v8', author: 'Aca / Codex',
        description: '实验引力战列舰；需要已接入 v8 潮汐伤害/坍缩规则的 Starsector Web 宿主。',
        ships: gravityShips(), weapons: gravityWeapons(), i18n: gravityHull.i18n },
      refit: gravityRefit, armoryRefit: gravityArmoryRefit,
      variants: [createGravityEscort(), createGravityControl()]
    };
    const { ContentRegistry } = await import('/src/engine/content/ContentRegistry.ts');
    const { assetManager } = await import('/src/engine/assets/AssetResolver.ts');
    await assetManager.ensureManifestLoaded();
    const serialized = JSON.parse(JSON.stringify(data.mod));
    new ContentRegistry().registerPack(serialized.ships, serialized.weapons, true);
    return data;
  });
  await fs.mkdir('artifacts/gravity', { recursive: true });
  await fs.writeFile('artifacts/gravity/package-data-v8.json', JSON.stringify(data, null, 2) + '\n');
  console.log(`Exported ${data.mod.ships.length} hull, ${data.mod.weapons.length} weapons, ${data.variants.length} fits`);
} finally {
  await browser?.close();
  await server.close();
}
