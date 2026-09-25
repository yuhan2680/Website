import { mkdir, copyFile, cp, readdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = process.cwd();
const output = resolve(root, 'dist');
if (output !== resolve(root, 'dist')) throw new Error('Unexpected output path');
await mkdir(output, { recursive: true });
// Only explicit public assets enter the deployment; no tests, templates or local data.
for (const name of await readdir(root)) {
  if (/\.html$/.test(name) && name !== 'index_test.html') await copyFile(name, resolve(output, name));
}
for (const name of ['style.css','avatar_logo.jpg','rss.xml','sitemap.xml','robots.txt','_headers','_redirects','_routes.json']) await copyFile(name, resolve(output,name));
for (const name of ['assets','posts','live2d']) await cp(name,resolve(output,name),{recursive:true});
console.log('Built public website in dist/');
