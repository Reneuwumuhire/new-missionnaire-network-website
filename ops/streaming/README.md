# Local Audio Stream Stack

This stack lets OBS publish a normal stream while your site plays audio-only.

## Services

- `mediamtx` receives OBS stream on RTMP.
- `audio-transcoder` reads that stream and strips video with `ffmpeg`.
- `icecast` exposes the final audio stream as MP3.
- `audio-recorder` captures the Icecast stream on admin command, uploads MP3 to S3, writes metadata to MongoDB (`recordings` collection in `youtube_data` DB).
- `caddy` terminates TLS for the recorder's public HTTPS endpoint (`recorder.<domain>`) so the Vercel-hosted admin app can reach it.

## Endpoints

- OBS ingest URL: `rtmp://localhost:1935/live`
- OBS stream key: `obs`
- Raw audio URL: `http://localhost:8000/radio.mp3`
- Website player URL: `http://localhost:8080/live` (uses `/api/live/audio`)

## Run

```bash
pnpm stream:up
```

Watch logs:

```bash
pnpm stream:logs
```

Stop:

```bash
pnpm stream:down
```

Recreate after config changes:

```bash
docker compose -f ops/streaming/docker-compose.yml up -d --force-recreate
```

Rebuild transcoder image after code changes:

```bash
docker compose -f ops/streaming/docker-compose.yml up -d --build --force-recreate
```

## OBS setup (minimum)

1. Open `Settings -> Stream`.
2. Set `Service` to `Custom...`.
3. Set `Server` to `rtmp://localhost:1935/live`.
4. Set `Stream Key` to `obs`.
5. Start streaming.

Once streaming starts, audio becomes available at `http://localhost:8000/radio.mp3`.

## Quick troubleshooting

1. Check that all containers are running:
   - `mn-mediamtx`
   - `mn-icecast`
   - `mn-audio-transcoder`
   - `mn-audio-recorder`
   - `mn-caddy`
2. If `mn-audio-transcoder` is stopped, inspect logs:
   - `docker logs mn-audio-transcoder --tail=200`
3. Confirm raw stream URL works in browser/VLC:
   - `http://localhost:8000/radio.mp3`
4. If you still see 404, run:
   - `docker compose -f ops/streaming/docker-compose.yml ps`
   - `docker logs mn-audio-transcoder --tail=200`
   - `docker logs mn-icecast --tail=200`

## Recording service (`audio-recorder`)

The recorder runs a Fastify HTTP server (port `8080`) that drives `ffmpeg` to capture the Icecast MP3 stream on demand. The admin panel at `/admin/recordings` calls its `/start`, `/stop`, `/status`, and `/retry/:id` endpoints.

### Required env vars (passed via `docker-compose.yml`)

- `RECORDER_TOKEN` — shared secret. Admin panel sends this as `Authorization: Bearer <token>`.
- `MONGODB_URI`, `MONGODB_DB` (default `youtube_data`) — same Mongo as the admin.
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET`, `AWS_S3_REGION` — same bucket as the admin.
- `ICECAST_URL` (default `http://icecast:8000/radio.mp3`).
- `MAX_RECORDING_SECONDS` (default `14400` = 4 h safety cap).
- `RECORDER_HOST` (for Caddy) — e.g. `recorder.example.com`.
- `CADDY_ACME_EMAIL` — Let's Encrypt contact.

### How recordings land in S3

- Uploaded to key `recordings/<objectId>.mp3` (opaque, unguessable).
- `Content-Disposition: attachment; filename="YYYY-MM-DD Live recording.mp3"` so browser downloads get a clean name.
- `Cache-Control: public, max-age=31536000, immutable` (keys are content-addressed).

### S3 bucket policy

The `recordings/` prefix must be public-read so `<audio>` tags on the public site can stream without signing. Do **not** make the whole bucket public — the `music-audio/` prefix stays private.

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

### Crash recovery

On startup the recorder scans `/data/recordings/*.json` (sidecars written at start-of-recording) and re-uploads any orphaned MP3s before accepting new `/start` requests. Until recovery finishes, `/start` returns `503`.
