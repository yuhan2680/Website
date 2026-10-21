import test from 'node:test';
import assert from 'node:assert/strict';
import {localDatabase} from '../scripts/local-d1.js';
import {onRequest} from '../functions/api/comments.js';

function fixture(t) {
  const {sqlite,binding} = localDatabase();
  t.after(() => sqlite.close());
  // Match the pre-existing production table: the new limiter must migrate safely.
  sqlite.exec('CREATE TABLE comments (id INTEGER PRIMARY KEY AUTOINCREMENT, post_id TEXT NOT NULL, nickname TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL)');
  const env = {blog_comments:binding};
  const post = (content,ip='192.0.2.1',options={}) => onRequest({env:options.env || env,request:new Request(
    'https://naiwenel.com/api/comments?post='+(options.post || 'index'),
    {method:'POST',headers:{'Content-Type':'application/json',...(ip?{'CF-Connecting-IP':ip}:{}),...options.headers},
      body:JSON.stringify({nickname:options.nickname || 'visitor',content})})});
  const count = table => Number(sqlite.prepare('SELECT COUNT(*) n FROM '+table).get().n);
  return {sqlite,binding,env,post,count};
}

test('varied content and concurrent submissions share one server-side client limit',async t=>{
  const f=fixture(t);
  const responses=await Promise.all(Array.from({length:12},(_,i)=>f.post('different '+i)));
  assert.equal(responses.filter(r=>r.status===201).length,1);
  assert.equal(responses.filter(r=>r.status===429).length,11);
  assert.equal(f.count('comments'),1);assert.equal(f.count('comment_submissions'),1);
  for(const response of responses.filter(r=>r.status===429)) {
    assert.equal(response.headers.get('Cache-Control'),'no-store');
    assert.ok(Number(response.headers.get('Retry-After'))>=1);
  }
  assert.equal((await f.post('different identity fields','192.0.2.1',{post:'post3',nickname:'changed'})).status,429);
  assert.equal((await f.post('a separate visitor','192.0.2.2')).status,201);
});

test('per-client window survives a new binding and uses the database rather than process memory',async t=>{
  t.mock.timers.enable({apis:['Date'],now:1800000000000});
  const f=fixture(t), now=Date.now();
  for(let i=0;i<5;i++) {
    t.mock.timers.setTime(now+i*10000);
    // A different wrapper simulates a separate Pages instance using the same D1.
    const env={blog_comments:{prepare:f.binding.prepare,batch:f.binding.batch}};
    assert.equal((await f.post('entry '+i,'192.0.2.1',{env})).status,201);
  }
  t.mock.timers.setTime(now+50000);
  const limited=await f.post('over the window');assert.equal(limited.status,429);
  assert.equal(limited.headers.get('Retry-After'),'550');
  t.mock.timers.setTime(now+600000);
  assert.equal((await f.post('window opened again')).status,201);
  assert.equal(f.count('comment_limit_secret'),1);
});

test('untrusted forwarding headers cannot change identity and IPv6 addresses share a /64 budget',async t=>{
  const f=fixture(t);
  assert.equal((await f.post('first','2001:db8:1234:5678::1')).status,201);
  assert.equal((await f.post('rotated','2001:0db8:1234:5678:abcd::2')).status,429);
  assert.equal((await f.post('other network','2001:db8:1234:5679::1')).status,201);
  assert.equal((await f.post('no header',null,{headers:{'X-Forwarded-For':'198.51.100.1'}})).status,201);
  assert.equal((await f.post('forged header',null,{headers:{'X-Forwarded-For':'198.51.100.2','X-Real-IP':'198.51.100.3'}})).status,429);
  assert.equal((await f.post('invalid edge header','not-an-ip')).status,429);
  const keys=f.sqlite.prepare('SELECT client_key FROM comment_submissions').all();
  for(const row of keys)assert.match(row.client_key,/^[a-f0-9]{64}$/);
  assert.ok(!JSON.stringify(keys).includes('2001:'));
});

