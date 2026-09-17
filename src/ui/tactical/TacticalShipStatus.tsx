import { useEffect, useRef } from 'react';
import type { Ship } from '../../engine/simulation/Ship';
import { i18n } from '../../engine/i18n/LocalizationManager';
import { shipLocalToSpritePixel } from '../../engine/render/ShipDamageVisuals';
import { getCachedImage } from '../hud/hudUtils';
import { HudMeter } from '../hud/HudMeter';
import { NativeBitmapText } from '../NativeBitmapText';

/** Fixed, bow-up cyan silhouette with live armor cells, hull and CR. No rotating portrait. */
export function TacticalShipStatus({ ship }: { ship: Ship }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas=ref.current,ctx=canvas?.getContext('2d');if(!canvas||!ctx)return;
    let frame=0,last=-100;
    const draw=(time:number)=>{
      if(time-last>66){last=time;ctx.clearRect(0,0,190,166);
        const image=getCachedImage(ship.spec.spriteUrl);
        if(image.complete&&image.naturalWidth){
          const scale=Math.min(184/ship.spec.spriteWidth,160/ship.spec.spriteHeight);
          const w=ship.spec.spriteWidth*scale,h=ship.spec.spriteHeight*scale,x=(190-w)/2,y=(166-h)/2;
          ctx.drawImage(image,x,y,w,h);ctx.globalCompositeOperation='source-in';ctx.fillStyle='#287a92';ctx.fillRect(0,0,190,166);
          ctx.globalCompositeOperation='source-atop';
          for(let r=0;r<ship.armor.rows;r++)for(let c=0;c<ship.armor.cols;c++){
            const p=shipLocalToSpritePixel(ship.spec,ship.armor.getCellCenterLocal(c,r));
            const ratio=Math.max(0,Math.min(1,ship.armor.getCell(c,r)/ship.armor.maxCellArmor));
            const cw=ship.armor.cellHeight*scale,ch=ship.armor.cellWidth*scale;
            ctx.fillStyle=ratio>.75?'rgba(54,197,201,.44)':ratio>.25?'rgba(225,175,53,.85)':ratio>.03?'rgba(208,83,20,.9)':'rgba(0,2,5,.95)';
            ctx.fillRect(x+p.x*scale-cw/2,y+p.y*scale-ch/2,cw-.6,ch-.6);
          }
          // Source hull shading remains very faint beneath the holographic grid.
          ctx.globalAlpha=.12;ctx.drawImage(image,x,y,w,h);ctx.globalAlpha=1;
          ctx.strokeStyle='rgba(119,224,235,.25)';ctx.lineWidth=.6;
          for(let i=0;i<190;i+=15){ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i,166);ctx.stroke();}
          for(let i=0;i<166;i+=15){ctx.beginPath();ctx.moveTo(0,i);ctx.lineTo(190,i);ctx.stroke();}
          ctx.globalCompositeOperation='source-over';
        }
      }frame=requestAnimationFrame(draw);
    };frame=requestAnimationFrame(draw);return()=>cancelAnimationFrame(frame);
  },[ship]);
  const value=(text:string)=><NativeBitmapText font="caption" color="currentColor">{text}</NativeBitmapText>;
  return <aside className="tactical-ship-status" aria-label="旗舰状态">
    <div className="tactical-status-meter"><span>幅能</span><HudMeter label="旗舰幅能" value={ship.flux.fluxPercent} minimum={ship.flux.hardFlux/ship.flux.maxFlux} width={80} /><b>{value(String(Math.round(ship.flux.totalFlux)))}</b></div>
    <div className="tactical-status-meter"><span>结构</span><HudMeter label="旗舰结构" value={ship.hullHp/ship.maxHullHp} width={80} /><b>{value(String(Math.ceil(ship.hullHp)))}</b></div>
    <div className="tactical-status-meter"><span>战备</span><HudMeter label="旗舰战备" value={ship.currentCR} width={80} /><b>{value(Math.round(ship.currentCR*100)+'%')}</b></div>
    <canvas ref={ref} width={190} height={166} aria-label="旗舰装甲状况" />
    <strong>{value(i18n.t(ship.spec.nameKey))}</strong><span>{value(i18n.t(ship.spec.designationKey))}</span>
  </aside>;
}
