#!/usr/bin/env python3
"""Shape the static export into what GitHub Pages actually serves, then check it.

Pages serves a project site's artifact root at /<repo>/, so a file at
artifact/foo.js is reachable as /<repo>/foo.js. vinext's export, given
`assetPrefix=/<repo>`, writes correct URLs into the HTML but puts the files
themselves under artifact/<repo>/_next — which would resolve to
/<repo>/<repo>/_next. This flattens that, then fails loudly if any root-absolute
reference in the HTML has no file behind it.

    python3 scripts/prepare_pages_artifact.py dist/client /character-centric-verification
"""

from __future__ import annotations

import re
import shutil
import sys
from pathlib import Path

REFERENCE = re.compile(r'(?:src|href)="(/[^"]*)"')


def flatten(artifact: Path, base: str) -> None:
    nested = artifact / base.strip('/')
    if not nested.is_dir():
        return
    for child in nested.iterdir():
        destination = artifact / child.name
        if destination.exists():
            shutil.rmtree(destination) if destination.is_dir() else destination.unlink()
        shutil.move(str(child), str(destination))
    nested.rmdir()
    print(f'flattened {nested.name}/ into the artifact root')


def verify(artifact: Path, base: str) -> int:
    prefix = base.rstrip('/')
    missing = []
    checked = 0
    for page in artifact.rglob('*.html'):
        for reference in REFERENCE.findall(page.read_text(errors='ignore')):
            if reference.startswith('//'):
                continue
            if prefix and not reference.startswith(f'{prefix}/'):
                missing.append(f'{page.name}: {reference} is missing the {prefix} prefix')
                continue
            relative = reference[len(prefix):].lstrip('/').split('?')[0]
            checked += 1
            if not (artifact / relative).exists():
                missing.append(f'{page.name}: {reference} has no file in the artifact')
    if missing:
        print(f'FAILED: {len(missing)} broken reference(s)')
        for problem in missing[:15]:
            print(f'  - {problem}')
        return 1
    print(f'OK: {checked} asset reference(s) resolve, served from {prefix or "/"}')
    return 0


if __name__ == '__main__':
    artifact_path = Path(sys.argv[1] if len(sys.argv) > 1 else 'dist/client')
    base_path = sys.argv[2] if len(sys.argv) > 2 else ''
    if not artifact_path.is_dir():
        sys.exit(f'no artifact at {artifact_path}')
    flatten(artifact_path, base_path)
    sys.exit(verify(artifact_path, base_path))
