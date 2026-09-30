"""Technical full-canvas UV atlas export; no painting and no original pixels."""
from PIL import Image
import numpy as np


def export_uv_sheet(source, output_size, columns=1, rows=1, repeat_axis='x', alpha_floor=3, alpha_ceiling=255):
    if source.mode != 'RGBA' or min(source.size) < 256:
        raise ValueError('UV source must be adequately sized RGBA')
    width, height = output_size
    if source.width * height != source.height * width:
        raise ValueError('UV sheet aspect ratio must match without cropping/stretching')
    if not 1 <= columns <= 8 or not 1 <= rows <= 8 or width % columns or height % rows:
        raise ValueError('UV cell grid must divide output dimensions')
    if repeat_axis not in ('x', 'y') or min(width // columns, height // rows) < 16:
        raise ValueError('UV repeat axis or cell dimensions invalid')
    if not 0 <= alpha_floor <= 8 or not 32 <= alpha_ceiling <= 255:
        raise ValueError('UV alpha constraints invalid')
    if source.getchannel('A').getextrema()[0] > 3:
        raise ValueError('UV sheet needs genuinely transparent areas')
    # Resample every cell independently to avoid filtering across atlas boundaries.
    output = Image.new('RGBA', output_size)
    cw, ch = width // columns, height // rows
    bands = []
    for row in range(rows):
        for column in range(columns):
            box = (round(column * source.width / columns), round(row * source.height / rows),
                   round((column + 1) * source.width / columns), round((row + 1) * source.height / rows))
            image = source.crop(box).resize((cw, ch), Image.Resampling.LANCZOS)
            pixels = np.array(image, dtype=np.float64) / 255
            pixels[:, :, :3] *= pixels[:, :, 3:4]
            n = cw if repeat_axis == 'x' else ch
            band = max(2, round(n * .04)); bands.append(band)
            before = pixels.copy()
            for offset in range(band):
                weight = (1 + np.cos(np.pi * offset / (band - 1))) / 2
                left = before[:, offset] if repeat_axis == 'x' else before[offset]
                right = before[:, n - 1 - offset] if repeat_axis == 'x' else before[n - 1 - offset]
                average = (left + right) / 2
                if repeat_axis == 'x':
                    pixels[:, offset] = left * (1 - weight) + average * weight
                    pixels[:, n - 1 - offset] = right * (1 - weight) + average * weight
                else:
                    pixels[offset] = left * (1 - weight) + average * weight
                    pixels[n - 1 - offset] = right * (1 - weight) + average * weight
            alpha = pixels[:, :, 3:4]
            rgb = np.divide(pixels[:, :, :3], alpha, out=np.zeros_like(pixels[:, :, :3]), where=alpha > 0)
            rgba = np.rint(np.clip(np.concatenate([rgb * 255, alpha * alpha_ceiling], axis=2), 0, 255)).astype(np.uint8)
            rgba[rgba[:, :, 3] <= alpha_floor] = 0
            if rgba[:, :, 3].max() < 16:
                raise ValueError('UV atlas contains an empty cell')
            a, b = (rgba[:, 0], rgba[:, -1]) if repeat_axis == 'x' else (rgba[0], rgba[-1])
            if not np.array_equal(a, b):
                raise ValueError('UV periodic seam failed')
            output.paste(Image.fromarray(rgba), (column * cw, row * ch))
    return output, {'algorithm': 'per-cell-premultiplied-opposed-edge-cosine-v1', 'grid': [columns, rows],
                    'repeatAxis': repeat_axis, 'edgeBandPixels': bands, 'alphaCeiling': alpha_ceiling,
                    'seamMaxPixelDifference': 0, 'transforms': 'independent cell LANCZOS resample and narrow periodic edge correction; no original pixels or new artwork'}
