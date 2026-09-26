import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import {localDatabase} from '../scripts/local-d1.js';
import {createHandler,handleRequest} from '../server/app.js';
import {authenticateAdmin} from '../server/auth.js';
import {HttpError} from '../server/http.js';
import {database} from '../server/posts.js';
import {generateKeyPair,exportJWK,createLocalJWKSet,SignJWT} from 'jose';

const origin='https://naiwenel.com';
const article={title:'新的开发记录',slug:'development-note',excerpt:'开发过程',category:'游戏开发',markdown:'## 内容\n\n正文里有测试关卡。',status:'draft'};
async function fixture(t) {
  const {sqlite,binding}=localDatabase();
  t.after(()=>sqlite.close());
  sqlite.exec(await readFile(new URL('../database/comments.sql',import.meta.url),'utf8'));
  const env={blog_comments:binding,ASSETS:{fetch:async()=>new Response('not found',{status:404})}};
  const handle=createHandler({authenticate:async request=>{
    if(request.headers.get('Authorization')!=='test-owner')throw new HttpError(401,'请先登录后台');
    return {email:'owner@example.invalid',csrf:'test-csrf'};
  }});
  const call=(path,method='GET',body,extra={})=>handle(new Request(origin+path,{method,headers:{Authorization:'test-owner',Origin:origin,'X-CSRF-Token':'test-csrf','Content-Type':'application/json',...extra},...(body===undefined?{}:{body:typeof body==='string'?body:JSON.stringify(body)})}),env);
  const save=async(post,status=201)=>{const response=await call('/admin/api/posts','POST',post);assert.equal(response.status,status,await response.clone().text());return (await response.json()).post;};
  const update=async(post,changes={},status=200)=>{const response=await call('/admin/api/posts/'+post.id,'PUT',{...post,...changes});assert.equal(response.status,status,await response.clone().text());return (await response.json()).post;};
  return {sqlite,env,call,save,update};
}

test('migration imports legacy articles once and preserves home layout, comments and links',async t=>{
  const f=await fixture(t);
  const before=f.sqlite.prepare("SELECT sql FROM sqlite_master WHERE name='comments'").get().sql;
  const response=await f.call('/');
  assert.equal(response.status,200);
  const home=await response.text();
  assert.match(home,/小涵Naiwenel/);assert.match(home,/这里是小涵，希望你天天开心哦~/);assert.match(home,/项目及作品/);
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM posts').get().n,4);
  assert.equal(f.sqlite.prepare("SELECT sql FROM sqlite_master WHERE name='comments'").get().sql,before);
  await database({blog_comments:{prepare:f.env.blog_comments.prepare,batch:f.env.blog_comments.batch}});
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM posts').get().n,4);
  const redirect=await f.call('/posts/post3.html');assert.equal(redirect.status,301);assert.equal(redirect.headers.get('Location'),'/posts/post3');
  const post=await (await f.call('/posts/post3')).text();assert.match(post,/data-post-id="post3"/);
  const feed=await (await f.call('/rss.xml')).text();assert.match(feed,/https:\/\/naiwenel.com\/posts\/post3.html/);
  for(const path of ['dist/posts/post3.html','dist/template/admin.html','dist/server/app.js'])await assert.rejects(access(new URL('../'+path,import.meta.url)));
});

test('served admin HTML loads current, versioned assets present in the deployment',async t=>{
  const f=await fixture(t);
  const response=await f.call('/admin');assert.equal(response.status,200);
  const html=await response.text();
  for(const [directory,extension] of [['js','js'],['css','css']]) {
    const path=html.match(new RegExp(`/assets/${directory}/admin\\.[a-f0-9]{12}\\.${extension}`))?.[0];
    assert.ok(path,`admin ${extension} URL must change when its content changes`);
    const deployed=await readFile(new URL('../dist'+path,import.meta.url));
    const current=await readFile(new URL(`../assets/${directory}/admin.${extension}`,import.meta.url));
    assert.deepEqual(deployed,current,`deployed ${extension} must match the current editor`);
    assert.ok(!html.includes(`"/assets/${directory}/admin.${extension}"`),'must not reuse the stale browser cache URL');
  }
});

test('draft, publish, withdrawal, trash and restore control every public surface',async t=>{
  const f=await fixture(t);let post=await f.save(article);
  assert.equal((await f.call('/posts/'+post.slug)).status,404);
  for(const path of ['/','/blog','/api/posts?status=draft','/rss.xml','/sitemap.xml'])assert.doesNotMatch(await (await f.call(path)).text(),/development-note/);
  post=await f.update(post,{status:'published'});const published=post.published_at;
  for(const path of ['/','/blog','/api/posts','/rss.xml','/sitemap.xml'])assert.match(await (await f.call(path)).text(),/development-note/);
  const search=await (await f.call('/api/posts?q='+encodeURIComponent('测试关卡')+'&category='+encodeURIComponent('游戏开发'))).json();
  assert.equal(search.total,1);assert.equal(search.items[0].id,post.id);assert.equal(search.items[0].markdown,undefined);
  assert.match(await (await f.call('/posts/'+post.slug)).text(),new RegExp('data-post-id="'+post.id+'"'));
  post=await f.update(post,{status:'draft'});
  assert.equal((await f.call('/posts/'+post.slug+'.html')).status,404);
  assert.equal((await f.call('/posts/'+post.slug)).status,404);
  assert.doesNotMatch(await (await f.call('/rss.xml')).text(),/development-note/);
  post=await f.update(post,{status:'trash'});
  assert.equal((await (await f.call('/admin/api/posts?status=trash')).json()).total,1);
  assert.doesNotMatch(await (await f.call('/admin/api/posts')).text(),/development-note/);
  post=await f.update(post,{status:'draft'});assert.equal(post.markdown,article.markdown);assert.equal(post.published_at,published);
  const exported=await (await f.call('/admin/api/export')).json();assert.equal(exported.posts.length,5);
  const legacy=(await (await f.call('/admin/api/posts/post3')).json()).post;await f.update(legacy,{status:'draft'});
  assert.equal((await f.call('/posts/post3.html')).status,404);
});

