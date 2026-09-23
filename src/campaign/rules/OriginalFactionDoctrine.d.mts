export interface OriginalFactionDoctrine {objectRef:string;warships:number;carriers:number;phaseShips:number;officerQuality:number;shipQuality:number;numShips:number;shipSize:number;aggression:number;fleets:number;autofitRandomizeProbability:number;combatFreighterProbability:number;combatFreighterCombatUseFraction:number;combatFreighterCombatUseFractionWhenPriority:number;commanderSkillsShuffleProbability:number;officerSkillsShuffleProbability:number;strictComposition:boolean;commanderSkills:string[];officerSkills:string[]}
export const DOCTRINE_INTS:readonly string[];export const DOCTRINE_FLOATS:readonly string[];export const DOCTRINE_LISTS:readonly string[];
export interface OriginalFactionDoctrineCapture {scope:'native-faction-doctrine-inputs';entries:{objectRef:string;factionId:string;doctrine:OriginalFactionDoctrine|null}[];unresolved:string[]}
export interface OriginalFactionDoctrines {scope:'native-current-faction-doctrines';entries:{objectRef:string;factionId:string;doctrine:OriginalFactionDoctrine}[]}
export function newOriginalFactionDoctrine(objectRef:string):OriginalFactionDoctrine;
export function validateOriginalFactionDoctrine(doctrine:OriginalFactionDoctrine):OriginalFactionDoctrine;
export function restoreOriginalFactionDoctrines(capture:OriginalFactionDoctrineCapture):OriginalFactionDoctrines;
export function validateOriginalFactionDoctrines(state:OriginalFactionDoctrines):OriginalFactionDoctrines;
export function originalFactionShipQualityContribution(doctrine:OriginalFactionDoctrine):number;
