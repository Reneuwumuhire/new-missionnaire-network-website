# Library search

`/recherche?q=…` and `/api/search` use the same public search across sermons,
music (including published lyrics), published/ready replays, transcription PDFs
and literature. Filters: `type`, `author`, `language`, `category`, inclusive `from`
and `to` dates, `match` and `page`. Searches accept 2–500 characters. File/lyric
phrases keep word order while tolerating accents, case, punctuation and line breaks.
Ordering is title match first, then newest, type and ID.
Unknown language metadata is not guessed. No new search service is required.

## Required database indexes (including already-extracted libraries)

Before deploying the indexed search query, run with Node 24 and the intended
`MONGODB_URI` in `.env.local`:

```sh
node --env-file=.env.local scripts/create-library-search-indexes.mjs
node --env-file=.env.local scripts/create-library-search-indexes.mjs --write
```

The first command checks readiness without changes. The second creates/checks
`library_file_text_v1` on `library_search.parts.text` in `sermons`, `literature`,
`pdfs` and `recordings`, plus the two relationship lookup indexes below. It prints
progress per collection, is safe to rerun, and does not download, re-extract or
modify source records. Existing incompatible text indexes are not dropped or
silently replaced; resolve any reported index conflict before deploying.

Text indexes update automatically when extracted text is saved or changed.
Default language is `none`: stop words are retained and no language stemming is
applied. The language override field is separate from legacy content `language`
values, so Kinyarwanda/unknown language metadata cannot break index creation.
These are native MongoDB text indexes, not Google indexing or Atlas Search
indexes, and do not require another service or subscription.

Use complete words when searching **inside files**: an indexed whole-word
candidate lookup (the longest query word) precedes phrase validation.
Case/accent-insensitive partial matching remains available for metadata and
single-term lyric searches. Punctuation-only queries search metadata/lyrics, not PDF bodies.
This deliberate distinction prevents every keystroke from scanning the entire
extracted library. Consider Atlas Search autocomplete if infix matching throughout
PDF text becomes a requirement.

## Extract existing PDF/SRT text

Metadata and published lyrics are searchable immediately. File contents need the
maintenance command below before they can appear in full-text results. Run it
again after adding files; use `--force` when replacing bytes at the same URL.

1. Use Node 24 and `pnpm install` (PDF.js is also lazy-loaded by the passage reader).
2. Configure `MONGODB_URI` and `LIBRARY_ASSET_HOSTS` (comma-separated exact HTTPS
   asset hosts, including any port). The database is `youtube_data`, as in the app.
3. Inspect a dry run:

   ```sh
   node --env-file=.env scripts/index-library.mjs
   ```

4. Against the intended database, explicitly persist the extracted text:

   ```sh
   node --env-file=.env scripts/index-library.mjs --write
   ```

This writes derived `library_search` fields, ensures the four full-text indexes,
and creates lookup indexes on `music_lyrics` and `scheduled_lives`, not original
files or publication state.
It runs sequentially, skips unchanged URLs, refuses redirects/unapproved
hosts, limits downloads to 30 MB, PDFs to 500 pages and extracted data to 2 MB per
file. Failures are reported and cause a non-zero exit; failed files keep their
previous successful extraction. Scans without a text layer are reported and remain
metadata-only (OCR is not included). No extraction or indexing runs in a user's
search request. Run this command in your existing content-import/maintenance
workflow; this PR does not schedule jobs or index production automatically.

The live source record is always authoritative: hidden/unpublished recordings and
their linked PDFs are excluded, draft lyrics are excluded, and extracted text is
only read if its URL still belongs to the current attachment. Hiding subtitles
also removes their indexed matches immediately. SRT timestamps use the current
recording offset (including scheduled-live fallback); PDF results link to a page.
Separately dubbed French audio starts normally rather than using original-track timestamps.
URLs are public HTTP(S) assets only. No database errors are exposed to users.

## Phrase search and highlighted reader

`match=phrase` (default) finds ordered phrases, including phrases crossing adjacent
PDF pages, subtitle cues or lyric lines. It never joins unrelated attachments or
French and English editions. Multi-part matching keeps a bounded overlap of
`max(256, query.length * 24)` characters rather than copying each whole book.
Words split by OCR errors, decorative duplicate glyphs, page headers inserted
inside a sentence, and arbitrary partial words in PDFs are not reconstructed.

`match=words` is a separate, explicitly labelled **Similar passages** mode. Every
word must appear in the same page/line plus bounded preceding context, in any
order; it is not semantic/AI search and results are not presented as exact quotes.

