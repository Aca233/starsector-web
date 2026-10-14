param(
  [string]$RustcBin = $env:RUSTC_BIN,
  [string]$CargoBin = $env:CARGO_BIN,
  [string]$RustSysroot = $env:RUST_SYSROOT
)
$ErrorActionPreference = 'Stop'
$rustProjectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (-not $RustcBin) {
  $rustCommand = Get-Command rustc -ErrorAction SilentlyContinue
  if ($rustCommand) { $RustcBin = $rustCommand.Source }
  else { $RustcBin = Join-Path $env:USERPROFILE '.rustup/toolchains/stable-x86_64-pc-windows-msvc/bin/rustc.exe' }
}
if (-not (Test-Path -LiteralPath $RustcBin -PathType Leaf)) { throw 'Rust compiler is unavailable; set RUSTC_BIN.' }
if (-not $CargoBin) { $CargoBin = Join-Path (Split-Path -Parent $RustcBin) 'cargo.exe' }
if (-not (Test-Path -LiteralPath $CargoBin -PathType Leaf)) { throw 'Cargo is unavailable; set CARGO_BIN.' }
$rustHostSysroot = (& $RustcBin --print sysroot).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Could not locate Rust host sysroot.' }
if (-not $RustSysroot) {
  $rustInstalledTarget = Join-Path $rustHostSysroot 'lib/rustlib/wasm32-unknown-unknown/lib'
  if (Test-Path -LiteralPath $rustInstalledTarget -PathType Container) { $RustSysroot = $rustHostSysroot }
  else { $RustSysroot = Join-Path $rustProjectRoot 'artifacts/rust-combat-core-20261008/toolchain/sysroot' }
}
if (-not (Test-Path -LiteralPath (Join-Path $RustSysroot 'lib/rustlib/wasm32-unknown-unknown/lib') -PathType Container)) {
  throw 'Matching wasm32-unknown-unknown standard library is unavailable; set RUST_SYSROOT to a prepared sysroot.'
}
$rustLinker = Join-Path $rustHostSysroot 'lib/rustlib/x86_64-pc-windows-msvc/bin/rust-lld.exe'
if (-not (Test-Path -LiteralPath $rustLinker -PathType Leaf)) { throw 'Rust Wasm linker is unavailable.' }
$rustOutputRoot = Join-Path $rustProjectRoot 'artifacts/rust-combat-core-20261008/build'
$rustOldCompiler = $env:RUSTC
$rustOldFlags = $env:CARGO_ENCODED_RUSTFLAGS
$rustOldLinker = $env:CARGO_TARGET_WASM32_UNKNOWN_UNKNOWN_LINKER
$rustSourceHashes = [ordered]@{}
$rustSourcePaths = @(& rg --files (Join-Path $rustProjectRoot 'native/combat-core') -g '*.rs' -g 'Cargo.toml' -g 'Cargo.lock')
if ($LASTEXITCODE -ne 0 -or $rustSourcePaths.Count -eq 0) { throw 'Could not enumerate Rust build inputs.' }
foreach ($rustSource in $rustSourcePaths) {
  $rustSourceKey = [System.IO.Path]::GetRelativePath($rustProjectRoot, $rustSource).Replace('\', '/')
  $rustSourceHashes[$rustSourceKey] = (Get-FileHash -LiteralPath $rustSource -Algorithm SHA256).Hash.ToLowerInvariant()
}
try {
  # Process-local configuration; don't change PATH or the user's toolchain.
  $env:RUSTC = $RustcBin
  $env:CARGO_ENCODED_RUSTFLAGS = '--sysroot' + [char]31 + $RustSysroot
  $env:CARGO_TARGET_WASM32_UNKNOWN_UNKNOWN_LINKER = $rustLinker
  & $CargoBin build --offline --locked --release --target wasm32-unknown-unknown --target-dir $rustOutputRoot --manifest-path (Join-Path $rustProjectRoot 'native/combat-core/Cargo.toml')
  if ($LASTEXITCODE -ne 0) { throw "Rust combat build failed ($LASTEXITCODE)." }
  $rustOutputFile = Join-Path $rustOutputRoot 'wasm32-unknown-unknown/release/foundry_combat_core.wasm'
  $rustArtifact = Get-Item -LiteralPath $rustOutputFile
  foreach ($rustSourceKey in $rustSourceHashes.Keys) {
    if ((Get-FileHash -LiteralPath (Join-Path $rustProjectRoot $rustSourceKey) -Algorithm SHA256).Hash.ToLowerInvariant() -ne $rustSourceHashes[$rustSourceKey]) { throw "Rust source changed during build: $rustSourceKey" }
  }
  $rustBuildManifest = [ordered]@{ path = $rustArtifact.FullName; bytes = $rustArtifact.Length;
    sha256 = (Get-FileHash -LiteralPath $rustOutputFile -Algorithm SHA256).Hash.ToLowerInvariant();
    compiler = (& $RustcBin --version); sysroot = $RustSysroot; sources = $rustSourceHashes }
  $rustBuildManifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $rustOutputRoot 'build-manifest.json') -Encoding utf8
  $rustBuildManifest | ConvertTo-Json -Depth 5 -Compress
}
finally {
  $env:RUSTC = $rustOldCompiler
  $env:CARGO_ENCODED_RUSTFLAGS = $rustOldFlags
  $env:CARGO_TARGET_WASM32_UNKNOWN_UNKNOWN_LINKER = $rustOldLinker
}
