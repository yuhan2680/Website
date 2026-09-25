(() => {
  "use strict";
  const button = document.getElementById("live2dToggle"), skin = document.getElementById("live2dSkin"), status = document.getElementById("live2dStatus");
  if (!button) return;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const portrait = matchMedia("(orientation: portrait)");
  const controls = button.closest(".live2d-controls");
  const dock = document.createElement("aside");
  dock.className = "live2d-dock";
  dock.setAttribute("aria-label", "Live2D");
  controls.replaceWith(dock);
  dock.append(controls);
  document.body.classList.toggle("has-live2d", !portrait.matches);
  let app, model, visible = false, busy = false, currentSkin = "green";
  try { currentSkin = localStorage.getItem("live2d-skin") === "blue" ? "blue" : "green"; } catch { /* optional */ }
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
    core.setParameterValueById("Param9", 1);
    core.setParameterValueById("Param8", value);
  }
  function updateSkinButton() {
    skin.dataset.skin = currentSkin;
    const name = currentSkin === "green" ? "绿色 · 鸡蛋花" : "蓝色 · 蝴蝶结";
    skin.title = `当前：${name}（点击切换）`;
    skin.setAttribute("aria-label", `当前：${name}，切换为${currentSkin === "green" ? "蓝色蝴蝶结" : "绿色鸡蛋花"}`);
  }
  function fit() {
    // Reserve a rail for the fixed bottom-left character, including on narrow screens.
    const width = Math.floor(innerWidth >= 1500 ? 240 : innerWidth >= 900 ? 180 : innerWidth >= 600 ? 140 : Math.max(72, Math.min(96, innerWidth * .24)));
    const height = Math.floor(Math.min(400, innerHeight * .52, width * 1.6));
    document.documentElement.style.setProperty("--live2d-rail", (width + (innerWidth < 600 ? 14 : 24)) + "px");
    dock.style.width = width + "px";
    dock.style.setProperty("--model-height", height + "px");
    if (!app || !model) return;
    app.renderer.resize(width, height);
    model.scale.set(1);
    const bounds = model.getLocalBounds();
    // Keep the head and upper body large; the canvas crops the lower body.
    const scale = Math.max(width * .94 / bounds.width, height * .95 / (bounds.height * .66));
    model.scale.set(scale);
    model.position.set(app.screen.width / 2 - (bounds.x + bounds.width / 2) * scale, 12 - bounds.y * scale);
    if (!app.ticker.started) renderStill();
  }
  function renderStill() {
    if (!model) return;
    model.update(0);
    model.internalModel.update(0, model.elapsedTime);
    app.renderer.render(app.stage);
  }
  function sync() {
    if (!app) return;
    const showing = visible && !portrait.matches;
    document.body.classList.toggle("has-live2d", showing);
    app.view.hidden = !showing;
    if (showing && !document.hidden && !reduced.matches) app.start();
    else { app.stop(); if (showing) renderStill(); }
    skin.hidden = !visible;
    button.textContent = visible ? "隐藏" : "显示";
    button.setAttribute("aria-label", visible ? "隐藏 Live2D" : "显示 Live2D");
    button.setAttribute("aria-pressed", String(visible));
  }
  async function loadModel() {
    if (busy) return;
    busy = true; button.disabled = true; button.textContent = "加载中";
    status.textContent = "";
    try {
      if (!window.PIXI) await loadScript("/live2d/libs/pixi.min.js");
      if (!window.Live2DCubismCore) await loadScript("/live2d/libs/live2dcubismcore.min.js");
      if (!window.PIXI.live2d) await loadScript("/live2d/libs/cubism4.min.js");
      app = new PIXI.Application({ width: 240, height: 430, transparent: true, antialias: true, autoDensity: true, resolution: Math.min(devicePixelRatio || 1, 2), autoStart: false });
      app.view.id = "live2dCanvas"; app.view.hidden = true; app.view.setAttribute("aria-hidden", "true");
      dock.prepend(app.view);
      model = await PIXI.live2d.Live2DModel.from(encodeURI("/live2d/小涵_vts/小涵 .model3.json"), { autoInteract: false, autoUpdate: false });
      app.stage.addChild(model); app.ticker.maxFPS = 30;
      // Apply outfit parameters after motion/physics and before Cubism updates the mesh.
      model.internalModel.on("beforeModelUpdate", applySkin);
      app.ticker.add(() => model.update(app.ticker.deltaMS));
      fit(); updateSkinButton(); visible = true; status.textContent = ""; sync();
    } catch {
      if (app) app.destroy(true, { children: true, texture: true, baseTexture: true });
      app = null; model = null; visible = false;
      document.body.classList.remove("has-live2d");
      button.textContent = "重试";
      button.setAttribute("aria-label", "重新加载 Live2D");
      status.textContent = "Live2D 加载失败，请重试。";
    } finally { busy = false; button.disabled = false; }
  }
  button.addEventListener("click", () => {
    if (busy) return;
    if (app && model) { visible = !visible; sync(); }
    else loadModel();
  });
  skin.addEventListener("click", () => {
    currentSkin = currentSkin === "green" ? "blue" : "green";
    try { localStorage.setItem("live2d-skin", currentSkin); } catch { /* optional */ }
    updateSkinButton(); sync();
  });
  window.addEventListener("resize", fit, { passive: true });
  window.addEventListener("pointermove", (event) => {
    if (!visible || portrait.matches || reduced.matches || event.pointerType !== "mouse") return;
    const bounds = app.view.getBoundingClientRect();
    model?.focus(event.clientX - bounds.left, event.clientY - bounds.top);
  }, { passive: true });
  document.addEventListener("visibilitychange", sync); reduced.addEventListener("change", sync);
  portrait.addEventListener("change", () => {
    if (!portrait.matches && !app && !busy) loadModel();
    sync(); fit();
  });
  fit();
  updateSkinButton();
  if (!portrait.matches) loadModel();
})();
