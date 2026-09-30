"""Deterministic color-channel separation, not image generation or repainting.
Cyan emitter guides and material share one source/transform; no original image pixels are used.
"""
from PIL import Image, ImageChops, ImageFilter


def export_material_layer(source, canvas_size, output_size, layer, alpha_floor=3, alpha_ceiling=255):
    if source.mode != 'RGBA' or source.width != source.height:
        raise ValueError('Registered material source must be square RGBA')
    if layer not in ('base', 'glow') or not 0 <= alpha_floor <= 8:
        raise ValueError('Invalid material layer or alpha floor')
    if not 8 <= canvas_size <= 512 or any(n > canvas_size for n in output_size):
        raise ValueError('Output must fit the registered material canvas')
    if any((canvas_size - n) % 2 for n in output_size):
        raise ValueError('Centered crop must have integer offsets')
    if not 32 <= alpha_ceiling <= 255:
        raise ValueError('Invalid layer alpha ceiling')
    red, green, blue, alpha = source.split()
    alpha = alpha.point(lambda a: 0 if a <= alpha_floor else a)
    edges=[(0,0,source.width,1),(0,source.height-1,source.width,source.height),(0,0,1,source.height),(source.width-1,0,source.width,source.height)]
    if any(alpha.crop(e).getextrema()[1] for e in edges):
        raise ValueError('Material source touches cell boundary')
    guide = ImageChops.subtract(ImageChops.darker(green, blue), red).point(lambda d: round(255 * max(0, min(1, (d - 18) / 110))))
    emission = ImageChops.multiply(guide, alpha)
    fraction = sum(emission.histogram()[32:]) / (source.width * source.height)
    if not .00025 <= fraction <= .35:
        raise ValueError('Missing or excessive cyan emitter guide: '+str(fraction))
    if layer == 'base':
        # Remove guide chroma only: neutral value comes from those same source pixels.
        neutral = ImageChops.darker(ImageChops.darker(red, green), blue)
        chroma_region = guide.point(lambda v: 255 if v else 0)
        result = Image.merge('RGBA', (Image.composite(neutral, red, chroma_region), Image.composite(neutral, green, chroma_region), Image.composite(neutral, blue, chroma_region), alpha))
        result = result.resize((canvas_size, canvas_size), Image.Resampling.LANCZOS)
    else:
        emission = emission.resize((canvas_size, canvas_size), Image.Resampling.LANCZOS)
        peak = emission.getextrema()[1]
        if peak < 8:
            raise ValueError('Emitter vanishes at export size')
        # Preserve readable peak intensity after subpixel emitters are downsampled.
        emission = emission.point(lambda a: round(a * 255 / peak))
        # Optical spread derives only from those registered emitter pixels.
        halo = emission.filter(ImageFilter.GaussianBlur(canvas_size * .035))
        halo_peak = max(1, halo.getextrema()[1])
        halo = halo.point(lambda a: round(a * 255 * .45 / halo_peak))
        emission = ImageChops.lighter(emission, halo)
        result = Image.new('RGBA', (canvas_size, canvas_size), (255,255,255,0))
        result.putalpha(emission)
    left, top = (canvas_size-output_size[0])//2, (canvas_size-output_size[1])//2
    crop = [left, top, left+output_size[0], top+output_size[1]]
    result = result.crop(crop)
    a = result.getchannel('A').point(lambda v: 0 if round(v*alpha_ceiling/255) <= alpha_floor else round(v*alpha_ceiling/255))
    result.putalpha(a)
    if a.getextrema()[1] < 20:
        raise ValueError('Exported material layer has no readable signal')
    w,h = result.size
    edges=[(0,0,w,1),(0,h-1,w,h),(0,0,1,h),(w-1,0,w,h)]
    if any(a.crop(e).getextrema()[1] for e in edges):
        raise ValueError('Registered output has nonempty outer edge')
    return result, {'algorithm':'cyan-emitter-separation-v1','layer':layer,'canvasSize':[canvas_size,canvas_size],'outputCrop':crop,'guideFormula':'clamp((min(G,B)-R-18)/110,0,1) * sourceAlpha','sourceEmitterFraction':round(fraction,6),'glowHaloRadiusFraction':.035,'glowHaloStrength':.45,'emissionPeakNormalization':'normalize downsampled core to 255, then apply original alpha ceiling','baseGuideNeutralization':'min(R,G,B) at any nonzero cyan guide pixel','alphaCeiling':alpha_ceiling,'transforms':'same full-source resample; centered integer crop only; no per-layer tight crop'}
