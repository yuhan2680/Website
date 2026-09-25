const MAX_BODY_BYTES = 8192;

function json(data, status = 200, headers = {}) {
  return Response.json(data, { status, headers: {
    "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...headers
  } });
}

async function readBody(request) {
  if (Number(request.headers.get("Content-Length")) > MAX_BODY_BYTES) throw new RangeError();
  if (!request.body) throw new SyntaxError();
  const reader = request.body.getReader(), chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) { await reader.cancel(); throw new RangeError(); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

export async function onRequest({ request, env }) {
  if (!["GET", "POST"].includes(request.method)) {
    return json({ ok: false, msg: "方法不允许" }, 405, { Allow: "GET, POST" });
  }
  const url = new URL(request.url), postId = url.searchParams.get("post") || "";
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(postId)) {
    return json({ ok: false, msg: "缺少或无效的文章标识" }, 400);
  }
  if (!env?.blog_comments) return json({ ok: false, msg: "留言服务暂时不可用，请稍后再试" }, 503);

  if (request.method === "GET") {
    const rawLimit = url.searchParams.get("limit") ?? "20", rawBefore = url.searchParams.get("before");
    const limit = Number(rawLimit), before = rawBefore === null ? null : Number(rawBefore);
    if (!/^\d+$/.test(rawLimit) || !Number.isInteger(limit) || limit < 1 || limit > 50 ||
        (rawBefore !== null && (!/^\d+$/.test(rawBefore) || !Number.isSafeInteger(before) || before < 1))) {
      return json({ ok: false, msg: "分页参数无效" }, 400);
    }
    try {
      const query = before === null
        ? env.blog_comments.prepare("SELECT id, nickname, content, created_at FROM comments WHERE post_id = ? ORDER BY id DESC LIMIT ?").bind(postId, limit + 1)
        : env.blog_comments.prepare("SELECT id, nickname, content, created_at FROM comments WHERE post_id = ? AND id < ? ORDER BY id DESC LIMIT ?").bind(postId, before, limit + 1);
      const { results } = await query.all(), page = results.slice(0, limit);
      const headers = results.length > limit ? { "X-Comments-Next-Cursor": String(page.at(-1).id) } : {};
      // Preserve the array response for older cached pages.
      return json(page, 200, headers);
    } catch { return json({ ok: false, msg: "评论加载失败，请稍后重试" }, 503); }
  }

  const origin = request.headers.get("Origin");
  if ((origin && origin !== url.origin) || request.headers.get("Sec-Fetch-Site") === "cross-site") {
    return json({ ok: false, msg: "请在本站页面提交评论" }, 403);
  }
  if (request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return json({ ok: false, msg: "请提交 JSON 格式数据" }, 415);
  }
  let data;
  try { data = await readBody(request); } catch (error) {
    return json({ ok: false, msg: error instanceof RangeError ? "提交内容过大" : "请提交有效的 JSON 数据" }, error instanceof RangeError ? 413 : 400);
  }
  if (!data || Array.isArray(data) || typeof data.nickname !== "string" || typeof data.content !== "string") {
    return json({ ok: false, msg: "昵称和内容必须是文字" }, 400);
  }
  const nickname = data.nickname.trim(), content = data.content.trim();
  if (!nickname || !content || nickname.length > 20 || content.length > 500) {
    return json({ ok: false, msg: "请填写昵称（1–20 字）和评论（1–500 字）" }, 400);
  }
  if (data.website) return json({ ok: false, msg: "提交未通过验证" }, 400);
  try {
    const createdAt = new Date().toISOString(), cutoff = new Date(Date.now() - 60000).toISOString();
    // Atomic deduplication works with the existing schema. It is not an IP rate limiter.
    const result = await env.blog_comments.prepare(
      "INSERT INTO comments (post_id, nickname, content, created_at) SELECT ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM comments WHERE post_id = ? AND nickname = ? AND content = ? AND created_at > ?)"
    ).bind(postId, nickname, content, createdAt, postId, nickname, content, cutoff).run();
    if (!result.meta?.changes) return json({ ok: false, msg: "刚刚已提交过这条评论，请勿重复发送" }, 429, { "Retry-After": "60" });
    return json({ ok: true, msg: "评论提交成功" }, 201);
  } catch { return json({ ok: false, msg: "评论提交失败，请稍后再试" }, 503); }
}
