# Extract generated VFX exactly; never paint, synthesize an alpha mask, or create a fallback.
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$root=Split-Path $PSScriptRoot -Parent
$source=Join-Path $root 'output/imagegen/spear-of-adun-fx-v01/atlas.png'
$image=[Drawing.Bitmap]::FromFile($source)
if($image.Width -ne 1536 -or $image.Height -ne 1024){throw 'Unexpected atlas size; inspect/recalibrate first.'}
$out=Join-Path $root 'public/game-assets/graphics/fx/web_spear_of_adun'
[void][IO.Directory]::CreateDirectory($out)
$names=@('ignition','core','lance','muzzle','impact','beam','exhaust','shutdown')
# Observed origin points, NOT assumed from prompt. Projectile pivot is the leading tip.
$pivots=@(@(193,250),@(577,247),@(961,26),@(1345,433),@(195,756),@(574,770),@(962,561),@(1353,754))
$metadata=[ordered]@{}
try {
 for($i=0;$i -lt 8;$i++){
  $cx=($i%4)*384;$cy=[Math]::Floor($i/4)*512;$l=$cx+384;$t=$cy+512;$r=$cx;$b=$cy
  for($y=$cy;$y -lt $cy+512;$y++){for($x=$cx;$x -lt $cx+384;$x++){if($image.GetPixel($x,$y).A -ge 8){$l=[Math]::Min($l,$x);$r=[Math]::Max($r,$x);$t=[Math]::Min($t,$y);$b=[Math]::Max($b,$y)}}}
  if($r -le $l -or $b -le $t){throw "Empty generated effect $i"}
  $l=[Math]::Max($cx,$l-12);$t=[Math]::Max($cy,$t-12);$r=[Math]::Min($cx+384,$r+13);$b=[Math]::Min($cy+512,$b+13)
  $rect=[Drawing.Rectangle]::new($l,$t,$r-$l,$b-$t)
  $cut=$image.Clone($rect,[Drawing.Imaging.PixelFormat]::Format32bppArgb)
  try{$cut.Save((Join-Path $out ($names[$i]+'.png')),[Drawing.Imaging.ImageFormat]::Png)}finally{$cut.Dispose()}
  $p=$pivots[$i]
  $metadata[$names[$i]]=[ordered]@{sourceBox=@($l,$t,($r-$l),($b-$t));width=$r-$l;height=$b-$t;pivotX=($p[0]-$l)/($r-$l);pivotY=($p[1]-$t)/($b-$t)}
 }
 $metadata.sourceSha256=(Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant()
 [IO.File]::WriteAllText((Join-Path $root 'src/engine/visual/adun-fx-art.json'),($metadata|ConvertTo-Json -Depth 6)+"`n",[Text.UTF8Encoding]::new($false))
}finally{$image.Dispose()}
node --input-type=module -e "import fs from 'node:fs';import crypto from 'node:crypto';const path='public/game-assets/asset-manifest.json',all=JSON.parse(fs.readFileSync(path));const dir='graphics/fx/web_spear_of_adun';for(const file of fs.readdirSync('public/game-assets/'+dir)){const p=dir+'/'+file,b=fs.readFileSync('public/game-assets/'+p),entry={id:p,path:p,type:'image',bytes:b.length,hash:crypto.createHash('sha256').update(b).digest('hex'),group:'graphics',sampler:{wrap:'clamp',minFilter:'linear',magFilter:'linear',mipmap:false}};const i=all.findIndex(e=>e.id===p);if(i<0)all.push(entry);else all[i]=entry;}fs.writeFileSync(path,JSON.stringify(all,null,2)+'\n');console.log('Registered eight generated Adun VFX textures');"
if($LASTEXITCODE -ne 0){throw 'Manifest update failed'}
