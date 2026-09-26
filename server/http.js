export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export const securityHeaders = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'"
};
export function json(data, status = 200, headers = {}) {
  return Response.json(data, {status, headers: {...securityHeaders, ...headers}});
}
export function html(content, status = 200, headers = {}) {
  return new Response(content, {status, headers: {...securityHeaders, 'Content-Type':'text/html; charset=utf-8', ...headers}});
}
export function escape(value = '') {
  return String(value).replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
}
export async function readJson(request, maxBytes = 262144) {
  if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new HttpError(415,'请提交 JSON 格式数据');
  if (Number(request.headers.get('Content-Length')) > maxBytes) throw new HttpError(413,'文章内容过大');
  if (!request.body) throw new HttpError(400,'缺少提交内容');
  const reader = request.body.getReader(), chunks = [];
  let size = 0;
  try {
    while (true) {
      const {done,value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new HttpError(413,'文章内容过大'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.byteLength; }
  try {
    const data = JSON.parse(new TextDecoder().decode(bytes));
    if (!data || Array.isArray(data) || typeof data !== 'object') throw new Error();
    return data;
  } catch { throw new HttpError(400,'提交内容格式无效'); }
}
