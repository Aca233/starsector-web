import React, { useRef, useEffect } from 'react';
import type { HudShip as Ship } from '../../engine/runtime/CombatHudView';
import { assemblyShipIds } from '../../engine/content/ModuleGeometry';
import { HullPortraitPainter, pickHullPortraitPart } from './HullPortraitPainter';

export interface ShipPaperDollProps {
  ship: Ship; isEnemy?: boolean; size?: number;
  selectedModuleId?: string;
  onSelectModule?: (index: number) => void;
}
/** Native-style assembly armor portrait. Click-to-control is a user-approved Web extension. */
export const ShipPaperDoll: React.FC<ShipPaperDollProps> = ({ship,isEnemy=false,size=140,selectedModuleId,onSelectModule}) => {
  const canvasRef=useRef<HTMLCanvasElement|null>(null);
  const painted=useRef<{parts:Ship['hullPortrait'];facing:number}|null>(null);
  const interactive=!isEnemy&&!!onSelectModule;
  useEffect(()=>{
    const canvas=canvasRef.current,ctx=canvas?.getContext('2d');if(!canvas||!ctx)return;
    const painter=new HullPortraitPainter(isEnemy?'enemy':'friendly');
    let frame=0,last=-100;
    const render=(time:number)=>{
      if(time-last>=66){last=time;ctx.clearRect(0,0,size,size);
        const parts=ship.hullPortrait,facing=ship.facingRad+Math.PI/2;
        canvas.dataset.renderedParts=String(painter.draw(ctx,parts,size,size,facing,selectedModuleId));
        painted.current={parts,facing};
      }
      frame=requestAnimationFrame(render);
    };
    frame=requestAnimationFrame(render);return()=>cancelAnimationFrame(frame);
  },[ship,isEnemy,size,selectedModuleId]);
  const select=(id:string)=>{
    const index=assemblyShipIds(ship.id,ship.spec).indexOf(id);
    if(index>=0)onSelectModule?.(index);
  };
  return <canvas ref={canvasRef} width={size} height={size} style={{width:size,height:size}}
    aria-label={isEnemy?'目标装甲状况':'本舰装甲状况'} tabIndex={interactive?0:undefined}
    aria-description={interactive?'点击存活武器模块接管火控；左右方向键切换，Home 返回本体。移动和防御仍控制本体。':undefined}
    title={interactive?'点击模块接管武器 · 点击本体返回 · 左右键切换 / Home 返回本体':undefined}
    data-weapon-owner={selectedModuleId}
    onPointerDown={interactive?event=>{event.stopPropagation();event.preventDefault();event.currentTarget.focus();}:undefined}
    onMouseDown={interactive?event=>event.stopPropagation():undefined}
    onClick={interactive?event=>{
      event.stopPropagation();event.preventDefault();
      const pose=painted.current;if(!pose)return;
      const rect=event.currentTarget.getBoundingClientRect();
      const part=pickHullPortraitPart(pose.parts,size,size,pose.facing,(event.clientX-rect.left)*size/rect.width,(event.clientY-rect.top)*size/rect.height);
      if(part&&(part.id===ship.id||part.canControlWeapons))select(part.id);
    }:undefined}
    onKeyDown={interactive?event=>{
      if(event.altKey||event.ctrlKey||event.metaKey||event.shiftKey||!['ArrowLeft','ArrowRight','Home'].includes(event.key))return;
      event.stopPropagation();event.preventDefault();
      if(event.key==='Home'){select(ship.id);return;}
      const parts=ship.hullPortrait.filter(part=>!part.isDead&&part.hullHp>0&&(part.id===ship.id||part.canControlWeapons));
      if(!parts.length)return;
      const current=Math.max(0,parts.findIndex(part=>part.id===(selectedModuleId??ship.id)));
      select(parts[(current+(event.key==='ArrowRight'?1:-1)+parts.length)%parts.length].id);
    }:undefined}
    className={`block select-none ${interactive?'cursor-pointer focus-visible:outline focus-visible:outline-1 focus-visible:outline-cyan-200':'pointer-events-none'}`} />;
};
