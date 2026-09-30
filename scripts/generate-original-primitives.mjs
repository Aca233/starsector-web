/** Independently authored geometric textures and synthesised tones; reads no game artwork/audio. */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..');
const base=path.join(root,'public/game-assets');
const records=[];
function output(name,bytes){const file=path.join(base,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes);records.push({path:name,sha256:createHash('sha256').update(bytes).digest('hex'),source:'scripts/generate-original-primitives.mjs: independent mathematical geometry/synthesis'});}
function crc(buf){let n=0xffffffff;for(const b of buf){n^=b;for(let i=0;i<8;i++)n=(n>>>1)^((n&1)?0xedb88320:0);}return(n^0xffffffff)>>>0;}
function chunk(type,data){const t=Buffer.from(type),out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);t.copy(out,4);data.copy(out,8);out.writeUInt32BE(crc(Buffer.concat([t,data])),8+data.length);return out;}
function png(name,w,h,pixel){const raw=Buffer.alloc(h*(1+w*4));for(let y=0;y<h;y++)for(let x=0;x<w;x++){const p=pixel((x+.5)/w*2-1,(y+.5)/h*2-1,x,y);for(let c=0;c<4;c++)raw[y*(1+w*4)+1+x*4+c]=Math.max(0,Math.min(255,Math.round(p[c])));}const ih=Buffer.alloc(13);ih.writeUInt32BE(w);ih.writeUInt32BE(h,4);ih[8]=8;ih[9]=6;output(name,Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ih),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]));}
const g=(name,fn,size=128)=>png('graphics/original/'+name+'.png',size,size,fn);
g('glow',(x,y)=>[255,255,255,255*Math.max(0,1-Math.hypot(x,y))**2]);
g('ring',(x,y)=>[255,255,255,255*Math.max(0,1-Math.abs(Math.hypot(x,y)-.77)/.12)]);
g('beam',(x,y)=>[255,255,255,255*Math.max(0,1-Math.abs(y))**2]);
g('flame',(x,y)=>[255,255,255,255*Math.max(0,1-Math.abs(x))**.5*Math.max(0,1-Math.abs(y)/.4)**2]);
g('projectile',(x,y)=>[255,255,255,255*Math.max(0,1-Math.abs(y)/.28)*Math.max(0,1-Math.abs(x))]);
g('rocket',(x,y)=>[195,224,240,255*Number(Math.abs(x)<.82&&Math.abs(y)<.22*(1-x*.7))],64);
g('asteroid',(x,y)=>{const r=Math.hypot(x,y),edge=.73+.07*Math.sin(Math.atan2(y,x)*7);const v=105+22*Math.sin(x*16+y*11)+20*(x-y);return[v,v*.9,v*.82,r<edge?255:0];});
g('nebula',(x,y)=>[130,160,195,130*Math.max(0,1-Math.hypot(x,y))**2*(.65+.35*Math.cos(x*15)*Math.sin(y*13))]);
g('damage',(x,y)=>[65,55,50,150*Math.max(0,1-Math.hypot(x,y))**2]);
g('arc',(x,y)=>[255,255,255,Math.abs(y-.18*Math.sin(x*31)-.1*Math.sin(x*63))<.04?255:0]);
g('space',(_x,_y,x,y)=>{const star=((Math.imul(x+3,73856093)^Math.imul(y+7,19349663))>>>0)%1603===0;return star?[155,190,220,255]:[5,9,19,255];},512);
png('graphics/portraits/web_captain.png',128,128,(x,y)=>{const head=x*x+(y+.3)**2<.13,shoulders=(x*x/.5+(y-.65)**2/.35)<1;return head||shoulders?[136,218,243,255]:[12,26,43,255];});
for(const [name,hz,seconds]of [['ui',700,.1],['fire',140,.2],['impact',65,.35],['engine',90,1]]){const rate=22050,n=Math.round(seconds*rate),data=Buffer.alloc(n*2);for(let i=0;i<n;i++){const t=i/rate,env=Math.min(1,t*100)*(name==='engine'?1:Math.exp(-t/seconds*5))*Math.min(1,(seconds-t)*100);const value=(Math.sin(2*Math.PI*hz*t)+.3*Math.sin(2*Math.PI*hz*2*t))*.2*env;data.writeInt16LE(Math.round(value*32767),i*2);}const hdr=Buffer.alloc(44);hdr.write('RIFF');hdr.writeUInt32LE(36+data.length,4);hdr.write('WAVEfmt ',8);hdr.writeUInt32LE(16,16);hdr.writeUInt16LE(1,20);hdr.writeUInt16LE(1,22);hdr.writeUInt32LE(rate,24);hdr.writeUInt32LE(rate*2,28);hdr.writeUInt16LE(2,32);hdr.writeUInt16LE(16,34);hdr.write('data',36);hdr.writeUInt32LE(data.length,40);output('sounds/original/'+name+'.wav',Buffer.concat([hdr,data]));}
fs.writeFileSync(path.join(root,'public/procedural-asset-provenance.json'),JSON.stringify({version:1,records},null,2)+'\n');
console.log('Generated independent assets:',records.length);
