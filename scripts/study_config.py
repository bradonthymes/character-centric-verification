"""Shared configuration for the study build scripts.

`select_study_items.py` chooses the questions and `build_media.py` cuts the media
for them. Both need the same film list, source paths and clip geometry, so those
live here.
"""

from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
DATASET = REPO / 'dataset.jsonl'
CLAIMS = REPO / 'claims.jsonl'
QUESTIONS_JSON = REPO / 'app' / 'data' / 'study-questions.json'
MEDIA = REPO / 'public' / 'media'

QUESTIONS_PER_FILM = 10

# Clips cover the whole anchored scene plus this much either side.
CLIP_PAD_SECONDS = 5.0

# film_id -> (display title, source video path)
#
# A source of None means the film is selected into the study but its clips
# cannot be cut yet; build_media.py reports those and skips them. Films are
# listed in the order reviewers meet them.
#
# The four original films come from the build sources on the Extreme SSD; their
# runtimes match the bundled proxies to within 0.04 s, so anchor times line up.
# Sources are the Extreme SSD copies wherever they exist — those are the corpus
# build sources, and every one was checked to match the anchor timeline to the
# frame. Anora and Blink Twice are not on the SSD, so they come from the LaCie
# Plex library; both were verified the same way.
PLEX = Path('/Volumes/LaCie/Plex')
SSD = Path('/Volumes/Extreme SSD/character_centric')
FILMS = {
    'american-fiction-2023': (
        'American Fiction',
        SSD / 'practice_videos/American Fiction/'
        'American.Fiction.2023.1080p.WEBRip.x264.AAC5.1-[YTS.MX].mp4',
    ),
    'challengers-2024': (
        'Challengers',
        SSD / 'practice_videos/Challengers/'
        'Challengers.2024.1080p.AMZN.WEBRip.1600MB.DD5.1.x264-GalaxyRG.mkv',
    ),
    'fair-play-2023': (
        'Fair Play',
        SSD / 'practice_videos/Fair_Play/'
        'Fair.Play.2023.1080p.WEBRip.1400MB.DD5.1.x264-GalaxyRG.mkv',
    ),
    'poker-face-101-dead-mans-hand-2023': (
        'Poker Face — S01E01',
        SSD / 'practice_videos/Poker_Face/'
        "Poker Face (2023) - S01E01 - Dead Man's Hand WEBDL-1080p Proper.mkv",
    ),
    'deadpool-and-wolverine-2024': (
        'Deadpool & Wolverine',
        SSD / 'extra_extra_videos/deadpool-and-wolverine-2024.mkv',
    ),
    'wicked-2024': ('Wicked', SSD / 'extra_extra_videos/wicked-2024.mp4'),
    'gladiator-ii-2024': (
        'Gladiator II',
        SSD / 'extra_videos/gladiator-ii-2024.mp4',
    ),
    'anora-2024': (
        'Anora',
        PLEX / 'Movies/Anora (2024)/Anora (2024) WEBRip-1080p.mp4',
    ),
    'a-real-pain-2024': (
        'A Real Pain',
        SSD / 'extra_extra_videos/a-real-pain-2024.mp4',
    ),
    'blink-twice-2024': (
        'Blink Twice',
        PLEX / 'Movies/Blink Twice (2024)/Blink Twice (2024).mkv',
    ),
    'bugonia-2025': (
        'Bugonia',
        SSD / 'Bugonia.2025.1080p.BluRay.AV1.DDP.5.1-dAV1nci.mkv',
    ),
    'knock-at-the-cabin-2023': (
        'Knock at the Cabin',
        SSD / 'extra_videos/knock-at-the-cabin-2023.mp4',
    ),
    'marty-supreme-2025': (
        'Marty Supreme',
        SSD / 'Marty.Supreme.2025.1080p.WEBRip.x264.AAC5.1-[YTS.BZ].mp4',
    ),
    'the-holdovers-2023': (
        'The Holdovers',
        SSD / 'extra_videos/the-holdovers-2023.mkv',
    ),
    'the-long-walk-2025': (
        'The Long Walk',
        SSD / 'extra_videos/the-long-walk-2025.mkv',
    ),
}

# The folder participants download and attach in the browser. One file per film,
# named by film_id so the app can match it without depending on folder layout.
DIST_DIR = SSD / 'study_media'
DIST_MANIFEST = REPO / 'app' / 'data' / 'media-manifest.json'
DIST_HEIGHT = 480
DIST_FPS = 24
DIST_CRF = 32

# Films whose full-movie proxy already ships in public/media/full/ under an
# older filename. build_media.py leaves these alone.
EXISTING_PROXIES = {
    'american-fiction-2023': 'american_fiction.mp4',
    'challengers-2024': 'challengers.mp4',
    'fair-play-2023': 'fair_play.mp4',
    'poker-face-101-dead-mans-hand-2023': 'poker_face_s01e01.mp4',
}

# Where the four original films' posters came from. build_media.py copied these
# into public/media/posters/ and the originals have since been deleted, so the
# lookup now falls through to grabbing a frame from the source film — which only
# happens if someone deletes a generated poster and rebuilds with --force.
EXISTING_POSTERS = {
    'american-fiction-2023': 'american_fiction/poster.jpg',
    'challengers-2024': 'challengers/poster.jpg',
    'fair-play-2023': 'fair_play/poster.jpg',
    'poker-face-101-dead-mans-hand-2023': 'poker_face_s01e01/poster.jpg',
}

# Question-type chips shown to reviewers. Codes missing from this table render
# as the bare code (for example "N1") until the taxonomy names are filled in.
Q_TYPE_LABELS = {
    'Q2': 'Realization',
    'Q3': 'Belief state',
    'Q4': 'Source attribution',
    'Q7': 'Deception detection',
    'Q8': 'Temporal ordering',
    # TODO: labels needed for N1, N2, N3, Q1, Q5, Q6.
}


def category_label(q_type: str) -> str:
    label = Q_TYPE_LABELS.get(q_type)
    return f'{q_type} · {label}' if label else q_type


def title_case_holder(holder: str) -> str:
    """The corpus stores holders upper-case ("CORALINE WILSON")."""
    small = {'of', 'the', 'and', 'in', 'at', 'for', 'to', 'a', 'an'}
    parts = []
    for index, word in enumerate(holder.split()):
        lowered = word.lower()
        if index and lowered in small:
            parts.append(lowered)
        elif '-' in lowered:
            parts.append('-'.join(bit.capitalize() for bit in lowered.split('-')))
        else:
            parts.append(lowered.capitalize())
    return ' '.join(parts)
