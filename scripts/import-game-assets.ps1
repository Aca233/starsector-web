param(
  [Parameter(Mandatory=$true)][string]$StarsectorCore
)

$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$sourceRoot = [IO.Path]::GetFullPath($StarsectorCore)
if (-not (Test-Path -LiteralPath $sourceRoot -PathType Container)) { throw "Starsector core not found: $sourceRoot" }
$destRoot = Join-Path $projectRoot 'public\game-assets'
New-Item -ItemType Directory -Force -Path $destRoot | Out-Null

$pattern = '(?:/game-assets/)?((?:graphics|sounds)/[^''"\s)]+\.(?:png|jpg|jpeg|ogg|wav|fnt|ttf))'
$paths = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
Get-ChildItem -LiteralPath (Join-Path $projectRoot 'src') -Recurse -File -Include *.ts,*.tsx,*.css | ForEach-Object {
  $text = [IO.File]::ReadAllText($_.FullName)
  foreach ($match in [regex]::Matches($text, $pattern, [Text.RegularExpressions.RegexOptions]::IgnoreCase)) {
    $relative = $match.Groups[1].Value.Replace('/', '\')
    if ($relative -notmatch '\$\{') { $null = $paths.Add($relative) }
  }
}
foreach ($frame in 0..6) { $null = $paths.Add("graphics\fx\explosion$frame.png") }

$manifest = @()
$missing = @()
foreach ($relative in ($paths | Sort-Object)) {
  $source = [IO.Path]::GetFullPath((Join-Path $sourceRoot $relative))
  if (-not $source.StartsWith($sourceRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing source path outside Starsector core: $relative"
  }
  if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { $missing += $relative; continue }
  $destination = Join-Path $destRoot $relative
  New-Item -ItemType Directory -Force -Path (Split-Path $destination -Parent) | Out-Null
  Copy-Item -LiteralPath $source -Destination $destination -Force
  $item = Get-Item -LiteralPath $destination
  $hash = (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant()
  $extension = $item.Extension.ToLowerInvariant()
  $type = if ($extension -in '.png','.jpg','.jpeg') {'image'} elseif ($extension -in '.ogg','.wav') {'audio'} elseif ($extension -in '.fnt','.ttf') {'font'} else {'other'}
  $entry = [ordered]@{
    id = $relative.Replace('\','/'); path = $relative.Replace('\','/'); type = $type;
    bytes = $item.Length; hash = $hash; group = ($relative -split '\\')[0]
  }
  if ($type -eq 'image') {
    $entry.sampler = [ordered]@{
      wrap = if ($relative -match 'beam|shield|contrail') {'repeat'} else {'clamp'}
      minFilter = 'linear'; magFilter = 'linear'; mipmap = $false
    }
  }
  $manifest += [pscustomobject]$entry
}

if ($missing.Count -gt 0) { throw "Missing referenced assets: $($missing -join '; ')" }
$manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $destRoot 'asset-manifest.json') -Encoding utf8
Write-Output "Imported $($manifest.Count) referenced assets into public/game-assets"
