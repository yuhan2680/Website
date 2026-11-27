import assert from 'node:assert/strict';
import test from 'node:test';
import {createHandler} from '../server/app.js';
import {localDatabase} from '../scripts/local-d1.js';
import {HttpError} from '../server/http.js';

test('saved owner settings appear on their public pages and keep existing routes and comments', async t => {
  const {binding,sqlite}=localDatabase();
  t.after(()=>sqlite.close());
  const origin='https://preview.example';
  const env={blog_comments:binding};
  const handle=createHandler({authenticate:async request=>{
    if (!request.headers.has('Authorization')) throw new HttpError(401,'请先登录后台');
    return {csrf:'test',email:'owner@example.invalid'};
  }});
  function call(path,method='GET',body,headers={}) {
    return handle(new Request(origin+path,{
      method,headers:{Origin:origin,Authorization:'local-test','Content-Type':'application/json','X-CSRF-Token':'test',...headers},
      body:body===undefined?undefined:JSON.stringify(body)
    }),env);
  }
  const page=async path=>{
    const response=await call(path);
    assert.equal(response.status,200,path);
    return response.text();
  };
  const updates={
    profile:{name:'作者 A',tags:['读书'],learning:['英语口语'],aboutTitle:'个人简介',aboutMarkdown:'**作者近况**',avatar:'/media/profile.png'},
    donations:{items:[{name:'支持开源',url:'https://example.org/support'}]},
    projects:{items:[{name:'新作品',description:'新简介',cover:'/assets/images/level-c1366.jpg',url:'/about',platform:'下载'}]}
  };
  for (const [key,changes] of Object.entries(updates)) {
    const path='/admin/api/'+key;
    assert.equal((await handle(new Request(origin+path),env)).status,401);
    const record=(await (await call(path)).json())[key];
    assert.equal((await call(path,'PUT',{...record,...changes},{'X-CSRF-Token':''})).status,403);
    const updated=await call(path,'PUT',{...record,...changes});
    assert.equal(updated.status,200,await updated.clone().text());
    assert.equal((await updated.json())[key].version,record.version+1);
    assert.match(await page('/admin/'+key),/aria-current="page"/);
  }
  const home=await page('/');
  for (const text of ['作者 A','读书','英语口语','新作品','新简介','请支持我制作开源项目谢谢~']) assert.ok(home.includes(text),text);
  assert.doesNotMatch(home,/class="project-card[^"]*" href="https:\/\/store.steampowered.com/);
  assert.match(home,/点此阅读/);
  assert.doesNotMatch(home,/继续阅读/);
  const blog=await page('/blog');
  assert.match(blog,/点此阅读/);
  assert.doesNotMatch(blog,/继续阅读/);
  assert.match(blog,/<button type="submit">搜索<\/button>/);
  const searchResults=await (await call('/api/posts?q='+encodeURIComponent('第一篇'))).json();
  assert.match(searchResults.html,/点此阅读/);
  const about=await page('/about');
  assert.match(about,/<h1>个人简介<\/h1>/);
  assert.match(about,/<strong>作者近况<\/strong>/);
  const donations=await page('/donate');
  assert.match(donations,/href="https:\/\/example.org\/support">支持开源/);
  assert.match(donations,/data-post-id="donate"/);
  const friends=await page('/friendlinks');
  assert.ok(friends.includes(origin+'/media/profile.png'));
  for (const html of [home,about,donations,friends,await page('/blog'),await page('/posts/post3')]) {
    assert.ok(!html.includes('© 2026 小涵 Naiwenel'));
  }
  for (const path of ['/about','/donate']) {
    assert.equal(await (await call(path,'HEAD')).text(),'');
    assert.equal((await call(path+'.html')).headers.get('Location'),path);
  }
});
