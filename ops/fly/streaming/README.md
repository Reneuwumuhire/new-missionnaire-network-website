# Fly.io deployment (live audio service)

This deploys a single Fly app that runs:

- MediaMTX (RTMP ingest on port `1935`)
- FFmpeg (audio-only transcoder; reads internal RTSP audio by default for better stability)
- FFmpeg silence source (always-on, feeds the hidden `/silence.mp3` fallback mount)
- Icecast (listener stream on port `8000`)
- **Recorder** (Node HTTP API on port `8080`, exposed publicly on `:8443`) — captures broadcasts on admin command, uploads MP3s to S3, writes metadata to MongoDB

## Listener-stability design

The ingest chain (OBS → MediaMTX → FFmpeg → Icecast) restarts whenever the
publisher blips; without protection Icecast would disconnect every listener
each time and all players would visibly reload. Three mechanisms prevent that:

- **Silence fallback mount** — `/radio.mp3` falls back to the always-on
  `/silence.mp3` source (with `fallback-override`), so listener connections
  survive source drops: they hear a few seconds of silence instead of being
  disconnected. Consequences:
  - "Is the broadcast live?" must be answered from `status-json.xsl` by
    checking for the `/radio.mp3` **mount specifically** (bytes always flow on
    the listener URL). Both the site and the admin do this.
  - The recorder's Icecast read never EOFs at end-of-broadcast; it auto-stops
    after the real mount has been absent `SOURCE_GONE_STOP_SECONDS`
    (default 1800).
- **Icecast buffers** — `burst-size` 256 KB gives every new connection ~16 s
  of instant cushion; `queue-size` 2 MB lets slow listeners lag ~2 min before
  being kicked.
- **Ingest timeouts** — the RTSP transcoder uses a 10 s socket read timeout so
  a wedged connection dies and restarts instead of holding the source mount
  silent.

## Live DVR (HLS)

A second FFmpeg packager writes a rolling HLS window (AAC/MPEG-TS, default
6 s segments × 1800 = ~3 h) to `/data/hls`; the recorder serves it publicly
(no auth) at:

- Playlist: `https://<your-app-name>.fly.dev:8443/hls/live.m3u8`

This is what gives listeners YouTube-style **pause/resume + seek-back +
jump-to-live**: the window lives on the server, so a paused or rewound
position stays valid for hours regardless of the browser's own buffer.
`omit_endlist` keeps the playlist "live" across OBS blips; `append_list` +
discontinuity markers resume the same timeline; `program_date_time` gives the
player exact wall-clock per segment (used for transcript sync).

To enable it in the player, set on the **main site** (Vercel):

- `LIVE_AUDIO_HLS_URL=https://<your-app-name>.fly.dev:8443/hls/live.m3u8`

Without that env the player uses the Icecast stream only (live edge, no DVR).
Tunables (fly.toml `[env]`): `HLS_SEGMENT_SECONDS` (6), `HLS_DVR_SEGMENTS`
(1800), `HLS_DIR` (/data/hls). Disk: ~57 MB/h at 128 kbps — the 3 GB volume
holds the default window with lots of margin.

## 1) Create the app

```bash
fly apps create <your-app-name>
```

Edit `ops/fly/streaming/fly.toml` and set:

- `app = "<your-app-name>"`

## 2) Set secrets

```bash
fly secrets set -a <your-app-name> \
  ICECAST_SOURCE_PASSWORD="<strong-source-password>" \
  ICECAST_ADMIN_USER="admin" \
  ICECAST_ADMIN_PASSWORD="<strong-admin-password>"
```

Recorder secrets — required for the `/recordings` admin feature. Without these
the recorder process refuses to start (Icecast + RTMP still work fine).

```bash
fly secrets set -a <your-app-name> \
  RECORDER_TOKEN="<long-random-token>" \
  MONGODB_URI="mongodb+srv://..." \
  AWS_ACCESS_KEY_ID="..." \
  AWS_SECRET_ACCESS_KEY="..." \
  AWS_S3_BUCKET="missionnaire-bucket"
```

> **Keep `RECORDER_TOKEN` identical to the value in your Vercel admin env vars.**
> If they drift, every admin call will get `401 unauthorized`.

Optional stream key:

```bash
fly secrets set -a <your-app-name> STREAM_KEY="<your-obs-stream-key>"
```

If you do not set `STREAM_KEY`, the service auto-detects any active stream under `live/*`.

Optional input mode (default is `rtsp`):

```bash
fly secrets set -a <your-app-name> INPUT_PROTOCOL="rtsp"
```

## 3) Allocate dedicated IPv4 for RTMP (required for port 1935)

```bash
fly ips allocate-v4 -a <your-app-name>
```

## 4) Create a volume for recordings

In-progress MP3s are written to `/data/recordings` before upload. A Fly volume
persists them across machine restarts so orphan recovery works.

```bash
fly volumes create recordings_data --region jnb --size 3 -a <your-app-name>
```

## 5) Deploy

**Run from the repo root** — the Dockerfile needs access to `ops/streaming/recorder/`:

```bash
fly deploy \
  --config ops/fly/streaming/fly.toml \
  --dockerfile ops/fly/streaming/Dockerfile \
  -a <your-app-name> \
  --ha=false
fly scale count 1 -a <your-app-name>
```

Important: keep this app on exactly one machine. RTMP ingest is stateful per machine.

If multiple machines exist, remove extras:

```bash
fly machine list -a <your-app-name>
fly machine destroy <machine-id> -a <your-app-name> --force
```

## 6) Verify

```bash
fly status -a <your-app-name>
fly logs -a <your-app-name>
```

URLs:

- Listener audio: `https://<your-app-name>.fly.dev/radio.mp3`
- Icecast status (for "live but not recording" banner): `https://<your-app-name>.fly.dev/status-json.xsl`
- Recorder API: `https://<your-app-name>.fly.dev:8443/status` (needs `Authorization: Bearer <RECORDER_TOKEN>`)

Quick recorder health check:

```bash
curl -H "Authorization: Bearer $RECORDER_TOKEN" \
  https://<your-app-name>.fly.dev:8443/status
# → { "recording": false, "pendingOrphans": 0, "recovering": false }
```

Note: `404` on `/radio.mp3` is expected while no source is publishing.

OBS settings:

- Service: `Custom...`
- Server: `rtmp://<your-app-name>.fly.dev/live`
- Stream key: your `STREAM_KEY` (default `obs`)

## 7) Connect Vercel (website + admin)

**Main site** (`.env` on Vercel):

- `PUBLIC_LIVE_STREAM_URL=https://<your-app-name>.fly.dev/radio.mp3`
- `LIVE_AUDIO_SOURCE_URL=https://<your-app-name>.fly.dev/radio.mp3`

**Admin** (`.env` on Vercel):

- `RECORDER_URL=https://<your-app-name>.fly.dev:8443`
- `RECORDER_TOKEN=<same token as fly secrets>`
- `ICECAST_STATUS_URL=https://<your-app-name>.fly.dev/status-json.xsl`

Then redeploy both Vercel apps.

## 8) S3 bucket policy (one-time)

Public playback of the `recordings/` prefix requires a bucket policy. Do this
in the AWS Console before publishing any recording. **Do not make the whole
bucket public — only the `recordings/` prefix.**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadRecordings",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::<bucket>/recordings/*"
    }
  ]
}
```
