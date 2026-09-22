// Test-only: reject exactly the first tick61 admission, then exercise the real retry.
import assert from 'node:assert/strict';
const exact=(code,from,to)=>{assert.equal(code.split(from).length-1,1,'Same-tick fixture anchor: '+from);return code.replace(from,to);};
export function sameTickSkipPlugin(enabled){return{name:'test-only-same-tick-skip',enforce:'pre',transform(code,id){if(!enabled)return;const file=id.replaceAll('\\','/').split('?')[0];
 if(file.endsWith('/src/network/AuthorityIoBridge.mjs')){code=exact(code,"  let delivery='skipped';","  const forcedSkip=isState&&tick===61&&!this.__sameTickSkipped; if(forcedSkip)this.__sameTickSkipped=true;\n  let delivery='skipped';");return exact(code,'  if(this.active && (isState?', '  if(!forcedSkip && this.active && (isState?');}
 if(file.endsWith('/src/network/host.worker.ts'))return exact(code,"  ioStats[value.delivery === 'sent' ? 'sent' : 'skipped']++;","  if(value.tick===61)send({type:'test-fixture',phase:'same-tick-retry',tick:value.tick,attempt:value.attempt,delivery:value.delivery});\n  ioStats[value.delivery === 'sent' ? 'sent' : 'skipped']++;");
}};}
