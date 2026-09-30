import { arkStaticDraws, arkArt } from '../../engine/visual/AdunArkArt';
import { ADUN_ARK_ART } from '../../engine/content/AdunArkIds';
import { useId, useMemo, type CSSProperties } from 'react';
import type { ShipSpec } from '../../engine/content/ShipSpec';
import { assemblySpriteLayout } from '../../engine/content/ModuleGeometry';
import { runtimeAssetUrl } from '../../engine/runtime/RuntimePaths';

/** One SVG viewport for the complete assembly, with native attachment/pivot geometry. */
export function AssemblyThumbnail({spec, className = '', style, label, silhouette, fit}: {
  spec: ShipSpec; className?: string; style?: CSSProperties; label?: string; silhouette?: string; fit?: {width:number;height:number;scale:number};
}) {
  const layout = useMemo(() => assemblySpriteLayout(spec), [spec]);
  const maskId = 'assembly-' + useId().replace(/[^a-zA-Z0-9_-]/g, '');
  if (fit) {
    const scale=Math.min(fit.scale,fit.width/layout.width,fit.height/layout.height);
    style={...style,width:layout.width*scale,height:layout.height*scale};
  }
  if (layout.parts.length===1 && !silhouette) return <img className={'ship-assembly-thumbnail '+className} style={style}
    src={runtimeAssetUrl(spec.spriteUrl)} alt={label??''} draggable={false} loading="lazy" />;
  const arkDraws=arkStaticDraws(spec);
  const art = arkDraws ? arkDraws.map((d,i)=><image key={i} href={runtimeAssetUrl(ADUN_ARK_ART+d.file)} x={(d.box[0]-arkArt.parts.CORE.anchor[0])*arkArt.scale} y={(d.box[1]-arkArt.parts.CORE.anchor[1])*arkArt.scale} width={d.size[0]*arkArt.scale} height={d.size[1]*arkArt.scale} />) : layout.parts.map(part => <image key={part.key} data-assembly-part={part.key}
    href={runtimeAssetUrl(part.spec.spriteUrl)} x={-part.spec.pivotX} y={-part.spec.pivotY}
    width={part.spec.spriteWidth} height={part.spec.spriteHeight}
    transform={`translate(${part.y} ${-part.x}) rotate(${part.angle*180/Math.PI})`} />);
  return <svg className={'ship-assembly-thumbnail ' + className} style={style} viewBox={`${layout.minX} ${layout.minY} ${layout.width} ${layout.height}`}
    preserveAspectRatio="xMidYMid meet" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} focusable="false">
    {silhouette ? <><defs><mask id={maskId} maskUnits="userSpaceOnUse" x={layout.minX} y={layout.minY} width={layout.width} height={layout.height} style={{maskType:'alpha'}}>{art}</mask></defs>
      <rect x={layout.minX} y={layout.minY} width={layout.width} height={layout.height} fill={silhouette} mask={`url(#${maskId})`} /></> : art}
  </svg>;
}
