(() => {
  "use strict";
  const canvas = document.getElementById("space-canvas");
  const ctx = canvas?.getContext("2d");
  if (!ctx) return;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const layer = document.createElement("canvas");
  const sky = layer.getContext("2d");
  const isHome = Boolean(document.querySelector(".hero"));
  let width = 0, height = 0, frame = 0, last = 0, elapsed = 0, stars = [], sphere = [];
  let pointerX = 0, pointerY = 0, offsetX = 0, offsetY = 0, scroll = scrollY;
  // A deterministic distribution keeps the sky from jumping when the viewport rotates.
  function random(seed) {
    return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  }
  function resize() {
    width = innerWidth; height = innerHeight;
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    layer.width = canvas.width; layer.height = canvas.height;
    sky.setTransform(dpr, 0, 0, dpr, 0, 0);
    const rand = random(2680);
    const count = Math.min(1300, Math.floor(width * height / 1000));
    for (let i = 0; i < count; i++) {
      const x = rand() * width, y = rand() * height, radius = .2 + rand() * .65;
      sky.fillStyle = i % 5 === 0 ? "#9bbacd" : "#dce2e9";
      sky.globalAlpha = .12 + rand() * .35;
      sky.beginPath(); sky.arc(x, y, radius, 0, Math.PI * 2); sky.fill();
    }
    stars = Array.from({length:width < 700 ? 22 : 45}, () => ({x:rand()*width,y:rand()*height,r:.45+rand()*.8,phase:rand()*Math.PI*2,depth:.2+rand()*.8}));
    sphere = Array.from({length:width < 700 ? 900 : 2000}, () => {
      const y = rand() * 2 - 1, angle = rand() * Math.PI * 2, r = Math.sqrt(1-y*y);
      return {x:Math.cos(angle)*r,y,z:Math.sin(angle)*r,size:.4+rand()*.7};
    });
    draw();
  }
  function draw() {
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(layer, 0, 0, width, height);
    offsetX += (pointerX - offsetX) * .035; offsetY += (pointerY - offsetY) * .035;
    for (const star of stars) {
      const x = star.x + offsetX * star.depth, y = star.y + offsetY * star.depth;
      ctx.globalAlpha = .28 + (1 + Math.sin(elapsed / 4000 + star.phase)) * .2;
      ctx.fillStyle = "#e6f2ff"; ctx.beginPath(); ctx.arc(x,y,star.r,0,Math.PI*2); ctx.fill();
    }
    const fade = isHome ? Math.max(0, 1 - scroll / 670) : 0;
    if (fade > 0) {
      const radius = Math.min(width * .24, 300), centerX = width * .77 + offsetX * .8, centerY = Math.min(355,height*.42) + offsetY*.8 - scroll*.14;
      const rotation = elapsed / 120000, sin = Math.sin(rotation), cos = Math.cos(rotation);
      for (const p of sphere) {
        const x = p.x*cos + p.z*sin, z = p.z*cos - p.x*sin;
        if (z < -.12) continue;
        const light = Math.max(.03, -x*.65-p.y*.3+z*.4);
        ctx.globalAlpha = light * fade * .7;
        ctx.fillStyle = p.y > .48 ? "#bec3c5" : "#a6cbd9";
        ctx.beginPath(); ctx.arc(centerX+x*radius,centerY+p.y*radius,p.size*(.75+z*.35),0,Math.PI*2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
  function tick(time) {
    frame = requestAnimationFrame(tick);
    if (time - last < 42) return;
    elapsed += Math.min(80,time-(last||time)); last=time; draw();
  }
  function sync() {
    cancelAnimationFrame(frame); frame=0; last=0;
    if (!document.hidden && !reduced.matches) frame=requestAnimationFrame(tick);
    else draw();
  }
  window.addEventListener("pointermove", event => {
    if (reduced.matches || event.pointerType !== "mouse") return;
    pointerX=(event.clientX/width-.5)*12; pointerY=(event.clientY/height-.5)*9;
  }, {passive:true});
  window.addEventListener("scroll", () => { scroll=scrollY; if(reduced.matches) draw(); }, {passive:true});
  window.addEventListener("resize", resize, {passive:true});
  document.addEventListener("visibilitychange", sync); reduced.addEventListener("change", sync);
  resize(); sync();
})();
