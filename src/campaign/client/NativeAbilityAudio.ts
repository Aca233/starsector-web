import bank from '../data/reference-campaign-ability-ui-sounds.json';
import {registerSoundBank,soundPaths} from '../../engine/audio/SoundBank';
import {sound} from '../../engine/audio/SoundManager';
// Original samples are bundled and byte-verified. Only register missing names (HMR-safe).
const missing=Object.fromEntries(Object.entries(bank).filter(([id])=>!Object.hasOwn(soundPaths,id)));
if(Object.keys(missing).length)registerSoundBank(missing,false);
/** Called once for an acknowledged request, never inferred from polling or optimistic state. */
export function playNativeAbilityReceiptSounds(effects:unknown){if(!Array.isArray(effects))return;for(const effect of effects)if(effect?.kind==='ability-ui-sound'&&Object.hasOwn(bank,effect.id)&&Number.isFinite(effect.volume)&&Number.isFinite(effect.pitch)){try{sound.play(effect.id,effect.volume,effect.pitch);}catch{/* Audio availability must not invalidate an acknowledged gameplay command. */}}}
