/** Data-only offline ListenerManager/ObjectRepository restoration; no saved class is instantiated. */
import { captureNativeChurchContext } from './campaign-native-load-conditions.mjs';
const ensure = (v, message) => { if (!v) throw Error('NATIVE_SAVE_GROWTH: ' + message); };
const church = 'com.fs.starfarer.api.impl.campaign.intel.events.LuddicChurchHostileActivityFactor';
// These vanilla classes do not implement/inherit ColonySizeChangeListener. Unknown types stay unresolved.
// 0.98a source has only LuddicChurchHostileActivityFactor implementing this interface.
const unrelated = new Set(['LocalResourcesSubmarketPlugin', 'PlayerFleetPersonnelTracker', 'EncounterManager',
    'OfficerManagerEvent', 'WarSimScript', 'PlaythroughLog', 'LuddicPathBaseIntel', 'PirateBaseIntel',
    'GalatianAcademyStipend', 'SystemBountyIntel', 'com.fs.starfarer.api.impl.campaign.terrain.HyperspaceAbyssPluginImpl',
    'com.fs.starfarer.api.impl.campaign.HullModItemManager', 'com.fs.starfarer.api.impl.combat.threat.DisposableThreatFleetManager']);
export function captureNativeGrowthListeners(g, r) {
    const manager = g.child(g.root, 'listenerManager'), repository = g.child(manager, 'listeners');
    const saved = g.child(repository, 'saved'), permanent = [], roster = [], unresolved = [], seen = new Set();
    ensure(g.child(manager, 'transientListeners') === null, 'Unexpected serialized transient listener repository');
    // Missing manager/repository is repaired to empty in the native readResolve; an existing uncaptured repo is not empty.
    if (repository && !saved) unresolved.push('listener-repository-without-saved-list');
    for (const entry of saved?.children ?? []) {
        const objectRef = r.ref(entry);
        if (seen.has(objectRef)) continue; // ObjectRepository.add uses identity contains before insertion.
        seen.add(objectRef);
        // A collection reference retains the concrete type tag even when its first definition was a field named i/f/etc.
        const className = entry.attributes.cl ?? entry.name;
        roster.push({objectRef, className});
        if (className === church || className === 'LuddicChurchHostileActivityFactor') permanent.push({objectRef, type:'luddic-church'});
        else if (!unrelated.has(className)) unresolved.push('unreviewed-listener:' + className);
    }
    return {scope:'native-restored-colony-size-listeners', permanent, transient:[], roster, unresolved};
}
export function captureNativeGrowthMarket(g, r, market, administratorCapture) {
    return {scope:'native-colony-growth-getters', church:captureNativeChurchContext(g,r,market,administratorCapture)};
}
