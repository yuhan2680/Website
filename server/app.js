import {authenticateAdmin,requireMutation} from './auth.js';
import {HttpError,json,html,readJson,escape,securityHeaders} from './http.js';
import {database,listPosts,categories,getPost,savePost,queryOptions} from './posts.js';
import {renderHome,renderArchive,renderPost,renderPage,postCards,pagination,renderFeed,renderSitemap} from './render.js';
import {renderMarkdown} from './markdown.js';
import {admin} from './generated/templates.js';
import {onRequest as comments} from '../functions/api/comments.js';

const adminHeaders={'X-Robots-Tag':'noindex, nofollow','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https: data:; connect-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'"};

export function createHandler({authenticate=authenticateAdmin}={}) {
  return async function handle(request,env) {
    const url=new URL(request.url), path=url.pathname;
    const isAdmin=path==='/admin'||path==='/admin.html'||path.startsWith('/admin/');
    const api=path.startsWith('/api/')||path.startsWith('/admin/api/');
    try {
      if(path==='/api/comments')return comments({request,env});
      if(isAdmin) {
        const user=await authenticate(request,env);
        if(!['GET','HEAD'].includes(request.method))requireMutation(request,user);
        if(['/admin','/admin/','/admin.html'].includes(path)&&['GET','HEAD'].includes(request.method))return html(request.method==='HEAD'?'':admin,200,adminHeaders);
        if(path==='/admin/api/session'&&request.method==='GET')return json({ok:true,user:{email:user.email},csrf:user.csrf},200,adminHeaders);
        if(path==='/admin/api/preview'&&request.method==='POST') {
          const input=await readJson(request);
          if(typeof input.markdown!=='string'||input.markdown.length>100000)throw new HttpError(400,'正文长度无效');
          return json({ok:true,html:renderMarkdown(input.markdown)},200,adminHeaders);
        }
        const db=await database(env);
        if(path==='/admin/api/export'&&request.method==='GET') {
          const posts=await db.prepare('SELECT * FROM posts ORDER BY created_at,id').all();
          return json({version:1,exported_at:new Date().toISOString(),posts:posts.results},200,{...adminHeaders,'Content-Disposition':`attachment; filename="blog-${new Date().toISOString().slice(0,10)}.json"`});
        }
        if(path==='/admin/api/posts') {
          if(request.method==='GET')return json({ok:true,...await listPosts(db,queryOptions(url,true)),categories:await categories(db)},200,adminHeaders);
          if(request.method==='POST')return json({ok:true,post:await savePost(db,await readJson(request))},201,adminHeaders);
          throw new HttpError(405,'方法不允许');
        }
        const match=path.match(/^\/admin\/api\/posts\/([a-zA-Z0-9_-]{1,64})$/);
        if(match) {
          if(request.method==='GET') {
            const post=await getPost(db,match[1],true);
            if(!post)throw new HttpError(404,'文章不存在');
            return json({ok:true,post},200,adminHeaders);
          }
          if(request.method==='PUT')return json({ok:true,post:await savePost(db,await readJson(request),match[1])},200,adminHeaders);
          throw new HttpError(405,'方法不允许');
        }
        throw new HttpError(404,'页面不存在');
      }
      if(!['GET','HEAD'].includes(request.method))throw new HttpError(405,'方法不允许');
      const canonical={'/index.html':'/','/blog.html':'/blog','/blog/':'/blog'}[path];
      if(canonical)return new Response(null,{status:301,headers:{...securityHeaders,Location:canonical+url.search}});
      if(path==='/posts/post_style.css')return env.ASSETS.fetch(request);
      const dynamic=path==='/'||path==='/blog'||path==='/api/posts'||path.startsWith('/posts/')||path==='/rss.xml'||path==='/sitemap.xml';
      if(!dynamic)return env.ASSETS.fetch(request);
      const db=await database(env);
      let response;
      if(path==='/')response=html(renderHome((await listPosts(db,{limit:3})).items));
      else if(path==='/blog'||path==='/api/posts') {
        const options=queryOptions(url), result=await listPosts(db,options);
        if(path==='/api/posts')response=json({...result,html:postCards(result.items),pagination:pagination(result,options)});
        else response=html(renderArchive(result,options,await categories(db)));
      } else if(path==='/rss.xml'||path==='/sitemap.xml') {
        const posts=(await db.prepare("SELECT id,slug,title,excerpt,category,published_at,updated_at,rss_guid FROM posts WHERE status='published' ORDER BY published_at DESC,id DESC").all()).results;
        response=new Response(path==='/rss.xml'?renderFeed(posts):renderSitemap(posts),{headers:{...securityHeaders,'Content-Type':path==='/rss.xml'?'application/rss+xml; charset=utf-8':'application/xml; charset=utf-8'}});
      } else {
        const match=path.match(/^\/posts\/([a-z0-9][a-z0-9_-]{0,63})(\.html)?\/?$/);
        if(!match)throw new HttpError(404,'文章不存在');
        const post=await getPost(db,match[1]);
        if(!post)throw new HttpError(404,'文章不存在或尚未发布');
        if(path!=='/posts/'+post.slug)return new Response(null,{status:301,headers:{...securityHeaders,Location:'/posts/'+post.slug}});
        const neighbors=[];
        for(const [operator,sort,direction] of [['>','ASC','更新一篇'],['<','DESC','更早一篇']]) {
          const result=await db.prepare(`SELECT slug,title FROM posts WHERE status='published' AND (published_at ${operator} ? OR (published_at = ? AND id ${operator} ?)) ORDER BY published_at ${sort},id ${sort} LIMIT 1`).bind(post.published_at,post.published_at,post.id).all();
          if(result.results[0])neighbors.push({...result.results[0],direction});
        }
        response=html(renderPost(post,neighbors));
      }
      if(request.method==='HEAD')return new Response(null,{status:response.status,headers:response.headers});
      if(url.hostname.endsWith('.pages.dev'))response.headers.set('X-Robots-Tag','noindex');
      return response;
    } catch(error) {
      const status=error instanceof HttpError?error.status:503;
      const message=error instanceof HttpError?error.message:'服务暂时不可用，请稍后重试';
      if(api)return json({ok:false,msg:message},status,isAdmin?adminHeaders:{});
      if(isAdmin)return html(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>博客后台</title><link rel="stylesheet" href="/assets/css/admin.css"><main class="login-notice"><h1>博客后台</h1><p>${escape(message)}</p><a href="/admin">重新登录</a> · <a href="/">返回网站</a></main></html>`,status,adminHeaders);
      return html(renderPage(`<section class="empty-page"><h1>${status===404?'没有找到这篇文章':'暂时无法加载'}</h1><p>${escape(message)}</p><a class="text-link" href="/blog">返回博客列表</a></section>`,{title:'文章 · 小涵 Naiwenel',path}),status,{'X-Robots-Tag':'noindex'});
    }
  };
}
export const handleRequest=createHandler();
