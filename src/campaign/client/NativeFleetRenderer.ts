import type { OriginalObserverFleetLayers } from '../rules/OriginalFleetPresentation.mjs';
import type { OriginalFleetDrawFrame } from '../rules/OriginalFleetDraw.mjs';
import type { OriginalMemberViewTexture } from '../rules/OriginalCampaignFleetMemberView.mjs';
import { campaignAsset } from './BodyRenderer';
import {NativePlanetSurface,validateNativePlanetSurface} from './NativePlanetSurface';

const vertex = `#version 300 es
precision highp float;
layout(location=0) in vec2 aPosition; layout(location=1) in vec2 aUV; layout(location=2) in vec4 aColor;
uniform vec2 uViewport; uniform vec2 uOrigin; uniform float uZoom;
out vec2 vUV; out vec4 vColor;
void main(){vec2 p=(aPosition+uOrigin)*uZoom;gl_Position=vec4(p*2./uViewport,0.,1.);vUV=aUV;vColor=aColor;}`;
const fragment = `#version 300 es
precision highp float;
uniform sampler2D uTexture; uniform bool uTextured;
in vec2 vUV; in vec4 vColor; out vec4 result;
void main(){result=(uTextured?texture(uTexture,vUV):vec4(1.))*vColor;}`;
const presentVertex = `#version 300 es
out vec2 vUV;
void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));vUV=p;gl_Position=vec4(p*2.-1.,0.,1.);}`;
const presentFragment = `#version 300 es
precision highp float; uniform sampler2D uTexture; in vec2 vUV; out vec4 result;
void main(){result=vec4(texture(uTexture,vUV).rgb,1.);}`;
function compile(gl: WebGL2RenderingContext, vs: string, fs: string) {
 const shader=(type:number,source:string)=>{const s=gl.createShader(type);if(!s)throw Error('Native fleet shader allocation failed');gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){const reason=gl.getShaderInfoLog(s);gl.deleteShader(s);throw Error('Native fleet shader: '+reason);}return s;};
 const v=shader(gl.VERTEX_SHADER,vs);let f:WebGLShader|null=null,p:WebGLProgram|null=null;
 try{f=shader(gl.FRAGMENT_SHADER,fs);p=gl.createProgram();if(!p)throw Error('Native fleet program allocation failed');gl.attachShader(p,v);gl.attachShader(p,f);gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error('Native fleet program: '+gl.getProgramInfoLog(p));return p;}catch(e){gl.deleteProgram(p);throw e;}finally{gl.deleteShader(v);gl.deleteShader(f);}
}
// Checkpoint canonicalization may reorder object keys; resource identity is these six values.
const textureKey=(d:OriginalMemberViewTexture)=>JSON.stringify([d.path,d.width,d.height,d.texWidth,d.texHeight,d.sha256]);
export interface NativeFleetCamera {center:readonly [number,number];width:number;height:number;zoom:number}
/** The original destination alpha is scratch storage, NOT DOM opacity.
 * beginScene provides one shared RGBA target for background/bodies/fleets; present copies RGB with alpha=1.
 * Never overlay this target onto the old reference world's transparent planet canvases.
 * A host must pass real native render frames; this class cannot synthesize them from fleet projections. */
