#!/usr/bin/env python3
"""Select the study questions and write app/data/study-questions.json.

Reviewer-facing text comes from dataset.jsonl verbatim. claims.jsonl is joined
on example_id for two things only: the anchor timestamps needed to cut clips
(dataset.jsonl carries the scene id but no times) and the quality flags used to
rank candidates.

Selection runs per film independently and deterministically, so films can be
added later without disturbing the ones already chosen.

    python3 scripts/select_study_items.py          # regenerate
    python3 scripts/select_study_items.py --check   # validate what is on disk
"""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
from collections import Counter

from study_config import (
    CLAIMS,
    CLIP_PAD_SECONDS,
    DATASET,
    DIST_DIR,
    FILMS,
    INTEGRITY_JSON,
    QUESTIONS_JSON,
    QUESTIONS_PER_FILM,
    category_label,
    title_case_holder,
)

MAX_TIER = 4


def load_jsonl(path):
    with path.open() as handle:
        return [json.loads(line) for line in handle if line.strip()]


def tier_of(record, source) -> int:
    """Lowest (best) tier the record qualifies for, or MAX_TIER + 1."""
    span = source['anchor']['t_end'] - source['anchor']['t_start']
    n_claims = len(record['claims'])
    stale = bool(source['prose_stale'])
    thin = bool(source['thin_core'])
    if 2 <= n_claims <= 4 and span <= 125 and not stale:
        return 2 if thin else 1
    if 2 <= n_claims <= 6 and span <= 240 and not stale:
        return 3
    if 2 <= n_claims <= 6 and span <= 240:
        return 4
    return MAX_TIER + 1


def probe_duration(path) -> float | None:
    if path is None or not path.exists():
        return None
    result = subprocess.run(
        ['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
         '-of', 'default=nw=1:nk=1', str(path)],
        capture_output=True, text=True, check=False,
    )
    try:
        return round(float(result.stdout.strip()), 3)
    except ValueError:
        return None


def select_for_film(film_id, released, sources):
    """Pick QUESTIONS_PER_FILM records, best tier first, spreading q_type then holder."""
    pool = []
    for record in released:
        if record['film_id'] != film_id:
            continue
        source = sources[record['example_id']]
        tier = tier_of(record, source)
        if tier <= MAX_TIER:
            pool.append((tier, record, source))

    picked = []
    used_type: Counter = Counter()
    used_holder: Counter = Counter()
    for tier in range(1, MAX_TIER + 1):
        candidates = [entry for entry in pool if entry[0] == tier]
        while candidates and len(picked) < QUESTIONS_PER_FILM:
            candidates.sort(key=lambda entry: (
                used_type[entry[1]['q_type']],
                used_holder[entry[1]['holder']],
                -entry[2]['n_core'],
                entry[1]['example_id'],
            ))
            tier_value, record, source = candidates.pop(0)
            picked.append((tier_value, record, source))
            used_type[record['q_type']] += 1
            used_holder[record['holder']] += 1
        if len(picked) >= QUESTIONS_PER_FILM:
            break
    return picked


