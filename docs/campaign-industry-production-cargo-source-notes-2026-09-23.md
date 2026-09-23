# Industry production cargo — source notes (2026-09-23)

## Before implementation
- Version: installed Starsector 0.98a-RC8. Read `decompiled/starfarer_api_source/com/fs/starfarer/api/impl/campaign/econ/impl/BaseIndustry.java:1853-1859` and `TechMining.java:160-300`; `starsector-core/data/config/settings.json:540`.
- Evidence → behavior: BaseIndustry returns null unconditionally; only TechMining overrides the gathering-point method in the installed vanilla industry package. Non-tech industries must not require a cargo callback, memory, RNG or functional-state read.
- TechMining: nonfunctional returns null; absent `$core_techMiningMult` initializes to 1; decay is written before salvage. Ruin order vast/extensive/widespread/scattered gives 1/.6/.35/.2; multiply by the existing dynamic effectiveness stat. First find uses the **pre-decay** mult >= 1, one nextFloat, rounded max(1,base*(5+2*r)). Five random drop groups plus first-find and basic value 10000 go to SalvageEntity with (1,1,base*mult,1).
- `SalvageEntity.java:927-931`: existing `generateEncounterExtraDrops(random,valueMult,overallMult,fuelMult,dropValue,dropRandom)` has the exact overload needed here, because TechMining's randomMult is 1. Its real implementation is a required dependency, never a null/empty fallback.
- `TechMining.java:259-295`: after real cargo generation remove a complete stack only if **all** provided ship/weapon/fighter/industry blueprints are known; keep mixed packages with anything unknown. Known hullmod specs are removed. Faction.java:568-574 calls CharacterData.knowsHullMod for player; cross-check PlayerCharacterData.java:96-98 delegates to CampaignUI.isHullModAvailable. Reuse OriginalPlayerHullmods (skills + always-unlocked specs + actual character hullMods), not the private Faction hullmod set. CargoData.java:527-530 removes the exact stack and updates space; do not replace it with removeItems.
- Current gap before patch: existing special-industry economic effects apply the dynamic multiplier, but no gathering-point dispatch; encounter salvage rejects nonempty drop groups without a real service. Existing resource lifecycle covers farming/aquaculture/mining, NOT techmining. Reuse the market's shared Memory instead of adding a parallel tech state or placing techmining into the resource-only lifecycle.
- Verification: mainline owns one combined run. Suggested minimum assertions: ordinary mining returns null with no context/random and no callback; disrupted/building techmining returns null without changing memory/random; first successful techmining call decays 1 to float32 .95 and uses the actual configured drop lists, subsequent call omits first-find; unknown package contents retain whole stack; absent salvage rejects explicitly.
- No UI changes. Original in-game gathering-point UI/interaction unverified; user forbids desktop/private saves. No authority claim: readyForAuthority=false, simulation.status=unavailable remain unchanged.

## Landed API / Runtime integration

Files:
- `src/campaign/rules/OriginalIndustryProductionCargo.mjs` and `.d.mts`
- `src/campaign/data/reference-industry-production-cargo.json` (33 configured vanilla industry IDs, source SHA-256s, extracted drop lists/decay)
- `scripts/import-campaign-industry-production-cargo.mjs` (standalone importer, not added to a public check/package script)

```js
// Existing OriginalCustomProduction service. Resolve the owner by entry identity,
// not by industryId (multiple colonies can have the same industry).
generateIndustryProductionCargo: (entry, random) => {
  if (entry.state.industryId !== 'techmining') {
    return generateOriginalIndustryProductionCargo(entry, random);
  }
  // Nonfunctional TechMining also accepts omitted context and returns null.
  // For functional TechMining use the actual owner market m and shared world state:
  return generateOriginalIndustryProductionCargo(entry, random, {
    marketMemory: m.nativeFrame.memory,
    conditions: m.conditions,
    techMiningMult: m.special.techMiningMult,
    playerFaction, shipSelection, playerEconomy,
  }, {
    generateEncounterExtraDrops, // existing exact SalvageEntity overload, not an empty fallback
    readIndustryProductionBlueprints, // actual special plugin getters, when not a local known plugin
    isIndustryProductionBlueprintKnown, // needed for industry lists; optional for ship lists
  });
}
```

- There is **no new serialized production/tech state**. Memory/RNG/cargo are modified in place inside the existing atomic Runtime operation. Keep market.nativeFrame.memory and all bound lifecycle memories identical; never copy a tech multiplier out into a second lifecycle.
- Existing field `market.special.techMiningMult` is dynamic effectiveness including core/improvement effects, not the persisted depletion float. The latter is only `$core_techMiningMult` in Memory.
- No service required for BaseIndustry. Unknown/modded industry IDs reject instead of silently inheriting the vanilla default.
- Functional TechMining currently needs the true nonempty salvage service. The repository's encounter path also only exposes that service hook, and refuses nonempty lists otherwise. This change does **not** claim the missing full DropGroupRow/special-blueprint generator is implemented. No new probability table, no zero-rolls substitution, no empty callback/cargo fallback.
- Native ModSpecItem and Base/Shrouded special plugins are recognized directly. Real BlueprintProviderItem packages/single-blueprint plugins must supply their nullable lists through `readIndustryProductionBlueprints`. Absent custom plugin support rejects. No blueprint is learned by this method; all-known stacks are removed from the generated cargo.
- Weapon/fighter membership uses `OriginalFactionEquipment`; ships use the existing `OriginalShipSelection` player row, with an optional true membership service; hullmods use `OriginalPlayerHullmods` from the live player state (or the existing equipment service). The current Faction state does not contain knownIndustries: explicit real service required only if an industry-blueprint list is reached.
- Numeric Memory values use native float32. A nonnumeric historical value requires exact `readIndustryProductionMemoryFloat` coercion rather than JS `parseFloat` or guessed locale parsing.
- Missing generator is rejected before Memory/RNG mutation. Failures later in the real generator/provider chain must be rolled back by the existing Runtime transaction, not silently consumed.

## Mainline-only acceptance suggestions (not run by this worker)

```js
assert.equal(generateOriginalIndustryProductionCargo({state:{industryId:'mining'}}, null), null);
assert.equal(generateOriginalIndustryProductionCargo({state:{industryId:'techmining'}, operating:{disrupted:true,building:false,upgradeId:null}}, null), null);
// Existing native-production scenario: invoke normal colony delivery without a fake
// generateIndustryProductionCargo callback, and assert no industry batch is created.
// Existing tech scenario with its real Salvage service: initial depletion 1 ->
// Math.fround(.95), first-find is included only on the pre-decay >= 1 branch.
```

Validation performed here: original source reading and reference-data extraction only. Per latest instruction, no public test, typecheck, lint, private save, desktop, staging, commit, push, package or release was run. Mainline owns combined acceptance. No Runtime, CustomProduction, CampaignEngine, FleetFactory, public checks or total-progress files were edited.
