export default {
 async fetch(request,env={}){
  const url=new URL(request.url);
  const owner=(env.ADMIN_EMAIL||'').toLowerCase();
  const email=(request.headers.get('oai-authenticated-user-email')||'').toLowerCase();
  if(!owner||email!==owner){
   return new Response('Доступ лише власнику академії. Увійди в обліковий запис, якому належить цей сайт.',{status:403,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}});
  }
  if(url.pathname==='/api/config')return Response.json({academy:env.ACADEMY_ORIGIN},{headers:{'Cache-Control':'no-store'}});
  if(url.pathname.startsWith('/api/')){
   if(!env.ACADEMY_ORIGIN||!env.ADMIN_SERVICE_TOKEN)return Response.json({error:'Не налаштовано з’єднання з академією.'},{status:503});
   if(request.method!=='GET'&&(request.method!=='POST'||request.headers.get('Origin')!==url.origin))return new Response(null,{status:403});
   const routes={'/api/content':'/api/admin/content','/api/mentors':'/api/admin/mentors','/api/recordings':'/api/admin/recordings','/api/broadcasts':'/api/admin/broadcasts'};
   if(!routes[url.pathname])return new Response(null,{status:404});
   if(Number(request.headers.get('Content-Length'))>1500000)return Response.json({error:'Файл завеликий.'},{status:413});
   const body=request.method==='POST'?await request.text():undefined;
   if(body?.length>1500000)return Response.json({error:'Файл завеликий.'},{status:413});
   try{
    const result=await fetch(new URL(routes[url.pathname],env.ACADEMY_ORIGIN),{method:request.method,headers:{'X-Lemvori-Admin-Token':env.ADMIN_SERVICE_TOKEN,'Content-Type':'application/json'},body,redirect:'manual',signal:AbortSignal.timeout(15000)});
    if(result.status>=300&&result.status<400)return Response.json({error:'Сервер академії повернув неочікуване перенаправлення.'},{status:502});
    return new Response(result.body,{status:result.status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
   }catch{return Response.json({error:'З’єднання з академією тимчасово недоступне.'},{status:502});}
  }
  if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405});
  const asset=assets.get(url.pathname==='/'?'/index.html':url.pathname);
  if(!asset)return new Response('Сторінку не знайдено',{status:404});
  return new Response(request.method==='HEAD'?null:asset[1],{headers:{'Content-Type':asset[0],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','Content-Security-Policy':"default-src 'self'; img-src 'self' https:; style-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'"}});
 }
};
