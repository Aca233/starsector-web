import {defineConfig, type Plugin} from 'vite';
import {createAppConfig} from './vite.config.ts';
const combatScope: Plugin = {
  name: 'local-combat-development-scope',
  generateBundle(_options, bundle) {
    for (const output of Object.values(bundle)) if (output.type === 'chunk'
      && Object.keys(output.modules).some(id => /[/\\]campaign[/\\]/.test(id)))
      this.error('Campaign code entered the combat development target.');
  },
};
export default defineConfig(environment => {
  const base = createAppConfig(environment);
  return {...base, plugins: [...(base.plugins ?? []), combatScope], build: {...base.build,
    outDir: 'artifacts/development/combat', rollupOptions: {...base.build?.rollupOptions, input: {main: 'index.html'}}}};
});
