# Lyrics Matching Scripts

The first-pass matcher creates a review CSV without importing lyrics or changing the database.

```bash
pnpm lyrics:match -- --limit 50
```

The script reads `MONGODB_URI` from your shell, `.env.local`, or `.env`, then matches
`youtube_data.music_audio` rows against the public song index at `https://indirimbo-zikundwa.bi/`.
By default it writes `admin/lyrics-matches.csv` so the admin app can load it locally and in
deployment.

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
Access is handled by the existing admin login.

Optional deployment env vars:

```bash
LYRICS_MATCHES_CSV_PATH="lyrics-matches.csv"
```

Review statuses:

- `approved` means the lyrics match the audio
- `rejected` means the candidate is wrong
- `ready_for_sync` means it is approved and ready for the timed-lyrics sync workflow
