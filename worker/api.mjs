const sessionCookie = '__Host-lemvori-session';
const stateCookie = '__Host-lemvori-oauth';
const encoder = new TextEncoder();
const now = () => Math.floor(Date.now()/1000);
const random = () => crypto.randomUUID()+crypto.randomUUID();
const base64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
const digest = async value => base64url(await crypto.subtle.digest('SHA-256',encoder.encode(value)));
const cookie = (name,value,age) => `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
const cookies = request => Object.fromEntries((request.headers.get('Cookie')||'').split(';').map(part=>part.trim().split('=')));
const json = (data,status=200) => Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const redirect = (path,headers={}) => new Response(null,{status:303,headers:{Location:path,'Cache-Control':'no-store',...headers}});
function sameOrigin(request) {return request.headers.get('Origin')===new URL(request.url).origin;}
function configured(env) {return Boolean(env.DB&&env.GOOGLE_CLIENT_ID&&env.GOOGLE_CLIENT_SECRET);}
async function getUser(request,env) {
  const token=cookies(request)[sessionCookie];
  if(!token||!env.DB)return null;
  return env.DB.prepare('SELECT users.id, users.name, users.email, users.provider FROM sessions JOIN users ON users.id=sessions.user_id WHERE token_hash=? AND expires_at>?').bind(await digest(token),now()).first();
}
async function passwordHash(password,salt) {
  const key=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);
  return base64url(await crypto.subtle.deriveBits({name:'PBKDF2',salt:encoder.encode(salt),iterations:100000,hash:'SHA-256'},key,256));
}
async function createSession(userId,env) {
  const token=random();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE expires_at<?').bind(now()),
    env.DB.prepare('INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,?)').bind(await digest(token),userId,now()+2592000),
  ]);
  return cookie(sessionCookie,token,2592000);
}
function newRecoveryCode(){
  return Array.from(crypto.getRandomValues(new Uint8Array(20)),value=>value.toString(16).padStart(2,'0')).join('').toUpperCase().match(/.{5}/g).join('-');
}
function normalizeRecoveryCode(value){return typeof value==='string'?value.replace(/[\s-]/g,'').toUpperCase():'';}
async function matchesPassword(password,credential){
  const actual=await passwordHash(password,credential?.salt||'unregistered-account');
  const expected=credential?.password_hash||'0'.repeat(actual.length);
  let difference=actual.length^expected.length;
  for(let i=0;i<actual.length;i++)difference|=actual.charCodeAt(i)^expected.charCodeAt(i);
  return Boolean(credential)&&difference===0;
}
async function allowAuth(request,email,env) {
  const ip=request.headers.get('CF-Connecting-IP')||'unknown';
  const keys=[await digest('ip:'+ip),await digest('email:'+email)];
  await env.DB.prepare('DELETE FROM auth_limits WHERE expires_at<?').bind(now()).run();
  for(const key of keys){
    const limit=await env.DB.prepare('INSERT INTO auth_limits (key,attempts,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=attempts+1 RETURNING attempts').bind(key,now()+900).first();
    if(limit.attempts>20)return false;
  }
  return true;
}
function text(value,max,required=false) {
  if(typeof value!=='string'||value.length>max||(required&&!value.trim()))throw Error('Перевір заповнення полів');
  return value.trim();
}
function url(value,required=false) {
  const result=text(value,1000,required);
  if(!result)return '';
  const parsed=new URL(result);
  if(parsed.protocol!=='https:'||parsed.username||parsed.password)throw Error('Потрібне HTTPS-посилання');
  return result;
}
function validSignal(value) {
  if(!value||value.unit!=='mV'||!Number.isFinite(value.sampleRate)||value.sampleRate<50||value.sampleRate>2000||!Array.isArray(value.leads)||![1,2,3,6,12].includes(value.leads.length))throw Error('Потрібен сигнал у mV з 1, 2, 3, 6 або 12 відведеннями');
  let size;
  const names=new Set();
  for(const lead of value.leads){
    text(lead.name,15,true);
    if(names.has(lead.name))throw Error('Назви відведень мають бути унікальні');
    names.add(lead.name);
    if(!Array.isArray(lead.values)||lead.values.length<250||lead.values.length>20000||lead.values.some(v=>!Number.isFinite(v)||Math.abs(v)>=50))throw Error('Неприпустимі відліки сигналу');
    size??=lead.values.length;
    if(size!==lead.values.length)throw Error('Відведення мають містити однакову кількість відліків');
  }
  return {name:'',unit:'mV',sampleRate:value.sampleRate,leads:value.leads.map(l=>({name:l.name,values:l.values}))};
}
let googleKeys;
async function verifyGoogle(token,clientId,nonce) {
  const parts=token.split('.');
  if(parts.length!==3)throw Error('Невірний токен Google');
  const decode=value=>Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
  const header=JSON.parse(new TextDecoder().decode(decode(parts[0])));
  const claims=JSON.parse(new TextDecoder().decode(decode(parts[1])));
  if(header.alg!=='RS256')throw Error('Невірний підпис Google');
  if(!googleKeys||googleKeys.until<Date.now()||!googleKeys.keys.some(k=>k.kid===header.kid)){
    const response=await fetch('https://www.googleapis.com/oauth2/v3/certs',{signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw Error('Google тимчасово недоступний');
    googleKeys={keys:(await response.json()).keys,until:Date.now()+300000};
  }
  const jwk=googleKeys.keys.find(k=>k.kid===header.kid);
  if(!jwk)throw Error('Ключ Google недоступний');
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  const valid=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(parts[2]),encoder.encode(parts[0]+'.'+parts[1]));
  if(!valid||!['accounts.google.com','https://accounts.google.com'].includes(claims.iss)||claims.aud!==clientId||claims.exp<=now()||claims.iat>now()+60||claims.nonce!==nonce||!claims.sub||claims.email_verified!==true||!claims.email)throw Error('Не вдалося підтвердити обліковий запис Google');
  return claims;
}
export async function serveApi(request,env={}) {
  const address=new URL(request.url),path=address.pathname;
  try {
    if(path==='/api/session'&&request.method==='GET')return json({user:await getUser(request,env),googleEnabled:configured(env),emailEnabled:Boolean(env.DB)});
    if(['/api/register','/api/login'].includes(path)&&request.method==='POST'){
      if(!sameOrigin(request))return json({error:'Запит відхилено'},403);
      if(!env.DB)return json({error:'Реєстрація тимчасово недоступна'},503);
      const raw=await request.text();if(raw.length>8192)return json({error:'Запит завеликий'},413);
      const body=JSON.parse(raw);
      const email=text(body.email,254,true).toLowerCase();
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return json({error:'Вкажи коректну електронну адресу'},400);
      if(!await allowAuth(request,email,env))return json({error:'Забагато спроб. Спробуй через 15 хвилин'},429);
      const password=body.password;
      if(typeof password!=='string'||password.length<12||password.length>128)return json({error:'Пароль має містити від 12 до 128 символів'},400);
      let user,recoveryCode;
      if(path==='/api/register'){
        const name=text(body.name,120,true);
        const existing=await env.DB.prepare('SELECT user_id FROM credentials WHERE email=?').bind(email).first();
        if(existing)return json({error:'Цей email уже зареєстровано. Увійди у свій профіль'},409);
        const id=crypto.randomUUID(),salt=random(),hash=await passwordHash(password,salt);
        recoveryCode=newRecoveryCode();
        const recoveryHash=await digest(normalizeRecoveryCode(recoveryCode));
        try{
          await env.DB.batch([
            env.DB.prepare('INSERT INTO users (id,provider,subject,name,email,created_at) VALUES (?,?,?,?,?,?)').bind(id,'email','email:'+email,name,email,now()),
            env.DB.prepare('INSERT INTO credentials (email,user_id,salt,password_hash) VALUES (?,?,?,?)').bind(email,id,salt,hash),
            env.DB.prepare('INSERT INTO recovery_codes (user_id,code_hash,created_at) VALUES (?,?,?)').bind(id,recoveryHash,now()),
          ]);
        }catch{return json({error:'Не вдалося зареєструвати профіль. Перевір email і спробуй увійти'},409);}
        user={id,name,email,provider:'email'};
      }else{
        const credential=await env.DB.prepare('SELECT * FROM credentials WHERE email=?').bind(email).first();
        if(!await matchesPassword(password,credential))return json({error:'Невірний email або пароль'},401);
        user=await env.DB.prepare('SELECT id,name,email,provider FROM users WHERE id=?').bind(credential.user_id).first();
      }
      const response=json({user,recoveryCode});response.headers.set('Set-Cookie',await createSession(user.id,env));return response;
    }
    if(path==='/api/account/recovery-code'&&request.method==='POST'){
      if(!sameOrigin(request))return json({error:'Запит відхилено'},403);
      const user=await getUser(request,env);if(!user)return json({error:'Спочатку увійди у профіль'},401);
      const raw=await request.text();if(raw.length>8192)return json({error:'Запит завеликий'},413);
      const {password}=JSON.parse(raw);
      if(typeof password!=='string'||password.length<12||password.length>128)return json({error:'Введи поточний пароль'},400);
      if(!await allowAuth(request,user.email,env))return json({error:'Забагато спроб. Спробуй через 15 хвилин'},429);
      const credential=await env.DB.prepare('SELECT * FROM credentials WHERE user_id=?').bind(user.id).first();
      if(!await matchesPassword(password,credential))return json({error:'Невірний email або пароль'},401);
      const recoveryCode=newRecoveryCode(),codeHash=await digest(normalizeRecoveryCode(recoveryCode));
      await env.DB.prepare('INSERT INTO recovery_codes (user_id,code_hash,created_at) VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET code_hash=excluded.code_hash,created_at=excluded.created_at').bind(user.id,codeHash,now()).run();
      return json({recoveryCode});
    }
    if(path==='/api/recover'&&request.method==='POST'){
      if(!sameOrigin(request))return json({error:'Запит відхилено'},403);
      if(!env.DB)return json({error:'Сервіс тимчасово недоступний'},503);
      const raw=await request.text();if(raw.length>8192)return json({error:'Запит завеликий'},413);
      const body=JSON.parse(raw),email=text(body.email,254,true).toLowerCase();
      if(!await allowAuth(request,email,env))return json({error:'Забагато спроб. Спробуй через 15 хвилин'},429);
      const code=normalizeRecoveryCode(body.recoveryCode),password=body.password;
      if(typeof password!=='string'||password.length<12||password.length>128)return json({error:'Пароль має містити від 12 до 128 символів'},400);
      if(!/^[A-F0-9]{40}$/.test(code))return json({error:'Невірний email або резервний код'},400);
      const credential=await env.DB.prepare('SELECT user_id FROM credentials WHERE email=?').bind(email).first();
      if(!credential)return json({error:'Невірний email або резервний код'},400);
      const codeHash=await digest(code),salt=random(),hash=await passwordHash(password,salt);
      const match='EXISTS (SELECT 1 FROM recovery_codes WHERE user_id=? AND code_hash=?)';
      const results=await env.DB.batch([
        env.DB.prepare('UPDATE credentials SET salt=?,password_hash=? WHERE user_id=? AND '+match).bind(salt,hash,credential.user_id,credential.user_id,codeHash),
        env.DB.prepare('DELETE FROM sessions WHERE user_id=? AND '+match).bind(credential.user_id,credential.user_id,codeHash),
        env.DB.prepare('DELETE FROM recovery_codes WHERE user_id=? AND code_hash=?').bind(credential.user_id,codeHash),
      ]);
      if(!(results[0].meta?.changes??results[0].changes))return json({error:'Невірний email або резервний код'},400);
      return json({ok:true});
    }
    if(path==='/auth/google'&&request.method==='GET'){
      if(!configured(env))return redirect('/?auth=setup');
      const state=random(),nonce=random(),verifier=random();
      await env.DB.batch([
        env.DB.prepare('DELETE FROM oauth_states WHERE expires_at<?').bind(now()),
        env.DB.prepare('INSERT INTO oauth_states (state,nonce,verifier,expires_at) VALUES (?,?,?,?)').bind(state,nonce,verifier,now()+600),
      ]);
      const target=new URL('https://accounts.google.com/o/oauth2/v2/auth');
      target.search=new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,redirect_uri:address.origin+'/auth/google/callback',response_type:'code',scope:'openid email profile',state,nonce,code_challenge:await digest(verifier),code_challenge_method:'S256',prompt:'select_account'}).toString();
      return redirect(target.href,{'Set-Cookie':cookie(stateCookie,state,600)});
    }
    if(path==='/auth/google/callback'&&request.method==='GET'){
      if(!configured(env))return redirect('/?auth=setup');
      const state=address.searchParams.get('state');
      if(!state||state!==cookies(request)[stateCookie])return redirect('/?auth=failed');
      const stored=await env.DB.prepare('DELETE FROM oauth_states WHERE state=? AND expires_at>? RETURNING nonce,verifier').bind(state,now()).first();
      if(!stored||!address.searchParams.get('code'))return redirect('/?auth=failed',{'Set-Cookie':cookie(stateCookie,'',0)});
      const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,redirect_uri:address.origin+'/auth/google/callback',code:address.searchParams.get('code'),grant_type:'authorization_code',code_verifier:stored.verifier}),signal:AbortSignal.timeout(10000)});
      if(!response.ok)throw Error('Google не підтвердив вхід');
      const claims=await verifyGoogle((await response.json()).id_token,env.GOOGLE_CLIENT_ID,stored.nonce);
      const subject='google:'+claims.sub;
      await env.DB.prepare('INSERT INTO users (id,provider,subject,name,email,created_at) VALUES (?,?,?,?,?,?) ON CONFLICT(subject) DO UPDATE SET name=excluded.name,email=excluded.email').bind(crypto.randomUUID(),'google',subject,text(claims.name||claims.email,200,true),text(claims.email,320,true),now()).run();
      const user=await env.DB.prepare('SELECT id FROM users WHERE subject=?').bind(subject).first();
      const token=random();
      await env.DB.batch([
        env.DB.prepare('DELETE FROM sessions WHERE expires_at<?').bind(now()),
        env.DB.prepare('INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,?)').bind(await digest(token),user.id,now()+2592000),
      ]);
      const result=redirect('/?auth=success');result.headers.append('Set-Cookie',cookie(sessionCookie,token,2592000));result.headers.append('Set-Cookie',cookie(stateCookie,'',0));return result;
    }
    if(path==='/api/logout'&&request.method==='POST'){
      if(!sameOrigin(request))return json({error:'Запит відхилено'},403);
      const token=cookies(request)[sessionCookie];
      if(token&&env.DB)await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await digest(token)).run();
      const result=json({ok:true});result.headers.set('Set-Cookie',cookie(sessionCookie,'',0));return result;
    }
    if(path==='/api/broadcasts'&&request.method==='GET'){
      if(!env.DB)return json({broadcasts:[]});
      const rows=await env.DB.prepare('SELECT id,title,description,speaker,starts_at,youtube_id,status FROM broadcasts WHERE published=1 ORDER BY starts_at DESC').all();
      return json({broadcasts:rows.results});
    }
    if(path==='/api/content'&&request.method==='GET'){
      if(!env.DB)return json({mentors:[],recordings:[]});
      const [mentors,recordings]=await Promise.all([
        env.DB.prepare('SELECT id,name,specialty,bio,photo FROM mentors WHERE published=1 ORDER BY updated_at DESC').all(),
        env.DB.prepare('SELECT id,title,description,source,license FROM recordings WHERE published=1 ORDER BY updated_at DESC').all(),
      ]);return json({mentors:mentors.results,recordings:recordings.results});
    }
    const recording=/^\/api\/recordings\/([a-f0-9-]{36})$/.exec(path);
    if(recording&&request.method==='GET'){
      if(!env.DB)return json({error:'Запис не знайдено'},404);
      const row=await env.DB.prepare('SELECT signal FROM recordings WHERE id=? AND published=1').bind(recording[1]).first();
      return row?json(JSON.parse(row.signal)):json({error:'Запис не знайдено'},404);
    }
    if(path.startsWith('/api/admin/')){
      const authorization=request.headers.get('X-Lemvori-Admin-Token')||'';
      if(!env.ADMIN_SERVICE_TOKEN||await digest(authorization)!==await digest(env.ADMIN_SERVICE_TOKEN))return json({error:'Потрібен доступ адміністратора'},401);
      if(!env.DB)return json({error:'База даних недоступна'},503);
      if(path==='/api/admin/content'&&request.method==='GET'){
        const [mentors,recordings,users,broadcasts]=await Promise.all([
          env.DB.prepare('SELECT * FROM mentors ORDER BY updated_at DESC').all(),
          env.DB.prepare('SELECT id,title,description,source,license,published,updated_at FROM recordings ORDER BY updated_at DESC').all(),
          env.DB.prepare('SELECT COUNT(*) AS count FROM users').first(),
          env.DB.prepare('SELECT * FROM broadcasts ORDER BY starts_at DESC').all(),
        ]);return json({mentors:mentors.results,recordings:recordings.results,broadcasts:broadcasts.results,users:users.count,googleEnabled:configured(env)});
      }
      if(!['/api/admin/mentors','/api/admin/recordings','/api/admin/broadcasts'].includes(path)||request.method!=='POST')return json({error:'Маршрут не знайдено'},404);
      if(Number(request.headers.get('Content-Length'))>1500000)return json({error:'Файл завеликий'},413);
      const raw=await request.text();if(raw.length>1500000)return json({error:'Файл завеликий'},413);
      const body=JSON.parse(raw);
      const id=body.id||crypto.randomUUID();if(!/^[a-f0-9-]{36}$/.test(id))throw Error('Невірний ідентифікатор');
      const published=body.published===true||body.published===1?1:0;
      if(path.endsWith('/broadcasts')){
        const title=text(body.title,150,true),description=text(body.description,5000,true),speaker=text(body.speaker,150,true);
        const startsAt=text(body.starts_at,40,true);if(!Number.isFinite(Date.parse(startsAt)))throw Error('Вкажи дату ефіру');
        const youtubeId=text(body.youtube_id,30,true);if(!/^[A-Za-z0-9_-]{11}$/.test(youtubeId))throw Error('Потрібен 11-символьний YouTube video ID');
        const status=text(body.status,20,true);if(!['scheduled','live','ended'].includes(status))throw Error('Невірний стан ефіру');
        await env.DB.prepare('INSERT INTO broadcasts (id,title,description,speaker,starts_at,youtube_id,status,published,updated_at) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,description=excluded.description,speaker=excluded.speaker,starts_at=excluded.starts_at,youtube_id=excluded.youtube_id,status=excluded.status,published=excluded.published,updated_at=excluded.updated_at').bind(id,title,description,speaker,new Date(startsAt).toISOString(),youtubeId,status,published,now()).run();
      }else if(path.endsWith('/mentors')){
        await env.DB.prepare('INSERT INTO mentors (id,name,specialty,bio,photo,published,updated_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,specialty=excluded.specialty,bio=excluded.bio,photo=excluded.photo,published=excluded.published,updated_at=excluded.updated_at').bind(id,text(body.name,150,true),text(body.specialty,200,true),text(body.bio,3000,true),url(body.photo||''),published,now()).run();
      }else{
        const title=text(body.title,150,true),description=text(body.description,5000,true),source=url(body.source,true),license=text(body.license,300,true);
        let signal;
        if(body.signal){signal=validSignal(body.signal);signal.name=title;}
        else {const prior=await env.DB.prepare('SELECT signal FROM recordings WHERE id=?').bind(id).first();if(!prior)throw Error('Додай файл із сигналом ЕКГ');signal=JSON.parse(prior.signal);signal.name=title;}
        await env.DB.prepare('INSERT INTO recordings (id,title,description,source,license,signal,published,updated_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,description=excluded.description,source=excluded.source,license=excluded.license,signal=excluded.signal,published=excluded.published,updated_at=excluded.updated_at').bind(id,title,description,source,license,JSON.stringify(signal),published,now()).run();
      }
      return json({ok:true,id});
    }
    return json({error:'Маршрут не знайдено'},404);
  }catch(error){
    if(path.startsWith('/auth/'))return redirect('/?auth=failed',{'Set-Cookie':cookie(stateCookie,'',0)});
    return json({error:path.startsWith('/api/admin/')?(error instanceof Error?error.message:'Помилка запиту'):'Сервіс тимчасово недоступний'},400);
  }
}
