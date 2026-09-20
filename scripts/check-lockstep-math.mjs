import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH??'playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.EDGE_PATH});
try{
 const page=await browser.newPage();let seed=125789;
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const inputs=Array.from({length:10000},()=>[(random()-.5)*100,(random()-.5)*100]);
 const run=rows=>rows.map(([x,y])=>[Math.sin(x),Math.cos(x),Math.atan2(x,y),Math.hypot(x,y),Math.pow(Math.abs(x)+.01,Math.abs(y)/50)]);
 const local=run(inputs),remote=await page.evaluate(run,inputs),functions=['sin','cos','atan2','hypot','pow'],counts={},examples=[];
 for(let i=0;i<inputs.length;i++)for(let j=0;j<functions.length;j++)if(!Object.is(local[i][j],remote[i][j])){
  counts[functions[j]]=(counts[functions[j]]??0)+1;
  if(examples.length<10)examples.push({fn:functions[j],inputPair:inputs[i],node:local[i][j],browser:remote[i][j]});
 }
 const result={node:process.version,browser:browser.version(),scope:'Direct Math comparison for identical numeric arguments, not a trace proving the first combat divergence cause.',counts,examples};
 await fs.mkdir('artifacts/lockstep-20260920',{recursive:true});
 await fs.writeFile('artifacts/lockstep-20260920/math-probe.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
 if(Object.keys(counts).length)process.exitCode=1;
}finally{await browser.close();}
