export interface OriginalBaseAnimation {scope:'native-base-animation';classAlias:'com.fs.graphics.anim.BaseAnimation';duration:number;numFrames:number;looping:boolean;reverse:boolean;before:object|null;after:object|null;elapsed:number;progress:number;currFrame:number;currLoop:number;stopNow:boolean}
export interface OriginalAnimationManager {scope:'native-animation-manager';paused:boolean;animations:object[];added:object[];removing:object[];starting:object[]}
export interface OriginalAnimationServices {isAnimationDone?(animation:object):boolean;startAnimation?(animation:object):void;finishAnimation?(animation:object):void;advanceAnimation?(animation:object,seconds:number):void;performAnimationTask?(task:object):void}
export function createOriginalBaseAnimation():OriginalBaseAnimation;
export function validateOriginalBaseAnimation(animation:OriginalBaseAnimation):OriginalBaseAnimation;
export function originalAnimationIsDone(animation:object,services?:OriginalAnimationServices):boolean;
export function startOriginalAnimation(animation:object,services?:OriginalAnimationServices):void;
export function finishOriginalAnimation(animation:object,services?:OriginalAnimationServices):void;
export function advanceOriginalAnimation(animation:object,seconds:number,services?:OriginalAnimationServices):void;
export function createOriginalAnimationManager():OriginalAnimationManager;
export function validateOriginalAnimationManager(state:OriginalAnimationManager):OriginalAnimationManager;
export function addOriginalAnimation<T extends object>(state:OriginalAnimationManager,animation:T):T;
export function removeOriginalAnimation(state:OriginalAnimationManager,animation:object):void;
export function clearOriginalAnimationManager(state:OriginalAnimationManager):void;
export function advanceOriginalAnimationManager(state:OriginalAnimationManager,seconds:number,services?:OriginalAnimationServices):void;
