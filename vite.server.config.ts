import { defineConfig, type Plugin } from 'vite';
import base from './vite.config';
const noCampaign: Plugin = {
  name:'dedicated-combat-scope',
  generateBundle(_options, bundle) {
    for (const output of Object.values(bundle)) {
      if (output.type === 'chunk' && Object.keys(output.modules).some(id => /[/\\]campaign[/\\]/.test(id)))
        this.error('Campaign code is excluded from the dedicated combat deployment.');
    }
  },
};
export default defineConfig({
  ...base,
  define: { ...base.define, 'import.meta.env.VITE_SERVER_AUTHORITY': JSON.stringify('true'), 'import.meta.env.VITE_STATIC_HOST': JSON.stringify('') },
  plugins: [...(base.plugins ?? []), noCampaign],
  build: { ...base.build, outDir:'artifacts/server-authority-20260920/runtime/web',
    rollupOptions: { ...base.build?.rollupOptions, input: {main:'index.html'} } },
});
