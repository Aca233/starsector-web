/** CampaignPlanet.advance delegates BaseCampaignEntity BEFORE its rotating graphics.
 * BaseLocation subsequently integrates orbit/velocity; do not move a planet twice. */
import {validateOriginalCampaignPlanet,advanceOriginalCampaignPlanetGraphics} from './OriginalCampaignPlanet.mjs';
import {advanceOriginalFleetContact} from './OriginalFleetContact.mjs';
import {advanceOriginalEntityBaseTail,advanceOriginalEntityEvenIfPaused} from './OriginalCampaignEntityFrame.mjs';
export function advanceOriginalCampaignPlanetFrame(planet,seconds,days,random,context,services={}){
 validateOriginalCampaignPlanet(planet);
 // BaseCampaignEntity explicitly excludes CampaignPlanet from faction recoloring.
 const contact=advanceOriginalFleetContact(planet,seconds,random,context,{...services,readFleetRadius:object=>object.radius,isFleetVisibleToPlayer:services.isPlanetVisibleToPlayer,readVisibilityToPlayer:services.readPlanetVisibilityToPlayer,readFleetIndicatorFaction:services.readPlanetIndicatorFaction,reportDetectedEntity:services.reportDetectedPlanet,pickDiscoverEntityPlugin:services.pickDiscoverPlanetPlugin,discoverEntity:services.discoverPlanet});
 advanceOriginalEntityBaseTail(planet.entity,seconds,days,{get paused(){return context.paused;},isPlayerFleet:false},services);
 advanceOriginalCampaignPlanetGraphics(planet,seconds);return {scope:'native-campaign-planet-frame',effects:contact.effects,readyForAuthority:false};
}
export function advanceOriginalCampaignPlanetEvenIfPaused(planet,seconds,context,services={}){validateOriginalCampaignPlanet(planet);advanceOriginalEntityEvenIfPaused(planet.entity,seconds,{get paused(){return context.paused;},isPlayerFleet:false},services);}
export function originalCampaignPlanetSensorEntity(planet){
 validateOriginalCampaignPlanet(planet);const e=planet.entity;
 return {isFleet:false,isPlayerFleet:false,get locationRef(){return e.containingLocation?.objectRef??null;},get position(){return {x:e.position[0],y:e.position[1]};},get radius(){return planet.radius;},get ghost(){return e.tags.includes('ghost');},get sensorProfile(){return e.sensorProfile;},get sensorStrength(){return e.sensorStrength;},get transponderOn(){return e.transponderOn;},get extendedDetectedAtRange(){return e.extendedDetectedAtRange;},get detectionRangeDetailsOverrideMult(){return e.detectionRangeDetailsOverrideMult;},get detectedRangeMod(){return e.detectedRangeMod;},get sensorRangeMod(){return e.sensorRangeMod;},detectedByPlayerRangeMult:1};
}
