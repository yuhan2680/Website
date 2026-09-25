import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync('assets/js/solar.js','utf8');

// Exercise animation scheduling independently of the browser's GPU implementation.
function scene() {
  const target=()=>({
    listeners:new Map(),
    addEventListener(name,callback) { this.listeners.set(name,callback); },
    emit(name,event={}) { this.listeners.get(name)?.(event); }
  });
  const frames=new Map(), gpu={draws:0,uploads:0,time:0}, mutations=[];
  let nextFrame=0;
  const gl={
    VERTEX_SHADER:1,FRAGMENT_SHADER:2,COMPILE_STATUS:3,LINK_STATUS:4,ARRAY_BUFFER:5,FLOAT:6,
    BLEND:7,SRC_ALPHA:8,ONE_MINUS_SRC_ALPHA:9,ONE:10,STATIC_DRAW:11,COLOR_BUFFER_BIT:12,LINE_STRIP:13,POINTS:14,
    createShader:()=>({}),shaderSource(){},compileShader(){},getShaderParameter:()=>true,deleteShader(){},
    createProgram:()=>({}),attachShader(){},linkProgram(){},getProgramParameter:()=>true,useProgram(){},
    createBuffer:()=>({}),bindBuffer(){},getAttribLocation:()=>0,enableVertexAttribArray(){},vertexAttribPointer(){},
    getUniformLocation:(_,name)=>name,enable(){},blendFuncSeparate(){},clearColor(){},viewport(){},clear(){},
    bufferData(){gpu.uploads++;},uniform2f(){},uniform3f(){},
    uniform1f(name,value){if(name==='u_time')gpu.time=value;},
    drawArrays(){gpu.draws++;}
  };
  const canvas=Object.assign(target(),{getContext:()=>gl});
  const root={dataset:{theme:'day'},clientWidth:390};
  const document=Object.assign(target(),{hidden:false,documentElement:root});
  const window=target(), reduced=Object.assign(target(),{matches:false});
  const scope={
    document,window,innerHeight:844,devicePixelRatio:1,scrollY:0,
    matchMedia:()=>reduced,
    requestAnimationFrame(callback){frames.set(++nextFrame,callback);return nextFrame;},
    cancelAnimationFrame(id){frames.delete(id);},
    MutationObserver:class {constructor(callback){mutations.push(callback);}observe(){}},
    ResizeObserver:class {observe(){}},
    console:{error(error){throw error;}}
  };
  document.querySelector=selector=>selector==='.solar-scene'?canvas:selector==='.hero'
    ?{getBoundingClientRect:()=>({bottom:566-scope.scrollY})}
    :{getBoundingClientRect:()=>({height:70})};
  vm.runInNewContext(source,scope);
  return {
    frames,gpu,document,window,reduced,canvas,scope,
    theme(value){root.dataset.theme=value;mutations.forEach(callback=>callback());},
    step(time){const pending=[...frames.values()];frames.clear();pending.forEach(callback=>callback(time));}
  };
}

test('day particles advance without uploading geometry every frame; theme switches keep a single loop',()=>{
  const s=scene();
  assert.equal(s.frames.size,1);
  const draws=s.gpu.draws;
  s.step(0);s.step(50);s.step(100);
  assert.ok(s.gpu.draws>draws);
  assert.ok(s.gpu.time>0);
  assert.equal(s.gpu.uploads,1);
  s.window.emit('resize');s.theme('day');s.theme('day');
  assert.equal(s.frames.size,1);
  const time=s.gpu.time;
  s.theme('night');
  assert.equal(s.frames.size,0);
  const stopped=s.gpu.draws;
  s.step(5000);
  assert.equal(s.gpu.draws,stopped);
  s.theme('day');
  assert.equal(s.frames.size,1);
  assert.equal(s.gpu.time,time);
  s.step(6000);s.step(6050);
  assert.ok(s.gpu.time>time&&s.gpu.time<time+.1);
  assert.equal(s.gpu.uploads,1);
});

test('reduced motion, hidden tabs and scrolling past the scene pause and resume animation',()=>{
  const s=scene();
  s.reduced.matches=true;s.reduced.emit('change');
  assert.equal(s.frames.size,0);
  const still=s.gpu.draws;
  s.step(1000);
  assert.equal(s.gpu.draws,still);
  s.reduced.matches=false;s.reduced.emit('change');
  assert.equal(s.frames.size,1);
  s.document.hidden=true;s.document.emit('visibilitychange');
  assert.equal(s.frames.size,0);
  s.document.hidden=false;s.document.emit('visibilitychange');
  assert.equal(s.frames.size,1);
  s.scope.scrollY=750;s.window.emit('scroll');
  assert.equal(s.frames.size,0);
  s.scope.scrollY=0;s.window.emit('scroll');
  assert.equal(s.frames.size,1);
  assert.equal(s.gpu.uploads,1);
});

test('a restored WebGL context recreates geometry and resumes one animation loop',()=>{
  const s=scene();
  let prevented=false;
  s.canvas.emit('webglcontextlost',{preventDefault(){prevented=true;}});
  assert.equal(prevented,true);
  assert.equal(s.frames.size,0);
  s.canvas.emit('webglcontextrestored');
  assert.equal(s.frames.size,1);
  assert.equal(s.gpu.uploads,2);
  s.step(0);s.step(50);
  assert.ok(s.gpu.time>0);
});
