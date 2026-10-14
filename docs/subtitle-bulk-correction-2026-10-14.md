# Past-sermon subtitle correction — 14 October 2026

## Result

All 42 ended scheduled lives with an attached SRT were updated. They span 13 June through 11 October 2026 and contain 18,572 timed cues. Forty had a linked PDF transcription; two received the reusable corrections alone. Another 19 ended lives had no SRT to correct.

The run made 4,761 edit operations: 4,295 from aligned PDF text and 466 from reusable spelling rules. These are edit operations, not a measured error rate. Examples include `Branam → Branham`, `jésus → Jésus`, `christ → Christ`, and context-aware `dieu → Dieu`. PDF changes also include punctuation and short wording corrections.

For each sermon, the script checked that the corrected SRT has the same number of cues and the same start and end time for every cue. It uploaded a new SRT object and changed the scheduled live reference only when the record still pointed to the original key. The original S3 objects were retained. Each changed record has an `audit_log` entry containing the old and new keys. A database check confirmed all 42 records point to their new keys and have audit entries.

A fresh read-only pass downloaded all 42 newly attached SRTs and found zero remaining correction edits and zero file errors.

The run used [the bulk correction script](../admin/scripts/apply-past-subtitle-corrections.mjs). It previews by default and writes only with `--apply`. It repeats the correction pass until no further changes are found, with a six-pass limit and cycle detection.

## Scope limit

The 19 ended lives without SRT files were not changed. The two SRT-backed lives without linked PDFs received only the reusable rules. The PDF alignment deliberately leaves uncertain passages unchanged for human review.

## Follow-up: Bernard and Branham

A later check found seven `Bernard` occurrences in six corrected sermons. In each matching passage, the linked PDF says `Frère Branham`; one subtitle even said `Frère Bernard Branham`. The six SRTs were updated again with seven name fixes and five nearby PDF-supported edits. A read-back check found no `Bernard` in those six stored SRTs, confirmed each new live reference and audit entry, and confirmed the previous SRT objects still exist.

Future **Auto Correct** uses this name correction only when the linked PDF says `Frère Branham` and contains no `Bernard`. Without that evidence, a genuine person named Bernard is left alone.
