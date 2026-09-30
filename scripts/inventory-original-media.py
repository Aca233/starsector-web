"""Read-only inventory of shipped image provenance; never generates or replaces media.

Outputs an auditable queue, not a claim that literal references prove runtime reachability.
Known authored assets are preserved. Existing nonmatching/unattributed edits need review.
"""
from __future__ import annotations
import argparse
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path
import re
from datetime import datetime, timezone
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
IMAGE_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.tga', '.dds'}
PROVENANCE_FILES = (
    'authored-assets.json', 'procedural-asset-provenance.json',
    'ui-artwork-provenance.json', 'ai-media-provenance.json',
)
REFERENCE = re.compile(r'(?:/game-assets/|game-assets/)?(graphics/[A-Za-z0-9_./-]+\.(?:png|jpe?g|webp|gif|bmp|tga|dds))', re.I)


def digest(file: Path) -> str:
    with file.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def read(file: Path):
    return json.loads(file.read_text(encoding='utf-8-sig'))


def build_inventory(core: Path) -> dict:
    public = ROOT / 'public'
    assets = public / 'game-assets'
    approved = defaultdict(list)
    for name in PROVENANCE_FILES:
        file = public / name
        if file.exists():
            for row in read(file).get('records', []):
                approved[row['path']].append({'manifest': name, **row})
    retained_path = public / 'retained-combat-media.json'
    retained = {row['path']: row for row in read(retained_path).get('records', [])} if retained_path.exists() else {}
    declared = {row['path'] for row in read(assets / 'asset-manifest.json') if row.get('type') == 'image'}
    references = defaultdict(set)
    for source in (ROOT / 'src').rglob('*'):
        if source.is_file() and source.suffix.lower() in {'.ts', '.tsx', '.mts', '.js', '.mjs', '.json', '.css'}:
            text = source.read_text(encoding='utf-8-sig', errors='replace')
            relative = source.relative_to(ROOT).as_posix()
            for match in REFERENCE.finditer(text):
                references[match.group(1)].add(relative)
    records = []
    for file in sorted(assets.rglob('*')):
        if not file.is_file() or file.suffix.lower() not in IMAGE_EXTENSIONS:
            continue
        if file.is_symlink():
            raise ValueError(f'Image symlink requires manual review: {file}')
        relative = file.relative_to(assets).as_posix()
        current_hash = digest(file)
        matching = [row for row in approved[relative] if row.get('sha256') == current_hash]
        original = core / relative
        original_hash = digest(original) if original.is_file() else None
        retained_record = retained.get(relative)
        recorded_original = retained_record and retained_record.get('sha256') == current_hash
        if original_hash == current_hash or recorded_original:
            status = 'original-needs-replacement'
            evidence = 'identical-to-installed-original' if original_hash == current_hash else 'matching-retained-original-manifest'
        elif matching:
            status = 'authored-preserve'
            evidence = ','.join(sorted({row['manifest'] for row in matching}))
        elif original_hash is not None:
            status = 'modified-provenance-review'
            evidence = 'different-from-original-without-matching-authored-record'
        else:
            status = 'project-asset-preserve-review'
            evidence = 'no-corresponding-installed-original-or-matching-authored-record'
        literal = sorted(references[relative])
        code = [name for name in literal if not name.endswith('.json')]
        usage = 'literal-code-reference' if code else 'literal-data-reference' if literal else 'manifest-only' if relative in declared else 'dynamic-or-unreferenced-review'
        try:
            with Image.open(file) as image:
                dimensions = {'width': image.width, 'height': image.height, 'mode': image.mode}
                alpha = image.getextrema()[-1] if image.mode == 'RGBA' else None
        except (OSError, ValueError) as error:
            dimensions, alpha = {'inspectionError': type(error).__name__}, None
        records.append({'path': relative, 'group': '/'.join(relative.split('/')[:2]), 'status': status,
                        'evidence': evidence, 'sha256': current_hash, 'originalSha256': original_hash,
                        **dimensions, 'alphaExtrema': alpha, 'manifestDeclared': relative in declared,
                        'usageEvidence': usage, 'referenceCount': len(literal), 'references': literal[:12],
                        'needsGeometryReview': bool(re.match(r'graphics/(ships|weapons|missiles|debris|asteroids)/', relative)),
                        'needsAtlasOrBlendReview': bool(re.match(r'graphics/(fx|damage|terrain|starscape)/', relative))})
    pending = [row for row in records if row['status'] == 'original-needs-replacement']
    return {'schemaVersion': 1, 'generatedAt': datetime.now(timezone.utc).isoformat(),
            'scope': 'Existing project image files only. No audio, fonts, text, code, or external mods changed.',
            'usageCaveat': 'Literal references and manifest declarations are evidence, not an exhaustive runtime reachability proof. Dynamic/template paths need review.',
            'copyrightCaveat': 'Matching source hashes identify unchanged bytes, not legal infringement; generated replacements do not grant rights or cure other EULA risks.',
            'summary': {'images': len(records), 'byStatus': dict(Counter(row['status'] for row in records)),
                        'originalsByGroup': dict(Counter(row['group'] for row in pending)),
                        'originalsByUsageEvidence': dict(Counter(row['usageEvidence'] for row in pending))},
            'records': records}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--core', type=Path, default=ROOT.parent / 'starsector-core')
    parser.add_argument('--out', type=Path, default=ROOT / 'docs/original-media-replacement-2026-09-28.json')
    args = parser.parse_args()
    result = build_inventory(args.core.resolve(strict=True))
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(result['summary'], ensure_ascii=False, indent=2))
    print(f'Inventory: {args.out.resolve()}')


if __name__ == '__main__':
    main()
