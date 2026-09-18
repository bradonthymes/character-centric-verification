#!/usr/bin/env python3
"""Build the web assets the study ships: one poster per film.

Video is no longer served by the site. Participants attach a local folder of
films instead (see build_distribution.py), so the only media in public/ is a
poster per film, which is also the backdrop of the "attach your folder" panel.

    python3 scripts/build_media.py
    python3 scripts/build_media.py --films anora-2024 --force
"""

from __future__ import annotations

import argparse
import json
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from media_lib import run, video_filter
from study_config import FILMS, MEDIA, QUESTIONS_JSON

POSTER_WIDTH = 400
# A frame a quarter of the way in is past the titles and usually on a scene.
POSTER_AT = 0.25


def build_poster(film_id: str, source: Path, runtime: float, force: bool) -> str | None:
    target = MEDIA / 'posters' / f'{film_id}.jpg'
    if target.exists() and not force:
        return None
    target.parent.mkdir(parents=True, exist_ok=True)
    ok = run([
        'ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
        '-ss', str(round(runtime * POSTER_AT, 3)), '-i', str(source),
        '-frames:v', '1', '-vf', video_filter(source, width=POSTER_WIDTH),
        '-q:v', '4', str(target),
    ])
    return f'poster {target.name}' if ok else f'FAILED poster {film_id}'


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--films', help='comma-separated film ids')
    parser.add_argument('--force', action='store_true')
    parser.add_argument('--jobs', type=int, default=4)
    args = parser.parse_args()

    runtimes = {
        movie['id']: movie['durationSeconds']
        for movie in json.loads(QUESTIONS_JSON.read_text())['movies']
    }
    wanted = set(args.films.split(',')) if args.films else set(FILMS)

    tasks = []
    for film_id, (_title, source) in FILMS.items():
        if film_id not in wanted:
            continue
        if source is None or not Path(source).exists():
            print(f'no source for {film_id} — skipped', file=sys.stderr)
            continue
        tasks.append((film_id, Path(source), runtimes.get(film_id, 0.0), args.force))

    failed = 0
    with ThreadPoolExecutor(max_workers=args.jobs) as pool:
        for message in pool.map(lambda t: build_poster(*t), tasks):
            if message is None:
                continue
            if message.startswith('FAILED'):
                failed += 1
            print(f'  {message}', flush=True)
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
