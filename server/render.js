import {home,page,archiveScript,commentForm,friends,about,donations} from './generated/templates.js';
import {escape} from './http.js';
import {renderMarkdown} from './markdown.js';

const origin='https://naiwenel.com';
const dateLabel=value=>String(value || '').slice(0,10).replaceAll('-','.');
export function postCards(items) {
  return items.map(post=>`<article class="post-card" data-post-card data-category="${escape(post.category)}"><div class="post-meta"><span class="tag">${escape(post.category)}</span><time datetime="${escape(post.published_at?.slice(0,10))}">${dateLabel(post.published_at)}</time></div><h3><a href="/posts/${escape(post.slug)}">${escape(post.title)}</a></h3><p>${escape(post.excerpt)}</p><a class="text-link" href="/posts/${escape(post.slug)}">点此阅读 <span aria-hidden="true">↗</span></a></article>`).join('') || '<p class="muted">暂时没有文章。</p>';
}
function projectCards(items) {
  return items.map(({name,description,platform,url,cover},index)=>{
    const platformLabel=platform?`<span class="project-platform">${escape(platform)} ↗</span>`:'';
    return `<a class="project-card${index%2?' project-blue':''}" href="${escape(url)}" target="_blank" rel="noopener noreferrer"><div class="project-art"><img src="${escape(cover)}" width="460" height="215" alt="${escape(name)}封面" loading="lazy" decoding="async" referrerpolicy="no-referrer">${platformLabel}</div><div class="project-copy"><h3>${escape(name)}</h3><p>${escape(description)}</p></div></a>`;
  }).join('') || '<p class="muted">暂时没有作品。</p>';
}
export function renderHome(posts,profile,projects) {
  const tags=profile.tags.map(tag=>`<span>${escape(tag)}</span>`).join('');
  const dotClasses=['',' violet',' blue'];
  const learning=profile.learning.map((item,i)=>`<li><span aria-hidden="true" class="status-dot${dotClasses[i%3]}"></span> ${escape(item)}</li>`).join('');
  const cards=`<section class="profile-card panel"><img src="${escape(profile.avatar)}" width="76" height="76" alt="${escape(profile.name)}的头像" decoding="async" referrerpolicy="no-referrer"><h2>${escape(profile.name)}</h2><p>${escape(profile.bio)}</p><div class="profile-tags">${tags}</div><a class="text-link" href="/about">关于我 ↗</a></section><section class="side-note panel"><h3>${escape(profile.learningTitle)}</h3><ul>${learning}</ul></section>`;
  const sections={__HOME_PROFILE__:cards,__BLOG_POSTS__:postCards(posts),__PROJECT_ITEMS__:projectCards(projects)};
  return home.replace(/__HOME_PROFILE__|__BLOG_POSTS__|__PROJECT_ITEMS__/g,slot=>sections[slot]);
}

export function renderAbout(profile) {
  const title=escape(profile.aboutTitle);
  const content=`<header class="page-intro"><h1>${title}</h1></header><section class="about-layout panel"><div class="about-photo"><img src="${escape(profile.aboutAvatar)}" width="200" height="200" decoding="async" referrerpolicy="no-referrer" alt="${escape(profile.name)}的头像"></div><div class="article-content">${renderMarkdown(profile.aboutMarkdown)}</div></section>`;
  return about.replace(/<title>[^<]*<\/title>|(<meta (?:name="description"|property="og:(?:description|title)") content=")[^"]*">|__ABOUT_PROFILE__/g,(slot,meta)=>{
    if (slot==='__ABOUT_PROFILE__') return content;
    const pageTitle=title+' · '+escape(profile.name);
    if (!meta) return '<title>'+pageTitle+'</title>';
    return meta+(meta.includes('og:title')?pageTitle:escape(profile.bio))+'">';
  });
}

export function renderDonations(items) {
  const links=items.map(({name,url})=>`<li><h3><a class="post-title" href="${escape(url)}">${escape(name)}</a></h3></li>`).join('\n');
  return donations.replace('__DONATION_ITEMS__',()=>links||'<li class="muted">暂时没有赞助链接。</li>');
}

export function renderFriendlinks(items,message='暂时没有友情链接。',avatar='/assets/images/avatar-logo.jpg',mediaOrigin=origin) {
  const cards=items.map(link=>`<a class="friend-card panel" href="${escape(link.url)}" target="_blank" rel="noopener noreferrer"><img src="${escape(link.avatar||'/assets/images/avatar-logo.jpg')}" width="56" height="56" loading="lazy" decoding="async" referrerpolicy="no-referrer" alt="${escape(link.name)} 的头像"><div><h2>${escape(link.name)}</h2><p>${escape(link.description)}</p></div><span aria-hidden="true">↗</span></a>`).join('\n');
  const avatarUrl=escape(new URL(avatar,avatar.startsWith('/media/')?mediaOrigin:origin).href);
  return friends.replace(/__FRIEND_LINKS__|__EXCHANGE_AVATAR__/g,slot=>slot==='__EXCHANGE_AVATAR__'
    ?`<a href="${avatarUrl}">${avatarUrl}</a>`
    :cards||`<p class="muted">${escape(message)}</p>`);
}

