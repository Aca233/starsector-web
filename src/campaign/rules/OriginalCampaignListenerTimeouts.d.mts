import type {OriginalFleetWorld,OriginalFleetWorldListener} from './OriginalFleetWorld.mjs';
import type {OriginalTimeoutTracker} from './OriginalTimeoutTracker.mjs';
export interface OriginalCampaignListenerTimeouts {scope:'native-campaign-listener-timeouts';listeners:OriginalFleetWorld['campaignListeners'];tracker:OriginalTimeoutTracker<OriginalFleetWorldListener>}
export function createOriginalCampaignListenerTimeouts(listeners:OriginalFleetWorld['campaignListeners']):OriginalCampaignListenerTimeouts;
export function validateOriginalCampaignListenerTimeouts(state:OriginalCampaignListenerTimeouts,listeners?:OriginalFleetWorld['campaignListeners']):OriginalCampaignListenerTimeouts;
export function addOriginalCampaignListenerWithTimeout(state:OriginalCampaignListenerTimeouts,item:OriginalFleetWorldListener,days:number):void;
export function removeOriginalCampaignListener(state:OriginalCampaignListenerTimeouts,item:OriginalFleetWorldListener):void;
export function advanceOriginalCampaignListenerTimeouts(state:OriginalCampaignListenerTimeouts,days:number):void;
