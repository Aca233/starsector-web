import { useEffect, useRef } from 'react';
import type { CombatHudView } from '../../engine/runtime/CombatHudView';
import { signedAngle } from '../../engine/math/Angles';
import { hasCombatInputFocus } from '../../engine/runtime/CombatInputFocus';
import type { FloatingShipHUDProps } from './FloatingShipHUD';
import { clampContact } from './ContactLayout';

type Props = Pick<FloatingShipHUDProps, 'cameraPosRef'|'zoomRef'|'canvasRef'|'alphaRef'> & {engine:CombatHudView};
/** One read-only flagship overlay. No picker, game mutation or simulated lock in the UI. */
export function GravityTractorHUD({engine,cameraPosRef,zoomRef,canvasRef,alphaRef}:Props) {
  const root=useRef<HTMLDivElement>(null),bracket=useRef<SVGPathElement>(null),tether=useRef<SVGLineElement>(null);
  const pushArrow=useRef<SVGPathElement>(null),anchor=useRef<SVGGElement>(null),label=useRef<HTMLDivElement>(null),title=useRef<HTMLDivElement>(null);
  const bar=useRef<HTMLDivElement>(null);
  const rightRoot=useRef<HTMLDivElement>(null),rightBracket=useRef<SVGPathElement>(null),rightTether=useRef<SVGLineElement>(null);
  const rightArrow=useRef<SVGPathElement>(null),rightAnchor=useRef<SVGGElement>(null),rightLabel=useRef<HTMLDivElement>(null),rightTitle=useRef<HTMLDivElement>(null),rightBar=useRef<HTMLDivElement>(null);
  const areaRoot=useRef<HTMLDivElement>(null),areaBoundary=useRef<SVGPathElement>(null),areaLabel=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const canvas=canvasRef?.current;if(!canvas)return;
    let frame=0;
    const update=()=>{
      const owner=engine.weaponShip,group=owner.weaponGroups[owner.selectedGroupIndex];
      const mount=owner.weapons.find(m=>m.spec.gravityTractor && group?.weaponSlotIds.includes(m.slotId)),state=mount?.gravityTractor;
      const push=engine.playerShip.defenseSystem?.gravityPush,rightActive=!!push?.target&&!!engine.playerShip.defenseSystem?.gravityControlHeld;
      const areaSystem=engine.playerShip.systems.find(s=>s.gravityField&&(s.definition.gravityField?.cursorSpeed||s.definition.gravityCollapse)&&(s.state==='IN'||s.state==='ACTIVE')&&!s.disabled),field=areaSystem?.gravityField;
      const areaVisible=!!field&&!engine.playerShip.isDead&&!engine.playerShip.isPhased&&!engine.playerShip.flux.isVenting&&!engine.playerShip.flux.isOverloaded&&engine.playerShip.fireControlMode==='MANUAL'&&!engine.isTacticalMap&&hasCombatInputFocus();
      if(areaRoot.current){
        const node=areaRoot.current;node.style.display=areaVisible?'block':'none';
        if(areaVisible&&field&&areaSystem){
          const width=canvas.clientWidth,height=canvas.clientHeight,scaleX=width/Math.max(1,canvas.width),scaleY=height/Math.max(1,canvas.height),zoom=zoomRef?.current??1,cam=cameraPosRef?.current;
          const x=(field.x-(cam?.x??0))*zoom*scaleX+width/2,y=(field.y-(cam?.y??0))*zoom*scaleY+height/2;
          const collapse=field.kind==='COLLAPSE',repel=field.polarity===-1;
          node.dataset.gravityArea=collapse?'collapse':repel?'repulsion':'attraction';
          node.style.color=collapse?'#d7c08a':repel?'#d4b495':'#b8c0bc';
          if(areaBoundary.current){
            const path=areaBoundary.current,rx=field.radius*zoom*scaleX,ry=field.radius*zoom*scaleY;
            const span=collapse?.18:areaSystem.gravityControlHeld?.12:.045;
            const segments=Array.from({length:8},(_,i)=>{const a=i*Math.PI/4-span/2,b=a+span;return 'M '+(x+Math.cos(a)*rx)+' '+(y+Math.sin(a)*ry)+' A '+rx+' '+ry+' 0 0 1 '+(x+Math.cos(b)*rx)+' '+(y+Math.sin(b)*ry);});
            path.setAttribute('d',segments.join(' '));path.dataset.radiusX=String(rx);path.dataset.radiusY=String(ry);
            path.style.opacity=collapse?'.8':areaSystem.gravityControlHeld?'.65':'.4';
          }
          if(areaLabel.current){
            areaLabel.current.style.display=x>=0&&x<=width&&y>=0&&y<=height?'block':'none';
            let labelY=y-28;
            // A field is often placed directly on a hull: keep its small timer above real artwork.
            const labelX=clampContact(x+16,8,width-210),alpha=alphaRef?.current??1;
            for(const ship of engine.ships){
              if(ship.isDead||ship.isDocked||ship.isRetreated||ship.spec.bounds.length<3)continue;
              const pos=ship.interpolatedPos(alpha),angle=ship.prevFacingRad+signedAngle(ship.facingRad-ship.prevFacingRad)*alpha,c=Math.cos(angle),sn=Math.sin(angle);
              let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;
              for(const [bx,by]of ship.spec.bounds){const px=(pos.x+bx*c-by*sn-(cam?.x??0))*zoom*scaleX+width/2,py=(pos.y+bx*sn+by*c-(cam?.y??0))*zoom*scaleY+height/2;left=Math.min(left,px);right=Math.max(right,px);top=Math.min(top,py);bottom=Math.max(bottom,py);}
              const tagged=owner.weapons.some(m=>m.gravityTractor?.phase!=='IDLE' && m.gravityTractor?.target?.kind==='SHIP' && m.gravityTractor.target.id===ship.id)
                || push?.target?.kind==='SHIP' && push.target.id===ship.id;
              if(labelX+200>left-8&&labelX<right+8&&labelY+20>top-8&&labelY<bottom+8)labelY=Math.min(labelY,top-(tagged?58:30));
            }
            if(labelY<8)areaLabel.current.style.display='none';
            areaLabel.current.style.transform='translate('+labelX+'px,'+clampContact(labelY,8,height-32)+'px)';
            areaLabel.current.textContent=collapse?(areaSystem.state==='IN'?'到期坍缩 · '+Math.max(0,areaSystem.activeTimer).toFixed(1)+'s':'到期潮汐爆')
              :areaSystem.state==='IN'?'区域建立 · '+Math.max(0,areaSystem.activeTimer).toFixed(1)+'s':(repel?'排斥':'吸引')+' · '+(areaSystem.gravityControlHeld?'操纵中':field.cursorControlled?'驻留 '+Math.max(0,field.lingerRemaining??0).toFixed(1)+'s':'自主场')+' / 总余'+Math.max(0,areaSystem.activeTimer).toFixed(1)+'s';
          }
        }
      }
      // Separate compact entity markers: RMB can never hide the actual LMB grip.
      for(const overlay of [
        {root,bracket,tether,pushArrow,anchor,label,title,bar,right:false},
        {root:rightRoot,bracket:rightBracket,tether:rightTether,pushArrow:rightArrow,anchor:rightAnchor,label:rightLabel,title:rightTitle,bar:rightBar,right:true},
      ]){
      const {root,bracket,tether,pushArrow,anchor,label,title,bar}=overlay,el=root.current,pushing=overlay.right&&rightActive;
      const visible=el&&(overlay.right?pushing:!!mount&&!!state&&state.phase!=='IDLE')&&!owner.isDead&&owner.fireControlMode==='MANUAL'&&!engine.isTacticalMap&&hasCombatInputFocus();
      if(el){el.style.display=visible?'block':'none';el.dataset.gravityPhase=pushing?'PUSH':state?.phase??'IDLE';}
      if(visible&&el){
        const phase=pushing?'PUSH':state?.phase??'IDLE',held=phase==='HOLD',capturing=phase==='CAPTURE',active=held||capturing||pushing;
        const target=pushing?push!.target:state?.target;
        el.dataset.gravityPhase=phase;el.dataset.gravityPolarity=pushing||state?.polarity===-1?'repulsion':'attraction';
        const width=canvas.clientWidth,height=canvas.clientHeight,scaleX=width/Math.max(1,canvas.width),scaleY=height/Math.max(1,canvas.height);
        const zoom=zoomRef?.current??1,cam=cameraPosRef?.current,alpha=alphaRef?.current??1;
        const screen=(x:number,y:number)=>({x:(x-(cam?.x??0))*zoom*scaleX+width/2,y:(y-(cam?.y??0))*zoom*scaleY+height/2});
        const point=pushing?screen(push!.x,push!.y):state?screen(state.contactX,state.contactY):{x:0,y:0};
        let left=point.x-20,right=point.x+20,top=point.y-20,bottom=point.y+20;
        if(active){
          const ship=target?.kind==='SHIP'?engine.ships.find(s=>s.id===target.id):undefined;
          if(ship&&ship.spec.bounds.length>=3){
            const pos=ship.interpolatedPos(alpha),facing=ship.prevFacingRad+signedAngle(ship.facingRad-ship.prevFacingRad)*alpha,c=Math.cos(facing),s=Math.sin(facing);
            left=top=Infinity;right=bottom=-Infinity;
            for(const [x,y] of ship.spec.bounds){const p=screen(pos.x+x*c-y*s,pos.y+x*s+y*c);left=Math.min(left,p.x);right=Math.max(right,p.x);top=Math.min(top,p.y);bottom=Math.max(bottom,p.y);}
          }else{
            const r=Math.max(18,(pushing?push!.radius:state?.targetRadius??12)*zoom*Math.max(scaleX,scaleY));left=point.x-r;right=point.x+r;top=point.y-r;bottom=point.y+r;
          }
          left-=8;right+=8;top-=8;bottom+=8;
        }
        if(bracket.current){
          bracket.current.style.display=active?'block':'none';const n=Math.min(22,(right-left)/3,(bottom-top)/3);
          bracket.current.setAttribute('d',
            'M '+left+' '+(top+n)+' V '+top+' H '+(left+n)+' M '+(right-n)+' '+top+' H '+right+' V '+(top+n)+
            ' M '+right+' '+(bottom-n)+' V '+bottom+' H '+(right-n)+' M '+(left+n)+' '+bottom+' H '+left+' V '+(bottom-n));
        }
        // Keep direction feedback outside the hull, not buried in dense artwork.
        const edge=pushing?Math.max(0,Math.min(Math.abs(push!.dx)>1e-6?(push!.dx>0?right-point.x:point.x-left)/Math.abs(push!.dx):Infinity,Math.abs(push!.dy)>1e-6?(push!.dy>0?bottom-point.y:point.y-top)/Math.abs(push!.dy):Infinity))+8:0;
        const start=pushing?{x:point.x+push!.dx*edge,y:point.y+push!.dy*edge}:point;
        const a=pushing?{x:start.x+push!.dx*52,y:start.y+push!.dy*52}:state?screen(state.anchorX,state.anchorY):point;
        if(pushArrow.current){pushArrow.current.style.display=pushing?'block':'none';pushArrow.current.setAttribute('transform','translate('+a.x+' '+a.y+') rotate('+Math.atan2(push?.dy??0,push?.dx??1)*180/Math.PI+')');}
        if(anchor.current){anchor.current.style.display=held?'block':'none';anchor.current.setAttribute('transform','translate('+a.x+' '+a.y+')');}
        const separated=(held||pushing)&&Math.hypot(a.x-point.x,a.y-point.y)>24;
        if(tether.current){tether.current.style.display=separated?'block':'none';tether.current.setAttribute('x1',String(start.x));tether.current.setAttribute('y1',String(start.y));tether.current.setAttribute('x2',String(a.x));tether.current.setAttribute('y2',String(a.y));}
        const progress=state&&mount?Math.min(100,Math.floor(state.capture/(state.target?.kind==='PROJECTILE'?mount!.spec.gravityTractor!.projectileCaptureTime:mount!.spec.gravityTractor!.captureTime)*100)):0;
        const self=target?.kind==='SHIP'&&target.id===owner.id;
        if(title.current)title.current.textContent=pushing?'定向推送':held?(self?'本舰牵引 · ':'已抓住 · ')+Math.max(0,mount!.spec.gravityTractor!.holdTime-state!.age).toFixed(1)+'s':capturing?(self?'本舰捕获中 ':'捕获中 ')+progress+'%':'';
        if(bar.current){bar.current.parentElement!.style.display=capturing?'block':'none';const fraction=state&&mount?(held?1-state.age/mount!.spec.gravityTractor!.holdTime:state.capture/(state.target?.kind==='PROJECTILE'?mount!.spec.gravityTractor!.projectileCaptureTime:mount!.spec.gravityTractor!.captureTime)):0;bar.current.style.width=(Math.max(0,Math.min(1,fraction))*100)+'%';}
        if(label.current){
          label.current.style.display=active?'block':'none';
          const x=(left+right)/2-55,y=top-32;
          label.current.style.transform='translate('+clampContact(x,8,width-128)+'px,'+clampContact(y,8,height-36)+'px)';
        }
      }
      }
      frame=requestAnimationFrame(update);
    };
    frame=requestAnimationFrame(update);
    return()=>cancelAnimationFrame(frame);
  },[engine,cameraPosRef,zoomRef,canvasRef,alphaRef]);
  return <><div ref={root} className="gravity-tractor-hud" data-gravity-control="LEFT" data-gravity-phase="IDLE" style={{display:'none'}}>
    <svg className="gravity-grab-lines" aria-hidden="true"><path ref={bracket} className="gravity-grab-bracket"/><line ref={tether} className="gravity-grab-tether"/><path ref={pushArrow} className="gravity-push-arrow" d="M -10 -7 L 0 0 L -10 7"/><g ref={anchor} className="gravity-grab-anchor"><circle r="7"/><path d="M -12 0 H 12 M 0 -12 V 12"/></g></svg>
    <div ref={label} className="gravity-grab-label" role="status" aria-live="off" aria-label="引力操纵状态"><div ref={title} className="gravity-grab-title"/><div className="gravity-grab-meter"><div ref={bar}/></div></div>
  </div><div ref={rightRoot} className="gravity-tractor-hud gravity-directional-hud" data-gravity-control="RIGHT" data-gravity-phase="IDLE" style={{display:'none'}}>
    <svg className="gravity-grab-lines" aria-hidden="true"><path ref={rightBracket} className="gravity-grab-bracket"/><line ref={rightTether} className="gravity-grab-tether"/><path ref={rightArrow} className="gravity-push-arrow" d="M -10 -7 L 0 0 L -10 7"/><g ref={rightAnchor} className="gravity-grab-anchor"/></svg>
    <div ref={rightLabel} className="gravity-grab-label" role="status" aria-live="off" aria-label="右键推送状态"><div ref={rightTitle} className="gravity-grab-title"/><div className="gravity-grab-meter"><div ref={rightBar}/></div></div>
  </div><div ref={areaRoot} className="gravity-area-hud" style={{display:'none'}}>
    <svg className="gravity-area-lines" aria-hidden="true"><path ref={areaBoundary}/></svg>
    <div ref={areaLabel} className="gravity-area-label" role="status" aria-live="off"/>
  </div></>;
}
