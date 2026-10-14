import {runProjectileCore} from './rust-core-projectile-check';
export const checkRustCore=async(wasm:BufferSource)=>({passed:true,missiles:await runProjectileCore(wasm,false,true),flares:await runProjectileCore(wasm,false,true,true)});
