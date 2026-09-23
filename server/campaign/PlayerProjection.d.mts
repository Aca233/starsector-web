import type { ReadonlyWorld, DeepReadonly, CompiledRuleset } from '../../src/campaign/Types.js';
import type { CampaignView } from '../../src/campaign/client/Protocol.js';
export function projectCampaignPlayer(world: ReadonlyWorld, playerId: string, rules?: CompiledRuleset): DeepReadonly<CampaignView>;
