# Colony candidate getCurrentImage — source notes (2026-09-22)

## Evidence → behavior (before implementation)

Installed Starsector 0.98a-RC8. Sources are under `decompiled/starfarer.api/com/fs/starfarer/api/impl/campaign/econ/impl/` unless stated otherwise.

| Original evidence | Expected image rule |
| --- | --- |
| `BaseIndustry.java:53-54,811-817` | Small image threshold 3, large threshold 6; default image is spec.imageName; BaseName is spec.name. |
| `Farming.java:101-114` | aquaculture immediately uses spec image; farming reads size then low/med/high (<=3, >=6). |
| `Mining.java:98-107` | Read size first; actual non-null gas-giant planet takes precedence; otherwise size<=3 low, else spec image. |
| `PopulationAndInfrastructure.java:275-284` | size<=3 pop_low, size>=6 pop_high, otherwise spec image. |
| `LightIndustry.java:42-61` | Read size, then planet. No planet or gas giant uses orbital low/mid/high; terrestrial uses low/spec/high. |
| `FuelProduction.java:34-39` | ANY non-null special item gives advanced_fuel_prod; null uses spec image. This is only an image rule, not an item-effect admission gate. |
| `MilitaryBase.java:227-234` | Only id militarybase changes to military_base_orbital when no planet or gas giant. Patrol HQ/high command still use spec image. |
| `GroundDefenses.java:56-63` | Only heavybatteries changes to heavy_batteries_orbital when no planet or gas giant. Ordinary grounddefenses still uses spec image. |
| `TradeCenter.java:105-114` | commerce also has low/spec/high size images. Included to avoid an incorrect Base fallback. |
| `LionsGuardHQ.java:112-114` | Explicit override simply returns Base image. |
| `starsector-core/data/config/settings.json:1435-1453` | All industry sprite keys below are copied from the original sprite-name table, not inferred asset names. |

## Contract / boundary

New independent module `OriginalColonyCandidateImage.mjs/.d.mts` exports:

- `originalColonyCandidateImage(industryId, inputs)` returns the native resource path (or the directory's null base image), never a web asset URL.
- `originalColonyCandidateImageNeeded(industryId)` returns the possible field reads in native order, so the host can bind only needed real inputs. Fields: `size`, `planetType`, `gasGiant`, `specialItemId`.

`planetType=null` explicitly means **no market planet entity**; a nonempty type ID means an actual planet exists. The type string is NOT used to infer gas-giant status. `gasGiant` is the actual isGasGiant boolean and is only read when planetType is non-null, following native short-circuiting. Missing required fields reject; nothing substitutes a guessed historical value or zero. `specialItemId=null` means no installed item; any actual non-null ID follows the native fuel image branch. Size is the actual nonnegative Java int market size, converted to float for the native comparisons. Unneeded fields are not accessed; aquaculture and Base-image industries can use `{}`.

Static needed sets: farming/population/commerce → size; mining/lightindustry → size,planetType,gasGiant; militarybase/heavybatteries → planetType,gasGiant; fuelprod → specialItemId; all other directory IDs → none. The gasGiant field is only conditionally needed at runtime as described above.

Default metadata is read from the existing original construction directory. No changes to Runtime, construction execution, image loading, availability, item support, or special effects. BaseName remains directory spec.name; no new name helper needed. Native image resolution and UI call-sites are source-verified only. No original live screenshots or Web verification performed, and no validation/test commands run; main task retains unified acceptance.
