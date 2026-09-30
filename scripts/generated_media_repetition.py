"""Reduce the feature scale of generated periodic material via exact tile repetition."""
from PIL import Image
from generated_media_tiles import export_periodic_tile


def export_repeated_tile(source, output_size, axes, repetitions, alpha_floor=3, alpha_ceiling=255):
    if repetitions not in (2, 4) or axes != 'xy':
        raise ValueError('Repeated material requires xy and exactly 2 or 4 repeats')
    if any(n % repetitions for n in output_size):
        raise ValueError('Repeat grid must exactly divide the target dimensions')
    size = tuple(n // repetitions for n in output_size)
    tile, info = export_periodic_tile(source, size, axes, alpha_floor, alpha_ceiling)
    result = Image.new('RGBA', output_size)
    for y in range(repetitions):
        for x in range(repetitions):
            result.paste(tile, (x * size[0], y * size[1]))
    info.update({'tileRepeat': repetitions, 'tileSize': list(size),
                 'repetitionMethod': 'generated material resampled at smaller feature scale and repeated without painting or original pixels'})
    return result, info
