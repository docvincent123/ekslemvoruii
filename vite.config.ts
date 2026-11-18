import {readFileSync} from 'node:fs';
import {defineConfig} from 'vite';
import {serveEcg} from './worker/ecg.mjs';
import {serveApi} from './worker/api.mjs';

export default defineConfig({
  server: {allowedHosts: ['terminal.local']},
  build: {outDir: 'dist'},
  plugins: [{
    name: 'ecg-dev-proxy',
    configureServer(server) {
      const catalog = JSON.parse(readFileSync('public/data/real-ecg/catalog.json', 'utf8'));
      const ids = new Set(catalog['ptb-xl'].map(([id]: [string, string[]]) => id));
      server.middlewares.use(async (request, response, next) => {
        if (!request.url?.startsWith('/api/') && !request.url?.startsWith('/auth/')) return next();
        const incoming = new Request(new URL(request.url!, 'http://localhost'), {method:request.method});
        const result = request.url?.startsWith('/api/ecg/') ? await serveEcg(incoming, ids) : await serveApi(incoming, {});
        response.writeHead(result.status, Object.fromEntries(result.headers));
        response.end(Buffer.from(await result.arrayBuffer()));
      });
    },
  }],
});
