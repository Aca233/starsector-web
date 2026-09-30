# Extraction and pivot calibration only. Generated RGBA is never repainted or recolored.
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$root=Split-Path $PSScriptRoot -Parent
$source=Join-Path $root 'output/imagegen/spear-of-adun-integrated-v02/atlas.png'
$image=[Drawing.Bitmap]::FromFile($source)
if($image.Width -ne 1254 -or $image.Height -ne 1254){throw 'Different atlas: recalibrate before extracting.'}
$hash=(Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant()
function Extract-Part($name,$bounds,$pivot,$directory,$worldWidth=0,$muzzles=@()) {
 $x0=$bounds[0];$y0=$bounds[1];$x1=$bounds[2];$y1=$bounds[3]
 $left=$x1;$top=$y1;$right=$x0;$bottom=$y0
 for($y=$y0;$y -lt $y1;$y++){for($x=$x0;$x -lt $x1;$x++){if($image.GetPixel($x,$y).A -ge 8){$left=[Math]::Min($left,$x);$top=[Math]::Min($top,$y);$right=[Math]::Max($right,$x);$bottom=[Math]::Max($bottom,$y)}}}
 if($right -le $left -or $bottom -le $top){throw "Empty part: $name"}
 $left=[Math]::Max($x0,$left-5);$top=[Math]::Max($y0,$top-5);$right=[Math]::Min($x1,$right+6);$bottom=[Math]::Min($y1,$bottom+6)
 $w=$right-$left;$h=$bottom-$top
 $part=$image.Clone([Drawing.Rectangle]::new($left,$top,$w,$h),[Drawing.Imaging.PixelFormat]::Format32bppArgb)
 try{$part.Save((Join-Path $directory "$name.png"),[Drawing.Imaging.ImageFormat]::Png)}finally{$part.Dispose()}
 $scale=if($worldWidth -gt 0){$worldWidth/$w}else{1}
 $offsets=@();foreach($p in $muzzles){$offsets += [Math]::Round(($pivot[1]-$p[1])*$scale,4);$offsets += [Math]::Round(($p[0]-$pivot[0])*$scale,4)}
 return [ordered]@{sourceBox=@($left,$top,$w,$h);sourcePivot=$pivot;width=$w*$scale;height=$h*$scale;scale=$scale;pivotX=($pivot[0]-$left)/$w;pivotY=($pivot[1]-$top)/$h;offsets=$offsets}
}
try {
 $guns=Join-Path $root 'public/game-assets/graphics/weapons/web_spear_of_adun'
 $fxdir=Join-Path $root 'public/game-assets/graphics/fx/web_spear_of_adun'
 $artPath=Join-Path $root 'src/engine/content/spear-of-adun-art.json'
 $art=Get-Content -LiteralPath $artPath -Raw | ConvertFrom-Json -AsHashtable
 # Retain the hull's original file/metadata exactly; replace only the eight hardware parts.
 $art.lance=Extract-Part 'lance' @(70,0,305,334) @(185,285) $guns 42 @(,@(185,46))
 $art.disruptor=Extract-Part 'disruptor' @(354,52,618,333) @(486,277) $guns 32 @(@(448,96),@(526,96))
 $art.ion=Extract-Part 'ion' @(672,100,905,330) @(786,269) $guns 20 @(@(758,132),@(811,132))
 $art.prism=Extract-Part 'prism' @(1005,112,1194,322) @(1098,248) $guns 12 @(,@(1096,163))
 $art.seatXL=Extract-Part 'seat-xl' @(76,335,302,627) @(185,484) $guns 32
 $art.seatL=Extract-Part 'seat-l' @(357,351,613,619) @(486,485) $guns 24
 $art.seatM=Extract-Part 'seat-m' @(678,370,903,608) @(787,489) $guns 15
 $art.seatS=Extract-Part 'seat-s' @(1000,375,1200,606) @(1098,492) $guns 9
 $art.armorySourceSha256=$hash
 $art.armorySourcePath='output/imagegen/spear-of-adun-integrated-v02/atlas.png'
 [IO.File]::WriteAllText($artPath,($art|ConvertTo-Json -Depth 8)+"`n",[Text.UTF8Encoding]::new($false))
 $fx=[ordered]@{}
 $fx.ignition=Extract-Part 'ignition' @(91,627,282,946) @(185,790) $fxdir
 $fx.core=Extract-Part 'core' @(396,627,577,951) @(486,790) $fxdir
 $fx.shutdown=Extract-Part 'shutdown' @(708,627,865,916) @(785,788) $fxdir
 $fx.lance=Extract-Part 'lance' @(1020,590,1185,947) @(1100,643) $fxdir
 $fx.muzzle=Extract-Part 'muzzle' @(91,972,285,1222) @(186,1191) $fxdir
 $fx.impact=Extract-Part 'impact' @(348,958,624,1222) @(487,1083) $fxdir
 $fx.beam=Extract-Part 'beam' @(737,916,833,1254) @(786,1082) $fxdir
 $fx.exhaust=Extract-Part 'exhaust' @(1020,947,1204,1254) @(1099,980) $fxdir
 $fx.sourceSha256=$hash
 [IO.File]::WriteAllText((Join-Path $root 'src/engine/visual/adun-fx-art.json'),($fx|ConvertTo-Json -Depth 8)+"`n",[Text.UTF8Encoding]::new($false))
} finally {$image.Dispose()}
node --input-type=module -e "import fs from 'node:fs';import crypto from 'node:crypto';const p='public/game-assets/asset-manifest.json',entries=JSON.parse(fs.readFileSync(p));for(const folder of ['weapons','fx']){const dir='graphics/'+folder+'/web_spear_of_adun';for(const file of fs.readdirSync('public/game-assets/'+dir)){if(!file.endsWith('.png'))continue;const path=dir+'/'+file,b=fs.readFileSync('public/game-assets/'+path),entry={id:path,path,type:'image',bytes:b.length,hash:crypto.createHash('sha256').update(b).digest('hex'),group:'graphics',sampler:{wrap:'clamp',minFilter:'linear',magFilter:'linear',mipmap:false}};const i=entries.findIndex(e=>e.id===path);if(i<0)entries.push(entry);else entries[i]=entry;}}fs.writeFileSync(p,JSON.stringify(entries,null,2)+'\n');console.log('Registered 8 hardware parts and 8 energy textures; hull unchanged.');"
if($LASTEXITCODE -ne 0){throw 'Manifest update failed'}
