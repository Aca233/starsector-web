# Uses original simulator entries, native deployment costs, and already-imported loadouts.
$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$core = Join-Path (Split-Path -Parent $project) 'starsector-core'
$rows = Import-Csv -LiteralPath (Join-Path $core 'data/hulls/ship_data.csv')
$costs = @{}
foreach ($row in $rows) { if ($row.id -and $row.'supplies/rec') { $costs[$row.id] = [double]$row.'supplies/rec' } }
$civilian = @($rows | Where-Object { $_.hints -match 'CIVILIAN' } | ForEach-Object { $_.id })
$variants = Get-Content -LiteralPath (Join-Path $project 'src/engine/data/generated/refit-variants.json') -Raw | ConvertFrom-Json -AsHashtable
$lookup = @{}
foreach ($list in $variants.Values) { foreach ($variant in $list) { $lookup[$variant.variantId] = $variant } }
$roster = @()
foreach ($row in (Import-Csv -LiteralPath (Join-Path $core 'data/campaign/sim_opponents.csv'))) {
  $id = $row.'variant id'
  if (!$id -or $id.StartsWith('#')) { continue }
  if (!$lookup.ContainsKey($id)) { throw "Missing source variant: $id" }
  $v = $lookup[$id]
  $roster += @{ variantId = $id; cost = $costs[$v.hullId]; civilian = $civilian -contains $v.hullId; variant = $v }
}
@{ source = 'data/campaign/sim_opponents.csv + data/hulls/ship_data.csv supplies/rec + imported stock variants'; costs = $costs; roster = $roster } |
  ConvertTo-Json -Depth 25 | Set-Content -LiteralPath (Join-Path $project 'src/engine/data/generated/simulation-roster.json') -Encoding utf8
Write-Output "Imported $($roster.Count) original simulator variants"
