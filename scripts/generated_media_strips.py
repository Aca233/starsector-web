"""Rectangular UV strips from generated RGBA art; technical edge correction only.

Unlike square tile export, the UV artwork may use a different source aspect ratio.
Full-canvas resampling preserves its normalized centerline and transverse profile.
"""
from PIL import Image
import numpy as np


def export_horizontal_strip(source, output_size, alpha_floor=3, alpha_ceiling=255):
    if source.mode != 'RGBA' or min(source.size) < 128:
        raise ValueError('Strip source must be adequately sized RGBA')
    width, height = output_size
    if width < 16 or height < 8 or not 1 <= width / height <= 16:
        raise ValueError('Expected horizontal output strip at least 16x8')
    if not 0 <= alpha_floor <= 8 or not 32 <= alpha_ceiling <= 255:
        raise ValueError('Invalid strip alpha constraints')
    if source.getchannel('A').getextrema()[0] > 3:
        raise ValueError('Strip lacks genuine transparency')
    image = source.resize(output_size, Image.Resampling.LANCZOS)
    pixels = np.array(image, dtype=np.float64) / 255
    pixels[:, :, :3] *= pixels[:, :, 3:4]
    band = max(2, round(width * .06))
    before = pixels.copy()
    for offset in range(band):
        weight = (1 + np.cos(np.pi * offset / (band - 1))) / 2
        left, right = before[:, offset], before[:, width - 1 - offset]
        average = (left + right) / 2
        pixels[:, offset] = left * (1 - weight) + average * weight
        pixels[:, width - 1 - offset] = right * (1 - weight) + average * weight
    alpha = pixels[:, :, 3:4]
    rgb = np.divide(pixels[:, :, :3], alpha, out=np.zeros_like(pixels[:, :, :3]), where=alpha > 0)
    rgba = np.rint(np.clip(np.concatenate([rgb * 255, alpha * alpha_ceiling], axis=2), 0, 255)).astype(np.uint8)
    rgba[rgba[:, :, 3] <= alpha_floor] = 0
    if int(rgba[:, :, 3].max()) < 32 or not np.any(rgba[:, :, 3] == 0):
        raise ValueError('Empty or opaque strip')
    if not np.array_equal(rgba[:, 0], rgba[:, -1]):
        raise ValueError('Strip horizontal seam failed')
    if np.any(rgba[:2, :, 3]) or np.any(rgba[-2:, :, 3]):
        raise ValueError('Strip has nontransparent transverse edges')
    if int(rgba[:, 0, 3].max()) < 32:
        raise ValueError('Strip was tapered at its repeat boundary')
    return Image.fromarray(rgba), {
        'algorithm': 'premultiplied-horizontal-strip-v1', 'repeatAxes': 'x',
        'edgeBandPixels': band, 'alphaCeiling': alpha_ceiling,
        'sourceSize': list(source.size), 'outputSize': list(output_size),
        'transforms': 'full normalized-UV LANCZOS resample; narrow opposed X-edge correction only; no new artwork or tight crop',
        'seamMaxPixelDifference': 0,
    }
