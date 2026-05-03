# Lyrics Matching Scripts

The first-pass matcher creates a review CSV without importing lyrics or changing the database.

```bash
pnpm lyrics:match -- --limit 50
```

The script reads `MONGODB_URI` from your shell, `.env.local`, or `.env`, then matches
`youtube_data.music_audio` rows against the public song index at `https://indirimbo-zikundwa.bi/`.
By default it writes `admin/lyrics-matches.csv` so the admin app can load it locally and in
deployment.

The CSV `audio_number` column uses `music_audio.number` when it exists, then falls back to metadata
parsed from the audio title or S3 filename. Version suffixes such as `116A`, `116B`, or `116A-B`
are written to `audio_version`, which lets the admin preview focus the matching lyric section. For
matching, an explicit title/filename prefix like `Iz'i Gisenyi 142 ...` is treated as a strong signal
even when the DB row only says `Other`. If a known book/number is missing from the source index but
has the predictable `Indirimbo/<book>-<number>.html` URL, the script adds that direct source
candidate for review.

Review the generated CSV and set `review_status` yourself, for example:

- `approved` when the source song is correct
- `rejected` when it is wrong
- leave blank when it still needs checking

Useful options:

```bash
pnpm lyrics:match -- --source-only
pnpm lyrics:match -- --refresh-source
pnpm lyrics:match -- --min-confidence 0.8
```

The next importer can use only rows marked `approved` to create reusable lyrics text records/files.

## Temporary Review Page

Run the admin app and open `/lyrics-review` to review the CSV in a browser.

```bash
cd admin
pnpm dev
```

The review page loads `admin/lyrics-matches.csv`, saves review edits to MongoDB, and exports an
updated CSV. In local development it also attempts to update `admin/lyrics-matches.csv` on disk. In
production, use the export button because serverless filesystems are not durable writable storage.
Access is handled by the existing admin login plus the `can_review_lyrics` admin permission.

Optional deployment env vars:

```bash
LYRICS_MATCHES_CSV_PATH="lyrics-matches.csv"
```

Review statuses:

- `approved` means the lyrics match the audio
- `rejected` means the candidate is wrong
- `ready_for_sync` means it is approved and ready for the timed-lyrics sync workflow
