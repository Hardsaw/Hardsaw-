# T2 Corpus — AFC quote scoring harness

Scores the calculation engine's BOM output against real AmeriFence quotes.

## Status 2026-08-02

7 quotes scored. Zero shortfalls on any of them — the engine has never ordered short. Vectors are persisted in Supabase hardsaw.golden_vectors with source_quote_id set to the KAN number.

## Scoring method

Derive the layout from AFC's own bracket lines, then check the identity:

    universal_brackets = 2 x runs x rails      ->  runs
    line_brackets      = line_posts x rails    ->  line_posts
    panels             = line_posts + runs     <-  the identity

If the engine and the invoice disagree, check the invoice against itself first. On 4 of 7 quotes the invoice was internally inconsistent.

## Metrics
- **Metric B (the gate):** zero shortfalls. Never order short.
- **Metric A (trend):** line-exact match, tracked across jobs, not per job.

## Scored
| quote | note |
|---|---|
| KAN006547 | gate-free, 2 runs, 6/6 exact |
| KAN006065 | 1 gate, 5/5 exact — disproved the continuous-perimeter doctrine |
| KAN006924 | 4-rail puppy, gates fabricated in-house from panels |
| KAN006479 | plated posts + pool hardware |
| KAN007014 | Hartman — the offcut case |
| KAN005653 | the quote the retracted 6/27 doctrine was built on |
| KAN006791 | blind prediction: engine 9/9, invoice wrong twice |
