// Local preview only. The database stays in memory and never touches production D1.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { onRequest } from '../functions/api/comments.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const database = new DatabaseSync(':memory:');
database.exec('CREATE TABLE comments (id INTEGER PRIMARY KEY AUTOINCREMENT, post_id TEXT NOT NULL, nickname TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL); CREATE INDEX comments_post_id_id ON comments(post_id, id DESC);');
const env = { blog_comments: { prepare(sql) { return { bind(...args) { const statement = database.prepare(sql); return {
  async all() { return { results: statement.all(...args) }; },
  async run() { return { meta: { changes: Number(statement.run(...args).changes) } }; }
}; } }; } } };
const types = { '.html':'text/html; charset=utf-8', '.css':'text/css', '.js':'text/javascript', '.json':'application/json', '.xml':'application/xml', '.txt':'text/plain', '.jpg':'image/jpeg', '.png':'image/png', '.webp':'image/webp', '.svg':'image/svg+xml', '.moc3':'application/octet-stream' };
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1:4173');
    if (url.pathname === '/api/comments') {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const request = new Request(url, { method: req.method, headers: req.headers, ...(!['GET','HEAD'].includes(req.method) ? { body: Buffer.concat(chunks) } : {}) });
      const response = await onRequest({ request, env });
      res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer())); return;
    }
    const pathname = decodeURIComponent(url.pathname);
    let file = resolve(root, '.' + pathname);
    if (!file.startsWith(root) || pathname.split('/').some(part => part.startsWith('.')) || /^\/(functions|scripts|tests|archive|template)\//.test(pathname)) {
      res.writeHead(404); res.end('Not found'); return;
    }
    if (pathname === '/') file = resolve(root, 'index.html');
    else if (!extname(file)) file += '.html';
    let status = 200, data;
    try { if (!(await stat(file)).isFile()) throw new Error(); data = await readFile(file); }
    catch { status = 404; file = resolve(root, '404.html'); data = await readFile(file); }
    res.writeHead(status, { 'Content-Type':types[extname(file)] || 'application/octet-stream', 'Cache-Control':'no-store' });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch { res.writeHead(500); res.end('Local preview error'); }
});
server.listen(4173, '127.0.0.1', () => console.log('Preview: http://127.0.0.1:4173 (temporary local comments database)'));
