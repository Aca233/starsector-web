# Deterministic atlas extraction only; preserves generated RGBA, no repainting/masking.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$root = Split-Path $PSScriptRoot -Parent
$source = Join-Path $root 'output/imagegen/spear-of-adun-v01/atlas-text-candidate.png'
$image = [System.Drawing.Bitmap]::FromFile($source)
if ($image.Width -ne 1536 -or $image.Height -ne 1024) { throw 'Atlas changed; recalibrate regions first.' }
$shipDir = Join-Path $root 'public/game-assets/graphics/ships/web_spear_of_adun'
$gunDir = Join-Path $root 'public/game-assets/graphics/weapons/web_spear_of_adun'
[void][IO.Directory]::CreateDirectory($shipDir)
[void][IO.Directory]::CreateDirectory($gunDir)
function Export-Region($name, $box, $pivot, $scale, $muzzles, $directory) {
  $rect = [Drawing.Rectangle]::new($box[0],$box[1],$box[2],$box[3])
  $cut = $image.Clone($rect,[Drawing.Imaging.PixelFormat]::Format32bppArgb)
  try { $cut.Save((Join-Path $directory "$name.png"),[Drawing.Imaging.ImageFormat]::Png) } finally { $cut.Dispose() }
  $offsets = @()
  foreach ($m in $muzzles) { $offsets += [Math]::Round(($pivot[1]-$m[1])*$scale,4); $offsets += [Math]::Round(($m[0]-$pivot[0])*$scale,4) }
  return @{ sourceBox=$box; sourcePivot=$pivot; scale=$scale; width=$box[2]*$scale; height=$box[3]*$scale; pivotX=($pivot[0]-$box[0])/$box[2]; pivotY=($pivot[1]-$box[1])/$box[3]; offsets=$offsets }
}
try {
  $art = [ordered]@{}
  $art.hull = Export-Region 'hull' @(180,8,576,1008) @(465,620) .85 @() $shipDir
  $art.lance = Export-Region 'lance' @(988,26,181,292) @(1075,269) .28 @(,@(1074,38)) $gunDir
  $art.disruptor = Export-Region 'disruptor' @(983,333,190,228) @(1073,494) .25 @(@(1047,342),@(1096,342)) $gunDir
  $art.ion = Export-Region 'ion' @(1006,587,133,181) @(1070,719) .24 @(@(1050,596),@(1095,596)) $gunDir
  $art.prism = Export-Region 'prism' @(1023,806,108,143) @(1075,916) .23 @(,@(1072,819)) $gunDir
  $art.seatXL = Export-Region 'seat-xl' @(1221,137,163,171) @(1299,218) (46/163) @() $gunDir
  $art.seatL = Export-Region 'seat-l' @(1214,387,171,176) @(1300,475) (36/171) @() $gunDir
  $art.seatM = Export-Region 'seat-m' @(1231,625,137,145) @(1298,695) (26/137) @() $gunDir
  $art.seatS = Export-Region 'seat-s' @(1240,835,131,121) @(1302,896) (18/131) @() $gunDir
  $art.sourceSha256 = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant()
  $json = $art | ConvertTo-Json -Depth 8
  [IO.File]::WriteAllText((Join-Path $root 'src/engine/content/spear-of-adun-art.json'),$json+"`n",[Text.UTF8Encoding]::new($false))
} finally { $image.Dispose() }
# Register exact new resources without changing other entries.
node --input-type=module -e "import fs from 'node:fs';import crypto from 'node:crypto';const p='public/game-assets/asset-manifest.json';const entries=JSON.parse(fs.readFileSync(p));for(const folder of ['ships','weapons']){const dir='graphics/'+folder+'/web_spear_of_adun';for(const file of fs.readdirSync('public/game-assets/'+dir)){if(!file.endsWith('.png'))continue;const path=dir+'/'+file,bytes=fs.readFileSync('public/game-assets/'+path);const entry={id:path,path,type:'image',bytes:bytes.length,hash:crypto.createHash('sha256').update(bytes).digest('hex'),group:'graphics',sampler:{wrap:'clamp',minFilter:'linear',magFilter:'linear',mipmap:false}};const i=entries.findIndex(e=>e.id===path);if(i<0)entries.push(entry);else entries[i]=entry;}}fs.writeFileSync(p,JSON.stringify(entries,null,2)+'\n');console.log('Registered nine Spear of Adun atlas parts.');"
if ($LASTEXITCODE -ne 0) { throw 'Asset registration failed' }
