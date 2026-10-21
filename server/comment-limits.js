// Shared D1 state makes limits apply across Pages instances and concurrent requests.
const MIN_INTERVAL = 10000;
const CLIENT_WINDOW = 10 * 60 * 1000;
const CLIENT_LIMIT = 5;
const HOUR = 60 * 60 * 1000;
const HOUR_LIMIT = 200;
const DAY = 24 * HOUR;
const DAY_LIMIT = 1000;
const initialized = new WeakMap();

async function identityKey(db) {
  if (!initialized.has(db)) {
    const ready = (async () => {
      await db.batch([
        db.prepare('CREATE TABLE IF NOT EXISTS comment_limit_secret (id INTEGER PRIMARY KEY CHECK (id = 1), salt TEXT NOT NULL)'),
        db.prepare('CREATE TABLE IF NOT EXISTS comment_submissions (id TEXT PRIMARY KEY, client_key TEXT NOT NULL, created_at INTEGER NOT NULL)'),
        db.prepare('CREATE INDEX IF NOT EXISTS comment_submissions_client_time ON comment_submissions(client_key, created_at)'),
        db.prepare('CREATE INDEX IF NOT EXISTS comment_submissions_time ON comment_submissions(created_at)'),
        db.prepare('CREATE INDEX IF NOT EXISTS comments_post_created ON comments(post_id, created_at)'),
        db.prepare('INSERT OR IGNORE INTO comment_limit_secret (id, salt) VALUES (1, ?)').bind(crypto.randomUUID())
      ]);
      const {results} = await db.prepare('SELECT salt FROM comment_limit_secret WHERE id = 1').all();
      if (!results[0]?.salt) throw new Error('Comment limit state unavailable');
      return crypto.subtle.importKey('raw', new TextEncoder().encode(results[0].salt), {name:'HMAC', hash:'SHA-256'}, false, ['sign']);
    })();
    initialized.set(db, ready);
    ready.catch(() => initialized.delete(db));
  }
  return initialized.get(db);
}

function clientNetwork(request) {
  // Pages supplies this header. Never trust X-Forwarded-For or a visitor-supplied ID.
  const ip = request.headers.get('CF-Connecting-IP')?.trim() || '';
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip) && ip.split('.').every(part => Number(part) <= 255)) {
    return ip.split('.').map(Number).join('.');
  }
  if (/^[a-f\d:]+$/i.test(ip) && ip.includes(':')) {
    try {
      const address = new URL('http://[' + ip + ']/').hostname.slice(1,-1);
      const [left, right] = address.split('::').map(part => part ? part.split(':') : []);
      const groups = right ? [...left, ...Array(8-left.length-right.length).fill('0'), ...right] : left;
      // Rotating IPv6 privacy addresses within a /64 must not reset the quota.
      return groups.slice(0,4).map(part => parseInt(part,16).toString(16)).join(':') + '::/64';
    } catch { /* Invalid/missing edge identity shares a restricted fallback bucket. */ }
  }
  return 'unknown';
}

async function retryAfter(db, client, now) {
  const {results} = await db.prepare(`SELECT
    MAX(CASE WHEN client_key = ? THEN created_at END) AS latest,
    COUNT(CASE WHEN client_key = ? AND created_at > ? THEN 1 END) AS client_count,
    MIN(CASE WHEN client_key = ? AND created_at > ? THEN created_at END) AS client_oldest,
    COUNT(CASE WHEN created_at > ? THEN 1 END) AS hour_count,
    MIN(CASE WHEN created_at > ? THEN created_at END) AS hour_oldest,
    COUNT(*) AS day_count, MIN(created_at) AS day_oldest
    FROM comment_submissions WHERE created_at > ?`)
    .bind(client,client,now-CLIENT_WINDOW,client,now-CLIENT_WINDOW,now-HOUR,now-HOUR,now-DAY).all();
  const row = results[0], waits = [1000];
  if (row.latest !== null) waits.push(row.latest + MIN_INTERVAL - now);
  if (row.client_count >= CLIENT_LIMIT) waits.push(row.client_oldest + CLIENT_WINDOW - now);
  if (row.hour_count >= HOUR_LIMIT) waits.push(row.hour_oldest + HOUR - now);
  if (row.day_count >= DAY_LIMIT) waits.push(row.day_oldest + DAY - now);
  return Math.max(1, Math.ceil(Math.max(...waits) / 1000));
}

export async function insertComment(db, request, {postId, nickname, content}) {
  const key = await identityKey(db);
  const digest = await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(clientNetwork(request)));
  const client = Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
  const now = Date.now(), id = crypto.randomUUID();
  // Admission and the comment INSERT commit together or roll back together.
  // State expires after 24 hours; at most DAY_LIMIT admission records are retained.
  const results = await db.batch([
    db.prepare('DELETE FROM comment_submissions WHERE created_at <= ?').bind(now-DAY),
    db.prepare(`INSERT INTO comment_submissions (id, client_key, created_at) SELECT ?, ?, ?
      WHERE NOT EXISTS (SELECT 1 FROM comment_submissions WHERE client_key = ? AND created_at > ?)
      AND (SELECT COUNT(*) FROM comment_submissions WHERE client_key = ? AND created_at > ?) < ?
      AND (SELECT COUNT(*) FROM comment_submissions WHERE created_at > ?) < ?
      AND (SELECT COUNT(*) FROM comment_submissions) < ?`)
      .bind(id,client,now,client,now-MIN_INTERVAL,client,now-CLIENT_WINDOW,CLIENT_LIMIT,now-HOUR,HOUR_LIMIT,DAY_LIMIT),
    db.prepare(`INSERT INTO comments (post_id, nickname, content, created_at) SELECT ?, ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM comment_submissions WHERE id = ?)
      AND NOT EXISTS (SELECT 1 FROM comments WHERE post_id = ? AND created_at > ? AND nickname = ? AND content = ?)`)
      .bind(postId,nickname,content,new Date(now).toISOString(),id,postId,new Date(now-60000).toISOString(),nickname,content)
  ]);
  if (!results[1].meta?.changes) return {status:'limited',retryAfter:await retryAfter(db,client,now)};
  if (!results[2].meta?.changes) return {status:'duplicate',retryAfter:60};
  return {status:'created'};
}
