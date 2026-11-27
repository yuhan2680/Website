import {HttpError} from './http.js';

// Existing deployments acquire this table on first use. A new isolate can read
// a configured site in one query, without a schema write on every cold start.
async function querySettings(env, operation) {
  const db = env.blog_comments;
  if (!db) throw new HttpError(503, '站点设置暂时不可用');
  try {
    return await operation(db);
  } catch (error) {
    if (!/no such table: (?:main\.)?site_settings\b/i.test(String(error.message))) throw error;
  }
  await db.prepare(`CREATE TABLE IF NOT EXISTS site_settings (
    name TEXT PRIMARY KEY, content TEXT NOT NULL, version INTEGER NOT NULL
  )`).run();
  return operation(db);
}

export async function getSetting(env, name, defaults) {
  const {results} = await querySettings(env, db => db.prepare(
    'SELECT version, content FROM site_settings WHERE name = ?'
  ).bind(name).all());
  if (!results.length) return {...structuredClone(defaults), version: 1};
  return {...JSON.parse(results[0].content), version: results[0].version};
}

export async function saveSetting(env, name, version, content) {
  if (!Number.isSafeInteger(version) || version < 1 || version >= Number.MAX_SAFE_INTEGER) {
    throw new HttpError(400, '版本无效，请重新载入');
  }
  const payload = JSON.stringify(content);
  // Version 1 denotes the built-in copy. Conflict checks are part of the SQL
  // write, including the first edit from two different browser windows.
  const result = await querySettings(env, db => {
    if (version === 1) {
      return db.prepare('INSERT INTO site_settings (name, content, version) VALUES (?, ?, 2) ON CONFLICT (name) DO NOTHING')
        .bind(name, payload).run();
    }
    return db.prepare('UPDATE site_settings SET content = ?, version = version + 1 WHERE name = ? AND version = ?')
      .bind(payload, name, version).run();
  });
  if (!result.meta.changes) throw new HttpError(409, '内容已被更新，请重新载入后再编辑');
  return {...content, version: version + 1};
}

export function textField(value, label, max, required = true) {
  if (typeof value !== 'string') throw new HttpError(400, label + '必须是文字');
  const text = value.trim();
  if (text.length > max || (required && !text)) throw new HttpError(400, '请检查' + label + '的长度');
  return text;
}

export function linkField(value, label, allowSitePath = false) {
  const text = textField(value, label, 2048);
  const local = allowSitePath && /^\/(?!\/)/.test(text);
  const invalid = () => new HttpError(400, label + (allowSitePath ? '须为站内路径或完整 HTTPS 地址' : '须为完整 HTTPS 地址'));
  if (/[\u0000-\u0020\u007f\\]/.test(text) || (!local && !/^https:\/\//i.test(text))) throw invalid();
  let url;
  try { url = new URL(text, 'https://naiwenel.com'); }
  catch { throw invalid(); }
  if (url.protocol !== 'https:' || url.username || url.password) throw invalid();
  if (local && (url.origin !== 'https://naiwenel.com' || url.pathname.startsWith('//'))) throw invalid();
  // Keep the input spelling so a valid non-ASCII URL round trips through an
  // edit without percent encoding expanding it past the field length limit.
  return text;
}
