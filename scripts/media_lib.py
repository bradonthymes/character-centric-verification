"""ffmpeg helpers shared by build_media.py and build_distribution.py."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

# HDR sources need tonemapping to BT.709 or the picture comes out washed out.
TONEMAP = (
    'zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,'
    'tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p'
)


def run(command) -> bool:
    result = subprocess.run(command, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        sys.stderr.write(result.stderr[-1500:] + '\n')
    return result.returncode == 0


def probe(path: Path | str, entries: str, stream: str | None = None):
    command = ['ffprobe', '-v', 'error']
    if stream:
        command += ['-select_streams', stream]
    command += ['-show_entries', entries, '-of', 'json', str(path)]
    result = subprocess.run(command, capture_output=True, text=True, check=False)
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError:
        return {}


def probe_duration(path: Path | str | None) -> float | None:
    if path is None or not Path(path).exists():
        return None
    data = probe(path, 'format=duration')
    try:
        return round(float(data['format']['duration']), 3)
    except (KeyError, ValueError):
        return None


def is_hdr(source: Path | str) -> bool:
    data = probe(source, 'stream=color_transfer', stream='v:0')
    streams = data.get('streams') or [{}]
    return streams[0].get('color_transfer') in {'smpte2084', 'arib-std-b67'}


def video_filter(
    source: Path | str,
    *,
    width: int | None = None,
    height: int | None = None,
    fps: int | None = None,
) -> str:
    """Scale (by width or height, keeping even dimensions) and tonemap if needed."""
    chain = []
    if fps:
        chain.append(f'fps={fps}')
    if width:
        chain.append(f'scale={width}:-2')
    elif height:
        chain.append(f'scale=-2:{height}')
    if is_hdr(source):
        chain.append(TONEMAP)
    return ','.join(chain)
