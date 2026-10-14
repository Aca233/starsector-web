param([string]$RustcBin = $env:RUSTC_BIN)
$ErrorActionPreference = 'Stop'
$rustProjectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (-not $RustcBin) {
  $rustCompilerCommand = Get-Command rustc -ErrorAction SilentlyContinue
  if ($rustCompilerCommand) { $RustcBin = $rustCompilerCommand.Source }
  else { $RustcBin = Join-Path $env:USERPROFILE '.rustup/toolchains/stable-x86_64-pc-windows-msvc/bin/rustc.exe' }
}
if (-not (Test-Path -LiteralPath $RustcBin -PathType Leaf)) { throw 'Rust compiler is unavailable; set RUSTC_BIN.' }
$rustVersionText = & $RustcBin --version
if ($LASTEXITCODE -ne 0 -or $rustVersionText -notmatch '^rustc (\d+\.\d+\.\d+) ') { throw 'Expected a stable Rust release.' }
$rustVersion = $Matches[1]
$rustPrepRoot = Join-Path $rustProjectRoot 'artifacts/rust-combat-core-20261008/toolchain'
New-Item -ItemType Directory -Force -Path $rustPrepRoot | Out-Null
$rustArchiveName = "rust-std-$rustVersion-wasm32-unknown-unknown.tar.xz"
$rustArchive = Join-Path $rustPrepRoot $rustArchiveName
$rustChecksumFile = "$rustArchive.sha256"
$rustDownloadUrl = "https://static.rust-lang.org/dist/$rustArchiveName"
if (-not (Test-Path -LiteralPath $rustChecksumFile -PathType Leaf)) {
  Invoke-WebRequest -Uri "$rustDownloadUrl.sha256" -OutFile $rustChecksumFile -TimeoutSec 90
}
$rustExpectedHash = ((Get-Content -LiteralPath $rustChecksumFile -Raw) -split '\s+')[0].ToLowerInvariant()
if ($rustExpectedHash -notmatch '^[a-f0-9]{64}$') { throw 'Rust distribution checksum format differs.' }
$rustVerified = (Test-Path -LiteralPath $rustArchive -PathType Leaf) -and (Get-FileHash -LiteralPath $rustArchive -Algorithm SHA256).Hash.ToLowerInvariant() -eq $rustExpectedHash
if (-not $rustVerified) {
  Invoke-WebRequest -Uri $rustDownloadUrl -OutFile $rustArchive -TimeoutSec 300
  if ((Get-FileHash -LiteralPath $rustArchive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $rustExpectedHash) { throw 'Rust Wasm standard library SHA-256 differs.' }
}
$rustMembers = & tar -tf $rustArchive
if ($LASTEXITCODE -ne 0 -or $rustMembers.Count -eq 0) { throw 'Could not read verified Rust archive.' }
foreach ($rustMember in $rustMembers) {
  if ($rustMember -match '(^/|^[A-Za-z]:|(^|/)\.\.(/|$)|\\)') { throw 'Rust archive contains a path outside the extraction directory.' }
}
$rustStaging = Join-Path $rustPrepRoot "extracted-$rustVersion"
New-Item -ItemType Directory -Force -Path $rustStaging | Out-Null
& tar -xf $rustArchive -C $rustStaging
if ($LASTEXITCODE -ne 0) { throw 'Could not extract verified Rust standard library.' }
$rustComponentRoot = Join-Path $rustStaging "rust-std-$rustVersion-wasm32-unknown-unknown/rust-std-wasm32-unknown-unknown/lib/rustlib/wasm32-unknown-unknown"
if (-not (Test-Path -LiteralPath (Join-Path $rustComponentRoot 'lib') -PathType Container)) { throw 'Rust archive component layout differs.' }
$rustSysrootPath = Join-Path $rustPrepRoot 'sysroot'
$rustLibraryRoot = Join-Path $rustSysrootPath 'lib/rustlib'
New-Item -ItemType Directory -Force -Path $rustLibraryRoot | Out-Null
$rustTargetRoot = Join-Path $rustLibraryRoot 'wasm32-unknown-unknown'
New-Item -ItemType Directory -Force -Path $rustTargetRoot | Out-Null
Copy-Item -LiteralPath (Join-Path $rustComponentRoot 'lib') -Destination $rustTargetRoot -Recurse -Force
[PSCustomObject]@{ compiler = $rustVersionText; sysroot = $rustSysrootPath; archiveSha256 = $rustExpectedHash; source = $rustDownloadUrl } |
  ConvertTo-Json | Set-Content -LiteralPath (Join-Path $rustPrepRoot 'prepared.json') -Encoding utf8
Write-Output "Prepared isolated Rust $rustVersion Wasm sysroot: $rustSysrootPath"
