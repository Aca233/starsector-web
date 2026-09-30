import { WebGLShaderUtil } from './WebGLShaderUtil';
import { ADUN_ARK_ART } from '../../content/AdunArkIds';
import { arkArt } from '../../visual/AdunArkArt';
import { arkSystemMaterialFrame, type ArkEmissionTile, type ArkSystemMaterial } from '../../visual/ArkSystemFX';
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
uniform sampler2D u_mask;
uniform sampler2D u_first;
uniform sampler2D u_next;
uniform vec4 u_rect;
uniform vec3 u_phase;
out vec4 fragColor;
void main(){
 vec4 native=texture(u_mask,v_uv);
 float light=max(native.r,max(native.g,native.b));
 // Registered baked emission defines the shape; no procedural noise, circles or rays.
 vec2 hull=u_rect.xy+v_uv*u_rect.zw;
 vec2 uv=fract(hull/vec2(160.,240.)-vec2(0.,u_phase.z));
 vec4 painted=mix(texture(u_first,uv),texture(u_next,uv),u_phase.y);
 float mask=native.a*smoothstep(.025,.25,light);
 fragColor=vec4(painted.rgb*(1.12+.22*light),mask*u_phase.x*(.65+.35*painted.a));
}`;
/** One bounded GPU material pass per CURRENT depth slice. No per-frame canvases,
 * no baked-frame multiplication, and no private animation/event clock. */
export class ArkSystemMaterialRenderer {
 private readonly program: WebGLProgram;
 private readonly buffer: WebGLBuffer;
 private readonly vao: WebGLVertexArrayObject;
 private readonly loc: Record<string, WebGLUniformLocation | null>;
 private readonly vertices = new Float32Array(24);
 public drawCalls = 0;
 constructor(private readonly gl: WebGL2RenderingContext) {
  this.program=WebGLShaderUtil.createProgram(gl,vs,fs);
  const buffer=gl.createBuffer(),vao=gl.createVertexArray();
  if(!buffer||!vao){if(buffer)gl.deleteBuffer(buffer);if(vao)gl.deleteVertexArray(vao);gl.deleteProgram(this.program);throw Error('Ark material GPU allocation failed');}
  this.buffer=buffer;this.vao=vao;
  this.loc=Object.fromEntries(['view','mask','first','next','rect','phase'].map(key=>[key,gl.getUniformLocation(this.program,'u_'+key)]));
  gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,this.vertices.byteLength,gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,16,0);
  gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,2,gl.FLOAT,false,16,8);gl.bindVertexArray(null);
 }
 render(ctx:WebGLPassContext,tile:ArkEmissionTile,pos:{x:number;y:number},facing:number,time:number,alpha:number,material:ArkSystemMaterial):void {
  const gl=this.gl,frame=arkSystemMaterialFrame(material,time),anchor=arkArt.parts.CORE.anchor,k=arkArt.scale;
  const angle=facing+Math.PI/2,c=Math.cos(angle),s=Math.sin(angle);
  let offset=0;
  for(const [u,v] of [[0,0],[1,0],[0,1],[0,1],[1,0],[1,1]]){
   const x=(tile.box[0]+u*tile.size[0]-anchor[0])*k,y=(tile.box[1]+v*tile.size[1]-anchor[1])*k;
   this.vertices[offset++]=pos.x+x*c-y*s;this.vertices[offset++]=pos.y+x*s+y*c;
   this.vertices[offset++]=u;this.vertices[offset++]=v;
  }
  ctx.batcher.flush();
  // Texture acquisition may upload on texture unit zero: acquire ALL before binding.
  const textures=[ADUN_ARK_ART+tile.file,frame.first,frame.next].map((url,i)=>ctx.textures.getTexture(url,i>0));
  gl.useProgram(this.program);gl.bindVertexArray(this.vao);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);
  gl.bufferSubData(gl.ARRAY_BUFFER,0,this.vertices);
  gl.uniformMatrix3fv(this.loc.view,false,ctx.batcher.currentViewProj);
  gl.uniform4f(this.loc.rect,...tile.box as [number,number],...tile.size as [number,number]);
  gl.uniform3f(this.loc.phase,alpha,frame.mix,frame.scroll);
  ['mask','first','next'].forEach((key,i)=>{gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,textures[i]);gl.uniform1i(this.loc[key],i);});
  gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
  gl.drawArrays(gl.TRIANGLES,0,6);this.drawCalls++;
  gl.activeTexture(gl.TEXTURE0);ctx.batcher.resumeProgram();
 }
 dispose():void{this.gl.deleteBuffer(this.buffer);this.gl.deleteVertexArray(this.vao);this.gl.deleteProgram(this.program);}
}
