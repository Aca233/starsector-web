# Native Starsector catalog import

## Scope and command

From the web project, run:

```powershell
node scripts/import-native-catalog.mjs
# Optional alternate core installation (relative to the current shell, or absolute):
node scripts/import-native-catalog.mjs 'C:\Program Files (x86)\Starsector\starsector-core'
# Write the same outputs, but exit nonzero if sources cannot parse/resolve or media is missing/rejected:
node scripts/import-native-catalog.mjs --strict
```

The default source is the sibling `../starsector-core`, resolved relative to the
importer's project directory, not the shell's working directory. Node's standard
library is sufficient; this importer does not need a Vite server, Java, or new
packages. It does not change the existing curated content importer, runtime
normalizer, package scripts, engine, or UI.

Outputs:

- `src/engine/data/generated/native-catalog.json`
- Referenced assets beneath `public/game-assets/graphics` and
  `public/game-assets/sounds`
- Additive updates to `public/game-assets/asset-manifest.json`

This is a **complete local core data catalog**, not a claim that native Java
weapon effects, ship systems, campaign rules, or hullmod behavior have been
implemented in JavaScript. Native classes, plugin names, script references, and
unrecognized source properties remain inert data. The runtime adapter determines
which behaviors it implements and how to present unsupported entries.

## Catalog contract (schemaVersion 1)

```text
{
  schemaVersion: 1,
  ships: [{ id, name, hullSize, sprite, sourcePath, stats, spec,
            baseHullId?, baseSourcePath?, csvSourcePath?, skinSpec?, unresolved? }],
  weapons: [{ id, name, sourcePath, stats, spec, csvSourcePath? }],
  wings: [CSV record],
  hullmods: [CSV record],
  systems: [{ id, sourcePath, spec, stats, csvSourcePath? }],
  variants: [{ id, sourcePath, spec }],
  projectiles: [{ id, sourcePath, spec }],
  descriptions: [CSV record],
  configs: [{ sourcePath, spec }],
  indexes: { ... },
  report: { counts, discovered, missingAssets, parseErrors, ... }
}
```

- Discover `.ship`, `.skin`, `.wpn`, `.proj`, `.variant`, and `.system` files
  recursively under core `data/`. Discovery is **not** limited to IDs present in
  CSV or to filename conventions.
- IDs come from `hullId`, `skinHullId`, `id`, or `variantId` as appropriate.
  A missing ID is reported before a filename fallback is used. Filename/ID
  mismatches are reported, not silently renamed.
- `sourcePath` and `csvSourcePath` are installation-relative forward-slash paths.
  No absolute installation path is embedded in the generated catalog.
- `sprite` remains `graphics/...`, never an absolute URL or `/game-assets/...`.
  Consumers resolve URLs through their normal asset resolver.
- Base ship `name` prefers localized CSV `name`, then source `hullName`, then ID.
  Weapon names similarly prefer their CSV. The raw source name remains in `spec`.
- `stats` retains CSV column spelling, string values, and empty strings. Base
  ships/weapons absent from CSV receive `{}` and an `unlistedDefinitions` entry;
  no hull stats are invented. Blank-ID/separator rows and commented-out records
  are excluded; meaningful rows marked hidden/deprecated are retained.
- Non-skin `spec` is the parsed source object, including fields the current web
  runtime does not understand. Only skin `spec` is an explicitly resolved hull.
  `skinSpec` preserves the complete, unmerged source skin object.
- Descriptions may share an ID across types/sections. They are not deduplicated.
- `configs` preserves other parsed JSON, faction and skill records, plus related
  CSV tables. This includes `data/config/sounds.json`, `settings.json`,
  `engine_styles.json`, and `hull_styles.json`. Native campaign data is archival,
  not evaluated by the importer. The six primary CSVs live in the main contract
  instead of being duplicated here.

### Skin resolution

Resolve `baseHullId` through declared hull/skin IDs (recursively), never by
constructing a filename. Detect missing bases and inheritance cycles. A broken
skin is retained and marked `unresolved`, with an explicit report entry.

For a valid skin:

1. Inherit base geometry, bounds, hull size, engine definitions, source properties,
   and base CSV stats. Overlay the skin's scalar/source fields and set the
   resolved `hullId` to its `skinHullId`.
