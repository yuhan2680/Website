import { mkdir, copyFile, cp, lstat, rm, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, 'dist');
// Clean only the fixed deployment directory, never a linked directory.
if (dirname(output) !== resolve(root) || (await lstat(output).catch(() => null))?.isSymbolicLink()) throw new Error('Unsafe build output directory');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
// Only explicit public assets enter the deployment; no tests, templates or local data.
for (const name of ['index.html','blog.html','404.html','rss.xml','sitemap.xml','robots.txt','_headers','_redirects','_routes.json']) await copyFile(resolve(root,name), resolve(output,name));
for (const name of ['assets','live2d']) await cp(resolve(root,name),resolve(output,name),{recursive:true});
await mkdir(resolve(output,'posts'),{recursive:true});
await copyFile(resolve(root,'posts/post_style.css'),resolve(output,'posts/post_style.css'));

// Compile the existing layout into server-only templates. Article HTML is not
// published as a static asset, so withdrawing a post also removes its old URL.
const homeSource=await readFile(resolve(root,'index.html'),'utf8');
const pageSource=await readFile(resolve(root,'blog.html'),'utf8');
const postSource=await readFile(resolve(root,'posts/post3.html'),'utf8');
function replaceSection(source, section, slot) {
  const start = '<!-- '+section+' -->', end = '<!-- /'+section+' -->';
  const from = source.indexOf(start), to = source.indexOf(end);
  if (from < 0 || to < from) throw new Error('Missing template section: '+section);
  return source.slice(0,from)+slot+source.slice(to+end.length);
}
const homeWithSlots=replaceSection(replaceSection(homeSource,'home-profile','__HOME_PROFILE__'),'project-items','__PROJECT_ITEMS__');
const home=homeWithSlots.replace(/<div class="post-list">[\s\S]*?<\/div><\/section>/,'<div class="post-list">__BLOG_POSTS__</div></section>');
const initialProjects=JSON.parse(await readFile(resolve(root,'database/initial-projects.json'),'utf8'));
const about=replaceSection(await readFile(resolve(root,'about.html'),'utf8'),'about-profile','__ABOUT_PROFILE__');
const donationSource=await readFile(resolve(root,'donate.html'),'utf8');
const donations=replaceSection(donationSource,'donation-items','__DONATION_ITEMS__');
const initialDonations=Array.from(donationSource.matchAll(/<a class="post-title" href="([^"]+)">([^<]+)<\/a>/g), ([,url,name])=>({name,url}));
if (!initialDonations.length) throw new Error('Default donation links are missing');
const page=pageSource.replace(/<main\b[^>]*>[\s\S]*?<\/main>/,'<main id="main" tabindex="-1" class="site-main">__BLOG_MAIN__</main>');
const commentForm=postSource.match(/<section class="comment-container[\s\S]*?<\/section>/)?.[0];
if (!home.includes('__BLOG_POSTS__') || !page.includes('__BLOG_MAIN__') || !commentForm) throw new Error('Blog layout markers are missing');
const adminTemplates={};
for (const [key,file] of Object.entries({admin:'admin',friendAdmin:'admin-friendlinks',profileAdmin:'admin-profile',donationAdmin:'admin-donations',projectAdmin:'admin-projects'})) {
  adminTemplates[key]=await readFile(resolve(root,'template/'+file+'.html'),'utf8');
}
const friends=replaceSection(await readFile(resolve(root,'friendlinks.html'),'utf8'),'exchange-avatar','__EXCHANGE_AVATAR__');
if(!friends.includes('__FRIEND_LINKS__'))throw new Error('Friend links layout marker is missing');
// Keep the protected HTML and its assets in sync even when browsers cache an
// earlier admin.js or admin.css for several hours.
let settingsModule;
for (const [directory,name,extension] of [['js','admin','js'],['js','admin-friendlinks','js'],['js','admin-settings','js'],['js','admin-profile','js'],['js','admin-collections','js'],['css','admin','css']]) {
  const source=`assets/${directory}/${name}.${extension}`;
  let content=await readFile(resolve(root,source),'utf8');
  if (settingsModule) content=content.replaceAll("'./admin-settings.js'","'./"+settingsModule+"'");
  const hash=createHash('sha256').update(content).digest('hex').slice(0,12);
  const versioned=`assets/${directory}/${name}.${hash}.${extension}`;
  if (name==='admin-settings') settingsModule=`admin-settings.${hash}.js`;
  await writeFile(resolve(output,versioned),content);
  for (const key of Object.keys(adminTemplates)) adminTemplates[key]=adminTemplates[key].replaceAll('/'+source,'/'+versioned);
}
const schema=(await readFile(resolve(root,'database/blog.sql'),'utf8')).split(';').map(sql=>sql.trim()).filter(Boolean);
const friendSchema=(await readFile(resolve(root,'database/friendlinks.sql'),'utf8')).split(';').map(sql=>sql.trim()).filter(Boolean);
await mkdir(resolve(root,'server/generated'),{recursive:true});
await writeFile(resolve(root,'server/generated/templates.js'),Object.entries({home,page,about,donations,initialDonations,initialProjects,commentForm,...adminTemplates,schema,friends,friendSchema}).map(([name,value])=>`export const ${name} = ${JSON.stringify(value)};`).join('\n')+'\n');
console.log('Built public website in dist/');
