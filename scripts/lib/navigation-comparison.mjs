// Both arms share the current (or explicit frozen) engine graph. Only navigation differs.
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {navigationReference} from './navigation-reference.mjs';import {navigationExperiment} from './navigation-experiment.mjs';
export function navigationPlugin({arm, instrumentation=false, frozen=process.env.NAVIGATION_FROZEN}={}){
 const candidate=process.env.NAVIGATION_SOURCE?fs.readFileSync(process.env.NAVIGATION_SOURCE,'utf8'):navigationExperiment;
 const sources=new Map(frozen?JSON.parse(fs.readFileSync(frozen,'utf8')).files.map(row=>{
  if(createHash('sha256').update(row.code).digest('hex')!==row.sha256)throw Error('Frozen checksum '+row.file);
  return [path.resolve(row.file).toLowerCase(),row.code];
 }):[]);
 const contents=which=>{let code=which==='control'?(process.env.NAVIGATION_CONTROL_SOURCE?fs.readFileSync(process.env.NAVIGATION_CONTROL_SOURCE,'utf8'):navigationReference):candidate;
  if(instrumentation&&which==='candidate'){
   code+='\nexport const navigationTestCounters={native:0,skip:0,reject:0};\n';
   code=code.replace('let best=desired,bestRisk=originalRisk,bestDeviation=0;','if(prune)navigationTestCounters.native++;let best=desired,bestRisk=originalRisk,bestDeviation=0;');
   code=code.replace('if(risk>stopAbove && risk-stopAbove>=1e-8)return risk;','if(risk>stopAbove && risk-stopAbove>=1e-8){navigationTestCounters.reject++;return risk;}');
   code=code.replace('if(bestRisk<=1e-8 && deviation>=bestDeviation-1e-8)continue;','if(bestRisk<=1e-8 && deviation>=bestDeviation-1e-8){navigationTestCounters.skip++;continue;}');
  }
  return code;
 };
 return {name:'navigation-comparison',setup(build){
  if(!arm){build.onResolve({filter:/^navigation-(control|candidate)$/},args=>({path:args.path,namespace:'navigation'}));
   build.onLoad({filter:/.*/,namespace:'navigation'},args=>({contents:contents(args.path.endsWith('control')?'control':'candidate'),loader:'ts',resolveDir:path.resolve('src/engine/ai')}));}
  build.onLoad({filter:/\.[cm]?[jt]sx?$/},args=>{
   let code=arm&&args.path.replaceAll('\\','/').endsWith('/src/engine/ai/TacticalNavigation.ts')?contents(arm):sources.get(args.path.toLowerCase());
   if(code===undefined)return;return {contents:code,loader:args.path.endsWith('tsx')?'tsx':/\.m?ts$/.test(args.path)?'ts':'js',resolveDir:path.dirname(args.path)};
  });
 }};
}
