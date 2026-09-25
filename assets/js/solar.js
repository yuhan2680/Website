(() => {
  "use strict";
  const canvas = document.querySelector(".solar-scene");
  const hero = document.querySelector(".hero");
  if (!canvas || !hero) return;
  const gl = canvas.getContext("webgl", { alpha: true, antialias: false, depth: false, powerPreference: "low-power" });
  if (gl) { animateSolar(gl); return; }
  // Keep the approved static composition on devices without WebGL.
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

    const { compact, sun, planets, orbits } = layout(width, header, bottom);

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
    orbits.forEach(values => orbit(...values));
    context.restore();

    const dust = cloud("163,152,128"), dustRandom = random(528);
    for (let i = 0; i < (compact ? 70 : 360); i++) {
      dust.point(width * (.49 + dustRandom() * .51), header + dustRandom() * (bottom - header), .2 + dustRandom() * .42, .15 + dustRandom() * .33);
    }
    dust.paint();

    function sphere(body, seed, isSun) {
      const rand = random(seed);
      const points = cloud(isSun ? "186,147,83" : "103,133,153");
      const count = isSun ? (compact ? 48000 : 158000) : Math.max(440, Math.round(body.radius ** 2 * 2.7));
      for (let i = 0; i < count; i++) {
        const y = rand() * 2 - 1, angle = rand() * Math.PI * 2;
        const radius = Math.sqrt(1 - y * y), x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
        if (z < 0) continue;
        const shell = i % 13 === 0 ? 1 + rand() * .035 : 1;
        const rim = (1 - z) ** 2;
        const light = Math.max(0, x * .75 - y * .25 + z * .6);
        const opacity = isSun ? .22 + rim * .43 + rand() * .22 : .24 + light * .38 + rim * .2 + rand() * .16;
        points.point(body.x + x * body.radius * shell, body.y + y * body.radius * shell, .23 + rand() * (isSun ? .58 : .4), opacity);
      }
      points.paint();
      if (body.ring) {
        const ring = cloud("103,133,153");
        const tilt = .24, cs = Math.cos(tilt), sn = Math.sin(tilt);
        for (let i = 0; i < 1600; i++) {
          const t = rand() * Math.PI * 2, spread = 1 + rand() * .065;
          const x = Math.cos(t) * body.radius * 1.68 * spread, y = Math.sin(t) * body.radius * .38 * spread;
          // The back of the ring passes behind the particle sphere.
          if (Math.sin(t) < 0 && x * x + y * y < body.radius ** 2) continue;
          ring.point(body.x + x * cs - y * sn, body.y + x * sn + y * cs, .23 + rand() * .24, .3 + rand() * .33);
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

  function layout(width, header, bottom) {
    const compact = width < 700;
    const unit = Math.min(width / 1699, 1.25);
    const verticalUnit = Math.min(unit, (bottom - header) / 570);
    const sun = compact
      ? { x: width * 1.54, y: header + 230, radius: width * .66 }
      : { x: width + 190 * unit, y: header + 300 * verticalUnit, radius: 570 * unit };
    const planets = compact ? [
      { x: width * .86, y: header + 145, radius: 9 },
      { x: width * .81, y: header + 250, radius: 14 },
      { x: width * .79, y: header + 340, radius: 17, ring: true },
      { x: width * .96, y: header + 402, radius: 8 }
    ] : [
      { x: width - 735 * unit, y: header + 145 * verticalUnit, radius: 24 * unit },
      { x: width - 575 * unit, y: header + 270 * verticalUnit, radius: 42 * unit },
      { x: width - 665 * unit, y: header + 420 * verticalUnit, radius: 50 * unit, ring: true },
      { x: width - 455 * unit, y: header + 510 * verticalUnit, radius: 22 * unit }
    ];
    const orbits = compact ? [
      [sun.x + 30, sun.y, width * .86, 176, -.12],
      [sun.x + 30, sun.y - 25, width * .71, 106, .12]
    ] : [
      [width + 160 * unit, header + 280 * verticalUnit, 1010 * unit, 302 * verticalUnit, -.035],
      [width + 110 * unit, header + 265 * verticalUnit, 735 * unit, 187 * verticalUnit, .075]
    ];
    return { compact, sun, planets, orbits };
  }

  function animateSolar(gl) {
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let width = 0, height = 0, header = 0, bottom = 0, dpr = 1, compact = false;
    let frame = 0, last = null, elapsed = 0, lost = false, previousSize = "";
    let pointerX = 0, pointerY = 0, offsetX = 0, offsetY = 0, onscreen = scrollY < 700;
    let program, buffer, uniforms, batches = [];
    const active = () => !lost && !document.hidden && onscreen && document.documentElement.dataset.theme !== "night";

    function shader(type, source) {
      const compiled = gl.createShader(type);
      gl.shaderSource(compiled, source); gl.compileShader(compiled);
      if (!gl.getShaderParameter(compiled, gl.COMPILE_STATUS)) {
        gl.deleteShader(compiled); throw new Error("Solar shader could not compile");
      }
      return compiled;
    }
    function init() {
      const vertex = shader(gl.VERTEX_SHADER, `
        attribute vec3 a_position;
        attribute vec2 a_style;
        uniform vec2 u_view, u_center, u_pointer;
        uniform vec3 u_color;
        uniform float u_radius, u_time, u_speed, u_sun, u_dpr, u_header, u_bottom, u_compact;
        uniform mediump float u_kind;
        varying mediump vec4 v_color;
        void main() {
          vec2 pixel;
          float alpha;
          if (u_kind < 0.5) {
            pixel = a_position.xy + u_pointer * 0.35;
            alpha = a_style.y;
          } else if (u_kind < 1.5) {
            float angle = u_time * u_speed;
            float sn = sin(angle), cs = cos(angle);
            vec3 p = vec3(a_position.x*cs+a_position.z*sn, a_position.y, a_position.z*cs-a_position.x*sn);
            vec3 normal = normalize(p);
            float front = smoothstep(-0.025, 0.08, normal.z);
            float rim = pow(1.0-max(0.0, normal.z), 2.0);
            float light = max(0.0, dot(normal, vec3(0.75,-0.25,0.6)));
            alpha = mix(0.24+light*0.38+rim*0.2+a_style.y*0.16, 0.22+rim*0.43+a_style.y*0.22, u_sun);
            float pattern = 0.88+0.12*sin(a_position.y*19.0+sin(a_position.x*13.0)*2.0+a_position.z*9.0);
            float twinkle = 0.9+0.1*sin(u_time*0.4+a_position.x*30.0);
            alpha *= front * pattern * twinkle;
            pixel = u_center + p.xy * u_radius + u_pointer;
          } else {
            float angle = a_position.x + u_time * u_speed;
            vec2 p = vec2(cos(angle)*1.68, sin(angle)*0.38) * a_position.y;
            alpha = 0.3+a_style.y*0.33;
            if (sin(angle) < 0.0 && dot(p,p) < 1.0) alpha = 0.0;
            float cs = cos(0.24), sn = sin(0.24);
            pixel = u_center + vec2(p.x*cs-p.y*sn, p.x*sn+p.y*cs)*u_radius + u_pointer;
          }
          float fade = clamp((u_bottom+110.0-pixel.y)/170.0, 0.0, 1.0);
          float left = mix(0.47, 0.57, u_compact);
          alpha *= fade * clamp((pixel.x-u_view.x*left)/90.0, 0.0, 1.0) * mix(1.0,0.78,u_compact);
          if (pixel.y < u_header) alpha = 0.0;
          if (u_kind < -0.5 && (pixel.y > u_bottom || pixel.x < u_view.x*mix(0.49,0.62,u_compact))) alpha = 0.0;
          vec2 clip = pixel/u_view*2.0-1.0;
          gl_Position = vec4(clip.x,-clip.y,0.0,1.0);
          float size = a_style.x*u_dpr;
          gl_PointSize = max(1.0, size);
          if (u_kind > -0.5) alpha *= min(1.0, size*size);
          v_color = vec4(u_color,alpha);
        }
      `);
      const fragment = shader(gl.FRAGMENT_SHADER, `
        precision mediump float;
        uniform mediump float u_kind;
        varying mediump vec4 v_color;
        void main() {
          float alpha = v_color.a;
          if (u_kind > -0.5) {
            float radius = length(gl_PointCoord-vec2(0.5))*2.0;
            alpha *= 1.0-smoothstep(0.55,1.0,radius);
          }
          if (alpha < 0.01) discard;
          gl_FragColor = vec4(v_color.rgb,alpha);
        }
      `);
      program = gl.createProgram(); gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
      gl.deleteShader(vertex); gl.deleteShader(fragment);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("Solar shader could not link");
      gl.useProgram(program);
      buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      for (const [name, size, offset] of [["a_position",3,0],["a_style",2,12]]) {
        const location = gl.getAttribLocation(program, name);
        gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location, size, gl.FLOAT, false, 20, offset);
      }
      uniforms = Object.fromEntries(["view","center","pointer","color","radius","time","speed","kind","sun","dpr","header","bottom","compact"].map(name => [name, gl.getUniformLocation(program, "u_"+name)]));
      gl.enable(gl.BLEND); gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.clearColor(0,0,0,0);
      previousSize = "";
    }

    function resize() {
      width = document.documentElement.clientWidth; height = innerHeight;
      dpr = Math.min(devicePixelRatio || 1, 1.5);
      header = document.querySelector(".site-header").getBoundingClientRect().height;
      bottom = hero.getBoundingClientRect().bottom + scrollY;
      const size = `${width}:${height}:${dpr}:${header}:${bottom}`;
      if (size === previousSize) return;
      previousSize = size;
      canvas.width = Math.round(width*dpr); canvas.height = Math.round(height*dpr);
      gl.viewport(0,0,canvas.width,canvas.height);
      const scene = layout(width, header, bottom), data = [];
      compact = scene.compact; batches = [];
      const add = (kind, color, build, body = {x:0,y:0,radius:1}, sun = false, speed = .018) => {
        const first = data.length/5;
        build((x,y,z,size,opacity) => data.push(x,y,z,size,opacity));
        batches.push({ first, count:data.length/5-first, kind, color, body, sun, speed });
      };
      for (const [x,y,rx,ry,rotation] of scene.orbits) {
        add(-1, [113,139,150], point => {
          for (let i=0; i<=240; i++) {
            const angle = i/240*Math.PI*2, px = Math.cos(angle)*rx, py = Math.sin(angle)*ry;
            point(x+px*Math.cos(rotation)-py*Math.sin(rotation), y+px*Math.sin(rotation)+py*Math.cos(rotation), 0, 1, .14);
          }
        });
      }
      const dust = random(528);
      add(0, [163,152,128], point => {
        for (let i=0; i<(compact?70:360); i++) point(width*(.49+dust()*.51), header+dust()*(bottom-header), 0, .4+dust()*.84, .15+dust()*.33);
      });
      const sphere = (body, seed, sun, speed) => {
        const rand = random(seed), color = sun?[186,147,83]:[103,133,153];
        add(1, color, point => {
          const count = sun?(compact?48000:158000):Math.max(440,Math.round(body.radius**2*2.7));
          for (let i=0; i<count; i++) {
            const y = rand()*2-1, angle = rand()*Math.PI*2, r = Math.sqrt(1-y*y);
            const shell = i%13===0?1+rand()*.035:1;
            point(Math.cos(angle)*r*shell, y*shell, Math.sin(angle)*r*shell, .46+rand()*(sun?1.16:.8), rand());
          }
        }, body, sun, speed);
        if (body.ring) add(2, color, point => {
          for (let i=0; i<1600; i++) point(rand()*Math.PI*2, 1+rand()*.065, 0, .46+rand()*.48, rand());
        }, body, false, speed);
      };
      sphere(scene.sun, 2680, true, .018);
      scene.planets.forEach((body,index) => sphere(body,940+index*67,false,.026+index*.004));
      // Geometry stays on the GPU; animation only changes the time and pointer uniforms.
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
    }
    function draw() {
      if (!active()) return;
      offsetX = reduced.matches?0:offsetX+(pointerX-offsetX)*.05;
      offsetY = reduced.matches?0:offsetY+(pointerY-offsetY)*.05;
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform2f(uniforms.view,width,height); gl.uniform2f(uniforms.pointer,offsetX,offsetY);
      gl.uniform1f(uniforms.time,elapsed/1000); gl.uniform1f(uniforms.dpr,dpr);
      gl.uniform1f(uniforms.header,header); gl.uniform1f(uniforms.bottom,bottom); gl.uniform1f(uniforms.compact,compact?1:0);
      for (const batch of batches) {
        gl.uniform2f(uniforms.center,batch.body.x,batch.body.y); gl.uniform1f(uniforms.radius,batch.body.radius);
        gl.uniform3f(uniforms.color,...batch.color.map(value=>value/255));
        gl.uniform1f(uniforms.kind,batch.kind); gl.uniform1f(uniforms.sun,batch.sun?1:0); gl.uniform1f(uniforms.speed,batch.speed);
        gl.drawArrays(batch.kind<0?gl.LINE_STRIP:gl.POINTS,batch.first,batch.count);
      }
    }
    function tick(time) {
      frame = 0;
      if (!active() || reduced.matches) return;
      if (last === null) last = time;
      if (time-last >= 1000/24) {
        elapsed += Math.min(100,time-last); last = time; draw();
      }
      frame = requestAnimationFrame(tick);
    }
    function sync() {
      cancelAnimationFrame(frame); frame = 0; last = null;
      if (!active()) return;
      resize(); draw();
      if (!reduced.matches) frame = requestAnimationFrame(tick);
    }
    window.addEventListener("resize",sync,{passive:true});
    new ResizeObserver(sync).observe(hero);
    document.addEventListener("visibilitychange",sync); reduced.addEventListener("change",sync);
    new MutationObserver(sync).observe(document.documentElement,{attributes:true,attributeFilter:["data-theme"]});
    window.addEventListener("pointermove",event=>{
      if (reduced.matches || event.pointerType!=="mouse" || !active()) return;
      pointerX = (event.clientX/width-.5)*16; pointerY = (event.clientY/height-.5)*12;
    },{passive:true});
    window.addEventListener("scroll",()=>{
      const next = scrollY<700;
      if (onscreen!==next) { onscreen=next; sync(); }
    },{passive:true});
    canvas.addEventListener("webglcontextlost",event=>{event.preventDefault();lost=true;cancelAnimationFrame(frame);frame=0;});
    canvas.addEventListener("webglcontextrestored",()=>{lost=false;init();sync();});
    try { init(); sync(); } catch (error) { lost=true; canvas.hidden=true; console.error(error); }
  }
})();
