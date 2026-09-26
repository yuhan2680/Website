import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHandler,handleRequest} from '../server/app.js';
import {HttpError,readBytes} from '../server/http.js';
import {localImages} from '../scripts/local-images.js';
import {MAX_IMAGE_BYTES} from '../server/media.js';

const origin='https://naiwenel.com';
const png=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='),character=>character.charCodeAt(0));
const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g"><stop stop-color="#237"/></linearGradient></defs><style>.shape{stroke:#4c9}</style><circle class="shape" cx="50" cy="50" r="40" fill="url(#g)"/></svg>';
function fixture() {
  const env={BLOG_IMAGES:localImages()};
  const handle=createHandler({authenticate:async request=>{
    if(request.headers.get('Authorization')!=='test-owner')throw new HttpError(401,'请先登录后台');
    return {email:'owner@example.invalid',csrf:'test-csrf'};
  }});
  function upload(content,name,headers={}) {
    const form=new FormData();form.append('file',new Blob([content]),name);
    return handle(new Request(origin+'/admin/api/media',{method:'POST',body:form,headers:{Authorization:'test-owner',Origin:origin,'X-CSRF-Token':'test-csrf',...headers}}),env);
  }
  const get=(path,options)=>handle(new Request(origin+path,options),env);
  return {env,upload,get};
}

test('JPG, PNG and SVG upload once and return stable, correctly typed image URLs',async()=>{
  const f=fixture(),jpg=await readFile(new URL('../assets/images/avatar-logo.jpg',import.meta.url));
  for(const [content,name,type] of [[jpg,'头像.JPEG','image/jpeg'],[png,'截图.png','image/png'],[svg,'图表.svg','image/svg+xml']]) {
    const response=await f.upload(content,name);assert.equal(response.status,201,await response.clone().text());
    const {image}=await response.json();assert.match(image.url,/^\/media\/\d{4}\/\d{2}\/[a-f\d-]+\.(jpg|png|svg)$/);
    assert.equal(image.name,name);assert.equal(image.type,type);
    const publicImage=await f.get(image.url);assert.equal(publicImage.status,200);assert.equal(publicImage.headers.get('Content-Type'),type);
    assert.deepEqual(new Uint8Array(await publicImage.arrayBuffer()),typeof content==='string'?new TextEncoder().encode(content):new Uint8Array(content));
    assert.equal(publicImage.headers.get('X-Content-Type-Options'),'nosniff');assert.match(publicImage.headers.get('Content-Security-Policy'),/^sandbox;/);
    const head=await f.get(image.url,{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');assert.equal(Number(head.headers.get('Content-Length')),image.size);
    for(const method of ['GET','HEAD']) {
      const cached=await f.get(image.url,{method,headers:{'If-None-Match':head.headers.get('ETag')}});assert.equal(cached.status,304);assert.equal(await cached.text(),'');
    }
    assert.equal((await f.get(image.url,{headers:{'If-None-Match':'"different"'}})).status,200);
  }
  const a=await (await f.upload(png,'same.png')).json(),b=await (await f.upload(png,'same.png')).json();
  assert.notEqual(a.image.url,b.image.url);
});

test('image uploads require existing owner authentication and same-origin CSRF protection',async()=>{
  const f=fixture();
  for(const [headers,status] of [[{Authorization:''},401],[{Origin:'https://other.example'},403],[{'X-CSRF-Token':''},403],[{'Sec-Fetch-Site':'cross-site'},403]])assert.equal((await f.upload(png,'test.png',headers)).status,status);
  assert.equal((await f.get('/admin/api/media')).status,401);
  const env={ACCESS_TEAM_DOMAIN:'https://example-team.cloudflareaccess.com',ACCESS_AUD:'test-audience',ADMIN_EMAIL:'owner@example.invalid',BLOG_IMAGES:{put(){throw new Error('must not store');}}};
  const form=new FormData();form.append('file',new Blob([png]),'test.png');
  assert.equal((await handleRequest(new Request(origin+'/admin/api/media',{method:'POST',body:form}),env)).status,401);
});

test('invalid and oversized images, path traversal, SVG scripts and external references are rejected',async()=>{
  const f=fixture();
  for(const [content,name,status] of [
    [png,'fake.jpg',400],['<html>not an image</html>','fake.png',400],['','empty.png',400],[png,'image.gif',415],
    [new Uint8Array(MAX_IMAGE_BYTES+1),'large.png',413],[new Uint8Array(1024*1024+1),'large.svg',413],
    ['<svg>missing namespace</svg>','bad.svg',400],['<svg xmlns="http://www.w3.org/2000/svg"><g></svg>','bad.svg',400]
  ]) assert.equal((await f.upload(content,name)).status,status,name);
  const attacks=['<script>alert(1)</script>','<foreignObject><div>html</div></foreignObject>','<circle onload="alert(1)"/>','<use href="https://evil.invalid/x.svg#x"/>','<a href="javascript:alert(1)"><text>x</text></a>','<set attributeName="onload" to="alert(1)"/>','<image href="data:image/svg+xml;base64,ZXZpbA=="/>','<image href="&#106;avascript:alert(1)"/>'];
  for(const attack of attacks)assert.equal((await f.upload('<svg xmlns="http://www.w3.org/2000/svg">'+attack+'</svg>','unsafe.svg')).status,400,attack);
  assert.equal((await f.upload('<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///private">]>'+svg,'entity.svg')).status,400);
  assert.equal((await f.upload('<?xml-stylesheet href="https://evil.invalid/style.css"?>'+svg,'style.svg')).status,400);
  const uploaded=await (await f.upload(png,'../目录/截图.png')).json();assert.equal(uploaded.image.name,'截图.png');assert.doesNotMatch(uploaded.image.url,/目录|截图|\.\./);
  for(const path of ['/media/anything.svg','/media/2026/13/00000000-0000-0000-0000-000000000000.png','/media/2026/09/00000000-0000-0000-0000-000000000000.png']) {
    const response=await f.get(path);assert.equal(response.status,404);assert.match(response.headers.get('Content-Type'),/text\/plain/);assert.equal(response.headers.get('Cache-Control'),'no-store');
  }
});

test('streamed uploads are bounded without trusting Content-Length; storage failures return a useful error',async()=>{
  let cancelled=false;
  const body=new ReadableStream({pull(controller){controller.enqueue(new Uint8Array(1024));},cancel(){cancelled=true;}});
  await assert.rejects(readBytes(new Request(origin,{method:'POST',body,duplex:'half'}),2048),{status:413});assert.equal(cancelled,true);
  const f=fixture();delete f.env.BLOG_IMAGES;
  const unavailable=await f.upload(png,'image.png');assert.equal(unavailable.status,503);assert.match((await unavailable.json()).msg,/图片存储/);
  const routes=JSON.parse(await readFile(new URL('../dist/_routes.json',import.meta.url),'utf8'));assert.ok(routes.include.includes('/media/*'));
});
