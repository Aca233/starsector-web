import type {OriginalPlanetSphereCommand} from '../rules/OriginalFleetDraw.mjs';
import {planetRotationMatrix} from './BodyGeometry.mjs';
/** LWJGL 2 GLU Sphere.draw, GLU_FILL/OUTSIDE/textureFlag=true. Preserve Java
 * float angular steps and the QUAD_STRIP diagonal (a,b,d; a,d,c), not lat/long doubles. */
export function nativeCampaignPlanetMesh(){
 const f=Math.fround,detail=32,drho=f(f(Math.PI)/detail),dtheta=f(f(2*f(Math.PI))/detail),ds=f(1/detail),dt=ds,data:number[]=[];
 let t=1;for(let i=0;i<detail;i++){
  const rho=f(i*drho),strip:number[][]=[];let s=0;
  for(let j=0;j<=detail;j++){
   const theta=j===detail?0:f(j*dtheta),sin=f(Math.sin(theta)),cos=f(Math.cos(theta));
   for(const [r,v]of [[rho,t],[f(rho+drho),f(t-dt)]])strip.push([f(-sin*f(Math.sin(r))),f(cos*f(Math.sin(r))),f(Math.cos(r)),s,v]);s=f(s+ds);
  }
  for(let j=0;j<detail;j++){const a=j*2;for(const k of [a,a+1,a+3,a,a+3,a+2])data.push(...strip[k]);}t=f(t-dt);
 }
 return new Float32Array(data);
}
const vertex=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPosition; layout(location=1) in vec2 aUV;
uniform mat3 uRotation; uniform vec2 uOrigin; uniform vec2 uViewport; uniform float uZoom; uniform float uRadius; uniform float uZ;
uniform vec4 uColor; uniform float uMaterialAmbient; uniform bool uLit; uniform bool uSecond;
uniform vec3 uLight0; uniform vec3 uDiffuse0; uniform vec3 uLight1; uniform vec3 uDiffuse1;
out vec2 vUV; out vec4 vColor;
vec3 lightDirection(vec3 delta){float distance=length(delta);return distance>0.?delta/distance:vec3(0.);}
void main(){
 vec3 n=uRotation*aPosition; vec3 p=uRotation*(aPosition*uRadius)+vec3(0.,0.,uZ);
 vec3 color=uColor.rgb;
 if(uLit){
  // Fixed-function per-VERTEX lighting: global ambient .2, light0 ambient white,
  // light1 ambient=diffuse color; no attenuation, emission or specular.
  vec3 ambient=vec3(.2)+vec3(1.)+(uSecond?uDiffuse1:vec3(0.));
  vec3 diffuse=uDiffuse0*max(0.,dot(n,lightDirection(uLight0-p)));
  if(uSecond)diffuse+=uDiffuse1*max(0.,dot(n,lightDirection(uLight1-p)));
  color=uColor.rgb*(ambient*uMaterialAmbient+diffuse);
 }
 vColor=clamp(vec4(color,uColor.a),0.,1.); vUV=aUV;
 gl_Position=vec4((p.xy+uOrigin)*uZoom*2./uViewport,0.,1.);
}`;
const fragment=`#version 300 es
precision highp float;
uniform sampler2D uTexture; in vec2 vUV; in vec4 vColor; out vec4 result;
void main(){result=texture(uTexture,vUV)*vColor;}`;
export function validateNativePlanetSurface(c:OriginalPlanetSphereCommand){
 const finite=(v:readonly number[],n:number)=>Array.isArray(v)&&v.length===n&&v.every(Number.isFinite);
 if(!finite(c.rotation,3)||!finite(c.color,4)||c.color.some(n=>n<0||n>1)||![c.radius,c.z,c.materialAmbient].every(Number.isFinite)||c.radius<0||c.materialAmbient<0||c.blendSrc!==770||![1,771].includes(c.blendDest))throw Error('Invalid native planet surface');
 if(c.lighting!==null&&!c.lighting?.primary)throw Error('Missing native primary light');
 if(c.lighting!==null)for(const light of [c.lighting.primary,c.lighting.secondary])if(light&&(!finite(light.position,3)||!finite(light.diffuse,3)||light.diffuse.some(n=>n<0||n>1)))throw Error('Invalid native planet light');
}
export class NativePlanetSurface {
 private program:WebGLProgram;private vao:WebGLVertexArrayObject;private buffer:WebGLBuffer;private count:number;private uniforms=new Map<string,WebGLUniformLocation|null>();
 constructor(private gl:WebGL2RenderingContext,compile:(gl:WebGL2RenderingContext,vs:string,fs:string)=>WebGLProgram){
  this.program=compile(gl,vertex,fragment);const vao=gl.createVertexArray(),buffer=gl.createBuffer();if(!vao||!buffer)throw Error('Native planet GPU allocation failed');this.vao=vao;this.buffer=buffer;
  const mesh=nativeCampaignPlanetMesh();this.count=mesh.length/5;const oldVAO=gl.getParameter(gl.VERTEX_ARRAY_BINDING),oldBuffer=gl.getParameter(gl.ARRAY_BUFFER_BINDING);
  gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,mesh,gl.STATIC_DRAW);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,20,0);gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,2,gl.FLOAT,false,20,12);gl.bindVertexArray(oldVAO);gl.bindBuffer(gl.ARRAY_BUFFER,oldBuffer);
  for(const name of ['uRotation','uOrigin','uViewport','uZoom','uRadius','uZ','uColor','uMaterialAmbient','uLit','uSecond','uLight0','uDiffuse0','uLight1','uDiffuse1','uTexture'])this.uniforms.set(name,gl.getUniformLocation(this.program,name));
 }
 draw(c:OriginalPlanetSphereCommand,texture:WebGLTexture,origin:readonly [number,number],camera:{width:number;height:number;zoom:number}){
  const gl=this.gl,u=(name:string)=>this.uniforms.get(name)!;gl.useProgram(this.program);gl.bindVertexArray(this.vao);gl.enable(gl.CULL_FACE);gl.cullFace(gl.BACK);gl.frontFace(gl.CCW);gl.disable(gl.DEPTH_TEST);
  gl.uniformMatrix3fv(u('uRotation'),false,planetRotationMatrix(...c.rotation));gl.uniform2f(u('uOrigin'),...origin);gl.uniform2f(u('uViewport'),camera.width,camera.height);gl.uniform1f(u('uZoom'),camera.zoom);gl.uniform1f(u('uRadius'),c.radius);gl.uniform1f(u('uZ'),c.z);gl.uniform4f(u('uColor'),...c.color);gl.uniform1f(u('uMaterialAmbient'),c.materialAmbient);
  gl.uniform1i(u('uLit'),c.lighting?1:0);gl.uniform1i(u('uSecond'),c.lighting?.secondary?1:0);
  for(const [i,light]of [c.lighting?.primary,c.lighting?.secondary].entries()){gl.uniform3f(u('uLight'+i),...(light?.position??[0,0,0] as [number,number,number]));gl.uniform3f(u('uDiffuse'+i),...(light?.diffuse??[0,0,0] as [number,number,number]));}
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);gl.uniform1i(u('uTexture'),0);gl.blendFunc(c.blendSrc,c.blendDest);gl.drawArrays(gl.TRIANGLES,0,this.count);return this.count;
 }
 dispose(){this.gl.deleteBuffer(this.buffer);this.gl.deleteVertexArray(this.vao);this.gl.deleteProgram(this.program);}
}
