import { WebGLShaderUtil } from './WebGLShaderUtil';
import { validSurfaceFeedback } from '../../visual/ShipSurfaceFeedback';
import type { ShipRenderState } from '../ShipRenderState';
import type { WebGLPassContext } from './WebGLPassContext';
const vs = `#version 300 es
precision highp float;
layout(location=0) in vec2 a_pos;
layout(location=1) in vec2 a_uv;
uniform mat3 u_view;
out vec2 v_uv;
void main(){gl_Position=vec4((u_view*vec3(a_pos,1.)).xy,0.,1.);v_uv=a_uv;}`;
const fs = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_hull;
uniform vec4 u_state;
uniform float u_time;
out vec4 fragColor;
void main(){
 vec4 hull=texture(u_hull,v_uv);
 float light=max(hull.r,max(hull.g,hull.b));
 // Existing gilding and relief define the lit geometry; no invented hull, rings or particles.
 float gold=smoothstep(.008,.095,hull.r-hull.b)*smoothstep(.09,.48,hull.r);
 float relief=smoothstep(.05,.5,light);
 float mode=u_state.x,level=u_state.y,progress=u_state.z;
 float mask=0.,energy=0.;vec3 color;
 if(mode<.5){
  float front=1.-smoothstep(progress-.12,progress+.03,v_uv.y);
  float travel=pow(.5+.5*cos((v_uv.y-u_time*.18)*6.283185),8.);
  mask=(.22*relief+.78*gold)*front;
  energy=level*(.36+.3*travel);color=vec3(1.,.69,.29);
 }else if(mode<1.5){
  float closure=1.-smoothstep(min(1.,progress*18.)-.16,min(1.,progress*18.)+.04,1.-abs(v_uv.x-.5)*2.);
  mask=(.3*relief+.7*gold)*closure;
  energy=level*(.58+.04*cos(u_time*3.));color=vec3(1.,.42,.16);
 }else{
  mask=.18*relief+.82*gold;energy=level*(.3+.3*pow(.5+.5*cos(u_time*4.),4.));color=vec3(1.,.13,.07);
 }
 fragColor=vec4(color*(.55+.45*light),hull.a*mask*energy*u_state.w);
}`;
/** Same texture, pivot and interpolated pose as the hull. No display-side lifecycle state. */
export class ShipSurfaceFeedbackRenderer {
 private readonly program: WebGLProgram;
 private readonly buffer: WebGLBuffer;
 private readonly vao: WebGLVertexArrayObject;
 private readonly loc: Record<string, WebGLUniformLocation | null>;
 private readonly vertices = new Float32Array(24);
 constructor(private readonly gl: WebGL2RenderingContext) {
  this.program=WebGLShaderUtil.createProgram(gl,vs,fs);
  const buffer=gl.createBuffer(),vao=gl.createVertexArray();
  if(!buffer||!vao){if(buffer)gl.deleteBuffer(buffer);if(vao)gl.deleteVertexArray(vao);gl.deleteProgram(this.program);throw Error('Surface feedback GPU allocation failed');}
  this.buffer=buffer;this.vao=vao;
  this.loc=Object.fromEntries(['view','hull','state','time'].map(k=>[k,gl.getUniformLocation(this.program,'u_'+k)]));
  gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,this.vertices.byteLength,gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,16,0);
  gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,2,gl.FLOAT,false,16,8);gl.bindVertexArray(null);
 }
 render(ctx:WebGLPassContext,ship:ShipRenderState,texture:WebGLTexture,pos:{x:number;y:number},facing:number,time:number,alpha:number):void {
  const state=ship.surfaceFeedback;
  if(!state||!validSurfaceFeedback(state)||state.level<=0||alpha<=0||ship.isDead||ship.isDocked||ship.isRetreated)return;
  const gl=this.gl,{spriteWidth:w,spriteHeight:h,pivotX,pivotY}=ship.spec;
  const angle=facing+Math.PI/2,c=Math.cos(angle),s=Math.sin(angle);let offset=0;
  for(const [u,v] of [[0,0],[1,0],[0,1],[0,1],[1,0],[1,1]]){
   const x=u*w-pivotX,y=v*h-pivotY;
   this.vertices[offset++]=pos.x+x*c-y*s;this.vertices[offset++]=pos.y+x*s+y*c;
   this.vertices[offset++]=u;this.vertices[offset++]=v;
  }
  ctx.batcher.flush();gl.useProgram(this.program);gl.bindVertexArray(this.vao);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);
  gl.bufferSubData(gl.ARRAY_BUFFER,0,this.vertices);gl.uniformMatrix3fv(this.loc.view,false,ctx.batcher.currentViewProj);
  gl.uniform4f(this.loc.state,state.mode==='ORDER'?0:state.mode==='SEALED'?1:2,state.level,state.progress,alpha);
  gl.uniform1f(this.loc.time,time);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);gl.uniform1i(this.loc.hull,0);
  gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE);gl.drawArrays(gl.TRIANGLES,0,6);
  ctx.batcher.resumeProgram();
 }
 dispose():void {this.gl.deleteBuffer(this.buffer);this.gl.deleteVertexArray(this.vao);this.gl.deleteProgram(this.program);}
}
