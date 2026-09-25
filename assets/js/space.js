(() => {
  "use strict";
  const canvas = document.getElementById("space-canvas");
  if (!canvas) return;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const isHome = Boolean(document.querySelector(".hero"));
  const solarScene = document.querySelector(".solar-scene");
  const isNight = () => document.documentElement.dataset.theme === "night";
  const gl = canvas.getContext("webgl", { alpha: true, antialias: false, depth: false, powerPreference: "low-power" });
  let width = 0, height = 0, dpr = 1, frame = 0, last = 0, elapsed = 0, lost = false;
  let pointerX = 0, pointerY = 0, offsetX = 0, offsetY = 0, scroll = scrollY;
  let program, buffer, uniforms, starCount = 0, count = 0;

  function random(seed) {
    return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  }
  function updateSolar() {
    if (!solarScene) return;
    solarScene.style.setProperty("--solar-opacity", Math.max(0, 1 - scroll / 700));
    solarScene.style.setProperty("--solar-offset", `${-scroll * .12}px`);
  }
  // The content stays usable without WebGL; retain a static field of stars.
  if (!gl) {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const fallback = () => {
      canvas.width = innerWidth; canvas.height = innerHeight;
      const rand = random(2680);
      for (let i=0;i<550;i++) {
        ctx.fillStyle = `rgba(200,218,235,${.15+rand()*.4})`;
        ctx.fillRect(rand()*canvas.width,rand()*canvas.height,.5+rand(),.5+rand());
      }
    };
    fallback(); updateSolar();
    window.addEventListener("resize",fallback,{passive:true});
    window.addEventListener("scroll",()=>{scroll=scrollY;updateSolar();},{passive:true});
    return;
  }
  function shader(type, source) {
    const compiled = gl.createShader(type);
    gl.shaderSource(compiled,source); gl.compileShader(compiled);
    if (!gl.getShaderParameter(compiled,gl.COMPILE_STATUS)) { gl.deleteShader(compiled); throw new Error("Space shader could not compile"); }
    return compiled;
  }
  function init() {
    const vertex = shader(gl.VERTEX_SHADER, `
      attribute vec3 a_position;
      attribute vec3 a_style;
      uniform vec2 u_view;
      uniform vec2 u_center;
      uniform vec2 u_pointer;
      uniform float u_radius;
      uniform float u_time;
      uniform float u_fade;
      uniform float u_dpr;
      varying vec4 v_color;
      void main() {
        if (a_style.z < 0.5) {
          vec2 pos = a_position.xy + u_pointer / u_view * (0.5 + a_position.z) * vec2(2.0,-2.0);
          gl_Position = vec4(pos,0.0,1.0);
          gl_PointSize = a_style.x * u_dpr;
          float twinkle = 0.8 + 0.2 * sin(u_time*0.4+a_position.x*30.0);
          v_color = vec4(mix(vec3(0.60,0.73,0.86),vec3(0.96,0.94,0.88),a_position.z),a_style.y*twinkle);
        } else {
          float angle = u_time * 0.018;
          float sn = sin(angle), cs = cos(angle);
          vec3 p = vec3(a_position.x*cs+a_position.z*sn,a_position.y,a_position.z*cs-a_position.x*sn);
          vec3 normal = normalize(p);
          float front = smoothstep(-0.04,0.22,normal.z);
          float light = max(0.0,dot(normal,normalize(vec3(-0.85,0.5,0.65))));
          float rim = pow(1.0-abs(normal.z),3.0);
          float pattern = 0.72+0.28*sin(a_position.y*19.0+sin(a_position.x*13.0)*2.0+a_position.z*9.0);
          vec2 pixel = u_center + vec2(p.x,-p.y) * u_radius + u_pointer;
          vec2 clip = pixel/u_view*2.0-1.0;
          gl_Position = vec4(clip.x,-clip.y,0.0,1.0);
          gl_PointSize = a_style.x*u_dpr;
          vec3 color = mix(vec3(0.24,0.39,0.57),vec3(0.85,0.92,0.98),pow(light,0.7));
          v_color = vec4(color,a_style.y*(0.10+light*0.76+rim*0.18)*front*pattern*u_fade);
        }
      }
    `);
    const fragment = shader(gl.FRAGMENT_SHADER, `
      precision mediump float;
      varying vec4 v_color;
      void main() {
        float radius = length(gl_PointCoord-vec2(0.5))*2.0;
        float alpha = (1.0-smoothstep(0.12,1.0,radius))*v_color.a;
        if(alpha<0.01) discard;
        gl_FragColor = vec4(v_color.rgb,alpha);
      }
    `);
    program=gl.createProgram(); gl.attachShader(program,vertex); gl.attachShader(program,fragment); gl.linkProgram(program);
    gl.deleteShader(vertex); gl.deleteShader(fragment);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS)) throw new Error("Space shader could not link");
    gl.useProgram(program);
    buffer=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    for(const [name,offset] of [["a_position",0],["a_style",12]]) {
      const location=gl.getAttribLocation(program,name);
      gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location,3,gl.FLOAT,false,24,offset);
    }
    uniforms=Object.fromEntries(["view","center","pointer","radius","time","fade","dpr"].map(name=>[name,gl.getUniformLocation(program,"u_"+name)]));
    gl.enable(gl.BLEND); gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE,gl.ONE,gl.ONE_MINUS_SRC_ALPHA); gl.clearColor(0,0,0,0);
  }
  function resize() {
    if(lost) return;
    width=document.documentElement.clientWidth; height=innerHeight; dpr=Math.min(devicePixelRatio||1,1.5);
    canvas.width=Math.round(width*dpr); canvas.height=Math.round(height*dpr); gl.viewport(0,0,canvas.width,canvas.height);
    const rand=random(2680), data=[];
    starCount=Math.min(1700,Math.floor(width*height/850));
    for(let i=0;i<starCount;i++) data.push(rand()*2-1,rand()*2-1,rand(),.65+Math.pow(rand(),3)*2.1,.15+rand()*.6,0);
    if(isHome) {
      const particles=width<700?22000:65000;
      for(let i=0;i<particles;i++) {
        const y=rand()*2-1, angle=rand()*Math.PI*2, r=Math.sqrt(1-y*y);
        const dust=i%9===0, radius=dust?1+Math.pow(rand(),3)*.16:1+(rand()-.5)*.016;
        data.push(Math.cos(angle)*r*radius,y*radius,Math.sin(angle)*r*radius,1.05+Math.pow(rand(),2)*2.3,dust ? .20 : .5+rand()*.5,1);
      }
    }
    count=data.length/6; gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW); draw();
  }
  function draw() {
    if(lost || !uniforms || !isNight()) return;
    offsetX+=(pointerX-offsetX)*.05; offsetY+=(pointerY-offsetY)*.05;
    const fade=isHome?Math.max(0,1-scroll/740):0;
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(uniforms.view,width,height);
    gl.uniform2f(uniforms.center,width*(width<700?1.02:.85),Math.min(450,height*.48)-scroll*.16);
    gl.uniform2f(uniforms.pointer,offsetX,offsetY);
    gl.uniform1f(uniforms.radius,Math.min(width*.36,565));
    gl.uniform1f(uniforms.time,elapsed/1000); gl.uniform1f(uniforms.fade,fade); gl.uniform1f(uniforms.dpr,dpr);
    gl.drawArrays(gl.POINTS,0,fade>0?count:starCount);
  }
  function tick(time) {
    frame=requestAnimationFrame(tick);
    if(time-last<42) return;
    elapsed+=Math.min(80,time-(last||time)); last=time; draw();
  }
  function sync() {
    cancelAnimationFrame(frame); frame=0; last=0;
    if(!document.hidden&&!reduced.matches&&!lost&&isNight()&&uniforms) frame=requestAnimationFrame(tick);
    else draw();
  }
  window.addEventListener("pointermove",event=>{
    if(reduced.matches||event.pointerType!=="mouse") return;
    pointerX=(event.clientX/width-.5)*16; pointerY=(event.clientY/height-.5)*12;
  },{passive:true});
  window.addEventListener("scroll",()=>{scroll=scrollY;updateSolar();if(reduced.matches) draw();},{passive:true});
  window.addEventListener("resize",resize,{passive:true});
  document.addEventListener("visibilitychange",sync); reduced.addEventListener("change",sync);
  new MutationObserver(sync).observe(document.documentElement,{attributes:true,attributeFilter:["data-theme"]});
  canvas.addEventListener("webglcontextlost",event=>{event.preventDefault();lost=true;cancelAnimationFrame(frame);});
  canvas.addEventListener("webglcontextrestored",()=>{lost=false;init();resize();sync();});
  updateSolar();
  try { init();resize();sync(); } catch { canvas.hidden=true; lost=true; }
})();
