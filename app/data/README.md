# Study data provenance

The study subset in `study-data.ts` was read from the authoritative QA corpus in
the sibling `Character-Centric-Summarization-Code` repository. The corpus was
removed from that repository's working tree when its `data/` directory moved to
scratch, so this app reads the last Git-tracked version from commit `de34361`:

- `data/qa/claims/claims.jsonl` (questions, gold answers, and atomic claims)

The companion `data/qa/answers/answers.jsonl` export was also inspected to
confirm the corpus layout, but this study subset is sourced from
`claims/claims.jsonl`.

The source checkout was not changed. The 12 selected records span American
Fiction, Challengers, Fair Play, and Poker Face S01E01. Every selected record is
active, anchored, non-stale, free of build errors, and has two to four retained
atomic claims.

Source `example_id` values are preserved as the study question IDs so the subset
can be joined back to future corpus exports without fuzzy matching.
