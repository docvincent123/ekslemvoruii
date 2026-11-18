export async function serveEcg(request, recordIds, fetchUpstream = fetch) {
  const {pathname} = new URL(request.url);
  const match = /^\/api\/ecg\/ptb-xl\/(\d{5})\.(hea|dat)$/.exec(pathname);
  if (!match || !recordIds.has(match[1])) return new Response('Запис не знайдено', {status: 404});
  if (request.method !== 'GET') return new Response(null, {status: 405, headers: {Allow: 'GET'}});
  const [, id, extension] = match;
  const folder = String(Math.floor(Number(id) / 1000) * 1000).padStart(5, '0');
  const file = `records100/${folder}/${id}_lr.${extension}`;
  const sources = [
    `https://physionet-open.s3.amazonaws.com/ptb-xl/1.0.3/${file}`,
    `https://physionet.org/files/ptb-xl/1.0.3/${file}`,
  ];
  for (const url of sources) {
    try {
      const response = await fetchUpstream(url, {redirect: 'error', signal: AbortSignal.timeout(10000)});
      if (!response.ok) continue;
      let body = await response.arrayBuffer();
      if (extension === 'hea') {
        const lines = new TextDecoder().decode(body).split(/\r?\n/);
        if (!new RegExp(`^${id}_lr\\s+12\\s+100(?:\\s|$)`).test(lines[0]) || lines.length < 13) continue;
        body = new TextEncoder().encode(lines.slice(0, 13).join('\n') + '\n');
      } else if (body.byteLength !== 24000) continue;
      return new Response(body, {headers: {
        'Content-Type': extension === 'hea' ? 'text/plain; charset=utf-8' : 'application/octet-stream',
        'Cache-Control': 'public, max-age=604800',
        'X-Content-Type-Options': 'nosniff',
      }});
    } catch {}
  }
  return new Response('Джерела тимчасово недоступні. Спробуй ще раз.', {status: 502});
}
