import { createHash } from 'node:crypto';
import { createReferenceRuleset } from '../../src/campaign/ReferenceRuleset.mjs';
import { createCampaignWorld, validateCampaignWorld } from '../../src/campaign/core/WorldState.mjs';
import reference from '../../src/campaign/data/reference-logistics.json' with { type: 'json' };
/** Explicit integration scenario, NOT the canonical sector, new-game economy or default loadout. */
export function createDevelopmentCampaign() {
  const rules = createReferenceRuleset();
  const fingerprint = 'dev:' + createHash('sha256').update(JSON.stringify(reference)).digest('hex');
  const w = structuredClone(createCampaignWorld({ id: 'development-sector', rules: rules.lock, contentFingerprint: fingerprint }));
  // Explicit QA epoch, not a claim that this fixture is the native new-game sector.
  w.extensions['reference.calendar:epoch'] = { id: 'reference.calendar:epoch', version: 0, schemaVersion: 1,
    data: { epoch: rules.services.calendar.createNewGameEpoch({ start: 'development-no-time-pass', atGameSeconds: 0 }) } };
  w.locations.system = { id: 'system', version: 0, name: '航行试验星系', navigation: { space: 'normal', terrain: [], jumpTopology: 'complete' } };
  w.locations.hyper = { id: 'hyper', version: 0, name: '超空间试验区', navigation: { space: 'hyperspace', terrain: [], jumpTopology: 'complete' } };
  w.spaceEntities.exit = { id: 'exit', version: 0, name: '外缘跳跃点', locationId: 'system', position: [240, 0], radius: 40, tags: [],
    jump: { anchor: null, destinations: [{ targetId: 'well', minDistance: 120, maxDistance: 180 }] } };
  w.spaceEntities.well = { id: 'well', version: 0, name: '恒星重力井', locationId: 'hyper', position: [0, 0], radius: 40, tags: [],
    jump: { anchor: 'star', destinations: [{ targetId: 'exit', minDistance: 60, maxDistance: 100 }] } };
  for (const [index, id] of ['captain-a', 'captain-b'].entries()) {
    const owner = { kind: 'player', id }; const fleetId = 'fleet-' + id, memberId = 'wolf-' + id;
    w.players[id] = { id, version: 0, name: index ? '舰长乙' : '舰长甲', factionId: null };
    w.fleets[fleetId] = { id: fleetId, version: 0, name: index ? '先锋舰队' : '远航舰队', owner, control: owner, locationId: 'system', position: [0, index * 60],
      memberIds: [memberId], partyId: null, encounterId: null, cargo: { supplies: 30, fuel: 20, crew: 15 } };
    w.members[memberId] = { id: memberId, version: 0, fleetId, owner, loadout: { hullId: 'wolf' },
      condition: { status: 'ready', hullFraction: 1, combatReadiness: 0.7, armor: null, ammunition: {} } };
  }
  return validateCampaignWorld(w);
}
