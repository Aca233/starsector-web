import {spriteCapacityExperiment} from './lib/sprite-capacity-experiment.mjs';
// Real, isolated WebGL2 parity for the production batcher. Never uses a user profile.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
const {chromium}=createRequire(import.meta.url)('playwright');
const out=path.resolve(process.env.BATCH_TEST_OUT??'artifacts/network-stream-20260922/phase39/batch-parity');await fs.mkdir(out,{recursive:true});
const code=(await build({stdin:{contents:`export {SpriteBatcher} from './src/engine/render/webgl/SpriteBatcher'; export {Vector2} from './src/engine/math/Vector2';`,resolveDir:process.cwd()},plugins:[{name:'test-only-capacity',setup(b){b.onLoad({filter:/[\\/]SpriteBatcher\.ts$/},args=>({contents:spriteCapacityExperiment,loader:'ts',resolveDir:path.dirname(args.path)}));}}],bundle:true,write:false,format:'iife',globalName:'fixture',platform:'browser',define:{'import.meta.env':'{}'}})).outputFiles[0].text;
const browser=await chromium.launch({headless:true,args:[...(process.env.MULTIPLAYER_ANGLE?['--use-angle='+process.env.MULTIPLAYER_ANGLE]:[]),'--enable-unsafe-swiftshader']});const errors=[];
try{
 const page=await browser.newPage({viewport:{width:320,height:240}});page.on('pageerror',e=>errors.push(e.message));await page.setContent('<canvas width="192" height="128"></canvas>');await page.addScriptTag({content:code});
 const results=[];for(const antialias of [false,true]){await page.setContent('<canvas width="192" height="128"></canvas>');
 const result=await page.evaluate(async antialias=>{
  const canvas=document.querySelector('canvas'),gl=canvas.getContext('webgl2',{preserveDrawingBuffer:true,antialias});if(!gl)throw Error('WebGL2 required');
  const debug=gl.getExtension('WEBGL_debug_renderer_info'),renderer=gl.getParameter(debug?.UNMASKED_RENDERER_WEBGL??gl.RENDERER);const reports=[];
  function run(slots,kind){
   const batch=new fixture.SpriteBatcher(gl,slots),textures=[];
   for(let i=0;i<19;i++){const tex=gl.createTexture();gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,tex);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,2,2,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([220-i*23,30+i*29,50,180,60,230,30+i*30,160,30,60,210,120,200,200,40,210]));textures.push(tex);}
   gl.viewport(0,0,192,128);gl.clearColor(.05,.08,.1,1);gl.clear(gl.COLOR_BUFFER_BIT);const calls=[];
   for(let round=0;round<(kind==='resume'?3:1);round++){
    batch.begin(new fixture.Vector2(96,64),1,192,128);if(kind==='empty')batch.flush();
    const count=kind==='capacity'?4097:kind==='empty'?0:180;
    for(let i=0;i<count;i++){
     if(kind!=='capacity'&&i%11===0)batch.setBlendMode(i%22===0?'NORMAL':'ADDITIVE');
     if(kind==='resume'&&i%17===0){batch.flush();gl.useProgram(null);gl.bindVertexArray(null);gl.activeTexture(gl.TEXTURE3);batch.resumeProgram();}
     if(kind==='flush'&&i%7===0)batch.flush();
     const small=kind==='capacity';batch.drawSprite(textures[small?0:i%textures.length],(i*17+round*3)%192,(i*23)%128,small?1:13,small?1:19,small?0:i*.1,.1,-.15,.7,.8,1,small?.5:.37,0,0,1,1);
    }
    batch.end();calls.push(batch.drawCalls);
   }
   const pixels=new Uint8Array(192*128*4);gl.readPixels(0,0,192,128,gl.RGBA,gl.UNSIGNED_BYTE,pixels);const error=gl.getError();
   const refs=[batch.instanceVBO,batch.quadVBO];batch.dispose();const released=refs.every(b=>!gl.isBuffer(b));for(const t of textures)gl.deleteTexture(t);
   return {pixels,calls,error,released};
  }
  for(const slots of [4,8,16])for(const kind of ['mixed','flush','capacity','resume','empty']){const before=run(1,kind),after=run(slots,kind);let different=0;for(let i=0;i<before.pixels.length;i++)if(before.pixels[i]!==after.pixels[i])different++;
   reports.push({kind,slots,different,beforeCalls:before.calls,afterCalls:after.calls,error:before.error||after.error,released:before.released&&after.released});}
  const ext=gl.getExtension('WEBGL_lose_context');if(!ext)throw Error('Context loss test extension unavailable');
  await new Promise(resolve=>{canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();setTimeout(()=>ext.restoreContext(),0);},{once:true});canvas.addEventListener('webglcontextrestored',resolve,{once:true});ext.loseContext();});
  const a=run(1,'mixed'),b=run(16,'mixed');let delta=0;for(let i=0;i<a.pixels.length;i++)if(a.pixels[i]!==b.pixels[i])delta++;
  return {antialias,actualAntialias:gl.getContextAttributes().antialias,samples:gl.getParameter(gl.SAMPLES),renderer,reports,restored:{different:delta,error:a.error||b.error,released:a.released&&b.released}};
 },antialias);results.push(result);
 await fs.writeFile(path.join(out,'result.json'),JSON.stringify({results,errors},null,2));assert.deepEqual(errors,[]);
 for(const row of [...result.reports,result.restored]){assert.equal(row.different,0);assert.equal(row.error,0);assert.equal(row.released,true);if(row.beforeCalls)for(let i=0;i<row.beforeCalls.length;i++)assert.ok(row.afterCalls[i]<=row.beforeCalls[i]);}
 for(const row of result.reports.filter(r=>r.kind==='capacity'))assert.deepEqual(row.afterCalls,[2]);
 console.log(JSON.stringify({passed:true,cases:result.reports.length+1,antialias,renderer:result.renderer,errors},null,2));}

}finally{await browser.close();}
