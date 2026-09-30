import assert from 'node:assert/strict';

// Same Vector2 realm for both implementations; no replacement render protocol.
export function checkPackedVisualSlots(api) {
  const {PackedVisualEncoder: Encoder, PackedVisualDecoder: Decoder, BeforePackedVisualEncoder: BeforeEncoder, BeforePackedVisualDecoder: BeforeDecoder, Vector2} = api;
  let checks = 0, packets = 0, exactPackets = 0, decodedComparisons = 0, rejections = 0;
  const same = (a, b) => {assert.deepEqual(a, b);checks++;};
  const equal = (a, b) => {assert.equal(a, b);checks++;};
  const ok = value => {assert.ok(value);checks++;};
  const effective = p => ({...p, buffer: new Uint8Array(p.buffer, 0, p.length * 8)});
  const names = ['particles','contrails','muzzleParticles','hitGlows','trailStrips','explosions','localParticles'];
  const empty = () => Object.fromEntries(names.map(key => [key, []]));
  const poolRows = decoder => [...(Array.isArray(decoder.pools) ? decoder.pools : decoder.pools.values())].filter(Boolean).flatMap(pool => [...pool]);
  function fixture() {
    const pos = new Vector2(-0, NaN), vel = new Vector2(Infinity, -Infinity);
    const shared = {pos, vel, life: 2};
    const particle = {pos,vel,life:1,maxLife:2,size:3,color:[1,2,3],alpha:0.4,material:'smoke',startSize:1,endSize:4,peakAlpha:0.8,rampUpFraction:0.1,fadeOutFraction:0.9,drag:2,rotation:3,angularVel:4,stretch:5};
    const point = {pos,age:0,duration:2,baseWidth:3,currentWidth:4,u:5,alpha:0.6};
    const puff = {offset:pos,velocity:vel,startSize:1,endSize:2,texture:3,rotation:4};
    const strip = {stripId:'trail',points:[point,point],color:[1,2,3,4],blendMode:'additive',widenMult:1,minSeg:2,isDetached:false,accumU:3};
    const explosion = {id:5,visualKind:'explosion',sourceShipId:'test',sourceAuthored:true,puffs:[puff,puff],puffDuration:2,
      flash:{diameter:10,coreDiameter:5,color:[1,2,3],duration:2,velocity:vel},flare:{width:3,height:4,color:[1,2,3],velocity:vel},
      pos,radius:6,maxRadius:7,life:1,maxLife:2,frame:3,rotation:4,color:[1,2,3],hasShockwaveRing:true,shockwaveRadius:4,maxShockwaveRadius:5,clusterSeed:6,debrisCount:7,smokeDensity:8,fireballScale:9};
    const view = {particles:[particle,shared,particle],contrails:[shared,{pos,vel,life:1,maxLife:2,size:3,maxSize:4,alpha:0.5,rotation:6,color:[1,2,3]}],
      muzzleParticles:[{pos,vel,size:3,life:1,maxLife:2,color:[1,2,3,4],blendMode:'normal'}],
      hitGlows:[{id:1,pos,vel,diameter:2,life:1,maxLife:2,peakAlpha:0.9,color:[1,2,3]}],trailStrips:[strip],explosions:[explosion],localParticles:[particle]};
    return {view,particle,point,puff,strip,explosion};
  }
  const types = [[Encoder, Decoder], ...(BeforeEncoder && BeforeDecoder ? [[BeforeEncoder, BeforeDecoder]] : [])];
  const encoders = types.map(([C]) => new C()), decoders = types.map(([,C]) => new C());
  let recycled = [], shown = [], priorParticle;
  const publish = source => {
    const output = encoders.map((encoder,i) => encoder.capture(source,recycled[i]));
    packets += output.length;
    if (output.length > 1) {same(effective(output[0]),effective(output[1]));exactPackets++;}
    shown = output.map((p,i) => {const view = empty();decoders[i].validate(p);decoders[i].applyValidated(p,view);return view;});
    if (shown.length > 1) {same(shown[0],shown[1]);decodedComparisons++;}
    recycled = output.map(p => p.buffer);
    return output[0];
  };
  const f = fixture();
  for (let frame = 0; frame < 12; frame++) {
    f.point.age = frame;f.puff.rotation = frame;f.particle.life = 12-frame;
    if (frame === 2) {f.point.alpha = undefined;f.puff.velocity = null;delete f.particle.color;}
    if (frame === 3) {f.point.alpha = null;f.puff.velocity = undefined;f.particle.color = [NaN,-0,Infinity];}
    if (frame === 4) {f.point.alpha = 1;f.puff.velocity = new Vector2();f.particle.color = [1,2,3];f.strip.stripId = 42;}
    if (frame === 5) {delete f.explosion.flash;f.explosion.flare = null;}
    if (frame === 6) {f.explosion.flash = {diameter:5};f.explosion.flare = undefined;}
    const packet = publish(f.view);same(packet.fields,[0,1,2,3,4,5,6]);
    const v = shown[0];equal(v.particles[0],v.particles[2]);equal(v.particles[0],v.localParticles[0]);
    assert.notEqual(v.particles[1],v.contrails[0]);checks++;
    equal(v.trailStrips[0].points[0],v.trailStrips[0].points[1]);equal(v.explosions[0].puffs[0],v.explosions[0].puffs[1]);
    if (priorParticle) equal(v.particles[0],priorParticle);priorParticle = v.particles[0];
    ok(Object.is(v.particles[0].pos.x,-0));ok(Number.isNaN(v.particles[0].pos.y));
  }
  const retired = priorParticle;
  publish(empty());for (const decoder of decoders) equal(poolRows(decoder).length,0);
  publish(f.view);assert.notEqual(shown[0].particles[0],retired);checks++;
  // Unknown/unsupported records must fall back wholesale, including nested rows.
  for (const [field, mutate] of [
    [0, x => {x.particle.extra = 1;}],
    [0, x => {Object.defineProperty(x.particle,'life',{enumerable:true,get(){throw Error('getter must not run');}});}],
    [0, x => {x.particle.pos.extra = 1;}],
    [0, x => {x.particle.color = [1,,3];}],
    [4, x => {Object.setPrototypeOf(x.point,{custom:true});}],
    [5, x => {x.puff.extra = 1;}],
  ]) {
    const x=fixture();mutate(x);const p=publish(x.view);ok(!p.fields.includes(field));
    publish(fixture().view);
  }
  // A validated duplicate ID aliases within a schema, never across schemas.
  const packet = (values, fields) => ({buffer:Float64Array.from(values).buffer,length:values.length,fields,strings:[]});
  const duplicate=packet([2,7,0,7,0],[0]);
  for (const decoder of decoders) {const view=empty();decoder.validate(duplicate);decoder.applyValidated(duplicate,view);equal(view.particles[0],view.particles[1]);}
  const badPackets = [
    packet([1,7,0,1,7,0],[0,1]),packet([1,0,0],[0]),packet([1,-1,0],[0]),
    packet([1,1,4**17],[0]),packet([1,1,0],[1,0]),packet([0,0],[0,0]),
    packet([0],[7]),packet([250001],[0]),packet([1,1],[0]),packet([0,1],[0]),
    {...packet([0],[0]),strings:[5]}, {...packet([0],[0]),length:2},
  ];
  for (const bad of badPackets) {
    const messages = decoders.map(decoder => {
      const rows=poolRows(decoder), values=structuredClone(rows), pools=decoder.pools, arrays=decoder.arrays;
      let message;try {decoder.validate(bad);}catch(error){message=error.message;}
      ok(message);rejections++;equal(decoder.pools,pools);equal(decoder.arrays,arrays);same(poolRows(decoder),rows);same(structuredClone(rows),values);
      return message;
    });
    if (messages.length > 1) same(messages[0],messages[1]);
  }
  // Prior failed validation cannot contaminate a later valid apply.
  publish(fixture().view);ok(shown[0].explosions[0].puffs.length===2);
  return {checks,reports:[{kind:'packed-visual-slots',packets,exactPackets,decodedComparisons,rejections,frozenPacked:types.length===2}]};
}