test('revision checks and stable published URLs prevent overwrites and broken links',async t=>{
  const f=await fixture(t);const original=await f.save(article);
  let latest=await f.update(original,{title:'已保存的标题'});
  await f.update(original,{title:'过期编辑'},409);
  assert.equal((await (await f.call('/admin/api/posts/'+latest.id)).json()).post.title,'已保存的标题');
  latest=await f.update(latest,{slug:'final-draft-url',status:'published'});assert.equal(latest.rss_guid,origin+'/posts/final-draft-url');await f.update(latest,{slug:'changed-url'},409);
  await f.save({...article,slug:latest.slug,title:'重复地址'},409);await f.save({...article,slug:'../admin'},400);
});

test('mutations reject cross-site requests and unsafe or oversized input; Markdown is escaped',async t=>{
  const f=await fixture(t);
  for(const headers of [{'X-CSRF-Token':''},{Origin:'https://other.example'},{'Sec-Fetch-Site':'cross-site'}])assert.equal((await f.call('/admin/api/posts','POST',article,headers)).status,403);
  assert.equal((await f.call('/admin/api/posts','POST','{')).status,400);
  assert.equal((await f.call('/admin/api/posts','POST',article,{'Content-Type':'text/plain'})).status,415);
  assert.equal((await f.call('/admin/api/posts','POST',{...article,markdown:'a'.repeat(270000)})).status,413);
  const post=await f.save({...article,title:'<img src=x onerror=alert(1)>',status:'published',markdown:'<script>alert(1)</script>\n\n[bad](javascript:alert(1))\n\n![bad](data:text/html,evil)'});
  const body=await (await f.call('/posts/'+post.slug)).text();assert.doesNotMatch(body,/<script>alert\(1\)<\/script>|href="javascript:|src="data:text\/html|<img src=x onerror/);assert.match(body,/&lt;script&gt;/);
  assert.equal((await (await f.call('/api/posts?q=%25')).json()).total,0);
  assert.equal((await f.call('/admin/api/posts','GET',undefined,{Authorization:''})).status,401);
});

test('production handler fails closed before accessing database when login is not configured',async t=>{
  const f=await fixture(t);
  for(const path of ['/admin','/admin/','/admin.html','/admin/api/posts','/admin/api/export']) {
    const result=await handleRequest(new Request(origin+path),f.env);assert.equal(result.status,503);assert.equal(result.headers.get('Cache-Control'),'no-store');
  }
  assert.equal(f.sqlite.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name='posts'").get().n,0);
});

test('Access validates signature, issuer, audience, expiry and exact owner email',async()=>{
  const pair=await generateKeyPair('RS256');const jwk=await exportJWK(pair.publicKey);jwk.kid='test-key';
  const keys=createLocalJWKSet({keys:[jwk]});
  const env={ACCESS_TEAM_DOMAIN:'https://example-team.cloudflareaccess.com',ACCESS_AUD:'test-audience',ADMIN_EMAIL:'owner@example.invalid'};
  const token=async(overrides={},key=pair.privateKey)=>new SignJWT({email:env.ADMIN_EMAIL,...overrides}).setProtectedHeader({alg:'RS256',kid:jwk.kid}).setIssuer(overrides.iss||env.ACCESS_TEAM_DOMAIN).setAudience(overrides.aud||env.ACCESS_AUD).setSubject('owner').setIssuedAt().setExpirationTime(overrides.exp||'5m').sign(key);
  const request=value=>new Request(origin+'/admin',{headers:{'Cf-Access-Jwt-Assertion':value}});
  const identity=await authenticateAdmin(request(await token()),env,keys);assert.equal(identity.email,env.ADMIN_EMAIL);assert.equal(identity.csrf.length,64);
  for(const overrides of [{iss:'https://other.cloudflareaccess.com'},{aud:'another-app'},{exp:Math.floor(Date.now()/1000)-60},{email:'someone-else@example.invalid'}])await assert.rejects(authenticateAdmin(request(await token(overrides)),env,keys));
  const impostor=await generateKeyPair('RS256');await assert.rejects(authenticateAdmin(request(await token({},impostor.privateKey)),env,keys));
  await assert.rejects(authenticateAdmin(new Request(origin+'/admin',{headers:{'Cf-Access-Authenticated-User-Email':env.ADMIN_EMAIL}}),env,keys));
});
