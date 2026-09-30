import { useEffect, useRef } from 'react';
import type { MapFlagship } from '../../engine/runtime/TacticalMapView';
import { i18n } from '../../engine/i18n/LocalizationManager';
import { HullPortraitPainter } from '../hud/HullPortraitPainter';
import { HudMeter } from '../hud/HudMeter';
import { NativeBitmapText } from '../NativeBitmapText';

/** Fixed, bow-up cyan silhouette with live armor cells, hull and CR. No rotating portrait. */
export function TacticalShipStatus({ ship, readShip }: { ship: MapFlagship; readShip: () => MapFlagship }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const live = useRef(readShip);
  useEffect(() => { live.current = readShip; }, [readShip]);
  useEffect(() => {
    const canvas=ref.current,ctx=canvas?.getContext('2d');if(!canvas||!ctx)return;
    const painter=new HullPortraitPainter('map');
    let frame=0,last=-100;
    const draw=(time:number)=>{
      const ship = live.current();
      if(time-last>66){last=time;ctx.clearRect(0,0,190,166);
        canvas.dataset.renderedParts=String(painter.draw(ctx,ship.hullPortrait,190,166));
        ctx.save();ctx.globalCompositeOperation='source-atop';ctx.strokeStyle='rgba(119,224,235,.25)';ctx.lineWidth=.6;
        for(let i=0;i<190;i+=15){ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i,166);ctx.stroke();}
        for(let i=0;i<166;i+=15){ctx.beginPath();ctx.moveTo(0,i);ctx.lineTo(190,i);ctx.stroke();}
        ctx.restore();
      }frame=requestAnimationFrame(draw);
    };frame=requestAnimationFrame(draw);return()=>cancelAnimationFrame(frame);
  },[]);
  const value=(text:string)=><NativeBitmapText font="caption" color="currentColor">{text}</NativeBitmapText>;
  return <aside className="tactical-ship-status" aria-label="旗舰状态">
    <div className="tactical-status-meter"><span>载荷</span><HudMeter label="旗舰载荷" value={ship.flux.fluxPercent} minimum={ship.flux.hardFlux/ship.flux.maxFlux} width={80} /><b>{value(String(Math.round(ship.flux.totalFlux)))}</b></div>
    <div className="tactical-status-meter"><span>结构</span><HudMeter label="旗舰结构" value={ship.hullHp/ship.maxHullHp} width={80} /><b>{value(String(Math.ceil(ship.hullHp)))}</b></div>
    <div className="tactical-status-meter"><span>战备</span><HudMeter label="旗舰战备" value={ship.currentCR} width={80} /><b>{value(Math.round(ship.currentCR*100)+'%')}</b></div>
    <canvas ref={ref} width={190} height={166} aria-label="旗舰装甲状况" />
    <strong>{value(i18n.t(ship.spec.nameKey))}</strong><span>{value(i18n.t(ship.spec.designationKey))}</span>
  </aside>;
}
