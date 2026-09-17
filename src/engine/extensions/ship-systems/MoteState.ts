import type { Ship } from '../../simulation/Ship';
import type { Projectile } from '../../simulation/Weapon';
import type { Vector2 } from '../../math/Vector2';
export interface MoteState { elapsed:number; interval:number; launchElapsed:number; motes:Projectile[]; attractorRemaining:number; attractorTarget?:Vector2; attractorLock?:Ship; deathMonitor:boolean; }
const states=new WeakMap<Ship,MoteState>();
export function moteState(ship:Ship):MoteState { let s=states.get(ship);if(!s){s={elapsed:0,interval:0,launchElapsed:0,motes:[],attractorRemaining:0,deathMonitor:false};states.set(ship,s);}return s; }
export function resetMotes(ship:Ship):void {const s=states.get(ship);for(const p of s?.motes??[]){p.isDisarmed=true;p.inertialFlight=true;p.flightTimeRemaining=0;}states.delete(ship);}
export function highFrequencyMotes(ship:Ship):boolean{return [...(ship.spec.builtInHullMods??[]),...(ship.spec.hullMods??[])].includes('high_frequency_attractor');}