Body matches link to `/lecture/[type]/[id]` with the query, attachment and optional
`occurrence` in the URL. The reader reuses search publication gates on every
request, highlights the selected text, scrolls to it, and offers previous/next
matches. PDF excerpts stay on matching pages so unrelated cover lettering is not
shown as context. Metadata-only results retain their existing destination.
For PDFs, raw extracted text is an optional native disclosure rather than the
primary reading surface. This keeps decorative/garbled PDF lettering out of the
default view without rewriting quotations; failure to render opens the text fallback.

The original matching PDF page is rendered with the already-installed PDF.js,
including a selectable text layer and an aligned highlight. A validated same-origin
PDF endpoint forwards byte ranges without caching. It accepts only current indexed
PDF attachments on `LIBRARY_ASSET_HOSTS` (default S3 host; HTTPS without custom
ports), refuses redirects, and checks publication before fetching. If the PDF or
text layer cannot render, the extracted text and original-file link remain usable.
Song/SRT matches use the existing player and current timing offsets when provided;
opening a reader does not autoplay or invent PDF-to-audio timestamps.

**No re-extraction, database migration or additional search service is needed** for
this reader when the existing text/indexes are ready. Original files and publication
state are unchanged. Existing extraction limits above still apply; this is not OCR
or unlimited-file ingestion. Search/reader responses remain `no-store` and `noindex`;
query permutations are not a replacement for indexable canonical content pages.

## How to test

- `pnpm test --run`, `pnpm run check`, `pnpm run build`.
- Search a phrase occurring only in published lyrics, then one only in an indexed
  PDF/SRT. Check the excerpt and Listen/Open page action. Repeat with French
  accents and literal punctuation such as `C++` and `[test]`.
- Apply each filter and combined filters. Pagination and browser Back must retain
  the query/filters. A new search or filter submission resets to page 1.
- Verify draft lyrics, unpublished/not-ready recordings, hidden subtitles,
  removed/replaced attachments, and PDFs linked to private recordings never leak.
- Use a non-production database to test publication changes and indexing. Do not
  toggle a real broadcast just to test this feature.
- Header search: type quickly, clear, close/reopen, press Escape, press Enter,
  follow a result, and use See all. Old responses must not replace a newer query;
  Enter and See all open the library, not the sermon-only page.
- Test at 390px width, with keyboard-only navigation, and in both FR and EN.
- Search `quand je monte a la chaire` in the indexed 1947-04-12 sermon. Open the
  highlighted passage and verify the original PDF page 5 has the same highlight.
- Search `la foi`, open that sermon, and move from occurrence 1 to 2. The reader
  moves from PDF page 1 to 3, without showing the cover's duplicated decorative
  lettering as context on page 3. Previous/Next and browser Back retain the match.
- Search a phrase across two lyric lines or SRT cues. Listen starts at the first
  matched line/cue only when published timing exists; PDF matches do not fabricate
  a timestamp. Pause playback when finishing this check.
- Try an out-of-order phrase with **Similar passages**, then add an absent word:
  all words are required, and the page clearly distinguishes it from an exact quote.
- Paste a quotation longer than 100 characters (up to 500). Try a removed
  attachment URL or unpublished source directly in the reader: it must return 404.
- Disconnect the test database: show a retryable error, not a misleading zero
  results state. Invalid query length/date/type/page must be rejected.

The server retains its five-second aggregation budget and does not cache
publication-sensitive responses. File-text branches start with indexed `$text`
lookups, then validate current publication/attachment/language state and keep only
the first matching passage. Metadata branches never construct PDF text arrays.
Results are deduplicated before counting/pagination, so a title plus PDF match
does not appear twice. Only the selected result page is turned into UI excerpts.
There is no unindexed full-file fallback when a required index is missing.

Regression suite with an explicitly local, disposable database:

```sh
LIBRARY_TEST_MONGODB_URI=mongodb://127.0.0.1:27028/ pnpm test --run
```

Optional **read-only** real-catalogue benchmark after index setup (no fixtures,
index creation, database writes or cleanup against the configured database):

```sh
LIBRARY_BENCHMARK=1 node --env-file=.env.local node_modules/vitest/vitest.mjs run src/lib/server/librarySearch.performance.test.ts --disableConsoleIntercept
```

The benchmark includes `amour`, accents, common/short/no-match queries and combined
filters, and asserts the five-second end-to-end budget. Integration tests inspect
the query plan to verify use of `library_file_text_v1`, and cover deduplication,
PDF pages, lyric/SRT timestamps, literal punctuation and immediate visibility changes.
