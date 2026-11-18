import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {serveApi} from '../worker/api.mjs';
import {serveEcg} from '../worker/ecg.mjs';
import admin from '../control/worker.mjs';
function database(){const sqlite=new DatabaseSync(':memory:');for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(file=>file.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));const prepare=sql=>({bind(...args){const statement=sqlite.prepare(sql);return{first:async()=>statement.get(...args)||null,all:async()=>({results:statement.all(...args)}),run:async()=>statement.run(...args)}},all:async()=>({results:sqlite.prepare(sql).all()}),first:async()=>sqlite.prepare(sql).get()});return{prepare,batch:async statements=>{sqlite.exec('BEGIN');try{const result=[];for(const statement of statements)result.push(await statement.run());sqlite.exec('COMMIT');return result}catch(e){sqlite.exec('ROLLBACK');throw e}},sqlite};}
const origin='https://academy.example';
const request=(path,options)=>new Request(origin+path,options);
const post=(path,body,token='test-admin')=>request(path,{method:'POST',headers:{'X-Lemvori-Admin-Token':token,'Content-Type':'application/json'},body:JSON.stringify(body)});
test('anonymous visitors cannot modify editorial content',async()=>{const DB=database();const response=await serveApi(post('/api/admin/mentors',{name:'Injected'},'wrong'),{DB,ADMIN_SERVICE_TOKEN:'test-admin'});assert.equal(response.status,401);assert.equal(DB.sqlite.prepare('SELECT count(*) AS count FROM mentors').get().count,0);});
test('draft, publication, update, and unpublish preserve the same mentor',async()=>{const DB=database(),env={DB,ADMIN_SERVICE_TOKEN:'test-admin'};const body={name:'Test Author',specialty:'Teaching',bio:'Original description',photo:'',published:false};const saved=await(await serveApi(post('/api/admin/mentors',body),env)).json();assert.ok(saved.id);assert.equal((await(await serveApi(request('/api/content'),env)).json()).mentors.length,0);await serveApi(post('/api/admin/mentors',{...body,id:saved.id,published:true}),env);assert.equal((await(await serveApi(request('/api/content'),env)).json()).mentors.length,1);await serveApi(post('/api/admin/mentors',{...body,id:saved.id,published:false}),env);assert.equal((await(await serveApi(request('/api/content'),env)).json()).mentors.length,0);assert.equal(DB.sqlite.prepare('SELECT count(*) AS count FROM mentors').get().count,1);});
test('recordings require valid calibrated signals and private drafts remain inaccessible',async()=>{const DB=database(),env={DB,ADMIN_SERVICE_TOKEN:'test-admin'};const body={title:'Test format',description:'Synthetic test',source:'https://example.org',license:'Test',published:false,signal:{sampleRate:100,unit:'mV',leads:[{name:'II',values:Array(1000).fill(0)}]}};const invalid=await serveApi(post('/api/admin/recordings',{...body,signal:{...body.signal,unit:'V'}}),env);assert.equal(invalid.status,400);const saved=await(await serveApi(post('/api/admin/recordings',body),env)).json();assert.ok(saved.id);assert.equal((await serveApi(request('/api/recordings/'+saved.id),env)).status,404);await serveApi(post('/api/admin/recordings',{...body,id:saved.id,published:true,signal:undefined}),env);const signal=await(await serveApi(request('/api/recordings/'+saved.id),env)).json();assert.equal(signal.leads[0].values.length,1000);assert.equal(signal.name,body.title);});
test('Google setup, OAuth state, PKCE, and logout origin checks',async()=>{const DB=database();assert.equal((await serveApi(request('/auth/google'),{DB})).headers.get('Location'),'/?auth=setup');const env={DB,GOOGLE_CLIENT_ID:'test-client',GOOGLE_CLIENT_SECRET:'test-secret'};const response=await serveApi(request('/auth/google'),env);const target=new URL(response.headers.get('Location'));assert.equal(target.origin,'https://accounts.google.com');assert.equal(target.searchParams.get('code_challenge_method'),'S256');assert.ok(target.searchParams.get('nonce'));assert.match(response.headers.get('Set-Cookie'),/HttpOnly; Secure; SameSite=Lax/);assert.equal((await serveApi(request('/auth/google/callback?state=bad&code=test'),env)).headers.get('Location'),'/?auth=failed');assert.equal((await serveApi(request('/api/logout',{method:'POST',headers:{Origin:'https://evil.example'}}),env)).status,403);});
test('admin proxy requires the configured owner and refuses cross-origin writes',async()=>{const env={ADMIN_EMAIL:'owner@example.org',ACADEMY_ORIGIN:origin,ADMIN_SERVICE_TOKEN:'server-secret'};assert.equal((await admin.fetch(request('/api/content'),env)).status,403);assert.equal((await admin.fetch(request('/api/mentors',{method:'POST',headers:{'oai-authenticated-user-email':'owner@example.org',Origin:'https://evil.example'}}),env)).status,403);});
test('PTB-XL falls back to the second source and rejects unknown IDs',async()=>{let calls=0;const response=await serveEcg(request('/api/ecg/ptb-xl/00001.dat'),new Set(['00001']),async(url,options)=>{assert.equal(options.redirect,'manual');calls++;return calls===1?new Response(null,{status:502}):new Response(new Uint8Array(24000))});assert.equal(response.status,200);assert.equal(calls,2);assert.equal((await serveEcg(request('/api/ecg/ptb-xl/99999.dat'),new Set(['00001']))).status,404);});
const authRequest=(path,body)=>request(path,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,'CF-Connecting-IP':'127.0.0.1'},body:JSON.stringify(body)});
test('email registration, password verification, sessions and logout',async()=>{
 const DB=database(),env={DB};
 const profile={name:'Preview Student',email:'student@example.test',password:'long-example-password-2026'};
 const response=await serveApi(authRequest('/api/register',profile),env);
 assert.equal(response.status,200);assert.match(response.headers.get('Set-Cookie'),/HttpOnly; Secure; SameSite=Lax/);
 const stored=DB.sqlite.prepare('SELECT * FROM credentials').get();assert.notEqual(stored.password_hash,profile.password);assert.ok(stored.salt);
 const duplicate=await serveApi(authRequest('/api/register',profile),env);assert.equal(duplicate.status,409);assert.equal(DB.sqlite.prepare('SELECT COUNT(*) AS count FROM users').get().count,1);
 const wrong=await serveApi(authRequest('/api/login',{...profile,password:'incorrect-long-password'}),env);assert.equal(wrong.status,401);
 const login=await serveApi(authRequest('/api/login',profile),env);assert.equal(login.status,200);
 const cookie=login.headers.get('Set-Cookie').split(';')[0];
 const session=await(await serveApi(request('/api/session',{headers:{Cookie:cookie}}),env)).json();assert.equal(session.user.email,profile.email);assert.equal(session.emailEnabled,true);
 const logout=await serveApi(request('/api/logout',{method:'POST',headers:{Cookie:cookie,Origin:origin}}),env);assert.equal(logout.status,200);
 assert.equal((await(await serveApi(request('/api/session',{headers:{Cookie:cookie}}),env)).json()).user,null);
});
test('registration rejects cross-origin requests and rate limits repeated attempts',async()=>{
 const DB=database(),env={DB};
 assert.equal((await serveApi(request('/api/register',{method:'POST',headers:{Origin:'https://evil.example'},body:'{}'}),env)).status,403);
 for(let i=0;i<20;i++)await serveApi(authRequest('/api/login',{email:'absent@example.test',password:'too-short'}),env);
 assert.equal((await serveApi(authRequest('/api/login',{email:'absent@example.test',password:'too-short'}),env)).status,429);
});
test('broadcast drafts remain private and publication updates one session',async()=>{
 const DB=database(),env={DB,ADMIN_SERVICE_TOKEN:'test-admin'};
 const body={title:'Preview lesson',description:'Private test broadcast',speaker:'Test teacher',starts_at:'2026-12-01T12:00:00Z',youtube_id:'abcdefghijk',status:'scheduled',published:false};
 const saved=await(await serveApi(post('/api/admin/broadcasts',body),env)).json();assert.ok(saved.id);
 assert.equal((await(await serveApi(request('/api/broadcasts'),env)).json()).broadcasts.length,0);
 await serveApi(post('/api/admin/broadcasts',{...body,id:saved.id,published:true,status:'live'}),env);
 const list=(await(await serveApi(request('/api/broadcasts'),env)).json()).broadcasts;assert.equal(list.length,1);assert.equal(list[0].status,'live');
 assert.equal((await serveApi(post('/api/admin/broadcasts',{...body,youtube_id:'invalid'}),env)).status,400);
});
test('single-use recovery changes the password and invalidates all previous sessions',async()=>{
 const DB=database(),env={DB};
 const profile={name:'Recovery Student',email:'recovery@example.test',password:'previous-long-password-2026'};
 const registration=await serveApi(authRequest('/api/register',profile),env);
 const data=await registration.json();
 assert.match(data.recoveryCode,/^(?:[A-F0-9]{5}-){7}[A-F0-9]{5}$/);
 const stored=DB.sqlite.prepare('SELECT code_hash FROM recovery_codes').get();assert.notEqual(stored.code_hash,data.recoveryCode);
 const oldSession=registration.headers.get('Set-Cookie').split(';')[0];
 const invalid=await serveApi(authRequest('/api/recover',{email:profile.email,recoveryCode:'0'.repeat(40),password:'replacement-password-2026'}),env);assert.equal(invalid.status,400);
 const before=await(await serveApi(request('/api/session',{headers:{Cookie:oldSession}}),env)).json();assert.equal(before.user.email,profile.email);
 const reset=await serveApi(authRequest('/api/recover',{email:profile.email,recoveryCode:data.recoveryCode,password:'replacement-password-2026'}),env);assert.equal(reset.status,200);
 const after=await(await serveApi(request('/api/session',{headers:{Cookie:oldSession}}),env)).json();assert.equal(after.user,null);
 assert.equal((await serveApi(authRequest('/api/login',profile),env)).status,401);
 assert.equal((await serveApi(authRequest('/api/login',{...profile,password:'replacement-password-2026'}),env)).status,200);
 assert.equal((await serveApi(authRequest('/api/recover',{email:profile.email,recoveryCode:data.recoveryCode,password:'another-long-password-2026'}),env)).status,400);
});
test('an existing email account can rotate its recovery code only after password confirmation',async()=>{
 const DB=database(),env={DB};
 const profile={name:'Existing Account',email:'existing@example.test',password:'existing-long-password-2026'};
 const registration=await serveApi(authRequest('/api/register',profile),env);
 const initial=await registration.json(),cookie=registration.headers.get('Set-Cookie').split(';')[0];
 // Model an account created before recovery codes were introduced.
 DB.sqlite.exec('DELETE FROM recovery_codes');
 const generate=password=>request('/api/account/recovery-code',{method:'POST',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({password})});
 assert.equal((await serveApi(generate('incorrect-long-password'),env)).status,401);
 const generated=await(await serveApi(generate(profile.password),env)).json();assert.ok(generated.recoveryCode);
 const rotated=await(await serveApi(generate(profile.password),env)).json();assert.ok(rotated.recoveryCode);assert.notEqual(generated.recoveryCode,rotated.recoveryCode);
 assert.equal((await serveApi(authRequest('/api/recover',{email:profile.email,recoveryCode:initial.recoveryCode,password:'another-password-2026'}),env)).status,400);
 assert.equal((await serveApi(authRequest('/api/recover',{email:profile.email,recoveryCode:generated.recoveryCode,password:'another-password-2026'}),env)).status,400);
 assert.equal((await serveApi(authRequest('/api/recover',{email:profile.email,recoveryCode:rotated.recoveryCode,password:'another-password-2026'}),env)).status,200);
});
