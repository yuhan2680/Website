export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  /* ============================================================
     GET: 获取指定 post 的评论
  ============================================================ */
  if (request.method === "GET") {
    const postId = url.searchParams.get("post");

    if (!postId) {
      return Response.json(
        { ok: false, msg: "缺少 post 参数" },
        { status: 400 }
      );
    }

    try {
      const { results } = await env.blog_comments
        .prepare(
          `SELECT id, nickname, content, created_at
           FROM comments
           WHERE post_id = ?
           ORDER BY created_at DESC`
        )
        .bind(postId)
        .all();

      return Response.json(results);
    } catch (err) {
      return Response.json(
        { ok: false, msg: "数据库查询失败", error: err.message },
        { status: 500 }
      );
    }
  }

  /* ============================================================
     POST: 新增评论
  ============================================================ */
  if (request.method === "POST") {
    let data;
    try {
      data = await request.json();
    } catch {
      return Response.json(
        { ok: false, msg: "请提交 JSON 格式数据" },
        { status: 400 }
      );
    }

    // 从 URL 获取 post id（与 GET 保持一致）
    const postId = (url.searchParams.get("post") || "").trim();
    const nickname = (data.nickname || "").trim();
    const content = (data.content || "").trim();

    if (!postId || !nickname || !content) {
      return Response.json(
        { ok: false, msg: "缺少必要字段" },
        { status: 400 }
      );
    }

    if (nickname.length > 20) {
      return Response.json(
        { ok: false, msg: "昵称不可超过 20 字" },
        { status: 400 }
      );
    }

    if (content.length > 500) {
      return Response.json(
        { ok: false, msg: "评论不可超过 500 字" },
        { status: 400 }
      );
    }

    const createdAt = new Date().toISOString();

    try {
      await env.blog_comments
        .prepare(
          `INSERT INTO comments (post_id, nickname, content, created_at)
           VALUES (?, ?, ?, ?)`
        )
        .bind(postId, nickname, content, createdAt)
        .run();

      return Response.json({ ok: true, msg: "评论提交成功" });
    } catch (err) {
      return Response.json(
        { ok: false, msg: "数据库写入失败", error: err.message },
        { status: 500 }
      );
    }
  }

  /* ============================================================
     其他方法拒绝
  ============================================================ */
  return Response.json(
    { ok: false, msg: "方法不允许" },
    { status: 405 }
  );
}
