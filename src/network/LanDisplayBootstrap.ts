import { initializeLanDisplayWorld } from './LanDisplaySnapshot';
import type { CombatSnapshot } from './CombatSnapshot';
import type { Match, Seat } from './protocol';

/** Cold join at ANY tick uses authority identities and explicit display records.
 * Does not construct a local match, advance RNG, or instantiate simulation classes. */
export function createLanDisplayWorld(match:Match,seat:Seat,frame:CombatSnapshot) {
 const expected=new Map<number,number>();
 for(const player of match.players)expected.set(player.team,(expected.get(player.team)??0)+1);
 for(const [team,hulls] of match.options.aiHulls.entries())if(hulls.length)expected.set(team,(expected.get(team)??0)+hulls.length);
 if(!Array.isArray(frame?.ships)||frame.ships.length!==[...expected.values()].reduce((sum,count)=>sum+count,0))throw Error('Display fleet size does not match room');
 const actual=new Map<number,number>();
 for(const row of frame.ships)actual.set(row.state?.teamId,(actual.get(row.state?.teamId)??0)+1);
 if(actual.size!==expected.size||[...expected].some(([team,count])=>actual.get(team)!==count))throw Error('Display teams do not match room');
 const result=initializeLanDisplayWorld(seat,frame);
 if(result.controlled.size!==match.players.length||match.players.some(player=>result.controlled.get(player.seat)?.teamId!==player.team))throw Error('Display control roster does not match room');
 return result;
}
