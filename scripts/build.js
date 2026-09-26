import { mkdir, copyFile, cp, lstat, rm, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, 'dist');
// Clean only the fixed deployment directory, never a linked directory.
if (dirname(output) !== resolve(root) || (await lstat(output).catch(() => null))?.isSymbolicLink()) throw new Error('Unsafe build output directory');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
// Only explicit public assets enter the deployment; no tests, templates or local data.
for (const name of ['index.html','blog.html','about.html','friendlinks.html','donate.html','404.html','rss.xml','sitemap.xml','robots.txt','_headers','_redirects','_routes.json']) await copyFile(resolve(root,name), resolve(output,name));
for (const name of ['assets','live2d']) await cp(resolve(root,name),resolve(output,name),{recursive:true});
await mkdir(resolve(output,'posts'),{recursive:true});
await copyFile(resolve(root,'posts/post_style.css'),resolve(output,'posts/post_style.css'));

// Compile the existing layout into server-only templates. Article HTML is not
// published as a static asset, so withdrawing a post also removes its old URL.
const homeSource=await readFile(resolve(root,'index.html'),'utf8');
const pageSource=await readFile(resolve(root,'blog.html'),'utf8');
const postSource=await readFile(resolve(root,'posts/post3.html'),'utf8');
const home=homeSource.replace(/<div class="post-list">[\s\S]*?<\/div><\/section>/,'<div class="post-list">__BLOG_POSTS__</div></section>');
const page=pageSource.replace(/<main\b[^>]*>[\s\S]*?<\/main>/,'<main id="main" tabindex="-1" class="site-main">__BLOG_MAIN__</main>');
const commentForm=postSource.match(/<section class="comment-container[\s\S]*?<\/section>/)?.[0];
if (!home.includes('__BLOG_POSTS__') || !page.includes('__BLOG_MAIN__') || !commentForm) throw new Error('Blog layout markers are missing');
const admin=await readFile(resolve(root,'template/admin.html'),'utf8');
const schema=(await readFile(resolve(root,'database/blog.sql'),'utf8')).split(';').map(sql=>sql.trim()).filter(Boolean);
await mkdir(resolve(root,'server/generated'),{recursive:true});
await writeFile(resolve(root,'server/generated/templates.js'),Object.entries({home,page,commentForm,admin,schema}).map(([name,value])=>`export const ${name} = ${JSON.stringify(value)};`).join('\n')+'\n');
console.log('Built public website in dist/');