2. Apply `weaponSlotChanges` by weapon slot ID. Remove `removeWeaponSlots` and
   their inherited built-in weapons.
3. Apply `engineSlotChanges` and `removeEngineSlots` by **original engine index**,
   without shifting later indices before changes are applied.
4. Remove `removeBuiltInMods`/`removeBuiltInWeapons`, then merge skin built-ins.
   `builtInWings` replaces the inherited array when present; `[]` really clears it.
5. Merge tags and apply hint additions/removals, including CSV tags/hints.
6. Translate the skin's stat keys into their CSV columns, keeping values strings:
   e.g. `ordnancePoints` -> `ordnance points`, `systemId` -> `system id`,
   `maxSpeed` -> `max speed`, `shieldEfficiency` -> `shield efficiency`,
   `suppliesToRecover` -> `supplies/rec`. Apply `baseValueMult` to `base value`.
   An explicit zero or empty system override is not treated as absent.

`stats` on skins is consequently an effective, CSV-shaped record rather than an
independent CSV row. `baseHullId`, `baseSourcePath`, `csvSourcePath`, the base
catalog record, and `skinSpec` retain the provenance needed to reconstruct it.
Do not apply skin multipliers/removals again in the runtime normalizer.

## Indexes and ambiguous native IDs

Arrays preserve **every discovered source record**, even when native sources
share the same declared ID. Consumers must not assume record counts equal unique
ID counts.

- `indexes.ships[id]`, `indexes.weapons[id]`, etc.: preferred array position.
  If a declared ID appears more than once, a filename equal to that ID is
  preferred; otherwise stable source-path ordering determines the first entry.
- `indexes.descriptions[id]`: all matching description positions.
- `indexes.idOccurrences[collection][id]`: all positions with that declared ID.
- `indexes.fileNames[collection][filenameStem]`: all positions from that filename,
  including native filename aliases that differ from IDs.
- `indexes.sourcePaths[sourcePath]`: `{ collection, index }` for exact source
  selection. CSV-backed wings/hullmods/descriptions use `report.csvSources`.
- `indexes.configs[sourcePath]`: config array position.

Some native references are filename-based. Examples in this installation:

- `buffalo_mk2.ship` declares `buffalo2`; `constructionrig.ship` declares `crig`;
  `warhound.ship` declares `cerberus`.
- `manticore_pather.skin` declares `manticore_luddic_path`.
- `canister_flak.proj` declares `canister_flak_proj`; `locust_srm.proj` declares
  `locust`. Weapons use the filenames as projectile references.
- `fighters/khopesh_Bomber.variant` declares `hoplon_Escort`; wing data references
  `khopesh_Bomber`.
- The dweller `shrouded_ejecta_Churning` and `shrouded_vortex_Churning` filenames
  contain each other's declared variant IDs. Exact filename lookup avoids
  silently swapping these variants.

Four duplicate-ID groups are retained:

| Collection | Declared ID | Distinct source records |
| --- | --- | --- |
| ships | `module_bastion_pd1` | normal and `_lowtech` `.ship` files |
| variants | `kite_hegemony_Interceptor` | root and `kite/kite_Interceptor` |
| variants | `kite_original_Stock` | root and `kite/kite_Stock` |
| variants | `ziggurat_Experimental` | `_Experimental` and `_HF` |

`report.unresolvedReferences` checks known hull, built-in, weapon, projectile,
wing, hullmod, system and module references against declared IDs **or** filename
aliases. Zero missing references does not imply native gameplay parity or remove
filename/declared-ID ambiguity. The runtime selects its appropriate lookup policy.

## Native text dialect

The self-contained parser follows the dialect handled by
`StarsectorTextParsers`, with additional support needed by actual local core
files:

- UTF-8 BOM, `#`, `//`, and block comments outside strings;
- unquoted object keys and enum tokens;
- numbers such as `.67`, `1f`, `0.5f`, and exponent forms;
- trailing commas/semicolons inside collections;
- a single trailing separator after the root object (present in the Manticore
  skin and several faction files).

It rejects unfinished strings/collections, non-finite numeric values, unexpected
trailing content, and excessive nesting. It never runs `eval` or Java.

