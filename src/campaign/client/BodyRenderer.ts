import { runtimeAssetUrl } from '../../engine/runtime/RuntimePaths';
import type { BodyView } from './Protocol';
import { nativePlanetMesh, planetLightPosition, planetRotationMatrix, bodySurfaceAngle, screenPosition } from './BodyGeometry.mjs';

type RGBA = readonly number[];
export interface PlanetDrawSpec {
  kind: 'planet'; isStar: boolean; texture: string; planetColor: RGBA; tilt: number; pitch: number; rotation: number;
  cloudTexture: string | null; cloudColor: RGBA; cloudRotation: number;
  glowTexture: string | null; glowColor: RGBA; useReverseLightForGlow: boolean;
  atmosphereColor: RGBA; atmosphereThickness: number; atmosphereThicknessMin: number;
  coronaTexture: string | null; coronaColor: RGBA; coronaSize: number; lightPosition: readonly number[];
}
export interface CustomDrawSpec { kind: 'custom'; sprite: string | null; width: number; height: number; color: RGBA; alphaMult: number; additive: boolean; showInCampaign: boolean }
export type BodyDrawSpec = PlanetDrawSpec | CustomDrawSpec;
export function campaignAsset(path: string): string {
  if (!/^graphics\/[a-zA-Z0-9_ /.-]+\.(png|jpg|jpeg)$/.test(path) || path.split('/').includes('..')) throw new Error('Invalid campaign texture path');
  return runtimeAssetUrl('/game-assets/' + path);
}
const vertex = `#version 300 es
precision highp float;
in vec3 aNormal; in vec2 aUV;
uniform vec2 uViewport; uniform vec2 uCenter; uniform float uZoom; uniform float uRadius;
uniform mat3 uRotation; uniform vec3 uLight; uniform float uZOffset; uniform float uLighting;
uniform float uQuad; uniform vec2 uSize; uniform float uFacing;
out vec2 vUV; out float vFront; out float vLight;
void main() {
  vec3 n = uRotation * aNormal;
  vec2 pos = n.xy * uRadius;
  if (uQuad > .5) { float c=cos(uFacing),s=sin(uFacing); pos=(aUV-.5)*uSize; pos=mat2(c,s,-s,c)*pos; }
  vec2 pixel=uCenter+vec2(pos.x,-pos.y)*uZoom;
  gl_Position=vec4(pixel.x/uViewport.x*2.-1.,1.-pixel.y/uViewport.y*2.,0.,1.);
  vUV=aUV; vFront=uQuad>.5?1.:n.z;
  vec3 light=normalize(uLight-(n*uRadius+vec3(0.,0.,uZOffset)));
  vLight=uLighting<.5?1.:clamp((uLighting<1.5?.24:0.)+max(dot(n,light),0.),0.,1.);
}`;
const fragment = `#version 300 es
precision highp float;
uniform sampler2D uTexture; uniform vec4 uColor;
in vec2 vUV; in float vFront; in float vLight; out vec4 result;
void main(){ if(vFront<0.)discard; vec4 tex=texture(uTexture,vUV); result=vec4(tex.rgb*uColor.rgb*vLight,tex.a*uColor.a); }
`;
const atmosphereVertex = `#version 300 es
precision highp float;
in vec2 aXY; uniform vec2 uViewport; uniform vec2 uCenter; uniform float uExtent; uniform float uZoom;
out vec2 vPosition;
void main(){vPosition=aXY*uExtent;vec2 pixel=uCenter+vec2(vPosition.x,-vPosition.y)*uZoom;gl_Position=vec4(pixel.x/uViewport.x*2.-1.,1.-pixel.y/uViewport.y*2.,0.,1.);}`;
const atmosphereFragment = `#version 300 es
precision highp float;
uniform sampler2D uTexture; uniform vec4 uColor; uniform float uInner; uniform float uThickness; uniform vec3 uLight; uniform float uUseLight; uniform float uReverse;
in vec2 vPosition; out vec4 result;
void main(){float d=length(vPosition);float t=(d-uInner)/uThickness;if(t<0.||t>1.)discard;
 float angular=1.;if(uUseLight>.5){vec2 l=uReverse>.5?-uLight.xy:uLight.xy;float angle=acos(clamp(dot(normalize(vPosition),normalize(l)),-1.,1.));float p=pow(1.-angle/3.141592654,uReverse>.5?2.:1.5);float xy=length(uLight.xy)/max(1.,length(uLight));angular=1.-xy+xy*p;}
 vec4 tex=texture(uTexture,vec2(0.,t*.99));result=vec4(tex.rgb*uColor.rgb,tex.a*uColor.a*angular);}`;
