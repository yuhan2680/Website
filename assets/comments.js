(() => {
  "use strict";
  const form = document.getElementById("commentForm"), list = document.getElementById("commentList");
  if (!form || !list) return;
  const status = document.getElementById("commentStatus"), submit = document.getElementById("sendComment");
  const more = document.getElementById("loadMoreComments"), retry = document.getElementById("retryComments");
  const nickname = document.getElementById("nickname"), content = document.getElementById("comment");
  const endpoint = `/api/comments?post=${encodeURIComponent(document.body.dataset.postId)}`;
  let cursor = null, loading = false, nextSubmit = 0, sending = false;
  try { nickname.value = localStorage.getItem("naiwenel-nickname") || ""; } catch { /* optional */ }
  async function request(url, options = {}) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      let data;
      try { data = await response.json(); } catch { throw new Error("留言服务暂时不可用，请稍后重试。"); }
      if (!response.ok) throw new Error(data.msg || "请求失败，请稍后重试。");
      return { response, data };
    } catch (error) {
      if (error.name === "AbortError") throw new Error("连接超时，请检查网络后重试。");
      throw error;
    } finally { clearTimeout(timer); }
  }
  function render(comment) {
    const item = document.createElement("article"); item.className = "comment-item";
    const nick = document.createElement("div"); nick.className = "comment-nick"; nick.textContent = comment.nickname;
    const text = document.createElement("div"); text.className = "comment-content"; text.textContent = comment.content;
    const time = document.createElement("time"); time.className = "comment-time";
    const raw = String(comment.created_at || "");
    const date = new Date(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(raw) ? raw.replace(" ", "T") + "Z" : raw);
    if (!Number.isNaN(date.valueOf())) {
      time.dateTime = date.toISOString(); time.textContent = new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(date);
    }
    item.append(nick, text, time); return item;
  }
  async function load(append = false) {
    if (loading) return;
    loading = true; retry.hidden = true; more.disabled = true; list.setAttribute("aria-busy", "true");
    try {
      const { response, data } = await request(endpoint + (append && cursor ? `&before=${encodeURIComponent(cursor)}` : ""));
      if (!Array.isArray(data)) throw new Error("评论数据暂时无法读取，请重试。");
      if (!append) list.replaceChildren();
      if (!data.length && !append) list.textContent = "还没有留言，来打个招呼吧。";
      list.append(...data.map(render)); cursor = response.headers.get("X-Comments-Next-Cursor"); more.hidden = !cursor;
    } catch (error) {
      if (!append) list.textContent = "评论暂时无法加载。";
      status.textContent = error instanceof TypeError ? "网络连接失败，请稍后重试。" : error.message;
      retry.hidden = false; retry.dataset.append = String(append);
    } finally { loading = false; more.disabled = false; list.setAttribute("aria-busy", "false"); }
  }
  more.addEventListener("click", () => load(true));
  retry.addEventListener("click", () => { status.textContent = ""; load(retry.dataset.append === "true"); });
  form.addEventListener("submit", async (event) => {
    event.preventDefault(); if (sending) return;
    if (Date.now() < nextSubmit) { status.textContent = "提交太快，请稍候再试。"; return; }
    if (!nickname.value.trim() || !content.value.trim()) { status.textContent = "昵称和评论不能为空。"; return; }
    sending = true; submit.disabled = true; submit.textContent = "提交中…"; status.textContent = "";
    try {
      const { data } = await request(endpoint, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname: nickname.value.trim(), content: content.value.trim(), website: form.elements.website.value }) });
      if (!data.ok) throw new Error(data.msg || "提交失败，请重试。");
      content.value = ""; nextSubmit = Date.now() + 3000;
      try { localStorage.setItem("naiwenel-nickname", nickname.value.trim()); } catch { /* optional */ }
      status.textContent = "留言已发布，谢谢你的分享！"; await load();
    } catch (error) { status.textContent = error instanceof TypeError ? "网络连接失败，评论已保留，可稍后重试。" : error.message; }
    finally { sending = false; submit.disabled = false; submit.textContent = "提交评论"; }
  });
  load();
})();
