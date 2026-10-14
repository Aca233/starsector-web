param([string]$BuildManifest = 'artifacts/rust-combat-core-20261008/build/build-manifest.json')
$ErrorActionPreference = 'Stop'
$combatProjectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$combatManifestPath = [IO.Path]::GetFullPath((Join-Path $combatProjectRoot $BuildManifest))
$combatBuild = Get-Content -LiteralPath $combatManifestPath -Raw | ConvertFrom-Json
if (-not $combatBuild.sources -or $combatBuild.sha256 -notmatch '^[a-f0-9]{64}$' -or $combatBuild.bytes -le 0) { throw 'Incomplete Rust build manifest.' }
$combatWasm = [IO.Path]::GetFullPath($combatBuild.path)
if (-not (Test-Path -LiteralPath $combatWasm -PathType Leaf) -or (Get-Item -LiteralPath $combatWasm).Length -ne $combatBuild.bytes -or
    (Get-FileHash -LiteralPath $combatWasm -Algorithm SHA256).Hash.ToLowerInvariant() -ne $combatBuild.sha256) { throw 'Rust artifact does not match its manifest.' }
foreach ($combatSource in $combatBuild.sources.PSObject.Properties) {
  $combatInput = [IO.Path]::GetFullPath((Join-Path $combatProjectRoot $combatSource.Name))
  if (-not $combatInput.StartsWith($combatProjectRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -or
      (Get-FileHash -LiteralPath $combatInput -Algorithm SHA256).Hash.ToLowerInvariant() -ne $combatSource.Value) { throw "Rust source changed since compilation: $($combatSource.Name)" }
}
$combatRuntimeDirectory = Join-Path $combatProjectRoot 'public/game-assets/runtime'
[IO.Directory]::CreateDirectory($combatRuntimeDirectory) | Out-Null
# One browser/Electron asset pair. This installs development combat resources;
# it does not build, package or publish any game/campaign release.
Copy-Item -LiteralPath $combatWasm -Destination (Join-Path $combatRuntimeDirectory 'combat-core.wasm') -Force
$combatRuntimeManifest = [ordered]@{ version=1; bytes=$combatBuild.bytes; sha256=$combatBuild.sha256 }
[IO.File]::WriteAllText((Join-Path $combatRuntimeDirectory 'combat-core.json'),($combatRuntimeManifest | ConvertTo-Json -Compress),[Text.UTF8Encoding]::new($false))
$combatRuntimeManifest | ConvertTo-Json -Compress
