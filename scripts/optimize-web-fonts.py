"""Compile byte-exact menu PNG compression and small, unchanged home font subsets.

Offline maintenance tool only: python -m pip install 'fonttools[woff]'
Run from any directory. Does not touch career fonts or source game assets.
"""
from pathlib import Path
import hashlib
import json
import struct
import zlib
from io import BytesIO
from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.pens.recordingPen import DecomposingRecordingPen

ROOT = Path(__file__).resolve().parents[1]
FONTS = ROOT / 'public/game-assets/graphics/fonts'
NAMES = ('insignia15LTaa', 'orbitron12condensed', 'orbitron20aa', 'orbitron24aabold')
SIGNATURE = b'\x89PNG\r\n\x1a\n'


def chunks(data):
    assert data[:8] == SIGNATURE
    offset = 8
    while offset < len(data):
        size = struct.unpack_from('>I', data, offset)[0]
        block = data[offset:offset + size + 12]
        assert len(block) == size + 12
        tag, payload = block[4:8], block[8:-4]
        assert zlib.crc32(tag + payload) == struct.unpack('>I', block[-4:])[0]
        yield tag, payload, block
        offset += len(block)
    assert offset == len(data)


def pack(tag, payload):
    return struct.pack('>I', len(payload)) + tag + payload + struct.pack('>I', zlib.crc32(tag + payload))


def recompress_png(file):
    before = file.read_bytes()
    source = list(chunks(before))
    scanlines = zlib.decompress(b''.join(p for t, p, _ in source if t == b'IDAT'))
    compressed = zlib.compress(scanlines, 9)
    blocks, written = [], False
    for tag, _, block in source:
        if tag != b'IDAT':
            blocks.append(block)
        elif not written:
            blocks.append(pack(b'IDAT', compressed))
            written = True
    after = SIGNATURE + b''.join(blocks)
    result = list(chunks(after))
    assert zlib.decompress(b''.join(p for t, p, _ in result if t == b'IDAT')) == scanlines
    assert [b for t, _, b in source if t != b'IDAT'] == [b for t, _, b in result if t != b'IDAT']
    # Reruns must never enlarge an already optimized atlas.
    if len(after) < len(before):
        file.write_bytes(after)
    return {'file': str(file.relative_to(ROOT)), 'before': len(before), 'after': file.stat().st_size,
            'scanlines_sha256': hashlib.sha256(scanlines).hexdigest()}


def outline(font, name):
    glyphs = font.getGlyphSet()
    pen = DecomposingRecordingPen(glyphs)
    glyphs[name].draw(pen)
    return pen.value


def compile_subset(source, destination, characters):
    original = TTFont(source, recalcTimestamp=False)
    font = TTFont(source, recalcTimestamp=False)
    options = subset.Options()
    options.hinting = True
    options.glyph_names = True
    options.recalc_timestamp = False
    compiler = subset.Subsetter(options=options)
    compiler.populate(unicodes=characters)
    compiler.subset(font)
    font.flavor = 'woff2'
    output = BytesIO()
    font.save(output)
    result = TTFont(BytesIO(output.getvalue()), recalcTimestamp=False)
    original_map, result_map = original.getBestCmap(), result.getBestCmap()
    for code in characters:
        if code not in original_map:
            continue
        assert code in result_map, hex(code)
        a, b = original_map[code], result_map[code]
        assert original['hmtx'][a] == result['hmtx'][b], hex(code)
        assert outline(original, a) == outline(result, b), hex(code)
        if 'glyf' in original:
            pa = getattr(original['glyf'][a], 'program', None)
            pb = getattr(result['glyf'][b], 'program', None)
            assert (pa.getBytecode() if pa else b'') == (pb.getBytecode() if pb else b''), hex(code)
    for tag, attrs in {'head': ('unitsPerEm',), 'hhea': ('ascent', 'descent', 'lineGap'),
                       'OS/2': ('sTypoAscender', 'sTypoDescender', 'sTypoLineGap', 'usWinAscent', 'usWinDescent')}.items():
        for attr in attrs:
            assert getattr(original[tag], attr) == getattr(result[tag], attr), (tag, attr)
    destination.write_bytes(output.getvalue())
    return {'file': str(destination.relative_to(ROOT)), 'sourceBytes': source.stat().st_size,
            'subsetBytes': destination.stat().st_size, 'glyphs': len(result_map)}


def main():
    text = ''.join((ROOT / path).read_text(encoding='utf-8') for path in
                   ('src/studio/NativeHome.tsx', 'src/ui/FullscreenButton.tsx'))
    characters = set(range(32, 127)) | {ord(c) for c in text if ord(c) > 127}
    report = {'png': [recompress_png(FONTS / 'native-menu' / (name + '_0.png')) for name in NAMES],
              'subsets': [compile_subset(FONTS / source, FONTS / target, characters) for source, target in
                          [('native-zh.ttf', 'native-home-zh.woff2'),
                           ('native-heading-zh.ttf', 'native-home-heading-zh.woff2')]]}
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
