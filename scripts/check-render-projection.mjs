import {checkNativeCloneGraph} from './lib/native-clone-graph-contracts.mjs';
import {checkPresentationObjectPatches} from './lib/presentation-object-patch-contracts.mjs';
import {checkDecoderWorklist} from './lib/presentation-decoder-worklist-contracts.mjs';
import {checkPresentationHudReads} from './lib/presentation-hud-read-contracts.mjs';
import {checkPackedVisualSlots} from './lib/packed-visual-slot-contracts.mjs';
import {checkPresentationOwnedScalars} from './lib/presentation-owned-scalar-contracts.mjs';
import {checkPresentationRows} from './lib/presentation-row-contracts.mjs';
import {checkPresentationShapes} from './lib/presentation-shape-contracts.mjs';
import { build } from 'esbuild';
import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';
import {checkRenderProjection,checkPresentationIndex,checkPresentationDecoderIndex} from './lib/render-projection-contracts.mjs';
const dir=path.resolve(process.env.RENDER_PROJECTION_OUT??path.join('artifacts/render-projection-contracts',Date.now()+'-'+process.pid));fs.mkdirSync(dir,{recursive:true});
const rawText = {name:'raw-text',setup(b){
 b.onResolve({filter:/\?raw$/},args=>({path:path.resolve(args.resolveDir,args.path.slice(0,-4)),namespace:'raw-text'}));
 b.onLoad({filter:/.*/,namespace:'raw-text'},args=>({contents:fs.readFileSync(args.path,'utf8'),loader:'text'}));
}};
// Optional old encoder in the SAME module graph/classes; only its implementation
// differs. Never import a second simulation realm for the byte-equivalence oracle.
const baseline=process.env.PRESENTATION_ENCODER_BASELINE;
const frozenEncoder={name:'frozen-presentation-encoder',setup(b){
 b.onResolve({filter:/^frozen-presentation-encoder$/},()=>({path:'encoder',namespace:'frozen-encoder'}));
 b.onLoad({filter:/.*/,namespace:'frozen-encoder'},()=>({contents:fs.readFileSync(baseline,'utf8'),loader:'ts',resolveDir:path.resolve('src/engine/runtime/local')}));
}};
const packedBaseline=process.env.PACKED_VISUAL_BASELINE;
const frozenPacked={name:'frozen-packed-visual',setup(b){
 b.onResolve({filter:/^frozen-packed-visual$/},()=>({path:'packed',namespace:'frozen-packed'}));
 b.onLoad({filter:/.*/,namespace:'frozen-packed'},()=>({contents:fs.readFileSync(packedBaseline,'utf8'),loader:'ts',resolveDir:path.resolve('src/engine/runtime/local')}));
}};
const decoderBaseline=process.env.PRESENTATION_DECODER_BASELINE;
const frozenDecoder={name:'frozen-presentation-decoder',setup(b){
 b.onResolve({filter:/^frozen-presentation-decoder$/},()=>({path:'decoder',namespace:'frozen-decoder'}));
 b.onLoad({filter:/.*/,namespace:'frozen-decoder'},()=>({contents:fs.readFileSync(decoderBaseline,'utf8'),loader:'ts',resolveDir:path.resolve('src/engine/runtime/local')}));
}};
await build({plugins:[rawText,...(packedBaseline?[frozenPacked]:[]),...(baseline?[frozenEncoder]:[]),...(decoderBaseline?[frozenDecoder]:[])],stdin:{loader:'ts',resolveDir:process.cwd(),contents:`
 export {prepareNativeCloneGraph,restoreNativeCloneGraph,screenNativeCloneGraph} from './scripts/lib/native-clone-graph-probe.mjs';
 ${packedBaseline?"export {PackedVisualEncoder as BeforePackedVisualEncoder,PackedVisualDecoder as BeforePackedVisualDecoder} from 'frozen-packed-visual';":''}
 export {PackedVisualEncoder,PackedVisualDecoder} from './src/engine/runtime/local/PackedVisualState';
 ${baseline?"export {CombatPresentationEncoder as BeforeCombatPresentationEncoder} from 'frozen-presentation-encoder';":''}
 ${decoderBaseline?"export {CombatPresentationDecoder as BeforeCombatPresentationDecoder} from 'frozen-presentation-decoder';":''}
 export {CombatHudProjector,HudContactRecord,combatHudView} from './src/engine/runtime/CombatHudView';
 export {GameSession} from './src/engine/game/GameSession';
 export {TacticalMapViewProjector,copyTacticalMapSnapshot} from './src/engine/runtime/TacticalMapView';
 export {combatObservers,contactVisible} from './src/engine/simulation/systems/CombatVisibility';
 export {DeploymentViewProjector,copyDeploymentView,deploymentViewReason,deploymentViewUsed} from './src/engine/runtime/DeploymentView';
 export {CombatSession} from './src/engine/runtime/CombatSession';
 export {contentRegistry} from './src/engine/content/ContentRegistry';
 export {localCombatContentSignature} from './src/engine/runtime/local/LocalCombatContent';
 export {CombatEngine} from './src/engine/simulation/CombatEngine';
 export {LocalCombatKernel} from './src/engine/runtime/local/LocalCombatKernel';
 export {CombatPresentationEncoder,CombatPresentationDecoder} from './src/engine/runtime/local/CombatPresentation';
 export {Kind as PresentationKind,Tag as PresentationTag} from './src/engine/runtime/local/CombatPresentationWire';
 export {RenderShipProjection,ProjectedRenderShip,ProjectedRenderSystem,renderWeaponRange,renderPulseOffset,renderWeaponAngle} from './src/engine/runtime/local/RenderShipProjection';
 export {applyTacticalViewCommand} from './src/engine/runtime/TacticalControl';
 export {RenderWeaponDictionary} from './src/engine/runtime/local/RenderWeaponDictionary';
 export {isImmutableMetadata,immutableCopy} from './src/engine/extensions/Immutable';
 export {collectCombatTextureUrls} from './src/engine/assets/CombatAssetClosure';
 export {activeSystemVisuals,systemTeleportCopies,systemEngineVisual} from './src/engine/render/webgl/ShipSystemRenderer';
 export {getDamageGlowRevision,hasHotDamageGlow} from './src/engine/render/ShipDamageVisuals';
 export {combatRenderView} from './src/engine/render/CombatRenderView';
 export {Ship} from './src/engine/simulation/Ship';
 export {FireControlQueryRoster} from './src/engine/ai/FireControlQueryBatch';
 export {Vector2} from './src/engine/math/Vector2';
 export {setWeaponPresentationAngle} from './src/engine/visual/WeaponPresentation';
 export {setShipPresentationPose} from './src/engine/visual/ShipPresentation';
 export {modManager} from './src/engine/modding/ModManager';
 export {createDesign,decodeDesign,evaluate,withWeapon,isBuiltIn} from './src/studio/DesignModel';
 export {simulationRoster,prepareSimulationOption,savedSimulationId,selectedSimulationDesigns} from './src/engine/content/SimulationCatalog';
`},outfile:path.join(dir,'core.mjs'),bundle:true,platform:'node',format:'esm',define:{'import.meta.env.BASE_URL':JSON.stringify('/')}});
const api=await import(pathToFileURL(path.join(dir,'core.mjs')));if(process.env.NATIVE_CLONE_CONTRACTS==='true'){const result=checkNativeCloneGraph(api);fs.writeFileSync(path.join(dir,'native-clone-contracts.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));}if(process.env.RENDER_PROJECTION_PATCHES_ONLY==='true'){const result=checkPresentationObjectPatches(api);fs.writeFileSync(path.join(dir,'contracts.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));}else if(process.env.RENDER_PROJECTION_WORKLIST_ONLY==='true'){const result=checkDecoderWorklist(api);fs.writeFileSync(path.join(dir,'contracts.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));}else if(process.env.RENDER_PROJECTION_PACKED_ONLY==='true'){const result=checkPackedVisualSlots(api);fs.writeFileSync(path.join(dir,'contracts.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));}else if(process.env.RENDER_PROJECTION_HUD_ONLY==='true'){const result=checkPresentationHudReads(api);fs.writeFileSync(path.join(dir,'contracts.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));}else if(process.env.RENDER_PROJECTION_SCALARS_ONLY==='true'){const result=checkPresentationOwnedScalars(api);fs.writeFileSync(path.join(dir,'contracts.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));}else if(process.env.RENDER_PROJECTION_ROWS_ONLY==='true'||process.env.RENDER_PROJECTION_SHAPES_ONLY==='true'||process.env.RENDER_PROJECTION_INDEX_ONLY==='true'||process.env.RENDER_PROJECTION_DECODER_ONLY==='true'){const result=process.env.RENDER_PROJECTION_ROWS_ONLY==='true'?checkPresentationRows(api):process.env.RENDER_PROJECTION_SHAPES_ONLY==='true'?checkPresentationShapes(api):process.env.RENDER_PROJECTION_DECODER_ONLY==='true'?checkPresentationDecoderIndex(api):checkPresentationIndex(api);fs.writeFileSync(path.join(dir,'contracts.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));}else await checkRenderProjection(api,path.join(dir,'contracts.json'));
