// Test-only publication timeline; no scheduling, credits or production state changes.
import assert from 'node:assert/strict';
const source=`
const publicationProbe = {
 startTick:121,endTick:1021,stepAt:0,stepTick:0,attemptAt:0,lastPublished:-1,ioAt:0,
 steps:[],published:[],completed:[],blocked:0,displayOnly:0,networkOnly:0,both:0,overflow:0,finished:false,
 keep(rows,row){if(rows.length<6000)rows.push(row);else this.overflow++;},
 active(){return tick>=this.startTick&&tick<=this.endTick;},
 startStep(){this.stepAt=performance.now();this.stepTick=tick;},
 endStep(){if(this.active())this.keep(this.steps,[tick,tick-this.stepTick,performance.now()-this.stepAt,callbackGapMs]);if(tick>=this.endTick&&!this.finished){this.finished=true;send({type:'test-fixture',phase:'publication-probe',tick,probe:{steps:this.steps,published:this.published,completed:this.completed,blocked:this.blocked,displayOnly:this.displayOnly,networkOnly:this.networkOnly,both:this.both,overflow:this.overflow}});}},
 attempt(display,network){this.attemptAt=performance.now();if(this.active()){if(!display&&!network)this.blocked++;else if(display&&network)this.both++;else if(display)this.displayOnly++;else this.networkOnly++;}},
 publish(){const now=performance.now();if(this.active())this.keep(this.published,[tick,this.lastPublished<0?0:tick-this.lastPublished,now-this.attemptAt,now]);this.lastPublished=tick;this.ioAt=now;},
 complete(value){if(this.active())this.keep(this.completed,[value.tick,value.delivery==='sent'?1:0,performance.now()-this.ioAt,performance.now()]);}
};
`;
function exact(code,from,to){assert.equal(code.split(from).length-1,1,'Publication probe anchor changed: '+from);return code.replace(from,to);}
export function publicationProbePlugin(enabled){return {name:'test-only-publication-probe',enforce:'pre',transform(code,id){if(!enabled||!id.replaceAll('\\','/').split('?')[0].endsWith('/src/network/host.worker.ts'))return;
 code=source+code;
 code=exact(code,'  const generation = lifecycle, authority = engine;','  publicationProbe.startStep();\n  const generation = lifecycle, authority = engine;');
 code=exact(code,'    const sampledAt = performance.now();','    publicationProbe.endStep();\n    const sampledAt = performance.now();');
 code=exact(code,'  if (!display && !network) {','  publicationProbe.attempt(display,network);\n  if (!display && !network) {');
 code=exact(code,'    if (networkFrame && directIo) {','    if (networkFrame && directIo) {\n      publicationProbe.publish();');
 const completionAnchor=code.includes("  else directRetryAt = 0;")?"  else directRetryAt = 0;":'  if (value.tick !== directInFlight) return false;';
 code=exact(code,completionAnchor,completionAnchor+'\n  publicationProbe.complete(value);');
 return code;
}};}