export function renderPage(main,{title='博客列表 · 小涵 Naiwenel',description='小涵的博客文章。',path='/blog',type='website',postId,archive=false}={}) {
  let result=page.replace('__BLOG_MAIN__',()=>main).replace(/<title>[\s\S]*?<\/title>/,()=>`<title>${escape(title)}</title>`);
  const values={'description':description,'og:title':title,'og:description':description,'og:url':origin+path,'og:type':type};
  for(const [key,value] of Object.entries(values)) result=result.replace(new RegExp(`<meta (name|property)="${key}" content="[^"]*">`),(_,attribute)=>`<meta ${attribute}="${key}" content="${escape(value)}">`);
  result=result.replace(/<link rel="canonical" href="[^"]*">/,()=>`<link rel="canonical" href="${origin+escape(path)}">`);
  if (postId) result=result.replace('<body>',()=>`<body data-post-id="${escape(postId)}">`).replace('</head>','<script src="/assets/js/comments.js" defer></script></head>');
  if (archive) result=result.replace('</head>',`<script src="${archiveScript}" defer></script></head>`);
  return result;
}

export function archiveUrl(options,patch={}) {
  const value={...options,...patch}, params=new URLSearchParams();
  if(value.q)params.set('q',value.q);
  if(value.category)params.set('category',value.category);
  if(value.page>1)params.set('page',String(value.page));
  return '/blog'+(params.size?'?'+params:'');
}
export function pagination(result,options) {
  const pages=Math.max(1,Math.ceil(result.total/result.limit));
  return `<nav class="archive-pagination" aria-label="文章分页">${result.page>1?`<a data-archive-link href="${escape(archiveUrl(options,{page:result.page-1}))}">← 上一页</a>`:'<span></span>'}<span>第 ${result.page} / ${pages} 页</span>${result.page<pages?`<a data-archive-link href="${escape(archiveUrl(options,{page:result.page+1}))}">下一页 →</a>`:'<span></span>'}</nav>`;
}
export function renderArchive(result,options,categories) {
  const filters=[{category:'',name:'全部'},...categories.map(item=>({category:item.category,name:item.category}))].map(item=>`<a data-archive-link href="${escape(archiveUrl(options,{category:item.category,page:1}))}" ${options.category===item.category?'aria-current="true"':''}>${escape(item.name)}</a>`).join('');
  return renderPage(`<header class="page-intro"><h1>博客列表</h1><p>这里记录了小涵的想法、日志与创作旅程。</p></header><section id="articleArchive" aria-label="文章归档"><div class="archive-tools"><nav class="filter-group" aria-label="文章分类">${filters}</nav><form class="search-box" id="archiveSearch" action="/blog" method="get" role="search"><input type="hidden" name="category" value="${escape(options.category)}"><label class="sr-only" for="articleSearch">搜索文章</label><input id="articleSearch" name="q" type="search" maxlength="100" value="${escape(options.q)}" placeholder="搜索文章" autocomplete="off"><button type="submit" aria-label="搜索文章" title="搜索文章"><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 4.5 4.5"/></svg></button></form></div><p id="archiveStatus" role="status" class="muted small">共 ${result.total} 篇文章</p><div class="archive-list">${postCards(result.items)}</div><div id="archivePager">${pagination(result,options)}</div></section>`,{archive:true});
}
export function renderPost(post,neighbors=[]) {
  const minutes=Math.max(1,Math.ceil(post.markdown.length/400));
  const main=`<div class="reading-layout"><a class="text-link" href="/blog">← 返回博客列表</a><article class="article-container panel"><header class="article-header"><div class="post-meta"><a class="tag" href="${escape(archiveUrl({category:post.category}))}">${escape(post.category)}</a><time datetime="${escape(post.published_at?.slice(0,10))}">${dateLabel(post.published_at)}</time><span>约 ${minutes} 分钟阅读</span></div><h1>${escape(post.title)}</h1><p class="article-author"><img src="/assets/images/avatar-logo.jpg" width="28" height="28" alt="" decoding="async">小涵 Naiwenel</p></header><div class="article-content">${renderMarkdown(post.markdown)}</div></article><nav class="post-neighbors" aria-label="相邻文章">${neighbors.map(item=>`<a href="/posts/${escape(item.slug)}"><span class="eyebrow">${item.direction}</span><strong>${escape(item.title)} ↗</strong></a>`).join('')}</nav>${commentForm}</div>`;
  return renderPage(main,{title:post.title+' · 小涵 Naiwenel',description:post.excerpt,path:'/posts/'+post.slug,type:'article',postId:post.id});
}
export function renderFeed(posts) {
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>小涵Naiwenelの个人网站</title><link>${origin}</link><description>小涵的博客文章</description><language>zh-CN</language>${posts.map(post=>`<item><title>${escape(post.title)}</title><link>${origin}/posts/${escape(post.slug)}</link><guid>${escape(post.rss_guid)}</guid><description>${escape(post.excerpt)}</description><category>${escape(post.category)}</category><pubDate>${new Date(post.published_at).toUTCString()}</pubDate></item>`).join('')}</channel></rss>`;
}
export function renderSitemap(posts) {
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${['/','/blog','/about','/friendlinks','/donate'].map(path=>`<url><loc>${origin+path}</loc></url>`).join('')}${posts.map(post=>`<url><loc>${origin}/posts/${escape(post.slug)}</loc><lastmod>${escape(post.updated_at)}</lastmod></url>`).join('')}</urlset>`;
}