function program(gl: WebGL2RenderingContext, vs: string, fs: string) {
  const compile = (type: number, source: string) => { const shader = gl.createShader(type)!; gl.shaderSource(shader, source); gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { const info = gl.getShaderInfoLog(shader); gl.deleteShader(shader); throw Error('Campaign shader: ' + info); } return shader; };
  const v = compile(gl.VERTEX_SHADER, vs), f = compile(gl.FRAGMENT_SHADER, fs), p = gl.createProgram()!;
  gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p); gl.deleteShader(v); gl.deleteShader(f);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { const info = gl.getProgramInfoLog(p); gl.deleteProgram(p); throw Error('Campaign program: ' + info); } return p;
}
/** One reusable GPU scene, original texture assets and GLU 32x32 sphere topology. */
export class BodyRenderer {
  private gl: WebGL2RenderingContext;
  private p: WebGLProgram; private atmosphere: WebGLProgram;
  private mesh: WebGLBuffer; private quad: WebGLBuffer; private atmosphereQuad: WebGLBuffer;
  private textures = new Map<string, WebGLTexture>(); private pending = new Map<string, Promise<void>>(); private disposed = false;
  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: true });
    if (!gl) throw new Error('WebGL2 unavailable'); this.gl = gl;
    this.p = program(gl, vertex, fragment); this.atmosphere = program(gl, atmosphereVertex, atmosphereFragment);
    const buffer = (data: Float32Array) => { const b = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); return b; };
    this.mesh = buffer(nativePlanetMesh());
    this.quad = buffer(new Float32Array([0,0,1,0,0, 0,0,1,1,0, 0,0,1,0,1, 0,0,1,0,1, 0,0,1,1,0, 0,0,1,1,1]));
    this.atmosphereQuad = buffer(new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]));
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.enable(gl.BLEND);
  }
  async load(paths: readonly string[]) {
    await Promise.all([...new Set(paths)].map(path => {
      if (this.textures.has(path)) return Promise.resolve(); const existing = this.pending.get(path); if (existing) return existing;
      const request = (async () => {
        const image = new Image(); image.src = campaignAsset(path); await image.decode(); if (this.disposed) return;
        const gl = this.gl, texture = gl.createTexture()!; gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        this.textures.set(path, texture);
      })().finally(() => this.pending.delete(path));
      this.pending.set(path, request); return request;
    }));
  }
  begin() {
    const ratio = Math.min(2, window.devicePixelRatio || 1), width = Math.round(this.canvas.clientWidth * ratio), height = Math.round(this.canvas.clientHeight * ratio);
    if (this.canvas.width !== width || this.canvas.height !== height) { this.canvas.width = width; this.canvas.height = height; }
    const gl = this.gl; gl.viewport(0, 0, width, height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
  }
  private blend(additive: boolean) { const gl = this.gl; gl.blendFuncSeparate(gl.SRC_ALPHA, additive ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA); }
  private uniform(p: WebGLProgram, name: string) { return this.gl.getUniformLocation(p, name); }
  private base(center: number[], zoom: number, quad: boolean) {
    const gl = this.gl, p = this.p; gl.useProgram(p); gl.bindBuffer(gl.ARRAY_BUFFER, quad ? this.quad : this.mesh);
    const n = gl.getAttribLocation(p, 'aNormal'), uv = gl.getAttribLocation(p, 'aUV');
    gl.enableVertexAttribArray(n); gl.vertexAttribPointer(n, 3, gl.FLOAT, false, 20, 0); gl.enableVertexAttribArray(uv); gl.vertexAttribPointer(uv, 2, gl.FLOAT, false, 20, 12);
    gl.uniform2f(this.uniform(p, 'uViewport'), this.canvas.clientWidth, this.canvas.clientHeight); gl.uniform2fv(this.uniform(p, 'uCenter'), center);
    gl.uniform1f(this.uniform(p, 'uZoom'), zoom); gl.uniform1f(this.uniform(p, 'uQuad'), quad ? 1 : 0); gl.uniform1i(this.uniform(p, 'uTexture'), 0);
  }
  private surface(path: string, color: RGBA, alpha: number, radius: number, matrix: number[], light: number[], lighting: number, z: number, additive: boolean) {
    const gl = this.gl, p = this.p, texture = this.textures.get(path); if (!texture) return;
    this.blend(additive); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform4f(this.uniform(p, 'uColor'), color[0]/255, color[1]/255, color[2]/255, color[3]/255*alpha);
    gl.uniform1f(this.uniform(p, 'uRadius'), radius); gl.uniformMatrix3fv(this.uniform(p, 'uRotation'), false, matrix); gl.uniform3fv(this.uniform(p, 'uLight'), light);
    gl.uniform1f(this.uniform(p, 'uLighting'), lighting); gl.uniform1f(this.uniform(p, 'uZOffset'), z); gl.drawArrays(gl.TRIANGLES, 0, 32*32*6);
  }
  draw(body: BodyView, visual: BodyDrawSpec, all: readonly BodyView[], camera: [number, number], zoom: number, seconds: number, coronaOnly = false) {
    const gl = this.gl, p = this.p, center = screenPosition(body.position, camera, this.canvas.clientWidth, this.canvas.clientHeight, zoom);
    const extent = (visual.kind === 'planet' ? body.radius * (visual.isStar ? visual.coronaSize : 1.5) : Math.max(visual.width, visual.height)) * zoom;
    if (center[0] < -extent || center[1] < -extent || center[0] > this.canvas.clientWidth + extent || center[1] > this.canvas.clientHeight + extent) return;
    if (visual.kind === 'custom') {
      if (coronaOnly !== visual.additive || !visual.showInCampaign || !visual.sprite) return;
      const texture = this.textures.get(visual.sprite); if (!texture) return;
      this.base(center, zoom, true); this.blend(visual.additive); gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform2f(this.uniform(p, 'uSize'), visual.width, visual.height); gl.uniform1f(this.uniform(p, 'uFacing'), (body.facingDegrees - 90)*Math.PI/180);
      gl.uniform1f(this.uniform(p, 'uLighting'), 0); gl.uniform4f(this.uniform(p, 'uColor'), visual.color[0]/255, visual.color[1]/255, visual.color[2]/255, visual.color[3]/255*visual.alphaMult);
      gl.drawArrays(gl.TRIANGLES, 0, 6); return;
    }
    if (body.surfacePhase === null || body.cloudPhase === null) return;
    if (coronaOnly) {
      if (!visual.isStar || !visual.coronaTexture) return; const texture = this.textures.get(visual.coronaTexture); if (!texture) return;
      this.base(center, zoom, true); this.blend(true); gl.bindTexture(gl.TEXTURE_2D, texture); gl.uniform2f(this.uniform(p, 'uSize'), body.radius*visual.coronaSize*2, body.radius*visual.coronaSize*2);
      gl.uniform1f(this.uniform(p, 'uFacing'), 0); gl.uniform1f(this.uniform(p, 'uLighting'), 0);
      gl.uniform4f(this.uniform(p, 'uColor'), visual.coronaColor[0]/255, visual.coronaColor[1]/255, visual.coronaColor[2]/255, visual.coronaColor[3]/255); gl.drawArrays(gl.TRIANGLES, 0, 6); return;
    }
    const source = all.find(b => b.id === body.lightSourceId)?.position ?? null;
    const light = planetLightPosition(body.position, body.radius, visual.lightPosition, source);
    const matrix = planetRotationMatrix(visual.tilt, visual.pitch, bodySurfaceAngle(body.surfacePhase, visual.rotation, seconds));
    this.base(center, zoom, false);
    for (const [offset, alpha] of [[0, 1], [.25, .37], [.5, .37]]) this.surface(visual.texture, visual.planetColor, alpha, body.radius+offset, matrix, light, visual.isStar ? 0 : 1, 0, false);
    if (visual.glowTexture && !visual.isStar) for (let i=0; i<(visual.useReverseLightForGlow?2:1); i++) this.surface(visual.glowTexture, visual.glowColor, 1, body.radius, matrix, [-light[0],-light[1],-light[2]*.75], visual.useReverseLightForGlow?2:0, 50, true);
    if (visual.cloudTexture) this.surface(visual.cloudTexture, visual.cloudColor, 1, body.radius, planetRotationMatrix(visual.tilt, visual.pitch, bodySurfaceAngle(body.cloudPhase, visual.cloudRotation, seconds)), light, visual.isStar?0:1, 100, visual.isStar);
    if (visual.atmosphereThickness > 0) {
      const a = this.atmosphere, thickness = Math.max(body.radius*visual.atmosphereThickness, visual.atmosphereThicknessMin), texture = this.textures.get('graphics/planets/atmosphere2.png'); if (!texture) return;
      gl.useProgram(a); gl.bindBuffer(gl.ARRAY_BUFFER, this.atmosphereQuad); const attr=gl.getAttribLocation(a,'aXY');gl.enableVertexAttribArray(attr);gl.vertexAttribPointer(attr,2,gl.FLOAT,false,8,0);gl.bindTexture(gl.TEXTURE_2D,texture);
      gl.uniform2f(this.uniform(a,'uViewport'),this.canvas.clientWidth,this.canvas.clientHeight);gl.uniform2fv(this.uniform(a,'uCenter'),center);gl.uniform1f(this.uniform(a,'uExtent'),body.radius+thickness*.6);
      gl.uniform1f(this.uniform(a,'uInner'),body.radius-thickness*.4);gl.uniform1f(this.uniform(a,'uThickness'),thickness);gl.uniform1f(this.uniform(a,'uZoom'),zoom);gl.uniform3fv(this.uniform(a,'uLight'),light);
      gl.uniform1f(this.uniform(a,'uUseLight'),source&&!visual.isStar?1:0);gl.uniform1i(this.uniform(a,'uTexture'),0);this.blend(visual.isStar);
      for (let reverse=0; reverse<(visual.glowTexture?2:1); reverse++) {
        const color=reverse?visual.glowColor:visual.atmosphereColor;gl.uniform1f(this.uniform(a,'uReverse'),reverse);gl.uniform4f(this.uniform(a,'uColor'),color[0]/255,color[1]/255,color[2]/255,color[3]/255*(reverse?.2:1));gl.drawArrays(gl.TRIANGLES,0,6);
      }
    }
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    const gl = this.gl;
    for (const texture of this.textures.values()) gl.deleteTexture(texture);
    this.textures.clear(); this.pending.clear();
    for (const buffer of [this.mesh, this.quad, this.atmosphereQuad]) gl.deleteBuffer(buffer);
    gl.deleteProgram(this.p); gl.deleteProgram(this.atmosphere);
    // The canvas belongs to React and can immediately be reused (StrictMode).
    // Delete our resources, not the shared context. Browser loss is handled by the owner.
  }
}
