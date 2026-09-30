# Extract real generated temporal frames. Common crop per clip; pivots correct actual atlas registration.
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$root=Split-Path $PSScriptRoot -Parent
$source=Join-Path $root 'output/imagegen/spear-of-adun-motion-v03/atlas.png'
$image=[Drawing.Bitmap]::FromFile($source)
if($image.Width -ne 1024 -or $image.Height -ne 1536){throw 'Animation atlas size differs: recalibrate first.'}
$out=Join-Path $root 'public/game-assets/graphics/fx/web_spear_of_adun/motion'
[void][IO.Directory]::CreateDirectory($out)
$plans=@(
 @{name='exhaust';ys=@(0,256);origins=@(@(145,61),@(390,61),@(637,61),@(882,61))},
 @{name='core';ys=@(256,512);origins=@(@(145,385),@(390,385),@(637,385),@(882,385))},
 @{name='beam';ys=@(512,768);origins=@(@(145,635),@(390,635),@(637,635),@(882,635))},
 @{name='muzzle';ys=@(768,1024);origins=@(@(146,985),@(390,985),@(637,985),@(882,985))},
 @{name='impact';ys=@(1024,1248);origins=@(@(145,1140),@(390,1140),@(637,1140),@(882,1140))},
 @{name='lance';ys=@(1250,1536);origins=@(@(145,1306),@(390,1306),@(637,1306),@(882,1306))}
)
$clips=[ordered]@{}
try {
 foreach($plan in $plans){
  $l=1024;$t=1536;$r=-1024;$b=-1536
  for($i=0;$i -lt 4;$i++){
   $origin=$plan.origins[$i]
   for($y=$plan.ys[0];$y -lt $plan.ys[1];$y++){for($x=$i*256;$x -lt ($i+1)*256;$x++){
    if($image.GetPixel($x,$y).A -ge 8){$l=[Math]::Min($l,$x-$origin[0]);$r=[Math]::Max($r,$x-$origin[0]);$t=[Math]::Min($t,$y-$origin[1]);$b=[Math]::Max($b,$y-$origin[1])}
   }}
  }
  # Same padded content box in every frame: no independent trim/scale that would make the nozzle wobble.
  $l-=5;$t-=5;$r+=6;$b+=6
  # Only trim padding to the common isolated ROI, never resize individual frames.
  for($i=0;$i -lt 4;$i++){
   $origin=$plan.origins[$i]
   $l=[Math]::Max($l,$i*256-$origin[0]);$r=[Math]::Min($r,($i+1)*256-$origin[0])
   $t=[Math]::Max($t,$plan.ys[0]-$origin[1]);$b=[Math]::Min($b,$plan.ys[1]-$origin[1])
  }
  $w=$r-$l;$h=$b-$t;$frames=@()
  for($i=0;$i -lt 4;$i++){
   $origin=$plan.origins[$i];$x=$origin[0]+$l;$y=$origin[1]+$t
   if($x -lt $i*256 -or $x+$w -gt ($i+1)*256 -or $y -lt $plan.ys[0] -or $y+$h -gt $plan.ys[1]){throw "Frame escapes isolated artwork: $($plan.name) $i ($x,$y,$w,$h)"}
   $file="$($plan.name)-$i.png"
   $frame=$image.Clone([Drawing.Rectangle]::new($x,$y,$w,$h),[Drawing.Imaging.PixelFormat]::Format32bppArgb)
   try{$frame.Save((Join-Path $out $file),[Drawing.Imaging.ImageFormat]::Png)}finally{$frame.Dispose()}
   $frames += [ordered]@{file=$file;sourceBox=@($x,$y,$w,$h);width=$w;height=$h;pivotX=-$l/$w;pivotY=-$t/$h}
  }
  $clips[$plan.name]=[ordered]@{frames=$frames}
 }
 $meta=[ordered]@{sourceSha256=(Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant();sourceSize=@(1024,1536);clips=$clips}
 [IO.File]::WriteAllText((Join-Path $root 'src/engine/visual/adun-motion-art.json'),($meta|ConvertTo-Json -Depth 8)+"`n",[Text.UTF8Encoding]::new($false))
}finally{$image.Dispose()}
node --input-type=module -e "import fs from 'node:fs';import crypto from 'node:crypto';const p='public/game-assets/asset-manifest.json',entries=JSON.parse(fs.readFileSync(p)),dir='graphics/fx/web_spear_of_adun/motion';for(const f of fs.readdirSync('public/game-assets/'+dir)){const path=dir+'/'+f,b=fs.readFileSync('public/game-assets/'+path),entry={id:path,path,type:'image',bytes:b.length,hash:crypto.createHash('sha256').update(b).digest('hex'),group:'graphics',sampler:{wrap:'clamp',minFilter:'linear',magFilter:'linear',mipmap:false}};const i=entries.findIndex(e=>e.id===path);if(i<0)entries.push(entry);else entries[i]=entry;}fs.writeFileSync(p,JSON.stringify(entries,null,2)+'\n');console.log('Registered 24 generated animation frames.');"
if($LASTEXITCODE -ne 0){throw 'Manifest update failed'}
