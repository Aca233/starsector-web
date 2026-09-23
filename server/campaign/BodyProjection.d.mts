import type { ReadonlyWorld } from '../../src/campaign/Types.js';
import type { BodyView } from '../../src/campaign/client/Protocol.js';
export function projectCampaignBodies(world: ReadonlyWorld, locationIds: ReadonlySet<string>): BodyView[];
