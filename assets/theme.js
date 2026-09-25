(() => {
  document.documentElement.classList.add("js");
  let theme;
  try { theme = localStorage.getItem("naiwenel-theme"); } catch { /* optional preference */ }
  if (!["light", "night"].includes(theme)) theme = "light";
  document.documentElement.dataset.theme = theme;
})();
