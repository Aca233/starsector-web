import { useState } from "react";
import { modManager } from "../engine/modding/ModManager";
import { runtimeAssetUrl } from "../engine/runtime/RuntimePaths";

/** Use the same native hull sprite as the room roster, without creating a combat/refit renderer. */
export function LanHullThumbnail({hull,name}:{hull:string;name:string}) {
  const sprite=modManager.getShip(hull)?.spriteUrl;
  const [failed,setFailed]=useState<string|null>(null);
  const src=sprite?runtimeAssetUrl(sprite):null;
  return <span className="lan-hull-thumbnail">
    {src&&failed!==src?<img src={src} alt={name+"舰船缩略图"} loading="lazy" decoding="async" onError={()=>setFailed(src)}/>:<span role="img" aria-label={name+"暂无舰船缩略图"}>暂无图像</span>}
  </span>;
}
