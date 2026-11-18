import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
export function openDevDatabase(root=process.cwd()){
 const directory=join(root,'.openai/local');mkdirSync(directory,{recursive:true});
 const database=new DatabaseSync(join(directory,'preview.sqlite'));
 database.exec('PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS __local_migrations (name TEXT PRIMARY KEY NOT NULL)');
 for(const name of readdirSync(join(root,'drizzle')).filter(name=>name.endsWith('.sql')).sort()){
  if(database.prepare('SELECT name FROM __local_migrations WHERE name=?').get(name))continue;
  database.exec('BEGIN');
  try{database.exec(readFileSync(join(root,'drizzle',name),'utf8'));database.prepare('INSERT INTO __local_migrations (name) VALUES (?)').run(name);database.exec('COMMIT')}catch(error){database.exec('ROLLBACK');throw error;}
 }
 const prepare=sql=>{
  const statement=database.prepare(sql);
  const bound=args=>({first:async()=>statement.get(...args)||null,all:async()=>({results:statement.all(...args)}),run:async()=>statement.run(...args)});
  return {...bound([]),bind:(...args)=>bound(args)};
 };
 return {prepare,batch:async statements=>{
  database.exec('BEGIN');try{const output=[];for(const statement of statements)output.push(await statement.run());database.exec('COMMIT');return output}catch(error){database.exec('ROLLBACK');throw error;}
 }};
}
