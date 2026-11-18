import {mkdir, readFile, readdir, writeFile} from 'node:fs/promises';
import {extname, join} from 'node:path';

const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.md': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
};
const files = await readdir('dist', {recursive: true, withFileTypes: true});
const assets = await Promise.all(files.filter(file => file.isFile() && types[extname(file.name)]).map(async file => {
  const path = join(file.parentPath, file.name);
  return ['/' + path.slice('dist/'.length), [types[extname(path)], await readFile(path, 'utf8')]];
}));
const catalog = JSON.parse(await readFile('public/data/real-ecg/catalog.json', 'utf8'));
const ptb = catalog['ptb-xl'].map(([id]) => id);
const source = `const assets = new Map(${JSON.stringify(assets)});\nconst recordIds = new Set(${JSON.stringify(ptb)});\n` +
  (await readFile('worker/api.mjs', 'utf8')).replace('export async function serveApi', 'async function serveApi') + '\n' +
  (await readFile('worker/ecg.mjs', 'utf8')).replace('export async function serveEcg', 'async function serveEcg') + '\n' + await readFile('worker/index.mjs', 'utf8');
await mkdir('dist/server', {recursive: true});
await writeFile('dist/server/index.js', source);
