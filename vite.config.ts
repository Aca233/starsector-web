import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { studioSummaryPlugin } from './scripts/studio-summary-plugin.ts'
import { catalogDataPlugin } from './scripts/catalog-data-plugin.ts'
import { lanLaunchPlugin } from './scripts/lan-launch-plugin.ts'

const lanBuildId = new Date().toISOString();

export default defineConfig({
  define: { __LAN_BUILD_ID__: JSON.stringify(lanBuildId) },
  // Relative URLs keep the production bundle deployable at `/`, `/starsector/`,
  // or any other static subdirectory without a path-specific rebuild.
  base: './',
  // Native combat AI owners use immutable SAB input. Non-isolated static hosting falls back to serial.
  server: { watch: { ignored: ['**/artifacts/**'] }, headers: { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' } },
  preview: { headers: { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' } },
  plugins: [lanLaunchPlugin(), { name: 'lan-build-id', generateBundle() { this.emitFile({type:'asset',fileName:'lan-build.json',source:JSON.stringify({build:lanBuildId})}); } }, studioSummaryPlugin(), catalogDataPlugin(), tailwindcss(), react(), {
    name: 'combat-definition-reload',
    apply: 'serve',
    handleHotUpdate({ file, server }) {
      // Stateful singleton graphs cannot mix old definitions with new consumers.
      // Invalidate every transform so the reload uses one coherent module graph.
      if (!file.replaceAll('\\', '/').includes('/src/engine/')) return
      server.moduleGraph.invalidateAll()
      server.ws.send({ type: 'full-reload' })
      return []
    },
  }],
  // Prebundle the portal entrypoint too; late discovery can leave a running dev
  // page requesting an obsolete react-dom optimization (504 / blank screen).
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) return 'vendor'
        },
      },
    },
  },
})
