import { mkdir, copyFile, cp, lstat, rm } from 'node:fs/promises';
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
for (const name of ['assets','posts','live2d']) await cp(resolve(root,name),resolve(output,name),{recursive:true});
console.log('Built public website in dist/');
