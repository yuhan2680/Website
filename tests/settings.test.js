import test from 'node:test';
import assert from 'node:assert/strict';
import {localDatabase} from '../scripts/local-d1.js';
import {getProfile, saveProfile} from '../server/profile.js';
import {getDonations, saveDonations} from '../server/donations.js';
import {getProjects, saveProjects} from '../server/projects.js';

test('profile settings preserve the existing copy until edited and reject stale first or later edits', async t => {
  const {sqlite, binding} = localDatabase();
  t.after(() => sqlite.close());
  const env = {blog_comments: binding};
  const original = await getProfile(env);
  assert.equal(original.avatar, '/assets/images/avatar-logo.jpg');
  assert.equal(original.aboutAvatar, '/assets/images/naiwenel-avatar.jpg');
  assert.match(original.aboutMarkdown, /https:\/\/github\.com\/yuhan2680/);
  const results = await Promise.allSettled([
    saveProfile(env, {...original, name: '更新一'}),
    saveProfile(env, {...original, name: '更新二'})
  ]);
  assert.deepEqual(results.map(result => result.status).sort(), ['fulfilled', 'rejected']);
  assert.equal(results.find(result => result.status === 'rejected').reason.status, 409);
  const saved = results.find(result => result.status === 'fulfilled').value;
  const latest = await saveProfile(env, {...saved, tags: [], aboutMarkdown: '新资料'});
  await assert.rejects(saveProfile(env, {...saved, name: '过期修改'}), {status: 409});
  assert.deepEqual(await getProfile(env), latest);
  assert.equal(latest.version, 3);
});

test('invalid profile URL or list data cannot partially save a profile', async t => {
  const {sqlite, binding} = localDatabase();
  t.after(() => sqlite.close());
  const env = {blog_comments: binding};
  const original = await getProfile(env);
  for (const fields of [
    {tags: Array(13).fill('标签')}, {learning: ['']}, {bio: 'x'.repeat(301)},
    {aboutAvatar: '//outside.example/logo'}, {avatar: 'javascript:void(0)'}, {avatar: 'https://name:pass@example.com/logo'}
  ]) {
    await assert.rejects(saveProfile(env, {...original, name: '新名字', ...fields}), {status: 400});
  }
  assert.deepEqual(await getProfile(env), original);
});

test('donation settings preserve order and an empty list without changing the profile revision', async t => {
  const {sqlite, binding} = localDatabase();
  t.after(() => sqlite.close());
  const env = {blog_comments: binding};
  const original = await getDonations(env);
  assert.ok(original.items.some(item => item.name === '爱发电'));
  const items = [{name:'新的方式',url:'https://example.org/support'}, ...original.items.toReversed()];
  const reordered = await saveDonations(env, {...original, items});
  assert.deepEqual((await getDonations(env)).items, items);
  await assert.rejects(saveDonations(env, {...original, items: []}), {status: 409});
  await assert.rejects(saveDonations(env, {...reordered, items:[{name:'赞助',url:'http://example.org'}]}), {status: 400});
  await saveDonations(env, {...reordered, items: []});
  assert.deepEqual((await getDonations(env)).items, []);
  assert.equal((await getProfile(env)).version, 1);
});

test('project edits preserve order, private settings versions and full replacement semantics', async t => {
  const {sqlite, binding} = localDatabase();
  t.after(() => sqlite.close());
  const env = {blog_comments: binding};
  const original = await getProjects(env);
  assert.deepEqual(original.items.map(item => item.name), ['逆性莫比乌斯', 'Level C-1366']);
  const local = {name: '测试作品', description: '', url: '/posts/test', cover: 'https://example.org/封面.jpg', platform: ''};
  const saved = await saveProjects(env, {...original, items: [local, ...original.items.toReversed()]});
  assert.deepEqual(await getProjects(env), saved);
  await assert.rejects(saveProjects(env, {...original, items: []}), {status: 409});
  for (const change of [{url: '//not-local.example'}, {cover: 'http://example.org/cover.jpg'}, {name: ''}, {platform: 'x'.repeat(41)}]) {
    await assert.rejects(saveProjects(env, {...saved, items: [{...local, ...change}]}), {status: 400});
  }
  assert.deepEqual(await getProjects(env), saved);
  await saveProjects(env, {...saved, items: []});
  assert.deepEqual((await getProjects(env)).items, []);
  assert.equal((await getDonations(env)).version, 1);
});
