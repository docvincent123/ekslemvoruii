export default {
  async fetch(request, env) {
    const {pathname} = new URL(request.url);
    if (pathname.startsWith('/auth/') || (pathname.startsWith('/api/') && !pathname.startsWith('/api/ecg/'))) return serveApi(request, env);
    if (pathname.startsWith('/api/ecg/')) return serveEcg(request, recordIds);
    if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, {status: 405});
    const asset = assets.get(pathname === '/' ? '/index.html' : pathname);
    if (!asset) return new Response('Сторінку не знайдено', {status: 404});
    const [contentType, body] = asset;
    return new Response(request.method === 'HEAD' ? null : body, {headers: {
      'Content-Type': contentType,
      'Cache-Control': contentType.startsWith('text/html') ? 'no-cache' : pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    }});
  },
};
