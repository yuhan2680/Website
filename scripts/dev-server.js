// Loopback preview only. Data stays in memory and never touches production D1.
import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {localDatabase} from './local-d1.js';
import {createHandler} from '../server/app.js';

const root = fileURLToPath(new URL('../',import.meta.url));
const output = resolve(root,'dist');
const {sqlite,binding} = localDatabase();
sqlite.exec(await readFile(resolve(root,'database/comments.sql'),'utf8'));
const types = {'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.json':'application/json','.xml':'application/xml','.txt':'text/plain','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.moc3':'application/octet-stream'};
const env = {blog_comments:binding,ASSETS:{async fetch(request) {
  const path = decodeURIComponent(new URL(request.url).pathname);
  let file = resolve(output,'.'+path);
  if (!file.startsWith(output+sep) || path.split('/').some(part=>part.startsWith('.'))) return new Response('Not found',{status:404});
  if (!extname(file)) file += '.html';
  let status=200,data;
  try { if (!(await stat(file)).isFile()) throw new Error(); data=await readFile(file); }
  catch { status=404; file=resolve(output,'404.html'); data=await readFile(file); }
  return new Response(request.method==='HEAD'?null:data,{status,headers:{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-store'}});
}}};
// This dependency injection is confined to the local Node script. The deployed
// handler always verifies Cloudflare Access; it has no development bypass flag.
const handle = createHandler({authenticate:async()=>({email:'local-preview@example.invalid',csrf:'local-preview-only'})});
const server = http.createServer(async(req,res)=>{
  try {
    const chunks=[]; for await (const chunk of req) chunks.push(chunk);
    const request=new Request(new URL(req.url,'http://127.0.0.1:4173'),{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});
    const response=await handle(request,env);
    res.writeHead(response.status,Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch { res.writeHead(500); res.end('Local preview error'); }
});
server.listen(4173,'127.0.0.1',()=>console.log('Preview: http://127.0.0.1:4173 — local data and login only'));
