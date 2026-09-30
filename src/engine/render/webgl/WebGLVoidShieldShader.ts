import { WebGLShaderUtil } from './WebGLShaderUtil';
import type { Vector2 } from '../../math/Vector2';
import type { ShipRenderState } from '../ShipRenderState';

const VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 a_corner;
uniform mat3 u_viewProj;
uniform vec3 u_centerRadius;
out vec2 v_local;
void main() {
  v_local = a_corner * 1.24;
  vec2 world = u_centerRadius.xy + v_local * u_centerRadius.z;
  gl_Position = vec4((u_viewProj * vec3(world, 1.0)).xy, 0.0, 1.0);
}`;
const FS = `#version 300 es
precision highp float;
in vec2 v_local;
uniform sampler2D u_texture;
// remaining layers, deployed, first-layer reconstruction, simulation time
uniform vec4 u_screen;
// hit angle, remaining envelope, strength, configured layer count
uniform vec4 u_hit;
// break envelope, reactivation envelope, catastrophic break, rebuild enabled
uniform vec4 u_events;
uniform float u_shutdown;
// Ship-local orientation, not aim direction: generators stay attached while turning.
uniform vec2 u_facing;
out vec4 fragColor;
float band(float d, float center, float width) {
  return 1.0 - smoothstep(width, width + max(fwidth(d), .0008), abs(d-center));
}
float seed(float n) { return fract(sin(n*127.1 + 311.7)*43758.5453); }
float fieldNoise(vec2 p) {
  vec2 cell = floor(p), f = fract(p);
  f = f*f*(3.0-2.0*f);
  float n = cell.x + cell.y*57.0;
  return mix(mix(seed(n),seed(n+1.0),f.x),mix(seed(n+57.0),seed(n+58.0),f.x),f.y);
}
float pulse(float age, float sustain, float end) {
  return smoothstep(0.0,.055,age)*(1.0-smoothstep(sustain,end,age));
}
void main() {
  float r = length(v_local);
  float angle = atan(v_local.y, v_local.x);
  float time = u_screen.w;
  float online = u_screen.y;
  float restart = u_events.y * online;
  float starting = step(.001,restart);
  float startProgress = 1.0-restart;
  float closing = u_shutdown;
  float stopping = step(.001,closing);
  float stopProgress = 1.0-closing;
  vec2 hull = vec2(dot(v_local,u_facing),dot(v_local,vec2(-u_facing.y,u_facing.x)));
  float hullAngle = atan(hull.y,hull.x);
  float sectorCoord = (hullAngle+3.14159265)*12.0/6.2831853;
  float sector = min(11.0,floor(sectorCoord));
  float sectorAngle = (sector+.5)*6.2831853/12.0-3.14159265;
  float sectorSeed = seed(sector+7.0);
  // Bow-to-stern, slightly staggered field circuits, not a rotating clock sweep.
  float startDelay = .10+.48*(.72*(.5-.5*cos(sectorAngle))+.28*sectorSeed);
  float stopDelay = .025+.34*seed(sector+31.0);
  float shell = online * mix(1.0,smoothstep(startDelay,startDelay+.15,startProgress),starting);
  shell = max(shell,stopping*(1.0-smoothstep(stopDelay,stopDelay+.22,stopProgress)));
  vec3 light = vec3(0.0);
  vec3 blue = vec3(.26, .49, 1.0);
  vec3 white = vec3(.72, .88, 1.0);
  float inside = 1.0 - smoothstep(.99, 1.002, r);
  float tex = texture(u_texture, v_local*.5 + .5).a;
  // One almost-invisible textured membrane, not four parallel HUD circles.
  // Layer count remains authoritative HUD data, not decorative orbital rings.
  float restingTexture = .55+.45*tex;
  float restingEdge = exp(-abs(r-1.0)*170.0);
  vec3 fieldColor = vec3(.34,.49,.69);
  light += fieldColor * ((tex*.007+.007*pow(min(r,1.0),6.0))*inside + restingEdge*.065*restingTexture) * shell;

  if (starting > 0.0 || stopping > 0.0) {
    float phase = starting*startProgress + stopping*stopProgress;
    float grain = fieldNoise(hull*43.0+vec2(phase*.7,-phase*.4));
    float fine = fieldNoise(hull*137.0-vec2(phase*.35,phase*.8));
    float arcMask = pow(max(0.0,sin(fract(sectorCoord)*3.14159265)),.65);
    float circuitOn = pulse(startProgress-startDelay,.105,.32)*starting;
    float circuitOff = pulse(stopProgress-stopDelay,.035,.22)*stopping;
    float energy = (circuitOn + circuitOff*.55)*arcMask;
    // Fixed-radius short filaments embedded in a soft, irregular ionized curtain.
    // Neither the border nor the veil travels through the middle of the hull.
    float fieldEdge = .996 + (grain-.5)*.011;
    float filament = band(r,fieldEdge,.00055)*smoothstep(.25,.7,fine);
    float corona = exp(-pow((r-fieldEdge)/.018,2.0))*(.35+.65*grain);
    float curtain = smoothstep(.80,.96,r)*(1.0-smoothstep(.975,1.02,r));
    float dissolving = 1.0-smoothstep(.42,.96,stopProgress+(grain-.5)*.42);
    float power = energy * mix(1.0,dissolving,stopping);
    light += fieldColor*(corona*.38+curtain*grain*.16)*power;
    light += vec3(.64,.77,.91)*filament*.42*power;
    // Isolated contact sparks, never a continuous white neon perimeter.
    float spark = pow(max(0.0,sin(hullAngle*83.0+sectorSeed*31.0)),18.0);
    light += white*exp(-abs(r-fieldEdge)*260.0)*spark*power*.20;

    // Six compact generator glints along the hull; no giant center flash.
    for (int row=0; row<3; row++) {
      float longitudinal = .48-float(row)*.46;
      float lateral = row == 1 ? .185 : .15;
      float ignition = pulse(startProgress-(.015+float(row)*.072),.12,.40)*starting;
      float rundown = pulse(stopProgress-(float(row)*.055),.025,.18)*stopping*.24;
      for (int side=0; side<2; side++) {
        vec2 d = (hull-vec2(longitudinal,lateral*(float(side)*2.0-1.0)))/vec2(.028,.017);
        float distanceSquared = dot(d,d);
        light += (fieldColor*exp(-distanceSquared)*.48 + white*exp(-distanceSquared*6.0)*.65)*(ignition+rundown);
      }
    }
  }
  // The actual world-space impact direction comes from authoritative collision.
  float hit = u_hit.y;
  vec2 contact = vec2(cos(u_hit.x), sin(u_hit.x));
  float dist = length(v_local-contact);
  float age = 1.0-hit;
  float contactGate = 1.0-smoothstep(1.0,1.08,r);
  float ripple = band(dist, .018 + age*.28, .004) + .55*band(dist, .01+age*.16, .002);
  light += (blue*ripple*.85 + white*exp(-dist*dist/ .003)*1.4) * hit * u_hit.z * contactGate;
  light += white*exp(-abs(r-1.0)*75.0)*exp(-dist*dist/.09)*hit*u_hit.z*.6;
  // Broken layers leave a fragmented, outward-moving corona, even when inactive.
  float breaking = u_events.x;
  float progress = 1.0-breaking;
  float fracture = smoothstep(-.35,.5,sin(angle*23.0 + sin(angle*11.0)*2.4 + progress*3.0));
  float jag = sin(angle*37.0)*sin(angle*13.0)*.007*progress;
  vec3 brokenColor = mix(white, vec3(.72,.46,1.0), u_events.z*.65);
  float radius = 1.0+progress*.17;
  light += brokenColor * (band(r, radius+jag, .0025)*fracture + exp(-abs(r-radius)*90.0)*.25) * breaking * .85;
  light += blue * band(r, 1.0+progress*.08, .0015)*breaking*fracture*.6;
  // Rebuild is visibly incomplete; a completed first layer uses the same circuit ignition.
  float rebuilding = u_screen.z * u_events.w;
  float sweep = step(angle, -3.14159265+6.2831853*u_screen.z);
  light += blue * band(r,.975,.0018) * rebuilding * (.14+.36*sweep);
  float intensity = max(light.r,max(light.g,light.b));
  if (intensity < .002) discard;
  // Additive output, no stateful randomness or wall-clock animation.
  fragColor = vec4(light, 1.0);
}`;

/** Web-original void-screen surface. One quad per visible root, no gameplay writes. */
export class WebGLVoidShieldShader {
  private readonly program: WebGLProgram;
  private readonly vbo: WebGLBuffer;
  private readonly vao: WebGLVertexArrayObject;
  private readonly uniforms: Record<string, WebGLUniformLocation | null>;
  constructor(private readonly gl: WebGL2RenderingContext) {
    this.program = WebGLShaderUtil.createProgram(gl, VS, FS);
    const vbo = gl.createBuffer(), vao = gl.createVertexArray();
    if (!vbo || !vao) {
      if (vbo) gl.deleteBuffer(vbo);
      if (vao) gl.deleteVertexArray(vao);
      gl.deleteProgram(this.program);
      throw new Error('Failed to allocate void-screen geometry');
    }
    this.vbo = vbo; this.vao = vao;
    this.uniforms = Object.fromEntries(['u_viewProj','u_centerRadius','u_texture','u_screen','u_hit','u_events','u_shutdown','u_facing'].map(name => [name,gl.getUniformLocation(this.program,name)]));
    gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER,vbo);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
    gl.bindVertexArray(null);
  }
  render(matrix: Float32Array, ship: ShipRenderState, center: Vector2, texture: WebGLTexture, time: number, facing: number): boolean {
    const state = ship.shield.voidShield;
    if (!state || ship.shield.radius <= 0 || ship.isDead || ship.isDocked || ship.isRetreated) return false;
    const active = state.armed && !state.suppressed && state.integrity > 0;
    const rebuilding = state.armed && !state.suppressed && state.integrity === 0 && state.rebuild > 0;
    if (!active && !rebuilding && !(state.visualHitRemaining > 0) && !(state.visualBreakRemaining > 0) && !(state.visualShutdownRemaining > 0)) return false;
    const gl = this.gl, u = this.uniforms;
    gl.useProgram(this.program); gl.bindVertexArray(this.vao);
    gl.uniformMatrix3fv(u.u_viewProj,false,matrix);
    gl.uniform3f(u.u_centerRadius,center.x,center.y,ship.shield.radius);
    gl.uniform4f(u.u_screen,state.integrity/state.integrityPerLayer,Number(active),state.rebuild/state.integrityPerLayer,time);
    gl.uniform4f(u.u_hit,state.visualHitAngle ?? 0,(state.visualHitRemaining ?? 0)/.65,state.visualHitStrength ?? 0,state.layers);
    gl.uniform4f(u.u_events,(state.visualBreakRemaining ?? 0)/1.2,(state.visualRestartRemaining ?? 0)/1.4,Number(state.visualCollapse ?? false),Number(rebuilding));
    gl.uniform1f(u.u_shutdown,(state.visualShutdownRemaining ?? 0)/.9);
    gl.uniform2f(u.u_facing,Math.cos(facing),Math.sin(facing));
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,texture); gl.uniform1i(u.u_texture,0);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE,gl.ONE);
    gl.drawArrays(gl.TRIANGLE_STRIP,0,4); gl.bindVertexArray(null);
    return true;
  }
  dispose(): void { this.gl.deleteBuffer(this.vbo); this.gl.deleteVertexArray(this.vao); this.gl.deleteProgram(this.program); }
}
