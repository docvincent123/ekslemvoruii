import {readFileSync} from 'node:fs';
import {defineConfig} from 'vite';
import {serveEcg} from './worker/ecg.mjs';
import {serveApi} from './worker/api.mjs';
import {openDevDatabase} from './scripts/dev-database.mjs';

export default defineConfig({
  server: {allowedHosts: ['terminal.local']},
  build: {outDir: 'dist'},
  plugins: [{
    name: 'ecg-dev-proxy',
    configureServer(server) {
      const DB = openDevDatabase();
      const catalog = JSON.parse(readFileSync('public/data/real-ecg/catalog.json', 'utf8'));
      const ids = new Set(catalog['ptb-xl'].map(([id]: [string, string[]]) => id));
      server.middlewares.use(async (request, response, next) => {
        if (!request.url?.startsWith('/api/') && !request.url?.startsWith('/auth/')) return next();
        const chunks:Buffer[]=[];
        let size=0;
        for await(const chunk of request){size+=chunk.length;if(size>1500000){response.writeHead(413);response.end();return;}chunks.push(chunk);}
        const incoming = new Request(new URL(request.url!, 'http://'+request.headers.host), {
          method:request.method,headers:request.headers as Record<string,string>,
          body:request.method==='GET'||request.method==='HEAD'?undefined:Buffer.concat(chunks),
        });
        const result = request.url?.startsWith('/api/ecg/') ? await serveEcg(incoming, ids) : await serveApi(incoming, {DB});
        response.writeHead(result.status, Object.fromEntries(result.headers));
        response.end(Buffer.from(await result.arrayBuffer()));
      });
    },
  }],
});
