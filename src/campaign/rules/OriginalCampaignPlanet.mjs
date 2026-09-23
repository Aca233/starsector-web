/** CampaignPlanet + PlanetSpec state on the live shared world graph (0.98a-RC8).
 * The graphics state is CPU-only. A Web checkpoint resumes this running state, not
 * Java readResolve (which reconstructs transient graphics at a native save load). */
import R from '../data/reference-campaign-planets.json' with {type:'json'};
import {requireThat} from '../core/Values.mjs';
import {createOriginalBaseCampaignEntity,validateOriginalCampaignResources} from './OriginalCampaignFleet.mjs';
import {originalJavaNextDouble,validateOriginalJavaRandom} from './OriginalJavaRandom.mjs';
import {validateOriginalFleetContact} from './OriginalFleetContact.mjs';
import {validateOriginalEntityFadeScript} from './OriginalCampaignEntityFrame.mjs';
const f=Math.fround,check=(v,m)=>requireThat(v,'UNSUPPORTED_NATIVE_CAMPAIGN_PLANET',m);
const scalar=n=>{check(Number.isFinite(n)&&Number.isFinite(f(n)),'Finite planet float required');return f(n);};
const rgba=c=>{check(Array.isArray(c)&&c.length===4&&c.every(n=>Number.isInteger(n)&&n>=0&&n<=255),'Actual planet RGBA required');return [...c];};
const vector=(v,n)=>{check(Array.isArray(v)&&v.length===n,'Actual planet vector required');return v.map(scalar);};
const FLOATS={tilt:0,pitch:0,rotation:0,cloudRotation:0,cloudAlpha:255,atmosphereThickness:f(.1),atmosphereThicknessMin:10,scaleMultMapIcon:1,scaleMultStarscapeIcon:1};
const FLAGS=['isStar','isBlackHole','isNebulaCenter','isGasGiant','isPulsar','doNotShowInCombat','useReverseLightForGlow'];
const COLORS=['planetColor','iconColor','atmosphereColor','cloudColor','glowColor'];
const TEXTURES=['cloudTexture','glowTexture','starscapeIcon'];
export const ORIGINAL_CAMPAIGN_PLANET_CLASSES=Object.freeze([...R.classes]);
export const isOriginalCampaignPlanet=object=>object?.scope==='native-campaign-planet';
// Planet.setSpec caches loaded textures and glowColor independently of its mutable spec.
const cacheGraphics=spec=>({texture:spec.texture,cloudTexture:spec.cloudTexture,glowTexture:spec.glowTexture,shieldTexture:spec.shieldTexture,shieldTexture2:spec.shieldTexture2,coronaTexture:spec.coronaTexture,glowColor:[...spec.glowColor]});
/** Real loader defaults; callers may provide reviewed/modded definitions explicitly. */
export function createOriginalPlanetSpec(type,definition=R.definitions[type],defaultCoronaTexture=R.defaultCoronaTexture){
 check(typeof type==='string'&&definition&&typeof definition==='object','Actual planet definition required: '+type);
 check(typeof definition.texture==='string'&&typeof definition.icon==='string','Planet surface/icon paths required');
 const spec={scope:'native-planet-spec',planetType:type,name:definition.name??'未知',aOrAn:definition.aOrAn??'一颗',texture:definition.texture,iconTexture:definition.icon,descriptionId:definition.descriptionId??type,coronaTexture:definition.starCoronaSprite??defaultCoronaTexture,coronaSize:scalar(definition.starCoronaSizeMult??0),coronaColor:rgba(definition.starCoronaColor??[255,255,255,255]),lightPosition:vector(definition.lightPosition??[0,0,0],3),shieldThickness:0,shieldThickness2:0,shieldTexture:null,shieldTexture2:null,shieldColor:null,shieldColor2:null,tags:[...new Set((definition.tags??[]).filter(tag=>typeof tag==='string'&&tag.trim()!==''))]};
 for(const [k,v] of Object.entries(FLOATS))spec[k]=scalar(definition[k]??v);
 for(const k of FLAGS)spec[k]=definition[k]??false;
 for(const k of COLORS)spec[k]=rgba(definition[k]??[255,255,255,255]);
 for(const k of TEXTURES)spec[k]=definition[k]??null;
 return validateOriginalPlanetSpec(spec);
}
export function validateOriginalPlanetSpec(spec){
 check(spec?.scope==='native-planet-spec','Actual PlanetSpec required');
 for(const k of ['planetType','name','aOrAn','texture','iconTexture','descriptionId','coronaTexture'])check(typeof spec[k]==='string','Missing planet spec string: '+k);
 for(const k of [...TEXTURES,'shieldTexture','shieldTexture2'])check(spec[k]===null||typeof spec[k]==='string','Missing nullable planet texture: '+k);
 for(const k of [...Object.keys(FLOATS),'coronaSize','shieldThickness','shieldThickness2'])check(scalar(spec[k])===spec[k],'Non-native planet float: '+k);
 for(const k of FLAGS)check(typeof spec[k]==='boolean','Missing planet flag: '+k);
 for(const k of [...COLORS,'coronaColor'])rgba(spec[k]);for(const k of ['shieldColor','shieldColor2'])if(spec[k]!==null)rgba(spec[k]);
 check(vector(spec.lightPosition,3).every((n,i)=>n===spec.lightPosition[i]),'Non-native planet light vector');
 check(Array.isArray(spec.tags)&&spec.tags.every(t=>typeof t==='string')&&new Set(spec.tags).size===spec.tags.length,'Actual ordered spec tags required');return spec;
}
/** Colors are immutable Java values; clone the vector and tag set, never alias editable state. */
export function cloneOriginalPlanetSpec(spec){validateOriginalPlanetSpec(spec);return structuredClone(spec);}
export function createOriginalCampaignPlanet(objectRef,{id,name,type,radius,position,lightSource},services){
 check(typeof objectRef==='string'&&typeof id==='string'&&(name===null||typeof name==='string'),'Actual planet identity/name required');
 check(lightSource===null||lightSource&&typeof lightSource.objectRef==='string','Actual nullable light source required');
 validateOriginalCampaignResources(services.resources);validateOriginalJavaRandom(services.mathRandom);
 const spec=services.readPlanetSpec?services.readPlanetSpec(type):createOriginalPlanetSpec(type);validateOriginalPlanetSpec(spec);check(spec.planetType===type,'Planet definition/type mismatch');
 const entity=createOriginalBaseCampaignEntity(objectRef,id,services.resources);entity.name=name;entity.lightSource=lightSource;entity.position.splice(0,2,...vector(position,2));entity.tags=spec.isStar?['star']:spec.isGasGiant?['gas_giant','planet']:['planet'];
 const graphics={scope:'native-campaign-planet-graphics',spec,renderCache:cacheGraphics(spec),angle:f(f(originalJavaNextDouble(services.mathRandom))*360),cloudAngle:0,position:[0,0],radius:scalar(radius),tilt:spec.tilt,pitch:spec.pitch,lightPosition:[...spec.lightPosition]};
 // Java constructor intentionally does not copy graphics.angle or entity.loc yet.
 return validateOriginalCampaignPlanet({scope:'native-campaign-planet',objectRef,id,entity,position:entity.position,type,radius:scalar(radius),angle:0,cloudAngle:0,spec:null,graphics,lightColorOverrideIfStar:null,secondLightColor:null,secondLightLocation:null,descriptionIdOverride:null,layers:['PLANETS','ABOVE'],worldRegistered:false});
}
export function getOriginalCampaignPlanetSpec(planet){check(isOriginalCampaignPlanet(planet),'Actual CampaignPlanet required');planet.spec??=cloneOriginalPlanetSpec(planet.graphics.spec);return planet.spec;}
export function applyOriginalCampaignPlanetSpec(planet){check(isOriginalCampaignPlanet(planet)&&planet.spec!==null,'getSpec must precede applySpecChanges');const spec=validateOriginalPlanetSpec(planet.spec);planet.graphics.spec=spec;planet.graphics.renderCache=cacheGraphics(spec);planet.graphics.tilt=spec.tilt;planet.graphics.pitch=spec.pitch;planet.graphics.lightPosition=[...spec.lightPosition];planet.spec=cloneOriginalPlanetSpec(spec);return planet;}
export function setOriginalCampaignPlanetRadius(planet,radius){check(isOriginalCampaignPlanet(planet),'Actual CampaignPlanet required');planet.radius=scalar(radius);planet.graphics.radius=planet.radius;}
export function setOriginalCampaignPlanetSecondLight(planet,position,color){check(isOriginalCampaignPlanet(planet),'Actual CampaignPlanet required');planet.secondLightLocation=position===null?null:vector(position,3);planet.secondLightColor=color===null?null:rgba(color);}
export function advanceOriginalCampaignPlanetGraphics(planet,seconds){
 validateOriginalCampaignPlanet(planet);seconds=scalar(seconds);const g=planet.graphics,normalize=n=>f(f(f(n%360)+360)%360);
 g.angle=normalize(f(g.angle+f(g.spec.rotation*seconds)));g.cloudAngle=normalize(f(g.cloudAngle+f(g.spec.cloudRotation*seconds)));
 planet.angle=g.angle;planet.cloudAngle=g.cloudAngle;g.position.splice(0,2,...planet.position);if(seconds>0)setOriginalCampaignPlanetSecondLight(planet,null,null);
}
export function validateOriginalCampaignPlanet(planet){
 check(isOriginalCampaignPlanet(planet)&&typeof planet.objectRef==='string'&&typeof planet.id==='string'&&typeof planet.type==='string','Actual CampaignPlanet required');const e=planet.entity,g=planet.graphics;
 check(e?.objectRef===planet.objectRef&&e.id===planet.id&&e.position===planet.position,'Lost planet/entity identity');for(const v of [e.position,e.velocity])check(vector(v,2).every((n,i)=>n===v[i]),'Non-native planet vector');
 check(typeof planet.worldRegistered==='boolean'&&typeof e.expired==='boolean'&&typeof e.factionRef==='string','Missing planet lifecycle/faction');
 check(g?.scope==='native-campaign-planet-graphics'&&g.position!==e.position,'Planet graphics must have its own location copy');for(const k of ['radius','angle','cloudAngle'])check(scalar(planet[k])===planet[k]&&scalar(g[k])===g[k],'Non-native planet graphics float');check(g.radius===planet.radius,'Lost planet/graphics radius');
 check(vector(g.position,2).every((n,i)=>n===g.position[i])&&vector(g.lightPosition,3).every((n,i)=>n===g.lightPosition[i]),'Invalid graphics vectors');for(const k of ['tilt','pitch'])check(scalar(g[k])===g[k],'Invalid graphics orientation');validateOriginalPlanetSpec(g.spec);if(g.renderCache!==undefined){for(const k of ['texture','coronaTexture'])check(typeof g.renderCache[k]==='string','Invalid applied planet texture');for(const k of ['cloudTexture','glowTexture','shieldTexture','shieldTexture2'])check(g.renderCache[k]===null||typeof g.renderCache[k]==='string','Invalid applied optional planet texture');rgba(g.renderCache.glowColor);}if(planet.spec!==null)validateOriginalPlanetSpec(planet.spec);
 check(Array.isArray(planet.layers)&&planet.layers.length===2&&planet.layers[0]==='PLANETS'&&planet.layers[1]==='ABOVE','Lost planet render layers');for(const k of ['lightColorOverrideIfStar','secondLightColor'])if(planet[k]!==null)rgba(planet[k]);if(planet.secondLightLocation!==null)vector(planet.secondLightLocation,3);
 check(planet.descriptionIdOverride===null||typeof planet.descriptionIdOverride==='string','Actual nullable description override required');check(Array.isArray(e.tags)&&Array.isArray(e.scripts),'Actual planet tags/scripts required');validateOriginalFleetContact(planet,e);for(const script of e.scripts)if(script?.scope==='native-entity-fade-expire-script')validateOriginalEntityFadeScript(script,e);return planet;
}