test('global hourly budget admits only the remaining slot, including across clients',async t=>{
  t.mock.timers.enable({apis:['Date'],now:1800000000000});
  const f=fixture(t), now=Date.now();
  assert.equal((await f.post('initialize')).status,201);
  const seed=f.sqlite.prepare('INSERT INTO comment_submissions (id,client_key,created_at) VALUES (?,?,?)');
  for(let i=0;i<198;i++)seed.run('seed-'+i,'other-'+i,now-1000);
  const responses=await Promise.all([f.post('last slot','192.0.2.2'),f.post('no slot','192.0.2.3')]);
  assert.deepEqual(responses.map(r=>r.status).sort(),[201,429]);
  assert.equal(responses.find(r=>r.status===429).headers.get('Retry-After'),'3599');
  assert.equal(f.count('comment_submissions'),200);assert.equal(f.count('comments'),2);
  t.mock.timers.setTime(now+3600000);
  assert.equal((await f.post('next hour','192.0.2.4')).status,201);
});

test('global daily budget and cleanup bound admission storage without deleting comments',async t=>{
  t.mock.timers.enable({apis:['Date'],now:1800000000000});
  const f=fixture(t), now=Date.now();
  assert.equal((await f.post('initialize')).status,201);
  const seed=f.sqlite.prepare('INSERT INTO comment_submissions (id,client_key,created_at) VALUES (?,?,?)');
  for(let i=0;i<999;i++)seed.run('seed-'+i,'other-'+i,now-7200000);
  const blocked=await f.post('daily cap','192.0.2.2');assert.equal(blocked.status,429);
  assert.equal(blocked.headers.get('Retry-After'),'79200');
  assert.equal(f.count('comment_submissions'),1000);
  t.mock.timers.setTime(now+86400000);
  assert.equal((await f.post('expired window','192.0.2.2')).status,201);
  assert.equal(f.count('comment_submissions'),1);assert.equal(f.count('comments'),2);
});

test('failed writes roll back admission; existing schema, comments and identifiers are preserved',async t=>{
  const f=fixture(t);
  f.sqlite.prepare('INSERT INTO comments VALUES (?,?,?,?,?)').run(42,'post3','old','existing comment','2026-01-01T00:00:00.000Z');
  const schema=f.sqlite.prepare("SELECT sql FROM sqlite_master WHERE name='comments'").get().sql;
  assert.equal((await f.post('first')).status,201);
  f.sqlite.exec("CREATE TRIGGER reject_test_comment BEFORE INSERT ON comments BEGIN SELECT RAISE(ABORT, 'test failure'); END");
  assert.equal((await f.post('storage failure','192.0.2.2')).status,503);
  assert.equal(f.count('comment_submissions'),1);
  f.sqlite.exec('DROP TRIGGER reject_test_comment');
  assert.equal((await f.post('storage recovered','192.0.2.2')).status,201);
  assert.equal(f.sqlite.prepare("SELECT sql FROM sqlite_master WHERE name='comments'").get().sql,schema);
  assert.equal(f.sqlite.prepare('SELECT content FROM comments WHERE id=42').get().content,'existing comment');
  assert.ok(f.sqlite.prepare("SELECT name FROM sqlite_master WHERE name='comments_post_created'").get());
});

test('failed limiter initialization never admits writes and can recover on the next request',async t=>{
  const f=fixture(t);let unavailable=true;
  const env={blog_comments:{prepare:f.binding.prepare,batch:statements=>{
    if(unavailable)return Promise.reject(new Error('database unavailable'));
    return f.binding.batch(statements);
  }}};
  assert.equal((await f.post('blocked','192.0.2.1',{env})).status,503);assert.equal(f.count('comments'),0);
  unavailable=false;
  assert.equal((await f.post('recovered','192.0.2.1',{env})).status,201);
});
