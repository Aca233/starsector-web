/** Static diagnostic figure; no generated stand-ins and no gameplay changes. */
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
const {chromium}=createRequire('C:/Users/Aca/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json')('playwright');
const dir='output/imagegen/rocinante/scale-comparison';
const data=JSON.parse(await fs.readFile(`${dir}/measurements.json`,'utf8'));
for(const item of [...data.ships,...data.weapons])item.image='data:image/png;base64,'+(await fs.readFile(`${dir}/${item.id}.png`)).toString('base64');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
try{
 const page=await browser.newPage({viewport:{width:1180,height:1040},deviceScaleFactor:1});
 await page.setContent('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>舰体与近防炮同倍率对比</title><style>body{margin:0;background:#101720}canvas{display:block}</style><canvas width="1180" height="1040" aria-label="同倍率舰体及近防炮尺寸比较"></canvas></html>');
 const layout=await page.evaluate(async data=>{
  const c=document.querySelector('canvas'),g=c.getContext('2d');g.imageSmoothingQuality='high';
  const load=async item=>{const i=new Image();i.src=item.image;await i.decode();return i;};
  const ships=await Promise.all(data.ships.map(load)),guns=await Promise.all(data.weapons.map(load));
  const text=(s,x,y,size=16,color='#e2e7ec',align='left')=>{g.fillStyle=color;g.font=`${size}px "Microsoft YaHei",sans-serif`;g.textAlign=align;g.fillText(s,x,y);};
  const line=(y)=>{g.strokeStyle='#354250';g.beginPath();g.moveTo(30,y);g.lineTo(1150,y);g.stroke();};
  g.fillStyle='#101720';g.fillRect(0,0,c.width,c.height);
  text('罗西南特，与两艘巨舰到底差多大？',30,42,26);
  text('当前工程默认素材与尺寸 · 全部模块拼合 · 不含护盾、尾焰和外装武器 · 不是原著米制比例',30,76,15,'#aab9c8');
  text('舰体：三艘船使用同一倍率',30,121,19);
  const xs=[192,590,982],scale=.235,bottom=602;
  text('1 世界单位 = 0.235 像素',1150,121,14,'#aab9c8','right');
  const bounds=[];
  data.ships.forEach((s,i)=>{const w=s.visibleWidth*scale,h=s.visibleLength*scale,x=xs[i]-w/2,y=bottom-h;g.drawImage(ships[i],x,y,w,h);bounds.push({id:s.id,x,y,w,h});});
  line(bottom+7);
  data.ships.forEach((s,i)=>{
   text(s.name,xs[i],642,20,'#e2e7ec','center');
   text(`长 ${Math.round(s.visibleLength)} × 宽 ${Math.round(s.visibleWidth)} 世界单位`,xs[i],672,15,'#aab9c8','center');
   text(`舰长 ${i===0?'1.0':(s.visibleLength/data.ships[0].visibleLength).toFixed(1)} 倍`,xs[i],700,17,'#ddbd8f','center');
  });
  line(723);
  text('近防炮：同为 S 档，单独使用同一倍率',30,761,19);
  text('以下炮头统一放大显示：1 世界单位 = 4 像素',1150,761,14,'#aab9c8','right');
  data.weapons.forEach((s,i)=>{const w=s.visibleWidth*4,h=s.visibleLength*4,x=xs[i]-w/2,y=884-h;g.drawImage(guns[i],x,y,w,h);bounds.push({id:s.id,x,y,w,h});
   text(s.name,xs[i],922,18,'#e2e7ec','center');text(`可见长 ${s.visibleLength} × 宽 ${s.visibleWidth}`,xs[i],951,16,'#ddbd8f','center');
  });
  text('测量口径：实图 alpha ≥128；亚顿之矛取当前动画第0帧。炮头不含固定炮座。',30,991,14,'#aab9c8');
  text('罗西南特为未注册试装候选；本次只做比较，没有修改任何舰船或武器规格。',30,1017,14,'#aab9c8');
  return bounds;
 },data);
 for(const b of layout)if(b.x<0||b.y<0||b.x+b.w>1180||b.y+b.h>1040)throw Error('Clipped diagram element '+b.id);
 await page.screenshot({path:`${dir}/same-scale-comparison.png`});
 console.log(JSON.stringify({figure:`${dir}/same-scale-comparison.png`,assets:layout.length,noClippedAssets:true}));
}finally{await browser.close();}
