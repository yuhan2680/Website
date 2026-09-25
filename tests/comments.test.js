import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { onRequest } from '../functions/api/comments.js';

function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE comments (id INTEGER PRIMARY KEY AUTOINCREMENT, post_id TEXT NOT NULL, nickname TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL)');
  const env = { blog_comments: { prepare(sql) { return { bind(...args) { const stmt=db.prepare(sql); return {
    async all() { return {results:stmt.all(...args)}; }, async run() { return {meta:{changes:Number(stmt.run(...args).changes)}}; }
  }; } }; } } };
  const get = (query='post=index') => onRequest({request:new Request('https://naiwenel.com/api/comments?'+query),env});
  const post = (body, headers={}, query='post=index') => onRequest({ request:new Request('https://naiwenel.com/api/comments?'+query,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:typeof body === 'string' ? body : JSON.stringify(body)}),env });
  return {db,env,get,post};
}
test('stores trimmed Unicode comments, preserves literal HTML and returns no-store', async () => {
  const f=fixture(); const response=await f.post({nickname:' 小涵 ',content:' <script>alert(1)</script> 星星 '});
  assert.equal(response.status,201); const result=await f.get(); assert.equal(result.headers.get('Cache-Control'),'no-store');
  const rows=await result.json(); assert.equal(rows[0].nickname,'小涵'); assert.equal(rows[0].content,'<script>alert(1)</script> 星星');
  assert.ok(!Number.isNaN(Date.parse(rows[0].created_at))); f.db.close();
});
test('rejects invalid JSON and non-string fields instead of throwing', async () => {
  const f=fixture(); for (const body of ['null','[]','{bad', {nickname:3,content:'x'}, {nickname:'x',content:{}}, {nickname:' ',content:'x'}]) assert.equal((await f.post(body)).status,400);
  f.db.close();
});
test('enforces lengths and actual streamed body size without Content-Length', async () => {
  const f=fixture(); assert.equal((await f.post({nickname:'x'.repeat(21),content:'x'})).status,400);
  assert.equal((await f.post({nickname:'x',content:'x'.repeat(501)})).status,400);
  assert.equal((await f.post({nickname:'x',content:'x'.repeat(9000)})).status,413);
  assert.equal((await f.post({nickname:'x'.repeat(20),content:'字'.repeat(500)})).status,201); f.db.close();
});
test('rejects cross-origin writes, wrong content type and honeypot', async () => {
  const f=fixture(), data={nickname:'a',content:'b'};
  assert.equal((await f.post(data,{Origin:'https://example.com'})).status,403);
  assert.equal((await f.post(data,{'Sec-Fetch-Site':'cross-site'})).status,403);
  assert.equal((await f.post(data,{'Content-Type':'text/plain'})).status,415);
  assert.equal((await f.post({...data,website:'spam'})).status,400);
  assert.equal((await f.post(data,{Origin:'https://naiwenel.com'})).status,201); f.db.close();
});
test('deduplicates repeated inserts atomically without changing existing schema', async () => {
  const f=fixture(), data={nickname:'visitor',content:'hello'};
  const responses=await Promise.all([f.post(data),f.post(data)]);
  assert.deepEqual(responses.map(r=>r.status).sort(),[201,429]); assert.equal((await (await f.get()).json()).length,1);
  assert.equal(responses.find(r=>r.status===429).headers.get('Retry-After'),'60'); f.db.close();
});
test('paginates newest first, isolates posts, and has no overlaps when new comments arrive', async () => {
  const f=fixture(); for(let i=0;i<25;i++) await f.post({nickname:'v',content:'comment '+i});
  await f.post({nickname:'v',content:'other'}, {}, 'post=post3');
  const first=await f.get(), cursor=first.headers.get('X-Comments-Next-Cursor'), rows=await first.json();
  assert.equal(rows.length,20); assert.equal(rows[0].content,'comment 24');
  await f.post({nickname:'v',content:'new'});
  const second=await f.get('post=index&before='+cursor), tail=await second.json();
  assert.equal(tail.length,5); assert.equal(second.headers.get('X-Comments-Next-Cursor'),null);
  assert.equal(new Set([...rows,...tail].map(r=>r.id)).size,25); f.db.close();
});
test('validates article ids and pagination, including SQL injection strings', async () => {
  const f=fixture(); for (const query of ['',"post='OR1=1",'post=index&limit=0','post=index&limit=51','post=index&before=-1','post=index&before=9007199254740992']) assert.equal((await f.get(query)).status,400);
  f.db.close();
});
test('never exposes database errors and handles missing binding and unsupported methods', async () => {
  const f=fixture(); f.db.close(); const response=await f.get(); assert.equal(response.status,503); assert.equal((await response.json()).error,undefined);
  assert.equal((await onRequest({request:new Request('https://naiwenel.com/api/comments?post=index'),env:{}})).status,503);
  const invalid=await onRequest({request:new Request('https://naiwenel.com/api/comments?post=index',{method:'DELETE'}),env:{}});
  assert.equal(invalid.status,405); assert.equal(invalid.headers.get('Allow'),'GET, POST');
});
