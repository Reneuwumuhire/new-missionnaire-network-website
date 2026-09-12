# Library search

`/recherche?q=…` and `/api/search` use the same public search across sermons,
music (including published lyrics), published/ready replays, transcription PDFs
and literature. Filters: `type`, `author`, `language`, `category`, inclusive `from`
and `to` dates, and `page`. Searches require 2–100 characters and use literal,
accent-tolerant matching. Ordering is title match first, then newest, type and ID.
Unknown language metadata is not guessed. No new search service is required.

## Extract existing PDF/SRT text

Metadata and published lyrics are searchable immediately. File contents need the
maintenance command below before they can appear in full-text results. Run it
again after adding files; use `--force` when replacing bytes at the same URL.

1. Use Node 24 and `pnpm install` (PDF.js is a development/maintenance dependency).
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

This writes derived `library_search` fields and creates lookup indexes on
`music_lyrics` and `scheduled_lives`, not original files or publication state.
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
- Disconnect the test database: show a retryable error, not a misleading zero
  results state. Invalid query length/date/type/page must be rejected.

The server uses a five-second aggregation budget and bounded result pages, and
does not cache publication-sensitive responses. If catalogue size/traffic makes
that budget inadequate, move the same result contract to Atlas Search rather than
increasing unlimited regex scans. File indexing is a deployment/content workflow
step; without it, results truthfully describe metadata/lyrics-only coverage.
