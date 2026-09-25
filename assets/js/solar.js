(() => {
  "use strict";
  const canvas = document.querySelector(".solar-scene");
  const hero = document.querySelector(".hero");
  if (!canvas || !hero) return;
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) return;

  let frame = 0, previousSize = "";
  const visible = () => document.documentElement.dataset.theme !== "night" && !document.hidden;
  function random(seed) {
    return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  }

  function render() {
    frame = 0;
    if (!visible()) return;
    const width = document.documentElement.clientWidth, height = innerHeight;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const header = document.querySelector(".site-header").getBoundingClientRect().height;
    const bottom = hero.getBoundingClientRect().bottom + scrollY;
    const size = `${width}:${height}:${dpr}:${header}:${bottom}`;
    if (size === previousSize) return;
    previousSize = size;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);

    const compact = width < 700;
    const unit = Math.min(width / 1699, 1.25);
    const sun = compact
      ? { x: width * 1.48, y: header + 230, radius: width * .66 }
      : { x: width + 190 * unit, y: header + 300 * unit, radius: 570 * unit };
    const planets = compact ? [
      { x: width * .86, y: header + 145, radius: 9 },
      { x: width * .81, y: header + 250, radius: 14 },
      { x: width * .79, y: header + 340, radius: 17, ring: true },
      { x: width * .96, y: header + 402, radius: 8 }
    ] : [
      { x: width - 735 * unit, y: header + 145 * unit, radius: 24 * unit },
      { x: width - 575 * unit, y: header + 270 * unit, radius: 42 * unit },
      { x: width - 665 * unit, y: header + 420 * unit, radius: 50 * unit, ring: true },
      { x: width - 455 * unit, y: header + 510 * unit, radius: 22 * unit }
    ];

    // Batch the tiny points by opacity and size; the scene is drawn only on resize.
    function cloud(color) {
      const paths = Array.from({ length: 24 }, () => new Path2D());
      return {
        point(x, y, radius, opacity) {
          if (x < 0 || x > width || y < header || y > height) return;
          const fade = Math.max(0, Math.min(1, (bottom + 110 - y) / 170));
          const left = Math.max(0, Math.min(1, (x - width * (compact ? .57 : .47)) / 90));
          const alpha = opacity * fade * left * (compact ? .78 : 1);
          if (alpha < .04) return;
          const level = Math.min(7, Math.floor(alpha * 8));
          const dot = radius < .4 ? 0 : radius < .62 ? 1 : 2;
          const r = [.32, .5, .72][dot];
          paths[level * 3 + dot].moveTo(x + r, y);
          paths[level * 3 + dot].arc(x, y, r, 0, Math.PI * 2);
        },
        paint() {
          paths.forEach((path, index) => {
            context.fillStyle = `rgba(${color},${(Math.floor(index / 3) + .5) / 8})`;
            context.fill(path);
          });
        }
      };
    }

    const orbit = (x, y, rx, ry, rotation) => {
      context.beginPath();
      context.ellipse(x, y, rx, ry, rotation, 0, Math.PI * 2);
      context.stroke();
    };
    context.save();
    context.beginPath();
    context.rect(width * (compact ? .62 : .49), header, width, bottom - header);
    context.clip();
    context.strokeStyle = "rgba(113,139,150,.19)";
    context.lineWidth = .6;
    if (compact) {
      orbit(sun.x + 30, sun.y, width * .86, 176, -.12);
      orbit(sun.x + 30, sun.y - 25, width * .71, 106, .12);
    } else {
      orbit(width + 160 * unit, header + 280 * unit, 1010 * unit, 302 * unit, -.035);
      orbit(width + 110 * unit, header + 265 * unit, 735 * unit, 187 * unit, .075);
    }
    context.restore();

    const dust = cloud("163,152,128"), dustRandom = random(528);
    for (let i = 0; i < (compact ? 70 : 360); i++) {
      dust.point(width * (.49 + dustRandom() * .51), header + dustRandom() * (bottom - header), .2 + dustRandom() * .42, .15 + dustRandom() * .33);
    }
    dust.paint();

    function sphere(body, seed, isSun) {
      const rand = random(seed);
      const points = cloud(isSun ? "186,147,83" : "112,140,157");
      const count = isSun ? (compact ? 48000 : 158000) : Math.max(440, Math.round(body.radius ** 2 * 2.7));
      for (let i = 0; i < count; i++) {
        const y = rand() * 2 - 1, angle = rand() * Math.PI * 2;
        const radius = Math.sqrt(1 - y * y), x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
        if (z < 0) continue;
        const shell = i % 13 === 0 ? 1 + rand() * .035 : 1;
        const rim = (1 - z) ** 2;
        const light = Math.max(0, x * .75 - y * .25 + z * .6);
        const opacity = isSun ? .22 + rim * .43 + rand() * .22 : .18 + light * .3 + rim * .18 + rand() * .18;
        points.point(body.x + x * body.radius * shell, body.y + y * body.radius * shell, .23 + rand() * (isSun ? .58 : .4), opacity);
      }
      points.paint();
      if (body.ring) {
        const ring = cloud("112,140,157");
        const tilt = .24, cs = Math.cos(tilt), sn = Math.sin(tilt);
        for (let i = 0; i < 1600; i++) {
          const t = rand() * Math.PI * 2, spread = 1 + rand() * .065;
          const x = Math.cos(t) * body.radius * 1.68 * spread, y = Math.sin(t) * body.radius * .38 * spread;
          // The back of the ring passes behind the particle sphere.
          if (Math.sin(t) < 0 && x * x + y * y < body.radius ** 2) continue;
          ring.point(body.x + x * cs - y * sn, body.y + x * sn + y * cs, .23 + rand() * .24, .25 + rand() * .33);
        }
        ring.paint();
      }
    }
    sphere(sun, 2680, true);
    planets.forEach((planet, index) => sphere(planet, 940 + index * 67, false));
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(render);
  }
  window.addEventListener("resize", schedule, { passive: true });
  document.addEventListener("visibilitychange", schedule);
  new MutationObserver(schedule).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  new ResizeObserver(schedule).observe(hero);
  schedule();
})();
