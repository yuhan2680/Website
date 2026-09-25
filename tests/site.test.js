import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
const pages=['index','blog','about','friendlinks','donate','posts/post0','posts/post1','posts/post2','posts/post3','404'];
test('all public pages have unique titles, canonical URLs, accessible landmarks and valid local assets/links', () => {
  const titles=new Set();
  for(const path of pages) {
    const html=readFileSync(path+'.html','utf8');
    const title=html.match(/<title>(.*?)<\/title>/)[1]; assert.ok(!titles.has(title)); titles.add(title);
    assert.match(html,/<html lang="zh-CN">/); assert.match(html,/<main id="main"/); assert.match(html,/<meta name="description"/);
    assert.match(html,/<link rel="canonical" href="https:\/\/naiwenel.com/);
    assert.equal((html.match(/<h1[ >]/g)||[]).length,1);
    for(const [,url] of html.matchAll(/(?:href|src)="(\/[^"#]*)(?:#[^"]*)?"/g)) {
      const local=resolve('.','.'+(url==='/'?'/index.html':url));
      assert.ok(existsSync(local)||existsSync(local+'.html'), path+': broken link '+url);
    }
    assert.ok(!html.includes('fonts.googleapis.com'));
    assert.ok(!/<script(?![^>]*src=)[^>]*>\s*\S/.test(html));
  }
});
test('RSS contains all posts and retains old GUIDs; sitemap uses the primary domain', () => {
  const rss=readFileSync('rss.xml','utf8');
  for(let i=0;i<4;i++) assert.ok(rss.includes('<guid>https://naiwenel.com/posts/post'+i+'.html</guid>'));
  assert.equal((rss.match(/<item>/g)||[]).length,4);
  const sitemap=readFileSync('sitemap.xml','utf8'); assert.equal((sitemap.match(/<url>/g)||[]).length,9);
});
