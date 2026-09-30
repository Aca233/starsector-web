"""Install one visually reviewed AI image with backups and optimistic source checks.
No API calls. Never accepts an unchanged original image as an authored replacement.
"""
import argparse
from datetime import datetime, timezone
import hashlib
from io import BytesIO
import json
from pathlib import Path
from PIL import Image, ImageOps
from generated_media_materials import export_material_layer
from generated_media_tiles import export_periodic_tile
from generated_media_strips import export_horizontal_strip
from generated_media_repetition import export_repeated_tile
from generated_media_uv import export_uv_sheet
from generated_media_masks import export_luminance_mask

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / 'public'
ASSETS = PUBLIC / 'game-assets'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def contained(base, name):
    result = (base / name).resolve()
    if not result.is_relative_to(base.resolve()) or result == base.resolve():
        raise ValueError('Path escapes intended directory')
    return result


def json_bytes(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode('utf8')


def atomic_write(file, data):
    temporary = file.with_name(file.name + '.media-install.tmp')
    with temporary.open('xb') as stream:
        stream.write(data)
    temporary.replace(file)


def write_verified_backups(backup, root, target, original_bytes, snapshots):
    """Keep canonical original bytes; isolate later metadata for byte-identical aliases."""
    metadata = {file: data for file, data in snapshots.items() if data is not None}
    metadata_backup = backup
    if any((backup / file.relative_to(root)).exists()
           and (backup / file.relative_to(root)).read_bytes() != data
           for file, data in metadata.items()):
        # A different path may reuse original bytes already replaced elsewhere.
        # Never overwrite the first install's indexes with this later snapshot.
        identity = {file.relative_to(root).as_posix(): sha(data)
                    for file, data in sorted(metadata.items())}
        metadata_backup = backup / 'metadata-snapshots' / sha(json_bytes(identity))
    copies = {backup / target.relative_to(root): original_bytes}
    copies.update({metadata_backup / file.relative_to(root): data for file, data in metadata.items()})
    # Preflight every path before writing any backup; changed backups are errors.
    for copy, data in copies.items():
        if copy.exists() and copy.read_bytes() != data:
            raise ValueError('Different backup already exists')
    for copy, data in copies.items():
        copy.parent.mkdir(parents=True, exist_ok=True)
        if not copy.exists():
            with copy.open('xb') as stream:
                stream.write(data)
    return metadata_backup


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--target', required=True, help='Relative to public/game-assets')
    parser.add_argument('--master', required=True)
    parser.add_argument('--prompt', required=True)
    parser.add_argument('--source-sheet', help='Generated parent sheet for an exact unedited cell crop')
    parser.add_argument('--source-crop', type=int, nargs=4, metavar=('LEFT', 'TOP', 'RIGHT', 'BOTTOM'))
    parser.add_argument('--kind', choices=['background', 'emission', 'sprite', 'atlas', 'material', 'tile', 'strip', 'uv', 'mask'], required=True)
    parser.add_argument('--reviewed', action='store_true', help='Master has been visually reviewed')
    parser.add_argument('--replace-authored-sha256', help='Opt in to revising only a prior AI-media record with this exact current SHA256')
    parser.add_argument('--alpha-floor', type=int, default=0, help='Remove only near-invisible alpha noise (0..8), recorded in provenance')
    parser.add_argument('--atlas-columns', type=int, default=4)
    parser.add_argument('--atlas-rows', type=int, default=4)
    parser.add_argument('--material-layer', choices=['base', 'glow'])
    parser.add_argument('--material-canvas', type=int)
    parser.add_argument('--preserve-alpha-ceiling', action='store_true', help='Atlas: preserve original maximum opacity as multiplier')
    parser.add_argument('--repeat-axes', choices=['x', 'xy'])
    parser.add_argument('--tile-repeat', type=int, choices=[1, 2, 4], default=1)
    parser.add_argument('--uv-grid', type=int, nargs=2, metavar=('COLUMNS', 'ROWS'))
    parser.add_argument('--uv-repeat-axis', choices=['x', 'y'])
    args = parser.parse_args()
    if (args.kind == 'uv') != bool(args.uv_grid and args.uv_repeat_axis) or (args.kind != 'uv' and (args.uv_grid or args.uv_repeat_axis)):
        raise ValueError('UV export requires explicit grid and repeat axis; other kinds forbid them')
    if args.tile_repeat != 1 and (args.kind != 'tile' or args.repeat_axes != 'xy'):
        raise ValueError('Tile repetition requires tile kind and xy repeat axes')
    if (args.kind == 'tile') != bool(args.repeat_axes):
        raise ValueError('Tile export requires explicit repeat axes; other kinds forbid them')
    if args.kind == 'material' and (not args.material_layer or not args.material_canvas):
        raise ValueError('Material export requires an explicit layer and shared canvas')
    if args.kind != 'material' and (args.material_layer or args.material_canvas):
        raise ValueError('Material options require material kind')
    if args.preserve_alpha_ceiling and args.kind != 'atlas':
        raise ValueError('Alpha ceiling option is only for atlas export')
    if not 0 <= args.alpha_floor <= 8:
        raise ValueError('Alpha noise floor must be between 0 and 8')
    if args.kind in {'background', 'emission'} and args.alpha_floor:
        raise ValueError('Alpha noise cleanup only applies to transparent sprites')
    if bool(args.source_sheet) != bool(args.source_crop):
        raise ValueError('Source sheet and crop rectangle must be provided together')
    if not args.reviewed:
        raise ValueError('Inspect the generated master before installing')
    target = contained(ASSETS, args.target)
    master = contained(ROOT, args.master)
    prompt = contained(ROOT, args.prompt)
    queue = json.loads((ROOT / 'docs/original-media-replacement-2026-09-28.json').read_text('utf8'))
    planned = next(row for row in queue['records'] if row['path'] == args.target)
    original_bytes = target.read_bytes()
    current_sha = sha(original_bytes)
    previous_record = None
    if args.replace_authored_sha256:
        prior = json.loads((PUBLIC / 'ai-media-provenance.json').read_text('utf-8-sig'))
        previous_record = next((row for row in prior['records'] if row['path'] == args.target), None)
        if (previous_record is None or current_sha != args.replace_authored_sha256
                or previous_record['sha256'] != current_sha
                or previous_record.get('source') != 'local-proxy/gpt-image-2.5:text-to-image'):
            raise ValueError('Revision requires matching current hash and our existing AI provenance; refusing overwrite')
        original_sha = previous_record['originalSha256']
    else:
        if planned['status'] != 'original-needs-replacement' or current_sha != planned['sha256']:
            raise ValueError('Target is not the unchanged original from the inventory; refusing overwrite')
        original_sha = planned['sha256']
    input_bytes, prompt_bytes = master.read_bytes(), prompt.read_bytes()
    if sha(input_bytes) in {original_sha, current_sha}:
        raise ValueError('Generated input matches original bytes')
    with Image.open(BytesIO(original_bytes)) as original, Image.open(BytesIO(input_bytes)) as generated:
        generated.load()
        sheet_info = None
        material_info = None
        tile_info = None
        strip_info = None
        uv_info = None
        mask_info = None
        if args.source_sheet:
            sheet_file = contained(ROOT, args.source_sheet)
            sheet_bytes = sheet_file.read_bytes()
            with Image.open(BytesIO(sheet_bytes)) as sheet:
                sheet.load()
                left, top, right, bottom = args.source_crop
                if not (0 <= left < right <= sheet.width and 0 <= top < bottom <= sheet.height):
                    raise ValueError('Source crop outside generated sheet')
                cell = sheet.crop((left, top, right, bottom))
                if cell.mode != generated.mode or cell.size != generated.size or cell.tobytes() != generated.tobytes():
                    raise ValueError('Master is not the declared exact source-sheet crop')
                sheet_info = {'path': args.source_sheet.replace('\\', '/'), 'sha256': sha(sheet_bytes),
                              'actualSize': [sheet.width, sheet.height], 'mode': sheet.mode,
                              'cropBox': args.source_crop, 'processing': 'exact rectangular cell extraction; no painted or original pixels added'}
        actual = {'format': generated.format, 'width': generated.width, 'height': generated.height, 'mode': generated.mode}
        if generated.format != 'PNG' or min(generated.size) < 256:
            raise ValueError('Expected a real, adequately sized generated PNG master')
        if args.kind == 'background':
            if original.mode != 'RGB' or target.suffix.lower() not in ['.jpg', '.jpeg']:
                raise ValueError('Background installer only supports existing opaque JPEGs')
            result = ImageOps.fit(generated.convert('RGB'), original.size, method=Image.Resampling.LANCZOS)
            processing = 'center-fit to original pixel dimensions; JPEG quality 95, subsampling 0; no original pixels used'
        elif args.kind == 'emission':
            # Black-backed additive fields are RGB textures, not alpha sprites.
            # Preserve their full canvas: a tight crop changes the filament density.
            if original.mode != 'RGB' or target.suffix.lower() != '.png':
                raise ValueError('Emission export requires an existing RGB PNG')
            if generated.mode not in {'RGB', 'RGBA'} or (generated.mode == 'RGBA' and generated.getchannel('A').getextrema() != (255, 255)):
                raise ValueError('Emission master must be genuinely opaque RGB/RGBA')
            if generated.width * original.height != generated.height * original.width:
                raise ValueError('Emission aspect ratio mismatch')
            luminance = generated.convert('L')
            if luminance.getextrema()[1] < 220 or sum(luminance.histogram()[:16]) < generated.width * generated.height * .5:
                raise ValueError('Emission needs bright filaments on a mostly black background')
            result = generated.convert('RGB').resize(original.size, Image.Resampling.LANCZOS)
            processing = 'opaque generated additive emission field; full-canvas resample to original RGB PNG size without cropping or original pixels'
        elif args.kind == 'mask':
            if original.mode != 'RGBA' or target.suffix.lower() != '.png':
                raise ValueError('Mask export requires existing RGBA PNG')
            result, mask_info = export_luminance_mask(generated, original.size, original.getchannel('A').getbbox(), args.alpha_floor)
            mask_info['exporterSha256'] = sha((ROOT / 'scripts/generated_media_masks.py').read_bytes())
            processing = 'generated grayscale luminance extracted into functional alpha mask, fitted to original alpha bounds; no original pixels or synthesized silhouette'
        elif args.kind == 'uv':
            if original.mode != 'RGBA' or target.suffix.lower() != '.png':
                raise ValueError('UV export requires existing RGBA PNG')
            uv_alpha_ceiling = original.getchannel('A').getextrema()[1]
            if previous_record:
                baseline_file = ROOT / 'artifacts/original-media-replacement-20260928' / original_sha / 'public/game-assets' / args.target
                baseline_bytes = baseline_file.read_bytes()
                if sha(baseline_bytes) != original_sha:
                    raise ValueError('UV original opacity baseline hash mismatch')
                with Image.open(BytesIO(baseline_bytes)) as baseline:
                    if baseline.mode != original.mode or baseline.size != original.size:
                        raise ValueError('UV original geometry mismatch')
                    uv_alpha_ceiling = baseline.getchannel('A').getextrema()[1]
            result, uv_info = export_uv_sheet(generated, original.size, *args.uv_grid, args.uv_repeat_axis, args.alpha_floor, uv_alpha_ceiling)
            uv_info['exporterSha256'] = sha((ROOT / 'scripts/generated_media_uv.py').read_bytes())
            processing = 'generated full-canvas UV sheet with per-cell periodic edge correction; source aspect, original dimensions and opacity ceiling preserved; no original pixels'
        elif args.kind == 'material':
            if original.mode != 'RGBA' or target.suffix.lower() != '.png':
                raise ValueError('Material export requires an existing RGBA PNG')
            material_alpha_ceiling = original.getchannel('A').getextrema()[1]
            if previous_record:
                # Revisions must not repeatedly multiply the already-exported opacity.
                baseline_file = ROOT / 'artifacts/original-media-replacement-20260928' / original_sha / 'public/game-assets' / args.target
                baseline_bytes = baseline_file.read_bytes()
                if sha(baseline_bytes) != original_sha:
                    raise ValueError('Original material opacity baseline backup hash mismatch')
                with Image.open(BytesIO(baseline_bytes)) as baseline_image:
                    if baseline_image.mode != 'RGBA' or baseline_image.size != original.size:
                        raise ValueError('Original material opacity baseline geometry mismatch')
                    material_alpha_ceiling = baseline_image.getchannel('A').getextrema()[1]
            result, material_info = export_material_layer(generated, args.material_canvas, original.size, args.material_layer, args.alpha_floor, material_alpha_ceiling)
            material_info['exporterSha256'] = sha((ROOT / 'scripts/generated_media_materials.py').read_bytes())
            processing = 'generated cyan-coded material split into neutral base or white emission; shared full-canvas transform and centered crop; original alpha ceiling retained; no original pixels'
        elif args.kind == 'strip':
            if original.mode != 'RGBA' or target.suffix.lower() != '.png':
                raise ValueError('Strip export requires existing RGBA PNG')
            strip_alpha_ceiling = original.getchannel('A').getextrema()[1]
            if previous_record:
                baseline_file = ROOT / 'artifacts/original-media-replacement-20260928' / original_sha / 'public/game-assets' / args.target
                baseline_bytes = baseline_file.read_bytes()
                if sha(baseline_bytes) != original_sha:
                    raise ValueError('Original strip opacity baseline hash mismatch')
                with Image.open(BytesIO(baseline_bytes)) as baseline:
                    if baseline.mode != 'RGBA' or baseline.size != original.size:
                        raise ValueError('Original strip opacity baseline geometry mismatch')
                    strip_alpha_ceiling = baseline.getchannel('A').getextrema()[1]
            result, strip_info = export_horizontal_strip(generated, original.size, args.alpha_floor, strip_alpha_ceiling)
            strip_info['exporterSha256'] = sha((ROOT / 'scripts/generated_media_strips.py').read_bytes())
            processing = 'generated horizontal emission UV strip; full-canvas resample with narrow premultiplied repeat seam correction; original size and alpha maximum preserved; no original pixels'
        elif args.kind == 'tile':
            if original.mode != 'RGBA' or target.suffix.lower() != '.png':
                raise ValueError('Tile export requires an existing RGBA PNG')
            tile_alpha_ceiling = original.getchannel('A').getextrema()[1]
            if previous_record:
                baseline_file = ROOT / 'artifacts/original-media-replacement-20260928' / original_sha / 'public/game-assets' / args.target
                baseline_bytes = baseline_file.read_bytes()
                if sha(baseline_bytes) != original_sha:
                    raise ValueError('Original opacity baseline backup hash mismatch')
                with Image.open(BytesIO(baseline_bytes)) as baseline_image:
                    if baseline_image.mode != 'RGBA' or baseline_image.size != original.size:
                        raise ValueError('Original opacity baseline geometry mismatch')
                    tile_alpha_ceiling = baseline_image.getchannel('A').getextrema()[1]
            if args.tile_repeat != 1:
                result, tile_info = export_repeated_tile(generated, original.size, args.repeat_axes, args.tile_repeat, args.alpha_floor, tile_alpha_ceiling)
                tile_info['repetitionExporterSha256'] = sha((ROOT / 'scripts/generated_media_repetition.py').read_bytes())
            else:
                result, tile_info = export_periodic_tile(generated, original.size, args.repeat_axes, args.alpha_floor, tile_alpha_ceiling)
            tile_info['exporterSha256'] = sha((ROOT / 'scripts/generated_media_tiles.py').read_bytes())
            processing = 'full generated texture with narrow premultiplied periodic edge correction; original dimensions and alpha ceiling retained; no original pixels'
        elif args.kind == 'sprite':
            if generated.mode != 'RGBA' or generated.getchannel('A').getextrema()[0] != 0 or generated.getchannel('A').getextrema()[1] < 240:
                raise ValueError('Proxy did not return genuine transparent RGBA; no automatic background removal')
            if original.mode != 'RGBA' or target.suffix.lower() != '.png':
                raise ValueError('Sprite installer requires existing RGBA PNG')
            alpha = generated.getchannel('A')
            if args.alpha_floor:
                alpha = alpha.point(lambda value: 0 if value <= args.alpha_floor else value)
                generated = generated.copy()
                generated.putalpha(alpha)
            borders = [(0, 0, generated.width, 1), (0, generated.height-1, generated.width, generated.height),
                       (0, 0, 1, generated.height), (generated.width-1, 0, generated.width, generated.height)]
            if any(alpha.crop(border).getextrema()[1] != 0 for border in borders):
                raise ValueError('Nonempty master edges: check for cropped silhouette or alpha noise')
            opaque_fraction = sum(alpha.histogram()[128:]) / (generated.width * generated.height)
            if not 0.03 <= opaque_fraction <= 0.90:
                raise ValueError('Unexpected opaque coverage; transparent sprite needs review')
            bounds = alpha.getbbox()
            old_bounds = original.getchannel('A').getbbox()
            if not bounds or not old_bounds:
                raise ValueError('Empty silhouette')
            result = Image.new('RGBA', original.size)
            shape = ImageOps.contain(generated.crop(bounds), (old_bounds[2]-old_bounds[0], old_bounds[3]-old_bounds[1]), method=Image.Resampling.LANCZOS)
            offset = (old_bounds[0] + (old_bounds[2]-old_bounds[0]-shape.width)//2, old_bounds[1] + (old_bounds[3]-old_bounds[1]-shape.height)//2)
            result.paste(shape, offset)
            processing = f'alpha values <= {args.alpha_floor} cleared; alpha-bound crop, contain without stretching within original alpha bounding rectangle; original dimensions preserved; no original pixels used'
        else:
            columns, rows = args.atlas_columns, args.atlas_rows
            if not 1 <= columns <= 16 or not 1 <= rows <= 16:
                raise ValueError('Invalid atlas grid')
            if original.mode != 'RGBA' or generated.mode != 'RGBA' or target.suffix.lower() != '.png':
                raise ValueError('Atlas requires genuinely transparent RGBA PNGs')
            if original.width % columns or original.height % rows:
                raise ValueError('Original dimensions do not divide into the atlas grid')
            if generated.width * original.height != generated.height * original.width:
                raise ValueError('Atlas aspect ratio mismatch; cropping or stretching would break cell layout')
            result = generated.resize(original.size, Image.Resampling.LANCZOS)
            alpha = result.getchannel('A')
            if args.preserve_alpha_ceiling:
                ceiling = original.getchannel('A').getextrema()[1]
                alpha = alpha.point(lambda value: round(value * ceiling / 255))
                result.putalpha(alpha)
            if args.alpha_floor:
                alpha = alpha.point(lambda value: 0 if value <= args.alpha_floor else value)
                result.putalpha(alpha)
            if alpha.getextrema()[0] != 0 or alpha.getextrema()[1] < 32:
                raise ValueError('Atlas lacks meaningful transparent artwork')
            tw, th = original.width // columns, original.height // rows
            for row in range(rows):
                for column in range(columns):
                    tile = alpha.crop((column*tw, row*th, (column+1)*tw, (row+1)*th))
                    if tile.getextrema()[1] < 32:
                        raise ValueError(f'Atlas cell {column},{row} is empty')
                    edges = [(0,0,tw,2), (0,th-2,tw,th), (0,0,2,th), (tw-2,0,tw,th)]
                    if any(tile.crop(edge).getextrema()[1] != 0 for edge in edges):
                        raise ValueError(f'Atlas cell {column},{row} has nontransparent seams; reject rather than silently crop')
            processing = f'{columns}x{rows} atlas resampled without crop to original size; alpha <= {args.alpha_floor} cleared; all cell edges verified transparent; no original pixels used'
        encoded = BytesIO()
        if args.kind == 'background':
            result.save(encoded, format='JPEG', quality=95, subsampling=0, optimize=True)
        else:
            result.save(encoded, format='PNG', optimize=True)
        replacement = encoded.getvalue()
        final_size, final_mode = result.size, result.mode
        preserved_ceiling = original.getchannel('A').getextrema()[1] if args.preserve_alpha_ceiling else None
    snapshots = {}
    documents = {}
    for name in ['asset-manifest.json', 'authored-assets.json', 'retained-combat-media.json', 'ai-media-provenance.json']:
        file = ASSETS / name if name == 'asset-manifest.json' else PUBLIC / name
        data = file.read_bytes() if file.exists() else None
        snapshots[file] = data
        documents[name] = json.loads(data.decode('utf-8-sig')) if data else {'version': 1, 'records': []}
    manifest = documents['asset-manifest.json']
    entry = next(row for row in manifest if row['path'] == args.target)
    if previous_record:
        saved = next((row for row in documents['ai-media-provenance.json']['records'] if row['path'] == args.target), None)
        authored = next((row for row in documents['authored-assets.json']['records'] if row['path'] == args.target), None)
        if saved != previous_record or not authored or authored['sha256'] != current_sha or entry['hash'] != current_sha:
            raise ValueError('Revision indexes changed or disagree with current target; refusing overwrite')
    entry.update({'bytes': len(replacement), 'hash': sha(replacement)})
    record = {'path': args.target, 'sha256': sha(replacement), 'source': 'local-proxy/gpt-image-2.5:text-to-image',
              'createdAt': datetime.now(timezone.utc).isoformat(), 'originalSha256': original_sha,
              'master': args.master.replace('\\', '/'), 'masterSha256': sha(input_bytes), 'actualMaster': actual, 'alphaNoiseFloor': args.alpha_floor,
              'prompt': args.prompt.replace('\\', '/'), 'promptSha256': sha(prompt_bytes),
              'width': final_size[0], 'height': final_size[1], 'mode': final_mode, 'processing': processing,
              'preservedAlphaCeiling': preserved_ceiling,
              'atlasGrid': [args.atlas_columns, args.atlas_rows] if args.kind == 'atlas' else None,
              'referenceImagesSent': False, 'review': 'master visually inspected; runtime validation recorded separately',
              'rightsNote': 'Generated replacement is not a legal clearance or a cure for other EULA issues.'}
    if preserved_ceiling is not None:
        record['processing'] += f'; original alpha maximum {preserved_ceiling}/255 retained as multiplier'
    if material_info:
        record['registeredMaterial'] = material_info
    if strip_info:
        record['periodicStrip'] = strip_info
    if tile_info:
        record['periodicTile'] = tile_info
    if mask_info:
        record['functionalMask'] = mask_info
    if uv_info:
        record['periodicUV'] = uv_info
    if sheet_info:
        record['sourceSheet'] = sheet_info
    if previous_record:
        record['supersedes'] = previous_record
        record['previousSha256'] = current_sha
    for name in ['authored-assets.json', 'ai-media-provenance.json']:
        document = documents[name]
        document['records'] = [row for row in document['records'] if row['path'] != args.target] + [record]
        document['records'].sort(key=lambda row: row['path'])
    documents['retained-combat-media.json']['records'] = [row for row in documents['retained-combat-media.json']['records'] if row['path'] != args.target]
    backup = ROOT / 'artifacts/original-media-replacement-20260928' / current_sha
    metadata_backup = write_verified_backups(backup, ROOT, target, original_bytes, snapshots)
    record['metadataBackup'] = metadata_backup.relative_to(ROOT).as_posix()
    writes = {target: replacement}
    for file in snapshots:
        writes[file] = json_bytes(documents[file.name])
    expected = {target: original_bytes, **snapshots}
    for file, before in expected.items():
        if (file.read_bytes() if file.exists() else None) != before:
            raise ValueError('Concurrent modification detected; no replacement written')
    for file, data in writes.items():
        atomic_write(file, data)
    for file, data in writes.items():
        if file.read_bytes() != data:
            raise ValueError('Post-write verification failed')
    print(json.dumps({'installed': args.target, 'actualMaster': actual, 'exportSize': final_size,
                      'backup': str(backup), 'sha256': sha(replacement)}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
