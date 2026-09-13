// 缓存 HTMLImage 元素避免每帧重新实例化与闪烁
import { assetResolver } from '../../engine/assets/AssetResolver';

const hudImageCache = new Map<string, HTMLImageElement>();

export function getCachedImage(url: string): HTMLImageElement {
  let img = hudImageCache.get(url);
  if (!img) {
    img = new Image();
    img.src = assetResolver.url(url);
    hudImageCache.set(url, img);
  }
  return img;
}
