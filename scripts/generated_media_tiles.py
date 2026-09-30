"""Technical periodic-edge export of generated RGBA tiles; never draws artwork."""
from PIL import Image
import numpy as np


def export_periodic_tile(source, output_size, axes, alpha_floor=3, alpha_ceiling=255):
    if axes not in ('x', 'xy'):
        raise ValueError('Explicit repeat axes x or xy required')
    if source.mode != 'RGBA' or source.width != source.height:
        raise ValueError('Periodic master must be square RGBA')
    if len(output_size) != 2 or min(output_size) < 16 or output_size[0] != output_size[1]:
        raise ValueError('Periodic output must be square and at least 16px')
    if not 0 <= alpha_floor <= 8 or not 32 <= alpha_ceiling <= 255:
        raise ValueError('Invalid alpha constraints')
    if source.getchannel('A').getextrema()[0] > 3:
        raise ValueError('Master lacks true transparent areas')
    result = source.resize(output_size, Image.Resampling.LANCZOS)
    pixels = np.array(result, dtype=np.float64) / 255
    pixels[:, :, :3] *= pixels[:, :, 3:4]
    # Correct only narrow opposed edge bands in premultiplied alpha space.
    # At each boundary both sides become identical; cosine taper reaches zero
    # at the inner edge, leaving all interior generated pixels unchanged.
    bands = {}
    for axis, dim in [('x', 1), ('y', 0)]:
        if axis not in axes:
            continue
        n = pixels.shape[dim]
        band = max(2, round(n * 0.06))
        bands[axis] = band
        before = pixels.copy()
        for offset in range(band):
            weight = (1 + np.cos(np.pi * offset / (band - 1))) / 2
            left = before[:, offset, :] if dim == 1 else before[offset, :, :]
            right = before[:, n - 1 - offset, :] if dim == 1 else before[n - 1 - offset, :, :]
            average = (left + right) / 2
            if dim == 1:
                pixels[:, offset, :] = left * (1 - weight) + average * weight
                pixels[:, n - 1 - offset, :] = right * (1 - weight) + average * weight
            else:
                pixels[offset, :, :] = left * (1 - weight) + average * weight
                pixels[n - 1 - offset, :, :] = right * (1 - weight) + average * weight
    alpha = pixels[:, :, 3:4]
    rgb = np.divide(pixels[:, :, :3], alpha, out=np.zeros_like(pixels[:, :, :3]), where=alpha > 0)
    rgba = np.concatenate([rgb * 255, alpha * alpha_ceiling], axis=2)
    rgba = np.rint(np.clip(rgba, 0, 255)).astype(np.uint8)
    rgba[rgba[:, :, 3] <= alpha_floor] = 0
    if int(rgba[:, :, 3].max()) < 32 or not np.any(rgba[:, :, 3] == 0):
        raise ValueError('Export lacks meaningful transparent artwork')
    if not np.array_equal(rgba[:, 0], rgba[:, -1]):
        raise ValueError('Horizontal seam failed')
    if 'y' in axes and not np.array_equal(rgba[0], rgba[-1]):
        raise ValueError('Vertical seam failed')
    if axes == 'x' and (np.any(rgba[:2, :, 3]) or np.any(rgba[-2:, :, 3])):
        raise ValueError('Horizontal plume has nontransparent transverse edges')
    return Image.fromarray(rgba), {
        'algorithm': 'premultiplied-opposed-edge-cosine-v1',
        'repeatAxes': axes, 'edgeBandPixels': bands,
        'alphaCeiling': alpha_ceiling,
        'transforms': 'full-canvas LANCZOS resample; opposed edge bands only; no crop or new artwork',
        'seamMaxPixelDifference': 0,
    }
