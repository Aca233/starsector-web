import type { CombatRenderView } from '../CombatRenderView';
import type { WebGLPassContext } from './WebGLPassContext';
import { WebGLShaderUtil } from './WebGLShaderUtil';

const vertex=`#version 300 es
out vec2 uv;
void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));uv=p;gl_Position=vec4(p*2.-1.,0.,1.);}`;
const fragment=`#version 300 es
precision highp float;
in vec2 uv;out vec4 color;
uniform sampler2D scene;
uniform vec2 camera,worldSize,center,endPoint;
uniform float radius,power,clock,progress;
uniform int kind;
void main(){
 vec2 world=camera+(uv-.5)*worldSize*vec2(1.,-1.);
 vec2 d=world-center;float r=length(d),R=max(radius,1.);
 vec2 normal=d/max(r,.01),offset=vec2(0.);float mask=0.,dim=0.,light=0.;
 if(kind==3){
  vec2 axis=endPoint-center;float len=max(length(axis),1.);vec2 dir=axis/len,side=vec2(-dir.y,dir.x);
  float along=dot(d,dir)/len,perp=dot(d,side),t=clamp(along,0.,1.);
  float width=R*(.35+.65*sin(t*3.141593));
  mask=exp(-pow(perp/max(width,1.),2.))*smoothstep(0.,.07,along)*(1.-smoothstep(.9,1.04,along));
  offset=side*sin(perp/max(width,1.)*3.)*mask*8.*power;
  offset+=dir*mask*3.*power*sin(clock*5.-t*11.);
  dim=mask*.035*power;
 }else if(kind==2){
  float band=(r-R)/max(24.,R*.045);
  mask=exp(-band*band)*power;
  offset=normal*mask*12.;light=mask*.025;
 }else{
  float q=r/R;mask=(1.-smoothstep(.72,1.,q))*power;
  float core=kind==0?.11:mix(.16,.025,progress);
  float ridge=exp(-pow((q-core)/.022,2.));
  offset=-normal*mask*(kind==0?7.:20.)*(.3+.7*exp(-pow((q-core)/.22,2.)));
  offset+=vec2(-normal.y,normal.x)*mask*(kind==0?2.:6.)*sin(clock*.9+q*5.);
  dim=exp(-pow(q/max(core,.02),4.))*power*(kind==0?.35:.5);
  light=ridge*power*.035;
 }
 if(mask<.001){color=vec4(0.);return;}
 vec2 bend=offset/worldSize*vec2(1.,-1.);
 vec2 safe=clamp(uv+bend,vec2(.001),vec2(.999));
 vec3 sampleColor=texture(scene,safe).rgb;
 // Small chromatic shear, not a luminous laser or a colored screen wash.
 sampleColor.r=texture(scene,clamp(safe+bend*.08,vec2(.001),vec2(.999))).r;
 sampleColor.b=texture(scene,clamp(safe-bend*.08,vec2(.001),vec2(.999))).b;
 color=vec4(sampleColor*(1.-dim)+vec3(.55,.7,.78)*light,min(.88,mask));
}`;
interface Lens {x:number;y:number;endX:number;endY:number;radius:number;power:number;progress:number;kind:number}

/** Copies the real combat image once, then refracts bounded regions before HUD.
 * All geometry and timing are authority state; this pass never alters simulation. */
