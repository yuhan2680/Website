import {HttpError} from './http.js';
import {schema} from './generated/templates.js';
import {initialPosts} from '../database/initial-posts.js';

const initialized = new WeakMap();
const fields = 'id,slug,title,excerpt,category,status,published_at,created_at,updated_at,revision,rss_guid';
export async function database(env) {
  const db = env.blog_comments;
  if (!db) throw new HttpError(503,'文章服务暂时不可用');
  if (!initialized.has(db)) {
    const ready = (async()=>{
      try {
        const result = await db.prepare('SELECT version FROM blog_migrations WHERE version = 1').all();
        if (result.results.length) return;
      } catch { /* First deployment: add tables without changing the comments schema. */ }
      const statements = schema.map(sql=>db.prepare(sql));
      for (const post of initialPosts) {
        const date = post.date+'T00:00:00.000Z';
        statements.push(db.prepare("INSERT OR IGNORE INTO posts (id,slug,title,excerpt,category,markdown,status,published_at,created_at,updated_at,rss_guid) VALUES (?,?,?,?,?,?,'published',?,?,?,?)")
          .bind(post.id,post.slug,post.title,post.excerpt,post.category,post.markdown,date,date,date,'https://naiwenel.com/posts/'+post.slug+'.html'));
      }
      statements.push(db.prepare('INSERT OR IGNORE INTO blog_migrations (version) VALUES (1)'));
      await db.batch(statements);
    })().catch(error=>{initialized.delete(db);throw error;});
    initialized.set(db,ready);
  }
  await initialized.get(db);
  return db;
}

export function queryOptions(url, admin = false) {
  const q = (url.searchParams.get('q') || '').trim();
  const category = (url.searchParams.get('category') || '').trim();
  const page = Number(url.searchParams.get('page') || '1');
  const status = admin ? (url.searchParams.get('status') || 'all') : 'published';
  if (q.length > 100 || category.length > 40 || !Number.isSafeInteger(page) || page < 1 || page > 10000 || !['all','draft','published','trash'].includes(status)) throw new HttpError(400,'筛选参数无效');
  return {q,category,page,status,limit:admin?30:12};
}
export async function listPosts(db, {q='',category='',page=1,status='published',limit=12}={}) {
  const clauses = [], args = [];
  if (status !== 'all') { clauses.push('status = ?'); args.push(status); }
  else clauses.push("status != 'trash'");
  if (category) { clauses.push('category = ?'); args.push(category); }
  if (q) {
    clauses.push("(title LIKE ? ESCAPE '\\' OR excerpt LIKE ? ESCAPE '\\' OR markdown LIKE ? ESCAPE '\\')");
    const search = '%'+q.replace(/[\\%_]/g,'\\$&')+'%';
    args.push(search,search,search);
  }
  const where = clauses.join(' AND ');
  const [count,posts] = await Promise.all([
    db.prepare('SELECT count(*) AS total FROM posts WHERE '+where).bind(...args).all(),
    db.prepare(`SELECT ${fields} FROM posts WHERE ${where} ORDER BY ${status==='published'?'published_at':'updated_at'} DESC, id DESC LIMIT ? OFFSET ?`).bind(...args,limit,(page-1)*limit).all()
  ]);
  return {items:posts.results,total:count.results[0].total,page,limit};
}
export async function categories(db) {
  return (await db.prepare("SELECT category,count(*) AS count FROM posts WHERE status = 'published' GROUP BY category ORDER BY count(*) DESC,category").all()).results;
}
export async function getPost(db, value, admin = false) {
  const query = admin?'SELECT * FROM posts WHERE id = ?':"SELECT * FROM posts WHERE slug = ? AND status = 'published'";
  return (await db.prepare(query).bind(value).all()).results[0] || null;
}

function validate(input, previous) {
  const limits = {title:120,slug:64,excerpt:300,category:40,markdown:100000};
  const result = {};
  for (const [key,max] of Object.entries(limits)) {
    if (typeof input[key] !== 'string') throw new HttpError(400,'文章字段必须是文字');
    result[key] = input[key].trim();
    if (result[key].length > max || (!result[key] && key !== 'excerpt')) throw new HttpError(400,`请检查${{title:'标题',slug:'文章地址',excerpt:'摘要',category:'分类',markdown:'正文'}[key]}的长度`);
  }
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(result.slug)) throw new HttpError(400,'文章地址只能使用小写英文字母、数字、短横线和下划线');
  if (!['draft','published','trash'].includes(input.status) || (!previous && input.status==='trash')) throw new HttpError(400,'文章状态无效');
  if (previous?.published_at && previous.slug !== result.slug) throw new HttpError(409,'已发布文章的地址不能修改，以免原有链接失效');
  if (previous && (!Number.isSafeInteger(input.revision) || input.revision !== previous.revision)) throw new HttpError(409,'这篇文章已有更新，请重新打开后再编辑。当前内容仍保留在编辑器中。');
  result.status = input.status;
  result.published_at = previous?.published_at || null;
  if (input.status==='published' && !result.published_at) result.published_at = new Date().toISOString();
  return result;
}
export async function savePost(db, input, id) {
  const previous = id ? await getPost(db,id,true) : null;
  if (id && !previous) throw new HttpError(404,'文章不存在');
  const post = validate(input,previous), now = new Date().toISOString();
  const collision = await db.prepare('SELECT id FROM posts WHERE slug = ? AND id != ?').bind(post.slug,id || '').all();
  if (collision.results.length) throw new HttpError(409,'这个文章地址已被使用');
  try {
    if (previous) {
      const guid = previous.published_at ? previous.rss_guid : 'https://naiwenel.com/posts/'+post.slug;
      const result = await db.prepare('UPDATE posts SET title=?,excerpt=?,category=?,markdown=?,status=?,slug=?,published_at=?,updated_at=?,rss_guid=?,revision=revision+1 WHERE id=? AND revision=?')
        .bind(post.title,post.excerpt,post.category,post.markdown,post.status,post.slug,post.published_at,now,guid,id,input.revision).run();
      if (!result.meta.changes) throw new HttpError(409,'文章刚刚被更新，请重新打开后再保存');
    } else {
      id = crypto.randomUUID();
      await db.prepare('INSERT INTO posts (id,slug,title,excerpt,category,markdown,status,published_at,created_at,updated_at,rss_guid) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
        .bind(id,post.slug,post.title,post.excerpt,post.category,post.markdown,post.status,post.published_at,now,now,'https://naiwenel.com/posts/'+post.slug).run();
    }
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (/UNIQUE constraint failed/.test(String(error.message))) throw new HttpError(409,'这个文章地址已被使用');
    throw error;
  }
  return getPost(db,id,true);
}
