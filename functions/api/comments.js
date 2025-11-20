export async function onRequest(context) {
  const db = context.env.blog_comments;

  const request = context.request;
  const url = new URL(request.url);

  // GET /api/comments?post=postId
  if (request.method === "GET") {
    const postId = url.searchParams.get("post");
    if (!postId) {
      return new Response("Missing post id", { status: 400 });
    }

    const { results } = await db
      .prepare(
        `SELECT id, post_id, nickname, content, created_at
         FROM comments
         WHERE post_id = ?
         ORDER BY id DESC`
      )
      .bind(postId)
      .all();

    return Response.json(results);
  }

  // POST /api/comments
  if (request.method === "POST") {
    const data = await request.json();

    const postId = data.post_id;
    const nickname = (data.nickname || "").trim();
    const content = (data.content || "").trim();

    if (!postId || !nickname || !content) {
      return new Response("Invalid input", { status: 400 });
    }

    await db
      .prepare(
        `INSERT INTO comments (post_id, nickname, content, created_at)
         VALUES (?, ?, ?, datetime('now'))`
      )
      .bind(postId, nickname, content)
      .run();

    return Response.json({ ok: true });
  }

  return new Response("Method not allowed", { status: 405 });
}
