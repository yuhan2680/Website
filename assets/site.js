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

})();