def build():
    # Neither corpus file is committed; both must be copied into the project
    # root to regenerate. Validation needs neither — see check().
    missing = [f.name for f in (DATASET, CLAIMS) if not f.exists()]
    if missing:
        sys.exit(
            f'{" and ".join(missing)} needed to regenerate the study set but not '
            'in the repository — copy the corpus into the project root first. '
            'To validate the existing set instead, run with --check.',
        )
    released = load_jsonl(DATASET)
    sources = {record['example_id']: record for record in load_jsonl(CLAIMS)}

    movies = []
    questions = []
    shortfalls = []
    for film_id, (title, source_path) in FILMS.items():
        # Runtimes come from the source film, and the distribution encode keeps
        # them, so the app can check an attached file is the right copy.
        runtime = probe_duration(source_path) or probe_duration(
            DIST_DIR / f'{film_id}.mp4',
        )
        if runtime is None:
            print(f'  ! no runtime for {film_id}; falling back to last anchor', file=sys.stderr)
            runtime = max(
                (sources[r['example_id']]['anchor']['t_end']
                 for r in released if r['film_id'] == film_id),
                default=0.0,
            )
        movies.append({
            'id': film_id,
            'title': title,
            'poster': f'/media/posters/{film_id}.jpg',
            # The filename the app looks for in the participant's folder.
            'file': f'{film_id}.mp4',
            'durationSeconds': runtime,
        })

        picked = select_for_film(film_id, released, sources)
        if len(picked) < QUESTIONS_PER_FILM:
            shortfalls.append((film_id, len(picked)))
        for tier, record, source in picked:
            anchor = source['anchor']
            start = max(0.0, anchor['t_start'] - CLIP_PAD_SECONDS)
            end = min(runtime, anchor['t_end'] + CLIP_PAD_SECONDS) if runtime else \
                anchor['t_end'] + CLIP_PAD_SECONDS
            questions.append({
                'id': record['example_id'],
                'movieId': film_id,
                'qType': record['q_type'],
                'category': category_label(record['q_type']),
                'holder': title_case_holder(record['holder_label'] or record['holder']),
                'question': record['question'],
                'answer': record['answer'],
                'anchor': {
                    'sceneId': anchor['scene_id'],
                    'start': round(anchor['t_start'], 3),
                    'end': round(anchor['t_end'], 3),
                },
                # Absolute seconds into the film. Participants attach the film
                # itself, so evidence playback is a bounded seek rather than a
                # separate clip file.
                'window': {
                    'start': round(start, 3),
                    'end': round(end, 3),
                },
                'claims': [
                    {'id': claim['id'], 'text': claim['claim'], 'role': claim['role']}
                    for claim in record['claims']
                ],
                'selectionTier': tier,
            })

    payload = {
        'source': {
            'dataset': DATASET.name,
            'claims': CLAIMS.name,
            'released_records': len(released),
            'note': 'Text from dataset.jsonl; claims.jsonl joined for anchor times only.',
        },
        'movies': movies,
        'questions': questions,
    }
    QUESTIONS_JSON.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + '\n')
    write_integrity(payload)
    report(payload, released, sources, shortfalls)
    return payload


def digest_of(value) -> str:
    """Stable hash of a JSON value, independent of key order and spacing."""
    canonical = json.dumps(value, sort_keys=True, ensure_ascii=False,
                           separators=(',', ':'))
    return hashlib.sha256(canonical.encode()).hexdigest()


def file_digest(path) -> str | None:
    if not path.exists():
        return None
    hasher = hashlib.sha256()
    with path.open('rb') as handle:
        for block in iter(lambda: handle.read(1 << 20), b''):
            hasher.update(block)
    return hasher.hexdigest()


def write_integrity(payload) -> None:
    """Record hashes so the study set can be validated without the corpus.

    Neither corpus file is committed, so CI cannot diff against them. It can
    still prove the generated file is exactly what the corpus produced, which is
    what catches a hand-edit or a truncated write.
    """
    INTEGRITY_JSON.write_text(json.dumps({
        'note': 'Written by select_study_items.py. --check verifies these; with '
                'dataset.jsonl present it also re-compares every question.',
        'dataset_sha256': file_digest(DATASET),
        'dataset_records': sum(1 for _ in DATASET.open()),
        'questions_sha256': digest_of(payload['questions']),
        'movies_sha256': digest_of(payload['movies']),
        'question_count': len(payload['questions']),
    }, indent=2) + '\n')


def report(payload, released, sources, shortfalls):
    questions = payload['questions']
    tiers = Counter(q['selectionTier'] for q in questions)
    print(f'{len(questions)} questions across {len(payload["movies"])} movies '
          f'-> {QUESTIONS_JSON.relative_to(QUESTIONS_JSON.parents[2])}')
    print(f'  tiers        {dict(sorted(tiers.items()))}')
    print(f'  q_types      {dict(sorted(Counter(q["qType"] for q in questions).items()))}')
    print(f'  claims       {sum(len(q["claims"]) for q in questions)}')
    clip_seconds = sum(q['window']['end'] - q['window']['start'] for q in questions)
    print(f'  evidence runtime {clip_seconds / 60:.0f} min')
    unlabelled = sorted({q['qType'] for q in questions if q['category'] == q['qType']})
    if unlabelled:
        print(f'  ! no chip label yet for: {", ".join(unlabelled)}')
    for film_id, count in shortfalls:
        print(f'  ! {film_id} only filled {count}/{QUESTIONS_PER_FILM}')


