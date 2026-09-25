(() => {
  "use strict";
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const toggle = document.getElementById("nightToggle");
  const applyTheme = (theme) => {
    document.documentElement.dataset.theme = theme;
    document.body.classList.toggle("night", theme === "night");
    document.body.classList.toggle("light", theme !== "night");
    if (toggle) {
      toggle.textContent = theme === "night" ? "☀" : "☾";
      toggle.setAttribute("aria-pressed", String(theme === "night"));
      toggle.setAttribute("aria-label", theme === "night" ? "切换到浅色模式" : "切换到深色模式");
    }
  };
  applyTheme(document.documentElement.dataset.theme || "light");
  toggle?.addEventListener("click", () => {
    const theme = document.body.classList.contains("night") ? "light" : "night";
    applyTheme(theme);
    try { localStorage.setItem("naiwenel-theme", theme); } catch { /* optional */ }
  });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (event) => {
    let saved;
    try { saved = localStorage.getItem("naiwenel-theme"); } catch { /* optional */ }
    if (!saved) applyTheme(event.matches ? "night" : "light");
  });
  const hamburger = document.getElementById("hamburger"), menu = document.getElementById("menuList");
  const closeMenu = () => { menu?.classList.remove("show"); hamburger?.setAttribute("aria-expanded", "false"); };
  hamburger?.addEventListener("click", () => hamburger.setAttribute("aria-expanded", String(menu.classList.toggle("show"))));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && menu?.classList.contains("show")) { closeMenu(); hamburger.focus(); }
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".menu-function") || event.target.closest(".menu-item")) closeMenu();
  });
  const top = document.getElementById("backToTop");
  const updateTop = () => { if (top) top.hidden = scrollY <= 400; };
  window.addEventListener("scroll", updateTop, { passive: true });
  top?.addEventListener("click", () => window.scrollTo({ top: 0, behavior: reduced.matches ? "instant" : "smooth" }));
  updateTop();
  document.querySelectorAll(".friend-card img").forEach((img) => img.addEventListener("error", () => { img.src = "/avatar_logo.jpg"; }, { once: true }));

  const search = document.getElementById("postSearch"), filters = document.querySelectorAll("[data-filter]");
  let category = "all";
  function filterPosts() {
    let count = 0;
    const query = search?.value.trim().toLocaleLowerCase() || "";
    document.querySelectorAll("[data-post-card]").forEach((card) => {
      card.hidden = !((category === "all" || card.dataset.category === category) && card.textContent.toLocaleLowerCase().includes(query));
      if (!card.hidden) count++;
    });
    const result = document.getElementById("searchStatus");
    if (result) result.textContent = count ? `找到 ${count} 篇文章` : "还没有相关内容，换个关键词试试。";
  }
  search?.addEventListener("input", filterPosts);
  filters.forEach((button) => button.addEventListener("click", () => {
    category = button.dataset.filter;
    filters.forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
    filterPosts();
  }));

  // A quiet star field; low frame rate, bounded particles, no work in hidden tabs.
  const canvas = document.getElementById("star-canvas"), ctx = canvas?.getContext("2d");
  if (!ctx) return;
  let stars = [], bursts = [], frame = 0, last = 0, width = 0, height = 0;
  const pointer = { x: null, y: null };
  function resize() {
    width = innerWidth; height = innerHeight;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    stars = Array.from({ length: Math.min(85, Math.floor(width * height / 14000)) }, () => ({
      x: Math.random() * width, y: Math.random() * height, r: Math.random() * 1.1 + .5,
      dx: (Math.random() - .5) * .1, dy: (Math.random() - .5) * .1, phase: Math.random() * 6.28
    }));
  }
  function draw(time) {
    frame = requestAnimationFrame(draw);
    if (time - last < 33) return;
    const delta = Math.min((time - (last || time)) / 16.67, 3); last = time;
    ctx.clearRect(0, 0, width, height);
    const night = document.documentElement.dataset.theme === "night";
    ctx.fillStyle = night ? "#b2c4ff" : "#737eae";
    for (const star of stars) {
      star.x = (star.x + star.dx * delta + width) % width;
      star.y = (star.y + star.dy * delta + height) % height;
      ctx.globalAlpha = .25 + .25 * (1 + Math.sin(time / 2500 + star.phase)) / 2;
      ctx.beginPath(); ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2); ctx.fill();
      if (pointer.x !== null && Math.hypot(pointer.x - star.x, pointer.y - star.y) < 120) {
        ctx.globalAlpha = .12; ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = .6;
        ctx.beginPath(); ctx.moveTo(star.x, star.y); ctx.lineTo(pointer.x, pointer.y); ctx.stroke();
      }
    }
    bursts = bursts.filter((b) => b.life > 0);
    for (const b of bursts) {
      b.life -= .025 * delta; b.x += b.dx * delta; b.y += b.dy * delta;
      ctx.globalAlpha = Math.max(0, b.life); ctx.beginPath(); ctx.arc(b.x, b.y, 1.8, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  function sync() {
    cancelAnimationFrame(frame); frame = 0; last = 0; canvas.hidden = reduced.matches;
    if (!document.hidden && !reduced.matches) frame = requestAnimationFrame(draw);
  }
  window.addEventListener("resize", resize, { passive: true });
  window.addEventListener("pointermove", (e) => { if (e.pointerType === "mouse") { pointer.x = e.clientX; pointer.y = e.clientY; } }, { passive: true });
  document.addEventListener("pointerleave", () => { pointer.x = null; });
  window.addEventListener("pointerdown", (e) => {
    if (reduced.matches || e.target.closest("button, a, input, textarea")) return;
    for (let i = 0; i < 8 && bursts.length < 64; i++) bursts.push({ x: e.clientX, y: e.clientY, dx: (Math.random() - .5) * 2, dy: (Math.random() - .5) * 2, life: 1 });
  }, { passive: true });
  document.addEventListener("visibilitychange", sync); reduced.addEventListener("change", sync);
  resize(); sync();
})();
