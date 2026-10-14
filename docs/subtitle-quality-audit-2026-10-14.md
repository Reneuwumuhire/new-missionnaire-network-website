# Live subtitle quality audit — 14 October 2026

## Scope and method

There are 42 scheduled broadcasts with an attached SRT in the current catalog. The ten most recent ended broadcasts with an attached SRT were reviewed, from 20 September to 11 October 2026. All ten had a linked PDF transcription. The audit compared 4,559 timed subtitle cues with the PDF text. It counted proposed edit operations after both reusable spelling rules and aligned PDF wording changes. No live subtitle file or database record was changed by this audit.

| Broadcast date |      Cues | Proposed edits |  From PDF |
| -------------- | --------: | -------------: | --------: |
| 11 October     |       471 |            205 |       147 |
| 10 October     |       512 |            377 |       201 |
| 7 October      |       430 |            100 |        96 |
| 4 October      |       494 |            178 |       147 |
| 3 October      |       223 |             65 |        54 |
| 30 September   |       416 |            143 |       141 |
| 27 September   |       606 |            363 |       230 |
| 26 September   |       282 |            133 |        64 |
| 23 September   |       741 |             63 |        55 |
| 20 September   |       384 |             81 |        79 |
| **Total**      | **4,559** |      **1,708** | **1,216** |

The PDF alignment compared 70,803 words and found 1,979 words with different normalized spelling after the reusable rules ran (2.79%). This is **not** an error rate: the PDFs sometimes paraphrase the spoken text, omit material, or use editorial wording. The 1,708 proposals are edit operations rather than a count of incorrect words; a phrase edit can change several words, and a reusable rule can overlap a PDF edit. The earlier narrow spelling-only pass proposed 511 changes.

The broader pass copies short wording, capitalization, accent, and punctuation changes when exact ordered phrases bound them on both sides **within the same subtitle cue**. It excludes page numbers and does not delete spoken words merely because the PDF omits them. Cue numbers and timestamps remain unchanged. Passages that cannot be aligned confidently remain for human review.

## Reusable corrections recorded

The audit recorded single-word PDF proposals and the broadcasts where they occurred in [subtitle-correction-candidates.json](subtitle-correction-candidates.json). Frequent proposals included `dieu → Dieu`, `Rousse → Russ`, `hébreux → Hébreux`, `coeur → cœur`, `mathieu → Matthieu`, and `franck → Frank`. The future-upload rules now cover `Jésus`, `Christ`, `Branham`, `Dieu` (with the existing context guard), `Abraham`, `Hébreux`, `cœur`, and contextual `Frère Rousse → Frère Russ`, `Ewald/Frère Franck → Frank`, and `Mathieu` before a chapter number. These are applied when an admin clicks Auto Correct, even without a linked PDF. In the ten-sermon audit, `christ → Christ` appeared 43 times.

Pairs such as `du → de`, `à → en`, `Abraham → Branham`, and `nuit → Nuée` depend on the surrounding sermon. They remain PDF-specific proposals rather than global replacement rules. The recorded candidates are evidence for later review, not an automatically trusted dictionary.

## Admin workflow

An admin can run **Auto Correct** on an SRT while scheduling, while editing an upcoming broadcast, or from a past broadcast in the history list. An already attached SRT is previewed before applying; the preview shows the count, examples, and how many edits came from its linked PDF. Applying writes a new SRT object and swaps the broadcast reference, leaving cue times unchanged and the original object available for recovery. A newly staged SRT gets reusable corrections before upload when the admin clicks the button; after saving, the admin can use Auto Correct on the attached SRT to also apply a linked PDF. Corrections are never run in the listener's browser.

The audit can be repeated with:

```sh
node --env-file=admin/.env.local --experimental-strip-types admin/scripts/audit-subtitle-corrections.mjs 10
```

Add `--write-candidates` to refresh the recorded candidate file. This command reads subtitle and PDF objects; it does not alter live records.
