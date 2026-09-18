#!/usr/bin/env python3
"""Encode the participant media folder: one 480p file per film.

Participants download this folder and attach it in the browser, so the study
never serves video itself. Files are named <film_id>.mp4 because the app matches
on the filename alone — folder layout and nesting do not matter, but renaming a
file does.

    python3 scripts/build_distribution.py              # encode everything missing
    python3 scripts/build_distribution.py --films anora-2024 --force
    python3 scripts/build_distribution.py --manifest-only

Writes app/data/media-manifest.json so the app knows the expected filename,
size and runtime for each film and can report a folder that is incomplete or
holds the wrong copy.
"""

from __future__ import annotations

import argparse
import json
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from media_lib import probe_duration, run, video_filter
from study_config import (
    DIST_CRF,
    DIST_DIR,
    DIST_FPS,
    DIST_HEIGHT,
    DIST_MANIFEST,
    FILMS,
    QUESTIONS_JSON,
)

VIDEO = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', str(DIST_CRF)]
AUDIO = ['-c:a', 'aac', '-b:a', '96k', '-ac', '2']


def encode(film_id: str, source: Path, force: bool) -> str | None:
    target = DIST_DIR / f'{film_id}.mp4'
    if target.exists() and not force:
        return None
    DIST_DIR.mkdir(parents=True, exist_ok=True)
    partial = target.with_suffix('.mp4.partial')
    ok = run([
        'ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(source),
        '-vf', video_filter(source, height=DIST_HEIGHT, fps=DIST_FPS),
        *VIDEO, *AUDIO, '-movflags', '+faststart',
        # The temp name has no recognised extension, so state the container.
        '-f', 'mp4', str(partial),
    ])
    if not ok:
        partial.unlink(missing_ok=True)
        return f'FAILED {film_id}'
    # Only name it correctly once it is complete, so an interrupted run does not
    # leave a half file that looks finished to the next run or to a participant.
    partial.replace(target)
    size = target.stat().st_size
    return f'{film_id}.mp4  {size / 1e6:.0f} MB'


def write_manifest() -> dict:
    questions = json.loads(QUESTIONS_JSON.read_text())
    titles = {movie['id']: movie['title'] for movie in questions['movies']}
    entries = {}
    for film_id in FILMS:
        target = DIST_DIR / f'{film_id}.mp4'
        if not target.exists():
            continue
        entries[film_id] = {
            'title': titles.get(film_id, film_id),
            'file': target.name,
            'bytes': target.stat().st_size,
            'durationSeconds': probe_duration(target),
        }
    manifest = {
        'profile': f'{DIST_HEIGHT}p / {DIST_FPS} fps / crf {DIST_CRF}',
        'note': 'Participants attach a folder holding these files; the app '
                'matches on filename only.',
        'films': entries,
    }
    DIST_MANIFEST.write_text(json.dumps(manifest, indent=2) + '\n')
    total = sum(entry['bytes'] for entry in entries.values())
    print(f'manifest: {len(entries)}/{len(FILMS)} films, {total / 1e9:.1f} GB '
          f'-> {DIST_MANIFEST.name}')
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--films', help='comma-separated film ids')
    parser.add_argument('--force', action='store_true')
    parser.add_argument('--jobs', type=int, default=2)
    parser.add_argument('--manifest-only', action='store_true',
                        help='rewrite the manifest from files already encoded')
    args = parser.parse_args()

    if args.manifest_only:
        write_manifest()
        return 0

    wanted = set(args.films.split(',')) if args.films else set(FILMS)
    tasks = []
    for film_id, (_title, source) in FILMS.items():
        if film_id not in wanted:
            continue
        if source is None or not Path(source).exists():
            print(f'no source for {film_id} — skipped', file=sys.stderr)
            continue
        tasks.append((film_id, Path(source)))

    failed = 0
    with ThreadPoolExecutor(max_workers=args.jobs) as pool:
        for message in pool.map(lambda t: encode(*t, args.force), tasks):
            if message is None:
                continue
            if message.startswith('FAILED'):
                failed += 1
            print(f'  {message}', flush=True)

    write_manifest()
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