CSV parsing handles BOMs, CRLF, multiline quoted fields, doubled quotes, embedded
commas, comments and separator rows. Named columns retain their source names;
unnamed trailing columns follow object/last-value semantics, as in the existing
project CSV parser. Parse failures identify their source path and are surfaced in
both the output report and terminal summary rather than silently skipped.

## Asset closure and preservation

The importer scans media strings in all parsed catalog/config/CSV data and literal
media paths in core data Java/text/sample files. The latter are read only for
literal paths; neither their source code nor their classes are copied into
`public`. Font page references are followed transitively. Explicitly referenced
media directories are traversed only for allowed media extensions.

Only safe `graphics/...` and `sounds/...` destinations are permitted. Paths are
checked against the source root and destination workspace, including existing
symlink/junction ancestors; symbolic links encountered during traversal are
skipped and reported. Nothing enumerates the installation root for copying, scans
saves, extracts a JAR, or executes native code.

Existing asset files are never overwritten or deleted. The importer uses
exclusive copy for missing files. Existing manifest entries retain their IDs,
groups, provenance, sampler properties, and custom font metadata. A second
manifest read immediately before writing merges concurrent additions/overrides
rather than restoring a stale snapshot. New entries append in stable path order.

Every new image receives explicit sampler metadata matching the existing asset
importer's policy: repeat only for the relevant FX beam/shield/contrail/engineglow
paths, otherwise clamp; linear filters; no mipmap. **Existing sampler choices are
not recalculated.** Every new font gets `font: { family, glyphAtlases }`; bitmap
font pages are copied as dependencies. Missing required font fields may be filled
from that font's imported descriptor, but valid existing metadata is preserved.
`bytes` and `hash` are optional for the runtime, so the importer neither generates
hashes nor performs an asset-size/integrity audit. Existing metadata is retained.

The explicitly referenced `sounds/music/music.bin` is copied as an inert native
music container (`type: other`), **not** a playable browser audio file. Its
`source`/`file` metadata remains in the sounds config. Extracting/decoding that
container is separate runtime/media work and is listed in `nativeOnlyAssets`;
no claim is made that HTML audio can play it directly.

The importer does not generate replacement artwork for missing native assets.
A failed media dependency is recorded with every source that references it.
JSON outputs are written through a temporary file and rename, not incrementally.
There are deliberately no new automated tests or test-runner changes.

## Local import result — 2026-09-16

| Data | Records |
| --- | ---: |
| Ships (including skins and duplicate source IDs) | 269 |
| Base `.ship` definitions | 203 |
| Resolved `.skin` definitions | 66 |
| Weapons | 163 |
| Fighter wings | 31 |
| Hullmods | 129 |
| Ship systems | 63 |
| Variants | 447 |
| Projectiles | 110 |
| Descriptions | 736 |
| Related configs/tables | 179 |
| Read source files | 1,378 |
| Referenced media paths | 3,072 |
| Available referenced media | 3,067 |
| Total manifest entries (including preserved existing entries) | 3,135 |

Initial run copied 2,852 previously absent files and appended 2,884 manifest
entries (some unmanifested assets already existed). The subsequent run copied no
files and appended no entries, preserving all 3,067 available dependencies.

- **0 parse errors**
- **0 skin-resolution errors**
- **0 unresolved known data references**, considering filename aliases
- **0 unmatched active ship/weapon/system CSV rows**
- **4 duplicate-ID groups**, preserved and indexed as above
- **2 unlisted hulls**: `flare` and `module_hightech_decor`, retained with empty
  stats instead of excluded
- **5 missing assets**, all referenced by `data/campaign/channels.json`:
  - `graphics/icons/intel/diktat_intelligence.png`
  - `graphics/icons/intel/hegemony_intelligence.png`
  - `graphics/icons/intel/hegemony_public.png`
  - `graphics/icons/intel/tritachyon_internal.png`
  - `graphics/icons/intel/tritachyon_public.png`

These five optional channel icons are absent from the source installation; they
are not ship or weapon sprites. The ordinary command successfully writes the
catalog with this diagnostic. `--strict` intentionally returns exit code 1 while
these dependencies remain missing. Counts describe source data/assets, not a
number of verified playable ships or implemented native effects.
