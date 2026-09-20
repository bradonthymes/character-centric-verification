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

| Always                       | Structure (150 questions, 10 per film, no duplicates) and that every playback window covers its anchored scene |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Always                       | The SHA-256 hashes in `study-integrity.json`, which catch a hand-edited or truncated `study-questions.json`    |
| With `dataset.jsonl` present | Re-compares every question, answer and claim word for word, and flags any id that is retired or unknown        |

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

Selection balances the complete study globally: each of the 11 question types
appears 13 or 14 times, while every film still contributes exactly 10 questions.
The seven extra slots from `150 = 11 × 13 + 7` go to the types with the largest
eligible pools, avoiding an unnecessary low-tier pick. A deterministic min-cost
allocation jointly favors type diversity within each film and better tiers: one
repeated type costs slightly more than one tier step, so variety wins when the
quality tradeoff is modest but does not force a tier-4 item by itself. Core-claim
count and holder diversity break later ties. Each question records its tier as
`selectionTier`.

The current set is 100 tier-1, 28 tier-2, 13 tier-3, and 9 tier-4 items. All nine
tier-4 selections represent the rarest types: after the quality filters, the 15
films contain only 14 eligible Q5 and 13 eligible Q6 questions.

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
text. All eleven types are named, so no question shows a bare code:

| Code | Chip                |     | Code | Chip               |
| ---- | ------------------- | --- | ---- | ------------------ |
| Q1   | Knowledge split     |     | Q7   | Accepting a claim  |
| Q2   | Realization         |     | Q8   | Order of discovery |
| Q3   | False belief        |     | N1   | Epistemic arc      |
| Q4   | Knowledge source    |     | N2   | Trust evolution    |
| Q5   | First-order belief  |     | N3   | Causal chain       |
| Q6   | Second-order belief |     |      |                    |

Q3, Q4, Q7 and Q8 previously carried looser wordings ("Belief state", "Source
attribution", "Deception detection", "Temporal ordering") inherited from the
first 12-question build; the table above is the study's own taxonomy and
replaces them. Labels affect only the chip — selection keys off `q_type`, so
renaming one never changes which questions are chosen.

The type code embedded in an `example_id` is **not** always the record's current
type: the script gate rewrote some questions and re-typed them, keeping the
original id. This affects 346 of the 6,327 released records (5.5%), 247 of them
carrying an explicit `revision.revised_type`, and 17 of the 150 selected
questions. The `q_type` field is authoritative and is what the chip shows, while
`id` keeps the original `example_id` because that is the join key back to the
corpus — so an id may read `…_N1_…` for a question the interface labels Q5.

## Response exports

Draft and final response JSON use `export_schema_version: 2`. Every annotation
repeats the analysis fields needed without a separate join: `q_type`,
`question_category`, `selection_tier`, `holder`, and the anchor scene and times.
The top-level `question_set` records the dataset and question-set SHA-256 hashes
plus counts by question type and selection tier. Final downloads use the exact
payload captured when the participant submitted, including after a reload.
