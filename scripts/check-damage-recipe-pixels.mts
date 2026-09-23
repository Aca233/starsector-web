import './check-damage-view-pixels.mts';
import {recordDamageBirths,damageRecipeDiagnostics} from './lib/damage-mark-recipe-experiment';
const run=(globalThis as any).checkDamageViewPixels;
(globalThis as any).checkDamageViewPixels=async()=>{
 recordDamageBirths(true);const result=await run();
 if(damageRecipeDiagnostics().captured<100)throw Error('Damage recipe was not exercised');
 return {...result,recipe:damageRecipeDiagnostics()};
};
