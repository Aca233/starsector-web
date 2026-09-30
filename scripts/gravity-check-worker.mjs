import { runGravityScenarios } from './gravity-scenarios.mjs';
self.onmessage = async ({data}) => { try { self.postMessage({ result: data === 'v8' ? await (await import('./gravity-v8-scenarios.mjs')).runGravityV8Scenarios() : await runGravityScenarios() }); } catch (error) { self.postMessage({ error: error.stack ?? String(error) }); } };
