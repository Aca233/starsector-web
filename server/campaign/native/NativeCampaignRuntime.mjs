import {createOriginalProductionVariantMap,validateOriginalProductionVariantMap,originalProductionHullVariants} from '../../../src/campaign/rules/OriginalProductionVariants.mjs';
import {createOriginalModularFleetAI,advanceOriginalModularFleetAI,createOriginalNamedEmptyFleet} from '../../../src/campaign/rules/OriginalModularFleetAI.mjs';
import {createOriginalCoreCampaignPlugin,validateOriginalCampaignPluginRegistry,addOriginalCampaignPlugin,removeOriginalCampaignPlugin,pickOriginalCampaignPlugin} from '../../../src/campaign/rules/OriginalCampaignPluginPicks.mjs';
import {ORIGINAL_DMOD_ADDER_TYPE,createOriginalDModClassState,validateOriginalDModClassState,originalDModCount,setOriginalDHull,removeOriginalDMod,addOriginalDMods,addOriginalCombatDMods} from '../../../src/campaign/rules/OriginalDModManager.mjs';
import {addOriginalGenericPlugin,removeOriginalGenericPlugin,pickOriginalGenericPlugin} from '../../../src/campaign/rules/OriginalGenericPlugins.mjs';
import {originalEncounterFleetDynamic} from '../../../src/campaign/rules/OriginalEncounterEquipment.mjs';
import {originalHullmodRequiredItem,originalHullmodItemManagerInstance,bindOriginalHullmodItemManager,validateOriginalHullmodItemManager} from '../../../src/campaign/rules/OriginalHullmodItems.mjs';
import {reportOriginalRefitVariantSaved} from '../../../src/campaign/rules/OriginalFleetWorld.mjs';
import {originalPlayerAvailableHullmods,originalPlayerFactionHullmods,addOriginalPlayerHullmod,removeOriginalPlayerHullmod} from '../../../src/campaign/rules/OriginalPlayerHullmods.mjs';
import {bindOriginalSpecialItem} from '../../../src/campaign/rules/OriginalSpecialItems.mjs';
import {originalEmptyVariantFactoryServices} from '../../../src/campaign/rules/OriginalEmptyVariants.mjs';
import {validateOriginalAnimationManager,addOriginalAnimation,removeOriginalAnimation,advanceOriginalAnimationManager} from '../../../src/campaign/rules/OriginalCampaignAnimations.mjs';
import {createOriginalPingScript,originalPingScriptIsDone,advanceOriginalPingScript,advanceOriginalActionIndicator,originalActionIndicatorCanCleanUp} from '../../../src/campaign/rules/OriginalCampaignPings.mjs';
import {originalFleetIsVisible,originalFleetWillBeVisible} from '../../../src/campaign/rules/OriginalCampaignViewport.mjs';
import {originalColonyCandidateImage} from '../../../src/campaign/rules/OriginalColonyCandidateImage.mjs';
import {ORIGINAL_COLONY_CONSTRUCTION,executeOriginalColonyConstructionCommand,inspectOriginalColonyConstructionBuildOptions} from '../../../src/campaign/rules/OriginalColonyConstructionCommands.mjs';
import {originalAutofitSpecs} from '../../../src/campaign/rules/OriginalAutofitSpecRegistry.mjs';
import {createOriginalAutofitCostServices} from '../../../src/campaign/rules/OriginalAutofitCosts.mjs';
import {executeOriginalCoreAutofit} from '../../../src/campaign/rules/OriginalCoreAutofit.mjs';
import {createOriginalInflaterAutofitDelegate} from '../../../src/campaign/rules/OriginalInflaterAutofitDelegate.mjs';
import {autofitCall} from '../../../src/campaign/rules/OriginalAutofitEquipment.mjs';
import {generateOriginalIndustryProductionCargo} from '../../../src/campaign/rules/OriginalIndustryProductionCargo.mjs';
import {createOriginalCoreAutofitClassState,validateOriginalCoreAutofitClassState,createOriginalFleetInflater,createOriginalFleetInflaterParams,createOriginalFleetInflaterForParams,executeOriginalFleetInflation,inflateOriginalCampaignFleet,originalInflaterRemovesAfterInflating} from '../../../src/campaign/rules/OriginalFleetInflater.mjs';
import {reportOriginalFleetInflated} from '../../../src/campaign/rules/OriginalFleetWorld.mjs';
import characterSkills from '../../../src/campaign/data/reference-fleet-sync.json' with {type:'json'};
import {validateOriginalMarketFrame,advanceOriginalMarketFrame,advanceOriginalPausedMarketConditions,originalMarketConditionRunsWhilePaused,advanceOriginalMarketCondition,validateOriginalTemporaryStat} from '../../../src/campaign/rules/OriginalMarketFrame.mjs';
import {advanceOriginalPerson} from '../../../src/campaign/rules/OriginalPersonAdvance.mjs';
import {validateOriginalCampaignUIDataFrame,suppressOriginalCampaignMusic,advanceOriginalCampaignUIDataFrame} from '../../../src/campaign/rules/OriginalCampaignUIData.mjs';
import {addOriginalFleetAbility,originalFleetAbilities,originalFleetAbility,originalAbilityLayers,changeOriginalFleetAbility,removeOriginalFleetAbility} from '../../../src/campaign/rules/OriginalCampaignAbilities.mjs';
import {isOriginalCampaignPlanet,createOriginalCampaignPlanet,validateOriginalCampaignPlanet} from '../../../src/campaign/rules/OriginalCampaignPlanet.mjs';
import {advanceOriginalCampaignPlanetFrame,advanceOriginalCampaignPlanetEvenIfPaused,originalCampaignPlanetSensorEntity} from '../../../src/campaign/rules/OriginalCampaignPlanetFrame.mjs';
import {validateOriginalCampaignBackgroundSource,replaceOriginalCampaignBackgroundTexture} from '../../../src/campaign/rules/OriginalCampaignBackground.mjs';
import {createOriginalCampaignEventManager,validateOriginalCampaignEventManager,getOriginalCampaignEventProbability,getOriginalOngoingCampaignEvent,countOriginalOngoingCampaignEvents,primeOriginalCampaignEvent,startOriginalCampaignEvent,startOriginalCampaignEventPlugin,endOriginalCampaignEvent,advanceOriginalCampaignEventManager} from '../../../src/campaign/rules/OriginalCampaignEvents.mjs';
import {createOriginalBaseCampaignEvent,validateOriginalBaseCampaignEvent,initializeOriginalBaseCampaignEvent,startOriginalBaseCampaignEvent,cleanupOriginalBaseCampaignEvent} from '../../../src/campaign/rules/OriginalBaseCampaignEvent.mjs';
import {validateOriginalIntelManager,queueOriginalIntel,unqueueOriginalIntel,addOriginalIntel,removeOriginalIntel,clearOriginalIntelManager,notifyOriginalIntelScreenOpening,removeOriginalExpiredIntel,advanceOriginalIntelManager,enqueueOriginalIntelMessageIntent} from '../../../src/campaign/rules/OriginalIntelManager.mjs';
import {isOriginalProductionReportIntel,createOriginalProductionReportIntel,validateOriginalSupportedIntel,originalProductionReportShouldRemove} from '../../../src/campaign/rules/OriginalProductionReportIntel.mjs';
import {createOriginalNewMessagesIntel,originalIntelEnded,originalIntelShouldRemove,originalIntelHidden,setOriginalIntelForceAdd,endOriginalBaseIntel,advanceOriginalBaseIntel,originalBaseIntelCanMakeVisible} from '../../../src/campaign/rules/OriginalBaseIntel.mjs';
import {findOriginalCommRelay} from '../../../src/campaign/rules/OriginalIntelCommunications.mjs';
import {validateOriginalImportantPeople,addOriginalImportantPerson,removeOriginalImportantPerson,advanceOriginalImportantPeople} from '../../../src/campaign/rules/OriginalImportantPeople.mjs';
import {validateOriginalCampaignListenerTimeouts,addOriginalCampaignListenerWithTimeout,removeOriginalCampaignListener,advanceOriginalCampaignListenerTimeouts} from '../../../src/campaign/rules/OriginalCampaignListenerTimeouts.mjs';
import {validateOriginalFactionFrame,originalFactionMemoryWithoutUpdate,advanceOriginalFactionFrame} from '../../../src/campaign/rules/OriginalFactionFrame.mjs';
import {validateOriginalFactionEquipment,originalFactionKnownEquipment,originalFactionEquipmentKnownAt,originalFactionEquipmentPriority,setOriginalFactionEquipmentPriority,addOriginalFactionKnownEquipment,removeOriginalFactionKnownEquipment,createOriginalFactionEquipmentServices} from '../../../src/campaign/rules/OriginalFactionEquipment.mjs';
import {validateOriginalCustomProductionState,executeOriginalCustomProduction,originalProductionMemberFittingValues} from '../../../src/campaign/rules/OriginalCustomProduction.mjs';
import {addOriginalProductionItem,removeOriginalProductionItem,clearOriginalFactionProduction,originalProductionGatheringPoint,originalProductionUnitCost,originalProductionTotalCurrentCost,originalMonthlyProductionCapacity,originalProductionCapacityModified} from '../../../src/campaign/rules/OriginalFactionProduction.mjs';
import {findOriginalNavigationTarget,followOriginalNavigationTarget,setOriginalPlayerMovementDestination,advanceOriginalPlayerTargetNavigation} from '../../../src/campaign/rules/OriginalCampaignNavigation.mjs';
import {createOriginalCargoPodsObserverPresentation,advanceOriginalCargoPodsObserver,renderOriginalCargoPodsObserverLayers} from '../../../src/campaign/rules/OriginalCargoPodsPresentation.mjs';
import {advanceOriginalCargoPodsFrame,advanceOriginalCargoPodsEvenIfPaused,originalCargoPodsSensorEntity} from '../../../src/campaign/rules/OriginalCargoPodsFrame.mjs';
import {isOriginalCargoPods,createOriginalCargoPods,initializeOriginalCargoPodsDrift} from '../../../src/campaign/rules/OriginalCargoPods.mjs';
import {addAllOriginalNativeCargo,originalNativeCargoIsEmpty} from '../../../src/campaign/rules/OriginalNativeCargo.mjs';
import {setOriginalNativeMemberMothballed} from '../../../src/campaign/rules/OriginalNativeRepair.mjs';
import {createOriginalLootCargoTransaction,validateOriginalLootCargoTransaction,applyOriginalLootCargoActions,projectOriginalLootCargo,originalLootTransactionExists,confirmOriginalLootCargoPanel} from '../../../src/campaign/rules/OriginalLootCargoTransaction.mjs';
import {createOriginalFleetInteractionAftermath,validateOriginalFleetInteractionAftermath,completeOriginalFleetVictorySalvage,openOriginalFleetLoot,dismissOriginalFleetLoot,leaveOriginalFleetInteraction} from '../../../src/campaign/rules/OriginalFleetInteractionAftermath.mjs';
import {validateOriginalEncounterState} from '../../../src/campaign/rules/OriginalEncounterState.mjs';
import {validateOriginalFactionRelations,originalFactionRelation,setOriginalFactionRelation,originalReputationLevel,originalRepAtBest,originalRepAtWorst} from '../../../src/campaign/rules/OriginalRelationships.mjs';
import {adjustOriginalPlayerFactionReputation} from '../../../src/campaign/rules/OriginalCoreReputation.mjs';
import {createOriginalFleetEncounterContext,bindOriginalFleetEncounterContext} from '../../../src/campaign/rules/OriginalFleetEncounterContext.mjs';
import {createOriginalBattleAutoresolver,resolveOriginalBattleAutoresolver,resolveOriginalBattlePlayerPursuit} from '../../../src/campaign/rules/OriginalBattleAutoresolver.mjs';
import {generateOriginalBattleCombined,uncombineOriginalBattle,leaveOriginalBattle,finishOriginalBattle,resolveOriginalBattleRound} from '../../../src/campaign/rules/OriginalCampaignBattleLifecycle.mjs';
import {advanceOriginalCampaignBattle} from '../../../src/campaign/rules/OriginalCampaignBattleFrame.mjs';
import {createOriginalCampaignBattle,validateOriginalCampaignBattle,canJoinOriginalBattle,joinOriginalBattle,pickOriginalBattleSide,takeOriginalBattleSnapshots,originalBattleClosestFleet} from '../../../src/campaign/rules/OriginalCampaignBattle.mjs';
import {advanceOriginalLocationEncounters} from '../../../src/campaign/rules/OriginalLocationEncounters.mjs';
import {validateOriginalLocationFrame,advanceOriginalLocationEvenIfPaused,advanceOriginalLocationFrame} from '../../../src/campaign/rules/OriginalLocationFrame.mjs';
import {validateOriginalLocationOrbit} from '../../../src/campaign/rules/OriginalLocationOrbits.mjs';
import {validateOriginalCampaignEngineState,advanceOriginalCampaignEngine,originalCampaignGenericPlugins} from '../../../src/campaign/rules/OriginalCampaignEngine.mjs';
import {OriginalCampaignEntityIndex} from '../../../src/campaign/rules/OriginalCampaignEntityIndex.mjs';
import {validateOriginalCampaignMemory,advanceOriginalCampaignMemory,originalEntityMemoryWithoutUpdate,originalCampaignMemoryBoolean,originalCampaignMemoryContains} from '../../../src/campaign/rules/OriginalCampaignMemory.mjs';
import {createOriginalFleetObserverPresentation,advanceOriginalFleetObserverContact,advanceOriginalFleetObserverView,renderOriginalFleetObserverLayers} from '../../../src/campaign/rules/OriginalFleetPresentation.mjs';
import {createOriginalCampaignContrails} from '../../../src/campaign/rules/OriginalCampaignContrails.mjs';
import {setOriginalMemberViewJitter,endOriginalMemberViewJitter,setOriginalMemberViewJitterDirection,setOriginalMemberViewJitterLength,setOriginalMemberViewCircularJitter,setOriginalMemberViewJitterBrightness} from '../../../src/campaign/rules/OriginalCampaignFleetMemberView.mjs';
import {validateOriginalFleetView,renderOriginalFleetView,renderOriginalFleetViewContrails,renderOriginalFleetGraphics} from '../../../src/campaign/rules/OriginalCampaignFleetView.mjs';
import {advanceOriginalFleetFrame,advanceOriginalFleetEvenIfPaused} from '../../../src/campaign/rules/OriginalCampaignFleetFrame.mjs';
import {addOriginalPlanetToLocation,removeOriginalPlanetFromLocation,reportOriginalDetectedEntity,addOriginalCustomEntityToLocation,removeOriginalCustomEntityFromLocation,reportOriginalPlayerLeftCargoPods,reportOriginalNonMarketTransaction,reportOriginalPlayerDidNotTakeCargo,validateOriginalFleetWorld,originalFleetWorldLocation,addOriginalFleetToLocation,removeOriginalFleetFromLocation,addOriginalFleetEventListener,despawnOriginalWorldFleet,finishOriginalFleetAfterView,removeExpiredOriginalWorldFleets,updateOriginalFleetAbilityLayers} from '../../../src/campaign/rules/OriginalFleetWorld.mjs';
import {validateOriginalTowCablePersistentEntry} from '../../../src/campaign/rules/OriginalTowCable.mjs';
import {advanceOriginalFleetAfterBase,setOriginalFleetNoEngaging,updateOriginalFleetOvercapacitySpeed} from '../../../src/campaign/rules/OriginalCampaignFleetAdvance.mjs';
import {advanceOriginalFleetAccidents,originalFleetAccidentSeverity} from '../../../src/campaign/rules/OriginalFleetAccidents.mjs';
import {advanceOriginalConstructedFleetMotion,setOriginalConstructedFleetDestination,requestOriginalConstructedFleetGoSlow} from '../../../src/campaign/rules/OriginalCampaignFleetMotion.mjs';
import {constructOriginalCampaignFleet,initializeOriginalCampaignResources} from '../../../src/campaign/rules/OriginalCampaignFleet.mjs';
import {originalFleetCommanderRef,setOriginalFleetCommander,initializeOriginalCampaignFleetCommander} from '../../../src/campaign/rules/OriginalFleetCommander.mjs';
import {createOriginalFactionPersonFactory,createOriginalFactionPerson,pickOriginalFactionPersonName,pickOriginalFactionVoice,validateOriginalFactionPersonFactory} from '../../../src/campaign/rules/OriginalFactionPersons.mjs';
import {createOriginalFleetCargo,initializeOriginalCargoMothballedShips,createOriginalFleetDataFactory,initializeOriginalFleetDataClass,bindOriginalFleetDataClass,createOriginalFleetData,validateOriginalFleetDataFactory} from '../../../src/campaign/rules/OriginalFleetDataFactory.mjs';
import {createOriginalFleetRosterState,registerOriginalFleetRoster,validateOriginalFleetRosterState,originalFleetRosterServices} from '../../../src/campaign/rules/OriginalFleetRoster.mjs';
import {restoreOriginalFactionDoctrines,validateOriginalFactionDoctrines,originalFactionShipQualityContribution} from '../../../src/campaign/rules/OriginalFactionDoctrine.mjs';
import {originalFleetStockVariant,createOriginalFleetMemberFactory,validateOriginalFleetMemberFactory,createOriginalFleetMember,pickOriginalFleetShipName,originalFleetMemberConstructionServices,setOriginalFleetMemberName,originalConstructedMemberHullSize,originalConstructedMemberHints,originalConstructedMemberCivilian} from '../../../src/campaign/rules/OriginalFleetMembers.mjs';
import {createOriginalFleetCompositionState,validateOriginalFleetCompositionState,composeOriginalFleetRoster} from '../../../src/campaign/rules/OriginalFleetComposition.mjs';
import {restoreOriginalShipSelection,validateOriginalShipSelection,pickOriginalShipRole,originalShipRoleAvailability,clearOriginalShipRoleCache} from '../../../src/campaign/rules/OriginalShipSelection.mjs';
import {createOriginalPatrolBranchRandom,validateOriginalPatrolBranchRandom,originalJavaNextDouble,originalJavaNextLong,originalJavaNextInt,createOriginalJavaRandom} from '../../../src/campaign/rules/OriginalJavaRandom.mjs';
import {restoreCapturedOriginalPatrolState,validateOriginalPatrolState,advanceOriginalMilitaryPatrolAfterBase,advanceOriginalRouteTime} from '../../../src/campaign/rules/OriginalMilitaryPatrols.mjs';
import {restoreCapturedOriginalRouteSpace,bindOriginalRouteWorldFleet,validateOriginalRouteSpace,originalRouteHyperPosition,originalRouteContainingLocation,originalRouteEntity,setOriginalRouteFleetMousedOver} from '../../../src/campaign/rules/OriginalRouteSpace.mjs';
import {advanceOriginalRouteFleetPhase,reportOriginalRouteFleetDespawned} from '../../../src/campaign/rules/OriginalRouteFleets.mjs';
import {originalFleetSensorEntity,originalSensorVisibility,restoreCapturedOriginalFleetSensors,validateOriginalFleetSensors,originalRouteFleetVisibility,originalRouteFleetVisibilityForPlayer,bindOriginalSensorFleet,registerOriginalConstructedSensorFleet} from '../../../src/campaign/rules/OriginalSensors.mjs';
import {restoreOriginalMilitaryLifecycle,validateOriginalMilitaryLifecycle,syncOriginalMilitaryDisruption,setOriginalMilitaryDisrupted,startOriginalMilitaryUpgrade,cancelOriginalMilitaryUpgrade,instantiateOriginalMilitaryIndustry,addOriginalMilitaryIndustry,startBuildingOriginalMilitaryIndustry,advanceOriginalMilitaryIndustry} from '../../../src/campaign/rules/OriginalMilitaryLifecycle.mjs';
import {applyOriginalMilitaryBase,ORIGINAL_MILITARY_BASES} from '../../../src/campaign/rules/OriginalMilitaryBases.mjs';
import {advanceOriginalMemoryFlags,validateOriginalMemoryFlags,bindOriginalMemoryFlags} from '../../../src/campaign/rules/OriginalMemoryFlags.mjs';
import {nextOriginalNativeUID,createOriginalDefaultFleetCaptain,originalPersonnelPeople,originalPersonnelByRef,getOriginalMarketAdministrator,setOriginalMarketAdministrator} from '../../../src/campaign/rules/OriginalMarketPersonnel.mjs';
import {refreshOriginalHyperspaceTopography} from '../../../src/campaign/rules/OriginalHyperspaceTopography.mjs';
import { readResolveOriginalCharacterStats,refreshOriginalCharacterStats,originalNativeCharacterDynamicValue,originalNativeCharacterOutpostLimit } from '../../../src/campaign/rules/OriginalNativeCharacterStats.mjs';
import { originalFleetPointCost,originalMemberDeploymentPoints,synchronizeOriginalFleet,originalPlayerDeploymentPoints } from '../../../src/campaign/rules/OriginalFleetData.mjs';
import { validateOriginalPlayerEconomy, validateOriginalPlayerEconomyReferences, restoreOriginalPlayerEconomy, originalPlayerCharacterMemoryWithoutUpdate, originalPlayerLevel, originalTutorialInProgress, originalOfficerPayroll, originalAdministratorPayroll, originalPlayerFleetPayroll, originalPlayerCargoStat } from '../../../src/campaign/rules/OriginalPlayerEconomy.mjs';
import {originalNativeFleetDynamicMod} from '../../../src/campaign/rules/OriginalNativeFleetStats.mjs';
import { originalStorageAccess, originalStorageValues, ensureOriginalStorageCargo, validateOriginalStorageState } from '../../../src/campaign/rules/OriginalStorage.mjs';
import { validateOriginalMonthlyAccounts, originalCoreEconomyTick, originalCoreEconomyMonthEnd } from '../../../src/campaign/rules/OriginalMonthlyReport.mjs';
import { restoreOriginalEconomySchedule, advanceOriginalEconomyScheduleWithRuntime } from '../../../src/campaign/rules/OriginalMarketEconomySchedule.mjs';
import { encodeOfflineCheckpoint, decodeOfflineCheckpoint } from './CheckpointCodec.mjs';
import { OriginalEconomyNotifications } from '../../../src/campaign/rules/OriginalEconomyNotifications.mjs';
import { originalMonthlyRestockingCharge } from '../../../src/campaign/rules/OriginalMonthlyReport.mjs';
import { OriginalEconomyUpdateListeners } from '../../../src/campaign/rules/OriginalEconomyListeners.mjs';
import { OriginalEconomyTaskRunner, ORIGINAL_ECONOMY_TASKS } from '../../../src/campaign/rules/OriginalEconomyTasks.mjs';
import { OriginalNativeClock } from '../../../src/campaign/rules/OriginalNativeClock.mjs';
import { ORIGINAL_MARKET_REFERENCE as RETAIL_REFERENCE } from '../../../src/campaign/rules/OriginalMarketPricing.mjs';
import { advanceOriginalRetailTimer, originalRetailFloat, originalOpenMarketLimit, planOriginalOpenResourceChange } from '../../../src/campaign/rules/OriginalOpenMarketStockpile.mjs';
import { validateOriginalResourceCargo, originalResourceQuantity, addOriginalResourceCargo, removeOriginalResourceCargo } from '../../../src/campaign/rules/OriginalResourceCargo.mjs';
/** Shared mutable OFFLINE load draft. Not a published server world or trade-admission certificate. */
import { immutableJSON, identifier, integer, requireThat, canonicalJSON } from '../../../src/campaign/core/Values.mjs';
import {hasOriginalCivicFrame,hasOriginalCivicEffects,applyOriginalLiveCivicIndustry,unapplyOriginalCivicIndustry} from '../../../src/campaign/rules/OriginalCivicIndustryEffects.mjs';
import {restoreOriginalCivicLifecycle,validateOriginalCivicLifecycle,bindOriginalCivicMemory,syncOriginalCivicDisruption,setOriginalCivicDisrupted,instantiateOriginalCivicIndustry,addOriginalCivicIndustry,startBuildingOriginalCivicIndustry,startOriginalCivicUpgrade,cancelOriginalCivicUpgrade,setOriginalCivicSpecialItem,advanceOriginalCivicIndustryFrame} from '../../../src/campaign/rules/OriginalCivicLifecycle.mjs';
import {readOriginalAdministratorIndustryInputs} from '../../../src/campaign/rules/OriginalCharacterIndustryStats.mjs';
import {buildNextOriginalConstructionQueue,validateOriginalConstructionQueue,editOriginalConstructionQueue,originalConstructionIndustryCount} from '../../../src/campaign/rules/OriginalConstructionQueue.mjs';
import { blank, get, put, stat, functional } from '../../../src/campaign/rules/OriginalIndustryState.mjs';
import { ORIGINAL_MARKET_ECONOMY, resolveOriginalCommodityMaxima, economyShape } from '../../../src/campaign/rules/OriginalMarketEconomy.mjs';
import {setOriginalMiningPlasmaVisuals} from '../../../src/campaign/rules/OriginalMiningPlanetVisuals.mjs';
import {hasOriginalResourceFrame,restoreOriginalResourceLifecycle,validateOriginalResourceLifecycle,bindOriginalResourceMemory,syncOriginalResourceDisruption,setOriginalResourceDisrupted,isOriginalResourceIndustryAvailableToBuild,instantiateOriginalResourceIndustry,addOriginalResourceIndustry,unapplyOriginalResourceRow,startBuildingOriginalResourceIndustry,setOriginalResourceSpecialItem,advanceOriginalResourceIndustryFrame} from '../../../src/campaign/rules/OriginalResourceLifecycle.mjs';
import { originalResourceIndustryOutput, applyOriginalLiveResourceIndustry } from '../../../src/campaign/rules/OriginalResourceIndustries.mjs';
import { originalCivicIndustryOutput } from '../../../src/campaign/rules/OriginalCivicIndustries.mjs';
import {restoreOriginalProductionLifecycle,validateOriginalProductionLifecycle,bindOriginalProductionMemory,syncOriginalProductionDisruption,setOriginalProductionDisrupted,startOriginalProductionUpgrade,cancelOriginalProductionUpgrade,setOriginalProductionSpecialItem,instantiateOriginalProductionIndustry,addOriginalProductionIndustry,startBuildingOriginalProductionIndustry,advanceOriginalProductionIndustryFrame} from '../../../src/campaign/rules/OriginalProductionLifecycle.mjs';
import { ORIGINAL_PRODUCTION_INDUSTRIES, originalProductionIndustryOutput, applyOriginalLiveProductionIndustry } from '../../../src/campaign/rules/OriginalProductionIndustries.mjs';
import { ORIGINAL_SPECIAL_INDUSTRIES, originalSpecialIndustryOutput } from '../../../src/campaign/rules/OriginalSpecialIndustries.mjs';
import { createOriginalCommodityPriceCalculators, updateOriginalCommodityClassPricesWithRuntime } from '../../../src/campaign/rules/OriginalCommodityClassPricing.mjs';
import { computeOriginalIncomingWithObjects } from '../../../src/campaign/rules/OriginalImmigration.mjs';
import { advanceOriginalPopulationWithObjects, validateOriginalPopulation } from '../../../src/campaign/rules/OriginalPopulation.mjs';
import { reapplyOriginalIndustryImmigrationObjects } from '../../../src/campaign/rules/OriginalColonyEnvironment.mjs';
import { modifyOriginalPopulationStability, originalMismanagementPenalty, originalMarketStabilityValue } from '../../../src/campaign/rules/OriginalMarketStability.mjs';
import { reapplyOriginalConditionPhase, applyOriginalConditionCallback } from '../../../src/campaign/rules/OriginalConditionPhase.mjs';
import { matchesOriginalLuddicMajority } from '../../../src/campaign/rules/OriginalAdditionalConditions.mjs';
import { reapplyOriginalGovernedSkills } from '../../../src/campaign/rules/OriginalGovernedSkills.mjs';
import { reapplyOriginalLiveIndustryEffects } from '../../../src/campaign/rules/OriginalLiveIndustryEffects.mjs';
import { projectNativeConditionAttachments } from './ConditionRestore.mjs';
import { ORIGINAL_MARKET_FINANCE, updateOriginalIndustryFinances } from '../../../src/campaign/rules/OriginalMarketFinance.mjs';
import { OriginalCommodityNetworkCache } from '../../../src/campaign/rules/OriginalCommodityCache.mjs';
import { prepareNativeIndustryStorage } from './IndustryStorage.mjs';
import { prepareNativeIndustryCommodityPass } from './IndustryRestore.mjs';
const restoreToken = Symbol('native-live-economy-restore'), scheduledEntryToken=Symbol('natural-scheduled-entry');
const check = (v, message) => requireThat(v, 'UNSUPPORTED_NATIVE_LIVE_ECONOMY', message), f = Math.fround;
const coreKeys = { local: 'core_local', imports: 'core_base', shortage: 'core_shortage', lowAccess: 'core_lowaccess' };
const core = new Set(Object.values(coreKeys));
const rounded = value => Math.max(0, Math.floor(value + 0.5));
function output(state, context) {
    const id = state.industryId;
    return (['farming', 'aquaculture', 'mining'].includes(id) ? originalResourceIndustryOutput : Object.hasOwn(ORIGINAL_PRODUCTION_INDUSTRIES.industries, id) ? originalProductionIndustryOutput : Object.hasOwn(ORIGINAL_SPECIAL_INDUSTRIES.industries, id) ? originalSpecialIndustryOutput : originalCivicIndustryOutput)(state, context);
}
/** All callbacks hold the SAME market/industry objects during one load transaction. Discard on failure. */
export class NativeLiveEconomyDraft {
    #markets = new Map(); #cache; #failed = false; #hostility; #source; #playerStatsCaptured; #factionIds; #loadInputs = new Map(); #loaded = new Set();
    #growthListeners; #conditionSerial = 0; #secondsPerDay; #clock = null; #clockSource = null; #listenerCapture; #economyListeners=null; #economyPass=null; #economyPassCounts=null;
    #activeOperations=0; #economyPassRequiresOutposts=false; #patrols=null; #fleetServices=null; #routeSpace=null; #sensors=null;
    #monthly=null; #playerEconomy=null; #notificationCapture=null; #notificationReceivers=null; #notificationMode=null;
    #nativeScheduleCapture=null; #nativeSchedule=null; #nativeFrameActive=false; #engineFrame=null; #engineEntityIndex=null; #engineFrameActive=false; #animationsActive=false; #marketFramesActive=new Set(); #pausedMarketsActive=false; #locationFrames=null; #locationFramesActive=new Set(); #locationEncountersActive=new Set(); #battleFramesActive=new Set(); #factionRelations=null; #factionFramesActive=new Set(); #importantPeopleActive=false; #intelManagerActive=false; #eventManagerActive=false;
    #encounters={scope:'web-retained-native-encounters',serial:0,entries:[]};
    playerExportModifiers;
    inNewGameAdvance;
    constructor(capture) {
        if(capture===restoreToken)return;
        this.#nativeScheduleCapture=structuredClone(capture.scheduler??null);
        this.#routeSpace=capture.routeSpaceCapture?restoreCapturedOriginalRouteSpace(capture.routeSpaceCapture):null;
        this.#patrols=capture.patrolCapture?restoreCapturedOriginalPatrolState(capture.patrolCapture):null;
        if(capture.factionDoctrineCapture){const random=createOriginalPatrolBranchRandom(capture.source.campaignSha256);this.#fleetServices={scope:'web-native-fleet-services',productionVariants:createOriginalProductionVariantMap(),dmodClassState:createOriginalDModClassState(),autofitClassState:createOriginalCoreAutofitClassState(),fleetWorld:null,towCableState:null,doctrineCapture:structuredClone(capture.factionDoctrineCapture),doctrines:null,shipSelectionCapture:structuredClone(capture.shipSelectionCapture??null),shipSelection:null,composition:createOriginalFleetCompositionState(),memberFactory:createOriginalFleetMemberFactory(random.global),rosters:createOriginalFleetRosterState(),dataFactory:createOriginalFleetDataFactory(),personFactory:createOriginalFactionPersonFactory(capture.source.campaignSha256,random.global),random};}
        this.#monthly=structuredClone(capture.monthlyReportCapture??null);
        this.#playerEconomy=structuredClone(capture.playerEconomyCapture??null);
        if(this.#playerEconomy?.state)this.#playerEconomy.state=restoreOriginalPlayerEconomy(this.#playerEconomy.state);
        this.#sensors=capture.sensorCapture?restoreCapturedOriginalFleetSensors(capture.sensorCapture,this.#playerEconomy?.state?.fleet??null):null;
        this.#notificationCapture=structuredClone(capture.economyNotificationCapture??null);
        if(this.#monthly?.state)validateOriginalMonthlyAccounts(this.#monthly.state);
        const network = capture.networkCapture, cargoHandles = new Map(), stackHandles = new Map(), fleetHandles=new Map(), memberHandles=new Map(), variantHandles=new Map(), detectionTargets=new Map(), militaryMemoryHandles=new Map(),industrySpecialHandles=new Map();
        const share=(map,value,label)=>{const existing=map.get(value.objectRef);if(existing){check(canonicalJSON(existing)===canonicalJSON(value),'Conflicting shared '+label+' identity');return existing;}map.set(value.objectRef,value);return value;};
        const playerCargo=this.#playerEconomy?.state?.fleet?.cargo;
        if(playerCargo){validateOriginalResourceCargo(playerCargo);for(let i=0;i<playerCargo.slots.length;i++){const stack=playerCargo.slots[i];if(stack?.objectRef)playerCargo.slots[i]=share(stackHandles,stack,'player cargo stack');}cargoHandles.set(playerCargo.objectRef,playerCargo);}

        this.#secondsPerDay = capture.clock.secondsPerDay;
        this.#listenerCapture=structuredClone(capture.economyListenerCapture??null);
        if(capture.clockCapture){
            const c=capture.clockCapture;
            check(c.scope==='native-campaign-clock-with-java-zone-table','Unsupported native clock capture');
            check(String(c.state.timestamp)===capture.clock.timestamp&&c.state.secondsPerDay===capture.clock.secondsPerDay,'Clock capture belongs to another timestamp/rate');
            this.#clock=new OriginalNativeClock(c.state);
            check(c.readback.timestamp===c.state.timestamp&&canonicalJSON(this.#clock.date())===canonicalJSON(c.readback.date),'Native clock readback mismatch');
            this.#clockSource=structuredClone(c.source);
        }
        this.inNewGameAdvance = capture.inNewGameAdvance ?? null;
        this.#growthListeners = structuredClone(capture.growthListeners ?? null);
        check(network?.scope === 'native-economy-network-getter-inputs' && network.unresolved.length === 0, 'Complete actual network getter capture required');
        const storage = prepareNativeIndustryStorage(capture), policies = new Map(), objects = new Map();
        this.#hostility = structuredClone(network.hostility); this.#source = structuredClone(capture.source);
        this.#playerStatsCaptured = network.playerStatsRef !== null;
        this.#factionIds = structuredClone(network.registeredFactionIds ?? null);
        this.playerExportModifiers = Object.fromEntries(Object.keys(ORIGINAL_MARKET_ECONOMY.commodities).map(id => {
            check(Object.hasOwn(network.playerExportModifiers, id), 'Missing player export getter capture');
            return [id, structuredClone(network.playerExportModifiers[id]?.state ?? null)];
        }));
        for (let n = 0; n < capture.markets.length; n++) {
            const saved = capture.markets[n], loc = saved.networkLocationCapture;
            check(loc?.scope === 'native-market-hyperspace-getter-input' && loc.position && loc.unresolved.length === 0, 'Actual hyperspace getter required');
            const prepared = prepareNativeIndustryCommodityPass(saved, storage.markets[n]);
            check(prepared.status === 'prepared', 'Complete industry getter inputs required for shared network state');
            this.#loadInputs.set(saved.marketId, structuredClone({saved, input:prepared.input, portItemContext:storage.markets[n].portItemContext}));
            const policy = saved.industryInputCapture.faction, signature = canonicalJSON(policy);
            check(!policies.has(policy.factionId) || policies.get(policy.factionId) === signature, 'Conflicting faction policy');
            check(!objects.has(policy.objectRef) || objects.get(policy.objectRef) === signature, 'Conflicting faction identity');
            policies.set(policy.factionId, signature); objects.set(policy.objectRef, signature);
            if (saved.populationCapture) {
                check(saved.populationCapture.scope === 'native-saved-population-state', 'Unsupported population capture');
                for (const key of ['population', 'incoming']) {
                    check(Object.hasOwn(saved.populationCapture, key), 'Incomplete saved population capture');
                    if (saved.populationCapture[key] !== null) validateOriginalPopulation(saved.populationCapture[key]);
                }
            }
            const demandClasses = Object.fromEntries(saved.demandClasses.map(d=>{
                check(d.demand.temporary.length===0,'MarketDemand is not a temporary stat');
                return [d.demandClass,{objectRef:d.objectRef,demandClass:d.demandClass,state:structuredClone(d.demand.state)}];
            }));
            const old = new Map(saved.commodities.map(c => [c.commodityId, c]));
            const commodities = Object.fromEntries(prepared.input.conditionPhase.state.commodities.map(c => {
                const source = old.get(c.commodityId), timed = key => structuredClone(source?.[key]?.state ?? blank());
                const spec=ORIGINAL_MARKET_ECONOMY.commodities[c.commodityId],demandClass=spec.demandClass;
                const demand=demandClasses[demandClass] ??= {objectRef:'created-demand:'+saved.objectRef+':'+demandClass,demandClass,state:blank()};
                check(!source || source.demandRef===demand.objectRef && source.demandClass===demandClass,'Commodity demand reference differs from shared class object');
                check(!source || source.greed.temporary.length===0,'Commodity greed is not a temporary stat');
                const greed=timed('greed'),pricing=!spec.plugin
                    ? createOriginalCommodityPriceCalculators({commodityId:c.commodityId,demandStat:demand.state,greedStat:greed,fromSaved:Boolean(source)})
                    : {demandPrice:null,supplyPrice:null};
                return [c.commodityId, { commodityId: c.commodityId, demand, stockpile:source?.stockpile ?? 0, greed,
                    playerDemandMod:structuredClone(source?.playerDemandMod ?? {flat:[],percent:[],mult:[]}),
                    playerSupplyMod:structuredClone(source?.playerSupplyMod ?? {flat:[],percent:[],mult:[]}),
                    demandPrice:structuredClone(pricing.demandPrice),supplyPrice:structuredClone(pricing.supplyPrice),lastPriceUpdate:null,
                    maxSupply: c.maxSupply, maxDemand: source?.maxDemand ?? 0,
                    supplyLegal: source?.supplyLegal ?? true, demandLegal: source?.demandLegal ?? true,
                    available: structuredClone(c.available), tradeMod: timed('tradeMod'), tradeModPlus: timed('tradeModPlus'), tradeModMinus: timed('tradeModMinus'),
                    temporary: Object.fromEntries(['available', 'tradeMod', 'tradeModPlus', 'tradeModMinus'].map(k => [k, structuredClone(source?.[k]?.temporary ?? [])])),
                }];
            }));
            const retail = structuredClone(saved.retailCapture ?? null);
            if (retail) {
                check(retail.scope === 'native-saved-open-resource-cargo', 'Unsupported retail capture');
                for (const sub of [...retail.submarkets,...retail.otherSubmarkets.filter(row=>row.storage).map(row=>row.storage)]) if (sub.cargo) {
                    for (let index=0;index<sub.cargo.slots.length;index++) {
                        const stack=sub.cargo.slots[index];if(!stack?.objectRef)continue;
                        const oldStack=stackHandles.get(stack.objectRef);
                        if(oldStack){check(canonicalJSON(oldStack)===canonicalJSON(stack),'Conflicting shared cargo stack identity');sub.cargo.slots[index]=oldStack;}
                        else stackHandles.set(stack.objectRef,stack);
                    }
                    validateOriginalResourceCargo(sub.cargo);
                    const existing = cargoHandles.get(sub.cargo.objectRef);
                    if (existing) { check(canonicalJSON(existing) === canonicalJSON(sub.cargo), 'Conflicting shared cargo identity'); sub.cargo = existing; }
                    else cargoHandles.set(sub.cargo.objectRef, sub.cargo);
                }
            }
            for(const row of retail?.otherSubmarkets??[])if(row.storage){
                const store=row.storage;validateOriginalStorageState(store);
                if(store.mothballed){
                    store.mothballed.members=store.mothballed.members.map(member=>{if(member===null)return null;if(member.variant)member.variant=share(variantHandles,member.variant,'stored variant');return share(memberHandles,member,'stored member');});
                    store.mothballed=share(fleetHandles,store.mothballed,'mothballed fleet');
                }
            }
            const slipstreamDetection=structuredClone(saved.slipstreamDetection??null);if(slipstreamDetection?.bonus)slipstreamDetection.bonus=share(detectionTargets,slipstreamDetection.bonus,'market detection stat');
            this.#markets.set(saved.marketId, { marketId: saved.marketId, name:saved.name, objectRef: saved.objectRef, factionId: saved.factionId,
                econGroup: saved.econGroup, size: saved.size, hidden: saved.hidden === true, playerOwned: saved.playerOwned, freePort: saved.isFreePort,
                military:structuredClone(saved.industryInputCapture.militaryCapture??null),
                retail, slipstreamDetection, economyBonuses:saved.industryInputCapture.economyBonuses ? Object.fromEntries(Object.entries(saved.industryInputCapture.economyBonuses).map(([key,value])=>[key,structuredClone(value??{flat:[],percent:[],mult:[]})])) : null, location: structuredClone(loc.position), factionIllegalCommodityIds: [...policy.illegalCommodityIds],
                previousStability: saved.industryInputCapture.previousStability, adminIsPlayer: storage.markets[n].administratorReadback.adminIsPlayer,
                conditions: structuredClone(prepared.input.conditions), stability: structuredClone(prepared.input.conditionPhase.state.stability),
                stabilityTemporary: structuredClone(saved.conditionLoadCapture.stability.temporary),
                finances: structuredClone(storage.markets[n].industries.map(i => i.storage.finances)),
                incomeMult: structuredClone(saved.incomeMult.state), upkeepMult: structuredClone(saved.upkeepMult.state),
                accessibility: structuredClone(prepared.input.conditionPhase.state.accessibility),
                industries: structuredClone(prepared.input.industries), commodities, demandClasses,
                supplyPriceMod:structuredClone(saved.supplyPriceMod),demandPriceMod:structuredClone(saved.demandPriceMod),
                hazard: structuredClone(prepared.input.conditionPhase.state.hazard),
                hasSpaceport: saved.industryInputCapture.marketEffects?.hasSpaceport ?? false,
                maxIndustries: structuredClone(saved.industryInputCapture.marketEffects?.maxIndustries ?? {flat:[],percent:[],mult:[]}),
                production: structuredClone(prepared.input.production ?? {productionQuality:saved.industryInputCapture.productionQuality??blank(),previousStability:saved.industryInputCapture.previousStability,adminFuelSupplyBonus:readOriginalAdministratorIndustryInputs(storage.markets[n].characterIndustryStatsDraft.administrator.modifiers).adminFuelSupplyBonus}), special: structuredClone(prepared.input.special ?? null),
                conditionState: structuredClone(prepared.input.conditionPhase.state), groundDefenses:structuredClone(prepared.input.governedSkills.groundDefenses??{flat:[],percent:[],mult:[]}), governedState: null, conditionAttachments: null,
                conditionContextByModId: structuredClone(prepared.input.conditionPhase.contextByModId),
                conditionObjectRefs: Object.fromEntries(saved.conditionLoadCapture.pluginState.map(p=>[p.modId,p.pluginRef ?? 'loaded-condition:' + p.conditionRef])),
                churchContext: structuredClone(saved.growthCapture?.church ?? null),
                constructionQueue: [...(saved.industryInputCapture.marketEffects?.constructionQueue ?? [])],
                constructionQueueState: structuredClone(saved.industryInputCapture.marketEffects?.constructionQueueState??null),
                civicAdminInputs: structuredClone(readOriginalAdministratorIndustryInputs(storage.markets[n].characterIndustryStatsDraft.administrator.modifiers)),
                civicPortItemContext: storage.markets[n].planetReadback?{planetIsGasGiant:storage.markets[n].planetReadback.planetIsGasGiant,conditionIds:[...new Set(prepared.input.conditions.map(c=>c.id))]}:null,
                resourcePlanetContext: storage.markets[n].planetReadback?{planetType:storage.markets[n].planetReadback.planetType,planetEntityRef:storage.markets[n].planetReadback.planetEntityRef}:null,
                buildAdmission: Object.hasOwn(saved.industryInputCapture.marketEffects??{},'tags')?{tags:structuredClone(saved.industryInputCapture.marketEffects.tags)}:null,
                immigrationModifiers: null, incoming: structuredClone(saved.populationCapture?.incoming ?? null),
                population: structuredClone(saved.populationCapture?.population ?? null),
                adminAiCoreId: storage.markets[n].administratorReadback.aiCoreId,
                maxMarketSize: structuredClone(saved.industryInputCapture.immigration?.maxMarketSize ?? {flat:[],percent:[],mult:[]}),
                incentives: structuredClone(saved.industryInputCapture.immigration?.incentives ?? null),
            });
        }
        this.#bindPlayerEconomy(false);
        for(const m of this.#markets.values())if(m.military){
            check(m.economyBonuses,'Military effects require actual market dynamic statistics');
            m.military.memory=share(militaryMemoryHandles,m.military.memory,'military flag memory');
            m.economyBonuses.officer_prob=m.military.officerProbability;
        }
        for(const m of this.#markets.values())if(m.economyBonuses){
            m.economyBonuses.ground_defenses_mod=m.groundDefenses;
            if(m.production)m.production.productionQuality=m.economyBonuses.production_quality_mod;
        }
        for(const saved of capture.markets){const m=this.market(saved.marketId);m.industryLifecycle=restoreOriginalMilitaryLifecycle(saved,m,this.#patrols,value=>share(industrySpecialHandles,value,'industry special item'));m.productionLifecycle=restoreOriginalProductionLifecycle(saved,m,value=>share(industrySpecialHandles,value,'industry special item'));m.civicLifecycle=restoreOriginalCivicLifecycle(saved,m,value=>share(industrySpecialHandles,value,'industry special item'));m.resourceLifecycle=restoreOriginalResourceLifecycle(saved,m,value=>share(industrySpecialHandles,value,'industry special item'));}
        this.#cache = new OriginalCommodityNetworkCache(this.#cacheRuntime());
    }
    #cacheRuntime() {
        return {
            getEconGroup: id => this.market(id).econGroup,
            getAccessibility: id => this.market(id).accessibility,
            getIncomeInputs: (id, commodityId) => {
                const m = this.market(id);
                check(!m.playerOwned || this.#playerStatsCaptured, 'Player income requires captured character statistics');
                return { incomeMult: m.incomeMult, playerOwned: m.playerOwned, playerCommodityExportMult: m.playerOwned ? this.playerExportModifiers[commodityId] === null ? 1 : stat(this.playerExportModifiers[commodityId]) : null };
            },
            setDemandFromPrimary: (id, variantId, maxDemand, demandLegal) => {
                const c = this.market(id).commodities[variantId]; check(c, 'Missing class-variant cache');
                c.maxDemand = maxDemand; c.demandLegal = demandLegal;
            },
            capture: (commodityId, econGroup) => this.#capture(commodityId, econGroup),
            apply: (input, entry) => this.#apply(input, entry),
        };
    }
    market(id) { check(!this.#failed, 'Failed shared draft must be discarded'); identifier(id); const value = this.#markets.get(id); check(value, 'Unknown market handle'); return value; }
    marketIds() { check(!this.#failed, 'Failed shared draft must be discarded'); return [...this.#markets.keys()]; }
    #capture(commodityId, econGroup) {
        const spec = ORIGINAL_MARKET_ECONOMY.commodities[commodityId];
        check(Object.hasOwn(ORIGINAL_MARKET_ECONOMY.commodities, commodityId) && !spec.plugin && !spec.tags.includes('nonecon'), 'Unsupported economic commodity constructor');
        const selected = [...this.#markets.values()].filter(m => m.econGroup === econGroup);
        const factions = [...new Set(selected.map(m => m.factionId))];
        const hostility = Object.fromEntries(factions.map(from => [from, Object.fromEntries(factions.filter(to => to !== from).map(to => {
            return [to,this.#currentHostility(from,to,'Missing actual directed hostility')];
        }))]));
        const markets = selected.map(m => {
            const c = m.commodities[commodityId], a = c.available;
            check(a.base === 0 && a.modifiers.percent.length === 0 && a.modifiers.mult.length === 0, 'Available stat requires a nonlinear network adapter; cannot discard multipliers');
            const illegal = !m.freePort && (m.factionIllegalCommodityIds.includes(commodityId) || m.factionIllegalCommodityIds.includes(spec.demandClass));
            const outputs = m.industries.map(i => {
                get(i.state, 'supply', commodityId); if (spec.id === spec.demandClass) get(i.state, 'demand', commodityId);
                return output(i.state, { commodityId, illegal });
            });
            const amounts = resolveOriginalCommodityMaxima({ commodityId, industries: outputs, previousSupplyLegal: c.supplyLegal, previousDemandLegal: c.demandLegal });
            Object.assign(c, amounts);
            let otherAvailableFlat = 0, eventModBeforeCore = 0;
            for (const mod of a.modifiers.flat) {
                if (mod.id === 'eMod') eventModBeforeCore = mod.value;
                else if (!core.has(mod.id)) otherAvailableFlat = f(otherAvailableFlat + mod.value);
            }
            return { marketId: m.marketId, factionId: m.factionId, size: m.size, location: m.location, hidden: m.hidden, accessibility: m.accessibility,
                amounts, availableBeforeCore: rounded(stat(a)), otherAvailableFlat, eventModBeforeCore,
                tradeMod: { both: stat(c.tradeMod), plus: stat(c.tradeModPlus), minus: stat(c.tradeModMinus) },
            };
        });
        return { network: { commodityId, econGroup, roster: [...this.#markets.values()].map(m => ({ marketId: m.marketId, econGroup: m.econGroup })), markets, hostility },
            financialMarkets: selected.map(m => {
                check(!m.playerOwned || this.#playerStatsCaptured, 'Player export statistics unavailable');
                return { marketId: m.marketId, playerOwned: m.playerOwned, incomeMult: m.incomeMult, playerCommodityExportMult: m.playerOwned ? this.playerExportModifiers[commodityId] === null ? 1 : stat(this.playerExportModifiers[commodityId]) : null };
            }),
        };
    }
    #apply(input, entry) {
        for (const row of entry.data.network.markets) {
            const m = this.market(row.marketId), c = m.commodities[input.network.commodityId];
            check(this.#cache.peek(m.marketId, c.commodityId) === entry, 'Constructor must bind references before applying');
            m.accessibility = structuredClone(row.accessibility);
            for (const key of core) put(c.available, 'flat', key, 0, true);
            for (const [key, value] of Object.entries(row.availability.core)) if (value !== 0) put(c.available, 'flat', coreKeys[key], value);
            if (row.availability.reappliesEventMod) put(c.available, 'flat', 'eMod', row.appliedEventMod, row.appliedEventMod === 0);
            check(stat(c.available) === row.availableStatValue, 'Available modifier application differs from native float network result');
        }
    }
    #operation(fn) { check(!this.#failed, 'Failed shared draft must be discarded'); this.#activeOperations++;try { return fn(); } catch (error) { this.#failed = true; throw error; } finally {this.#activeOperations--;} }
    #currentMarketCommodity(m,commodityId){const commodity=m.commodities[commodityId];check(commodity,'Actual market commodity required; uncaptured commodity construction is unavailable');return commodity;}
    #currentCommodityAvailable(m,commodityId){return Math.max(0,rounded(stat(this.#currentMarketCommodity(m,commodityId).available)));}
    getCommodityData(marketId, commodityId) { return this.#operation(() => this.#cache.get(marketId, commodityId)); }
    rebuildCommodityData(commodityId, econGroup) { return this.#operation(() => this.#cache.rebuild(commodityId, econGroup)); }
    peekCommodityData(marketId, commodityId) { check(!this.#failed, 'Failed shared draft must be discarded'); this.market(marketId); return this.#cache.peek(marketId, commodityId); }
    getExportIncome(marketId, commodityId) { return this.#operation(() => { this.market(marketId); return this.#cache.getExportIncome(marketId, commodityId); }); }
    getShipping(marketId) { return this.#operation(() => this.#cache.getShipping(marketId)); }
    /** PopulationAndInfrastructure.modifyStability only; caller owns unapply/apply ordering. */
    modifyPopulationStability(marketId, readMaxOutposts) {
        return this.#operation(() => {
            const m = this.market(marketId);
            check(m.industries.some(i => i.state.industryId === 'population'), 'Population callback requires the actual population industry');
            return modifyOriginalPopulationStability({ state: m, previousStability: m.previousStability,
                ...(m.personnel?{isAdminPlayer:()=>this.getNativeMarketAdministrator(marketId)===this.playerEconomyState().player}:{}),
                playerOwned: m.playerOwned, adminIsPlayer: m.adminIsPlayer, hasCommRelay: m.conditions.some(c => c.id === 'comm_relay'), modId: 'ind_population_3',
                getCommodityIds: () => Object.keys(m.commodities),
                getMaxDemand: id => m.commodities[id].maxDemand,
                getAfterNetwork: id => {
                    const entry = this.getCommodityData(marketId, id), c = m.commodities[id];
                    return { maxSupply: c.maxSupply, available: rounded(stat(c.available)), shippingFaction: this.getShipping(marketId).inFaction,
                        maxExportFaction: entry.data.network.exports.maxExportPerFaction[m.factionId] ?? 0 };
                },
                getMismanagementPenalty: () => {
                    const markets=[...this.#markets.values()].map(row=>{
                        let adminIsPlayer=row.adminIsPlayer===true;
                        if(row.playerOwned){
                            if(row.personnel)adminIsPlayer=this.getNativeMarketAdministrator(row.marketId)===this.playerEconomyState().player;
                            else check(typeof row.adminIsPlayer==='boolean','Current player administrator identity required');
                        }
                        return {marketId:row.marketId,playerOwned:row.playerOwned,adminIsPlayer};
                    });
                    check(readMaxOutposts===undefined||typeof readMaxOutposts==='function','Invalid outpost getter');
                    check(readMaxOutposts||this.#playerEconomy?.state?.player?.stats?.nativeCharacterStatsVersion===1,'Restored player outpost getter required; saved/reset stat cannot stand in');
                    const maxOutposts=readMaxOutposts?readMaxOutposts():this.readNativeOutpostLimit();
                    return originalMismanagementPenalty({maxOutposts,markets});
                },
            });
        });
    }
    /** One offline market's ordered economic effects; not complete native lifecycle or authority admission. */
    reapplyMarketEconomicEffects(marketId, readMaxOutposts) {
        return this.#operation(() => {
            const m = this.market(marketId), {saved} = this.#loadInputs.get(marketId);
            check(!this.#loaded.has(marketId), 'Offline market load is single-use; use a new draft for another load');
            check(saved.industryInputCapture.marketEffects, 'Complete local market-effect getter capture required');
            // Preserve network mutations made while earlier markets loaded. Never restart from saved commodity/access caches.
            const state = {...structuredClone(m.conditionState), hazard:m.hazard, accessibility:m.accessibility, stability:m.stability,
                commodities:Object.values(m.commodities).map(c=>({commodityId:c.commodityId,maxSupply:c.maxSupply,available:c.available}))};
            const condition = reapplyOriginalConditionPhase({marketSize:m.size, conditions:m.conditions, industries:m.industries, state, contextByModId:m.conditionContextByModId});
            m.conditions = structuredClone(condition.conditions);
            m.conditionState = structuredClone(condition.state);
            m.conditionAttachments = structuredClone(projectNativeConditionAttachments(saved, condition));
            for (const key of ['hazard','accessibility','stability']) m[key] = structuredClone(condition.state[key]);
            check(m.industries.length === condition.industries.length, 'Condition industry roster differs');
            for (let n=0;n<m.industries.length;n++) {
                check(m.industries[n].state.industryId === condition.industries[n].state.industryId, 'Condition reordered live industries');
                m.industries[n].state = structuredClone(condition.industries[n].state);
                m.industries[n].modifiers = structuredClone(condition.industries[n].modifiers);
            }
            for (const c of condition.state.commodities) m.commodities[c.commodityId].available = structuredClone(c.available);
            m.immigrationModifiers = Object.fromEntries(Object.entries(m.conditionAttachments.callbackObjects).map(([key,list])=>[key,list.map(({kind,id,objectRef})=>({kind,id,objectRef}))]));
            const {governed, industries} = this.#applyGovernedAndIndustries(marketId,readMaxOutposts);
            this.#loaded.add(marketId);
            return immutableJSON({scope:'shared-offline-market-economic-effects-only',marketId,conditionExecution:condition.execution,governedExecution:governed.execution,industries,readyForAuthority:false});
        });
    }
    #refreshGovernedOutpostEffects(stats,m) {
        const {input}=this.#loadInputs.get(m.marketId);
        const governed = reapplyOriginalGovernedSkills({skills:stats.skills,state:{accessibility:m.accessibility,stability:m.stability,
            combatFleetSize:m.economyBonuses?.combat_fleet_size_mult ?? m.governedState?.combatFleetSize ?? input.governedSkills.combatFleetSize,groundDefenses:m.groundDefenses}});
        m.governedState = structuredClone(governed.state);
        this.#installBonus(m.groundDefenses,governed.state.groundDefenses);m.governedState.groundDefenses=m.groundDefenses;
        if(m.economyBonuses){this.#installBonus(m.economyBonuses.combat_fleet_size_mult,governed.state.combatFleetSize);m.governedState.combatFleetSize=m.economyBonuses.combat_fleet_size_mult;}
        m.accessibility = structuredClone(governed.state.accessibility); m.stability = structuredClone(governed.state.stability);
        return governed;
    }
    #personnelServices(){return {refreshGovernedOutpostEffects:(stats,market)=>this.#refreshGovernedOutpostEffects(stats,market)};}
    #applyGovernedAndIndustries(marketId, readMaxOutposts) {
        const m=this.market(marketId), prepared=this.#loadInputs.get(marketId), {input,saved}=prepared;
        // Legacy economic-only captures have no personnel world. A bound current market
        // must use getAdmin (including its side effects), never the saved skill snapshot.
        const stats=m.personnel?getOriginalMarketAdministrator(this.playerEconomyState(),m,this.#personnelServices()).stats:{skills:input.governedSkills.skills};
        const governed=this.#refreshGovernedOutpostEffects(stats,m);
        const industries = reapplyOriginalLiveIndustryEffects({market:m,context:{constructionQueue:m.constructionQueue,portItemContext:prepared.portItemContext ? {...prepared.portItemContext,conditionIds:[...new Set(m.conditions.map(c=>c.id))]} : null},
            ...(m.personnel?{readAdministratorIndustryInputs:id=>({
                adminSupplyBonus:this.readNativeMarketAdministratorModifier(marketId,'supply_bonus'),
                adminDemandReduction:this.readNativeMarketAdministratorModifier(marketId,'demand_reduction'),
                ...(id==='fuelprod'?{adminFuelSupplyBonus:this.readNativeMarketAdministratorModifier(marketId,'fuel_supply_bonus')}:{})
            })}:{}),
            updateResourceImmigration:(entry,add)=>{const object=m.resourceLifecycle?.industries.find(row=>row.active&&row.entry===entry)??saved.industries.find(row=>row.industryId===entry.state.industryId);check(object&&m.industries.includes(entry)&&m.immigrationModifiers,'Actual resource industry immigration identity required');const list=m.immigrationModifiers.transient,index=list.findIndex(row=>row.objectRef===object.objectRef);if(!add){if(index>=0)list.splice(index,1);}else if(index<0)list.push({kind:'industry',id:entry.state.industryId,objectRef:object.objectRef});},
            readPlanetIsGasGiant:()=>this.#resourcePlanetIsGasGiant(m),
            ...(m.resourceLifecycle?{reapplyResourceIndustry:entry=>{const row=validateOriginalResourceLifecycle(m).industries.find(row=>row.active&&row.entry===entry);check(row,'Actual current resource identity required');const runtime=this.#resourceLifecycleRuntime(m);unapplyOriginalResourceRow(m,row,runtime);return runtime.apply(row);}}:{}),
            ...(m.civicLifecycle?{reapplyCivicIndustry:entry=>{const row=validateOriginalCivicLifecycle(m).industries.find(row=>row.active&&row.entry===entry);check(row,'Actual current civic identity required');unapplyOriginalCivicIndustry(m,row);return this.#civicLifecycleRuntime(m,{readMaxOutposts}).apply(row);}}:{}),
            readCommodityAvailable:id=>this.#currentCommodityAvailable(m,id),
            modifyPopulationStability:()=>this.modifyPopulationStability(marketId,readMaxOutposts), applyFinances:id=>this.#updateIndustryFinances(marketId,id,'industry-apply'),
            reapplyImmigrationRegistrations:()=>{
                const modifiers=m.immigrationModifiers;
                m.immigrationModifiers=structuredClone(reapplyOriginalIndustryImmigrationObjects({modifiers,conditions:m.conditions,industries:m.industries.map(i=>{
                    const object=m.industryLifecycle?.industries.find(row=>row.active&&row.entry===i)??m.productionLifecycle?.industries.find(row=>row.active&&row.entry===i)??m.civicLifecycle?.industries.find(row=>row.active&&row.entry===i)??m.resourceLifecycle?.industries.find(row=>row.active&&row.entry===i)??saved.industries.find(row=>row.industryId===i.state.industryId);
                    check(object,'Actual current industry identity required for immigration registration');
                    return {industryId:i.state.industryId,objectRef:object.objectRef,operating:i.operating};
                })}));
                return m.immigrationModifiers;
            }});
        return {governed,industries};
    }
    /** Preserve native ordered market visits; do not globally apply every industry's quantities first. */
    reapplyEconomicEffects(readMaxOutposts) {
        return this.#operation(() => {
            check(this.#loaded.size === 0, 'Whole-roster offline load requires a fresh draft');
            const markets = this.marketIds().map(id=>this.reapplyMarketEconomicEffects(id,readMaxOutposts));
            return immutableJSON({scope:'shared-offline-economy-economic-effects-only',markets,readyForAuthority:false});
        });
    }
    #churchContext(m) {
        const existing=m.conditions.find(c=>c.id==='luddic_majority');
        const context=m.churchContext ?? (existing ? m.conditionContextByModId[existing.modId] : null);
        check(context, 'Actual Church listener getters required');
        return {...context,playerOwned:m.playerOwned,habitable:m.conditions.some(c=>c.id==='habitable'),
            constructionQueue:m.constructionQueue.map(industryId=>({industryId,specExists:true}))};
    }
    #conditionInput(m) {
        const {saved}=this.#loadInputs.get(m.marketId);
        const current=row=>row.kind==='condition' ? m.conditionObjectRefs[row.id]===row.objectRef
            : saved.industries.some(i=>i.industryId===row.id && i.objectRef===row.objectRef);
        const contextByModId=Object.fromEntries(m.conditions.map(c=>{
            let context=m.conditionContextByModId[c.modId];
            if(c.id==='luddic_majority') context=this.#churchContext(m);
            if(c.id==='shipping_disruption') context={...context,marketSize:m.size,playerOwned:m.playerOwned};
            return [c.modId,context];
        }));
        return {marketSize:m.size,conditions:m.conditions,industries:m.industries,contextByModId,
            state:{...m.conditionState,hazard:m.hazard,accessibility:m.accessibility,stability:m.stability,
                immigrationModifiers:Object.fromEntries(Object.entries(m.immigrationModifiers).map(([key,list])=>[key,list.filter(current).map(({kind,id})=>({kind,id}))])),
                commodities:Object.values(m.commodities).map(c=>({commodityId:c.commodityId,maxSupply:c.maxSupply,available:c.available}))}};
    }
    #conditionCallback(m, modId, action) {
        const result=applyOriginalConditionCallback(this.#conditionInput(m),modId,action), ref=m.conditionObjectRefs[modId];
        check(typeof ref==='string', 'Missing current condition object identity');
        // Only this object receives apply/unapply. Do not rebuild/merge the whole set by logical ID:
        // distinct old resource plugins and unrelated registrations must retain their exact order.
        for(const key of ['permanent','transient']) {
            const list=m.immigrationModifiers[key],at=list.findIndex(row=>row.objectRef===ref);
            const registered=result.state.immigrationModifiers[key].some(row=>row.kind==='condition'&&row.id===modId);
            if(!registered && at>=0) list.splice(at,1);
            else if(registered && at<0) list.push({kind:'condition',id:modId,objectRef:ref});
        }
        m.conditions=structuredClone(result.conditions);m.conditionState=structuredClone(result.state);
        for(const key of ['hazard','accessibility','stability']) m[key]=structuredClone(result.state[key]);
        check(m.industries.length===result.industries.length,'Condition changed industry roster');
        for(let n=0;n<m.industries.length;n++) {
            check(m.industries[n].state.industryId===result.industries[n].state.industryId,'Condition reordered industries');
            m.industries[n].state=structuredClone(result.industries[n].state);
            m.industries[n].modifiers=structuredClone(result.industries[n].modifiers);
        }
        for(const c of result.state.commodities) m.commodities[c.commodityId].available=structuredClone(c.available);
    }
    #removeCondition(m,id) {
        for(const c of m.conditions.filter(c=>c.id===id)) {
            this.#conditionCallback(m,c.modId,'unapply');
            m.conditions=m.conditions.filter(row=>row.modId!==c.modId);
            delete m.conditionContextByModId[c.modId];delete m.conditionObjectRefs[c.modId];
        }
    }
    #addGrowthCondition(m,id) {
        check(/^population_(?:[0-9]|10)$/.test(id)||id==='luddic_majority'||id==='pollution','Unsupported newly-created condition context');
        let modId;do { modId=id+'_runtime_'+m.objectRef+'_'+(++this.#conditionSerial); } while(Object.hasOwn(m.conditionObjectRefs,modId));
        m.conditions.push({id,modId,surveyed:true,suppressed:m.conditionState.suppressedConditionIds.includes(id)});
        m.conditionObjectRefs[modId]='runtime-condition:'+m.objectRef+':'+this.#conditionSerial;
        m.conditionContextByModId[modId]=id==='luddic_majority' ? this.#churchContext(m) : null;
        if(!m.conditionState.suppressedConditionIds.includes(id)) this.#conditionCallback(m,modId,'apply');
        return modId;
    }
    /** Current-state reapplication after load, preserving callback identities and existing commodity-network caches. */
    #reapplyCurrentConditions(marketId) {
        const m=this.market(marketId);check(this.#loaded.has(marketId)&&m.immigrationModifiers,'Initial economic load required');
        let applied=0;const roster=[...m.conditions];
        for(const c of roster){this.#conditionCallback(m,c.modId,'unapply');if(c.surveyed&&!m.conditionState.suppressedConditionIds.includes(c.id)){this.#conditionCallback(m,c.modId,'apply');applied++;}}
        return {scope:'native-ordered-condition-callbacks-only',visited:roster.length,applied};
    }
    reapplyCurrentMarketEconomicEffects(marketId, readMaxOutposts) {
        return this.#operation(()=>{
            const conditionExecution=this.#reapplyCurrentConditions(marketId),{governed,industries}=this.#applyGovernedAndIndustries(marketId,readMaxOutposts);
            return immutableJSON({scope:'shared-current-market-economic-effects-only',marketId,conditionExecution,governedExecution:governed.execution,industries,readyForAuthority:false});
        });
    }
    #listenerRuntime() {
        return {factionShipQualityContribution:id=>originalFactionShipQualityContribution(this.factionDoctrine(id)),market:id=>this.market(id),marketIds:()=>this.marketIds(),getCommodityData:(id,c)=>this.getCommodityData(id,c),getShipping:id=>this.getShipping(id),
            isPaused:()=>false,chargeRestocking:(id,commodityId,quantity)=>{
                const market=this.market(id),source=this.#loadInputs.get(id).saved.commodities.find(row=>row.commodityId===commodityId);
                check(market.commodities[commodityId],'Actual restocking commodity handle required');
                const objectRef=source?.objectRef??'created-commodity:'+market.objectRef+':'+commodityId;
                return originalMonthlyRestockingCharge(this.#monthlyAccounts(),{id:commodityId,objectRef},quantity);
            }}; // Only explicitly unpaused scheduled tasks are admitted.
    }
    #listeners() {
        if(!this.#economyListeners)this.#economyListeners=new OriginalEconomyUpdateListeners(this.#listenerCapture,this.#listenerRuntime());
        return this.#economyListeners;
    }
    /** One real scheduled task pass, not the month-end event ledger or a wall-clock scheduler. */
    beginScheduledEconomyPass(options,readMaxOutposts,entryToken) {
        return this.#operation(()=>{
            check(this.#nativeSchedule===null||entryToken===scheduledEntryToken,'Natural scheduler owns economy passes once enabled');
            check(options&&Object.keys(options).length===2&&typeof options.lastIteration==='boolean'&&options.paused===false,'Scheduled economy requires explicit unpaused state and lastIteration');
            check(!this.#economyPass||this.#economyPass.status().phase==='done','An economy pass is already active');
            check(this.#loaded.size===this.#markets.size,'Initial ordered market load must finish before scheduled tasks');
            this.#nativeClock();this.#listeners();
            for(const m of this.#markets.values())check(m.economyBonuses,'Actual dynamic economy statistics required');
            const counts={conditionPasses:0,industryPasses:0,networkRebuilds:0,priceUpdates:0,populationAdvances:0,commodityCallbacks:0,finishCallbacks:0};this.#economyPassCounts=counts;
            this.#economyPassRequiresOutposts=typeof readMaxOutposts==='function';
            this.#economyPass=new OriginalEconomyTaskRunner(this.#scheduledRuntime(readMaxOutposts),{mode:'scheduled',lastIteration:options.lastIteration});
            return this.scheduledEconomyStatus();
        });
    }
    #scheduledRuntime(readMaxOutposts,counts=this.#economyPassCounts) {
        const listeners=this.#listeners();
        return {
                listReachMarkets:()=>this.marketIds(),listEconomyMarkets:()=>this.marketIds(),
                getCommoditySpecs:()=>Object.entries(ORIGINAL_ECONOMY_TASKS.commodities).map(([id,spec])=>({id,...spec})),
                getMarketEconGroup:id=>this.market(id).econGroup,
                refreshCharacterEffects:()=>{throw Error('Forced character refresh is not a scheduled task');},
                refreshGovernedOutpostEffects:()=>{throw Error('Forced outpost refresh is not a scheduled task');},
                reapplyConditions:id=>{this.#reapplyCurrentConditions(id);counts.conditionPasses++;},
                reapplyIndustries:id=>{this.#applyGovernedAndIndustries(id,readMaxOutposts);counts.industryPasses++;},
                computeCommodityData:(commodityId,group)=>{this.rebuildCommodityData(commodityId,group);counts.networkRebuilds++;},
                updateStockpileAndPrice:(id,commodityId)=>{this.updateStockpileAndPrice(id,commodityId,{phase:'native-final-iteration'});counts.priceUpdates++;},
                advanceImmigration:(id,days,uiUpdateOnly)=>{this.advancePopulation(id,{days,uiUpdateOnly},readMaxOutposts);counts.populationAdvances++;},
                listUpdateListeners:()=>listeners.roster(),isEconomyListenerExpired:ref=>listeners.expired(ref),removeUpdateListener:ref=>listeners.remove(ref),
                commodityUpdated:(ref,id)=>{listeners.commodityUpdated(ref,id);counts.commodityCallbacks++;},
                economyUpdated:ref=>{listeners.economyUpdated(ref);counts.finishCallbacks++;},
            };
    }
    /** Economy.tripleStep: synchronous UI refresh, never immigration/time advancement. */
    refreshNativeColonyEconomy(){return this.#operation(()=>{
        check(this.#loaded.size===this.#markets.size,'All market economic effects must be loaded before forced refresh');
        this.#nativeClock();
        const playerStats=this.#currentNativePersonStats(this.playerEconomyState().player);
        check(playerStats.dynamicStats&&playerStats.nativeCharacterStatsVersion===1,'Actual current player export statistics required');
        for(const id of Object.keys(this.playerExportModifiers))this.playerExportModifiers[id]=playerStats.dynamicStats['commodity_export_credits_mult'+id]??null;
        this.#playerStatsCaptured=true;
        const counts={conditionPasses:0,industryPasses:0,networkRebuilds:0,priceUpdates:0,populationAdvances:0,commodityCallbacks:0,finishCallbacks:0};
        const readMaxOutposts=()=>this.readNativeOutpostLimit();
        const refreshOutposts=(stats,markets)=>{
            // Vanilla 0.98a has no ALL_OUTPOSTS effect entries (skill scope is unrelated).
            check(!Object.values(characterSkills.skills).some(effects=>effects.some(e=>e.type==='ALL_OUTPOSTS')),'Unimplemented ALL_OUTPOSTS skill effect');
            for(const m of markets){
                if(this.getNativeMarketAdministrator(m.marketId).stats===stats)this.#refreshGovernedOutpostEffects(stats,m);
                this.#reapplyCurrentConditions(m.marketId);this.#applyGovernedAndIndustries(m.marketId,readMaxOutposts);
            }
        };
        const runtime={...this.#scheduledRuntime(readMaxOutposts,counts),
            refreshCharacterEffects:id=>{const person=this.getNativeMarketAdministrator(id);this.refreshNativeCharacterStats(person.objectRef,{refreshCharacterPlayerOutposts:refreshOutposts});},
            refreshGovernedOutpostEffects:id=>{const m=this.market(id);this.#refreshGovernedOutpostEffects(this.getNativeMarketAdministrator(id).stats,m);},
            updateStockpileAndPrice:(id,commodityId)=>{this.updateStockpileAndPrice(id,commodityId,{phase:'native-force-stockpile-update'});counts.priceUpdates++;},
        };
        for(let pass=0;pass<3;pass++){
            for(const m of this.#markets.values())m.previousStability=originalMarketStabilityValue(m.stability);
            new OriginalEconomyTaskRunner(runtime,{mode:'forced',params:{withIncomeAndUpkeep:false,withStockpileUpdate:true,withImmigration:true,forceNonUIStep:false}}).run();
        }
        return immutableJSON({passes:3,counts});
    });}
    scheduledEconomyStatus() {
        check(!this.#failed,'Failed shared draft must be discarded');
        return this.#economyPass?immutableJSON({scope:'shared-scheduled-economic-pass-only',status:this.#economyPass.status(),counts:this.#economyPassCounts,readyForAuthority:false}):null;
    }
    stepScheduledEconomyPass() {return this.#operation(()=>{check(this.#nativeSchedule===null,'Natural scheduler owns economy batches once enabled');check(this.#economyPass,'No scheduled economy pass');this.#economyPass.step();return this.scheduledEconomyStatus();});}
    runScheduledEconomyPass(options,readMaxOutposts) {return this.#operation(()=>{this.beginScheduledEconomyPass(options,readMaxOutposts);this.#economyPass.run();return this.scheduledEconomyStatus();});}
    economyListenerSnapshot() {check(!this.#failed,'Failed shared draft must be discarded');return this.#economyListeners?.snapshot()??null;}
    #growPopulation(marketId, request, readMaxOutposts) {
        const m=this.market(marketId), listeners=this.#growthListeners;
        check(listeners?.scope==='native-restored-colony-size-listeners'&&listeners.unresolved.length===0,'Actual supported colony-size listener roster required');
        check(request.plan.fromSize===m.size,'Growth request differs from current size');
        // Native incoming and incentive updates precede the size callback, and population already contains the new mixture.
        this.#installPopulation(m,request.population);
        m.incoming=structuredClone(request.incoming);m.incentives=structuredClone(request.immigration.incentives);
        const calls=[];
        for(const id of request.plan.removeConditionIds){calls.push('remove:'+id);this.#removeCondition(m,id);}
        calls.push('add:'+request.plan.addConditionId);this.#addGrowthCondition(m,request.plan.addConditionId);
        m.size=request.plan.toSize;calls.push('setSize:'+m.size);
        for(const listener of [...listeners.permanent,...listeners.transient]) {
            check(listener.type==='luddic-church','Unimplemented colony-size listener');
            calls.push('listener:'+listener.type);
            if(!m.playerOwned) continue;
            const matches=matchesOriginalLuddicMajority(m.industries.map(i=>({industryId:i.state.industryId,supplyBonusFromOther:i.modifiers.supplyBonusFromOther})),this.#churchContext(m));
            const has=m.conditions.some(c=>c.id==='luddic_majority');
            if(has&&!matches){calls.push('remove:luddic_majority');this.#removeCondition(m,'luddic_majority');}
            else if(!has&&matches){calls.push('add:luddic_majority');this.#addGrowthCondition(m,'luddic_majority');}
        }
        calls.push('reapplyConditions','reapplyIndustries');
        const effects=this.reapplyCurrentMarketEconomicEffects(marketId,readMaxOutposts);
        // The outer population kernel closes incentives at the current cap and preserves the pre-growth incoming.
        return {immigration:this.#incomingInput(marketId,{days:request.immigration.days,uiUpdateOnly:request.immigration.uiUpdateOnly}),
            playerOwned:m.playerOwned,inNewGameAdvance:this.inNewGameAdvance,
            effects:{scope:'shared-population-growth-economic-effects-only',calls,conditionExecution:effects.conditionExecution,
                governedExecution:effects.governedExecution,pending:effects.industries.pending,readyForAuthority:false}};
    }
    #installPopulation(m, source) {
        const population=structuredClone(source);
        if(m.population!==null && population!==null) {
            m.population.composition.splice(0,m.population.composition.length,...population.composition);
            m.population.weight.base=population.weight.base;
            for(const channel of ['flat','percent','mult']) {
                const current=m.population.weight.modifiers[channel];current.splice(0,current.length,...population.weight.modifiers[channel]);
            }
        } else m.population=population;
    }
    /** Read current getter inputs without changing incoming or billing incentives. */
    #incomingInput(marketId, options) {
        const m=this.market(marketId), {saved}=this.#loadInputs.get(marketId);
        check(this.#loaded.has(marketId) && m.immigrationModifiers, 'Run local economic effects before incoming');
        check(saved.industryInputCapture.immigration && m.incentives, 'Actual immigration getter capture required');
        const factionIds=this.#factionRelations?this.#factionRelations.factions.map(f=>f.factionId):this.#factionIds;check(Array.isArray(factionIds) && factionIds.includes('independent'), 'Actual registered faction roster required for incoming');
        check(options && Object.keys(options).length===2 && Object.hasOwn(options,'days') && Object.hasOwn(options,'uiUpdateOnly'),'Explicit incoming phase options required');
        const hostile=(from,to)=>from===to?false:this.#currentHostility(from,to,'Missing actual incoming hostility');
        const church=m.conditions.find(c=>c.id==='luddic_majority');
        return {
            market:{marketId,factionId:m.factionId,size:m.size,stability:originalMarketStabilityValue(m.stability),hostileToIndependent:hostile(m.factionId,'independent')},
            hazard:stat(m.hazard),accessibility:m.accessibility,industries:m.industries,constructionQueue:m.constructionQueue,
            conditions:m.conditions,modifiers:m.immigrationModifiers,
            freeMarketDaysByModId:Object.fromEntries(m.conditions.filter(c=>c.id==='free_market').map(c=>[c.modId,m.conditionContextByModId[c.modId].daysActive])),
            ...(church?{luddicMajorityState:{playerOwned:m.playerOwned,defeatedExpedition:this.#churchContext(m).defeatedExpedition}}:{}),
            adminAiCoreId:m.adminAiCoreId,drugsAvailable:rounded(stat(m.commodities.drugs.available)),factionIds,
            neighbors:{econGroup:m.econGroup,roster:[...this.#markets.values()].map(row=>({marketId:row.marketId,econGroup:row.econGroup})),
                markets:[...this.#markets.values()].filter(row=>row.econGroup===m.econGroup).map(row=>({marketId:row.marketId,factionId:row.factionId,size:row.size,location:row.location,hostileToTarget:hostile(row.factionId,m.factionId)}))},
            maxMarketSize:m.maxMarketSize,incentives:m.incentives,days:options.days,uiUpdateOnly:options.uiUpdateOnly,
        };
    }
    /** Native incoming phase only. Does not advance population, raise size, or settle the incentive ledger. */
    computeIncoming(marketId, options) {
        return this.#operation(() => {
            const m = this.market(marketId);
            const result = computeOriginalIncomingWithObjects(this.#incomingInput(marketId, options));
            m.incoming = structuredClone(result.incoming);
            m.incentives = structuredClone(result.incentives);
            return result;
        });
    }
    /** Advances population and synchronous growth economic effects on the shared draft, not the world clock. */
    advancePopulation(marketId, options, readMaxOutposts) {
        return this.#operation(() => {
            const m = this.market(marketId), saved = this.#loadInputs.get(marketId).saved;
            check(saved.populationCapture?.scope === 'native-saved-population-state', 'Actual saved population and incoming required; missing capture is not native null');
            check(typeof this.inNewGameAdvance === 'boolean', 'Actual new-game advance getter required');
            // Do not call computeIncoming first: that would erase wasIncomingSetBefore and bill twice.
            const result = advanceOriginalPopulationWithObjects({
                immigration: this.#incomingInput(marketId, options), population: m.population,
                previousIncoming: m.incoming, playerOwned: m.playerOwned, inNewGameAdvance: this.inNewGameAdvance,
            }, request=>this.#growPopulation(marketId,request,readMaxOutposts));
            this.#installPopulation(m,result.state.population);
            m.incoming = structuredClone(result.state.previousIncoming);
            m.incentives = structuredClone(result.state.immigration.incentives);
            return result;
        });
    }
    #nativeClock() {check(!this.#failed,'Failed shared draft must be discarded');check(this.#clock,'Native clock timezone capture required');return this.#clock;}
    nativeClockSnapshot() {return this.#nativeClock().snapshot();}
    calendarDate() {return this.#nativeClock().date();}
    /** Read BEFORE advancing the clock: native Economy.advance runs before CampaignClock.advance. */
    economyClockFrame(amountSeconds) {return this.#nativeClock().calendarFrame(amountSeconds);}
    #gameMonth(explicit) {
        if(this.#clock){const month=this.#clock.date().month;check(explicit===undefined||explicit===month,'Explicit month differs from current native clock');return month;}
        check(explicit!==undefined,'Native clock capture or explicit offline replay month required');integer(explicit,'native month',1);check(explicit<=12,'Native game month must be 1..12');return explicit;
    }
    #monthlyAccounts() {
        check(!this.#failed,'Failed shared draft must be discarded');
        check(this.#monthly?.scope==='native-saved-monthly-accounts'&&this.#monthly.state&&this.#monthly.unresolved.length===0,'Actual complete monthly report capture required');
        return this.#monthly.state;
    }
    monthlyAccountSnapshot() {return immutableJSON(this.#monthlyAccounts());}
    #storage(marketId){
        const retail=this.market(marketId).retail;
        check(retail?.scope==='native-saved-open-resource-cargo'&&retail.unresolved.length===0,'Actual submarket roster required for storage access');
        const rows=retail.otherSubmarkets.filter(s=>s.specId==='storage');check(rows.length<=1,'Duplicate storage submarket');
        if(rows.length===0)return null;
        const row=rows[0];check(row.storage&&row.storage.pluginRef===row.pluginRef,'Actual current storage capture required; recapture older retained-only storage');return row.storage;
    }
    hasStorageAccess(marketId){return this.#operation(()=>{const store=this.#storage(marketId);return store===null?false:originalStorageAccess(store);});}
    #storageConstructorServices(){return {
        createStorageCargo:store=>{const factory=this.fleetDataFactoryState();check(Number.isSafeInteger(factory.serial)&&factory.serial<Number.MAX_SAFE_INTEGER,'Current storage object allocator required');const cargo=createOriginalFleetCargo('storage:'+store.pluginRef+':'+(++factory.serial));cargo.carryingFleetRef=null;return cargo;},
        initializeStorageMothballedShips:(cargo,factionId)=>this.initializeNativeCargoMothballedShips(cargo,factionId),
    };}
    nativeStorageCargo(marketId){return this.#operation(()=>{const store=this.#storage(marketId);return store===null?null:ensureOriginalStorageCargo(store,this.#storageConstructorServices());});}
    readStorageValues(marketId,dependencies={}){return this.#operation(()=>{const store=this.#storage(marketId);return store===null?{cargo:0,ships:0}:originalStorageValues(store,{
        ...this.#storageConstructorServices(),readStorageFleetMembers:fleet=>this.bindFleetRoster(fleet.dataRef).membersCopy(),...dependencies,
    });});}
    #validateStorageGraphs(){
        for(const market of this.#markets.values())for(const row of market.retail?.otherSubmarkets??[])if(row.storage){
            const store=row.storage;validateOriginalStorageState(store);
            if(store.cargo&&Object.hasOwn(store.cargo,'mothballedShips')&&store.cargo.mothballedShips!==null){const fleet=store.cargo.mothballedShips;check(this.#fleetForDataRef(fleet.dataRef)===fleet,'Lost shared storage/registered FleetData identity');}
        }
    }
    #bindPlayerEconomy(restored){
        const capture=this.#playerEconomy;if(capture===null)return;
        check(capture.scope==='native-saved-player-economy'&&Array.isArray(capture.unresolved),'Invalid player economy capture');
        if(capture.state===null)return;check(capture.unresolved.length===0,'Incomplete player economy capture has state');
        const state=capture.state;(restored?validateOriginalPlayerEconomyReferences:validateOriginalPlayerEconomy)(state);
        const registry=state.marketPersonnel;
        if(registry?.unresolved.length===0){
            check(registry.markets.length===this.#markets.size,'Personnel and economy market rosters differ');
            for(const record of registry.markets){
                const market=this.market(record.marketId);check(market.objectRef===record.marketRef,'Personnel market identity differs');
                if(restored)check(market.personnel===record,'Lost shared market personnel identity');else market.personnel=record;
                const admin=record.adminRef===null?null:originalPersonnelByRef(state,record.adminRef);
                if(restored)check(market.adminIsPlayer===(admin===state.player)&&market.adminAiCoreId===(admin?.aiCoreId??null),'Stale administrator identity projection');
                else{market.adminIsPlayer=admin===state.player;market.adminAiCoreId=admin?.aiCoreId??null;}
            }
        }
        if(state.fleet&&this.#monthly?.state){const credits=this.#monthly.state.credits;check(state.fleet.credits.objectRef===credits.objectRef&&state.fleet.credits.value===credits.value,'Player cargo and monthly credit object differ');if(restored)check(state.fleet.credits===credits,'Lost shared monthly/player credits');else state.fleet.credits=credits;}
        for(const admin of state.administrators)if(admin.market&&this.#markets.has(admin.market.marketId)){
            const market=this.market(admin.market.marketId);check(market.objectRef===admin.market.objectRef,'Assigned administrator market identity differs');
            if(restored)check(admin.market===market,'Lost live administrator market reference');else{check(market.name===admin.market.name,'Captured administrator market name differs');admin.market=market;}
        }
    }
    /** Trusted live handles, shared with salary/report state; not a complete player/fleet world. */
    playerEconomyState(){check(!this.#failed,'Failed shared draft must be discarded');const capture=this.#playerEconomy;check(capture?.state&&capture.unresolved.length===0,'Actual complete player economy capture required');return capture.state;}
    bindNativeCharacterMemory(characterRef,memory){return this.#operation(()=>{const state=this.playerEconomyState();check(characterRef===state.characterRef,'Actual PlayerCharacterData owner required');check(!Object.hasOwn(state,'characterMemory')||state.characterMemory===memory,'Cannot replace live character memory');if(memory!==null)validateOriginalCampaignMemory(memory);state.characterMemory=memory;return memory;});}
    nativeCharacterMemoryWithoutUpdate(){return this.#operation(()=>originalPlayerCharacterMemoryWithoutUpdate(this.playerEconomyState()));}
    advanceNativeCharacterMemory(seconds,context,services={}){return this.#operation(()=>{const memory=originalPlayerCharacterMemoryWithoutUpdate(this.playerEconomyState());advanceOriginalCampaignMemory(memory,context.paused?0:this.#nativeClock().convertToDays(seconds),context,services);});}
    #currentNativePersonStats(person){
        const stats=person.stats;
        if(stats.lifecycle==='native-read-resolve-pending')this.refreshNativeCharacterStats(person.objectRef);
        check(stats.nativeCharacterStatsVersion===1&&['resolving','current'].includes(stats.lifecycle),'Actual current character stats required');return stats;
    }
    readNativeOutpostLimit(){return this.#operation(()=>originalNativeCharacterOutpostLimit(this.#currentNativePersonStats(this.playerEconomyState().player)));}
    readNativeMarketAdministratorModifier(marketId,key){
        return this.#operation(()=>{
            check(['supply_bonus','demand_reduction','fuel_supply_bonus'].includes(key),'Unsupported industry administrator modifier');
            const person=this.getNativeMarketAdministrator(marketId);
            return originalNativeCharacterDynamicValue(this.#currentNativePersonStats(person),key,0);
        });
    }
    /** Actual Market getters/setters, not the assignment-screen workflow or a publication API. */
    getNativeMarketAdministrator(marketId){
        return this.#operation(()=>{const state=this.playerEconomyState();check(state.marketPersonnel?.unresolved.length===0,'Complete native market personnel capture required');return getOriginalMarketAdministrator(state,this.market(marketId),this.#personnelServices());});
    }
    setNativeMarketAdministrator(marketId,personRef){
        return this.#operation(()=>{const state=this.playerEconomyState();check(state.marketPersonnel?.unresolved.length===0,'Complete native market personnel capture required');return setOriginalMarketAdministrator(state,this.market(marketId),personRef===null?null:originalPersonnelByRef(state,personRef),this.#personnelServices());});
    }
    playerEconomySnapshot(){check(!this.#failed,'Failed shared draft must be discarded');return immutableJSON(this.#playerEconomy);}
    /** Applies the registered event's actual state to this draft's current markets, arrays and player fleet. */
    refreshNativeTopography(listenerRef){
        return this.#operation(()=>{
            const state=this.playerEconomyState(),capture=state.characterRefresh,listener=capture?.listeners.find(l=>l.objectRef===listenerRef),world=capture?.topographyWorld;
            check(listener?.kind==='hyperspace-topography'&&listener.event?.objectRef===listenerRef,'Actual registered topography event required');
            check(world?.scope==='native-topography-world-inputs'&&world.unresolved.length===0,'Complete native topography world capture required');
            return refreshOriginalHyperspaceTopography(listener.event,{markets:[...this.#markets.values()],systems:world.systems,location:world.location,playerFleet:state.fleet});
        });
    }
    /** Complete character callbacks require real world services where the captured world has such objects. */
    refreshNativeCharacterStats(personRef,{refreshOutposts=true,resolvePending=true,nativeFleetServices={},...dependencies}={}) {
        return this.#operation(()=>{
            const state=this.playerEconomyState(),people=originalPersonnelPeople(state);
            const person=people.find(p=>p.objectRef===personRef);check(person,'Actual shared character required');const s=person.stats,capture=state.characterRefresh;
            check(capture?.scope==='native-character-refresh-world'&&capture.unresolved.length===0,'Complete character listener/memory capture required');
            check(typeof resolvePending==='boolean','Explicit character readResolve choice required');
            const external=(name,...args)=>{check(typeof dependencies[name]==='function','Actual character world service required: '+name);const result=dependencies[name](...args);check(!result||typeof result.then!=='function','Character world service must be synchronous');return result;};
            const registered=this.#fleetServices?.rosters?.bindings.map(b=>b.fleet)??[];
            const known=registered.find(current=>current.attachedToCampaignFleet&&current.objectRef===s.fleetRef);
            const fleet=s.fleetRef===null?null:state.fleet?.objectRef===s.fleetRef?state.fleet:known??external('resolveCharacterFleet',s.fleetRef);
            const world={isPlayer:s===state.player.stats,fleet};
            const services={
                effects:dependencies.characterEffects,
                reportBeforeCharacterStatsRefresh:()=>{for(const listener of capture.listeners)check(['not-character-refresh','hyperspace-topography'].includes(listener.kind),'Unclassified character listener');}, // HT.before is empty in the source.
                reportAfterCharacterStatsRefresh:()=>{for(const listener of capture.listeners)if(listener.kind==='hyperspace-topography'){if(dependencies.refreshHyperspaceTopography)external('refreshHyperspaceTopography',listener,this);else this.refreshNativeTopography(listener.objectRef);}},
                changeAllowedRecoveryTag:(tag,add)=>{
                    const memory=capture.recoveryTags;check(memory.memoryRef!==null&&Array.isArray(memory.values)&&Array.isArray(memory.expires),'Actual shared recovery-tag memory required');
                    check(memory.expires.length===0,'Timed recovery memory requires its native expiry lifecycle');
                    if(!memory.present){memory.present=true;memory.objectRef='created-recovery-tags:'+memory.memoryRef;}
                    const at=memory.values.indexOf(tag);if(add&&at<0)memory.values.push(tag);else if(!add&&at>=0)memory.values.splice(at,1);
                },
                refreshPlayerOutposts:()=>{
                    const markets=[...this.#markets.values()].filter(m=>m.playerOwned);
                    if(markets.length)external('refreshCharacterPlayerOutposts',s,markets,this);
                    // A captured economy with no player colonies genuinely has no callbacks here.
                },
                readFleetMembers:current=>{
                    if(current!==state.fleet&&!registered.includes(current))return external('readCharacterFleetMembers',current);
                    const sync=current.synchronization;if(sync.needsSync&&!sync.forceNoSync)synchronizeOriginalFleet(current,this.#nativeFleetServices(nativeFleetServices));
                    check(Array.isArray(current.membersWithoutNull),'Actual synchronized member list required');return [...current.membersWithoutNull];
                },
                readMemberDeploymentPoints:member=>originalMemberDeploymentPoints(member),
            };
            return resolvePending&&s.lifecycle==='native-read-resolve-pending'?readResolveOriginalCharacterStats(s,world,services):refreshOriginalCharacterStats(s,world,services,refreshOutposts);
        });
    }
    readFleetDeploymentPoints(dependencies={}){return this.#operation(()=>originalPlayerDeploymentPoints(this.playerEconomyState(),this.#fleetDependencies(dependencies)));}
    readOfficerPayroll(){return this.#operation(()=>originalOfficerPayroll(this.playerEconomyState()));}
    readAdministrators(dependencies={}){return this.#operation(()=>originalAdministratorPayroll(this.playerEconomyState(),dependencies));}
    readFleetPayroll(dependencies={}){return this.#operation(()=>originalPlayerFleetPayroll(this.playerEconomyState(),this.#fleetDependencies(dependencies)));}
    readFleetCargoStat(kind,dependencies={}){return this.#operation(()=>originalPlayerCargoStat(this.playerEconomyState(),kind,this.#fleetDependencies(dependencies)));}
    nativeCustomProductionState(){
        check(!this.#failed,'Failed shared draft must be discarded');const state=this.#monthly?.productionRuntime;
        check(state,'Actual custom manufacturing/delivery service requires captured CoreScript production history');validateOriginalCustomProductionState(state);check(state.coreRef===this.#monthly.coreRef,'Lost CoreScript production owner identity');return state;
    }
    /** Bind an explicitly created or captured CoreScript RNG, never overwrite a live sequence. */
    bindNativeCustomProductionState(state){return this.#operation(()=>{this.#monthlyAccounts();validateOriginalCustomProductionState(state);check(state.coreRef===this.#monthly.coreRef,'Actual CoreScript production owner required');check(!Object.hasOwn(this.#monthly,'productionRuntime')||this.#monthly.productionRuntime===state,'Cannot replace current manufacturing history');this.#monthly.productionRuntime=state;return state;});}
    #nativeProductionIndustryMarket(industry){
        const m=[...this.#markets.values()].find(m=>m.industries.includes(industry));check(m,'Actual registered industry instance required');
        const id=industry.state.industryId,saved=this.#loadInputs.get(m.marketId).saved;
        const current=[m.industryLifecycle,m.productionLifecycle,m.civicLifecycle,m.resourceLifecycle].flatMap(s=>s?.industries??[]).find(row=>row.active&&row.entry===industry);
        const source=current??saved.industries.find(row=>row.industryId===id),captured=saved.industries.find(row=>row.objectRef===source?.objectRef),spec=ORIGINAL_MARKET_FINANCE.industries[id];
        check(source&&spec&&(!captured||captured.classAlias===spec.className),'Actual industry production service required for non-stock plugin');return m;
    }
    generateNativeIndustryProductionCargo(industry,random,services={}){return this.#operation(()=>{
        const m=this.#nativeProductionIndustryMarket(industry);
        if(industry.state.industryId!=='techmining'||!functional(industry.operating))return generateOriginalIndustryProductionCargo(industry,random);
        // Lazy getters: ordinary industry callbacks never require tech memory or blueprint history.
        const draft=this;
        return generateOriginalIndustryProductionCargo(industry,random,{
            get marketMemory(){return validateOriginalMarketFrame(m.nativeFrame,m).memory;},conditions:m.conditions,techMiningMult:m.special.techMiningMult,
            get playerFaction(){return draft.#nativeFaction('player');},get shipSelection(){return draft.shipSelectionState();},get playerEconomy(){return draft.playerEconomyState();},
        },services);
    });}
    readNativeIndustryProductionCargoTitle(industry){check(!this.#failed,'Failed shared draft must be discarded');this.#nativeProductionIndustryMarket(industry);return ORIGINAL_MARKET_FINANCE.industries[industry.state.industryId].name;}
    nativeProductionHullVariants(hullId){return this.#operation(()=>originalProductionHullVariants(this.#fleetServices?.productionVariants,hullId));}
    runNativeCustomProduction(services={}){return this.#operation(()=>{
        check(this.#factionRelations?.factions.some(f=>f.factionId==='player'&&f.nativeFrame?.production),'Actual monthly dependency required: doCustomProduction (native production history unavailable)');
        const gatheringPoint=this.nativeFactionGatheringPoint('player');if(gatheringPoint===null)return {skipped:'no-gathering-point'};
        const storageCargo=this.nativeStorageCargo(gatheringPoint.marketId);if(storageCargo===null)return {skipped:'no-storage'};
        const state=this.nativeCustomProductionState(),fleetServices=services.fleetServices??{};
        const roster=fleet=>{check(fleet&&typeof fleet.dataRef==='string','Actual production FleetData lifecycle required');return this.bindFleetRoster(fleet.dataRef,services.memberServices??{},fleetServices);};
        const initialize=cargo=>{this.initializeNativeCargoMothballedShips(cargo,'player');};
        return executeOriginalCustomProduction(state,{gatheringPoint,storageCargo,production:this.nativeFactionProductionState('player'),accounts:this.#monthlyAccounts(),markets:[...this.#markets.values()],devMode:services.devMode,weaponsHaveCost:services.weaponsHaveCost,
            settings:{doctrineFleetQualityPerPoint:f(ORIGINAL_MARKET_FINANCE.settings.doctrineFleetQualityPerPoint),productionSuppliesBonusFraction:f(ORIGINAL_MARKET_FINANCE.settings.productionSuppliesBonusFraction),commodityPrices:{supplies:f(RETAIL_REFERENCE.commodities.supplies.basePrice),fuel:f(RETAIL_REFERENCE.commodities.fuel.basePrice),crew:f(RETAIL_REFERENCE.commodities.crew.basePrice)}},
        },{
            readMonthlyProductionCapacity:()=>this.readNativeProductionCapacity('player'),
            createProductionCargo:()=>{const factory=this.fleetDataFactoryState();check(Number.isSafeInteger(factory.serial)&&factory.serial<Number.MAX_SAFE_INTEGER,'Current production object allocator required');const cargo=createOriginalFleetCargo('production:'+this.playerEconomyState().nativeUID.sectorRef+':'+(++factory.serial));cargo.carryingFleetRef=null;return cargo;},
            initializeProductionMothballedShips:initialize,
            createProductionFleet:()=>{const fleet=this.createNativeNamedEmptyFleet('player','temp',true,{isInSectorGen:false},services.fleetFactoryServices).fleet;this.setNativeFleetCommander(fleet.dataRef,this.playerEconomyState().player.objectRef,services.fleetFactoryServices?.personServices);return fleet;},
            readProductionMarketQuality:m=>f(stat({base:0,modifiers:m.economyBonuses.production_quality_mod})+stat({base:0,modifiers:m.economyBonuses.fleet_quality_mod})),
            readPlayerDoctrineQualityContribution:()=>originalFactionShipQualityContribution(this.factionDoctrine('player')),
            readProductionIndustries:m=>m.industries,
            generateIndustryProductionCargo:(industry,random)=>this.generateNativeIndustryProductionCargo(industry,random,services.industryServices),
            readIndustryProductionCargoTitle:industry=>this.readNativeIndustryProductionCargoTitle(industry),
            readProductionMemberFittingValues:originalProductionMemberFittingValues,isProductionCargoEmpty:originalNativeCargoIsEmpty,
            prepareProductionMemberForDelivery:member=>{setOriginalNativeMemberMothballed(member,member.fleetDataRef===null?null:this.#fleetForDataRef(member.fleetDataRef),false,services.memberServices??{});member.repairTracker.cr=f(0.5);},
            readProductionHullVariants:id=>this.nativeProductionHullVariants(id),
            readProductionFleetMembers:fleet=>roster(fleet).membersCopy(),
            readProductionCargoMembers:cargo=>cargo.mothballedShips===null?[]:roster(cargo.mothballedShips).membersCopy(),
            addProductionMothballedMember:(cargo,member)=>{initialize(cargo);roster(cargo.mothballedShips).addMember(member);},
            addProductionFleetMember:(fleet,id)=>roster(fleet).addMember(this.createFleetMember(id)),
            addProductionReportIntel:report=>{this.addNativeProductionReportIntel(report,services.intelServices??{});},
            attachProductionInflater:(fleet,params)=>{this.attachNativePickedFleetInflater(fleet.dataRef,params,services.fleetFactoryServices?.aiServices?.pluginServices);},
            inflateProductionFleet:fleet=>{this.inflateNativeFleet(fleet.dataRef,{memberServices:services.memberServices,fleetServices,...services.inflaterServices});},
            ...services,
            cargo:{resolveEncounterFleetData:ref=>this.#fleetForDataRef(ref),sortNativeCargoShips:fleet=>roster(fleet).sortFleet(),...services.cargo},
        });
    });}
    #monthlyRuntime(dependencies) {
        const external=(name,...args)=>{check(typeof dependencies?.[name]==='function','Actual monthly dependency required: '+name);const value=dependencies[name](...args);check(!value||typeof value.then!=='function','Monthly dependency must be synchronous: '+name);return value;};
        return {
            isTutorialInProgress:()=>this.#playerEconomy?.state?originalTutorialInProgress(this.playerEconomyState()):external('isTutorialInProgress'),readFleetPayroll:()=>this.#playerEconomy?.state?this.readFleetPayroll(dependencies):external('readFleetPayroll'),
            hasStorageAccess:id=>this.hasStorageAccess(id),readStorageValues:id=>this.readStorageValues(id,dependencies),readAdministrators:()=>this.#playerEconomy?.state?this.readAdministrators(dependencies):external('readAdministrators'),
            marketIds:()=>this.marketIds(),market:id=>{
                const m=this.market(id),saved=this.#loadInputs.get(id).saved,ref=saved.unresolvedObjects.find(row=>row.field==='primaryEntity')?.objectRef;
                return {objectRef:m.objectRef,name:m.name??saved.name,size:m.size,playerOwned:m.playerOwned,primaryEntity:ref?{kind:'reference',objectRef:ref,classAlias:'SectorEntityToken'}:null};
            },
            readIndustryFinances:id=>{
                const m=this.market(id),saved=this.#loadInputs.get(id).saved;
                const intValue=s=>Math.max(-2147483648,Math.min(2147483647,Math.floor(stat(s)+0.5)));
                return m.industries.map(i=>{
                    const finance=m.finances.find(row=>row.industryId===i.state.industryId),live=[m.industryLifecycle,m.productionLifecycle,m.civicLifecycle,m.resourceLifecycle].flatMap(s=>s?.industries??[]).find(row=>row.active&&row.entry===i);
                    const source=live??saved.industries.find(row=>row.industryId===i.state.industryId);
                    check(finance&&source,'Actual monthly industry financial handle required');
                    let name;
                    if(dependencies?.readIndustryName)name=external('readIndustryName',id,i.state.industryId);
                    else{
                        const spec=ORIGINAL_MARKET_FINANCE.industries[i.state.industryId],captured=saved.industries.find(row=>row.objectRef===source.objectRef);
                        check(spec&&(!captured||captured.classAlias===spec.className),'Actual industry name service required for non-stock plugin');name=spec.name;
                    }
                    check(typeof name==='string','Actual current industry name required');
                    return {id:i.state.industryId,objectRef:source.objectRef,name,income:intValue(finance.income),upkeep:intValue(finance.upkeep)};
                });
            },
            commodities:id=>{const m=this.market(id),saved=this.#loadInputs.get(id).saved;return Object.keys(m.commodities).map(c=>({id:c,name:RETAIL_REFERENCE.commodities[c].name,objectRef:saved.commodities.find(row=>row.commodityId===c)?.objectRef??'created-commodity:'+m.objectRef+':'+c}));},
            getExportIncome:(id,c)=>this.getExportIncome(id,c),getIncentiveCredits:id=>{const value=this.market(id).incentives;check(value,'Actual accumulated incentives required');return value.credits;},
            setIncentiveCredits:(id,value)=>{this.market(id).incentives.credits=value;},timestamp:()=>this.#nativeClock().snapshot().timestamp,
            doCustomProduction:state=>{
                if(dependencies?.doCustomProduction)return external('doCustomProduction',state);
                this.runNativeCustomProduction(dependencies?.customProduction);
            },
        };
    }
    /** Actual local-resource manager receiver; call in the managed roster's order, NOT once per update-list entry. */
    reportLocalResourcesEconomyTick(listenerRef,iteration) {return this.#operation(()=>{this.#assertNotificationOwner();return this.#listeners().reportEconomyTick(listenerRef,iteration);});}
    reportLocalResourcesEconomyMonthEnd(listenerRef) {return this.#operation(()=>{this.#assertNotificationOwner();return this.#listeners().reportEconomyMonthEnd(listenerRef);});}
    /** The actual CoreScript receiver only. Other sector/managed listeners must still run in their original order. */
    reportCoreEconomyTick(dependencies) {return this.#operation(()=>{this.#assertNotificationOwner();return originalCoreEconomyTick(this.#monthlyAccounts(),this.#monthlyRuntime(dependencies));});}
    reportCoreEconomyMonthEnd(dependencies) {return this.#operation(()=>{this.#assertNotificationOwner();return originalCoreEconomyMonthEnd(this.#monthlyAccounts(),this.#monthlyRuntime(dependencies));});}
    #assertNotificationOwner() {check(this.#notificationMode!=='native-receivers'||this.#nativeFrameActive,'Natural notification chain owns economic callbacks once enabled');}
    #receivers() {
        if(!this.#notificationReceivers){
            const c=this.#notificationCapture;check(c,'Actual notification roster/history capture required');
            this.#listeners();this.#monthlyAccounts();
            check(canonicalJSON(c.managedRoster)===canonicalJSON(this.#listenerCapture?.managedRoster),'Notification capture and actual manager registry differ');
            for(const o of Object.values(c.objects)){
                if(o.kind==='core')check(o.objectRef===this.#monthly?.coreRef,'CoreScript must own the captured shared ledger');
                if(o.kind==='local-resources')check(this.#listeners().listener(o.objectRef).kind==='local-resources','Local receiver must share its current cargo object');
            }
            this.#notificationReceivers=new OriginalEconomyNotifications(c);
        }
        return this.#notificationReceivers;
    }
    economyNotificationSnapshot() {check(!this.#failed,'Failed shared draft must be discarded');return this.#notificationReceivers?.snapshot()??null;}
    #settlementRuntime(dependencies) {
        check(dependencies&&typeof dependencies==='object','Actual fleet/storage/production notification dependencies required');
        const external=(name,...args)=>{check(typeof dependencies[name]==='function','Actual settlement dependency required: '+name);const value=dependencies[name](...args);check(!value||typeof value.then!=='function','Settlement dependency must be synchronous: '+name);return value;};
        return {
            managedRoster:()=>this.#listeners().managedRoster(),removeManagedListener:ref=>this.#listeners().removeManagedListener(ref),
            coreEconomyTick:()=>this.reportCoreEconomyTick(dependencies),coreEconomyMonthEnd:()=>this.reportCoreEconomyMonthEnd(dependencies),
            localResourcesEconomyTick:(ref,i)=>this.reportLocalResourcesEconomyTick(ref,i),localResourcesEconomyMonthEnd:ref=>this.reportLocalResourcesEconomyMonthEnd(ref),
            isInNewGameAdvance:()=>this.inNewGameAdvance,hasPlayerFleet:()=>this.#playerEconomy?.state?this.playerEconomyState().fleet!==null:external('hasPlayerFleet'),readPlayerLevel:()=>this.#playerEconomy?.state?originalPlayerLevel(this.playerEconomyState()):external('readPlayerLevel'),
            readFleetDeploymentPoints:()=>this.#playerEconomy?.state?.fleet?.nativeSyncScope==='native-fleet-data-sync-inputs'?this.readFleetDeploymentPoints(dependencies):external('readFleetDeploymentPoints'),readFleetCargoStat:kind=>this.#playerEconomy?.state?this.readFleetCargoStat(kind,dependencies):external('readFleetCargoStat',kind),
            readCredits:()=>this.#monthlyAccounts().credits.value,monthlyAccounts:()=>this.#monthlyAccounts(),
            readMarkets:()=>this.marketIds().map(id=>{const m=this.market(id);return {playerOwned:m.playerOwned,size:m.size};}),marketExists:id=>this.#markets.has(id),
            timestamp:()=>this.#nativeClock().snapshot().timestamp,elapsedDaysSince:t=>this.#nativeClock().elapsedDaysSince(t),
        };
    }
    /** Inspect the native saved schedule without inventing a fresh month or dropping saved tasks. */
    nativeEconomySchedule() {
        check(!this.#failed,'Failed shared draft must be discarded');
        if(this.#nativeSchedule!==null)return this.#nativeSchedule;
        const saved=this.#nativeScheduleCapture;
        check(saved&&saved.state==='WAITING'&&saved.queuedTaskCount===0,'Native in-flight task queue requires a complete task importer; cannot reset it');
        return restoreOriginalEconomySchedule({schemaVersion:1,phase:saved.state,elapsed:saved.elapsed,untilNext:saved.untilNext,
            iterLeft:saved.iterationsLeft,prevMonth:saved.previousMonth,taskIndex:null});
    }
    nativeLocationFrameState(locationRef){check(!this.#failed,'Failed shared draft must be discarded');return this.#locationFrames?.find(s=>s.location.objectRef===locationRef)??null;}
    bindNativeLocationBackground(locationRef,background){return this.#operation(()=>{const state=this.nativeLocationFrameState(locationRef);check(state&&!state.location.hyperspaceMode,'Actual normal-space location frame required');check(state.background===null||state.background===background,'Cannot replace live background history');state.background=validateOriginalCampaignBackgroundSource(background);return background;});}
    setNativeLocationBackgroundTexture(locationRef,texturePath){return this.#operation(()=>{const state=this.nativeLocationFrameState(locationRef);check(state&&!state.location.hyperspaceMode,'Actual normal-space location required');replaceOriginalCampaignBackgroundTexture(state.background,texturePath);});}
    #validateNativeLocationFrames(){
        const fleets=(this.#fleetServices?.dataFactory?.fleets??[]).filter(f=>f.campaign),identities=new Map();
        const bind=object=>{check(object&&typeof object==='object','Actual location entity reference required');if(object.campaign?.scope==='native-constructed-campaign-fleet')check(fleets.includes(object),'Lost shared location/orbit fleet identity');if(typeof object.objectRef==='string'){const old=identities.get(object.objectRef);check(!old||old===object,'Lost shared location/orbit entity identity');identities.set(object.objectRef,object);}};
        for(const fleet of fleets)bind(fleet);
        if(this.#locationFrames!==null){
            check(Array.isArray(this.#locationFrames),'Actual location frame list required');const world=this.#requiredFleetWorld(),seen=new Set();
            check(!this.#engineFrame||this.#engineFrame.world===world,'Lost shared engine/location world identity');
            for(const state of this.#locationFrames){validateOriginalLocationFrame(state,world);check(!seen.has(state.location),'Duplicate location advance state');seen.add(state.location);if(state.center!==null)bind(state.center);}
        }
        for(const fleet of fleets){const entity=fleet.campaign.entity,orbit=entity.orbit;if(orbit?.scope==='native-current-location-orbit'){validateOriginalLocationOrbit(orbit);check(orbit.entity===fleet,'Lost orbit/entity identity');bind(orbit.focus);}if(entity.lightSource!==null)bind(entity.lightSource);}
        this.#validateNativeBattles();
    }
    /** Explicit actual state, not reconstruction from a location name or an old checkpoint. */
    bindNativeLocationFrame(state){return this.#operation(()=>{
        validateOriginalLocationFrame(state,this.#requiredFleetWorld());const existing=this.nativeLocationFrameState(state.location.objectRef);check(existing===null||existing===state,'Cannot replace a live location frame state');
        if(this.#locationFrames===null)this.#locationFrames=[];if(existing===null)this.#locationFrames.push(state);this.#validateNativeLocationFrames();return state;
    });}
    #currentHostility(from,to,message){if(this.#factionRelations!==null)return originalRepAtBest(originalReputationLevel(originalFactionRelation(this.#factionRelations,from,to).value),'HOSTILE');check(typeof this.#hostility[from]?.[to]==='boolean',message);return this.#hostility[from][to];}
    nativeFactionRelationsState(){check(!this.#failed,'Failed draft');return this.#factionRelations;}
    #requiredFactionRelations(){check(this.#factionRelations,'Actual native FactionManager relationships required; missing diplomacy is not neutral');return this.#factionRelations;}
    #validateFactionRelations(){
        if(this.#factionRelations===null)return;const manager=validateOriginalFactionRelations(this.#factionRelations),byRef=new Map(manager.factions.map(f=>[f.objectRef,f]));
        for(const faction of manager.factions)if(Object.hasOwn(faction,'nativeFrame')){const frame=validateOriginalFactionFrame(faction.nativeFrame,faction),market=frame.production?.gatheringPoint??null;check(market===null||[...this.#markets.values()].includes(market),'Lost production gathering-point market identity');}
        for(const faction of manager.factions)if(Object.hasOwn(faction,'equipment'))validateOriginalFactionEquipment(faction.equipment,faction);
        for(const fleet of this.#fleetServices?.dataFactory?.fleets??[]){const faction=fleet.campaign?.faction;if(faction&&byRef.has(faction.objectRef))check(byRef.get(faction.objectRef)===faction,'Lost shared registered Faction identity');}
    }
    bindNativeFactionRelations(state){return this.#operation(()=>{check(this.#factionRelations===null||this.#factionRelations===state,'Cannot replace a live FactionManager');this.#factionRelations=validateOriginalFactionRelations(state);this.#validateFactionRelations();return state;});}
    #nativeFaction(factionId){check(!this.#failed,'Failed shared draft must be discarded');const faction=this.#requiredFactionRelations().factions.find(row=>row.factionId===factionId);check(faction,'Actual registered Faction required');return faction;}
    nativeHullmodItemManager(){return this.#operation(()=>{const engine=this.#engineFrame;check(engine,'Actual CampaignEngine memory required for HullModItemManager');return originalHullmodItemManagerInstance(originalEntityMemoryWithoutUpdate(engine),{
        readRefitScreenListeners:()=>{check(engine.world===this.#requiredFleetWorld(),'Lost engine/listener world identity');return engine.world.refitScreenListeners;},
        createHullmodItemManagerRef:()=>{const world=engine.world;check(Number.isSafeInteger(world.hullmodItemSerial)&&world.hullmodItemSerial<Number.MAX_SAFE_INTEGER,'Actual manager identity allocator required');return 'hullmod-items:'+world.sectorRef+':'+(++world.hullmodItemSerial);},
    });});}
    #nativeHullmodItemServices(services={}){return {
        readHullmodGameState:()=> 'CAMPAIGN',readHullmodPlayerCargo:()=>this.playerEconomyState().fleet?.cargo??null,
        readHullmodStorageCargo:market=>{check(this.#markets.get(market.marketId)===market,'Actual docked market identity required');return this.nativeStorageCargo(market.marketId);},
        createHullmodItemsCargo:()=>{const world=this.#requiredFleetWorld();check(Number.isSafeInteger(world.hullmodItemSerial)&&world.hullmodItemSerial<Number.MAX_SAFE_INTEGER,'Actual hullmod-cargo identity allocator required');const cargo=createOriginalFleetCargo('hullmod-items-cargo:'+world.sectorRef+':'+(++world.hullmodItemSerial));cargo.carryingFleetRef=null;return cargo;},...services,
    };}
    isNativeHullmodItemAvailable(id,member,variant,market,services={}){return this.#operation(()=>bindOriginalHullmodItemManager(this.nativeHullmodItemManager(),this.#nativeHullmodItemServices(services)).isRequiredItemAvailable(id,member,variant,market));}
    reportNativeRefitVariantSaved(member,market,services={}){return this.#operation(()=>reportOriginalRefitVariantSaved(this.#requiredFleetWorld(),member,market,{reportRefitVariantSavedToListener:(listener,m,docked)=>{
        if(listener.kind==='hullmod-item-manager')bindOriginalHullmodItemManager(listener,this.#nativeHullmodItemServices(services)).reportFleetMemberVariantSaved(m,docked);
        else{check(typeof services.reportRefitVariantSavedToListener==='function','Actual custom refit listener implementation required');const result=services.reportRefitVariantSavedToListener(listener,m,docked);check(!result||typeof result.then!=='function','Refit listener must be synchronous');}
    }}));}
    bindNativeSpecialItem(plugin,services={}){return this.#operation(()=>{
        const facade=bindOriginalSpecialItem(plugin,{
            isCharacterHullmodKnown:id=>this.readNativePlayerAvailableHullmods().includes(id),
            readSpecialItemPlayerMemory:()=>this.nativeCharacterMemoryWithoutUpdate(),readSpecialItemPlayerFleet:()=>this.playerEconomyState().fleet,...services,
        });
        return Object.fromEntries(Object.entries(facade).map(([key,fn])=>[key,(...args)=>this.#operation(()=>fn(...args))]));
    });}
    readNativePlayerAvailableHullmods(services={}){return this.#operation(()=>originalPlayerAvailableHullmods(this.playerEconomyState(),services));}
    addNativePlayerHullmod(id){return this.#operation(()=>addOriginalPlayerHullmod(this.playerEconomyState(),id));}
    removeNativePlayerHullmod(id){return this.#operation(()=>removeOriginalPlayerHullmod(this.playerEconomyState(),id));}
    nativeFactionEquipmentState(factionId){return this.#nativeFaction(factionId).equipment??null;}
    bindNativeFactionEquipment(factionId,state){return this.#operation(()=>{const faction=this.#nativeFaction(factionId);check(!Object.hasOwn(faction,'equipment')||faction.equipment===state,'Cannot replace live faction equipment history');validateOriginalFactionEquipment(state,faction);faction.equipment=state;return state;});}
    readNativeFactionKnownEquipment(factionId,kind,services={}){return this.#operation(()=>originalFactionKnownEquipment(this.#nativeFaction(factionId),kind,{readPlayerKnownHullmods:()=>originalPlayerFactionHullmods(this.playerEconomyState()),...services}));}
    isNativeFactionEquipmentKnownAt(factionId,kind,id,timestamp){return this.#operation(()=>originalFactionEquipmentKnownAt(this.#nativeFaction(factionId),kind,id,timestamp));}
    isNativeFactionEquipmentPriority(factionId,kind,id){return this.#operation(()=>originalFactionEquipmentPriority(this.#nativeFaction(factionId),kind,id));}
    setNativeFactionEquipmentPriority(factionId,kind,id,enabled){return this.#operation(()=>setOriginalFactionEquipmentPriority(this.#nativeFaction(factionId),kind,id,enabled));}
    addNativeFactionKnownEquipment(factionId,kind,id,recordTimestamp,services={}){return this.#operation(()=>addOriginalFactionKnownEquipment(this.#nativeFaction(factionId),kind,id,recordTimestamp,{
        readFactionEquipmentTimestamp:()=>String(this.#nativeClock().snapshot().timestamp),
        readFactionEquipmentSpec:(type,key)=>type==='weapon'?originalAutofitSpecs.readWeaponSpec(key):originalAutofitSpecs.readFighterSpec(key),...services,
    }));}
    removeNativeFactionKnownEquipment(factionId,kind,id){return this.#operation(()=>removeOriginalFactionKnownEquipment(this.#nativeFaction(factionId),kind,id));}
    nativeFactionFrameState(factionId){return this.#nativeFaction(factionId).nativeFrame??null;}
    bindNativeFactionFrame(factionId,frame){return this.#operation(()=>{const faction=this.#nativeFaction(factionId);check(!Object.hasOwn(faction,'nativeFrame')||faction.nativeFrame===frame,'Cannot replace a live Faction frame');validateOriginalFactionFrame(frame,faction);faction.nativeFrame=frame;this.#validateFactionRelations();return frame;});}
    nativeFactionMemoryWithoutUpdate(factionId){return this.#operation(()=>originalFactionMemoryWithoutUpdate(this.nativeFactionFrameState(factionId)));}
    nativeFactionProductionState(factionId){const faction=this.#nativeFaction(factionId),frame=validateOriginalFactionFrame(faction.nativeFrame,faction);check(frame.production!==null,'Actual faction production required');return frame.production;}
    readNativeProductionUnitCost(factionId,type,specId,services={}){return this.#operation(()=>originalProductionUnitCost(this.nativeFactionProductionState(factionId),type,specId,services));}
    readNativeProductionOrderCost(factionId,services={}){return this.#operation(()=>originalProductionTotalCurrentCost(this.nativeFactionProductionState(factionId),services));}
    readNativeProductionCapacity(factionId){return this.#operation(()=>{
        this.nativeFactionProductionState(factionId);
        // Stock FactionProduction uses PLAYER colonies and player stats, even on another faction.
        return originalMonthlyProductionCapacity([...this.#markets.values()],{
            readProductionMarketSupply:m=>({maxSupply:this.#currentMarketCommodity(m,'ships').maxSupply,available:this.#currentCommodityAvailable(m,'ships')}),
            applyProductionCapacityModifier:base=>originalProductionCapacityModified(base,originalNativeFleetDynamicMod(this.#currentNativePersonStats(this.playerEconomyState().player),'custom_production_mod')),
        });
    });}
    addNativeFactionProductionItem(factionId,type,specId,quantity=1,limit=0,services={}){return this.#operation(()=>addOriginalProductionItem(this.nativeFactionProductionState(factionId),type,specId,quantity,limit,services));}
    removeNativeFactionProductionItem(factionId,type,specId,quantity,services={}){return this.#operation(()=>removeOriginalProductionItem(this.nativeFactionProductionState(factionId),type,specId,quantity,services));}
    nativeFactionGatheringPoint(factionId){return this.#operation(()=>originalProductionGatheringPoint(this.nativeFactionProductionState(factionId),[...this.#markets.values()],{
        isProductionMarketInEconomy:market=>this.#markets.has(market.marketId),
        readProductionMarketAge:market=>{check(this.#markets.get(market.marketId)===market,'Actual production market identity required');return validateOriginalMarketFrame(this.nativeMarketFrameState(market.marketId),market).daysInExistence;},
    }));}
    clearNativeFactionProduction(factionId,services={}){return this.#operation(()=>clearOriginalFactionProduction(this.nativeFactionProductionState(factionId),services));}
    advanceNativeFactionFrame(factionId,seconds,context,services={}){return this.#operation(()=>{
        const faction=this.#nativeFaction(factionId),frame=validateOriginalFactionFrame(faction.nativeFrame,faction);check(!this.#factionFramesActive.has(frame),'Reentrant Faction frame');this.#factionFramesActive.add(frame);
        try{advanceOriginalFactionFrame(frame,seconds,context,{...services,convertFactionSecondsToDays:dt=>this.#nativeClock().convertToDays(dt)});}finally{this.#factionFramesActive.delete(frame);}
    });}
    nativeFactionRelation(one,two){return this.#operation(()=>originalFactionRelation(this.#requiredFactionRelations(),one,two));}
    getNativeFactionRelationship(one,two){return this.#operation(()=>{const relation=originalFactionRelation(this.#requiredFactionRelations(),one,two);check(relation,'Non-null faction IDs required');return relation.value;});}
    setNativeFactionRelationship(one,two,value){return this.#operation(()=>setOriginalFactionRelation(this.#requiredFactionRelations(),one,two,value));}
    #nativeReputationServices(services={}){return {
        readNativeReputationPlayerFleet:()=>this.playerEconomyState().fleet,
        readNativeReputationPlayerPerson:()=>this.playerEconomyState().player,
        reportNativeReputationChange:(target,delta)=>{const listeners=this.#requiredFleetWorld().campaignListeners;check(listeners&&Array.isArray(listeners.saved)&&Array.isArray(listeners.transient)&&Array.isArray(listeners.timed),'Actual reputation CampaignEventListener roster required');for(const listener of [...listeners.saved,...listeners.transient,...listeners.timed]){check(typeof services.reportReputationChangeToListener==='function','Actual reputation listener implementation required');const value=services.reportReputationChangeToListener(listener,target,delta);check(!value||typeof value.then!=='function','Synchronous reputation listener required');}},
        ...services,
    };}
    adjustNativePlayerFactionReputation(action,factionId,services={}){return this.#operation(()=>factionId==='player'?{delta:0}:adjustOriginalPlayerFactionReputation(this.#requiredFactionRelations(),action,factionId,this.#nativeReputationServices(services)));}
    #nativeBattleServices(services={}){return this.#nativeFleetServices({
        adjustEncounterFactionReputation:(action,id)=>this.adjustNativePlayerFactionReputation(action,id,services),
        areBattleFactionsHostile:(one,two)=>originalRepAtBest(originalReputationLevel(this.getNativeFactionRelationship(one.factionId,two.factionId)),'HOSTILE'),
        areBattleFactionsFriendly:(one,two)=>originalRepAtWorst(originalReputationLevel(this.getNativeFactionRelationship(one.factionId,two.factionId)),'FRIENDLY'),
        createBattleEncounterContext:()=>this.createNativeFleetEncounterContext(services),
        reportInteractionPlayerDidNotTakeCargo:(cargo,fleet)=>{check(fleet===this.playerEconomyState().fleet,'Actual current player required for stock CoreScript');return this.reportNativePlayerDidNotTakeCargo(cargo,services);},
        reportInteractionNonMarketTransaction:(transaction,dialog)=>reportOriginalNonMarketTransaction(this.#requiredFleetWorld(),transaction,dialog,services),
        createEncounterLootCargo:()=>{const factory=this.fleetDataFactoryState();check(Number.isSafeInteger(factory.serial)&&factory.serial<Number.MAX_SAFE_INTEGER,'Current Web object allocator required');const cargo=createOriginalFleetCargo('encounter:'+this.playerEconomyState().nativeUID.sectorRef+':'+(++factory.serial));cargo.carryingFleetRef=null;return cargo;},
        resolveEncounterFleetData:ref=>this.#fleetForDataRef(ref),
        readExperiencePlayerStats:()=>this.playerEconomyState().player.stats,
        readExperiencePlayerOfficers:()=>this.playerEconomyState().fleet?.officers??null,
        readOfficerFleetCommanderStats:person=>{check(Object.hasOwn(person,'fleetRef'),'Actual Person.fleet attachment required, not CharacterStats.fleet');if(person.fleetRef===null)return null;const fleet=this.fleetDataFactoryState().fleets.find(f=>f.objectRef===person.fleetRef)??(this.playerEconomyState().fleet?.objectRef===person.fleetRef?this.playerEconomyState().fleet:null);check(fleet,'Actual officer fleet required');return this.getNativeFleetCommander(fleet.dataRef).stats;},
        despawnEncounterFleet:(fleet,reason,battle)=>this.despawnNativeFleet(fleet.dataRef,reason,battle,services),
        readEncounterHullmodItemManager:()=>this.nativeHullmodItemManager(),
        readEncounterStockVariant:id=>originalFleetStockVariant(this.fleetMemberFactoryState(),id),
        readEncounterCaptain:member=>{
            check(member.fleetDataRef!==undefined&&member.captainRef!==undefined,'Actual member captain attachment required');
            if(member.fleetDataRef!==null)return this.bindFleetRoster(member.fleetDataRef,services.battleMemberEffectPlugins??{},services).getCaptain(member);
            if(member.captainRef===null){const captain=createOriginalDefaultFleetCaptain(this.playerEconomyState());member.captain=captain;member.captainRef=captain.objectRef;return captain;}
            const captain=originalPersonnelByRef(this.playerEconomyState(),member.captainRef);check(member.captain===undefined||member.captain===captain,'Lost detached captain identity');return captain;
        },
        readEncounterCurrentLocation:()=>{check(this.#engineFrame!==null,'Actual current location required for encounter loss');return this.#engineFrame.currentLocation;},
        createBattleCombinedFleet:faction=>{check(typeof services.readBattleSectorGeneration==='function','Actual Battle lifecycle service required: readBattleSectorGeneration');const generation=services.readBattleSectorGeneration();check(typeof generation==='boolean','Actual sector-generation flag required');return this.createNativeEmptyFleet(faction,false,{isInSectorGen:generation},{...services.battleCharacterDependencies,nativeFleetServices:services}).fleet;},
        readBattleFleetRoster:fleet=>this.bindFleetRoster(fleet.dataRef,services.battleMemberEffectPlugins??{},services),
        readBattleFleetCommander:fleet=>this.getNativeFleetCommander(fleet.dataRef),
        setBattleFleetCommander:(fleet,person)=>this.setNativeFleetCommander(fleet.dataRef,person.objectRef,{...services.battleCharacterDependencies,nativeFleetServices:services}),
        refreshBattleCommander:person=>this.refreshNativeCharacterStats(person.objectRef,{...services.battleCharacterDependencies,nativeFleetServices:services,refreshOutposts:false,resolvePending:false}),
        readBattleMemberFlagship:member=>{check(typeof member.isFlagship==='boolean','Actual member flagship field required');if(member.isFlagship)return true;if(member.fleetDataRef===null)return false;const owner=this.#fleetForDataRef(member.fleetDataRef);return this.getNativeFleetCommander(owner.dataRef)===this.bindFleetRoster(owner.dataRef,services.battleMemberEffectPlugins??{},services).getCaptain(member);},
        finishBattle:(battle,winner,engaged)=>finishOriginalBattle(battle,winner,engaged,this.#nativeBattleServices(services)),
        resolveBattleRound:battle=>resolveOriginalBattleRound(battle,this.#nativeBattleServices(services)),
        resolveBattleAutoresolver:resolver=>resolveOriginalBattleAutoresolver(resolver,this.#nativeBattleServices(services)),
        readBattleResolverContext:resolver=>{check(resolver?.scope==='native-default-battle-autoresolver'&&resolver.context,'Actual default resolver context required');return resolver.context;},
        readBattleResolverWinner:context=>{check(typeof context?.getWinner==='function','Actual encounter context getWinner required');const winner=context.getWinner();check(!winner||typeof winner.then!=='function','Synchronous encounter winner required');return winner;},
        globalRandom:this.#fleetServices?.random?.global,
        readBattlePlayerFleet:()=>services.readEncounterPlayerFleet?services.readEncounterPlayerFleet():this.playerEconomyState().fleet,
        newBattleSeed:()=>originalJavaNextLong(createOriginalJavaRandom(originalJavaNextLong(this.factionPersonFactoryState().random.newRandomSeeds))),
        newBattleObjectRef:(first,seed)=>{
            const ref='web-battle:'+first.objectRef+':'+seed;
            const current=[...(this.#locationFrames??[]).flatMap(s=>s.scripts),...(this.#fleetServices?.dataFactory?.fleets??[]).map(f=>f.battle)];
            check(!current.some(b=>b?.objectRef===ref),'Battle graph identity collision');return ref;
        },
        addBattleLocationScript:(location,battle)=>{const state=this.nativeLocationFrameState(location.objectRef);check(state?.location===location,'Actual bound Battle location required');if(!state.scripts.includes(battle))state.scripts.push(battle);},
        ...(services.isEncounterAIHostileTo?{isBattleAIHostileTo:services.isEncounterAIHostileTo}:{}),
        ...(services.areEncounterFactionsHostile?{areBattleFactionsHostile:services.areEncounterFactionsHostile}:{}),...services,
    });}
    /** Actual new Battle; no capture/projection may be passed as its state. */
    createNativeBattle(firstDataRef,secondDataRef,services={}){return this.#operation(()=>{
        const first=this.#worldBinding(firstDataRef).fleet,second=this.#worldBinding(secondDataRef).fleet;
        const battle=createOriginalCampaignBattle(first,second,this.#nativeBattleServices(services));this.#validateNativeBattles();return battle;
    });}
    pickNativeBattleSide(battle,dataRef,services={},respectTransponder=true){return this.#operation(()=>{this.#requireNativeBattle(battle);return pickOriginalBattleSide(battle,this.#worldBinding(dataRef).fleet,this.#nativeBattleServices(services),respectTransponder);});}
    canJoinNativeBattle(battle,dataRef,services={}){return this.#operation(()=>{this.#requireNativeBattle(battle);return canJoinOriginalBattle(battle,this.#worldBinding(dataRef).fleet,this.#nativeBattleServices(services));});}
    joinNativeBattle(battle,dataRef,services={},side){return this.#operation(()=>{this.#requireNativeBattle(battle);const result=joinOriginalBattle(battle,this.#worldBinding(dataRef).fleet,this.#nativeBattleServices(services),side);this.#validateNativeBattles();return result;});}
    takeNativeBattleSnapshots(battle){return this.#operation(()=>{this.#requireNativeBattle(battle);return takeOriginalBattleSnapshots(battle);});}
    advanceNativeBattleFrame(battle,seconds,context,services={}){return this.#operation(()=>{
        this.#requireNativeBattle(battle);check(!this.#battleFramesActive.has(battle),'Reentrant Battle frame is not supported');this.#battleFramesActive.add(battle);
        try{advanceOriginalCampaignBattle(battle,seconds,context,this.#nativeBattleServices({convertBattleSecondsToDays:amount=>this.#nativeClock().convertToDays(amount),...services}));this.#validateNativeBattles();}finally{this.#battleFramesActive.delete(battle);}
    });}
    #guardEncounterFacade(facade,entry=null){return Object.fromEntries(Object.entries(facade).map(([key,value])=>[key,typeof value==='function'?(...args)=>this.#operation(()=>{if(entry!==null)check(this.#encounters.entries.includes(entry),'Encounter context has been released');return value(...args);}):value]));}
    /** Transient method facade; serialize its actual state, never the bound callbacks. */
    createNativeFleetEncounterContext(services={}){return this.#operation(()=>this.#guardEncounterFacade(createOriginalFleetEncounterContext(this.#nativeBattleServices(services))));}
    bindNativeFleetEncounterContext(state,services={}){return this.#operation(()=>{const entry=this.#encounters.entries.find(row=>row.context===state)??null;if(entry!==null)this.#validateNativeEncounterContexts();else if(state.battle!==null)this.#requireNativeBattle(state.battle);return this.#guardEncounterFacade(bindOriginalFleetEncounterContext(state,this.#nativeBattleServices(services)),entry);});}
    /** Server-owned roots, never a client-supplied encounter or a serialized method facade. */
    nativeRetainedEncounterState(){check(!this.#failed,'Failed shared draft must be discarded');return this.#encounters;}
    retainNativeFleetEncounterContext(ownerDataRef,state){return this.#operation(()=>{
        const owner=this.#fleetForDataRef(ownerDataRef);check(owner.campaign&&!owner.campaign.battleCombination,'Actual non-combined encounter owner required');validateOriginalEncounterState(state);
        const existing=this.#encounters.entries.find(row=>row.context===state);if(existing){check(existing.ownerFleet===owner,'Encounter context already has a different owner');return existing.encounterId;}
        check(!this.#encounters.entries.some(row=>row.ownerFleet===owner),'Release the previous retained encounter before replacing it');if(state.battle!==null)this.#requireNativeBattle(state.battle);
        check(Number.isSafeInteger(this.#encounters.serial)&&this.#encounters.serial<Number.MAX_SAFE_INTEGER,'Encounter identity allocator exhausted');const encounterId='web-encounter:'+owner.objectRef+':'+(++this.#encounters.serial);
        this.#encounters.entries.push({encounterId,ownerFleet:owner,context:state,aftermath:null,lootTransaction:null});this.#validateNativeEncounterContexts();return encounterId;
    });}
    retainedNativeFleetEncounterContext(encounterId,services={}){return this.#operation(()=>{check(typeof encounterId==='string','Actual retained encounter ID required');const entry=this.#encounters.entries.find(row=>row.encounterId===encounterId);check(entry,'Retained encounter does not exist');return this.bindNativeFleetEncounterContext(entry.context,services);});}
    /** Removes only this Web retention root; dialog cleanup/payment must already have run where appropriate. */
    releaseNativeFleetEncounterContext(encounterId){return this.#operation(()=>{check(typeof encounterId==='string','Actual retained encounter ID required');const index=this.#encounters.entries.findIndex(row=>row.encounterId===encounterId);if(index<0)return false;check(this.#encounters.entries[index].aftermath===null||this.#encounters.entries[index].aftermath.phase==='finished','Finish interaction cleanup before releasing its context');this.#encounters.entries.splice(index,1);return true;});}
    #requiredRetainedEncounter(encounterId){check(typeof encounterId==='string','Actual retained encounter ID required');const entry=this.#encounters.entries.find(row=>row.encounterId===encounterId);check(entry,'Retained encounter does not exist');return entry;}
    nativeFleetLootCargoView(encounterId){check(!this.#failed,'Failed shared draft must be discarded');const entry=this.#requiredRetainedEncounter(encounterId);check(entry.aftermath?.phase==='loot-open','No actual core loot window is open');return projectOriginalLootCargo(entry.ownerFleet.cargo,entry.context.loot,entry.lootTransaction);}
    applyNativeFleetLootCargoActions(encounterId,actions,services={}){return this.#operation(()=>{const entry=this.#requiredRetainedEncounter(encounterId);check(entry.aftermath?.phase==='loot-open','No actual core loot window is open');check(Array.isArray(actions)&&!actions.some(action=>action?.kind==='confirm'),'Use the real loot-panel confirmation/close entry; ledger-only confirm is not a client action');const bound=this.#nativeBattleServices(services);
        if(entry.lootTransaction===null)entry.lootTransaction=createOriginalLootCargoTransaction(entry.ownerFleet.cargo,entry.context.loot,bound.createEncounterLootCargo,bound);
        applyOriginalLootCargoActions(entry.lootTransaction,actions,bound);this.#validateNativeEncounterContexts();return this.nativeFleetLootCargoView(encounterId);
    });}
    nativeFleetInteractionAftermathState(encounterId){check(!this.#failed,'Failed shared draft must be discarded');return this.#requiredRetainedEncounter(encounterId).aftermath;}
    /** Called by the actual upstream interaction/recovery stage, not by a client claiming victory. */
    createNativeFleetInteractionAftermath(encounterId,otherDataRef,progress,config){return this.#operation(()=>{const entry=this.#requiredRetainedEncounter(encounterId);check(entry.aftermath===null,'Interaction aftermath is already attached');entry.aftermath=createOriginalFleetInteractionAftermath(entry.context,entry.ownerFleet,this.#fleetForDataRef(otherDataRef),progress,config);this.#validateNativeEncounterContexts();return entry.aftermath;});}
    #withNativeFleetInteraction(encounterId,dialog,services,action){return this.#operation(()=>{const entry=this.#requiredRetainedEncounter(encounterId);check(entry.aftermath!==null,'Actual interaction aftermath has not been attached');check(entry.lootTransaction===null||!originalLootTransactionExists(entry.lootTransaction),'Finish or cancel the cargo transaction before closing the interaction');
        const bound=this.#nativeBattleServices({...services,dismissInteractionLoot:()=>this.dismissNativeFleetLoot(encounterId,dialog,services)}),context=this.bindNativeFleetEncounterContext(entry.context,bound);
        return action(entry.aftermath,context,dialog,bound);
    });}
    completeNativeFleetVictorySalvage(encounterId,dialog,services={}){return this.#withNativeFleetInteraction(encounterId,dialog,services,completeOriginalFleetVictorySalvage);}
    openNativeFleetLoot(encounterId,dialog,services={}){const prepared={...services,prepareInteractionLootCargo:loot=>{const entry=this.#requiredRetainedEncounter(encounterId);check(entry.lootTransaction===null,'Loot cargo panel is already attached');const bound=this.#nativeBattleServices(services);entry.lootTransaction=createOriginalLootCargoTransaction(entry.ownerFleet.cargo,loot,bound.createEncounterLootCargo,bound);}};return this.#withNativeFleetInteraction(encounterId,dialog,prepared,openOriginalFleetLoot);}
    /** q's confirm AND core dismissal are one disposable world operation, not a UI hide. */
    dismissNativeFleetLoot(encounterId,dialog,services={}){return this.#operation(()=>{
        const entry=this.#requiredRetainedEncounter(encounterId);check(entry.aftermath!==null,'Actual interaction aftermath has not been attached');if(entry.aftermath.phase==='finished')return false;
        check(entry.aftermath.phase==='loot-open','No actual core loot window is open');
        // Navigation control does not establish an independent player's XP/officer/intel context.
        check(entry.ownerFleet===this.playerEconomyState().fleet,'Independent-player loot settlement context is not yet bound');
        const bound=this.#nativeBattleServices(services);check(bound.readBattlePlayerFleet()===entry.ownerFleet,'Loot settlement player does not own this encounter');
        if(entry.lootTransaction===null)entry.lootTransaction=createOriginalLootCargoTransaction(entry.ownerFleet.cargo,entry.context.loot,bound.createEncounterLootCargo,bound);
        const context=this.bindNativeFleetEncounterContext(entry.context,bound);
        confirmOriginalLootCargoPanel(entry.lootTransaction,entry.ownerFleet,dialog,bound);
        const result=dismissOriginalFleetLoot(entry.aftermath,context,dialog,bound);this.#validateNativeEncounterContexts();return result;
    });}
    leaveNativeFleetInteraction(encounterId,dialog,continued=false,services={}){return this.#withNativeFleetInteraction(encounterId,dialog,services,(state,context,ui,bound)=>leaveOriginalFleetInteraction(state,context,ui,continued,bound));}
    #validateNativeEncounterContexts(forCheckpoint=false){
        const registry=this.#encounters;check(registry?.scope==='web-retained-native-encounters'&&Number.isSafeInteger(registry.serial)&&registry.serial>=0&&Array.isArray(registry.entries),'Actual retained encounter registry required');
        const fleets=this.#fleetServices?.dataFactory?.fleets??[],members=this.#fleetServices?.memberFactory?.members??[],identities=new Map(),canonical=new Set();
        const bind=object=>{if(!object||typeof object.objectRef!=='string')return;check(!identities.has(object.objectRef)||identities.get(object.objectRef)===object,'Split shared encounter/world identity: '+object.objectRef);identities.set(object.objectRef,object);canonical.add(object);};
        if(registry.entries.length===0)return;
        for(const fleet of fleets){bind(fleet);bind(fleet.cargo);bind(fleet.battle);}for(const member of members)bind(member);
        if(this.#playerEconomy?.state)for(const person of originalPersonnelPeople(this.#playerEconomy.state))bind(person);
        // Pre-manager worlds can carry repeated faction construction captures. Only the actual
        // registered FactionManager makes those faction refs a canonical global identity.
        for(const faction of this.#factionRelations?.factions??[])bind(faction);
        for(const location of this.#locationFrames??[])for(const script of location.scripts)if(script?.scope==='native-current-campaign-battle')bind(script);
        const ids=new Set(),owners=new Set(),contexts=new Set();
        for(const entry of registry.entries){
            check(typeof entry.encounterId==='string'&&entry.encounterId.startsWith('web-encounter:')&&!ids.has(entry.encounterId),'Unique retained encounter ID required');ids.add(entry.encounterId);
            check(fleets.includes(entry.ownerFleet)&&entry.ownerFleet.campaign&&!entry.ownerFleet.campaign.battleCombination&&!owners.has(entry.ownerFleet),'Lost or duplicate retained encounter owner');owners.add(entry.ownerFleet);
            check(!contexts.has(entry.context),'Encounter context cannot have two owners');contexts.add(entry.context);validateOriginalEncounterState(entry.context,{forCheckpoint});bind(entry.context.battle);
            check(!fleets.some(fleet=>fleet.cargo===entry.context.loot),'Encounter loot must not alias an existing fleet cargo');
            check(Object.hasOwn(entry,'aftermath'),'Missing retained interaction field');if(entry.aftermath!==null){const state=validateOriginalFleetInteractionAftermath(entry.aftermath);check(state.context===entry.context&&state.playerFleet===entry.ownerFleet&&fleets.includes(state.otherFleet),'Lost interaction/context/fleet identity');for(const fleet of state.pulledIn)check(fleets.includes(fleet),'Lost interaction pulled-in fleet');for(const member of state.recoveredShips)check(members.includes(member),'Lost interaction recovered member');}
            check(Object.hasOwn(entry,'lootTransaction'),'Missing retained loot transaction field');if(entry.lootTransaction!==null){const tx=validateOriginalLootCargoTransaction(entry.lootTransaction);check(tx.fleet===entry.ownerFleet.cargo&&tx.sourceLoot===entry.context.loot,'Lost transaction/encounter Cargo identity');check(entry.aftermath!==null,'Transaction requires actual interaction');if(originalLootTransactionExists(tx))check(entry.aftermath.phase==='loot-open','Unfinished transaction outside loot window');if(tx.panelConfirmed&&forCheckpoint)check(entry.aftermath.phase==='finished','Confirmed panel must finish in the same world operation');}
            const context=entry.context,memberRefs=[...context.recoverableShips,...context.storyRecoverableShips,...context.origSourceForRecoveredShips.map(row=>row.member),...context.preEngagementCRForWinner.map(row=>row.member)];
            for(const row of context.origSourceForRecoveredShips)check(fleets.includes(row.fleet),'Lost recovered member source fleet');
            for(const side of context.sideData){check(fleets.includes(side.fleet),'Lost encounter side fleet');for(const key of ['deployedInLastEngagement','retreatedFromLastEngagement','inReserveDuringLastEngagement','disabledInLastEngagement','destroyedInLastEngagement','membersWithOfficerOrPlayerAsOrigCaptain'])memberRefs.push(...side[key]);for(const key of ['ownCasualties','enemyCasualties','memberToDeployedMap'])memberRefs.push(...side[key].map(row=>row.member));for(const row of side.officerData)check(row.sourceFleet===null||fleets.includes(row.sourceFleet),'Lost encounter officer source fleet');}
            for(const member of memberRefs)check(members.includes(member),'Lost encounter member factory identity');
        }
        // Recognized world objects were validated by their owning roots. Walk only encounter-owned data.
        const visited=new Set(),pending=registry.entries.flatMap(entry=>[entry.context,entry.aftermath,entry.lootTransaction]);
        while(pending.length){const value=pending.pop();if(value===null||typeof value!=='object'||visited.has(value))continue;visited.add(value);
            if(typeof value.objectRef==='string'&&identities.has(value.objectRef)){check(identities.get(value.objectRef)===value,'Split shared encounter/world identity');if(canonical.has(value))continue;}
            if(typeof value.objectRef==='string')identities.set(value.objectRef,value);
            if(value.scope==='native-constructed-campaign-fleet'||value.nativeConstruction==='fleet-data')check(fleets.includes(value),'Unknown encounter fleet identity');
            for(const child of Object.values(value))pending.push(child);
        }
        this.#validateNativeBattles();
    }
    /** Actual default plugin factory; plugin-priority selection remains the caller's responsibility. */
    createNativeBattleAutoresolver(battle,services={}){return this.#operation(()=>{this.#requireNativeBattle(battle);return createOriginalBattleAutoresolver(battle,this.#nativeBattleServices(services));});}
    resolveNativeBattleAutoresolver(resolver,services={}){return this.#operation(()=>{this.#requireNativeBattle(resolver.battle);const result=resolveOriginalBattleAutoresolver(resolver,this.#nativeBattleServices(services));this.#validateNativeBattles();return result;});}
    resolveNativeBattlePlayerPursuit(resolver,context,selected,services={}){return this.#operation(()=>{this.#requireNativeBattle(resolver.battle);const result=resolveOriginalBattlePlayerPursuit(resolver,context,selected,this.#nativeBattleServices(services));this.#validateNativeBattles();return result;});}
    generateNativeBattleCombined(battle,services={},withStations=true,removeEmpty=true){return this.#operation(()=>{this.#requireNativeBattle(battle);generateOriginalBattleCombined(battle,this.#nativeBattleServices(services),withStations,removeEmpty);this.#validateNativeBattles();return battle;});}
    uncombineNativeBattle(battle,services={}){return this.#operation(()=>{this.#requireNativeBattle(battle);uncombineOriginalBattle(battle,this.#nativeBattleServices(services));this.#validateNativeBattles();});}
    leaveNativeBattle(battle,dataRef,engaged,services={}){return this.#operation(()=>{this.#requireNativeBattle(battle);leaveOriginalBattle(battle,this.#worldBinding(dataRef).fleet,engaged,this.#nativeBattleServices(services));this.#validateNativeBattles();});}
    finishNativeBattle(battle,winner,engaged=true,services={}){return this.#operation(()=>{this.#requireNativeBattle(battle);finishOriginalBattle(battle,winner,engaged,this.#nativeBattleServices(services));this.#validateNativeBattles();});}
    resolveNativeBattleRound(battle,services={}){return this.#operation(()=>{this.#requireNativeBattle(battle);resolveOriginalBattleRound(battle,this.#nativeBattleServices(services));this.#validateNativeBattles();});}
    #requireNativeBattle(battle){validateOriginalCampaignBattle(battle);check(this.nativeLocationFrameState(battle.location.objectRef)?.scripts.includes(battle),'Battle is not an actual registered location script');return battle;}
    #validateNativeBattles(){
        const fleets=(this.#fleetServices?.dataFactory?.fleets??[]).filter(f=>f.campaign),battles=new Map(),scriptOwners=new Map();
        const bind=b=>{validateOriginalCampaignBattle(b);check(!battles.has(b.objectRef)||battles.get(b.objectRef)===b,'Lost shared Battle identity');battles.set(b.objectRef,b);};
        for(const state of this.#locationFrames??[])for(const script of state.scripts)if(script?.scope==='native-current-campaign-battle'){bind(script);check(!scriptOwners.has(script)&&script.location===state.location,'Lost Battle/location-script identity');scriptOwners.set(script,state);}
        for(const fleet of fleets){const role=fleet.campaign.battleCombination;if(role!==undefined){check(role?.scope==='native-battle-combined-identity'&&['ONE','TWO'].includes(role.side)&&role.battle?.scope==='native-current-campaign-battle'&&role.battle===fleet.battle,'Lost actual combined/Battle identity');check(fleet.synchronization.onlySyncMemberLists&&!fleet.campaign.worldRegistered&&!role.battle.sideOne.includes(fleet)&&!role.battle.sideTwo.includes(fleet),'Combined fleet must remain an unregistered lists-only object');}
            if(fleet.battle?.scope==='native-current-campaign-battle'){bind(fleet.battle);check(fleet.battle.sideOne.includes(fleet)||fleet.battle.sideTwo.includes(fleet)||fleet.battle.combinedOne===fleet||fleet.battle.combinedTwo===fleet||role?.battle===fleet.battle,'Fleet points to a Battle without membership');}}

        for(const entry of this.#encounters.entries)if(entry.context.battle!==null)bind(entry.context.battle);
        for(const battle of battles.values()){
            check(this.#fleetServices?.fleetWorld?.locations.includes(battle.location),'Lost Battle/world location identity');if(!battle.done)check(scriptOwners.has(battle),'Active Battle missing from location scripts');
            for(const fleet of [...battle.sideOne,...battle.sideTwo,...battle.snapshotSideOne??[],...battle.snapshotSideTwo??[],battle.primaryOne,battle.primaryTwo,battle.combinedOne,battle.combinedTwo].filter(Boolean))check(fleets.includes(fleet),'Lost Battle/factory fleet identity');
            for(const [side,fleet] of [['ONE',battle.combinedOne],['TWO',battle.combinedTwo]])if(fleet!==null)check(fleet.campaign.battleCombination?.battle===battle&&fleet.campaign.battleCombination.side===side,'Lost combined side identity');
            for(const row of battle.memberSource)check(fleets.includes(row.fleet)&&this.#fleetServices?.memberFactory?.members.includes(row.member),'Lost Battle/member-source identity');
        }
    }
    #nativeEncounterServices(services={}){return {
        areEncounterFactionsHostile:(one,two)=>originalRepAtBest(originalReputationLevel(this.getNativeFactionRelationship(one.factionId,two.factionId)),'HOSTILE'),
        readEncounterClosestBattleFleet:(battle,joining)=>{this.#requireNativeBattle(battle);return originalBattleClosestFleet(battle,joining);},
        canJoinEncounterBattle:(battle,joining)=>this.canJoinNativeBattle(battle,joining.dataRef,services),
        joinEncounterBattle:(battle,joining)=>this.joinNativeBattle(battle,joining.dataRef,services),
        createEncounterBattle:(first,second)=>this.createNativeBattle(first.dataRef,second.dataRef,services),
        readEncounterPlayerFleet:()=>this.playerEconomyState().fleet,
        readVisibilityToPlayer:fleet=>this.fleetVisibilityToPlayer(fleet.objectRef),
        resolveEncounterEntity:ref=>{const entity=this.#nativeWorldEntity(ref);check(entity,'Actual registered encounter entity required');return entity;},
        readEncounterEntityRadius:entity=>{check(isOriginalCargoPods(entity)||isOriginalCampaignPlanet(entity),'Actual other entity radius service required');return entity.radius;},
        isEncounterMarket:market=>[...this.#markets.values()].includes(market),...services,
    };}
    /** BaseLocation encounter subphase; actual Battle is default, AI/UI still require real services. */
    advanceNativeLocationEncounters(locationRef,context,services={}){return this.#operation(()=>{
        const state=this.nativeLocationFrameState(locationRef);check(state&&!this.#locationEncountersActive.has(state),'Actual non-reentrant encounter location required');validateOriginalLocationFrame(state,this.#requiredFleetWorld());this.#locationEncountersActive.add(state);
        try{return advanceOriginalLocationEncounters(state,context,this.#nativeEncounterServices(services));}finally{this.#locationEncountersActive.delete(state);}
    });}
    #nativeLocationServices(services){return this.#nativeFleetServices({
        advanceLocationScript:(script,seconds,context)=>{check(script?.scope==='native-current-campaign-battle','Actual non-Battle location script service required');this.advanceNativeBattleFrame(script,seconds,context,services);},
        advanceLocationEncounters:(state,context)=>this.advanceNativeLocationEncounters(state.location.objectRef,context,services),
        advanceLocationEntity:(entity,seconds,context)=>isOriginalCampaignPlanet(entity)?this.advanceNativePlanetFrame(entity,seconds,context,services):this.advanceNativeCargoPodsFrame(entity,seconds,context,services),
        advanceLocationEntityEvenIfPaused:(entity,seconds,context)=>isOriginalCampaignPlanet(entity)?this.advanceNativePlanetEvenIfPaused(entity,seconds,context,services):this.advanceNativeCargoPodsEvenIfPaused(entity,seconds,context,services),
        advanceLocationFleet:(fleet,seconds,context)=>this.advanceNativeFleetFrame(fleet.dataRef,seconds,context,services),
        advanceLocationFleetEvenIfPaused:(fleet,seconds,context)=>this.advanceNativeFleetEvenIfPaused(fleet.dataRef,seconds,context,services),
        ...this.#nativeEncounterServices(services),convertLocationSecondsToDays:seconds=>this.#nativeClock().convertToDays(seconds),readLocationClockTimestamp:()=>this.#nativeClock().snapshot().timestamp,
    });}
    #advanceNativeLocation(locationRef,seconds,context,services,even){return this.#operation(()=>{
        const state=this.nativeLocationFrameState(locationRef);check(state&&!this.#locationFramesActive.has(state),'Actual non-reentrant location frame state required');validateOriginalLocationFrame(state,this.#requiredFleetWorld());this.#locationFramesActive.add(state);
        try{return (even?advanceOriginalLocationEvenIfPaused:advanceOriginalLocationFrame)(state,seconds,context,this.#nativeLocationServices(services));}finally{this.#locationFramesActive.delete(state);}
    });}
    advanceNativeLocationEvenIfPaused(locationRef,seconds,context,services={}){return this.#advanceNativeLocation(locationRef,seconds,context,services,true);}
    advanceNativeLocationFrame(locationRef,seconds,context,services={}){return this.#advanceNativeLocation(locationRef,seconds,context,services,false);}
    #nativeCampaignListeners(){return (this.#engineFrame?.world??this.#requiredFleetWorld()).campaignListeners;}
    nativeCampaignListenerTimeoutsState(){check(!this.#failed,'Failed shared draft must be discarded');const listeners=this.#nativeCampaignListeners();return listeners.timeouts??null;}
    bindNativeCampaignListenerTimeouts(state){return this.#operation(()=>{const listeners=this.#nativeCampaignListeners();check(!Object.hasOwn(listeners,'timeouts')||listeners.timeouts===state,'Cannot replace live listener timeout history');validateOriginalCampaignListenerTimeouts(state,listeners);listeners.timeouts=state;return state;});}
    addNativeCampaignListenerWithTimeout(listener,days){return this.#operation(()=>addOriginalCampaignListenerWithTimeout(this.nativeCampaignListenerTimeoutsState(),listener,days));}
    removeNativeCampaignListener(listener){return this.#operation(()=>removeOriginalCampaignListener(this.nativeCampaignListenerTimeoutsState(),listener));}
    advanceNativeCampaignListenerTimeouts(days){return this.#operation(()=>advanceOriginalCampaignListenerTimeouts(this.nativeCampaignListenerTimeoutsState(),days));}
    nativeImportantPeopleState(){check(!this.#failed,'Failed shared draft must be discarded');return this.#engineFrame?.importantPeople??null;}
    #validateImportantPeople(){
        if(!this.#engineFrame||!Object.hasOwn(this.#engineFrame,'importantPeople'))return;
        const state=validateOriginalImportantPeople(this.#engineFrame.importantPeople);if(!state.people.length&&!state.excludeFromGetPerson?.length)return;
        const people=new Map(originalPersonnelPeople(this.playerEconomyState()).map(p=>[p.objectRef,p])),world=this.#engineFrame.world;
        const person=p=>check(people.get(p.objectRef)===p,'Lost shared ImportantPeople Person identity');
        for(const row of state.people){person(row.person);const location=row.location;check(location.market===null||[...this.#markets.values()].includes(location.market),'Lost ImportantPeople market identity');if(location.entity!==null){const known=[...world.locations.flatMap(l=>l.repository.contains),...this.#fleetServices?.dataFactory?.fleets??[]];check(known.includes(location.entity),'Lost ImportantPeople entity identity');}}
        for(const excluded of state.excludeFromGetPerson??[])person(excluded);
    }
    bindNativeImportantPeople(state){return this.#operation(()=>{check(this.#engineFrame,'Actual engine required');check(!Object.hasOwn(this.#engineFrame,'importantPeople')||this.#engineFrame.importantPeople===state,'Cannot replace a live ImportantPeople manager');this.#engineFrame.importantPeople=validateOriginalImportantPeople(state);this.#validateImportantPeople();return state;});}
    addNativeImportantPerson(personRef){return this.#operation(()=>{const state=validateOriginalImportantPeople(this.nativeImportantPeopleState()),person=originalPersonnelByRef(this.playerEconomyState(),personRef);addOriginalImportantPerson(state,person,{readImportantPersonMarket:p=>{check(Object.hasOwn(p,'marketRef'),'Actual person market binding required');if(p.marketRef===null)return null;const market=[...this.#markets.values()].find(m=>m.objectRef===p.marketRef);check(market,'Actual person market required');return market;}});this.#validateImportantPeople();});}
    removeNativeImportantPerson(personId){return this.#operation(()=>removeOriginalImportantPerson(validateOriginalImportantPeople(this.nativeImportantPeopleState()),personId));}
    advanceNativeImportantPeople(seconds,context,services={}){return this.#operation(()=>{const state=validateOriginalImportantPeople(this.nativeImportantPeopleState());this.#validateImportantPeople();check(!this.#importantPeopleActive,'Reentrant ImportantPeople frame');this.#importantPeopleActive=true;try{advanceOriginalImportantPeople(state,seconds,context,{...services,convertImportantPeopleSecondsToDays:dt=>this.#nativeClock().convertToDays(dt)});}finally{this.#importantPeopleActive=false;}});}
    nativeCampaignEventManagerState(){check(!this.#failed,'Failed shared draft must be discarded');return this.#engineFrame?.eventManager??null;}
    #validateCampaignEventManager(){
        if(!this.#engineFrame||!Object.hasOwn(this.#engineFrame,'eventManager'))return;const world=this.#engineFrame.world,listeners=world.campaignListeners;
        const state=validateOriginalCampaignEventManager(this.#engineFrame.eventManager,[...listeners.saved,...listeners.transient,...listeners.timed]);
        if(state.random.binding==='runtime-shared'){const random=this.factionPersonFactoryState().random;check(state.random.mathRandom===random.mathRandom&&state.random.newRandomSeeds===random.newRandomSeeds,'Lost shared event random source identity');}
        const known=new Map([...world.locations,...world.locations.flatMap(l=>l.repository.contains),...this.#fleetServices?.dataFactory?.fleets??[],...this.#markets.values(),...this.#factionRelations?.factions??[]].map(o=>[o.objectRef,o]));
        const identity=o=>{if(o!==null&&typeof o==='object'&&known.has(o.objectRef))check(known.get(o.objectRef)===o,'Lost shared event target/world identity');};
        const target=t=>{identity(t.location);identity(t.entity);identity(t.custom);identity(t.extra);};
        for(const row of state.probabilities.entries)target(row.key.target);for(const key of [...state.keyList,...state.keyListForWarnings])target(key.target);
        for(const event of [...state.probabilities.entries.map(r=>r.probability.plugin),...state.ongoingEvents,...listeners.saved,...listeners.transient,...listeners.timed])if(event.scope==='native-base-campaign-event'){validateOriginalBaseCampaignEvent(event);if(event.eventTarget!==null)target(event.eventTarget);identity(event.market);identity(event.entity);identity(event.faction);}
    }
    bindNativeCampaignEventManager(state){return this.#operation(()=>{check(this.#engineFrame,'Actual engine required');check(!Object.hasOwn(this.#engineFrame,'eventManager')||this.#engineFrame.eventManager===state,'Cannot replace a live event manager');this.#engineFrame.eventManager=validateOriginalCampaignEventManager(state);this.#validateCampaignEventManager();return state;});}
    createNativeCampaignEventManager(){return this.#operation(()=>{check(this.#engineFrame&&!Object.hasOwn(this.#engineFrame,'eventManager'),'Explicitly new event manager required');const rng=this.factionPersonFactoryState().random,state=createOriginalCampaignEventManager(this.#engineFrame.world.sectorRef+':events',rng.mathRandom,rng.newRandomSeeds);state.random.binding='runtime-shared';return this.bindNativeCampaignEventManager(state);});}
    #nativeBaseEventServices(services={}){return {
        nextBaseEventUID:()=>nextOriginalNativeUID(this.playerEconomyState()),
        readBaseEventEntityMarket:entity=>this.#intelEntityState(entity).market,
        readBaseEventEntityFaction:entity=>isOriginalCargoPods(entity)?entity.faction:isOriginalCampaignPlanet(entity)?this.#nativePlanetFaction(entity):this.#nativeFaction(entity.factionId),
        readBaseEventMarketId:market=>{check([...this.#markets.values()].includes(market),'Actual base-event market required');return market.marketId;},
        addBaseEventListener:event=>{const listeners=this.#nativeCampaignListeners();if(!listeners.saved.includes(event))listeners.saved.push(event);},
        removeBaseEventListener:event=>{const listeners=this.#nativeCampaignListeners();if(Object.hasOwn(listeners,'timeouts')){removeOriginalCampaignListener(listeners.timeouts,event);return;}check(!listeners.timed.includes(event),'Actual timed-listener state required before removing an event');for(const list of [listeners.saved,listeners.transient]){const at=list.indexOf(event);if(at>=0)list.splice(at,1);}},...services,
    };}
    createNativeBaseCampaignEvent(){return this.#operation(()=>{const player=this.playerEconomyState(),id=nextOriginalNativeUID(player);return createOriginalBaseCampaignEvent('created-base-event:'+player.nativeUID.sectorRef+':'+id,id);});}
    initializeNativeBaseCampaignEvent(event,type,target,services={},addListener=true){return this.#operation(()=>initializeOriginalBaseCampaignEvent(validateOriginalBaseCampaignEvent(event),type,target,this.#nativeBaseEventServices(services),addListener));}
    #nativeCampaignEventServices(services={}){
        const base=event=>validateOriginalBaseCampaignEvent(event),baseServices=this.#nativeBaseEventServices(services);
        return {
            createCampaignEventPlugin:(spec,target)=>{check(spec.pluginClass==='com.fs.starfarer.api.impl.campaign.events.BaseEventPlugin','Actual enabled event plugin implementation required: '+spec.pluginClass);const event=this.createNativeBaseCampaignEvent();initializeOriginalBaseCampaignEvent(event,spec.id,target,baseServices);return event;},
            readCampaignEventType:event=>{const type=base(event).eventType;check(typeof type==='string','Actual initialized event type required');return type;},
            readCampaignEventTarget:event=>{const target=base(event).eventTarget;check(target,'Actual initialized event target required');return target;},
            allowMultipleCampaignEventsForTarget:event=>{base(event);return false;},setCampaignEventParam:event=>{base(event);},setCampaignEventStartProbability:(event,value)=>{base(event).startProbability=value;},
            startCampaignEventPlugin:event=>startOriginalBaseCampaignEvent(base(event),baseServices),advanceCampaignEventPlugin:event=>{base(event);},isCampaignEventPluginDone:event=>{base(event);return false;},cleanupCampaignEventPlugin:event=>cleanupOriginalBaseCampaignEvent(base(event),baseServices),
            readCampaignEventWarningStage:event=>{base(event);return null;},readCampaignEventWarningPriority:event=>{base(event);return null;},
            // CampaignEngine.reportEventStage is actually empty in 0.98a-RC8 (javap: return).
            reportCampaignEventStage:()=>{},...services,convertCampaignEventSecondsToDays:dt=>this.#nativeClock().convertToDays(dt),
        };
    }
    nativeCampaignEventProbability(type,target,services={}){return this.#operation(()=>{const p=getOriginalCampaignEventProbability(validateOriginalCampaignEventManager(this.nativeCampaignEventManagerState()),type,target,this.#nativeCampaignEventServices(services));this.#validateCampaignEventManager();return p;});}
    ongoingNativeCampaignEvent(target,type,services={}){return this.#operation(()=>getOriginalOngoingCampaignEvent(validateOriginalCampaignEventManager(this.nativeCampaignEventManagerState()),target,type,this.#nativeCampaignEventServices(services)));}
    countNativeCampaignEvents(type,services={}){return this.#operation(()=>countOriginalOngoingCampaignEvents(validateOriginalCampaignEventManager(this.nativeCampaignEventManagerState()),type,this.#nativeCampaignEventServices(services)));}
    primeNativeCampaignEvent(target,type,param=null,services={}){return this.#operation(()=>{const event=primeOriginalCampaignEvent(validateOriginalCampaignEventManager(this.nativeCampaignEventManagerState()),target,type,param,this.#nativeCampaignEventServices(services));this.#validateCampaignEventManager();return event;});}
    startNativeCampaignEvent(target,type,param=null,services={}){return this.#operation(()=>{const event=startOriginalCampaignEvent(validateOriginalCampaignEventManager(this.nativeCampaignEventManagerState()),target,type,param,this.#nativeCampaignEventServices(services));this.#validateCampaignEventManager();return event;});}
    startNativeCampaignEventPlugin(event,services={}){return this.#operation(()=>{startOriginalCampaignEventPlugin(validateOriginalCampaignEventManager(this.nativeCampaignEventManagerState()),event,this.#nativeCampaignEventServices(services));this.#validateCampaignEventManager();});}
    endNativeCampaignEvent(event,services={}){return this.#operation(()=>{endOriginalCampaignEvent(validateOriginalCampaignEventManager(this.nativeCampaignEventManagerState()),event,this.#nativeCampaignEventServices(services));this.#validateCampaignEventManager();});}
    advanceNativeCampaignEventManager(seconds,context,services={}){return this.#operation(()=>{const state=validateOriginalCampaignEventManager(this.nativeCampaignEventManagerState());this.#validateCampaignEventManager();check(!this.#eventManagerActive,'Reentrant CampaignEventManager frame');this.#eventManagerActive=true;try{advanceOriginalCampaignEventManager(state,seconds,context,this.#nativeCampaignEventServices(services));this.#validateCampaignEventManager();}finally{this.#eventManagerActive=false;}});}
    nativeIntelManagerState(){check(!this.#failed,'Failed shared draft must be discarded');return this.#engineFrame?.intelManager??null;}
    #validateIntelManager(){
        if(!this.#engineFrame||!Object.hasOwn(this.#engineFrame,'intelManager'))return;
        const engine=this.#engineFrame,state=validateOriginalIntelManager(engine.intelManager,[...engine.scripts,...engine.transientScripts].filter(s=>typeof s.objectRef==='string'));
        const known=new Map([...engine.world.locations.flatMap(l=>l.repository.contains),...this.#fleetServices?.dataFactory?.fleets??[]].map(e=>[e.objectRef,e])),batchCargos=new Map();
        for(const item of [...state.commQueue,...state.intel,...state.messageIntents.map(m=>m.item),...engine.scripts,...engine.transientScripts])if(item.scope==='native-base-intel-plugin'){
            validateOriginalSupportedIntel(item);
            if(isOriginalProductionReportIntel(item)){
                check(this.#markets.get(item.gatheringPoint.marketId)===item.gatheringPoint,'Lost shared production gathering-point market');
                for(const {cargo} of item.data.batches){
                    check(!batchCargos.has(cargo.objectRef)||batchCargos.get(cargo.objectRef)===cargo,'Lost shared production batch cargo');batchCargos.set(cargo.objectRef,cargo);
                    if(cargo.mothballedShips!==null)check(this.#fleetForDataRef(cargo.mothballedShips.dataRef)===cargo.mothballedShips,'Lost shared production batch FleetData');
                }
            }
            if(item.postingLocation!==null){const entity=item.postingLocation;check(!known.has(entity.objectRef)||known.get(entity.objectRef)===entity,'Lost shared intel posting entity');if(isOriginalCargoPods(entity)||isOriginalCampaignPlanet(entity)||entity.campaign?.scope==='native-constructed-campaign-fleet')this.#intelEntityState(entity);}
        }
    }
    bindNativeIntelManager(state){return this.#operation(()=>{check(this.#engineFrame,'Actual engine required');check(!Object.hasOwn(this.#engineFrame,'intelManager')||this.#engineFrame.intelManager===state,'Cannot replace a live intel manager');this.#engineFrame.intelManager=validateOriginalIntelManager(state);this.#validateIntelManager();return state;});}
    #intelEntityState(object){const entity=(isOriginalCargoPods(object)||isOriginalCampaignPlanet(object))?object.entity:object?.campaign?.scope==='native-constructed-campaign-fleet'?object.campaign.entity:null;check(entity&&entity.objectRef===object.objectRef,'Actual current intel entity required; other entity classes need spatial services');return entity;}
    #nativeIntelSpatialServices(services={}){
        const systemPosition=system=>{check(this.#engineFrame?.starSystems.includes(system),'Actual registered intel star system required');const row=this.#routeSpace?.locations.find(l=>l.objectRef===system.objectRef);check(row?.classAlias==='Sstm'&&row.position,'Actual star-system hyperspace position required');return [row.position.x,row.position.y];};
        return {
            readIntelEntityPosition:object=>this.#intelEntityState(object).position,
            readIntelEntityLocation:object=>this.#intelEntityState(object).containingLocation,
            isIntelEntityInHyperspace:object=>this.#intelEntityState(object).containingLocation?.hyperspaceMode===true,
            readIntelSystemHyperPosition:systemPosition,
            readIntelEntityHyperPosition:object=>{const entity=this.#intelEntityState(object),location=entity.containingLocation;return location===null||location.hyperspaceMode?entity.position:systemPosition(location);},
            readIntelRelays:location=>{check(this.#engineFrame?.world.locations.includes(location),'Actual intel relay location required');return location.repository.contains.filter(object=>this.#intelEntityState(object).tags?.includes('comm_relay')===true);},
            isIntelRelayNonfunctional:object=>originalCampaignMemoryBoolean(originalEntityMemoryWithoutUpdate(this.#intelEntityState(object)),'$objectiveNonFunctional'),
            chooseIntelSystemRelay:count=>originalJavaNextInt(createOriginalJavaRandom(originalJavaNextLong(this.factionPersonFactoryState().random.newRandomSeeds)),count),...services,
        };
    }
    findNativeIntelCommRelay(observer,services={}){return this.#operation(()=>{check(this.#engineFrame,'Actual engine required');return findOriginalCommRelay(observer,this.#engineFrame,this.#nativeIntelSpatialServices(services));});}
    #nativeIntelServices(services={}){
        const base=item=>validateOriginalSupportedIntel(item),spatial=this.#nativeIntelSpatialServices(services),state=validateOriginalIntelManager(this.nativeIntelManagerState());
        const tutorial=()=>originalCampaignMemoryContains(originalEntityMemoryWithoutUpdate(this.#engineFrame),'$tutorialRespawn');
        return {
            isIntelEnded:item=>originalIntelEnded(base(item)),setIntelTimestamp:(item,timestamp)=>{base(item).timestamp=timestamp;},
            reportIntelMadeVisible:item=>{base(item);},reportIntelRemoved:item=>{base(item);},notifyIntelScreenOpening:item=>{base(item);},
            shouldRemoveIntel:item=>isOriginalProductionReportIntel(base(item))?originalProductionReportShouldRemove(item,t=>this.#nativeClock().elapsedDaysSince(Number(t)),String(this.#nativeClock().snapshot().timestamp)):originalIntelShouldRemove(item),autoAddIntelCampaignMessage:item=>!originalIntelHidden(base(item),tutorial()),
            forceAddIntelNextFrame:item=>base(item).forceAdd!==null,setIntelForceAddNextFrame:(item,value)=>setOriginalIntelForceAdd(base(item),value),
            isPlayerInIntelRelayRange:player=>findOriginalCommRelay(player,this.#engineFrame,spatial)!==null,
            canMakeIntelVisible:(item,inRelay)=>{const player=services.readIntelPlayerFleet?services.readIntelPlayerFleet():this.playerEconomyState().fleet;check(player,'Actual intel player fleet required');return originalBaseIntelCanMakeVisible(base(item),inRelay,{location:spatial.readIntelEntityLocation(player),hyperPosition:spatial.readIntelEntityHyperPosition(player),commSniffer:false},spatial);},
            createNewMessagesIntel:num=>{const id=state.nextSummaryIdentity;state.nextSummaryIdentity=String(BigInt(id)+1n);return createOriginalNewMessagesIntel('native-intel-summary:'+id,num);},
            addIntelCampaignMessage:(item,target)=>{enqueueOriginalIntelMessageIntent(state,item,target);},...services,
            readIntelClockTimestamp:()=>String(this.#nativeClock().snapshot().timestamp),
        };
    }
    /** Register a real report, retaining the delivered batch objects and the real market. */
    addNativeProductionReportIntel(delivery,services={}){return this.#operation(()=>{
        const manager=validateOriginalIntelManager(this.nativeIntelManagerState());
        // Share the existing persisted intel identity serial; never reset it on checkpoint load.
        const serial=manager.nextSummaryIdentity;manager.nextSummaryIdentity=String(BigInt(serial)+1n);
        const item=createOriginalProductionReportIntel('native-intel-production:'+serial,delivery);
        check(this.#markets.get(item.gatheringPoint.marketId)===item.gatheringPoint,'Actual production report market required');
        this.addNativeIntel(item,false,null,services);return item;
    });}
    queueNativeIntel(item,delay){return this.#operation(()=>{queueOriginalIntel(validateOriginalIntelManager(this.nativeIntelManagerState()),item,delay);this.#validateIntelManager();});}
    unqueueNativeIntel(item){return this.#operation(()=>unqueueOriginalIntel(validateOriginalIntelManager(this.nativeIntelManagerState()),item));}
    addNativeIntel(item,silent=false,textPanel=null,services={}){return this.#operation(()=>{addOriginalIntel(validateOriginalIntelManager(this.nativeIntelManagerState()),item,silent,textPanel,this.#nativeIntelServices(services));this.#validateIntelManager();});}
    removeNativeIntel(item,services={}){return this.#operation(()=>removeOriginalIntel(validateOriginalIntelManager(this.nativeIntelManagerState()),item,this.#nativeIntelServices(services)));}
    clearNativeIntel(){return this.#operation(()=>clearOriginalIntelManager(validateOriginalIntelManager(this.nativeIntelManagerState())));}
    notifyNativeIntelScreenOpening(services={}){return this.#operation(()=>notifyOriginalIntelScreenOpening(validateOriginalIntelManager(this.nativeIntelManagerState()),this.#nativeIntelServices(services)));}
    removeNativeExpiredIntel(services={}){return this.#operation(()=>removeOriginalExpiredIntel(validateOriginalIntelManager(this.nativeIntelManagerState()),this.#nativeIntelServices(services)));}
    advanceNativeIntelManager(seconds,context,services={}){return this.#operation(()=>{
        const draft=this,state=validateOriginalIntelManager(this.nativeIntelManagerState());this.#validateIntelManager();check(!this.#intelManagerActive,'Reentrant intel manager frame');this.#intelManagerActive=true;
        try{advanceOriginalIntelManager(state,seconds,{get paused(){return context.paused;},get playerFleet(){return services.readIntelPlayerFleet?services.readIntelPlayerFleet():draft.playerEconomyState().fleet;}},this.#nativeIntelServices(services));this.#validateIntelManager();}finally{this.#intelManagerActive=false;}
    });}
    /** addIntel does not register a script in the stock engine; registration remains explicit. */
    addNativeBaseIntelScript(item,transient=false){return this.#operation(()=>{check(this.#engineFrame&&typeof transient==='boolean','Actual engine script list required');validateOriginalSupportedIntel(item);(transient?this.#engineFrame.transientScripts:this.#engineFrame.scripts).push(item);this.#validateIntelManager();});}
    endNativeBaseIntel(item,days=3,services={}){return this.#operation(()=>endOriginalBaseIntel(validateOriginalSupportedIntel(item),days,services));}
    advanceNativeBaseIntelScript(item,seconds,services={}){return this.#operation(()=>advanceOriginalBaseIntel(validateOriginalSupportedIntel(item),seconds,{...services,convertIntelSecondsToDays:dt=>this.#nativeClock().convertToDays(dt)}));}
    #nativeEntityIndex(){check(this.#engineFrame,'Actual engine required for entity lookup');if(this.#engineEntityIndex===null)this.#engineEntityIndex=new OriginalCampaignEntityIndex(this.#engineFrame,location=>this.nativeLocationFrameState(location.objectRef));return this.#engineEntityIndex;}
    /** Native internal lookup, not a disclosure-safe player endpoint. */
    nativeEntityById(id){return this.#operation(()=>this.#nativeEntityIndex().get(id));}
    nativeLocationEntityById(locationRef,id){return this.#operation(()=>this.#nativeEntityIndex().getInLocation(originalFleetWorldLocation(this.#requiredFleetWorld(),locationRef),id));}
    readdNativeEngineChangeListeners(){return this.#operation(()=>this.#nativeEntityIndex().readdChangeListeners());}
    removeNativeStarSystem(locationRef){return this.#operation(()=>this.#nativeEntityIndex().removeStarSystem(originalFleetWorldLocation(this.#requiredFleetWorld(),locationRef)));}
    updateNativePlayerSpeedBonus(services={}){return this.#operation(()=>{const player=this.playerEconomyState().fleet;check(player?.campaign&&player.isPlayerFleet===true&&this.#fleetForDataRef(player.dataRef)===player,'Actual constructed native player required');updateOriginalFleetOvercapacitySpeed(player,this.#nativeFleetServices(services));});}
    nativeUIDataFrameState(){check(!this.#failed,'Failed shared draft must be discarded');return this.#engineFrame?.uiDataFrame??null;}
    bindNativeUIDataFrame(state){return this.#operation(()=>{check(this.#engineFrame,'Actual engine required for UI data');check(this.nativeUIDataFrameState()===null||this.nativeUIDataFrameState()===state,'Cannot replace live UI data advance state');this.#engineFrame.uiDataFrame=validateOriginalCampaignUIDataFrame(state);return state;});}
    suppressNativeMusic(level){return this.#operation(()=>suppressOriginalCampaignMusic(validateOriginalCampaignUIDataFrame(this.nativeUIDataFrameState()),level));}
    advanceNativeUIDataFrame(seconds,context,services={}){return this.#operation(()=>advanceOriginalCampaignUIDataFrame(validateOriginalCampaignUIDataFrame(this.nativeUIDataFrameState()),seconds,context,{
        randomDouble:()=>originalJavaNextDouble(this.factionPersonFactoryState().random.mathRandom),...services,convertUISecondsToDays:dt=>this.#nativeClock().convertToDays(dt),
    }));}
    nativeAnimationManagerState(){check(!this.#failed,'Failed shared draft must be discarded');return this.#engineFrame?.animationManager??null;}
    bindNativeAnimationManager(state){return this.#operation(()=>{check(this.#engineFrame,'Actual engine required for animation history');check(!Object.hasOwn(this.#engineFrame,'animationManager')||this.#engineFrame.animationManager===state,'Cannot replace live animation history');validateOriginalAnimationManager(state);this.#engineFrame.animationManager=state;return state;});}
    addNativeAnimation(animation){return this.#operation(()=>addOriginalAnimation(this.nativeAnimationManagerState(),animation));}
    removeNativeAnimation(animation){return this.#operation(()=>removeOriginalAnimation(this.nativeAnimationManagerState(),animation));}
    advanceNativeAnimations(seconds,services={}){return this.#operation(()=>{check(!this.#animationsActive,'Reentrant native AnimationManager');this.#animationsActive=true;try{return advanceOriginalAnimationManager(this.nativeAnimationManagerState(),seconds,services);}finally{this.#animationsActive=false;}});}
    #nativePingServices(services={}){check(this.#engineFrame,'Actual engine required for pings');return {...services,addPingIndicator:indicator=>this.#engineFrame.pings.push(indicator)};}
    /** Initial sound intents must be committed by the caller, just like other rule results. No external playback. */
    addNativeCampaignPing(entity,options,services={}){return this.#operation(()=>{check(this.#engineFrame&&typeof this.inNewGameAdvance==='boolean','Actual engine/new-game state required');if(this.inNewGameAdvance)return null;const result=createOriginalPingScript(entity,options,{currentLocation:this.#engineFrame.currentLocation},this.#nativePingServices(services));this.#engineFrame.scripts.push(result.script);return result;});}
    advanceNativePingScript(script,seconds,services={}){return this.#operation(()=>{check(this.#engineFrame&&[...this.#engineFrame.scripts,...this.#engineFrame.transientScripts].includes(script),'Actual registered PingScript required');const effects=advanceOriginalPingScript(script,seconds,{currentLocation:this.#engineFrame.currentLocation},this.#nativePingServices(services));const location=script.entity.campaign?.entity?.containingLocation??script.entity.entity?.containingLocation;return {effects:effects.map(effect=>({entity:script.entity,location,playerFleet:this.playerEconomyState().fleet,effect}))};});}
    nativeEngineFrameState(){check(!this.#failed,'Failed shared draft must be discarded');return this.#engineFrame;}
    bindNativeEngineFrame(state){return this.#operation(()=>{check(this.#engineFrame===null||this.#engineFrame===state,'Cannot replace a live engine frame state');validateOriginalCampaignEngineState(state,state.world);check(!this.#fleetServices?.fleetWorld||this.#fleetServices.fleetWorld===state.world,'Engine/world identities differ');this.#engineFrame=state;this.#validateImportantPeople();this.#validateIntelManager();this.#validateCampaignEventManager();return state;});}
    /** Complete Engine dispatch, NOT a replacement for the required complete BaseLocation/manager services. */
    advanceNativeEngineFrame(seconds,context,options={}){return this.#operation(()=>{
        check(this.#engineFrame&&!this.#engineFrameActive,'Actual non-reentrant engine frame state required');validateOriginalCampaignEngineState(this.#engineFrame,this.#engineFrame.world);
        check(options&&Object.keys(options).every(k=>['economy','services','viewport','locationServices','factionServices','importantPeopleServices','characterMemoryServices','intelServices','eventServices','uiDataServices','marketServices','animationServices','pingServices'].includes(k)),'Known engine frame dependencies required');
        check(options.viewport===undefined||options.locationServices?.readFleetViewport===undefined,'Choose actual viewport data or viewport service, not both');
        const locationServices=options.viewport===undefined?options.locationServices:{...options.locationServices,readFleetViewport:()=>options.viewport};
        this.#engineFrameActive=true;
        const draft=this,locationContext=input=>({get currentLocation(){return draft.#engineFrame.currentLocation;},get paused(){return context.paused;},get fastAdvance(){return context.fastAdvance;},get isFastForwardIteration(){check(typeof context.isFastForwardIteration==='boolean','Actual independent fast-forward iteration flag required');return context.isFastForwardIteration;},input});
        try{return advanceOriginalCampaignEngine(this.#engineFrame,seconds,context,{
            readdChangeListeners:()=>this.readdNativeEngineChangeListeners(),rebuildIDToEntityMap:()=>this.#nativeEntityIndex().rebuildEngine(),
            removeStarSystem:location=>this.#nativeEntityIndex().removeStarSystem(location),
            updatePlayerSpeedBonus:player=>{check(player===this.playerEconomyState().fleet,'Engine player context differs from the native player');this.updateNativePlayerSpeedBonus(locationServices);},
            advanceLocationEvenIfPaused:(location,dt,input)=>this.advanceNativeLocationEvenIfPaused(location.objectRef,dt,locationContext(input),locationServices),
            advanceLocation:(location,dt,input)=>this.advanceNativeLocationFrame(location.objectRef,dt,locationContext(input),locationServices),
            advanceEventManager:dt=>this.advanceNativeCampaignEventManager(dt,context,options.eventServices),
            advanceIntelManager:dt=>this.advanceNativeIntelManager(dt,context,options.intelServices),
            advanceUIData:dt=>this.advanceNativeUIDataFrame(dt,context,options.uiDataServices),
            advanceMarketConditionsWhenPaused:dt=>this.advanceNativePausedMarketConditions(dt,{skipMarketAdvance:context.skipMarketAdvance},options.marketServices),
            advanceAnimations:dt=>this.advanceNativeAnimations(dt,options.animationServices),
            advancePing:(ping,dt)=>advanceOriginalActionIndicator(ping,dt),canCleanUpPing:ping=>originalActionIndicatorCanCleanUp(ping),
            isEngineScriptDone:script=>script.scope==='native-campaign-ping-script'?originalPingScriptIsDone(script):originalIntelEnded(validateOriginalSupportedIntel(script)),engineScriptRunsWhilePaused:script=>{if(script.scope!=='native-campaign-ping-script')validateOriginalSupportedIntel(script);return false;},advanceEngineScript:(script,dt)=>script.scope==='native-campaign-ping-script'?this.advanceNativePingScript(script,dt,options.pingServices):this.advanceNativeBaseIntelScript(script,dt,options.intelServices),
            advanceImportantPeople:dt=>this.advanceNativeImportantPeople(dt,context,options.importantPeopleServices),
            advanceCharacterMemory:dt=>this.advanceNativeCharacterMemory(dt,context,options.characterMemoryServices),
            advanceListenersWithTimeout:days=>this.advanceNativeCampaignListenerTimeouts(days),
            readAllFactions:()=>[...this.#requiredFactionRelations().factions],
            advanceFaction:(faction,dt)=>{check(this.#nativeFaction(faction.factionId)===faction,'Engine must advance the actual registered Faction');this.advanceNativeFactionFrame(faction.factionId,dt,context,options.factionServices);},...options.services,
            convertToDays:dt=>this.#nativeClock().convertToDays(dt),advanceClock:dt=>this.#nativeClock().advance(dt),
            advanceEngineMemory:(memory,dt)=>advanceOriginalCampaignMemory(memory,this.#nativeClock().convertToDays(dt),{paused:context.paused}),
            advanceEconomyBeforeClock:dt=>this.#advanceNativeEconomyBeforeClock(dt,options.economy??{settlement:{}}),
        });}finally{this.#engineFrameActive=false;}
    });}
    /** Compatibility economic-only frame: never allowed alongside the engine-owned clock. */
    advanceNativeScheduledFrame(amountSeconds,options){return this.#operation(()=>{
        check(this.#engineFrame===null,'Engine scheduler owns clock advancement once bound');const economy=this.#advanceNativeEconomyBeforeClock(amountSeconds,options);
        const clockAndRetail=this.#advanceNativeClockAndOpenRetail(amountSeconds);return immutableJSON({...economy,scope:'native-scheduled-economy-clock-and-open-timers-only',clockAndRetail});
    });}
    /** Same actual economic task/notification implementation, deliberately BEFORE Engine clock advancement. */
    #advanceNativeEconomyBeforeClock(amountSeconds,options) {
        return this.#operation(()=>{
            check(!this.#nativeFrameActive,'Reentrant natural economy frame');
            check(options&&Object.keys(options).every(k=>['notifications','settlement','readMaxOutposts','nowSeconds'].includes(k)),'Explicit natural economy frame dependencies required');
            check(Object.hasOwn(options,'notifications')!==Object.hasOwn(options,'settlement'),'Actual monthly/tick notification runtime required: choose actual receivers or an explicit external adapter, not both');
            const mode=Object.hasOwn(options,'settlement')?'native-receivers':'external-adapter';
            check(this.#notificationMode===null||this.#notificationMode===mode,'Cannot switch notification ownership after natural frames; prior economic events may already be settled');
            const notifications=mode==='native-receivers'?this.#receivers().callbacks(this.#settlementRuntime(options.settlement)):options.notifications;
            const callbacks=['reportSectorEconomyTick','reportManagedEconomyTick','reportSectorEconomyMonthEnd','reportManagedEconomyMonthEnd'];
            for(const name of callbacks)check(typeof notifications?.[name]==='function','Actual monthly/tick notification runtime required: '+name);
            check(this.#loaded.size===this.#markets.size,'Initial economic load must finish before natural frames');
            const schedule=this.nativeEconomySchedule(),frame=this.#nativeClock().calendarFrame(amountSeconds);
            if(schedule.phase==='WAITING')check(!this.#economyPass||this.#economyPass.status().phase==='done','Manual economic pass must finish before natural scheduling');
            else check(this.#economyPass,'Missing natural task pass');
            this.#notificationMode=mode;this.#nativeFrameActive=true;let taskFrame=null;
            try {
                const result=advanceOriginalEconomyScheduleWithRuntime(schedule,frame,{
                    setScheduleState:state=>{this.#nativeSchedule=state;},
                    beginEconomyPass:lastIteration=>this.beginScheduledEconomyPass({lastIteration,paused:false},options.readMaxOutposts,scheduledEntryToken),
                    advanceTask:task=>{taskFrame=this.#economyPass.advanceTask(task,{nowSeconds:options.nowSeconds});return taskFrame.complete;},
                    ...Object.fromEntries(callbacks.map(name=>[name,(...args)=>notifications[name](...args)])),
                });
                return immutableJSON({scope:'native-scheduled-economy-before-clock',notificationMode:mode,schedule:result.state,events:result.events,taskFrame,economyFrame:frame,readyForAuthority:false});
            } finally {this.#nativeFrameActive=false;}
        });
    }
    advanceNativeClockAndOpenRetail(amountSeconds) {
        return this.#operation(()=>{
            check(this.#engineFrame===null,'Engine scheduler owns clock advancement once bound');check(this.#nativeSchedule===null,'Natural scheduler owns clock and retail advancement once enabled');
            return this.#advanceNativeClockAndOpenRetail(amountSeconds);
        });
    }
    /** Clock + open-resource timers only; NOT the complete engine/economy/market advance. */
    #advanceNativeClockAndOpenRetail(amountSeconds) {
        return this.#operation(()=>{
            const clock=this.#nativeClock(),economyFrame=clock.calendarFrame(amountSeconds);let marketsAdvanced=0;
            for(const m of this.#markets.values()){
                check(m.retail&&m.retail.unresolved.length===0,'Actual submarket roster required for timer advancement');
                if(!m.retail.submarkets.some(row=>row.specId==='open_market'))continue;
                const {sub}=this.#openRetail(m.marketId);
                sub.timers.sinceLastCargoUpdate=originalRetailFloat(f(sub.timers.sinceLastCargoUpdate+economyFrame.amountDays),'advanced resource timer');
                sub.timers.sinceSWUpdate=originalRetailFloat(f(sub.timers.sinceSWUpdate+economyFrame.amountDays),'advanced ship/weapon timer');marketsAdvanced++;
            }
            const frame=clock.advance(amountSeconds);
            return immutableJSON({scope:'native-clock-and-open-resource-timers-only',economyFrame,frame,marketsAdvanced,readyForAuthority:false});
        });
    }
    nativeMarketFrameState(marketId){return this.market(marketId).nativeFrame??null;}
    #validateNativeMarketFrames(){
        for(const m of this.#markets.values())if(m.resourceLifecycle){const state=validateOriginalResourceLifecycle(m);if(state.memory!==null)check(m.nativeFrame?.memory===state.memory,'Lost shared resource market Memory identity');}
        for(const m of this.#markets.values())if(m.civicLifecycle){const state=validateOriginalCivicLifecycle(m);if(state.memory!==null)check(m.nativeFrame?.memory===state.memory,'Lost shared civic market Memory identity');}
        for(const m of this.#markets.values())if(m.productionLifecycle){const state=validateOriginalProductionLifecycle(m);if(state.memory!==null)check(m.nativeFrame?.memory===state.memory,'Lost shared production market Memory identity');}
        const boundMemories=new Map();
        for(const m of this.#markets.values())if(m.military?.memory.scope==='native-memory-flag-view'){
            const view=validateOriginalMemoryFlags(m.military.memory),previous=boundMemories.get(view.memory);
            check(!previous||previous===view,'Different captured Memory identities cannot share a complete Memory');boundMemories.set(view.memory,view);
            if(Object.hasOwn(m,'nativeFrame'))check(m.nativeFrame?.memory===view.memory,'Lost shared market/military Memory identity');
        }
        for(const [memory,view]of boundMemories)check([...this.#markets.values()].some(m=>m.military?.memory===view&&m.nativeFrame?.memory===memory),'Bound military view needs its actual market Memory owner');
        for(const m of this.#markets.values())if(Object.hasOwn(m,'nativeFrame')){
            const frame=validateOriginalMarketFrame(m.nativeFrame,m);check(m.retail&&m.retail.unresolved.length===0,'Actual complete market submarket roster required');
            const actual=[...m.retail.submarkets,...m.retail.otherSubmarkets];check(frame.submarkets.length===actual.length&&frame.submarkets.every(sub=>actual.includes(sub)),'Lost complete shared market submarket roster');
            validateOriginalTemporaryStat(m.stability,m.stabilityTemporary);for(const c of Object.values(m.commodities))for(const key of ['available','tradeMod','tradeModPlus','tradeModMinus'])validateOriginalTemporaryStat(c[key],c.temporary[key]);
        }
    }
    bindNativeMarketFrame(marketId,state){return this.#operation(()=>{
        const m=this.market(marketId);check(!Object.hasOwn(m,'nativeFrame')||m.nativeFrame===state,'Cannot replace a live market frame');validateOriginalMarketFrame(state,m);
        if(m.military&&state.memory!==null){
            for(const other of this.#markets.values())if(other!==m&&other.military?.memory===m.military.memory&&Object.hasOwn(other,'nativeFrame'))check(other.nativeFrame?.memory===state.memory,'Lost shared market/military Memory identity');
            bindOriginalMemoryFlags(m.military.memory,state.memory);
        }
        if(m.productionLifecycle&&state.memory!==null)bindOriginalProductionMemory(m,state.memory);
        if(m.civicLifecycle&&state.memory!==null)bindOriginalCivicMemory(m,state.memory);
        if(m.resourceLifecycle&&state.memory!==null)bindOriginalResourceMemory(m,state.memory);
        m.nativeFrame=state;this.#validateNativeMarketFrames();return state;
    });}
    #assertNativeMarketMemory(m,frame){
        if(m.industries.some(e=>hasOriginalResourceFrame(e.state.industryId)))check(frame.memory!==null&&m.resourceLifecycle?.memory===frame.memory,'Resource frames require their complete bound market Memory');
        if(m.industries.some(e=>hasOriginalCivicFrame(e.state.industryId)))check(frame.memory!==null&&m.civicLifecycle?.memory===frame.memory,'Civic frames require their complete bound market Memory');
        if(m.industries.some(e=>Object.hasOwn(ORIGINAL_PRODUCTION_INDUSTRIES.industries,e.state.industryId)))check(frame.memory!==null&&m.productionLifecycle?.memory===frame.memory,'Production frames require their complete bound market Memory');
        const military=m.industries.some(e=>Object.hasOwn(ORIGINAL_MILITARY_BASES.industries,e.state.industryId));
        check(!military||m.military,'Actual military market Memory required');
        if(!m.military)return;
        const flags=validateOriginalMemoryFlags(m.military.memory);
        if(frame.memory!==null)check(flags.scope==='native-memory-flag-view'&&flags.memory===frame.memory,'Full market Memory must be bound to its military flag view before advancement');
        else check(!military&&flags.scope==='native-memory-flag-closure'&&['data','expires','requirements','requiredFor'].every(key=>flags[key].length===0),'Null market Memory cannot bypass known military memory state');
    }
    #nativeMarketServices(services={}){
        const base={
            readConditions:m=>m.conditions.map(condition=>({condition,objectRef:m.conditionObjectRefs[condition.modId],pluginState:m.conditionContextByModId[condition.modId]})),
            conditionRunsWhilePaused:originalMarketConditionRunsWhilePaused,
            advanceCondition:(m,binding,dt)=>{check(this.#loaded.has(m.marketId),'Initial market economic load required for condition advancement');advanceOriginalMarketCondition(m,binding,dt,this.#nativeClock().convertToDays(dt),bound);},
            removeSpecificCondition:(m,binding)=>{const c=m.conditions.find(c=>c.modId===binding.condition.modId);if(!c)return;check(m.conditionObjectRefs[c.modId]===binding.objectRef,'Lost current condition plugin identity');this.#conditionCallback(m,c.modId,'unapply');m.conditions=m.conditions.filter(row=>row.modId!==c.modId);delete m.conditionContextByModId[c.modId];delete m.conditionObjectRefs[c.modId];},
            reapplyConditions:m=>{this.#reapplyCurrentConditions(m.marketId);},reapplyIndustries:m=>{this.#applyGovernedAndIndustries(m.marketId,services.readMaxOutposts);},
            advanceSubmarket:(m,sub,dt)=>{check(m.retail.submarkets.includes(sub)&&sub.specId==='open_market'&&sub.pluginRef&&sub.unresolved.length===0,'Actual submarket plugin advance required');const days=this.#nativeClock().convertToDays(dt);for(const key of ['sinceLastCargoUpdate','sinceSWUpdate']){originalRetailFloat(sub.timers[key],key);sub.timers[key]=originalRetailFloat(f(sub.timers[key]+days),key);}},
            advanceMarketMemory:(m,memory,dt)=>{this.#assertNativeMarketMemory(m,m.nativeFrame);check(memory===m.nativeFrame.memory,'Lost current market Memory');advanceOriginalCampaignMemory(memory,this.#nativeClock().convertToDays(dt),{paused:false},this.#nativeMarketMemoryServices(services.marketMemoryServices));for(const other of this.#markets.values())if(other.industryLifecycle&&other.military?.memory.scope==='native-memory-flag-view'&&other.military.memory.memory===memory)syncOriginalMilitaryDisruption(other);for(const other of this.#markets.values())if(other.productionLifecycle?.memory===memory)syncOriginalProductionDisruption(other,this.#nativeMarketMemoryServices(services.marketMemoryServices));for(const other of this.#markets.values())if(other.civicLifecycle?.memory===memory)syncOriginalCivicDisruption(other,this.#nativeMarketMemoryServices(services.marketMemoryServices));for(const other of this.#markets.values())if(other.resourceLifecycle?.memory===memory)syncOriginalResourceDisruption(other,this.#nativeMarketMemoryServices(services.marketMemoryServices));},
            readMarketPeople:m=>{check(m.personnel&&Object.hasOwn(m.personnel,'peopleRefs'),'Actual market people roster required');return m.personnel.peopleRefs;},
            advanceMarketPerson:(person,dt)=>advanceOriginalPerson(typeof person==='string'?originalPersonnelByRef(this.playerEconomyState(),person):person,dt,this.#nativeClock().convertToDays(dt),{paused:false},services.personMemoryServices),
            readCurrentlyBeingConstructed:m=>m.industries.find(i=>{const spec=ORIGINAL_MILITARY_BASES.industrySpecs[i.state.industryId];check(spec,'Actual industry construction tags required');return !spec.tags.includes('population')&&i.operating.building&&i.operating.upgradeId===null;})??null,
            buildNextInQueue:m=>{this.#buildNextConstructionQueue(m,{militaryServices:services.militaryServices,productionServices:services.productionServices??{memoryServices:services.marketMemoryServices},civicServices:services.civicServices??{memoryServices:services.marketMemoryServices},resourceServices:services.resourceServices??{memoryServices:services.marketMemoryServices}});},
            advanceIndustry:(m,industry,dt)=>{if(hasOriginalResourceFrame(industry.state.industryId)){this.#advanceResourceEntry(m,industry,dt,services.resourceServices??{memoryServices:services.marketMemoryServices});return;}if(hasOriginalCivicFrame(industry.state.industryId)){this.#advanceCivicEntry(m,industry,dt,services.civicServices??{memoryServices:services.marketMemoryServices});return;}if(Object.hasOwn(ORIGINAL_PRODUCTION_INDUSTRIES.industries,industry.state.industryId)){this.#advanceProductionEntry(m,industry,dt,services.productionServices??{memoryServices:services.marketMemoryServices});return;}check(m.industries.includes(industry)||m.industryLifecycle?.industries.some(row=>row.entry===industry),'Lost actual industry instance');check(m.industryLifecycle?.industries.some(row=>row.active&&row.entry===industry),'Industry requires its actual complete advance implementation');this.advanceMilitaryIndustry(m.marketId,industry.state.industryId,dt,services.militaryServices);},
        };const bound={...base,...services};return bound;
    }
    advanceNativePausedMarketConditions(seconds,{skipMarketAdvance},services={}){return this.#operation(()=>{check(!this.#pausedMarketsActive,'Reentrant paused market conditions');this.#pausedMarketsActive=true;try{advanceOriginalPausedMarketConditions([...this.#markets.values()],seconds,skipMarketAdvance,this.#nativeMarketServices(services));}finally{this.#pausedMarketsActive=false;}});}
    advanceNativeMarketFrame(marketId,seconds,services={}){return this.#operation(()=>{const m=this.market(marketId);check(this.#loaded.has(marketId),'Initial market economic load required for natural advancement');check(!this.#marketFramesActive.has(m),'Reentrant market frame');this.#validateNativeMarketFrames();const frame=validateOriginalMarketFrame(this.nativeMarketFrameState(marketId),m);this.#assertNativeMarketMemory(m,frame);this.#marketFramesActive.add(m);try{advanceOriginalMarketFrame(m,frame,seconds,this.#nativeClock().convertToDays(seconds),this.#nativeMarketServices(services));this.#validateNativeMarketFrames();}finally{this.#marketFramesActive.delete(m);}});}
    #openRetail(marketId) {
        const m=this.market(marketId),capture=m.retail;
        check(this.#secondsPerDay===RETAIL_REFERENCE.settings.secondsPerDay,'Native retail clock conversion requires captured seconds per day');
        check(capture?.scope==='native-saved-open-resource-cargo'&&capture.unresolved.length===0,'Actual submarket roster required');
        const sub=capture.submarkets.find(row=>row.specId==='open_market');
        check(sub&&sub.unresolved.length===0&&sub.pluginRef&&sub.cargo,'Actual open market plugin, cargo and saved timers required');
        for(const key of ['sinceLastCargoUpdate','sinceSWUpdate','minSWUpdateInterval']) originalRetailFloat(sub.timers[key],key);
        return {m,sub};
    }
    /** Both BaseSubmarketPlugin counters advance; does not regenerate any cargo or advance the world. */
    advanceOpenMarketTimers(marketId,{ticks,ticksPerSecond}) {
        return this.#operation(()=>{
            check(!this.#clock,'A restored native clock must advance timers through its shared frame');
            const {sub}=this.#openRetail(marketId),timers=sub.timers;
            timers.sinceLastCargoUpdate=advanceOriginalRetailTimer(timers.sinceLastCargoUpdate,ticks,ticksPerSecond);
            timers.sinceSWUpdate=advanceOriginalRetailTimer(timers.sinceSWUpdate,ticks,ticksPerSecond);
            return immutableJSON(timers);
        });
    }
    /** Resource phase ONLY: no ship/weapon generation, final cargo.sort, admission or world publication. */
    refreshOpenMarketResources(marketId,options={}) {
        return this.#operation(()=>{
            check(options&&Object.keys(options).every(key=>key==='month'),'Only an optional offline replay month is accepted');
            const month=this.#gameMonth(options.month);
            const {m,sub}=this.#openRetail(marketId),cargo=sub.cargo;
            check(this.#loaded.has(marketId),'Local economic effects must run before resource refresh');
            check(cargo.unresolved.length===0,'Cargo owner/runtime dependencies remain unresolved');validateOriginalResourceCargo(cargo);
            const elapsed=sub.timers.sinceLastCargoUpdate,reports=[];
            const updateSpace=()=>{
                let used=0;
                for(const stack of cargo.slots) {
                    if(!stack||stack.type==='NULL')continue;
                    if(stack.type!=='RESOURCES'){cargo.spaceUsed=null;return;} // Saved non-resource plugin space is not a restored getter.
                    used=f(used+f(stack.cargoSpacePerUnit*stack.size));
                }
                cargo.spaceUsed=f(used+cargo.extraCargoUsed);
            };
            for(const c of Object.values(m.commodities)) {
                const spec=RETAIL_REFERENCE.commodities[c.commodityId];check(spec,'Unknown stocking commodity');
                if(spec.tags.includes('nonecon')||spec.tags.includes('meta'))continue;
                check(!spec.plugin,'Unsupported commodity stock plugin');
                const illegal=!m.freePort&&(m.factionIllegalCommodityIds.includes(c.commodityId)||m.factionIllegalCommodityIds.includes(spec.demandClass));
                // Original getBaseStockpileLimit reads shipping first; do not initialize unrelated commodity networks.
                const shipping=this.getShipping(marketId).global;
                const input={commodityId:c.commodityId,shippingGlobal:shipping,available:rounded(stat(c.available)),maxSupply:c.maxSupply,maxDemand:c.maxDemand};
                const limit=originalOpenMarketLimit(input,marketId,sub.specId,month,originalMarketStabilityValue(m.stability));
                const before=originalResourceQuantity(cargo,c.commodityId),change=planOriginalOpenResourceChange({current:before,limit,sinceLastCargoUpdate:elapsed,illegal});
                if(change.add>0)addOriginalResourceCargo(cargo,c.commodityId,change.add,updateSpace);
                if(change.remove>0)removeOriginalResourceCargo(cargo,c.commodityId,change.remove,updateSpace);
                const after=originalResourceQuantity(cargo,c.commodityId);reports.push({commodityId:c.commodityId,before,after,limit,delta:after-before});
            }
            sub.timers.sinceLastCargoUpdate=0;
            return immutableJSON({scope:'native-open-market-resource-phase-only',marketId,reports,
                sinceLastCargoUpdate:0,sinceSWUpdate:sub.timers.sinceSWUpdate,readyForAuthority:false});
        });
    }
    #classPriceRows(m,demandClass) {
        const shipping=this.getShipping(m.marketId);
        return Object.values(m.commodities).filter(c=>c.demand.demandClass===demandClass).map(c=>({
            commodityId:c.commodityId,maxSupply:c.maxSupply,maxDemand:c.maxDemand,available:rounded(stat(c.available)),
            availableWithoutTrade:f(stat(c.available)-(c.available.modifiers.flat.find(mod=>mod.id==='eMod')?.value ?? 0)),
            shippingGlobal:shipping.global,shippingFaction:shipping.inFaction,
            maxExportGlobal:this.peekCommodityData(m.marketId,c.commodityId)?.data.network.exports.maxExportGlobal ?? null,
            stockpile:c.stockpile,tradeMod:{both:stat(c.tradeMod),plus:stat(c.tradeModPlus),minus:stat(c.tradeModMinus)},
            greedStat:c.greed,playerModifiers:{native:{supply:c.playerSupplyMod,demand:c.playerDemandMod}},
        }));
    }
    #installBonus(target,source) {
        for(const channel of ['flat','percent','mult']) target[channel].splice(0,target[channel].length,...structuredClone(source[channel]));
    }
    #installPriceStats(m,demandClass,state) {
        const demand=m.demandClasses[demandClass].state;
        demand.base=state.demandStat.base;this.#installBonus(demand.modifiers,state.demandStat.modifiers);
        for(const row of state.commodities) {
            const c=m.commodities[row.commodityId];
            check(c.demand===m.demandClasses[demandClass],'Lost shared demand identity');
            c.greed.base=row.greedStat.base;this.#installBonus(c.greed.modifiers,row.greedStat.modifiers);
            this.#installBonus(c.playerDemandMod,row.playerModifiers.native.demand);
            this.#installBonus(c.playerSupplyMod,row.playerModifiers.native.supply);
        }
    }
    /** Actual class-wide price/storage phase. Not a per-tick refresh, retail cargo refill, or ready-to-trade certificate. */
    updateStockpileAndPrice(marketId, triggerCommodityId, options) {
        return this.#operation(()=>{
            const m=this.market(marketId),spec=ORIGINAL_MARKET_ECONOMY.commodities[triggerCommodityId];
            check(this.#loaded.has(marketId),'Local economic effects must run before price update');
            check(Object.hasOwn(ORIGINAL_MARKET_ECONOMY.commodities,triggerCommodityId)&&spec&&!spec.plugin&&!spec.tags.includes('nonecon'),'Economic commodity price trigger required');
            check(options&&Object.hasOwn(options,'phase')&&Object.keys(options).every(key=>['month','phase'].includes(key)),'Native stockpile phase and optional offline replay month required');
            const month=this.#gameMonth(options.month);
            const demandClass=spec.demandClass;
            const result=updateOriginalCommodityClassPricesWithRuntime({marketId,triggerCommodityId,month,phase:options.phase,
                coverage:'complete-demand-class',demandStat:m.demandClasses[demandClass].state,commodities:this.#classPriceRows(m,demandClass)},
                {readAfterPrimaryNetwork:state=>{
                    this.#installPriceStats(m,demandClass,state);
                    this.getCommodityData(marketId,demandClass);
                    return this.#classPriceRows(m,demandClass);
                }});
            this.#installPriceStats(m,demandClass,result);
            for(const row of result.commodities) {
                const c=m.commodities[row.commodityId];c.stockpile=row.stockpile;
                check(c.demandPrice&&c.supplyPrice,'Unsupported commodity price calculators');
                Object.assign(c.demandPrice,structuredClone(row.demandPrice));Object.assign(c.supplyPrice,structuredClone(row.supplyPrice));
                c.lastPriceUpdate={month,phase:options.phase,triggerCommodityId};
            }
            return result;
        });
    }
    /** Native updateIncomeAndUpkeep; no industry apply, port-deficit rewrite, or network initialization. */
    refreshIndustryFinances(marketId, industryId) {
        return this.#operation(() => this.#updateIndustryFinances(marketId,industryId,'income-refresh'));
    }
    #updateIndustryFinances(marketId,industryId,phase) {
            const m = this.market(marketId), i = m.industries.find(row => row.state.industryId === industryId), state = m.finances.find(row => row.industryId === industryId);
            check(i && state, 'Unknown live financial industry');
            const portInputs = phase === 'industry-apply' && ['spaceport','megaport'].includes(industryId)
                ? {demand:Object.fromEntries(['fuel','supplies','ships'].map(id=>[id,i.state.demand[id] ?? blank()])),available:Object.fromEntries(['fuel','supplies','ships'].map(id=>[id,rounded(stat(m.commodities[id].available))]))} : null;
            const result = updateOriginalIndustryFinances({ state, marketSize: m.size, phase,
                marketIncomeMult: stat(m.incomeMult), marketUpkeepMult: stat(m.upkeepMult), operating: i.operating,
                aiCoreId: i.modifiers.aiCoreId, specialItemId: i.modifiers.specialItemId, portInputs,
                ...(Object.hasOwn(ORIGINAL_SPECIAL_INDUSTRIES.industries, industryId) ? { specialContext: { factionId: m.factionId, conditionIds: m.conditions.map(c => c.id) } } : {}),
            });
            Object.assign(state, structuredClone(result.state));
            return result;
    }
    /** Trusted current route state; unknown fleet factories/AI are NOT replaced with marker fleets. */
    factionDoctrine(factionId){
        check(!this.#failed&&this.#fleetServices?.scope==='web-native-fleet-services','Actual faction doctrine capture required');const services=this.#fleetServices;
        if(services.doctrines===null)services.doctrines=restoreOriginalFactionDoctrines(services.doctrineCapture);
        const entry=services.doctrines.entries.find(e=>e.factionId===factionId);check(entry,'Unknown current faction doctrine');return entry.doctrine;
    }
    shipSelectionState(){
        check(!this.#failed&&this.#fleetServices,'Current fleet services required');const services=this.#fleetServices;
        if(services.shipSelection===null){check(services.shipSelectionCapture,'Current ship-selection inputs missing; old checkpoints cannot reconstruct these from history');if(services.doctrines===null)services.doctrines=restoreOriginalFactionDoctrines(services.doctrineCapture);services.shipSelection=restoreOriginalShipSelection(services.shipSelectionCapture,services.doctrines);}
        return services.shipSelection;
    }
    pickFleetShipsForRole(factionId,roleId,params,random=null,filter=null){return this.#operation(()=>pickOriginalShipRole(this.shipSelectionState(),factionId,roleId,params,random??this.#fleetServices.random.global,filter));}
    fleetShipRoleAvailability(factionId,roleId,mode){return this.#operation(()=>originalShipRoleAvailability(this.shipSelectionState(),factionId,roleId,mode));}
    clearFleetShipRoleCache(factionId){return this.#operation(()=>clearOriginalShipRoleCache(this.shipSelectionState(),factionId));}
    fleetMemberFactoryState(){check(!this.#failed&&this.#fleetServices?.memberFactory,'Current member factory missing; old checkpoints cannot reconstruct this from history');return this.#fleetServices.memberFactory;}
    createFleetMember(specId,type='SHIP',plugins={}){return this.#operation(()=>createOriginalFleetMember(this.fleetMemberFactoryState(),this.playerEconomyState(),specId,type,plugins));}
    pickFleetShipName(naming,member,random){return this.#operation(()=>pickOriginalFleetShipName(this.fleetMemberFactoryState(),naming,member,random));}
    bindFleetMemberConstruction(naming,plugins={}){const bound=originalFleetMemberConstructionServices(this.fleetMemberFactoryState(),this.playerEconomyState(),naming,plugins);return Object.fromEntries(Object.entries(bound).map(([key,fn])=>[key,(...args)=>this.#operation(()=>fn(...args))]));}
    factionPersonFactoryState(){check(!this.#failed&&this.#fleetServices?.personFactory,'Current faction person factory missing; old checkpoints cannot reconstruct this random state');return this.#fleetServices.personFactory;}
    createFactionPerson(factionId,options){return this.#operation(()=>createOriginalFactionPerson(this.factionPersonFactoryState(),this.playerEconomyState(),factionId,options));}
    pickFactionPersonName(factionId,gender,random=null){return this.#operation(()=>pickOriginalFactionPersonName(this.factionPersonFactoryState(),factionId,gender,random));}
    pickFactionVoice(factionId,importance,random=null){return this.#operation(()=>pickOriginalFactionVoice(this.factionPersonFactoryState(),factionId,importance,random));}
    fleetDataFactoryState(){check(!this.#failed&&this.#fleetServices?.dataFactory,'Current FleetData factory missing; old checkpoints cannot reconstruct these class objects');return this.#fleetServices.dataFactory;}
    initializeFleetDataClass(){return this.#operation(()=>initializeOriginalFleetDataClass(this.fleetDataFactoryState(),this.fleetMemberFactoryState(),this.playerEconomyState()));}
    bindFleetDataClass(nullMember,defaultCommander){return this.#operation(()=>bindOriginalFleetDataClass(this.fleetDataFactoryState(),nullMember,defaultCommander,this.playerEconomyState()));}
    createFleetData(prefix,sourceFactionId){return this.#operation(()=>createOriginalFleetData(this.fleetDataFactoryState(),this.fleetRosterState(),this.playerEconomyState(),prefix,sourceFactionId));}
    initializeNativeCargoMothballedShips(cargo,factionId){return this.#operation(()=>initializeOriginalCargoMothballedShips(cargo,factionId,{
        readMothballedFaction:id=>this.#nativeFaction(id),createMothballedFleetData:(prefix,id)=>this.createFleetData(prefix,id).fleet,
    }));}
    #towCableMembers(){return [...(this.#fleetServices?.memberFactory?.members??[]),...(this.#playerEconomy?.state?.fleet?.members??[]),...(this.#fleetServices?.rosters?.bindings??[]).flatMap(b=>b.fleet.members)];}
    fleetTowCableState(){check(!this.#failed,'Failed draft');return this.#fleetServices?.towCableState??null;}
    /** Bind the actual Sector persistent entry; never derive old history from target buffs. */
    bindFleetTowCableState(state){return this.#operation(()=>{
        check(this.#fleetServices&&Object.hasOwn(this.#fleetServices,'towCableState'),'Current fleet services required');
        check(this.#fleetServices.towCableState===null||this.#fleetServices.towCableState===state,'Cannot replace a live Sector tow-cable entry');
        this.#fleetServices.towCableState=validateOriginalTowCablePersistentEntry(state,this.#towCableMembers());return state;
    });}
    fleetWorldState(){check(!this.#failed,'Failed draft');return this.#fleetServices?.fleetWorld??null;}
    #validateFleetWorld(world){
        const fleets=(this.#fleetServices?.dataFactory?.fleets??[]).filter(f=>f.campaign);validateOriginalFleetWorld(world,fleets);
        for(const listener of [...(world.refitScreenListeners?.saved??[]),...(world.refitScreenListeners?.transient??[])])if(listener.kind==='hullmod-item-manager')validateOriginalHullmodItemManager(listener);
        for(const location of world.locations){
            const checkObject=object=>{if(isOriginalCargoPods(object)){check(location.repository.contains.includes(object),'Custom renderer must reference its actual registered entity');check(this.#fleetServices.dataFactory.fleets.includes(object.cargo.mothballedShips),'Lost actual custom Cargo mothballed FleetData');check(this.#requiredFactionRelations().factions.includes(object.faction),'Lost actual custom-entity faction');}else if(isOriginalCampaignPlanet(object)){validateOriginalCampaignPlanet(object);check(location.repository.contains.includes(object),'Planet renderer must reference its actual registered entity');if(object.entity.factionRef!=='native-static:NO_FACTION')this.#nativePlanetFaction(object);}else check(fleets.includes(object),'World fleet must be the actual constructed factory object');};
            for(const object of location.repository.contains)checkObject(object);
            for(const layer of location.renderer?.layers??[])for(const object of layer.values)checkObject(object.scope==='native-fleet-ability-renderer'?object.fleet:object);
        }
        for(const listener of [...world.managedFleetListeners.saved,...world.managedFleetListeners.transient,...fleets.flatMap(fleet=>fleet.campaign.despawnListeners??[])])if(listener.kind==='route-manager')check(listener.state===this.#patrols,'Lost shared RouteManager listener state');
        for(const row of this.#routeSpace?.entities??[])if(row.nativeFleet)check(fleets.includes(row.nativeFleet),'Lost shared route/world fleet identity');
        for(const row of this.#sensors?.fleets??[])if(row.fleet.campaign)check(fleets.includes(row.fleet),'Lost shared sensor/world fleet identity');
        return world;
    }
    /** Unknown old worlds stay null. This binds actual registries/listeners, not a guessed spatial closure. */
    bindFleetWorld(world){return this.#operation(()=>{check(!this.#engineFrame||this.#engineFrame.world===world,'Engine/world identities differ');check(this.#fleetServices&&Object.hasOwn(this.#fleetServices,'fleetWorld'),'Current fleet services required');check(this.#fleetServices.fleetWorld===null||this.#fleetServices.fleetWorld===world,'Cannot replace a live world graph');this.#fleetServices.fleetWorld=this.#validateFleetWorld(world);return world;});}
    bindDetectedEntityListeners(listeners){return this.#operation(()=>{const world=this.#requiredFleetWorld();check(world.detectedEntityListeners===null||world.detectedEntityListeners===listeners,'Cannot replace a live detected-entity listener roster');world.detectedEntityListeners=listeners;this.#validateFleetWorld(world);return listeners;});}
    #worldBinding(dataRef){const binding=this.fleetRosterState().bindings.find(b=>b.fleet.dataRef===dataRef);check(binding?.fleet.campaign,'Actual constructed fleet binding required');return binding;}
    #requiredFleetWorld(){const world=this.fleetWorldState();check(world,'Actual world registration/listener graph required');return world;}
    bindCargoScreenListeners(listeners){return this.#operation(()=>{const world=this.#requiredFleetWorld();check(world.cargoScreenListeners===null||world.cargoScreenListeners===listeners,'Cannot replace a live CargoScreenListener roster');world.cargoScreenListeners=listeners;this.#validateFleetWorld(world);return listeners;});}
    /** Low-level CampaignPlanet constructor + BaseLocation.addEntity, not StarSystem.addPlanet. */
    addNativePlanet(locationRef,input,services={}){return this.#operation(()=>{
        const world=this.#requiredFleetWorld(),location=originalFleetWorldLocation(world,locationRef),player=this.playerEconomyState();
        if(input.lightSource!==null)check(this.#nativeWorldEntity(input.lightSource.objectRef)===input.lightSource,'Actual registered planet light source required');
        if(!Object.hasOwn(world,'planetSerial')){check(!world.locations.some(l=>l.repository.contains.some(isOriginalCampaignPlanet)),'Missing existing planet identity allocator');world.planetSerial=0;}
        check(Number.isSafeInteger(world.planetSerial)&&world.planetSerial>=0&&world.planetSerial<Number.MAX_SAFE_INTEGER,'Actual Web planet identity allocator required');
        const id=input.id===null?nextOriginalNativeUID(player):input.id,planet=createOriginalCampaignPlanet('created-campaign-planet:'+world.sectorRef+':'+(++world.planetSerial),{...input,id},{resources:initializeOriginalCampaignResources(this.fleetDataFactoryState()),mathRandom:this.factionPersonFactoryState().random.mathRandom,...(services.readPlanetSpec?{readPlanetSpec:services.readPlanetSpec}:{})});
        addOriginalPlanetToLocation(world,location,planet,this.#nativeRegistryServices(services));this.#validateFleetWorld(world);return planet;
    });}
    #requirePlanet(planet){check(isOriginalCampaignPlanet(planet)&&this.#nativeWorldEntity(planet.objectRef)===planet,'Actual registered planet from this runtime required');return planet;}
    #nativePlanetFaction(planet){const faction=this.#requiredFactionRelations().factions.find(f=>f.objectRef===planet.entity.factionRef);check(faction,'Actual planet faction required; NO_FACTION is not a neutral faction substitute');return faction;}
    planetFactionId(planet){this.#requirePlanet(planet);return planet.entity.factionRef==='native-static:NO_FACTION'?'neutral':this.#nativePlanetFaction(planet).factionId;}
    planetVisibilityForPlayerObserver(planet,observerDataRef){
        check(!this.#failed,'Failed shared draft must be discarded');this.#requirePlanet(planet);const observer=this.#fleetForDataRef(observerDataRef);
        check(this.#sensors?.unresolved.length===0&&this.#sensors.fleets.find(row=>row.objectRef===observer.objectRef)?.fleet===observer,'Actual observer sensor binding required');
        check(originalRouteEntity(this.#routeSpace,observer.objectRef).nativeFleet===observer,'Actual observer spatial binding required');
        return originalSensorVisibility(originalFleetSensorEntity(this.#sensors,validateOriginalRouteSpace(this.#routeSpace),observer.objectRef,undefined,observer.objectRef),originalCampaignPlanetSensorEntity(planet),{sensorsOn:this.#sensors.sensorsOn,difficulty:this.#sensors.difficulty,hyperspaceRef:this.#routeSpace.hyperspaceRef});
    }
    planetVisibilityToPlayer(planet){this.#requirePlanet(planet);const player=this.playerEconomyState().fleet;return player===null?'NONE':this.planetVisibilityForPlayerObserver(planet,player.dataRef);}
    advanceNativePlanetFrame(planet,seconds,context,services={}){return this.#operation(()=>{
        this.#requirePlanet(planet);const draft=this,frameContext={get currentLocation(){return context.currentLocation;},get paused(){return context.paused;},get playerFleet(){return draft.playerEconomyState().fleet;}};
        return advanceOriginalCampaignPlanetFrame(planet,seconds,this.#nativeClock().convertToDays(seconds),this.factionPersonFactoryState().random.mathRandom,frameContext,{
            readPlanetVisibilityToPlayer:entity=>this.planetVisibilityToPlayer(entity),
            isPlanetVisibleToPlayer:entity=>{const player=this.playerEconomyState().fleet;if(player===null)return false;check(player.campaign,'Actual player world entity required');return entity.entity.containingLocation===player.campaign.entity.containingLocation&&this.planetVisibilityToPlayer(entity)!=='NONE';},
            readPlanetIndicatorFaction:entity=>this.#nativePlanetFaction(entity),
            readNeutralIndicatorFaction:()=>this.#nativeFaction('neutral'),
            reportDetectedPlanet:(entity,level)=>reportOriginalDetectedEntity(this.#requiredFleetWorld(),entity,level,services),...services,
        });
    });}
    advanceNativePlanetEvenIfPaused(planet,seconds,context,services={}){return this.#operation(()=>{this.#requirePlanet(planet);return advanceOriginalCampaignPlanetEvenIfPaused(planet,seconds,{get paused(){return context.paused;},currentLocation:context.currentLocation,playerFleet:this.playerEconomyState().fleet},services);});}
    removeNativePlanet(planet,services={}){return this.#operation(()=>{this.#requirePlanet(planet);removeOriginalPlanetFromLocation(this.#requiredFleetWorld(),planet.entity.containingLocation,planet,this.#nativeRegistryServices(services));});}
    /** Actual Misc.addCargoPods: registration precedes placement/random drift, no response script. */
    addNativeCargoPods(locationRef,position,services={}){return this.#operation(()=>{
        const world=this.#requiredFleetWorld(),location=originalFleetWorldLocation(world,locationRef),faction=this.#requiredFactionRelations().factions.find(f=>f.factionId==='neutral');check(faction,'Actual neutral faction required');
        const frame=this.nativeLocationFrameState(locationRef);let lightSource;
        if(services.readCustomEntityLightSource){lightSource=services.readCustomEntityLightSource(location);check(lightSource===null||typeof lightSource==='object'&&typeof lightSource.then!=='function','Synchronous actual location light source required');}
        else{check(frame?.kind==='base','Actual BaseLocation frame or star-system getLightSource service required for custom entity');lightSource=null;}
        const pod=createOriginalCargoPods(this.playerEconomyState(),faction,lightSource,{resources:initializeOriginalCampaignResources(this.fleetDataFactoryState()),createCargo:ref=>{const cargo=createOriginalFleetCargo(ref);cargo.carryingFleetRef=null;return cargo;},createMothballedShips:(prefix,id)=>this.createFleetData(prefix,id).fleet});
        addOriginalCustomEntityToLocation(world,location,pod,this.#nativeRegistryServices(services));initializeOriginalCargoPodsDrift(pod,position,this.factionPersonFactoryState().random.mathRandom);this.#validateFleetWorld(world);return pod;
    });}
    #requireCargoPods(entity){check(isOriginalCargoPods(entity)&&this.#requiredFleetWorld().locations.some(l=>l.repository.contains.includes(entity)),'Actual registered cargo pods required');return entity;}
    cargoPodsVisibilityToPlayer(pod){
        check(!this.#failed,'Failed shared draft must be discarded');this.#requireCargoPods(pod);const player=this.playerEconomyState().fleet;if(player===null)return 'NONE';
        check(this.#sensors?.unresolved.length===0&&this.#routeSpace?.playerFleetRef===player.objectRef,'Actual player sensor/spatial closure required for cargo pods');
        return originalSensorVisibility(originalFleetSensorEntity(this.#sensors,this.#routeSpace,player.objectRef),originalCargoPodsSensorEntity(pod),{sensorsOn:this.#sensors.sensorsOn,difficulty:this.#sensors.difficulty,hyperspaceRef:this.#routeSpace.hyperspaceRef});
    }
    /** Multiplayer player context; never rewrites the original singleton player or target graph. */
    cargoPodsVisibilityForPlayerObserver(pod,observerDataRef){
        check(!this.#failed,'Failed shared draft must be discarded');this.#requireCargoPods(pod);const observer=this.#fleetForDataRef(observerDataRef);
        check(this.#sensors?.unresolved.length===0&&this.#sensors.fleets.find(row=>row.objectRef===observer.objectRef)?.fleet===observer,'Actual observer sensor binding required');
        check(originalRouteEntity(this.#routeSpace,observer.objectRef).nativeFleet===observer,'Actual observer spatial binding required');
        return originalSensorVisibility(originalFleetSensorEntity(this.#sensors,validateOriginalRouteSpace(this.#routeSpace),observer.objectRef,undefined,observer.objectRef),originalCargoPodsSensorEntity(pod),{sensorsOn:this.#sensors.sensorsOn,difficulty:this.#sensors.difficulty,hyperspaceRef:this.#routeSpace.hyperspaceRef});
    }
    createNativeCargoPodsObserverPresentation(pod,observerDataRef,seed){return this.#operation(()=>createOriginalCargoPodsObserverPresentation(this.#requireCargoPods(pod),this.#fleetForDataRef(observerDataRef),seed));}
    #nativeCargoPodsObserverServices(presentation,services){
        const {pod,observer}=presentation;this.#requireCargoPods(pod);check(this.#fleetForDataRef(observer.dataRef)===observer,'Pod presentation belongs to a different runtime graph');
        return {
            readCargoPodsVisibilityToPlayer:target=>this.cargoPodsVisibilityForPlayerObserver(target,observer.dataRef),
            isCargoPodsVisibleToPlayer:target=>target.entity.containingLocation===observer.campaign.entity.containingLocation&&this.cargoPodsVisibilityForPlayerObserver(target,observer.dataRef)!=='NONE',
            readNeutralIndicatorFaction:()=>{const faction=this.#requiredFactionRelations().factions.find(f=>f.factionId==='neutral');check(faction,'Actual neutral faction required');return faction;},
            ...services,
        };
    }
    advanceNativeCargoPodsObserver(presentation,seconds,context,services={}){return this.#operation(()=>advanceOriginalCargoPodsObserver(presentation,seconds,this.#nativeClock().convertToDays(seconds),context,this.#nativeCargoPodsObserverServices(presentation,services)));}
    renderNativeCargoPodsObserverLayers(presentation,context,services={}){return this.#operation(()=>renderOriginalCargoPodsObserverLayers(presentation,context,this.#nativeCargoPodsObserverServices(presentation,services)));}
    #nativeCargoPodsFrameServices(services){return {
        readCargoPodsVisibilityToPlayer:pod=>this.cargoPodsVisibilityToPlayer(pod),
        isCargoPodsVisibleToPlayer:pod=>{const player=this.playerEconomyState().fleet;if(player===null)return false;check(player.campaign,'Actual player world entity required');if(pod.entity.containingLocation!==player.campaign.entity.containingLocation)return false;return this.cargoPodsVisibilityToPlayer(pod)!=='NONE';},
        readNeutralIndicatorFaction:()=>{const faction=this.#requiredFactionRelations().factions.find(f=>f.factionId==='neutral');check(faction,'Actual neutral faction required');return faction;},
        reportDetectedCargoPods:(pod,level)=>reportOriginalDetectedEntity(this.#requiredFleetWorld(),pod,level,services),...services,
    };}
    advanceNativeCargoPodsFrame(pod,seconds,context,services={}){return this.#operation(()=>{
        this.#requireCargoPods(pod);const draft=this,frameContext={get currentLocation(){return context.currentLocation;},get paused(){return context.paused;},get playerFleet(){return draft.playerEconomyState().fleet;}};
        return advanceOriginalCargoPodsFrame(pod,seconds,this.#nativeClock().convertToDays(seconds),this.factionPersonFactoryState().random.mathRandom,frameContext,this.#nativeCargoPodsFrameServices(services));
    });}
    advanceNativeCargoPodsEvenIfPaused(pod,seconds,context,services={}){return this.#operation(()=>{
        this.#requireCargoPods(pod);return advanceOriginalCargoPodsEvenIfPaused(pod,seconds,{get paused(){return context.paused;},get currentLocation(){return context.currentLocation;},playerFleet:this.playerEconomyState().fleet},services);
    });}
    removeNativeCargoPods(entity,services={}){return this.#operation(()=>{const world=this.#requiredFleetWorld();check(isOriginalCargoPods(entity)&&world.locations.some(l=>l.repository.contains.includes(entity)),'Actual registered cargo pods required');removeOriginalCustomEntityFromLocation(world,entity.entity.containingLocation,entity,this.#nativeRegistryServices(services));});}
    /** Actual CampaignEventListener order; only explicitly registered CoreScript gets stock behavior. */
    reportNativePlayerDidNotTakeCargo(cargo,services={}){return this.#operation(()=>{
        const world=this.#requiredFleetWorld();reportOriginalPlayerDidNotTakeCargo(world,cargo,{reportCoreScriptUnclaimedCargo:(_listener,remaining)=>{
            const fleet=this.playerEconomyState().fleet,location=fleet?.campaign?.entity.containingLocation;check(location&&world.locations.includes(location),'Actual player location required for unclaimed cargo');
            const pod=this.addNativeCargoPods(location.objectRef,fleet.campaign.entity.position,services);addAllOriginalNativeCargo(pod.cargo,remaining,this.#nativeBattleServices(services));reportOriginalPlayerLeftCargoPods(world,pod,services);
        },...services});
    });}
    addNativeFleetToLocation(dataRef,locationRef,services={}){return this.#operation(()=>{const world=this.#requiredFleetWorld();addOriginalFleetToLocation(world,originalFleetWorldLocation(world,locationRef),this.#worldBinding(dataRef).fleet,this.#nativeRegistryServices(services));});}
    removeNativeFleetFromLocation(dataRef,locationRef,services={}){return this.#operation(()=>{const world=this.#requiredFleetWorld();removeOriginalFleetFromLocation(world,originalFleetWorldLocation(world,locationRef),this.#worldBinding(dataRef).fleet,this.#nativeRegistryServices(services));});}
    addNativeFleetEventListener(dataRef,listener){return this.#operation(()=>addOriginalFleetEventListener(this.#worldBinding(dataRef).fleet,listener));}
    bindNativeFleetRouteSpace(dataRef){return this.#operation(()=>{this.#requiredFleetWorld();return bindOriginalRouteWorldFleet(this.#routeSpace,this.#worldBinding(dataRef).fleet);});}
    addNativeFleetAbility(dataRef,id){return this.#operation(()=>addOriginalFleetAbility(this.#worldBinding(dataRef).fleet,id));}
    nativeFleetAbility(dataRef,id){check(!this.#failed,'Failed shared draft must be discarded');return originalFleetAbility(this.#fleetForDataRef(dataRef),id);}
    #nativeAbilityContext(context){const draft=this;return {get playerFleet(){return draft.playerEconomyState().fleet;},get currentLocation(){return context.currentLocation;},get paused(){return context.paused;},get secondsPerDay(){return draft.#nativeClock().snapshot().secondsPerDay;}};}
    changeNativeFleetAbility(dataRef,id,action,context,services={}){return this.#operation(()=>{const ability=originalFleetAbility(this.#worldBinding(dataRef).fleet,id);check(ability,'Actual registered ability required');return changeOriginalFleetAbility(ability,action,this.#nativeAbilityContext(context),this.#nativeFleetServices(services));});}
    removeNativeFleetAbility(dataRef,id,context,services={}){return this.#operation(()=>removeOriginalFleetAbility(this.#worldBinding(dataRef).fleet,id,this.#nativeAbilityContext(context),this.#nativeFleetServices(services)));}
    updateNativeFleetAbilityLayers(dataRef,services={}){return this.#operation(()=>updateOriginalFleetAbilityLayers(this.#worldBinding(dataRef).fleet,this.#nativeFleetServices(services)));}
    despawnNativeFleet(dataRef,reason='NO_REASON_PROVIDED',param=null,services={}){return this.#operation(()=>despawnOriginalWorldFleet(this.#requiredFleetWorld(),this.#worldBinding(dataRef),reason,param,this.#nativeFleetServices(services)));}
    /** Explicit post-view phase. Does not claim to advance the missing view/AI/Base phases. */
    finishNativeFleetAfterView(dataRef,services={}){return this.#operation(()=>finishOriginalFleetAfterView(this.#requiredFleetWorld(),this.#worldBinding(dataRef),this.#nativeFleetServices(services)));}
    removeExpiredNativeWorldFleets(locationRef,services={}){return this.#operation(()=>{const world=this.#requiredFleetWorld();return removeExpiredOriginalWorldFleets(world,originalFleetWorldLocation(world,locationRef),this.#nativeRegistryServices(services));});}
    #nativeRegistryServices(services={}){return {objectAdded:(listener,entity)=>this.#nativeEntityIndex().objectAdded(listener,entity),objectRemoved:(listener,entity)=>this.#nativeEntityIndex().objectRemoved(listener,entity),...services};}
    #nativeFleetServices(services={}){
        const state=this.#fleetServices?.towCableState??null;
        check(!Object.hasOwn(services,'towCableState')||services.towCableState===state,'Bind the actual persistent entry to the draft before fleet operations');
        return {...this.#nativeRegistryServices(),readFleetAbilities:originalFleetAbilities,readAbilityLayers:originalAbilityLayers,
            readNeutralIndicatorFaction:()=>this.#nativeFaction('neutral'),
            readPlayerFactionColor:()=>this.#nativeFaction('player').specColor,
            readPlayerFactionBaseUIColor:()=>this.#nativeFaction('player').specBaseUIColor,
            isFleetVisibleToPlayer:fleet=>{const player=this.playerEconomyState().fleet;return player!==null&&fleet.campaign.entity.containingLocation===player.campaign.entity.containingLocation&&this.fleetVisibilityForPlayerObserver(fleet.dataRef,player.dataRef)!=='NONE';},
            reportPlayerAbility:(ability,active)=>{const listeners=this.#requiredFleetWorld().campaignListeners;check(listeners&&['saved','transient','timed'].every(key=>Array.isArray(listeners[key])),'Actual campaign listener roster required');for(const listener of [...listeners.saved,...listeners.transient,...listeners.timed]){check(typeof services.reportAbilityToListener==='function','Actual player ability listener implementation required');const result=services.reportAbilityToListener(listener,ability,active,null);check(!result||typeof result.then!=='function','Synchronous player ability listener required');}},
            newMemberViewJitterSeed:()=>originalJavaNextLong(this.factionPersonFactoryState().random.newRandomSeeds),readMemberViewStockVariant:id=>originalFleetStockVariant(this.fleetMemberFactoryState(),id),...services,towCableState:state,readTowCableState:()=>this.#fleetServices?.towCableState??null};
    }
    #fleetDependencies(dependencies){
        const fleet=this.#playerEconomy?.state?.fleet;
        // Preserve an explicit external lifecycle and the existing missing-input refusal.
        // The persistent entry alone is not a complete FleetData synchronization backend.
        if(!dependencies.nativeFleetServices&&(typeof dependencies.synchronizePlayerFleet==='function'||fleet?.nativeSyncScope!=='native-fleet-data-sync-inputs'||fleet.syncUnresolved?.length!==0))return dependencies;
        return {...dependencies,nativeFleetServices:this.#nativeFleetServices(dependencies.nativeFleetServices)};
    }
    #fleetForDataRef(dataRef){
        const player=this.playerEconomyState(),registered=this.#fleetServices?.rosters?.bindings.find(b=>b.fleet.dataRef===dataRef)?.fleet;
        const fleet=registered??(player.fleet?.dataRef===dataRef?player.fleet:null);
        check(fleet,'Actual registered FleetData required');return fleet;
    }
    getNativeFleetCommander(dataRef){return this.#operation(()=>{
        const fleet=this.#fleetForDataRef(dataRef),ref=originalFleetCommanderRef(fleet);
        check(ref!==null,'Actual default commander missing; cannot reconstruct a historical class object');
        return originalPersonnelByRef(this.playerEconomyState(),ref);
    });}
    setNativeFleetCommander(dataRef,personRef,dependencies={}){return this.#operation(()=>{
        const fleet=this.#fleetForDataRef(dataRef),person=personRef===null?null:originalPersonnelByRef(this.playerEconomyState(),personRef);
        return setOriginalFleetCommander(fleet,person,{refreshCharacterStatsEffects:(current,refreshOutposts)=>this.refreshNativeCharacterStats(current.objectRef,{...dependencies,refreshOutposts,resolvePending:false})});
    });}
    initializeFleetCommander(dataRef,factionId,{isInSectorGen}={},dependencies={}){return this.#operation(()=>{
        const fleet=this.#fleetForDataRef(dataRef);
        return initializeOriginalCampaignFleetCommander(fleet,{
            createRandomPerson:()=>this.createFactionPerson(factionId,{isInSectorGen}),
            refreshCharacterStatsEffects:(person,refreshOutposts)=>this.refreshNativeCharacterStats(person.objectRef,{...dependencies,refreshOutposts,resolvePending:false}),
        });
    });}

    /** CampaignEngine.createEmptyFleet(FactionAPI, boolean), not the String/name AI overload. */
    createNativeEmptyFleet(faction,aiMode,{isInSectorGen}={},dependencies={}){return this.#operation(()=>{
        check(typeof aiMode==='boolean','Actual empty-fleet AI-mode flag required');
        const source=this.#fleetServices?.doctrineCapture?.entries.find(e=>e.factionId===faction?.factionId);
        check(source?.objectRef===faction?.objectRef&&source!==undefined,'Construction needs the actual registered faction identity');
        const factory=this.fleetDataFactoryState();check(factory.classState,'Explicit current FleetData class initialization/binding required before world-fleet construction');
        const binding=constructOriginalCampaignFleet(this.playerEconomyState(),faction,{isInSectorGen,secondsPerDay:this.#nativeClock().snapshot().secondsPerDay},{
            resources:initializeOriginalCampaignResources(factory),globalRandom:this.#fleetServices.random.global,
            createFleetData:(prefix,id)=>this.createFleetData(prefix,id),
            initializeCommander:(fleet,id,sectorGen)=>this.initializeFleetCommander(fleet.dataRef,id,{isInSectorGen:sectorGen},dependencies),
        });
        if(aiMode)binding.fleet.aiMode=true;
        return binding;
    });}
    nativeCampaignPluginRegistry(){check(!this.#failed,'Failed shared draft must be discarded');return validateOriginalCampaignPluginRegistry(this.#engineFrame?.campaignPlugins);}
    addNativeCampaignPlugin(plugin){return this.#operation(()=>addOriginalCampaignPlugin(this.nativeCampaignPluginRegistry(),plugin));}
    removeNativeCampaignPlugin(id){return this.#operation(()=>removeOriginalCampaignPlugin(this.nativeCampaignPluginRegistry(),id));}
    registerNativeCoreCampaignPlugin(){return this.#operation(()=>{check(this.#engineFrame,'Actual Engine required');const plugin=createOriginalCoreCampaignPlugin(this.#engineFrame.world.sectorRef+':core-campaign-plugin:'+(this.nativeCampaignPluginRegistry().revision+1));this.addNativeCampaignPlugin(plugin);return plugin;});}
    createNativeModularFleetAI(dataRef,services={}){return this.#operation(()=>{
        const fleet=this.#fleetForDataRef(dataRef),factory=this.fleetDataFactoryState();check(fleet.campaign&&Number.isSafeInteger(factory.serial)&&factory.serial<Number.MAX_SAFE_INTEGER,'Actual current campaign fleet and AI allocator required');
        return createOriginalModularFleetAI(fleet.objectRef+':modular-ai:'+(++factory.serial),fleet,{globalRandom:this.#fleetServices.random.global,pickFleetAIModule:(kind,value,ai)=>pickOriginalCampaignPlugin(this.nativeCampaignPluginRegistry(),kind,{fleet:value,ai},services.pluginServices),...services});
    });}
    advanceNativeModularFleetAI(dataRef,seconds,services={}){return this.#operation(()=>{const fleet=this.#fleetForDataRef(dataRef);return advanceOriginalModularFleetAI(fleet.campaign?.ai,seconds,{convertAIDays:value=>this.#nativeClock().convertToDays(value),...services});});}
    createNativeNamedEmptyFleet(factionId,name,aiMode,context={},services={}){return this.#operation(()=>createOriginalNamedEmptyFleet(factionId,name,aiMode,{
        readFactoryFaction:id=>this.#nativeFaction(id),constructFactoryFleet:(faction,mode)=>this.createNativeEmptyFleet(faction,mode,context,services.personServices),
        createFactoryFleetAI:fleet=>this.createNativeModularFleetAI(fleet.dataRef,services.aiServices),readFactoryFleetCommander:fleet=>this.getNativeFleetCommander(fleet.dataRef),
    }));}
    attachNativePickedFleetInflater(dataRef,params,services={}){return this.#operation(()=>{
        const fleet=this.#fleetForDataRef(dataRef),factory=this.fleetDataFactoryState();check(fleet.campaign,'Actual CampaignFleet required');
        check(Number.isSafeInteger(factory.serial)&&factory.serial<Number.MAX_SAFE_INTEGER,'Actual inflater params allocator required');
        const currentParams=createOriginalFleetInflaterParams(fleet.objectRef+':inflater-params:'+(++factory.serial),params);
        const inflater=pickOriginalCampaignPlugin(this.nativeCampaignPluginRegistry(),'fleetInflater',{fleet,params:currentParams},{createCampaignDefaultInflater:(_fleet,value)=>{check(Number.isSafeInteger(factory.serial)&&factory.serial<Number.MAX_SAFE_INTEGER,'Actual inflater allocator required');return createOriginalFleetInflaterForParams(fleet.objectRef+':inflater:'+(++factory.serial),value);},...services});
        check(inflater===null||inflater&&typeof inflater==='object','Actual chosen FleetInflater or known null required');fleet.inflater=inflater;return inflater;
    });}
    nativeGenericPluginManager(){check(!this.#failed,'Failed shared draft must be discarded');return originalCampaignGenericPlugins(this.#engineFrame);}
    addNativeGenericPlugin(plugin,isTransient=false){return this.#operation(()=>addOriginalGenericPlugin(this.nativeGenericPluginManager(),plugin,isTransient));}
    removeNativeGenericPlugin(plugin){return this.#operation(()=>removeOriginalGenericPlugin(this.nativeGenericPluginManager(),plugin));}
    nativeDModClassState(){check(!this.#failed,'Failed shared draft must be discarded');return validateOriginalDModClassState(this.#fleetServices?.dmodClassState);}
    bindNativeDModClassState(state){return this.#operation(()=>{check(this.#fleetServices,'Actual fleet services required');validateOriginalDModClassState(state);check(!Object.hasOwn(this.#fleetServices,'dmodClassState')||this.#fleetServices.dmodClassState===state,'Cannot replace live DModManager class history');this.#fleetServices.dmodClassState=state;return state;});}
    #nativeDModServices(services){return {
        createDModRandom:()=>createOriginalJavaRandom(originalJavaNextLong(this.factionPersonFactoryState().random.newRandomSeeds)),
        pickDModAdderPlugin:params=>pickOriginalGenericPlugin(this.nativeGenericPluginManager(),ORIGINAL_DMOD_ADDER_TYPE,params,services),
        readDModRecoveryReduction:fleet=>originalEncounterFleetDynamic(fleet,'ship_dmod_reduction_mod',0),...services,
    };}
    nativeDModCount(variant,services={}){return this.#operation(()=>originalDModCount(variant,[],services));}
    setNativeDHull(variant,services={}){return this.#operation(()=>setOriginalDHull(variant,services));}
    removeNativeDMod(variant,id,services={}){return this.#operation(()=>removeOriginalDMod(variant,id,services));}
    addNativeDMods(variant,canAddDestroyedMods,count,random,services={}){return this.#operation(()=>addOriginalDMods(variant,canAddDestroyedMods,count,random,this.nativeDModClassState(),this.#nativeDModServices(services)));}
    addNativeCombatDMods(variant,destroyed,own,recoverer,random,services={}){return this.#operation(()=>addOriginalCombatDMods(variant,destroyed,own,recoverer,random,this.nativeDModClassState(),this.#nativeDModServices(services)));}
    nativeCoreAutofitClassState(){check(!this.#failed,'Failed shared draft must be discarded');return validateOriginalCoreAutofitClassState(this.#fleetServices?.autofitClassState);}
    bindNativeCoreAutofitClassState(state){return this.#operation(()=>{check(this.#fleetServices,'Actual fleet services required');validateOriginalCoreAutofitClassState(state);check(!Object.hasOwn(this.#fleetServices,'autofitClassState')||this.#fleetServices.autofitClassState===state,'Cannot replace live CoreAutofit class history');this.#fleetServices.autofitClassState=state;return state;});}
    /** CampaignFleet.setInflater does not reset its nullable inflated flag. */
    attachNativeFleetInflater(dataRef,params={}){return this.#operation(()=>{
        const fleet=this.#fleetForDataRef(dataRef);check(fleet.campaign?.flags,'Actual CampaignFleet required for an inflater');
        const factory=this.fleetDataFactoryState();check(Number.isSafeInteger(factory.serial)&&factory.serial<Number.MAX_SAFE_INTEGER,'Current inflater identity allocator required');
        const item=createOriginalFleetInflater(fleet.objectRef+':inflater:'+(++factory.serial),params);fleet.inflater=item;return item;
    });}
    inflateNativeFleet(dataRef,services={}){return this.#operation(()=>{
        const fleet=this.#fleetForDataRef(dataRef),roster=value=>this.bindFleetRoster(value.dataRef,services.memberServices??{},services.fleetServices??{});
        // Lazy: neutral/already-inflated fleets must not initialize an unused variant factory.
        let variantServices=null;const variants=()=>variantServices??=originalEmptyVariantFactoryServices(this.fleetMemberFactoryState(),()=>{
            const factory=this.fleetDataFactoryState();check(Number.isSafeInteger(factory.serial)&&factory.serial>=0&&factory.serial<Number.MAX_SAFE_INTEGER,'Current variant object allocator required');
            return fleet.objectRef+':empty-variant:'+(++factory.serial);
        },services.emptyVariantServices);
        const bound={
            ...createOriginalFactionEquipmentServices({readPlayerKnownHullmods:()=>originalPlayerFactionHullmods(this.playerEconomyState(),services.playerHullmodServices),...services.factionEquipmentServices}),
            createInflaterRandom:()=>createOriginalJavaRandom(originalJavaNextLong(this.factionPersonFactoryState().random.newRandomSeeds)),
            readInflaterAutofitClassState:()=>this.nativeCoreAutofitClassState(),
            readInflaterCommander:value=>this.getNativeFleetCommander(value.dataRef),
            readInflaterFaction:(value,id)=>{if(id===null)return value.campaign.faction;const faction=this.#factionRelations?.factions.find(f=>f.factionId===id);check(faction,'Actual override inflater faction required');return faction;},
            readInflaterQualityPerDMod:()=>characterSkills.settings.qualityPerDMod,
            readInflaterForceAutofit:value=>originalCampaignMemoryBoolean(originalEntityMemoryWithoutUpdate(value.campaign.entity),'$overrideNoAutofit'),
            readInflaterMembers:value=>roster(value).membersCopy(),
            readInflaterWeaponSpec:originalAutofitSpecs.readWeaponSpec,readInflaterFighterSpec:originalAutofitSpecs.readFighterSpec,
            readInflaterHullmodRequiredItem:id=>originalHullmodRequiredItem(id,services.hullmodItemServices),
            readInflaterHullTags:member=>originalAutofitSpecs.readHull(member.variant).tags,
            isInflaterPlayerFaction:faction=>faction.factionId==='player',
            readInflaterStockVariant:id=>originalFleetStockVariant(this.fleetMemberFactoryState(),id),
            createInflaterEmptyVariant:(id,hullId)=>variants().createInflaterEmptyVariant(id,hullId),
            fitInflaterVariant:(session,current,target,max,delegate)=>executeOriginalCoreAutofit(session,current,target,max,{
                ...createOriginalAutofitCostServices({readWeaponSpec:id=>autofitCall(bound,'readInflaterWeaponSpec',id),readFighterSpec:id=>autofitCall(bound,'readInflaterFighterSpec',id),...services.autofitServices}),
                readVariantDisplayName:variant=>{check(typeof variant.displayName==='string','Actual variant display name required');return variant.displayName;},
                readModuleVariant:(variant,slot)=>variants().readModuleVariant(variant,slot),cloneVariant:variant=>variants().cloneVariant(variant),setModuleVariant:(variant,slot,module)=>variants().setModuleVariant(variant,slot,module),
                isCommanderPlayer:person=>person===this.playerEconomyState().player,isTutorialInProgress:()=>originalTutorialInProgress(this.playerEconomyState()),
                readDoctrineCarriers:faction=>this.factionDoctrine(faction.factionId).carriers,
                isHullmodItemAvailable:(id,member,variant,market)=>this.isNativeHullmodItemAvailable(id,member,variant,market,services.hullmodItemServices),...services.autofitServices,
            },createOriginalInflaterAutofitDelegate(delegate,bound)),
            readInflaterRandomizeProbability:faction=>this.factionDoctrine(faction.factionId).autofitRandomizeProbability,
            isInflaterMemberStation:member=>originalConstructedMemberHints(member).includes('STATION'),
            isInflaterMemberCivilian:member=>originalConstructedMemberCivilian(member),
            readInflaterDModCount:variant=>this.nativeDModCount(variant,services.dmodServices),
            setInflaterDHull:variant=>this.setNativeDHull(variant,services.dmodServices),
            addInflaterDMods:(member,canAddDestroyedMods,count,random)=>this.addNativeDMods(member.variant,canAddDestroyedMods,count,random,services.dmodServices),
            markInflaterFleetSyncNeeded:value=>{value.synchronization.needsSync=true;},syncInflaterFleet:value=>{roster(value).sync();},...services,
        };
        return inflateOriginalCampaignFleet(fleet,{
            isInflaterFleetNeutral:value=>value.campaign.faction.factionId==='neutral',
            inflateCampaignFleetWith:(value,item)=>{executeOriginalFleetInflation(item,value,bound);},
            reportCampaignFleetInflated:(value,item)=>reportOriginalFleetInflated(this.#requiredFleetWorld(),value,item,services),
            removeCampaignInflaterAfterUse:originalInflaterRemovesAfterInflating,...services,
        });
    });}
    fleetAccidentSeverity(dataRef,services={}){return this.#operation(()=>{const binding=this.fleetRosterState().bindings.find(b=>b.fleet.dataRef===dataRef);check(binding,'Actual registered fleet required');return originalFleetAccidentSeverity(binding,this.#nativeFleetServices(services));});}
    advanceFleetAccidents(dataRef,seconds,services={}){return this.#operation(()=>{const binding=this.fleetRosterState().bindings.find(b=>b.fleet.dataRef===dataRef);check(binding,'Actual registered fleet required');return advanceOriginalFleetAccidents(binding,this.#nativeClock().convertToDays(seconds),this.#fleetServices.random.global,this.#nativeFleetServices(services));});}
    /** Caller owns the preceding AI/person/Base phase and subsequent view/despawn phase. */
    advanceNativeFleetAfterBase(dataRef,seconds,context,services={}){return this.#operation(()=>{
        const binding=this.fleetRosterState().bindings.find(b=>b.fleet.dataRef===dataRef);check(binding,'Actual registered fleet required');
        return advanceOriginalFleetAfterBase(binding,seconds,this.#nativeClock().convertToDays(seconds),this.#fleetServices.random.global,{...context,playerFleet:this.playerEconomyState().fleet},this.#nativeFleetServices(services));
    });}
    /** Full call ordering with native contact/member views; reached external AI/discovery/scripts need real plugins. */
    advanceNativeFleetFrame(dataRef,seconds,context,services={}){return this.#operation(()=>{
        const draft=this,frameContext={get currentLocation(){return context.currentLocation;},get paused(){return context.paused;},get isFastForwardIteration(){return context.isFastForwardIteration;},get playerFleet(){return draft.playerEconomyState().fleet;}};
        const bound=this.#nativeFleetServices({
            readAbilityContext:()=>this.#nativeAbilityContext(frameContext),
            isFleetVisible:(fleet,margin)=>originalFleetIsVisible(fleet,margin,frameContext,services),
            willFleetBeVisible:fleet=>originalFleetWillBeVisible(fleet,frameContext,services),
            readFleetCommander:fleet=>this.getNativeFleetCommander(fleet.dataRef),
            convertMemberViewSecondsToDays:seconds=>this.#nativeClock().convertToDays(seconds),
            readMemberViewFleet:member=>{const fleet=this.fleetDataFactoryState().fleets.find(f=>f.dataRef===member.fleetDataRef);check(fleet,'Actual member FleetData required');return fleet.campaign?fleet:null;},
            readVisibilityToPlayer:fleet=>this.fleetVisibilityToPlayer(fleet.objectRef),
            isFleetVisibleToPlayer:fleet=>{const player=this.playerEconomyState().fleet;if(player===null)return false;check(this.#routeSpace?.playerFleetRef===player.objectRef,'Actual current player spatial identity required');const target=originalRouteEntity(this.#routeSpace,fleet.objectRef),observer=originalRouteEntity(this.#routeSpace,player.objectRef);if(target.locationRef!==observer.locationRef)return false;return this.fleetVisibilityToPlayer(fleet.objectRef)!=='NONE';},
            readPlayerVisibilityToFleet:fleet=>{const player=this.playerEconomyState().fleet;check(player&&this.#routeSpace?.playerFleetRef===player.objectRef,'Actual current player spatial identity required');return originalRouteFleetVisibility(this.#sensors,this.#routeSpace,player.objectRef,fleet.objectRef);},
            readInteractionTarget:ref=>{const object=this.#nativeWorldEntity(ref),entity=object?((isOriginalCargoPods(object)||isOriginalCampaignPlanet(object))?object.entity:object.campaign.entity):null,location=entity?.containingLocation??null;return {containingLocation:location,alive:entity!==null&&location!==null&&location.repository.contains.includes(object)};},...services});
        return advanceOriginalFleetFrame(this.#worldBinding(dataRef),seconds,this.#nativeClock().convertToDays(seconds),this.#fleetServices.random.global,this.#requiredFleetWorld(),frameContext,bound);
    });}
    /** Host-owned, observer-local visual state. Not a checkpoint or an authenticated public projection. */
    createNativeFleetObserverPresentation(dataRef,observerDataRef,seed){return this.#operation(()=>createOriginalFleetObserverPresentation(this.#fleetForDataRef(dataRef),this.#fleetForDataRef(observerDataRef),seed));}
    #nativeObserverServices(presentation,services={}){
        const {fleet,observer}=presentation;check(this.#fleetForDataRef(fleet.dataRef)===fleet&&this.#fleetForDataRef(observer.dataRef)===observer,'Observer presentation belongs to a different runtime graph');
        return this.#nativeFleetServices({
            readVisibilityToPlayer:target=>this.fleetVisibilityForPlayerObserver(target.dataRef,observer.dataRef),
            isFleetVisibleToPlayer:target=>target.campaign.entity.containingLocation===observer.campaign.entity.containingLocation&&this.fleetVisibilityForPlayerObserver(target.dataRef,observer.dataRef)!=='NONE',
            readPlayerVisibilityToFleet:target=>this.fleetVisibilityForPlayerObserver(observer.dataRef,observer.dataRef,target.dataRef),
            newMemberViewJitterSeed:()=>originalJavaNextLong(presentation.random),
            convertMemberViewSecondsToDays:seconds=>this.#nativeClock().convertToDays(seconds),
            readMemberViewFleet:member=>{const owner=this.fleetDataFactoryState().fleets.find(f=>f.dataRef===member.fleetDataRef);check(owner,'Actual member FleetData required');return owner.campaign?owner:null;},
            ...services,
        });
    }
    advanceNativeFleetObserverContact(presentation,seconds,context,services={}){return this.#operation(()=>advanceOriginalFleetObserverContact(presentation,seconds,context,this.#nativeObserverServices(presentation,services)));}
    advanceNativeFleetObserverView(presentation,seconds,context,services={}){return this.#operation(()=>advanceOriginalFleetObserverView(presentation,seconds,context,this.#nativeObserverServices(presentation,services)));}
    renderNativeFleetObserverLayers(presentation,context,services={}){return this.#operation(()=>renderOriginalFleetObserverLayers(presentation,context,this.#nativeObserverServices(presentation,services)));}
    #nativeMemberView(dataRef,memberRef){const view=this.#fleetForDataRef(dataRef).campaign?.view.shipViews.views.find(row=>row.item.objectRef===memberRef)?.view;check(view?.scope==='native-campaign-fleet-member-view','Actual registered native member view required');return view;}
    setNativeFleetMemberJitter(dataRef,memberRef,options,services={}){return this.#operation(()=>{
        const view=this.#nativeMemberView(dataRef,memberRef);setOriginalMemberViewJitter(view,options.durationIn,options.durationOut,options.color,options.copies,options.maxRange,this.#nativeFleetServices(services));
        if(Object.hasOwn(options,'direction'))setOriginalMemberViewJitterDirection(view,options.direction);
        if(Object.hasOwn(options,'length'))setOriginalMemberViewJitterLength(view,options.length);
        if(Object.hasOwn(options,'circular'))setOriginalMemberViewCircularJitter(view,options.circular);
        if(Object.hasOwn(options,'brightness'))setOriginalMemberViewJitterBrightness(view,options.brightness);
    });}
    endNativeFleetMemberJitter(dataRef,memberRef){return this.#operation(()=>endOriginalMemberViewJitter(this.#nativeMemberView(dataRef,memberRef)));}
    /** Rendering mutates original origin/light and contrail fade state; do not render a frozen snapshot. */
    renderNativeFleetView(dataRef,alpha,services={}){return this.#operation(()=>renderOriginalFleetView(this.#fleetForDataRef(dataRef),alpha,this.#nativeFleetServices(services)));}
    renderNativeFleetGraphics(dataRef,alpha,services={}){return this.#operation(()=>renderOriginalFleetGraphics(this.#fleetForDataRef(dataRef),alpha,this.#nativeFleetServices(services)));}
    renderNativeFleetContrails(dataRef,alpha=1){return this.#operation(()=>renderOriginalFleetViewContrails(this.#fleetForDataRef(dataRef),alpha));}
    advanceNativeFleetEvenIfPaused(dataRef,seconds,context,services={}){return this.#operation(()=>{const draft=this;return advanceOriginalFleetEvenIfPaused(this.#worldBinding(dataRef).fleet,seconds,{get currentLocation(){return context.currentLocation;},get paused(){return context.paused;},get isFastForwardIteration(){return context.isFastForwardIteration;},get playerFleet(){return draft.playerEconomyState().fleet;}},this.#nativeFleetServices(services));});}
    setNativeFleetNoEngaging(dataRef,seconds){return this.#operation(()=>setOriginalFleetNoEngaging(this.#fleetForDataRef(dataRef),seconds));}
    /** Only the original counts/goSlow/motion phase; not a complete fleet or world advance. */
    advanceNativeFleetMotion(dataRef,seconds,context,services={}){return this.#operation(()=>advanceOriginalConstructedFleetMotion(this.#fleetForDataRef(dataRef),seconds,context,this.#nativeFleetServices(services)));}
    #nativeWorldEntity(ref){
        check(typeof ref==='string','Actual world entity reference required');
        for(const location of this.#requiredFleetWorld().locations){const entity=location.repository.contains.find(e=>e.objectRef===ref);if(entity)return entity;}
        return this.fleetDataFactoryState().fleets.find(f=>f.objectRef===ref&&f.campaign)??null;
    }
    #nativeNavigationServices(observer,services={}){
        const visibility=entity=>isOriginalCampaignPlanet(entity)?this.planetVisibilityForPlayerObserver(entity,observer.dataRef):isOriginalCargoPods(entity)?this.cargoPodsVisibilityForPlayerObserver(entity,observer.dataRef):this.fleetVisibilityForPlayerObserver(entity.dataRef,observer.dataRef);
        return {readNavigationVisibility:visibility,isNavigationEntityVisible:object=>{const entity=(isOriginalCargoPods(object)||isOriginalCampaignPlanet(object))?object.entity:object.campaign.entity,location=entity.containingLocation;return location!==null&&location===observer.campaign.entity.containingLocation&&location.repository.contains.includes(object)&&visibility(object)!=='NONE';},resolveNavigationTarget:ref=>this.#nativeWorldEntity(ref),...services};
    }
    findNativePlayerNavigationTarget(dataRef,x,y,services={}){check(!this.#failed,'Failed shared draft must be discarded');const observer=this.#fleetForDataRef(dataRef);return findOriginalNavigationTarget(observer,[x,y],this.#nativeNavigationServices(observer,services));}
    followNativePlayerNavigationTarget(dataRef,target,services={}){return this.#operation(()=>{const observer=this.#fleetForDataRef(dataRef);check(this.#nativeWorldEntity(target.objectRef)===target,'Target belongs to a different runtime graph');return followOriginalNavigationTarget(observer,target,this.#nativeNavigationServices(observer,services));});}
    setNativePlayerMovementDestination(dataRef,x,y){return this.#operation(()=>setOriginalPlayerMovementDestination(this.#fleetForDataRef(dataRef),x,y));}
    advanceNativePlayerTargetNavigation(dataRef,context,services={}){return this.#operation(()=>{const observer=this.#fleetForDataRef(dataRef);return advanceOriginalPlayerTargetNavigation(observer,context,this.#nativeNavigationServices(observer,services));});}
    setNativeFleetMoveDestination(dataRef,x,y,override=false){return this.#operation(()=>setOriginalConstructedFleetDestination(this.#fleetForDataRef(dataRef),x,y,override));}
    requestNativeFleetGoSlow(dataRef,stop){return this.#operation(()=>requestOriginalConstructedFleetGoSlow(this.#fleetForDataRef(dataRef),stop));}
    fleetRosterState(){check(!this.#failed&&this.#fleetServices?.rosters,'Current fleet rosters missing; old checkpoints cannot reconstruct these from history');return this.#fleetServices.rosters;}
    registerFleetRoster(fleet,naming,shipNameRandom=null){return this.#operation(()=>registerOriginalFleetRoster(this.fleetRosterState(),fleet,naming,shipNameRandom));}
    bindFleetRoster(dataRef,plugins={},lifecycle={}){
        const binding=this.fleetRosterState().bindings.find(b=>b.fleet.dataRef===dataRef);check(binding,'Current registered FleetData required');
        const bound=originalFleetRosterServices(binding,this.fleetMemberFactoryState(),this.playerEconomyState(),plugins,this.#nativeFleetServices(lifecycle));
        return Object.fromEntries(Object.entries(bound).map(([key,fn])=>[key,(...args)=>this.#operation(()=>fn(...args))]));
    }
    fleetCompositionState(){check(!this.#failed&&this.#fleetServices?.composition,'Current fleet composition state missing; old checkpoints cannot reconstruct this from history');return validateOriginalFleetCompositionState(this.#fleetServices.composition);}
    /** Roster subphase only; source/mode/random and actual fleet member lifecycle must be supplied. */
    composeFleetRoster(factionId,marketId,params,random,services={}){return this.#operation(()=>{
        const state=this.fleetCompositionState();this.market(marketId);
        return composeOriginalFleetRoster({state,params,random,services:{
            createMember:id=>this.createFleetMember(id),setShipName:setOriginalFleetMemberName,memberFP:originalFleetPointCost,memberHullSize:originalConstructedMemberHullSize,memberHints:originalConstructedMemberHints,memberCivilian:originalConstructedMemberCivilian,
            doctrine:()=>this.factionDoctrine(factionId),isPlayerFaction:()=>factionId==='player',
            marketSizeMult:()=>stat({base:0,modifiers:this.market(marketId).economyBonuses.combat_fleet_size_mult}),
            roleAvailability:(role,mode)=>this.fleetShipRoleAvailability(factionId,role,mode),
            pickShipsForRole:(role,p,r)=>this.pickFleetShipsForRole(factionId,role,p,r),...services,
        }});
    });}
    shipQuality(marketId=null,factionId=null){return this.#operation(()=>this.#listeners().shipQuality(marketId,factionId));}
    militaryPatrolState(){check(!this.#failed,'Failed shared draft must be discarded');return this.#patrols;}
    #patrolServices(services){
        const s=validateOriginalPatrolState(this.#patrols),random=()=>{check(this.#fleetServices,'Captured Web branch random state required');return validateOriginalPatrolBranchRandom(this.#fleetServices.random);};
        return {
            randomDouble:services.randomDouble??(()=>originalJavaNextDouble(random().global)),newRouteSeed:services.newRouteSeed??(()=>originalJavaNextLong(random().routeSeeds)),
            shipQuality:services.shipQuality??((id,factionId)=>this.#listeners().shipQuality(id,factionId)),officerQuality:services.officerQuality??(id=>f(this.factionDoctrine(this.market(id).factionId).officerQuality)),
            factionId:id=>this.market(id).factionId,primaryEntityRef:id=>s.markets.find(m=>m.marketId===id)?.primaryEntityRef,timestamp:()=>String(this.#nativeClock().snapshot().timestamp),
            fleetSize:id=>stat({base:0,modifiers:this.market(id).economyBonuses.combat_fleet_size_mult}),
            maxPatrols:(id,type)=>Math.max(-2147483648,Math.min(2147483647,Math.trunc(stat({base:0,modifiers:this.market(id).economyBonuses['patrol_num_'+({FAST:'light',COMBAT:'medium',HEAVY:'heavy'}[type])+'_mod']})))),
        };
    }
    #advanceMilitaryPatrol(m,entry,patrol,seconds,services){
        const s=validateOriginalPatrolState(this.#patrols),inputs=s.markets.find(row=>row.marketId===m.marketId);check(inputs&&patrol,'Actual military patrol inputs required');
        return advanceOriginalMilitaryPatrolAfterBase(s,patrol.objectRef,{days:this.#nativeClock().convertToDays(seconds),simMode:services.simMode??s.simMode,functional:functional(entry.operating),inNewGameAdvance:this.inNewGameAdvance,fastPatrolSpawn:services.fastPatrolSpawn??false,spawnRate:stat(inputs.spawnRate)},this.#patrolServices(services));
    }
    /** Compatibility post-Base subphase; callers must not additionally run this after advanceMilitaryIndustry. */
    advanceMilitaryPatrolAfterBase(marketId,industryId,seconds,services={}){
        return this.#operation(()=>{
            const s=validateOriginalPatrolState(this.#patrols),m=this.market(marketId),entry=m.industries.find(i=>i.state.industryId===industryId);
            const saved=m.industryLifecycle?.industries.find(i=>i.active&&i.entry===entry)?.patrol??s.industries.find(i=>i.marketId===marketId&&i.industryId===industryId);
            check(this.#loaded.has(marketId)&&entry&&saved,'Loaded actual military industry required');
            return this.#advanceMilitaryPatrol(m,entry,saved,seconds,services);
        });
    }
    #militaryLifecycleRuntime(m,seconds,services){
        check(this.#loaded.has(m.marketId),'Industry lifecycle requires a loaded market');validateOriginalMilitaryLifecycle(m,this.#patrols);
        const patrol=this.#patrolServices(services);
        return {randomDouble:patrol.randomDouble,timestamp:patrol.timestamp,
            buildNextInQueue:()=>this.#buildNextConstructionQueue(m,{militaryServices:services}),
            apply:row=>{
                if(m.personnel){row.entry.modifiers.adminSupplyBonus=this.readNativeMarketAdministratorModifier(m.marketId,'supply_bonus');row.entry.modifiers.adminDemandReduction=this.readNativeMarketAdministratorModifier(m.marketId,'demand_reduction');}
                return applyOriginalMilitaryBase(m,row.entry,{applyFinances:()=>this.#updateIndustryFinances(m.marketId,row.entry.state.industryId,'industry-apply'),readCommodityAvailable:id=>this.#currentCommodityAvailable(m,id)});
            },
            refundCredits:cost=>{const credits=this.playerEconomyState().fleet?.credits;check(credits&&Number.isFinite(credits.value),'Actual player credit handle required for construction refund');credits.value=f(credits.value+f(cost));},
            advancePatrol:row=>this.#advanceMilitaryPatrol(m,row.entry,row.patrol,seconds,services),
        };
    }
    #resourcePlanetType(m){
        check(m.resourcePlanetContext,'Actual current resource planet type required');
        if(this.#fleetServices?.fleetWorld&&Object.hasOwn(m.resourcePlanetContext,'planetEntityRef'))return this.#resourceCurrentPlanet(m)?.type??null;
        return m.resourcePlanetContext.planetType;
    }
    #resourcePlanetIsGasGiant(m){
        if(this.#fleetServices?.fleetWorld&&m.resourcePlanetContext&&Object.hasOwn(m.resourcePlanetContext,'planetEntityRef')){const planet=this.#resourceCurrentPlanet(m);return planet===null?null:(planet.spec??planet.graphics.spec).isGasGiant;}
        check(m.civicPortItemContext,'Actual current resource planet getter required');return m.civicPortItemContext.planetIsGasGiant;
    }
    #resourceCurrentPlanet(m){
        check(m.resourcePlanetContext&&Object.hasOwn(m.resourcePlanetContext,'planetEntityRef'),'Actual current resource planet reference required');
        const ref=m.resourcePlanetContext.planetEntityRef;if(ref===null)return null;
        const planet=this.#nativeWorldEntity(ref);check(planet,'Actual resource planet is not restored in the shared world');return this.#requirePlanet(planet);
    }
    #resourceImmigration(m,row,add){
        check(m.immigrationModifiers,'Actual resource immigration registry required');const list=m.immigrationModifiers.transient,index=list.findIndex(x=>x.objectRef===row.objectRef);
        if(!add){if(index>=0)list.splice(index,1);}else if(index<0)list.push({kind:'industry',id:row.entry.state.industryId,objectRef:row.objectRef});
    }
    #resourceLifecycleRuntime(m,services={}){
        validateOriginalResourceLifecycle(m);const memoryServices=this.#nativeMarketMemoryServices(services.memoryServices);
        return {memoryServices,timestamp:()=>String(this.#nativeClock().snapshot().timestamp),
            readPlanet:()=>{const planet=services.readPlanet?services.readPlanet():this.#resourceCurrentPlanet(m);return planet===null?null:this.#requirePlanet(planet);},setMiningPlasmaVisuals:services.setMiningPlasmaVisuals??((planet,enabled)=>setOriginalMiningPlasmaVisuals(planet,enabled)),
            unregisterImmigration:row=>this.#resourceImmigration(m,row,false),
            apply:row=>{
                if(m.resourceLifecycle.memory!==null)syncOriginalResourceDisruption(m,memoryServices);
                const admin=m.personnel?{adminSupplyBonus:this.readNativeMarketAdministratorModifier(m.marketId,'supply_bonus'),adminDemandReduction:this.readNativeMarketAdministratorModifier(m.marketId,'demand_reduction')}:m.civicAdminInputs;
                check(admin,'Actual current resource administrator inputs required');row.entry.modifiers.adminSupplyBonus=admin.adminSupplyBonus;row.entry.modifiers.adminDemandReduction=admin.adminDemandReduction;let finance;
                applyOriginalLiveResourceIndustry(m,row.entry,{registerImmigration:()=>this.#resourceImmigration(m,row,true),applyFinances:()=>finance=this.#updateIndustryFinances(m.marketId,row.entry.state.industryId,'industry-apply'),readCommodityAvailable:id=>this.#currentCommodityAvailable(m,id),readPlanetIsGasGiant:()=>this.#resourcePlanetIsGasGiant(m)});
                return {finance};
            },buildNextInQueue:()=>this.#buildNextConstructionQueue(m,{resourceServices:services,militaryServices:services.militaryServices}),
        };
    }
    #advanceResourceEntry(m,entry,seconds,services={}){check(this.#loaded.has(m.marketId),'Resource advancement requires a loaded market');const row=validateOriginalResourceLifecycle(m).industries.find(row=>row.entry===entry);check(row,'Lost actual resource instance');return advanceOriginalResourceIndustryFrame(m,row,this.#nativeClock().convertToDays(seconds),this.#resourceLifecycleRuntime(m,services),{colonyDebug:services.colonyDebug??false});}
    resourceLifecycleState(marketId){return this.market(marketId).resourceLifecycle??null;}
    advanceNativeResourceIndustry(marketId,industryId,seconds,services={}){return this.#operation(()=>{const m=this.market(marketId),entry=m.industries.find(e=>e.state.industryId===industryId);check(entry,'Actual resource instance required');return this.#advanceResourceEntry(m,entry,seconds,services);});}
    setNativeResourceDisrupted(marketId,industryId,days,useMax=false){return this.#operation(()=>{const m=this.market(marketId),result=setOriginalResourceDisrupted(m,industryId,days,useMax,this.#nativeMarketMemoryServices());for(const other of this.#markets.values())if(other!==m&&other.resourceLifecycle?.memory===m.resourceLifecycle.memory)syncOriginalResourceDisruption(other,this.#nativeMarketMemoryServices());return result;});}
    setNativeResourceSpecialItem(marketId,industryId,special,services={}){return this.#operation(()=>{const m=this.market(marketId),row=validateOriginalResourceLifecycle(m).industries.find(row=>row.active&&row.entry.state.industryId===industryId);check(row,'Actual resource instance required');setOriginalResourceSpecialItem(m,row,special,this.#resourceLifecycleRuntime(m,services));});}
    #civicLifecycleRuntime(m,services={}){
        validateOriginalCivicLifecycle(m);const memoryServices=this.#nativeMarketMemoryServices(services.memoryServices);
        return {memoryServices,timestamp:()=>String(this.#nativeClock().snapshot().timestamp),
            apply:row=>{
                if(m.civicLifecycle.memory!==null)syncOriginalCivicDisruption(m,memoryServices);
                return applyOriginalLiveCivicIndustry(m,row,{readAdministratorIndustryInputs:()=>{const admin=m.personnel?{adminSupplyBonus:this.readNativeMarketAdministratorModifier(m.marketId,'supply_bonus'),adminDemandReduction:this.readNativeMarketAdministratorModifier(m.marketId,'demand_reduction')}:m.civicAdminInputs;check(admin,'Actual current civic administrator inputs required');return admin;},applyFinances:()=>this.#updateIndustryFinances(m.marketId,row.entry.state.industryId,'income-refresh'),readCommodityAvailable:id=>this.#currentCommodityAvailable(m,id),portItemContext:m.civicPortItemContext?{...m.civicPortItemContext,conditionIds:[...new Set(m.conditions.map(c=>c.id))]}:null,
                    population:{modifyStability:()=>this.modifyPopulationStability(m.marketId,services.readMaxOutposts),
                        dynamic:{readPreviousStability:()=>m.previousStability,readMarketSize:()=>m.size,readDoctrineShipQualityContribution:()=>originalFactionShipQualityContribution(this.factionDoctrine(m.factionId)),readDoctrineNumShips:()=>this.factionDoctrine(m.factionId).numShips,
                            getCommodityData:id=>{const c=this.#currentMarketCommodity(m,id);return {getAvailable:()=>Math.max(0,rounded(stat(c.available))),getMaxDemand:()=>c.maxDemand};}},
                        readIndustryCount:()=>originalConstructionIndustryCount(m,{instantiate:id=>this.#instantiateConstructionIndustry(m,id,services)}),
                        isSpaceportFirstInQueue:()=>Boolean(ORIGINAL_MILITARY_BASES.industrySpecs[m.constructionQueue[0]]?.tags.includes('spaceport'))&&!m.industries.some(i=>!ORIGINAL_MILITARY_BASES.industrySpecs[i.state.industryId]?.tags.includes('population')&&i.operating.building&&i.operating.upgradeId===null),
                    }});
            },buildNextInQueue:()=>this.#buildNextConstructionQueue(m,{civicServices:services,militaryServices:services.militaryServices}),
        };
    }
    #advanceCivicEntry(m,entry,seconds,services={}){check(this.#loaded.has(m.marketId),'Civic advancement requires a loaded market');const row=validateOriginalCivicLifecycle(m).industries.find(row=>row.entry===entry);check(row,'Lost actual civic instance');return advanceOriginalCivicIndustryFrame(m,row,this.#nativeClock().convertToDays(seconds),this.#civicLifecycleRuntime(m,services),{colonyDebug:services.colonyDebug??false});}
    civicLifecycleState(marketId){return this.market(marketId).civicLifecycle??null;}
    advanceNativeCivicIndustry(marketId,industryId,seconds,services={}){return this.#operation(()=>{const m=this.market(marketId),entry=m.industries.find(e=>e.state.industryId===industryId);check(entry,'Actual civic instance required');return this.#advanceCivicEntry(m,entry,seconds,services);});}
    startNativeCivicUpgrade(marketId,industryId){return this.#operation(()=>startOriginalCivicUpgrade(this.market(marketId),industryId));}
    cancelNativeCivicUpgrade(marketId,industryId){return this.#operation(()=>cancelOriginalCivicUpgrade(this.market(marketId),industryId));}
    setNativeCivicDisrupted(marketId,industryId,days,useMax=false){return this.#operation(()=>{const m=this.market(marketId),result=setOriginalCivicDisrupted(m,industryId,days,useMax,this.#nativeMarketMemoryServices());for(const other of this.#markets.values())if(other!==m&&other.civicLifecycle?.memory===m.civicLifecycle.memory)syncOriginalCivicDisruption(other,this.#nativeMarketMemoryServices());return result;});}
    setNativeCivicSpecialItem(marketId,industryId,special){return this.#operation(()=>{const m=this.market(marketId),row=validateOriginalCivicLifecycle(m).industries.find(row=>row.active&&row.entry.state.industryId===industryId);check(row,'Actual civic instance required');setOriginalCivicSpecialItem(m,row,special);});}
    #nativeMarketMemoryServices(services={}){return {resolveEntity:id=>this.nativeEntityById(id),resolveMarket:id=>this.#markets.get(id)??null,...services};}
    #productionLifecycleRuntime(m,services={}){
        check(this.#loaded.has(m.marketId),'Production lifecycle requires a loaded market');validateOriginalProductionLifecycle(m);
        const memoryServices=this.#nativeMarketMemoryServices(services.memoryServices);
        return {memoryServices,timestamp:()=>String(this.#nativeClock().snapshot().timestamp),
            apply:row=>{
                syncOriginalProductionDisruption(m,memoryServices);
                if(m.personnel){row.entry.modifiers.adminSupplyBonus=this.readNativeMarketAdministratorModifier(m.marketId,'supply_bonus');row.entry.modifiers.adminDemandReduction=this.readNativeMarketAdministratorModifier(m.marketId,'demand_reduction');if(row.entry.state.industryId==='fuelprod')m.production.adminFuelSupplyBonus=this.readNativeMarketAdministratorModifier(m.marketId,'fuel_supply_bonus');}
                return applyOriginalLiveProductionIndustry(m,row.entry,{applyFinances:()=>this.#updateIndustryFinances(m.marketId,row.entry.state.industryId,'industry-apply'),readCommodityAvailable:id=>this.#currentCommodityAvailable(m,id)});
            },
            addPollution:()=>{this.#addGrowthCondition(m,'pollution');},removePollution:()=>this.#removeCondition(m,'pollution'),
            buildNextInQueue:()=>m.constructionQueue.length?this.#buildNextConstructionQueue(m,{productionServices:services,militaryServices:services.militaryServices}):null,
        };
    }
    #advanceProductionEntry(m,entry,seconds,services={}){const state=validateOriginalProductionLifecycle(m),row=state.industries.find(row=>row.entry===entry);check(row,'Lost actual production instance');return advanceOriginalProductionIndustryFrame(m,row,this.#nativeClock().convertToDays(seconds),this.#productionLifecycleRuntime(m,services),{colonyDebug:services.colonyDebug??false});}
    productionLifecycleState(marketId){return this.market(marketId).productionLifecycle??null;}
    advanceNativeProductionIndustry(marketId,industryId,seconds,services={}){return this.#operation(()=>{const m=this.market(marketId),entry=m.industries.find(e=>e.state.industryId===industryId);check(entry,'Actual current production industry required');return this.#advanceProductionEntry(m,entry,seconds,services);});}
    startNativeProductionUpgrade(marketId,industryId){return this.#operation(()=>startOriginalProductionUpgrade(this.market(marketId),industryId));}
    cancelNativeProductionUpgrade(marketId,industryId){return this.#operation(()=>cancelOriginalProductionUpgrade(this.market(marketId),industryId));}
    setNativeProductionDisrupted(marketId,industryId,days,useMax=false){return this.#operation(()=>{const m=this.market(marketId),result=setOriginalProductionDisrupted(m,industryId,days,useMax,this.#nativeMarketMemoryServices());for(const other of this.#markets.values())if(other!==m&&other.productionLifecycle?.memory===m.productionLifecycle.memory)syncOriginalProductionDisruption(other,this.#nativeMarketMemoryServices());return result;});}
    setNativeProductionSpecialItem(marketId,industryId,special){return this.#operation(()=>{const m=this.market(marketId),row=validateOriginalProductionLifecycle(m).industries.find(row=>row.active&&row.entry.state.industryId===industryId);check(row,'Actual production instance required');setOriginalProductionSpecialItem(m,row,special,this.#productionLifecycleRuntime(m));});}
    /** Explicit selected-memory phase; not the other conditions/submarkets/people of Market.advance. */
    advanceMilitaryMemoryPhase(marketId,seconds,{paused=false}={}){
        return this.#operation(()=>{const m=this.market(marketId);check(this.#loaded.has(marketId)&&m.industryLifecycle,'Actual loaded memory/lifecycle required');
            const expired=advanceOriginalMemoryFlags(m.military.memory,this.#nativeClock().convertToDays(seconds),paused);
            for(const other of this.#markets.values())if(other.industryLifecycle&&other.military.memory===m.military.memory)syncOriginalMilitaryDisruption(other);
            return immutableJSON({scope:'selected-military-memory-phase',expired});});
    }
    setMilitaryDisrupted(marketId,industryId,days,useMax=false){return this.#operation(()=>{const m=this.market(marketId);validateOriginalMilitaryLifecycle(m,this.#patrols);const result=setOriginalMilitaryDisrupted(m,industryId,days,useMax);for(const other of this.#markets.values())if(other!==m&&other.industryLifecycle&&other.military.memory===m.military.memory)syncOriginalMilitaryDisruption(other);return result;});}
    startMilitaryUpgrade(marketId,industryId){return this.#operation(()=>{const m=this.market(marketId);validateOriginalMilitaryLifecycle(m,this.#patrols);startOriginalMilitaryUpgrade(m,industryId);});}
    cancelMilitaryUpgrade(marketId,industryId){return this.#operation(()=>{const m=this.market(marketId);validateOriginalMilitaryLifecycle(m,this.#patrols);cancelOriginalMilitaryUpgrade(m,industryId);});}
    #instantiateConstructionIndustry(m,id,services={}){
        if(hasOriginalResourceFrame(id))return instantiateOriginalResourceIndustry(m,id);
        if(hasOriginalCivicFrame(id))return instantiateOriginalCivicIndustry(m,id);
        if(Object.hasOwn(ORIGINAL_PRODUCTION_INDUSTRIES.industries,id)){validateOriginalProductionLifecycle(m);return instantiateOriginalProductionIndustry(m,id);}
        check(Object.hasOwn(ORIGINAL_MILITARY_BASES.industries,id),'Queue/count plugin has no complete constructor implementation');validateOriginalMilitaryLifecycle(m,this.#patrols);syncOriginalMilitaryDisruption(m);
        return instantiateOriginalMilitaryIndustry(m,id,this.#patrolServices(services.militaryServices??{}));
    }
    #buildNextConstructionQueue(m,services={}){
        check(this.#loaded.has(m.marketId),'Construction requires a loaded market');validateOriginalConstructionQueue(m);
        const production=id=>Object.hasOwn(ORIGINAL_PRODUCTION_INDUSTRIES.industries,id),military=id=>Object.hasOwn(ORIGINAL_MILITARY_BASES.industries,id);
        const resource=()=>this.#resourceLifecycleRuntime(m,services.resourceServices),civic=()=>this.#civicLifecycleRuntime(m,services.civicServices),prod=()=>this.#productionLifecycleRuntime(m,services.productionServices),mil=()=>this.#militaryLifecycleRuntime(m,0,services.militaryServices??{});
        return buildNextOriginalConstructionQueue(m,{
            instantiate:id=>this.#instantiateConstructionIndustry(m,id,services),
            isAvailable:row=>{if(hasOriginalResourceFrame(row.entry.state.industryId)){check(m.buildAdmission,'Actual current market build-admission tags required');return isOriginalResourceIndustryAvailableToBuild({...m,tags:m.buildAdmission.tags??[]},row.entry.state.industryId,{readPlanetType:()=>this.#resourcePlanetType(m)});}if(military(row.entry.state.industryId))return m.industries.some(e=>e!==row.entry&&functional(e.operating)&&ORIGINAL_MILITARY_BASES.industrySpecs[e.state.industryId]?.tags.includes('spaceport'));check(m.buildAdmission,'Actual current market build-admission tags required');return row.entry.state.industryId!=='population'&&!(m.buildAdmission.tags??[]).includes('market_no_industries_allowed')&&m.industries.some(e=>e.state.industryId==='population');},
            add:id=>hasOriginalResourceFrame(id)?addOriginalResourceIndustry(m,id,resource()):hasOriginalCivicEffects(id)?addOriginalCivicIndustry(m,id,civic()):production(id)?addOriginalProductionIndustry(m,id,prod()):addOriginalMilitaryIndustry(m,this.#patrols,id,mil()),
            startBuilding:row=>{if(hasOriginalResourceFrame(row.entry.state.industryId))startBuildingOriginalResourceIndustry(m,row,resource());else if(hasOriginalCivicEffects(row.entry.state.industryId))startBuildingOriginalCivicIndustry(m,row);else if(production(row.entry.state.industryId))startBuildingOriginalProductionIndustry(m,row);else startBuildingOriginalMilitaryIndustry(m,row);},
            refundCredits:cost=>{const credits=this.playerEconomyState().fleet?.credits;check(credits&&Number.isFinite(credits.value),'Actual player credit handle required for construction refund');credits.value=f(credits.value+f(cost));},
            message:(row,kind,cost)=>{const state=hasOriginalResourceFrame(row.entry.state.industryId)?m.resourceLifecycle:hasOriginalCivicFrame(row.entry.state.industryId)?m.civicLifecycle:production(row.entry.state.industryId)?m.productionLifecycle:m.industryLifecycle;state.messages.push({marketId:m.marketId,industryId:row.entry.state.industryId,industryRef:row.objectRef,kind,cost,timestamp:String(this.#nativeClock().snapshot().timestamp),clickAction:'COLONY_INFO'});},
        });
    }
    #colonyCandidateImage(m,row){
        const runtime=this;return originalColonyCandidateImage(row.entry.state.industryId,{
            get size(){return m.size;},get planetType(){return runtime.#resourcePlanetType(m);},
            get gasGiant(){return runtime.#resourcePlanetIsGasGiant(m);},get specialItemId(){return row.special?.id??null;},
        });
    }
    #colonyConstructionServices(m){
        const rows=()=>['resourceLifecycle','civicLifecycle','productionLifecycle','industryLifecycle'].flatMap(key=>m[key]?.industries??[]);
        const directory=id=>{const d=ORIGINAL_COLONY_CONSTRUCTION.industries[id];check(d,'Actual installed industry spec required');return d;};
        const supports=id=>hasOriginalResourceFrame(id)?m.resourceLifecycle!==null:hasOriginalCivicFrame(id)?m.civicLifecycle!==null:Object.hasOwn(ORIGINAL_PRODUCTION_INDUSTRIES.industries,id)?m.productionLifecycle!==null:Object.hasOwn(ORIGINAL_MILITARY_BASES.industries,id)&&m.industryLifecycle!==null;
        const available=row=>{
            const id=row.entry.state.industryId;check(m.buildAdmission&&(m.buildAdmission.tags===null||Array.isArray(m.buildAdmission.tags)),'Actual market build-admission tags required');
            if(hasOriginalResourceFrame(id))return isOriginalResourceIndustryAvailableToBuild({...m,tags:m.buildAdmission.tags??[]},id,{readPlanetType:()=>this.#resourcePlanetType(m)});
            if(Object.hasOwn(ORIGINAL_MILITARY_BASES.industries,id))return m.industries.some(e=>e!==row.entry&&functional(e.operating)&&directory(e.state.industryId).tags.includes('spaceport'));
            return id!=='population'&&!(m.buildAdmission.tags??[]).includes('market_no_industries_allowed')&&m.industries.some(e=>e.state.industryId==='population');
        };
        return {
            getSpec:directory,supportsIndustry:supports,
            instantiate:id=>this.#instantiateConstructionIndustry(m,id),
            getIndustry:id=>rows().find(row=>row.active&&row.entry.state.industryId===id)??null,
            isAvailable:available,
            isHidden:row=>{
                if(Object.hasOwn(row,'hiddenOverride'))return row.hiddenOverride??false;
                if(!row.active||row.objectRef.startsWith('created-'))return false;
                const saved=this.#loadInputs.get(m.marketId)?.saved.industries.find(i=>i.objectRef===row.objectRef);
                check(saved&&Object.hasOwn(saved,'hiddenOverride'),'Actual captured industry hiddenOverride required');return saved.hiddenOverride??false;
            },
            showWhenUnavailable:row=>{
                const id=row.entry.state.industryId;
                if(['farming','aquaculture'].includes(id)&&(id==='aquaculture')!==(this.#resourcePlanetType(m)==='water'))return false;
                check(m.buildAdmission&&(m.buildAdmission.tags===null||Array.isArray(m.buildAdmission.tags)),'Actual market tags required');return !(m.buildAdmission.tags??[]).includes('market_no_industries_allowed');
            },
            readBuildCost:row=>row.buildCostOverride??directory(row.entry.state.industryId).cost,
            readIndustryCount:()=>originalConstructionIndustryCount(m,{instantiate:id=>this.#instantiateConstructionIndustry(m,id)}),
            readCurrentName:row=>directory(row.entry.state.industryId).name,
            readCurrentImage:row=>this.#colonyCandidateImage(m,row),
            allocateQueueItemRef:()=>{const state=this.playerEconomyState();return 'created-colony-queue:'+state.nativeUID.sectorRef+':'+nextOriginalNativeUID(state);},
            refreshEconomy:()=>this.refreshNativeColonyEconomy(),
        };
    }
    applyNativeColonyConstruction(marketId,action){return this.#operation(()=>{
        const m=this.market(marketId);check(this.#loaded.has(marketId),'Construction requires a loaded market');
        const keys={ 'inspect-build':['kind','marketId'],build:['kind','marketId','industryId','expectedCost'],'cancel-construction':['kind','marketId','industryId'],'swap-construction':['kind','marketId','industryId','otherIndustryId']};
        requireThat(action&&Object.hasOwn(keys,action.kind)&&Object.keys(action).length===keys[action.kind].length&&Object.keys(action).every(k=>keys[action.kind].includes(k))&&action.marketId===marketId,'INVALID_REQUEST','Invalid colony gesture');
        const credits=this.playerEconomyState().fleet?.credits,services=this.#colonyConstructionServices(m);
        if(action.kind==='inspect-build')return {kind:action.kind,marketId,inspection:inspectOriginalColonyConstructionBuildOptions(m,credits,services)};
        const target=id=>{identifier(id);const item=validateOriginalConstructionQueue(m).items.find(item=>item.industryId===id);requireThat(item,'STALE_SELECTION','Queued industry is no longer present');return {objectRef:item.objectRef,industryId:item.industryId,cost:item.cost};};
        const command=action.kind==='build'?{type:'build',industryId:action.industryId,expectedCost:action.expectedCost,confirmed:true}:action.kind==='cancel-construction'?{type:'cancel-queued',target:target(action.industryId)}:{type:'swap-queued',target:target(action.industryId),other:target(action.otherIndustryId)};
        return {kind:action.kind,marketId,receipt:executeOriginalColonyConstructionCommand(m,credits,command,services)};
    });}
    buildNextNativeConstructionQueue(marketId,services={}){return this.#operation(()=>this.#buildNextConstructionQueue(this.market(marketId),services));}
    editNativeConstructionQueue(marketId,industryId,action){return this.#operation(()=>editOriginalConstructionQueue(this.market(marketId),industryId,action));}
    /** Compatibility entry point; the queue now dispatches actual production and military plugins. */
    buildNextMilitaryQueue(marketId,services={}){return this.buildNextNativeConstructionQueue(marketId,{militaryServices:services});}
    /** Complete MilitaryBase.advance only. The enclosing Market/world frame and fleet factory remain separate. */
    advanceMilitaryIndustry(marketId,industryId,seconds,services={}){return this.#operation(()=>{const m=this.market(marketId);return advanceOriginalMilitaryIndustry(m,this.#patrols,industryId,this.#nativeClock().convertToDays(seconds),this.#militaryLifecycleRuntime(m,seconds,services),{colonyDebug:services.colonyDebug??false});});}
    routeSpatialState(){check(!this.#failed,'Failed shared draft must be discarded');return this.#routeSpace;}
    routePosition(routeRef){check(!this.#failed,'Failed shared draft must be discarded');const route=this.#patrols?.routes.find(r=>r.objectRef===routeRef);check(route,'Actual current route required');const space=validateOriginalRouteSpace(this.#routeSpace);return immutableJSON({routeRef,hyperPosition:originalRouteHyperPosition(space,route),containingLocationRef:route.current===null?null:originalRouteContainingLocation(space,route.current)});}
    setRouteFleetMousedOver(fleetRef,value){return this.#operation(()=>setOriginalRouteFleetMousedOver(validateOriginalRouteSpace(this.#routeSpace),fleetRef,value));}
    sensorState(){check(!this.#failed,'Failed shared draft must be discarded');return this.#sensors;}
    fleetVisibilityToPlayer(fleetRef){check(!this.#failed,'Failed shared draft must be discarded');return originalRouteFleetVisibility(this.#sensors,validateOriginalRouteSpace(this.#routeSpace),fleetRef);}
    fleetVisibilityForPlayerObserver(targetDataRef,observerDataRef,sensingDataRef=observerDataRef){check(!this.#failed,'Failed shared draft must be discarded');const target=this.#fleetForDataRef(targetDataRef),observer=this.#fleetForDataRef(observerDataRef);check(this.#sensors?.fleets.find(row=>row.objectRef===target.objectRef)?.fleet===target&&this.#sensors.fleets.find(row=>row.objectRef===observer.objectRef)?.fleet===observer,'Actual current observer and target sensor bindings required');check(originalRouteEntity(this.#routeSpace,target.objectRef).nativeFleet===target&&originalRouteEntity(this.#routeSpace,observer.objectRef).nativeFleet===observer,'Actual current observer and target spatial bindings required');const sensing=this.#fleetForDataRef(sensingDataRef);check(this.#sensors.fleets.find(row=>row.objectRef===sensing.objectRef)?.fleet===sensing&&originalRouteEntity(this.#routeSpace,sensing.objectRef).nativeFleet===sensing,'Actual sensing fleet bindings required');return originalRouteFleetVisibilityForPlayer(this.#sensors,validateOriginalRouteSpace(this.#routeSpace),target.objectRef,observer.objectRef,sensing.objectRef);}
    registerNativeFleetSensors(dataRef){return this.#operation(()=>registerOriginalConstructedSensorFleet(this.#sensors,this.#worldBinding(dataRef).fleet));}
    bindSensorFleet(fleet){return this.#operation(()=>bindOriginalSensorFleet(this.#sensors,fleet));}
    #routeFleetServices(services){
        const binding=ref=>{const b=this.fleetRosterState().bindings.find(b=>b.fleet.objectRef===ref);check(b?.fleet.campaign,'Actual constructed route fleet required; supply an external lifecycle for older captured fleets');return b;};
        const worldServices=services.worldServices??{};
        return {visibilityToPlayer:ref=>this.fleetVisibilityToPlayer(ref),
            despawnFleet:(ref,reason,param)=>this.despawnNativeFleet(binding(ref).fleet.dataRef,reason,param,worldServices),
            removeEntity:(locationRef,ref)=>this.removeNativeFleetFromLocation(binding(ref).fleet.dataRef,locationRef,worldServices),
            addFleetEventListener:(ref,state)=>{
                check(state===this.#patrols,'Actual shared RouteManager required');const world=this.#requiredFleetWorld();
                const listeners=[...world.managedFleetListeners.saved,...world.managedFleetListeners.transient,...this.fleetDataFactoryState().fleets.flatMap(f=>f.campaign?.despawnListeners??[])];
                const listener=listeners.find(l=>l.kind==='route-manager'&&l.state===state)??{objectRef:state.objectRef,kind:'route-manager',state};
                this.addNativeFleetEventListener(binding(ref).fleet.dataRef,listener);
            },...services};
    }
    advanceRouteFleetPhase(services={}){return this.#operation(()=>advanceOriginalRouteFleetPhase(this.#patrols,this.#routeSpace,this.#routeFleetServices(services)));}
    reportRouteFleetDespawned(fleetRef,reason){return this.#operation(()=>reportOriginalRouteFleetDespawned(this.#patrols,fleetRef,reason));}
    /** RouteManager time then entity phase. Missing real fleet/sensor services fail, never fabricate an entity. */
    advanceRouteManager(seconds,services={}){return this.#operation(()=>{const time=advanceOriginalRouteTime(validateOriginalPatrolState(this.#patrols),this.#nativeClock().convertToDays(seconds),{...services,timestamp:()=>String(this.#nativeClock().snapshot().timestamp)});const fleets=advanceOriginalRouteFleetPhase(this.#patrols,this.#routeSpace,this.#routeFleetServices(services));return immutableJSON({scope:'route-manager-time-and-fleet-phases',time,fleets,readyForAuthority:false});});}
    advanceRouteTimePhase(seconds,services){return this.#operation(()=>advanceOriginalRouteTime(validateOriginalPatrolState(this.#patrols),this.#nativeClock().convertToDays(seconds),{...services,timestamp:()=>String(this.#nativeClock().snapshot().timestamp)}));}
    /** Private identity checkpoint. Only an explicit native development host may persist it; never expose over HTTP or treat as a native save. */
    checkpoint() {
        check(!this.#failed&&this.#activeOperations===0,'Checkpoint requires a healthy draft between operations');this.#validateNativeMarketFrames();this.#validateStorageGraphs();
        if(this.#fleetServices?.towCableState!==null&&this.#fleetServices?.towCableState!==undefined)validateOriginalTowCablePersistentEntry(this.#fleetServices.towCableState,this.#towCableMembers());
        if(this.#fleetServices?.fleetWorld)this.#validateFleetWorld(this.#fleetServices.fleetWorld);
        for(const fleet of this.#fleetServices?.dataFactory?.fleets??[])if(fleet.campaign)validateOriginalFleetView(fleet);
        if(this.#engineFrame){validateOriginalCampaignEngineState(this.#engineFrame,this.#engineFrame.world);this.#validateImportantPeople();this.#validateIntelManager();this.#validateCampaignEventManager();}
        this.#validateNativeEncounterContexts(true);this.#validateNativeLocationFrames();this.#validateFactionRelations();
        return encodeOfflineCheckpoint({scope:'web-native-live-economy-checkpoint',schemaVersion:34,encounters:this.#encounters,factionRelations:this.#factionRelations,locationFrames:this.#locationFrames,engineFrame:this.#engineFrame,sensors:this.#sensors,routeSpace:this.#routeSpace,fleetServices:this.#fleetServices,patrols:this.#patrols,playerEconomy:this.#playerEconomy,readyForAuthority:false,
            notificationCapture:this.#notificationCapture,notificationReceivers:this.#notificationReceivers?.checkpoint()??null,notificationMode:this.#notificationMode,
            monthly:this.#monthly,nativeSchedule:this.#nativeSchedule,nativeScheduleCapture:this.#nativeScheduleCapture,
            source:this.#source,markets:[...this.#markets.values()],loadInputs:[...this.#loadInputs],loaded:[...this.#loaded],
            hostility:this.#hostility,playerStatsCaptured:this.#playerStatsCaptured,factionIds:this.#factionIds,
            playerExportModifiers:this.playerExportModifiers,inNewGameAdvance:this.inNewGameAdvance,growthListeners:this.#growthListeners,
            conditionSerial:this.#conditionSerial,secondsPerDay:this.#secondsPerDay,nativeClock:this.#clock?.snapshot()??null,clockSource:this.#clockSource,
            cache:this.#cache.checkpoint(),listenerCapture:this.#listenerCapture,economyListeners:this.#economyListeners?.checkpoint()??null,
            economyPass:this.#economyPass?.checkpoint()??null,economyPassCounts:this.#economyPassCounts,economyPassRequiresOutposts:this.#economyPassRequiresOutposts},{allowCycles:Boolean(this.#encounters.entries.length||this.#factionRelations||this.#engineFrame||this.#fleetServices?.fleetWorld||this.#fleetServices?.dataFactory?.fleets.some(fleet=>fleet.campaign&&(fleet.campaign.view.shipViews.views.length>0||fleet.campaign.view.lightSource!==null)))});
    }
    static fromCheckpoint(checkpoint,{readMaxOutposts}={}) {
        const s=decodeOfflineCheckpoint(checkpoint);
        if(s.scope==='web-native-live-economy-checkpoint'&&s.schemaVersion===1){check(!Object.hasOwn(s,'nativeSchedule')&&!Object.hasOwn(s,'nativeScheduleCapture'),'Legacy checkpoint cannot contain natural scheduler fields');s.schemaVersion=2;s.nativeSchedule=null;s.nativeScheduleCapture=null;}
        if(s.scope==='web-native-live-economy-checkpoint'&&s.schemaVersion===2){check(!Object.hasOwn(s,'monthly'),'Older checkpoint cannot contain monthly account state');s.schemaVersion=3;s.monthly=null;}
        if(s.scope==='web-native-live-economy-checkpoint'&&s.schemaVersion===3){check(!['notificationCapture','notificationReceivers','notificationMode'].some(k=>Object.hasOwn(s,k)),'Older checkpoint cannot contain notification state');s.schemaVersion=4;s.notificationCapture=null;s.notificationReceivers=null;s.notificationMode=s.nativeSchedule===null?null:'external-adapter';}
        if(s.scope==='web-native-live-economy-checkpoint'&&s.schemaVersion===4){check(!Object.hasOwn(s,'playerEconomy'),'Older checkpoint cannot contain player economy state');s.schemaVersion=5;s.playerEconomy=null;}
        if(s.scope==='web-native-live-economy-checkpoint'&&s.schemaVersion===5){
            for(const m of s.markets){
                check(!Object.hasOwn(m,'groundDefenses'),'Older checkpoint cannot contain the new shared defense field');
                const input=s.loadInputs.find(row=>row[0]===m.marketId)?.[1]?.input;
                check(input?.governedSkills,'Older checkpoint lacks actual defense capture');
                m.groundDefenses=m.governedState?.groundDefenses??structuredClone(input.governedSkills.groundDefenses??{flat:[],percent:[],mult:[]});
                if(m.governedState)m.governedState.groundDefenses=m.groundDefenses;
                if(m.economyBonuses)m.economyBonuses.ground_defenses_mod=m.groundDefenses;
            }
            s.schemaVersion=6;
        }
        if(s.scope==='web-native-live-economy-checkpoint'&&s.schemaVersion===6){for(const m of s.markets){check(!Object.hasOwn(m,'military'),'Older checkpoint cannot contain current military state');m.military=null;}s.schemaVersion=7;}
        if(s.scope==='web-native-live-economy-checkpoint'&&s.schemaVersion===7){check(!Object.hasOwn(s,'patrols'),'Older checkpoint cannot contain current patrol routes');s.patrols=null;s.schemaVersion=8;}
        if(s.scope==='web-native-live-economy-checkpoint'&&s.schemaVersion===8){check(!Object.hasOwn(s,'fleetServices'),'Older checkpoint cannot contain current fleet services');s.fleetServices=null;s.schemaVersion=9;}
        if(s.scope==='web-native-live-economy-checkpoint'&&s.schemaVersion===9){for(const m of s.markets){check(!Object.hasOwn(m,'industryLifecycle'),'Older checkpoint cannot contain current industry lifecycle');m.industryLifecycle=null;}s.schemaVersion=10;}
        if(s.scope==='web-native-live-economy-checkpoint'&&s.schemaVersion===10){check(!Object.hasOwn(s,'routeSpace'),'Older checkpoint cannot contain current route spatial state');s.routeSpace=null;s.schemaVersion=11;}
        if(s.scope==='web-native-live-economy-checkpoint'&&s.schemaVersion===11){check(!Object.hasOwn(s,'sensors'),'Older checkpoint cannot contain current sensor state');s.sensors=null;s.schemaVersion=12;}
        if(s.scope==='web-native-live-economy-checkpoint'&&s.schemaVersion===12){if(s.fleetServices){check(!Object.hasOwn(s.fleetServices,'shipSelection')&&!Object.hasOwn(s.fleetServices,'shipSelectionCapture'),'Older checkpoint cannot contain current ship-selection state');s.fleetServices.shipSelection=null;s.fleetServices.shipSelectionCapture=null;}s.schemaVersion=13;}
        if(s.scope==='web-native-live-economy-checkpoint'&&s.schemaVersion===13){if(s.fleetServices){check(!Object.hasOwn(s.fleetServices,'composition'),'Older checkpoint cannot contain current fleet composition state');s.fleetServices.composition=null;}s.schemaVersion=14;}
        if(s.scope==='web-native-live-economy-checkpoint'&&s.schemaVersion===14){if(s.fleetServices){check(!Object.hasOwn(s.fleetServices,'memberFactory'),'Older checkpoint cannot contain current member factory');s.fleetServices.memberFactory=null;}s.schemaVersion=15;}
        if(s.scope==='web-native-live-economy-checkpoint'&&s.schemaVersion===15){if(s.fleetServices){check(!Object.hasOwn(s.fleetServices,'rosters'),'Older checkpoint cannot contain current fleet rosters');s.fleetServices.rosters=null;}s.schemaVersion=16;}
        if(s.scope==='web-native-live-economy-checkpoint'&&s.schemaVersion===16){if(s.fleetServices){check(!Object.hasOwn(s.fleetServices,'dataFactory'),'Older checkpoint cannot contain current FleetData class objects');s.fleetServices.dataFactory=null;}s.schemaVersion=17;}
        if(s.scope==='web-native-live-economy-checkpoint'&&s.schemaVersion===17){if(s.fleetServices){check(!Object.hasOwn(s.fleetServices,'personFactory'),'Older checkpoint cannot contain current faction person factory');s.fleetServices.personFactory=null;}s.schemaVersion=18;}
        if(s.scope==='web-native-live-economy-checkpoint'&&s.schemaVersion===18){const factory=s.fleetServices?.dataFactory;if(factory){check(!Object.hasOwn(factory,'campaignResources')&&factory.fleets.every(fleet=>!Object.hasOwn(fleet,'campaign')),'Older checkpoint cannot contain world-fleet construction state');factory.campaignResources=null;}s.schemaVersion=19;}
        if(s.scope==='web-native-live-economy-checkpoint'&&s.schemaVersion===19){
            for(const fleet of s.fleetServices?.dataFactory?.fleets??[]){if(!fleet.campaign)continue;const c=fleet.campaign;
                check(fleet.logisticsEnvironment?.velocity===c.movement.velocity,'Invalid older world-fleet velocity binding');
                fleet.logisticsEnvironment.velocity=c.entity.velocity;c.entity.sensorProfile=fleet.sensorProfile;c.entity.sensorStrength=fleet.sensorStrength;
            }s.schemaVersion=20;
        }
        if(s.scope==='web-native-live-economy-checkpoint'&&s.schemaVersion===20){if(s.fleetServices){check(!Object.hasOwn(s.fleetServices,'towCableState'),'Older checkpoint cannot contain current Sector tow-cable state');s.fleetServices.towCableState=null;}s.schemaVersion=21;}
        if(s.scope==='web-native-live-economy-checkpoint'&&s.schemaVersion===21){if(s.fleetServices){check(!Object.hasOwn(s.fleetServices,'fleetWorld'),'Older checkpoint cannot contain current world registration');s.fleetServices.fleetWorld=null;}s.schemaVersion=22;}
        // Older Person Memory projections do not become complete Memory state on migration.
        if(s.scope==='web-native-live-economy-checkpoint'&&s.schemaVersion===22)s.schemaVersion=23;
        if(s.scope==='web-native-live-economy-checkpoint'&&s.schemaVersion===23){const world=s.fleetServices?.fleetWorld;if(world){check(!Object.hasOwn(world,'detectedEntityListeners'),'Older checkpoint cannot contain current detection listener ownership');world.detectedEntityListeners=null;}s.schemaVersion=24;}
        if(s.scope==='web-native-live-economy-checkpoint'&&s.schemaVersion===24){
            for(const fleet of s.fleetServices?.dataFactory?.fleets??[]){const view=fleet.campaign?.view;if(!view||view.contrails===null||view.contrails.scope==='native-campaign-contrail-engine-v2')continue;
                check(view.contrails.scope===undefined&&Array.isArray(view.contrails.contrails)&&view.contrails.contrails.length===0,'Older nonempty contrail history requires actual native restoration');view.contrails=createOriginalCampaignContrails();
            }s.schemaVersion=25;
        }
        if(s.scope==='web-native-live-economy-checkpoint'&&s.schemaVersion===25){check(!Object.hasOwn(s,'engineFrame')||s.engineFrame===null,'Older checkpoint cannot contain engine frame history');s.engineFrame=null;s.schemaVersion=26;}
        if(s.scope==='web-native-live-economy-checkpoint'&&s.schemaVersion===26){check(!Object.hasOwn(s,'locationFrames')||s.locationFrames===null,'Older checkpoint cannot contain location advance history');s.locationFrames=null;s.schemaVersion=27;}
        if(s.scope==='web-native-live-economy-checkpoint'&&s.schemaVersion===27){check(!Object.hasOwn(s,'factionRelations'),'Older checkpoint cannot contain current faction relationships');s.factionRelations=null;s.schemaVersion=28;}
        if(s.scope==='web-native-live-economy-checkpoint'&&s.schemaVersion===28){check(!Object.hasOwn(s,'encounters'),'Older checkpoint cannot contain retained encounters');s.encounters={scope:'web-retained-native-encounters',serial:0,entries:[]};s.schemaVersion=29;}
        if(s.scope==='web-native-live-economy-checkpoint'&&s.schemaVersion===29){check(Array.isArray(s.encounters?.entries),'Actual legacy encounter registry required');for(const entry of s.encounters.entries){check(!Object.hasOwn(entry,'aftermath'),'Older checkpoint cannot contain interaction aftermath');entry.aftermath=null;}s.schemaVersion=30;}
        if(s.scope==='web-native-live-economy-checkpoint'&&s.schemaVersion===30){for(const entry of s.encounters.entries){check(!Object.hasOwn(entry,'lootTransaction'),'Older checkpoint cannot contain cargo transaction');entry.lootTransaction=null;}s.schemaVersion=31;}
        if(s.scope==='web-native-live-economy-checkpoint'&&s.schemaVersion===31){for(const entry of s.encounters.entries)if(entry.lootTransaction!==null){check(!Object.hasOwn(entry.lootTransaction,'tookAll'),'Older checkpoint cannot contain take-all latch');entry.lootTransaction.tookAll=false;}s.schemaVersion=32;}
        if(s.scope==='web-native-live-economy-checkpoint'&&s.schemaVersion===32){for(const entry of s.encounters.entries)if(entry.lootTransaction!==null){const tx=entry.lootTransaction;check(!['sourceLoot','legacySharedSource','panelConfirmed'].some(key=>Object.hasOwn(tx,key)),'Older checkpoint cannot contain loot panel confirmation state');check(tx.loot===entry.context.loot,'Lost legacy shared loot identity');tx.sourceLoot=tx.loot;tx.legacySharedSource=true;tx.panelConfirmed=false;}s.schemaVersion=33;}
        if(s.scope==='web-native-live-economy-checkpoint'&&s.schemaVersion===33){const world=s.fleetServices?.fleetWorld;if(world){check(!Object.hasOwn(world,'cargoScreenListeners'),'Older checkpoint cannot contain CargoScreenListener ownership');world.cargoScreenListeners=null;}s.schemaVersion=34;}
        check(s.scope==='web-native-live-economy-checkpoint'&&s.schemaVersion===34&&s.readyForAuthority===false,'Unsupported shared economy checkpoint');
        economyShape(s,['scope','schemaVersion','encounters','factionRelations','locationFrames','engineFrame','sensors','routeSpace','fleetServices','patrols','playerEconomy','notificationCapture','notificationReceivers','notificationMode','monthly','nativeSchedule','nativeScheduleCapture','readyForAuthority','source','markets','loadInputs','loaded','hostility','playerStatsCaptured','factionIds','playerExportModifiers','inNewGameAdvance','growthListeners','conditionSerial','secondsPerDay','nativeClock','clockSource','cache','listenerCapture','economyListeners','economyPass','economyPassCounts','economyPassRequiresOutposts'],'offline shared economy checkpoint');
        check(Array.isArray(s.markets)&&s.markets.length<=4096&&Array.isArray(s.loadInputs)&&s.loadInputs.length===s.markets.length&&Array.isArray(s.loaded),'Invalid checkpoint market rosters');
        check(typeof s.playerStatsCaptured==='boolean'&&(s.inNewGameAdvance===null||typeof s.inNewGameAdvance==='boolean')&&typeof s.economyPassRequiresOutposts==='boolean','Invalid checkpoint flags');
        integer(s.conditionSerial,'condition object serial');check(Number.isFinite(s.secondsPerDay)&&s.secondsPerDay>0,'Invalid checkpoint day rate');
        const draft=new NativeLiveEconomyDraft(restoreToken), militaryMemories=new Map();
        draft.#routeSpace=s.routeSpace;if(s.routeSpace)validateOriginalRouteSpace(s.routeSpace,{allowUnresolved:true});
        draft.#patrols=s.patrols;if(s.patrols)validateOriginalPatrolState(s.patrols,{allowUnresolved:true});
        draft.#fleetServices=s.fleetServices;if(s.fleetServices){const services=s.fleetServices;if(Object.hasOwn(services,'productionVariants'))validateOriginalProductionVariantMap(services.productionVariants);if(Object.hasOwn(services,'dmodClassState'))validateOriginalDModClassState(services.dmodClassState);if(Object.hasOwn(services,'autofitClassState'))validateOriginalCoreAutofitClassState(services.autofitClassState);check(services.scope==='web-native-fleet-services'&&services.doctrineCapture?.scope==='native-faction-doctrine-inputs','Invalid current fleet services');validateOriginalPatrolBranchRandom(services.random);check(services.random.sourceSha256===s.source.campaignSha256,'Patrol random branch belongs to another source');if(services.doctrines!==null)validateOriginalFactionDoctrines(services.doctrines);check(Object.hasOwn(services,'shipSelection')&&Object.hasOwn(services,'shipSelectionCapture'),'Missing current ship-selection fields');if(services.shipSelection!==null){check(services.doctrines,'Shared doctrines required by current ship selection');validateOriginalShipSelection(services.shipSelection,services.doctrines);}check(Object.hasOwn(services,'composition'),'Missing current fleet composition state');if(services.composition!==null)validateOriginalFleetCompositionState(services.composition);}
        for(const m of s.markets){
            immutableJSON(m);identifier(m.marketId);check(!draft.#markets.has(m.marketId),'Duplicate checkpoint market');
            // Old checkpoints can reuse the current legacy queue, never resurrect stale loadInputs.
            if(!Object.hasOwn(m,'constructionQueueState'))m.constructionQueueState=m.industryLifecycle?.queue??null;
            if(m.constructionQueueState!==null)validateOriginalConstructionQueue(m);
            if(!Object.hasOwn(m,'buildAdmission'))m.buildAdmission=null;
            check(m.buildAdmission===null||m.buildAdmission&&Object.hasOwn(m.buildAdmission,'tags')&&(m.buildAdmission.tags===null||Array.isArray(m.buildAdmission.tags)&&m.buildAdmission.tags.every(tag=>typeof tag==='string')&&new Set(m.buildAdmission.tags).size===m.buildAdmission.tags.length),'Actual captured market tags required');
            if(!Object.hasOwn(m,'resourceLifecycle'))m.resourceLifecycle=null;else if(m.resourceLifecycle)validateOriginalResourceLifecycle(m);
            if(!Object.hasOwn(m,'resourcePlanetContext'))m.resourcePlanetContext=null;
            check(m.resourcePlanetContext===null||m.resourcePlanetContext&&Object.hasOwn(m.resourcePlanetContext,'planetEntityRef')&&(m.resourcePlanetContext.planetType===null||typeof m.resourcePlanetContext.planetType==='string')&&(m.resourcePlanetContext.planetEntityRef===null||typeof m.resourcePlanetContext.planetEntityRef==='string'),'Actual current resource planet type/reference required');
            if(!Object.hasOwn(m,'civicLifecycle'))m.civicLifecycle=null;else if(m.civicLifecycle)validateOriginalCivicLifecycle(m);
            if(!Object.hasOwn(m,'civicAdminInputs'))m.civicAdminInputs=null;
            if(!Object.hasOwn(m,'civicPortItemContext'))m.civicPortItemContext=null;
            if(!Object.hasOwn(m,'productionLifecycle'))m.productionLifecycle=null;else if(m.productionLifecycle)validateOriginalProductionLifecycle(m);
            for(const c of Object.values(m.commodities))check(c.demand===m.demandClasses[ORIGINAL_MARKET_ECONOMY.commodities[c.commodityId]?.demandClass],'Lost shared demand reference');
            if(m.production&&m.economyBonuses)check(m.production.productionQuality===m.economyBonuses.production_quality_mod,'Lost shared production quality');
            if(m.governedState&&m.economyBonuses)check(m.governedState.combatFleetSize===m.economyBonuses.combat_fleet_size_mult,'Lost shared combat bonus');
            check(Object.hasOwn(m,'military'),'Missing current military field');
            check(Object.hasOwn(m,'industryLifecycle'),'Missing current industry lifecycle field');if(m.industryLifecycle)validateOriginalMilitaryLifecycle(m,s.patrols);
            if(m.military){
                check(m.military.scope==='native-military-market-inputs'&&m.military.officerProbability===m.economyBonuses?.officer_prob,'Lost shared officer probability');
                const memory=validateOriginalMemoryFlags(m.military.memory), old=militaryMemories.get(memory.objectRef);
                check(!old||old===memory,'Lost shared military flag memory');militaryMemories.set(memory.objectRef,memory);
            }
            stat({base:0,modifiers:m.groundDefenses});
            if(m.governedState)check(m.governedState.groundDefenses===m.groundDefenses,'Lost shared governed defense bonus');
            if(m.economyBonuses)check(m.economyBonuses.ground_defenses_mod===m.groundDefenses,'Lost shared dynamic defense bonus');
            for(const key of ['population','incoming'])if(m[key]!==null)validateOriginalPopulation(m[key]);
            for(const sub of m.retail?.submarkets??[])if(sub.cargo)validateOriginalResourceCargo(sub.cargo);
            for(const row of m.retail?.otherSubmarkets??[])if(row.storage)validateOriginalStorageState(row.storage);
            draft.#markets.set(m.marketId,m);
        }
        for(const row of s.loadInputs){
            check(Array.isArray(row)&&row.length===2,'Invalid load context');const [id,input]=row;
            check(draft.#markets.has(id)&&!draft.#loadInputs.has(id)&&input.saved?.marketId===id,'Mismatched load context');immutableJSON(input);draft.#loadInputs.set(id,input);if(draft.#markets.get(id).name===undefined)draft.#markets.get(id).name=input.saved.name;
        }
        for(const id of s.loaded){check(draft.#markets.has(id)&&!draft.#loaded.has(id),'Invalid loaded market roster');draft.#loaded.add(id);}
        draft.#source=s.source;draft.#hostility=s.hostility;draft.#playerStatsCaptured=s.playerStatsCaptured;draft.#factionIds=s.factionIds;
        draft.playerExportModifiers=s.playerExportModifiers;draft.inNewGameAdvance=s.inNewGameAdvance;draft.#growthListeners=s.growthListeners;
        draft.#conditionSerial=s.conditionSerial;draft.#secondsPerDay=s.secondsPerDay;draft.#clockSource=s.clockSource;draft.#listenerCapture=s.listenerCapture;
        if(s.nativeClock!==null){check(s.nativeClock.secondsPerDay===s.secondsPerDay,'Checkpoint clock rate differs');draft.#clock=new OriginalNativeClock(s.nativeClock);}
        draft.#cache=OriginalCommodityNetworkCache.fromCheckpoint(draft.#cacheRuntime(),s.cache);
        for(const [id,commodityId]of s.cache.bindings)check(Object.hasOwn(draft.market(id).commodities,commodityId),'Cache binding names missing commodity');
        if(s.economyListeners!==null)draft.#economyListeners=OriginalEconomyUpdateListeners.fromCheckpoint(s.economyListeners,draft.#listenerRuntime());
        draft.#economyPassCounts=s.economyPassCounts;draft.#economyPassRequiresOutposts=s.economyPassRequiresOutposts;
        if(s.economyPass!==null){
            check(s.economyPass.mode==='scheduled'&&draft.#clock&&draft.#economyListeners&&draft.#loaded.size===draft.#markets.size,'Incomplete scheduled task context');
            economyShape(s.economyPassCounts,['conditionPasses','industryPasses','networkRebuilds','priceUpdates','populationAdvances','commodityCallbacks','finishCallbacks'],'checkpoint task counts');
            for(const value of Object.values(s.economyPassCounts))integer(value,'task count');
            if(s.economyPass.phase!=='done'&&s.economyPassRequiresOutposts)check(typeof readMaxOutposts==='function','Restore requires the external outpost getter');
            for(const key of ['main','again','immigration'])for(const id of s.economyPass[key]??[])draft.market(id);
            draft.#economyPass=OriginalEconomyTaskRunner.fromCheckpoint(draft.#scheduledRuntime(readMaxOutposts),s.economyPass);
        }else check(s.economyPassCounts===null&&!s.economyPassRequiresOutposts,'Task metadata without a task');
        draft.#monthly=s.monthly;if(draft.#monthly?.state)validateOriginalMonthlyAccounts(draft.#monthly.state);if(draft.#monthly&&Object.hasOwn(draft.#monthly,'productionRuntime'))draft.nativeCustomProductionState();
        draft.#playerEconomy=s.playerEconomy;draft.#bindPlayerEconomy(true);draft.#validateNativeMarketFrames();
        if(draft.#fleetServices){check(Object.hasOwn(draft.#fleetServices,'memberFactory'),'Missing current member factory field');if(draft.#fleetServices.memberFactory!==null)validateOriginalFleetMemberFactory(draft.#fleetServices.memberFactory,draft.#playerEconomy?.state??null,draft.#fleetServices.random.global);}
        if(draft.#fleetServices){check(Object.hasOwn(draft.#fleetServices,'rosters'),'Missing current fleet rosters field');if(draft.#fleetServices.rosters!==null)validateOriginalFleetRosterState(draft.#fleetServices.rosters,draft.#playerEconomy?.state??null,draft.#fleetServices.memberFactory);}
        if(draft.#fleetServices){check(Object.hasOwn(draft.#fleetServices,'dataFactory'),'Missing current FleetData factory field');if(draft.#fleetServices.dataFactory!==null)validateOriginalFleetDataFactory(draft.#fleetServices.dataFactory,draft.#fleetServices.memberFactory,draft.#playerEconomy?.state??null,draft.#fleetServices.rosters);}
        if(draft.#fleetServices){check(Object.hasOwn(draft.#fleetServices,'personFactory'),'Missing current faction person factory field');if(draft.#fleetServices.personFactory!==null)validateOriginalFactionPersonFactory(draft.#fleetServices.personFactory,draft.#playerEconomy?.state??null,draft.#fleetServices.random.global);}
        if(draft.#fleetServices){check(Object.hasOwn(draft.#fleetServices,'towCableState'),'Missing Sector tow-cable state field');if(draft.#fleetServices.towCableState!==null)validateOriginalTowCablePersistentEntry(draft.#fleetServices.towCableState,draft.#towCableMembers());}
        draft.#sensors=s.sensors;draft.#factionRelations=s.factionRelations;draft.#validateFactionRelations();
        draft.#validateStorageGraphs();
        if(draft.#fleetServices){check(Object.hasOwn(draft.#fleetServices,'fleetWorld'),'Missing world registration field');if(draft.#fleetServices.fleetWorld!==null)draft.#validateFleetWorld(draft.#fleetServices.fleetWorld);else for(const fleet of draft.#fleetServices.dataFactory?.fleets??[])if(fleet.campaign)check(!fleet.campaign.worldRegistered&&fleet.campaign.entity.containingLocation===null&&fleet.campaign.abilityRenderer===null,'Constructed world state requires its actual world graph');}
        if(s.sensors)validateOriginalFleetSensors(s.sensors,{allowUnresolved:true,playerFleet:draft.#playerEconomy?.state?.fleet??null});
        check([null,'external-adapter','native-receivers'].includes(s.notificationMode),'Unknown notification ownership mode');
        draft.#notificationCapture=s.notificationCapture;draft.#notificationMode=s.notificationMode;
        if(s.notificationReceivers!==null)draft.#notificationReceivers=OriginalEconomyNotifications.fromCheckpoint(s.notificationReceivers);
        if(s.notificationMode==='native-receivers'){
            check(draft.#notificationReceivers&&draft.#economyListeners&&draft.#monthly?.state&&s.nativeSchedule!==null,'Missing active notification state');
            const receivers=draft.#notificationReceivers.snapshot(),roster=draft.#economyListeners.managedRoster();
            check(Array.isArray(roster)&&roster.every(ref=>receivers.objects[ref]),'Unclassified restored manager registration');
            for(const o of Object.values(receivers.objects)){
                if(o.kind==='core')check(o.objectRef===draft.#monthly.coreRef,'Restored CoreScript account binding differs');
                if(o.kind==='local-resources')check(draft.#economyListeners.listener(o.objectRef).kind==='local-resources','Restored local-resource binding differs');
            }
        }
        else check(s.notificationReceivers===null,'Receiver state without native notification ownership');
        draft.#nativeScheduleCapture=s.nativeScheduleCapture;
        if(s.nativeSchedule!==null){
            draft.#nativeSchedule=restoreOriginalEconomySchedule(s.nativeSchedule);
            const schedule=draft.#nativeSchedule,pass=draft.#economyPass?.status();
            if(schedule.phase==='DOING_TASKS'){
                check(pass&&pass.mode==='scheduled'&&s.economyPass.params.withStockpileUpdate===(schedule.iterLeft===0),'Schedule/task parameters differ');
                const rank=['main','reapply-again','immigration','finish','done'].indexOf(pass.phase);
                check(rank>=schedule.taskIndex&&rank<4,'Schedule/task cursor differs');
                // Later ranks are valid only for empty tasks that the batch runner skips but the native queue retains for one frame.
                if(rank>schedule.taskIndex)for(let n=schedule.taskIndex;n<rank;n++)check(n===1?s.economyPass.again.length===0:n===2?s.economyPass.immigration.length===0:false,'Nonempty native task was skipped');
            }else check(!pass||pass.phase==='done','Waiting scheduler has an unfinished task');
        }
        check(Object.hasOwn(s,'engineFrame'),'Missing engine frame state field');if(s.engineFrame!==null){validateOriginalCampaignEngineState(s.engineFrame,s.engineFrame.world);check(!draft.#fleetServices?.fleetWorld||s.engineFrame.world===draft.#fleetServices.fleetWorld,'Lost shared engine/world identity');draft.#engineFrame=s.engineFrame;draft.#validateImportantPeople();draft.#validateIntelManager();draft.#validateCampaignEventManager();}
        draft.#locationFrames=s.locationFrames;draft.#encounters=s.encounters;draft.#validateNativeEncounterContexts(true);draft.#validateNativeLocationFrames();
        return draft;
    }
    /** Frozen offline inspection (may contain world cycles). Use checkpoint() for JSON interchange. Network JSON limits are unchanged. */
    snapshot() {
        check(!this.#failed, 'Failed shared draft must be discarded');
        check(this.#markets.size<=4096, 'Offline market snapshot exceeds market limit');
        const headerState={scope:'native-shared-offline-economy-draft-only',encounters:this.#encounters,factionRelations:this.#factionRelations,locationFrames:this.#locationFrames,engineFrame:this.#engineFrame,sensors:this.#sensors,routeSpace:this.#routeSpace,fleetServices:this.#fleetServices,patrols:this.#patrols,playerEconomy:this.#playerEconomy,notificationMode:this.#notificationMode,economyNotifications:this.#notificationReceivers?.snapshot()??null,monthlyAccounts:this.#monthly?.state??null,nativeSchedule:this.#nativeSchedule,source:this.#source,inNewGameAdvance:this.inNewGameAdvance,nativeClock:this.#clock?.snapshot()??null,clockProvenance:this.#clockSource,economyListeners:this.#economyListeners?.snapshot()??null,economyPass:this.scheduledEconomyStatus(),readyForAuthority:false};
        const graph=(this.#encounters.entries.length||this.#factionRelations||this.#engineFrame||this.#fleetServices?.fleetWorld||this.#fleetServices?.dataFactory?.fleets.some(fleet=>fleet.campaign&&(fleet.campaign.view.shipViews.views.length>0||fleet.campaign.view.lightSource!==null)))?encodeOfflineCheckpoint(headerState,{allowCycles:true}):null,header=graph?decodeOfflineCheckpoint(graph):immutableJSON(headerState);
        if(graph){const visited=new Set(),pending=[header];while(pending.length){const value=pending.pop();if(value===null||typeof value!=='object'||visited.has(value))continue;visited.add(value);for(const child of Object.values(value))pending.push(child);Object.freeze(value);}}
        const markets=[];let bytes=Buffer.byteLength(JSON.stringify(graph??header));
        for(const value of this.#markets.values()) {
            // Each market still passes the ordinary 250000-node/depth/JSON checks independently.
            const market=immutableJSON(value);bytes+=Buffer.byteLength(JSON.stringify(market));
            check(bytes<=64*1024*1024,'Offline market snapshot exceeds byte limit');
            markets.push(market);
        }
        return Object.freeze({...header,markets:Object.freeze(markets)});
    }
}

/** Native runtime remains incomplete; only explicit development hosts may persist it. */
export {NativeLiveEconomyDraft as NativeCampaignRuntime};
