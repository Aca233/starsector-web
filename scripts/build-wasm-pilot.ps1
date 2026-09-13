param(
  [string]$RustcBin = $env:RUSTC_BIN,
  [string]$RustSysroot = $env:RUST_SYSROOT
)

$ErrorActionPreference = 'Stop'

if (-not $RustcBin) {
  $command = Get-Command rustc -ErrorAction SilentlyContinue
  if (-not $command) {
    throw 'rustc was not found. Install a Rust toolchain with the wasm32-unknown-unknown target, or set RUSTC_BIN and optionally RUST_SYSROOT.'
  }
  $RustcBin = $command.Source
}

$outputDir = Join-Path (Get-Location) 'artifacts/wasm-pilot'
$outputFile = Join-Path $outputDir 'collision_core.wasm'
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null

$rustArgs = @(
  'benchmarks/wasm-pilot/src/lib.rs',
  '--crate-name', 'starsector_collision_wasm_pilot',
  '--crate-type', 'cdylib',
  '--edition', '2021',
  '--target', 'wasm32-unknown-unknown',
  '-C', 'opt-level=3',
  '-C', 'panic=abort',
  '-o', $outputFile
)

if ($RustSysroot) {
  $rustArgs += @('--sysroot', $RustSysroot)
}

& $RustcBin @rustArgs
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

$item = Get-Item $outputFile
Write-Output "Wasm pilot built: $($item.FullName) ($($item.Length) bytes)"
