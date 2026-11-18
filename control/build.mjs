import {readFile,writeFile,mkdir} from 'node:fs/promises';
const files=[['index.html','text/html; charset=utf-8'],['admin.css','text/css; charset=utf-8'],['admin.js','text/javascript; charset=utf-8'],['icon.svg','image/svg+xml'],['sample.json','application/json']];
const assets=await Promise.all(files.map(async([file,type])=>['/'+file,[type,await readFile(file,'utf8')]]));
await mkdir('dist/server',{recursive:true});
await writeFile('dist/server/index.js','const assets = new Map('+JSON.stringify(assets)+');\n'+await readFile('worker.mjs','utf8'));