export class NativeFleetRenderer {
 private planet:NativePlanetSurface;
 private p:WebGLProgram;private presentation:WebGLProgram;private vao:WebGLVertexArrayObject;private buffer:WebGLBuffer;
 private target:WebGLFramebuffer;private color:WebGLTexture;private width=0;private height=0;private disposed=false;
 private textures=new Map<string,{texture:WebGLTexture;descriptor:string}>();private pending=new Map<string,Promise<void>>();
 private viewport:WebGLUniformLocation|null;private origin:WebGLUniformLocation|null;private zoom:WebGLUniformLocation|null;private textured:WebGLUniformLocation|null;
 constructor(private gl:WebGL2RenderingContext){
  this.p=compile(gl,vertex,fragment);this.presentation=compile(gl,presentVertex,presentFragment);this.planet=new NativePlanetSurface(gl,compile);
  const vao=gl.createVertexArray(),buffer=gl.createBuffer(),target=gl.createFramebuffer(),color=gl.createTexture();
  if(!vao||!buffer||!target||!color)throw Error('Native fleet GPU allocation failed');this.vao=vao;this.buffer=buffer;this.target=target;this.color=color;
  const oldVAO=gl.getParameter(gl.VERTEX_ARRAY_BINDING),oldBuffer=gl.getParameter(gl.ARRAY_BUFFER_BINDING);
  gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
  for(const [location,count,offset]of [[0,2,0],[1,2,8],[2,4,16]]){gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,count,gl.FLOAT,false,32,offset);}
  gl.bindVertexArray(oldVAO);gl.bindBuffer(gl.ARRAY_BUFFER,oldBuffer);
  this.viewport=gl.getUniformLocation(this.p,'uViewport');this.origin=gl.getUniformLocation(this.p,'uOrigin');this.zoom=gl.getUniformLocation(this.p,'uZoom');this.textured=gl.getUniformLocation(this.p,'uTextured');
 }
 private alive(){if(this.disposed)throw Error('Native fleet renderer disposed');if(this.gl.isContextLost())throw Error('Native fleet WebGL context lost');}
 private async loadTexture(d:OriginalMemberViewTexture){
  this.alive();campaignAsset(d.path);const descriptor=textureKey(d),known=this.textures.get(d.path);
  if(known){if(known.descriptor!==descriptor)throw Error('Conflicting native texture descriptor: '+d.path);return;}
  const existing=this.pending.get(d.path);if(existing){await existing;return this.loadTexture(d);}
  const request=(async()=>{
   const image=new Image();image.src=campaignAsset(d.path);try{await image.decode();}catch(cause){throw Error('Native texture could not be decoded: '+d.path,{cause});}this.alive();
   if(image.naturalWidth!==d.width||image.naturalHeight!==d.height)throw Error('Native texture dimensions changed: '+d.path);
   const w=Math.round(d.width/d.texWidth),h=Math.round(d.height/d.texHeight);
   if(w<d.width||h<d.height||w>16384||h>16384||(w&(w-1))!==0||(h&(h-1))!==0)throw Error('Invalid native POT texture: '+d.path);
   const canvas=new OffscreenCanvas(d.width,d.height),ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw Error('Texture decoder unavailable');ctx.drawImage(image,0,0);
   const source=ctx.getImageData(0,0,d.width,d.height).data,bytes=new Uint8Array(w*h*4);
   // Native rows are bottom-up, padded only at top/right, with RGB zeroed at alpha=0.
   for(let y=0;y<d.height;y++)for(let x=0;x<d.width;x++){const from=((d.height-y-1)*d.width+x)*4,to=(y*w+x)*4;if(source[from+3]===0)continue;bytes.set(source.subarray(from,from+4),to);}
   const gl=this.gl,old=gl.getParameter(gl.TEXTURE_BINDING_2D),flip=gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL),premult=gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL),alignment=gl.getParameter(gl.UNPACK_ALIGNMENT),texture=gl.createTexture();if(!texture)throw Error('Native fleet texture allocation failed');
   try{gl.bindTexture(gl.TEXTURE_2D,texture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,bytes);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    const mipmap=d.width<=1024&&d.height<=1024;gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,mipmap?gl.LINEAR_MIPMAP_LINEAR:gl.LINEAR);if(mipmap)gl.generateMipmap(gl.TEXTURE_2D);
    this.textures.set(d.path,{texture,descriptor});
   }catch(e){gl.deleteTexture(texture);throw e;}finally{gl.bindTexture(gl.TEXTURE_2D,old);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,flip);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,premult);gl.pixelStorei(gl.UNPACK_ALIGNMENT,alignment);}
  })().finally(()=>this.pending.delete(d.path));this.pending.set(d.path,request);return request;
 }
 async load(frames:readonly OriginalFleetDrawFrame[]){
  const textures=new Map<string,OriginalMemberViewTexture>();for(const frame of frames)for(const c of frame.commands)if(c.kind!=='mask'&&c.texture){const old=textures.get(c.texture.path);if(old&&textureKey(old)!==textureKey(c.texture))throw Error('Conflicting native texture inputs');textures.set(c.texture.path,c.texture);}
  await Promise.all([...textures.values()].map(t=>this.loadTexture(t)));
 }
 async loadObserverLayers(layers:readonly OriginalObserverFleetLayers[]){await this.load(layers.flatMap(layer=>[layer.fleet,layer.contacts]));}
 /** Call once per layer, not once per fleet: contacts belong above ALL fleet geometry. */
 drawObserverLayer(layers:readonly OriginalObserverFleetLayers[],layer:'fleet'|'contacts',camera:NativeFleetCamera){
  if(layer!=='fleet'&&layer!=='contacts')throw Error('Invalid native observer layer');
  let draws=0,vertices=0;for(const entry of layers){if(entry.scope!=='native-observer-fleet-layers')throw Error('Actual observer layers required');const result=this.draw(entry[layer],camera);draws+=result.draws;vertices+=result.vertices;}return {draws,vertices};
 }
 /** Bind this complete-scene target, then let the host draw its actual background/bodies here too. */
 beginScene(width:number,height:number,clear:readonly [number,number,number,number]){
  this.alive();const gl=this.gl;if(!Number.isInteger(width)||!Number.isInteger(height)||width<=0||height<=0||width>gl.getParameter(gl.MAX_TEXTURE_SIZE)||height>gl.getParameter(gl.MAX_TEXTURE_SIZE))throw Error('Invalid native scene size');
  gl.bindFramebuffer(gl.FRAMEBUFFER,this.target);
  if(width!==this.width||height!==this.height){gl.bindTexture(gl.TEXTURE_2D,this.color);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,width,height,0,gl.RGBA,gl.UNSIGNED_BYTE,null);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,this.color,0);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Native scene framebuffer incomplete');this.width=width;this.height=height;}
  gl.viewport(0,0,width,height);gl.disable(gl.SCISSOR_TEST);gl.colorMask(true,true,true,true);gl.clearColor(...clear);gl.clear(gl.COLOR_BUFFER_BIT);gl.colorMask(true,true,true,false);
 }
 draw(frame:OriginalFleetDrawFrame,camera:NativeFleetCamera){
  this.alive();const gl=this.gl;if(gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING)!==this.target)throw Error('Native fleets require their shared RGBA scene target');
  if(frame.scope!=='native-campaign-fleet-draw'||![...frame.origin,...camera.center,camera.zoom,camera.width,camera.height].every(Number.isFinite)||camera.zoom<=0||camera.width<=0||camera.height<=0)throw Error('Invalid native fleet frame/camera');
  // Validate all resources before submitting any pixels. Missing textures must never become blank ships.
  for(const c of frame.commands)if(c.kind==='mask'){if(c.mask.length!==4||c.mask.some(v=>typeof v!=='boolean'))throw Error('Invalid native color mask');}else if(c.kind==='planet-sphere'){validateNativePlanetSurface(c);if(this.textures.get(c.texture.path)?.descriptor!==textureKey(c.texture))throw Error('Native planet texture not loaded: '+c.texture.path);}else if(c.kind==='quads'){for(const v of c.vertices)if(v.position.length!==2||v.uv.length!==2||![...v.position,...v.uv].every(Number.isFinite)||v.color.length!==4||v.color.some(n=>!Number.isInteger(n)||n<0||n>255))throw Error('Invalid native vertex');if(c.vertices.length%4||![0,1,770,771,772,773].includes(c.blendSrc)||![0,1,770,771,772,773].includes(c.blendDest))throw Error('Invalid native primitive/blend');if(c.texture&&this.textures.get(c.texture.path)?.descriptor!==textureKey(c.texture))throw Error('Native texture not loaded: '+c.texture.path);}
  gl.useProgram(this.p);gl.bindVertexArray(this.vao);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.disable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.disable(gl.SCISSOR_TEST);gl.enable(gl.BLEND);gl.blendEquation(gl.FUNC_ADD);gl.activeTexture(gl.TEXTURE0);gl.uniform1i(gl.getUniformLocation(this.p,'uTexture'),0);
  gl.uniform2f(this.viewport,camera.width,camera.height);gl.uniform2f(this.origin,frame.origin[0]-camera.center[0],frame.origin[1]-camera.center[1]);gl.uniform1f(this.zoom,camera.zoom);
  let draws=0,vertices=0;
  for(const c of frame.commands){if(c.kind==='mask'){gl.colorMask(...c.mask);continue;}if(c.kind==='planet-sphere'){
    vertices+=this.planet.draw(c,this.textures.get(c.texture.path)!.texture,[frame.origin[0]-camera.center[0],frame.origin[1]-camera.center[1]],camera);draws++;
    // Sphere state must not leak into the atmosphere, fleet shadow scratch or contacts.
    gl.disable(gl.CULL_FACE);gl.useProgram(this.p);gl.bindVertexArray(this.vao);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);continue;
   }if(!c.vertices.length)continue;const data=new Float32Array(c.vertices.length/4*6*8);let at=0;
   for(let q=0;q<c.vertices.length;q+=4)for(const k of [0,1,2,0,2,3]){const v=c.vertices[q+k];data[at++]=v.position[0];data[at++]=v.position[1];data[at++]=v.uv[0];data[at++]=v.uv[1];for(const channel of v.color)data[at++]=channel/255;}
   gl.bindTexture(gl.TEXTURE_2D,c.texture?this.textures.get(c.texture.path)!.texture:null);gl.uniform1i(this.textured,c.texture?1:0);gl.blendFunc(c.blendSrc,c.blendDest);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STREAM_DRAW);gl.drawArrays(gl.TRIANGLES,0,data.length/8);draws++;vertices+=data.length/8;
  }
  return {draws,vertices};
 }
 /** RGB presentation, never expose the native shadow scratch alpha as canvas transparency. */
 present(destination:WebGLFramebuffer|null=null){
  this.alive();if(!this.width)throw Error('Native scene has not begun');const gl=this.gl;if(destination===this.target)throw Error('Cannot present a texture into itself');gl.bindFramebuffer(gl.FRAMEBUFFER,destination);gl.viewport(0,0,this.width,this.height);gl.disable(gl.BLEND);gl.disable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.disable(gl.SCISSOR_TEST);gl.colorMask(true,true,true,true);gl.useProgram(this.presentation);gl.bindVertexArray(this.vao);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.color);gl.uniform1i(gl.getUniformLocation(this.presentation,'uTexture'),0);gl.drawArrays(gl.TRIANGLES,0,3);
 }
 dispose(){if(this.disposed)return;this.disposed=true;this.planet.dispose();const gl=this.gl;for(const t of this.textures.values())gl.deleteTexture(t.texture);this.textures.clear();this.pending.clear();gl.deleteTexture(this.color);gl.deleteFramebuffer(this.target);gl.deleteBuffer(this.buffer);gl.deleteVertexArray(this.vao);gl.deleteProgram(this.p);gl.deleteProgram(this.presentation);}
}