export class GravityLensPass {
 private program?:WebGLProgram;private texture?:WebGLTexture;private vao?:WebGLVertexArrayObject;
 private width=0;private height=0;private alpha=true;public drawCalls=0;
 constructor(private readonly gl:WebGL2RenderingContext){}
 private prepare(width:number,height:number,alpha:boolean):void{
  const gl=this.gl;
  if(!this.program){
   this.program=WebGLShaderUtil.createProgram(gl,vertex,fragment);
   for(const shader of gl.getAttachedShaders(this.program)??[]){gl.detachShader(this.program,shader);gl.deleteShader(shader);}
   this.texture=gl.createTexture()??undefined;this.vao=gl.createVertexArray()??undefined;
   if(!this.texture||!this.vao)throw Error('Gravity lens GPU allocation failed');
  }
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.texture!);
  if(width!==this.width||height!==this.height||alpha!==this.alpha){
   // Default alpha:false canvases are RGB; reduced-resolution attachments are RGBA.
   // WebGL2 rejects a copy from RGB into a sized RGBA8 destination.
   gl.texImage2D(gl.TEXTURE_2D,0,alpha?gl.RGBA8:gl.RGB8,width,height,0,alpha?gl.RGBA:gl.RGB,gl.UNSIGNED_BYTE,null);
   gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
   gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
   this.width=width;this.height=height;this.alpha=alpha;
  }
 }
 render(engine:CombatRenderView,ctx:WebGLPassContext):void{
  this.drawCalls=0;const lenses:Lens[]=[];
  for(const ship of engine.ships){
   if(ship.isDead||ship.hullHp<=0||ship.isDocked||ship.isRetreated||!ship.isVisibleTo(engine.playerShip.teamId))continue;
   for(const system of ship.allSystems){
    const f=system.gravityField;if(!f||system.disabled||!system.isActive||system.state==='OUT')continue;
    const kind=f.kind==='WELL'?0:f.kind==='COLLAPSE'?1:2;
    const power=f.kind==='REPULSOR'?Math.max(0,1-(f.age/(f.duration??.4))**2):f.kind==='COLLAPSE'&&system.state==='ACTIVE'?Math.max(0,1-f.age/(f.duration??.35)):system.effectLevel;
    lenses.push({x:f.x,y:f.y,endX:f.x,endY:f.y,radius:f.radius,power,kind,progress:system.state==='IN'?system.effectLevel:1});
   }
   const pos=ship.interpolatedPos(ctx.alpha),facing=ship.interpolatedFacing(ctx.alpha);
   for(const mount of ship.weapons){
    const s=mount.gravityTractor;if(!s||s.phase==='IDLE'||mount.isDisabled)continue;
    const p=pos.clone().add(mount.relativePos.clone().rotate(facing));
    lenses.push({x:p.x,y:p.y,endX:s.contactX,endY:s.contactY,radius:32,power:s.phase==='HOLD'?1:Math.min(.7,s.capture/.22),kind:3,progress:0});
   }
  }
  const rows=lenses.filter(f=>f.power>.005&&f.radius>0).sort((a,b)=>b.kind-a.kind).filter(f=>{
   const pad=f.radius+30;return Math.max(f.x,f.endX)+pad>=ctx.viewport.left&&Math.min(f.x,f.endX)-pad<=ctx.viewport.right&&Math.max(f.y,f.endY)+pad>=ctx.viewport.bottom&&Math.min(f.y,f.endY)-pad<=ctx.viewport.top;
  }).slice(0,24);
  if(!rows.length)return;
  const gl=this.gl;ctx.batcher.flush();
  const viewport=gl.getParameter(gl.VIEWPORT) as Int32Array,w=viewport[2],h=viewport[3];
  const alpha=gl.getParameter(gl.FRAMEBUFFER_BINDING)!==null||gl.getContextAttributes()?.alpha!==false;
  this.prepare(w,h,alpha);gl.copyTexSubImage2D(gl.TEXTURE_2D,0,0,0,0,0,w,h);
  gl.useProgram(this.program!);gl.bindVertexArray(this.vao!);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
  const uniform=(name:string)=>gl.getUniformLocation(this.program!,name);
  gl.uniform1i(uniform('scene'),0);gl.uniform2f(uniform('camera'),ctx.cameraPos.x,ctx.cameraPos.y);
  gl.uniform2f(uniform('worldSize'),ctx.viewport.width,ctx.viewport.height);gl.uniform1f(uniform('clock'),engine.combatTime);
  const scissor=gl.isEnabled(gl.SCISSOR_TEST),box=gl.getParameter(gl.SCISSOR_BOX) as Int32Array;gl.enable(gl.SCISSOR_TEST);
  try{for(const f of rows){
   const pad=f.radius+30;
   const x0=Math.max(0,Math.floor((Math.min(f.x,f.endX)-pad-ctx.viewport.left)/ctx.viewport.width*w));
   const x1=Math.min(w,Math.ceil((Math.max(f.x,f.endX)+pad-ctx.viewport.left)/ctx.viewport.width*w));
   const y0=Math.max(0,Math.floor((ctx.viewport.top-Math.max(f.y,f.endY)-pad)/ctx.viewport.height*h));
   const y1=Math.min(h,Math.ceil((ctx.viewport.top-Math.min(f.y,f.endY)+pad)/ctx.viewport.height*h));
   if(x1<=x0||y1<=y0)continue;gl.scissor(x0,y0,x1-x0,y1-y0);
   gl.uniform2f(uniform('center'),f.x,f.y);gl.uniform2f(uniform('endPoint'),f.endX,f.endY);
   gl.uniform1f(uniform('radius'),f.radius);gl.uniform1f(uniform('power'),f.power);gl.uniform1f(uniform('progress'),f.progress);gl.uniform1i(uniform('kind'),f.kind);
   gl.drawArrays(gl.TRIANGLES,0,3);this.drawCalls++;
  }}finally{gl.scissor(box[0],box[1],box[2],box[3]);if(!scissor)gl.disable(gl.SCISSOR_TEST);gl.bindTexture(gl.TEXTURE_2D,null);gl.bindVertexArray(null);ctx.batcher.resumeProgram();}
 }
 get textureBytes():number{return this.width*this.height*(this.alpha?4:3);}
 dispose():void{const gl=this.gl;if(this.texture)gl.deleteTexture(this.texture);if(this.program)gl.deleteProgram(this.program);if(this.vao)gl.deleteVertexArray(this.vao);this.texture=undefined;this.program=undefined;this.vao=undefined;this.width=this.height=0;}
}
