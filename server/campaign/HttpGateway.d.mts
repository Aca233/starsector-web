import type { CampaignService } from './CampaignService.mjs';
export function listenCampaignGateway(options: { service: CampaignService; worldId: string; grants: { playerId: string; token: string }[];
  runtime?:'reference'|'native-development'; staticRoot?: string; host?: string; port?: number; development?: boolean; allowInsecureLan?: boolean; publicOrigin?: string | null;
}): Promise<{ origin: string; close(): Promise<void> }>;
