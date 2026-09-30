"""Extract an AI-authored grayscale functional mask, without drawing a silhouette."""
from PIL import Image, ImageOps
import numpy as np


def export_luminance_mask(source, output_size, bounds, alpha_floor=3):
    if source.mode not in ('RGB', 'RGBA') or (source.mode == 'RGBA' and source.getchannel('A').getextrema() != (255, 255)):
        raise ValueError('Mask master must be opaque grayscale RGB/RGBA')
    rgb = np.array(source.convert('RGB'), dtype=np.int16)
    if np.quantile(rgb.max(axis=2) - rgb.min(axis=2), .99) > 12:
        raise ValueError('Mask master must be neutral grayscale')
    alpha = source.convert('L').point(lambda v: 0 if v <= alpha_floor else v)
    a = np.array(alpha); h, w = a.shape
    if max(a[0].max(), a[-1].max(), a[:, 0].max(), a[:, -1].max()) > 0:
        raise ValueError('Mask master must have a black border')
    y, x = np.ogrid[:h, :w]; inner = (x - (w - 1)/2)**2 + (y - (h - 1)/2)**2 < (min(w,h)*.30)**2
    if np.quantile(a[inner], .01) < 245:
        raise ValueError('Functional mask has holes or a translucent interior')
    box = alpha.getbbox()
    if not box or not .95 < (box[2]-box[0])/(box[3]-box[1]) < 1.05:
        raise ValueError('Functional mask must be circular and nonempty')
    result = Image.new('RGBA', output_size)
    shape = ImageOps.contain(alpha.crop(box), (bounds[2]-bounds[0],bounds[3]-bounds[1]), Image.Resampling.LANCZOS)
    sprite = Image.new('RGBA', shape.size, (255,255,255,0)); sprite.putalpha(shape)
    result.paste(sprite, (bounds[0]+(bounds[2]-bounds[0]-shape.width)//2, bounds[1]+(bounds[3]-bounds[1]-shape.height)//2))
    return result, {'algorithm':'grayscale-luminance-to-alpha-v1','transforms':'generated grayscale intensity becomes alpha; bound-crop and contain in original alpha rectangle; white RGB for neutral masking; no original pixels or new silhouette'}
