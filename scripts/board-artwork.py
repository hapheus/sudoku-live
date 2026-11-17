#!/usr/bin/env python3
"""Inspect, prepare and verify the curated board artwork (Pillow 13 / libwebp 1.6)."""
import argparse
import json
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
CATALOG = json.loads((ROOT / 'src/services/board-background-catalog.json').read_text())
MAX_EDGE = 1024
QUALITY = 65
MAX_FILE_BYTES = 280 * 1024
MAX_TOTAL_BYTES = 24 * 1024 * 1024


def inventory(directory):
    result = []
    for path in sorted(directory.glob('*.webp')):
        with Image.open(path) as image:
            result.append(dict(name=path.name, bytes=path.stat().st_size,
                               width=image.width, height=image.height,
                               mode=image.mode, alpha='A' in image.getbands()))
    return result


def verify(directory):
    rows = inventory(directory)
    if {path.name for path in directory.iterdir() if path.is_file()} != set(CATALOG['selected']):
        raise ValueError('Catalog/file mismatch')
    if len(rows) != 100:
        raise ValueError('Expected exactly 100 board images')
    if sum(row['bytes'] for row in rows) > MAX_TOTAL_BYTES:
        raise ValueError('Collection exceeds 24 MiB')
    for row in rows:
        if max(row['width'], row['height']) > MAX_EDGE:
            raise ValueError(f"Image too large: {row['name']}")
        if row['bytes'] > MAX_FILE_BYTES:
            raise ValueError(f"Image exceeds 280 KiB: {row['name']}")
    print(json.dumps(dict(count=len(rows), bytes=sum(row['bytes'] for row in rows),
                          largestBytes=max(row['bytes'] for row in rows)), indent=2))


def optimize(source, output):
    if source.resolve() == output.resolve():
        raise ValueError('Use separate source masters and a new output directory; never recompress in place')
    output.mkdir(parents=True, exist_ok=False)
    for name in CATALOG['selected']:
        with Image.open(source / name) as image:
            if getattr(image, 'n_frames', 1) != 1:
                raise ValueError(f'Animated artwork is unsupported: {name}')
            prepared = ImageOps.exif_transpose(image).convert('RGBA' if 'A' in image.getbands() else 'RGB')
            prepared.thumbnail((MAX_EDGE, MAX_EDGE), Image.Resampling.LANCZOS)
            prepared.save(output / name, 'WEBP', quality=QUALITY, method=6,
                          alpha_quality=100, exact=True, icc_profile=image.info.get('icc_profile', b''))
    verify(output)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['inventory', 'optimize', 'verify'])
    parser.add_argument('source', type=Path)
    parser.add_argument('output', type=Path, nargs='?')
    args = parser.parse_args()
    if not args.source.is_dir():
        parser.error('Source directory does not exist')
    if args.action == 'inventory':
        print(json.dumps(inventory(args.source), indent=2))
    elif args.action == 'verify':
        verify(args.source)
    elif args.output is None:
        parser.error('optimize requires a new output directory')
    else:
        optimize(args.source, args.output)


if __name__ == '__main__':
    main()
