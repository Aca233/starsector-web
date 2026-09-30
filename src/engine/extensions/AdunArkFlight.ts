import type { Ship } from '../simulation/Ship';
export const isArkCraft=(craft:Pick<Ship,'spec'>)=>['web_ark_interceptor','web_ark_striker'].includes(craft.spec.sourceHullId??craft.spec.id);
export const isArkInterceptor=(craft:Pick<Ship,'spec'>)=>(craft.spec.sourceHullId??craft.spec.id)==='web_ark_interceptor';
/** Craft use their real shield/flux lifecycle, not an invulnerable painted bubble. */
export function advanceArkFlightDefense(craft:Ship):void {
 if(!isArkCraft(craft)||craft.isDocked)return;
 if(craft.flux.isOverloaded||craft.flux.isVenting||craft.flux.fluxPercent>.88)craft.shield.setActive(false);
 else if(craft.flux.fluxPercent<.45)craft.shield.setActive(true);
}
