(() => {
  "use strict";
  const button = document.getElementById("live2dToggle"), skin = document.getElementById("live2dSkin"), status = document.getElementById("live2dStatus");
  if (!button) return;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let app, model, visible = false, busy = false, currentSkin = "green";
  try { currentSkin = localStorage.getItem("live2d-skin") || "green"; } catch { /* optional */ }
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script"); script.src = src;
      const timer = setTimeout(() => { script.remove(); reject(new Error("timeout")); }, 15000);
      script.onload = () => { clearTimeout(timer); resolve(); };
      script.onerror = () => { clearTimeout(timer); script.remove(); reject(new Error("load")); };
      document.head.appendChild(script);
    });
  }
  function applySkin() {
    const core = model?.internalModel?.coreModel;
    if (!core) return;
    const value = currentSkin === "green" ? 1 : 0;
    core.setParameterValueById("Param2", value); core.setParameterValueById("Param4", value);
  }
  function fit() {
    if (!app || !model) return;
    const width = innerWidth < 600 ? 170 : 240, height = innerWidth < 600 ? 280 : Math.min(430, innerHeight * .55);
    app.renderer.resize(width, height);
    model.scale.set(1);
    const bounds = model.getLocalBounds(), scale = Math.min(width * .92 / bounds.width, height * .95 / bounds.height);
    model.scale.set(scale);
    // app.screen is in CSS pixels; renderer.width includes devicePixelRatio.
    model.position.set(app.screen.width / 2 - (bounds.x + bounds.width / 2) * scale, app.screen.height - (bounds.y + bounds.height) * scale);
  }
  function sync() {
    if (!app) return;
    app.view.hidden = !visible;
    if (visible && !document.hidden && !reduced.matches) app.start();
    else { app.stop(); if (visible) app.renderer.render(app.stage); }
    skin.hidden = !visible;
    button.textContent = visible ? "收起小涵" : "召唤小涵 ✧";
    button.setAttribute("aria-pressed", String(visible));
  }
  button.addEventListener("click", async () => {
    if (busy) return;
    if (app && model) { visible = !visible; sync(); return; }
    busy = true; button.disabled = true; button.textContent = "小涵正在赶来…";
    status.textContent = "首次加载约 16 MB，请稍候。";
    try {
      if (!window.PIXI) await loadScript("/live2d/libs/pixi.min.js");
      if (!window.Live2DCubismCore) await loadScript("/live2d/libs/live2dcubismcore.min.js");
      if (!window.PIXI.live2d) await loadScript("/live2d/libs/cubism4.min.js");
      app = new PIXI.Application({ width: 240, height: 430, transparent: true, antialias: true, autoDensity: true, resolution: Math.min(devicePixelRatio || 1, 2), autoStart: false });
      app.view.id = "live2dCanvas"; app.view.setAttribute("aria-hidden", "true");
      document.body.appendChild(app.view);
      // Keep the existing model, expressions and skin parameters unchanged.
      model = await PIXI.live2d.Live2DModel.from(encodeURI("/live2d/小涵_vts/小涵 .model3.json"), { autoInteract: false });
      app.stage.addChild(model); app.ticker.maxFPS = 30; app.ticker.add(applySkin);
      fit(); applySkin(); visible = true; status.textContent = ""; sync();
    } catch {
      if (app) app.destroy(true, { children: true, texture: true, baseTexture: true });
      app = null; model = null; visible = false;
      button.textContent = "重新召唤小涵";
      status.textContent = "小涵暂时没能到达，可以稍后重试。";
    } finally { busy = false; button.disabled = false; }
  });
  skin.addEventListener("click", () => {
    currentSkin = currentSkin === "green" ? "blue" : "green";
    try { localStorage.setItem("live2d-skin", currentSkin); } catch { /* optional */ }
    applySkin(); sync();
  });
  window.addEventListener("resize", fit, { passive: true });
  window.addEventListener("pointermove", (event) => { if (visible && !reduced.matches && event.pointerType === "mouse") model?.focus(event.clientX, event.clientY); }, { passive: true });
  document.addEventListener("visibilitychange", sync); reduced.addEventListener("change", sync);
})();
