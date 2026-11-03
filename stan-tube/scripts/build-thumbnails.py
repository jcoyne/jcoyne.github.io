#!/usr/bin/env python3
"""Build a thumbnail manifest and sort videos by image type.

Run from the repository root: python3 scripts/build-thumbnails.py
"""
import csv
import json
import os
import sys
import tempfile
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CSV = ROOT / 'videos.csv'
MANIFEST = ROOT / 'thumbnails.json'
IMAGE_MIMES = {'image/jp2', 'image/jpeg', 'image/png', 'image/tiff', 'image/webp'}


def image_files(resource):
    return [file for file in resource.get('structural', {}).get('contains', [])
            if file.get('hasMimeType') in IMAGE_MIMES
            and file.get('filename')
            and file.get('access', {}).get('view') == 'world'
            and file.get('administrative', {}).get('publish') is not False]


def select_image(metadata):
    resources = metadata.get('structural', {}).get('contains', [])
    candidates = []
    for resource in resources:
        kind = 'image-of-media' if (resource.get('label') or '').lower().startswith('image of media') else 'other'
        for file in image_files(resource):
            candidates.append({'filename': file['filename'], 'kind': kind})
    if not candidates:
        return None
    # Prefer engaging thumbnails over documentation images, then a thumbnail
    # file over other images in the same category. Keep metadata order otherwise.
    return min(candidates, key=lambda image: (
        image['kind'] == 'image-of-media',
        'thumb' not in image['filename'].lower(),
    ))


def fetch_metadata(row):
    id = row['Druid']
    url = row['Purl'] + '.json'
    for attempt in range(3):
        try:
            request = urllib.request.Request(url, headers={'Accept': 'application/json'})
            with urllib.request.urlopen(request, timeout=20) as response:
                return id, select_image(json.load(response)), None
        except (urllib.error.URLError, TimeoutError, ValueError, OSError) as error:
            reason = str(error)
            time.sleep(0.5 * (attempt + 1))
    return id, None, reason


def atomic_write(path, content):
    fd, name = tempfile.mkstemp(prefix=f'.{path.name}-', dir=ROOT)
    try:
        with os.fdopen(fd, 'w') as file:
            file.write(content)
        os.replace(name, path)
    except BaseException:
        if os.path.exists(name):
            os.unlink(name)
        raise


def main():
    with CSV.open(newline='') as file:
        reader = csv.DictReader(file)
        fields = reader.fieldnames
        rows = list(reader)
    existing = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {}
    ids = {row['Druid'] for row in rows}
    # Old string entries lack the resource label, so refresh them.
    # A null value means metadata was checked and no public image was listed.
    results = {id: image for id, image in existing.items()
               if id in ids and (image is None or (isinstance(image, dict) and 'kind' in image))}
    pending = [row for row in rows if row['Druid'] not in results]
    errors = {}
    print(f'Checking metadata for {len(pending)} of {len(rows)} items', flush=True)
    with ThreadPoolExecutor(max_workers=24) as pool:
        futures = [pool.submit(fetch_metadata, row) for row in pending]
        for count, future in enumerate(as_completed(futures), 1):
            id, image, error = future.result()
            if error:
                errors[id] = error
            else:
                results[id] = image
            if count % 250 == 0 or count == len(pending):
                print(f'{count}/{len(pending)} checked; {sum(value is not None for value in results.values())} with images; {len(errors)} errors', flush=True)
    if errors:
        print(f'Metadata failed for {len(errors)} items. No files were changed.', file=sys.stderr)
        for id, error in list(errors.items())[:10]:
            print(f'  {id}: {error}', file=sys.stderr)
        return 1
    manifest = {row['Druid']: results[row['Druid']] for row in rows}
    def priority(row):
        image = manifest[row['Druid']]
        if image is None:
            return 2
        return 1 if image['kind'] == 'image-of-media' else 0

    ordered = sorted(rows, key=priority)
    atomic_write(MANIFEST, json.dumps(manifest, ensure_ascii=False, separators=(',', ':')) + '\n')
    fd, name = tempfile.mkstemp(prefix='.videos-sorted-', suffix='.csv', dir=ROOT)
    try:
        with os.fdopen(fd, 'w', newline='') as file:
            writer = csv.DictWriter(file, fieldnames=fields, lineterminator='\n')
            writer.writeheader()
            writer.writerows(ordered)
        os.replace(name, CSV)
    except BaseException:
        if os.path.exists(name):
            os.unlink(name)
        raise
    counts = [sum(priority(row) == group for row in rows) for group in range(3)]
    print(f'Wrote {MANIFEST.name}; sorted {counts[0]} other images, {counts[1]} images of media, {counts[2]} without images.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
