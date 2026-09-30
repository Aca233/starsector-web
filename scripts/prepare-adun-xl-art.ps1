# Crop and calibrate the locally generated three-layer XL study; no painting or alpha synthesis.
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$root=Split-Path $PSScriptRoot -Parent
$source=Join-Path $root 'output/imagegen/spear-of-adun-xl-v05/atlas.png'
$image=[Drawing.Bitmap]::FromFile($source)
$refinedSource=Join-Path $root 'output/imagegen/spear-of-adun-xl-v05/atlas-refined.png'
$refined=[Drawing.Bitmap]::FromFile($refinedSource)
if($refined.Width -ne 1536 -or $refined.Height -ne 1024){throw 'Refined atlas dimensions changed'}
if($image.Width -ne 1536 -or $image.Height -ne 1024){throw 'Different atlas dimensions: recalibrate first'}
$out=Join-Path $root 'public/game-assets/graphics/weapons/web_spear_of_adun/xl-v05'
[void][IO.Directory]::CreateDirectory($out)
function Extract-Part($file,$box,$pivot,$scale,$muzzle=$null,$from=$image){
 $x=$box[0];$y=$box[1];$w=$box[2];$h=$box[3]
 $crop=$from.Clone([Drawing.Rectangle]::new($x,$y,$w,$h),[Drawing.Imaging.PixelFormat]::Format32bppArgb)
 try{$crop.Save((Join-Path $out $file),[Drawing.Imaging.ImageFormat]::Png)}finally{$crop.Dispose()}
 $offsets=@();if($null -ne $muzzle){$offsets=@([Math]::Round(($pivot[1]-$muzzle[1])*$scale,6),[Math]::Round(($muzzle[0]-$pivot[0])*$scale,6))}
 return [ordered]@{file='xl-v05/'+$file;sourceBox=$box;sourcePivot=$pivot;width=[Math]::Round($w*$scale,6);height=[Math]::Round($h*$scale,6);pivotX=($pivot[0]-$x)/$w;pivotY=($pivot[1]-$y)/$h;scale=$scale;offsets=$offsets}
}
try{
 $art=[ordered]@{sourcePath='output/imagegen/spear-of-adun-xl-v05/atlas.png';sourceSha256=(Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant();sourceSize=@(1536,1024)}
 $art.body=Extract-Part 'body.png' @(110,8,365,889) @(292,745) (38.0/365.0) @(292,26) $refined
 $art.body.sourcePath='output/imagegen/spear-of-adun-xl-v05/atlas-refined.png'
 $art.body.sourceSha256=(Get-FileHash -LiteralPath $refinedSource -Algorithm SHA256).Hash.ToLowerInvariant()
 # The generated well and guard share a diameter, but the moving bearing was drawn at a different source scale.
 $seatScale=38.0/428.0
 $art.seat=Extract-Part 'seat.png' @(554,480,428,440) @(767,700) $seatScale
 # Keep transparent space ABOVE the lip so its pivot stays inside the calibrated canvas.
 $art.foreground=Extract-Part 'collar.png' @(1059,595,425,325) @(1279,700) $seatScale
 [IO.File]::WriteAllText((Join-Path $root 'src/engine/content/spear-of-adun-xl-art.json'),($art|ConvertTo-Json -Depth 8)+"`n",[Text.UTF8Encoding]::new($false))
}finally{$image.Dispose();$refined.Dispose()}
node --input-type=module -e "import fs from 'node:fs';import crypto from 'node:crypto';const p='public/game-assets/asset-manifest.json',entries=JSON.parse(fs.readFileSync(p)),dir='graphics/weapons/web_spear_of_adun/xl-v05';for(const file of ['body.png','seat.png','collar.png']){const path=dir+'/'+file,b=fs.readFileSync('public/game-assets/'+path),entry={id:path,path,type:'image',bytes:b.length,hash:crypto.createHash('sha256').update(b).digest('hex'),group:'graphics',sampler:{wrap:'clamp',minFilter:'linear',magFilter:'linear',mipmap:false}};const i=entries.findIndex(e=>e.id===path);if(i<0)entries.push(entry);else entries[i]=entry;}fs.writeFileSync(p,JSON.stringify(entries,null,2)+'\n');console.log('Registered XL body, empty seat and fixed foreground collar.');"
if($LASTEXITCODE -ne 0){throw 'Manifest registration failed'}
