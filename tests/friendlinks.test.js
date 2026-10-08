import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import {localDatabase} from '../scripts/local-d1.js';
import {createHandler,handleRequest} from '../server/app.js';
import {friendDatabase} from '../server/friendlinks.js';
import {initialFriendlinks} from '../database/initial-friendlinks.js';
import {HttpError} from '../server/http.js';

const origin='https://naiwenel.com';
const sample={name:'测试网站',url:'https://friend.example/',avatar:'/assets/images/avatar-logo.jpg',description:'网站简介',sort_order:5,status:'active'};
async function fixture(t) {
  const {sqlite,binding}=localDatabase();t.after(()=>sqlite.close());
  sqlite.exec(await readFile(new URL('../database/comments.sql',import.meta.url),'utf8'));
  const env={blog_comments:binding,ASSETS:{fetch:async()=>new Response('static fallback',{status:404})}};
  const handle=createHandler({authenticate:async request=>{
    if(request.headers.get('Authorization')!=='test-owner')throw new HttpError(401,'请先登录后台');
    return {email:'owner@example.invalid',csrf:'test-csrf'};
  }});
  const call=(path,method='GET',body,headers={})=>handle(new Request(origin+path,{method,headers:{Authorization:'test-owner',Origin:origin,'X-CSRF-Token':'test-csrf','Content-Type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})}),env);
  const list=async(status='active')=>(await (await call('/admin/api/friendlinks?status='+status)).json()).items;
  const save=async(input=sample,status=201)=>{const response=await call('/admin/api/friendlinks','POST',input);assert.equal(response.status,status,await response.clone().text());return (await response.json()).friendlink;};
  const update=async(link,changes={},status=200)=>{const response=await call('/admin/api/friendlinks/'+link.id,'PUT',{...link,...changes});assert.equal(response.status,status,await response.clone().text());return (await response.json()).friendlink;};
  return {sqlite,env,call,list,save,update};
}

test('friend migration imports all nine original links once and preserves edited links, articles and comments',async t=>{
  const f=await fixture(t);
  const originalComments=f.sqlite.prepare("SELECT sql FROM sqlite_master WHERE name='comments'").get().sql;
  await f.call('/');
  const originalPosts=f.sqlite.prepare('SELECT * FROM posts ORDER BY id').all();
  const links=await f.list();assert.equal(links.length,9);
  assert.deepEqual(links.map(x=>[x.name,x.url,x.avatar,x.description,x.sort_order]),initialFriendlinks.map(x=>[x.name,new URL(x.url).href,x.avatar,x.description,x.sort_order]));
  const edited=await f.update(links[0],{name:'修改后的名称',sort_order:999});
  await f.update(links[1],{status:'trash'});
  await friendDatabase({blog_comments:{prepare:f.env.blog_comments.prepare,batch:f.env.blog_comments.batch}});
  assert.equal((await f.list()).length,8);
  assert.equal((await f.list('trash'))[0].id,links[1].id);
  assert.equal((await f.list()).find(x=>x.id===edited.id).name,'修改后的名称');
  assert.deepEqual(f.sqlite.prepare('SELECT * FROM posts ORDER BY id').all(),originalPosts);
  assert.equal(f.sqlite.prepare("SELECT sql FROM sqlite_master WHERE name='comments'").get().sql,originalComments);
  assert.deepEqual(f.sqlite.prepare('SELECT version FROM blog_migrations ORDER BY version').all().map(x=>x.version),[1,2]);
});

test('create, edit, reorder, trash and restore immediately update the public page and preserve its comments',async t=>{
  const f=await fixture(t);let link=await f.save();
  let page=await (await f.call('/friendlinks')).text();
  assert.ok(page.indexOf('<h2>测试网站</h2>')<page.indexOf('<h2>yuhan2680</h2>'));
  assert.match(page,/data-post-id="friendlinks"/);assert.match(page,/id="commentForm"/);assert.match(page,/友链留言/);
  assert.ok(!page.includes('__FRIEND_LINKS__'));
  link=await f.update(link,{name:'更新的友链',description:'修改后的简介',sort_order:999});
  page=await (await f.call('/friendlinks')).text();
  assert.ok(page.indexOf('<h2>更新的友链</h2>')>page.indexOf('<h2>Alumopper泠雪</h2>'));assert.match(page,/修改后的简介/);
  link=await f.update(link,{status:'trash'});
  assert.doesNotMatch(await (await f.call('/friendlinks')).text(),/更新的友链/);
  assert.equal((await f.list('trash'))[0].id,link.id);
  link=await f.update(link,{status:'active'});
  assert.match(await (await f.call('/friendlinks')).text(),/更新的友链/);
  const search=await (await f.call('/admin/api/friendlinks?q='+encodeURIComponent('修改后的'))).json();assert.equal(search.items.length,1);
  assert.equal((await f.call('/friendlinks')).headers.get('Cache-Control'),'no-store');
  const head=await f.call('/friendlinks','HEAD');assert.equal(head.status,200);assert.equal(await head.text(),'');
  for(const path of ['/friendlinks.html','/friendlinks/']){const response=await f.call(path);assert.equal(response.status,301);assert.equal(response.headers.get('Location'),'/friendlinks');}
  const exported=await (await f.call('/admin/api/friendlinks/export')).json();assert.equal(exported.friendlinks.length,10);
});

test('friend mutations and export retain owner authentication and same-origin CSRF checks',async t=>{
  const f=await fixture(t);
  for(const path of ['/admin/friendlinks','/admin/friendlinks/','/admin/api/friendlinks','/admin/api/friendlinks/export','/admin/api/friendlinks/legacy-friend-1'])assert.equal((await f.call(path,'GET',undefined,{Authorization:''})).status,401);
  for(const [headers,status] of [[{Authorization:''},401],[{Origin:'https://other.example'},403],[{'X-CSRF-Token':''},403],[{'Sec-Fetch-Site':'cross-site'},403]])assert.equal((await f.call('/admin/api/friendlinks','POST',sample,headers)).status,status);
  assert.equal((await f.list()).length,9);
  const env={ACCESS_TEAM_DOMAIN:'https://example-team.cloudflareaccess.com',ACCESS_AUD:'test-audience',ADMIN_EMAIL:'owner@example.invalid'};
  assert.equal((await handleRequest(new Request(origin+'/admin/api/friendlinks'),env)).status,401);
});

test('URL validation, escaping, duplicate detection and revisions prevent unsafe or accidental updates',async t=>{
  const f=await fixture(t);
  for(const change of [{url:'javascript:alert(1)'},{url:'//other.example/'},{url:'https://user:secret@example.com/'},{avatar:'data:image/svg+xml,<svg/>'},{avatar:'/\\evil.example/a.png'},{sort_order:-1},{sort_order:1.5},{sort_order:10000},{name:''},{description:'x'.repeat(301)}])await f.save({...sample,...change},400);
  let link=await f.save({...sample,name:'<script>alert(1)</script>',description:'<img src=x onerror=alert(1)>'});
  const page=await (await f.call('/friendlinks')).text();
  assert.match(page,/&lt;script&gt;alert\(1\)&lt;\/script&gt;/);assert.doesNotMatch(page,/<script>alert|<img src=x/);
  await f.save(sample,409);
  const stale=link;link=await f.update(link,{description:'最新简介'});
  await f.update(stale,{name:'过期修改'},409);
  assert.equal((await (await f.call('/admin/api/friendlinks/'+link.id)).json()).friendlink.description,'最新简介');
  link=await f.update(link,{status:'trash'});await f.save(sample,409);
  assert.equal((await f.call('/admin/api/friendlinks?status=invalid')).status,400);
  assert.equal((await f.call('/admin/api/friendlinks/missing','PUT',{...sample,revision:1})).status,404);
});

test('empty friend lists stay empty after initialization and deployment assets cannot expose the old static cards',async t=>{
  const f=await fixture(t);
  for(const link of await f.list())await f.update(link,{status:'trash'});
  await friendDatabase({blog_comments:{prepare:f.env.blog_comments.prepare,batch:f.env.blog_comments.batch}});
  const page=await (await f.call('/friendlinks')).text();assert.match(page,/暂时没有友情链接/);assert.doesNotMatch(page,/class="friend-card panel"/);assert.match(page,/友链留言/);
  const routes=JSON.parse(await readFile(new URL('../dist/_routes.json',import.meta.url),'utf8'));
  for(const path of ['/friendlinks','/friendlinks/','/friendlinks.html'])assert.ok(routes.include.includes(path));
  for(const path of ['dist/friendlinks.html','dist/database/initial-friendlinks.js','dist/template/admin-friendlinks.html'])await assert.rejects(access(new URL('../'+path,import.meta.url)));
  const admin=await (await f.call('/admin/friendlinks')).text();
  assert.match(admin,/href="\/admin"/);assert.match(admin,/上传头像/);
  const script=admin.match(/src="(\/assets\/js\/admin-friendlinks\.[a-f0-9]{12}\.js)"/)[1];
  assert.deepEqual(await readFile(new URL('../dist'+script,import.meta.url)),await readFile(new URL('../assets/js/admin-friendlinks.js',import.meta.url)));
  assert.match(await (await f.call('/admin')).text(),/href="\/admin\/friendlinks"/);
});
