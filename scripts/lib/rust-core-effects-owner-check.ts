import {runProjectileCore} from './rust-core-projectile-check';
export const checkRustCore=(wasm:BufferSource)=>runProjectileCore(wasm,false,false,false,true);
