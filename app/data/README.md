# Study data provenance

`study-questions.json` is generated. Do not hand-edit it — change the scripts and
regenerate, so the study set stays reproducible from the corpus.

```
python3 scripts/select_study_items.py           # rewrite study-questions.json
python3 scripts/select_study_items.py --check   # validate it against dataset.jsonl
python3 scripts/build_media.py                  # posters for the site
python3 scripts/build_distribution.py           # the films participants attach
```

## Sources

**Neither corpus file is committed** — this repository is public, and the corpus
is unpublished. Copy both into the project root to regenerate; the scripts exit
with an explanation if they are absent.

- `dataset.jsonl` — 6,327 released records, the non-retired subset of the build,
  trimmed to entailed claims. **Every piece of reviewer-facing text comes from
  here verbatim**: question, reference answer, claims, claim roles, holder, type.
- `claims.jsonl` — 8,335 build records. Joined on `example_id` for two things
  only: the anchor timestamps (`anchor.t_start` / `t_end`), which `dataset.jsonl`
  does not carry — it stores the scene id alone — and the quality flags
  (`prose_stale`, `thin_core`, `n_core`) used to rank candidates.

## Validation

`select_study_items.py --check` adapts to what is present, so CI can verify the
study set without the corpus:

| Always | Structure (150 questions, 10 per film, no duplicates) and that every playback window covers its anchored scene |
| --- | --- |
| Always | The SHA-256 hashes in `study-integrity.json`, which catch a hand-edited or truncated `study-questions.json` |
| With `dataset.jsonl` present | Re-compares every question, answer and claim word for word, and flags any id that is retired or unknown |

`study-integrity.json` is written alongside the study set and records the hash of
the corpus it was built from, so a `dataset.jsonl` that has moved on since is
reported rather than silently trusted.

## Selection

15 films × 10 questions = 150. Candidates are ranked by tier, best first:

| Tier | Rule                                                                 |
| ---- | -------------------------------------------------------------------- |
| 1    | ≥2 core claims, not `prose_stale`, 2–4 claims, anchored scene ≤125 s |
| 2    | as tier 1 but a single core claim                                    |
| 3    | scene ≤240 s, up to 6 claims, not `prose_stale`                      |
| 4    | as tier 3, `prose_stale` allowed                                     |

Within a tier, picks go round-robin to spread question types, then holders,
breaking ties by core-claim count and then `example_id`. Selection runs **per
film independently and deterministically**, so adding a film later leaves the
others untouched. Each question records the tier it came in under as
`selectionTier`.

The current set is 141 tier-1 and 9 tier-2 items (American Fiction 3,
Challengers 2, Poker Face 4 — those three have the thinnest eligible pools).

## Media

**The site serves no video.** Participants download a folder of films and attach
it in the browser; the page reads the files locally and never uploads or streams
them. That keeps the published site around 2 MB, and keeps 30 hours of
commercial film off a public URL.

| Output           | Path                                 | Profile                                  |
| ---------------- | ------------------------------------ | ---------------------------------------- |
| Participant film | `<DIST_DIR>/<film_id>.mp4`           | 480p, 24 fps, CRF 32, 96 kb/s stereo AAC |
| Poster           | `public/media/posters/<film_id>.jpg` | frame at 25% runtime, 400px wide         |

`DIST_DIR` is `/Volumes/Extreme SSD/character_centric/study_media`. Files are
named by `film_id` because **the app matches on filename alone** — the folder may
be nested or hold extra files, but a renamed film reads as missing.
`media-manifest.json` records the expected filename, size and runtime per film.

Each question carries a `window` of absolute seconds into the film — the anchored
scene plus five seconds either side. Evidence playback is a bounded seek into the
attached file: it starts at `window.start` and stops at `window.end`, and
"Browse whole film" lifts the bound.

The two 4K HDR sources (Deadpool & Wolverine, The Holdovers) are tonemapped to
BT.709 on the way down; everything else is a straight scale.

Source paths live in `scripts/study_config.py`. Thirteen films come from
`/Volumes/Extreme SSD/character_centric/` — those are the corpus build sources,
and every one was checked to match the anchor timeline to the frame. Anora and
Blink Twice are not on that drive and come from `/Volumes/LaCie/Plex/`, verified
the same way. A film whose source is `None` is still selected into the study, but
its media cannot be built; the scripts report and skip it.

For a future expansion: `extra_videos/` and `extra_extra_videos/` on the SSD hold
sources for 67 of the 94 corpus films, many named by `film_id` exactly.

`media-archive/` (git-ignored) holds the retired web-served clips and 144p
proxies from the earlier hosted design, in case that approach is ever revisited.

## Question-type chips

`Q_TYPE_LABELS` in `scripts/study_config.py` maps the corpus `q_type` to the chip
text. Filled in: Q2 Realization, Q3 Belief state, Q4 Source attribution,
Q7 Deception detection, Q8 Temporal ordering. **Still needed: N1, N2, N3, Q1,
Q5** — those render as the bare code until the taxonomy names are added and the
selection script is re-run.

The type code embedded in an `example_id` is **not** always the record's current
type: the script gate rewrote some questions and re-typed them, keeping the
original id. This affects 346 of the 6,327 released records (5.5%), 247 of them
carrying an explicit `revision.revised_type`, and 17 of the 150 selected
questions. The `q_type` field is authoritative and is what the chip shows, while
`id` keeps the original `example_id` because that is the join key back to the
corpus — so an id may read `…_N1_…` for a question the interface labels Q5.
