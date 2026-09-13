import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import fs from 'node:fs'

export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    {
      name: 'starsector-assets',
      configureServer(server) {
        server.middlewares.use('/api/asset', (req, res) => {
          const url = new URL(req.url || '', 'http://localhost');
          const relPath = url.searchParams.get('path');
          if (!relPath) {
            res.statusCode = 400;
            res.end('Missing path parameter');
            return;
          }
          // Resolve relative to starsector-core
          const cleanRel = relPath.replace(/^(\.\.[/\\])+/, '').replace(/^starsector-core[/\\]/, '');
          const fullPath = path.resolve('..', 'starsector-core', cleanRel);
          if (fs.existsSync(fullPath)) {
            if (fullPath.endsWith('.png')) res.setHeader('Content-Type', 'image/png');
            else if (fullPath.endsWith('.jpg') || fullPath.endsWith('.jpeg')) res.setHeader('Content-Type', 'image/jpeg');
            else if (fullPath.endsWith('.ogg')) res.setHeader('Content-Type', 'audio/ogg');
            else if (fullPath.endsWith('.wav')) res.setHeader('Content-Type', 'audio/wav');
            else if (fullPath.endsWith('.csv')) res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            else if (fullPath.endsWith('.ship') || fullPath.endsWith('.wpn') || fullPath.endsWith('.variant')) res.setHeader('Content-Type', 'application/json; charset=utf-8');
            else res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            fs.createReadStream(fullPath).pipe(res);
          } else {
            res.statusCode = 404;
            res.end('Not found: ' + cleanRel);
          }
        });
      }
    }
  ],
  server: {
    fs: {
      allow: ['..']
    }
  }
})

