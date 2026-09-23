/** java.util.Random's seeded LCG methods, verified against the installed runtime bytecode. Mutable state is checkpointable JSON. */
import {requireThat} from '../core/Values.mjs';
const mask=(1n<<48n)-1n,multiplier=0x5deece66dn,check=(v,m)=>requireThat(v,'INVALID_JAVA_RANDOM',m);
export function createOriginalJavaRandom(seed){check(typeof seed==='string'&&/^-?\d+$/.test(seed),'Signed long seed required');const value=BigInt(seed);check(BigInt.asIntN(64,value)===value,'Seed outside signed long');return {kind:'java-random-lcg48',state:((value^multiplier)&mask).toString()};}
export function validateOriginalJavaRandom(s){check(s?.kind==='java-random-lcg48'&&typeof s.state==='string'&&/^\d+$/.test(s.state)&&BigInt(s.state)<=mask,'Invalid Java random state');return s;}
function next(s,bits){validateOriginalJavaRandom(s);const value=(BigInt(s.state)*multiplier+11n)&mask;s.state=value.toString();const result=Number(value>>BigInt(48-bits));return bits===32?result|0:result;}
export const originalJavaNextFloat=s=>next(s,24)/2**24;
export const originalJavaNextDouble=s=>(next(s,26)*2**27+next(s,27))/2**53;
export function originalJavaNextLong(s){const high=BigInt(next(s,32)),low=BigInt(next(s,32));return BigInt.asIntN(64,(high<<32n)+low).toString();}
export function originalJavaNextInt(s,bound){if(bound===undefined)return next(s,32);check(Number.isInteger(bound)&&bound>0&&bound<=2147483647,'Positive Java int bound required');const m=bound-1;let bits=next(s,31);if((bound&m)===0)return Number((BigInt(bound)*BigInt(bits))>>31n);let value=bits%bound;while(((bits-value+m)|0)<0){bits=next(s,31);value=bits%bound;}return value;}
/** Explicit Web branch randomness, NOT the uncaptured JVM Math.random or nanoTime state. */
export function createOriginalPatrolBranchRandom(sourceSha256){check(typeof sourceSha256==='string'&&/^[a-f0-9]{64}$/.test(sourceSha256),'Actual source SHA required for branch seed');const seed=start=>BigInt.asIntN(64,BigInt('0x'+sourceSha256.slice(start,start+16))).toString();return {scope:'web-persisted-patrol-branch-random',sourceSha256,global:createOriginalJavaRandom(seed(0)),routeSeeds:createOriginalJavaRandom(seed(16))};}
export function validateOriginalPatrolBranchRandom(s){check(s?.scope==='web-persisted-patrol-branch-random'&&/^[a-f0-9]{64}$/.test(s.sourceSha256),'Invalid Web random branch');validateOriginalJavaRandom(s.global);validateOriginalJavaRandom(s.routeSeeds);check(s.global!==s.routeSeeds,'Patrol random streams must be distinct');return s;}