def check(payload=None):
    """Validate the generated study set.

    Neither corpus file is committed, so this adapts to what is on hand:
    structure and playback windows are always checked; the recorded hashes prove
    the file is untouched since generation; and when dataset.jsonl is present
    every question, answer and claim is re-compared against it word for word.
    """
    payload = payload or json.loads(QUESTIONS_JSON.read_text())
    movies = {movie['id']: movie for movie in payload['movies']}
    errors = []
    per_film = Counter(q['movieId'] for q in payload['questions'])

    for film_id in FILMS:
        if per_film[film_id] != QUESTIONS_PER_FILM:
            errors.append(f'{film_id}: {per_film[film_id]} questions, expected {QUESTIONS_PER_FILM}')

    # Hashes: catches a hand-edited or truncated study-questions.json even with
    # no corpus to compare against.
    integrity = None
    if INTEGRITY_JSON.exists():
        integrity = json.loads(INTEGRITY_JSON.read_text())
        if digest_of(payload['questions']) != integrity.get('questions_sha256'):
            errors.append('questions do not match the recorded hash — the file '
                          'was edited by hand or regenerated without --check')
        if digest_of(payload['movies']) != integrity.get('movies_sha256'):
            errors.append('movies do not match the recorded hash')
    else:
        errors.append(f'{INTEGRITY_JSON.name} is missing; regenerate the study set')

    released = {}
    if DATASET.exists():
        released = {record['example_id']: record for record in load_jsonl(DATASET)}
        if integrity and integrity.get('dataset_sha256') not in (None, file_digest(DATASET)):
            errors.append(f'{DATASET.name} differs from the copy the study set '
                          'was built from — regenerate before trusting it')

    seen = set()
    for question in payload['questions']:
        qid = question['id']
        if qid in seen:
            errors.append(f'{qid}: duplicate')
        seen.add(qid)

        window = question['window']
        anchor = question['anchor']
        if window['start'] > anchor['start'] + 0.001:
            errors.append(f'{qid}: playback window starts after the anchored scene')
        if window['end'] + 0.001 < anchor['end']:
            errors.append(f'{qid}: playback window ends before the anchored scene')
        runtime = movies[question['movieId']]['durationSeconds']
        if runtime and window['end'] > runtime + 0.5:
            errors.append(f'{qid}: playback window runs past the film runtime')

        if not released:
            continue
        record = released.get(qid)
        if record is None:
            errors.append(f'{qid}: not in dataset.jsonl (retired or unknown)')
            continue
        if question['question'] != record['question']:
            errors.append(f'{qid}: question text differs from dataset.jsonl')
        if question['answer'] != record['answer']:
            errors.append(f'{qid}: answer text differs from dataset.jsonl')
        emitted = [(c['id'], c['text'], c['role']) for c in question['claims']]
        expected = [(c['id'], c['claim'], c['role']) for c in record['claims']]
        if emitted != expected:
            errors.append(f'{qid}: claims differ from dataset.jsonl')

    if errors:
        print(f'FAILED: {len(errors)} problem(s)')
        for error in errors[:20]:
            print(f'  - {error}')
        return 1
    against = (f'all text re-checked against {DATASET.name}' if released
               else 'hashes match; no corpus present to re-check text against')
    print(f'OK: {len(payload["questions"])} questions, {len(movies)} movies, '
          f'every playback window covers its anchored scene, {against}')
    return 0


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true',
                        help='validate the existing JSON instead of regenerating it')
    args = parser.parse_args()
    sys.exit(check() if args.check else (build() and check()))
