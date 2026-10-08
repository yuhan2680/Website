import {HttpError} from './http.js';
import {database} from './posts.js';
import {friendSchema} from './generated/templates.js';
import {initialFriendlinks} from '../database/initial-friendlinks.js';

const initialized=new WeakMap();
export async function friendDatabase(env) {
  const db=await database(env);
  if(!initialized.has(db)) {
    const ready=(async()=>{
      const migration=await db.prepare('SELECT version FROM blog_migrations WHERE version = 2').all();
      if(migration.results.length)return;
      const now=new Date().toISOString(),statements=friendSchema.map(sql=>db.prepare(sql));
      for(const link of initialFriendlinks) {
        statements.push(db.prepare("INSERT OR IGNORE INTO friend_links (id,name,url,avatar,description,sort_order,status,created_at,updated_at) VALUES (?,?,?,?,?,?,'active',?,?)")
          .bind(link.id,link.name,new URL(link.url).href,link.avatar,link.description,link.sort_order,now,now));
      }
      statements.push(db.prepare('INSERT OR IGNORE INTO blog_migrations (version) VALUES (2)'));
      await db.batch(statements);
    })().catch(error=>{initialized.delete(db);throw error;});
    initialized.set(db,ready);
  }
  await initialized.get(db);
  return db;
}

export async function listFriendlinks(db,{status='active',q=''}={}) {
  if(!['active','trash','all'].includes(status)||typeof q!=='string'||q.length>100)throw new HttpError(400,'筛选参数无效');
  const clauses=[],args=[];
  if(status!=='all'){clauses.push('status = ?');args.push(status);}
  if(q.trim()) {
    clauses.push("(name LIKE ? ESCAPE '\\' OR url LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\')");
    const search='%'+q.trim().replace(/[\\%_]/g,'\\$&')+'%';args.push(search,search,search);
  }
  return (await db.prepare('SELECT * FROM friend_links'+(clauses.length?' WHERE '+clauses.join(' AND '):'')+' ORDER BY sort_order,created_at,id').bind(...args).all()).results;
}

export async function getFriendlink(db,id) {
  return (await db.prepare('SELECT * FROM friend_links WHERE id = ?').bind(id).all()).results[0]||null;
}

function safeUrl(value,avatar=false) {
  if(avatar&&!value)return '';
  const relative=avatar&&value.startsWith('/')&&!value.startsWith('//');
  let url;
  try { url=new URL(value,relative?'https://naiwenel.com':undefined); }
  catch { throw new HttpError(400,avatar?'请输入有效的头像地址':'请输入完整的网站地址，例如 https://example.com'); }
  if(!['https:','http:'].includes(url.protocol)||url.username||url.password||/[\u0000-\u0020\u007f\\]/.test(value)||(relative&&url.origin!=='https://naiwenel.com'))throw new HttpError(400,'链接只支持 HTTP 或 HTTPS，且不能包含登录信息');
  return relative?url.pathname+url.search+url.hash:url.href;
}

export async function saveFriendlink(db,input,id) {
  const previous=id?await getFriendlink(db,id):null;
  if(id&&!previous)throw new HttpError(404,'友情链接不存在');
  const link={},limits={name:80,url:2048,avatar:2048,description:300};
  for(const [key,max] of Object.entries(limits)) {
    if(typeof input[key]!=='string')throw new HttpError(400,'友链字段必须是文字');
    link[key]=input[key].trim();
    if(link[key].length>max||(!link[key]&&['name','url'].includes(key)))throw new HttpError(400,'请检查网站名称、地址和简介的长度');
  }
  link.url=safeUrl(link.url);link.avatar=safeUrl(link.avatar,true);
  if(!Number.isSafeInteger(input.sort_order)||input.sort_order<0||input.sort_order>9999)throw new HttpError(400,'排序数字必须是 0 到 9999 的整数');
  if(!['active','trash'].includes(input.status)||(!previous&&input.status==='trash'))throw new HttpError(400,'友链状态无效');
  if(previous&&(!Number.isSafeInteger(input.revision)||input.revision!==previous.revision))throw new HttpError(409,'这条友链已有更新，请重新打开后再编辑。当前修改仍保留在表单中。');
  const now=new Date().toISOString();
  try {
    if(previous) {
      const result=await db.prepare('UPDATE friend_links SET name=?,url=?,avatar=?,description=?,sort_order=?,status=?,updated_at=?,revision=revision+1 WHERE id=? AND revision=?')
        .bind(link.name,link.url,link.avatar,link.description,input.sort_order,input.status,now,id,input.revision).run();
      if(!result.meta.changes)throw new HttpError(409,'友链刚刚被更新，请重新打开后再保存');
    } else {
      id=crypto.randomUUID();
      await db.prepare('INSERT INTO friend_links (id,name,url,avatar,description,sort_order,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)')
        .bind(id,link.name,link.url,link.avatar,link.description,input.sort_order,input.status,now,now).run();
    }
  } catch(error) {
    if(error instanceof HttpError)throw error;
    if(/UNIQUE constraint failed/.test(String(error.message)))throw new HttpError(409,'这个网站地址已存在，请检查友链列表或回收站');
    throw error;
  }
  return getFriendlink(db,id);
}
