# Local Audio Stream Stack

This stack lets OBS publish a normal stream while your site plays audio-only.

## Services

- `mediamtx` receives OBS stream on RTMP.
- `audio-transcoder` reads that stream and strips video with `ffmpeg`.
- `icecast` exposes the final audio stream as MP3.

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

1. Check that all three containers are running:
   - `mn-mediamtx`
   - `mn-icecast`
   - `mn-audio-transcoder`
2. If `mn-audio-transcoder` is stopped, inspect logs:
   - `docker logs mn-audio-transcoder --tail=200`
3. Confirm raw stream URL works in browser/VLC:
   - `http://localhost:8000/radio.mp3`
4. If you still see 404, run:
   - `docker compose -f ops/streaming/docker-compose.yml ps`
   - `docker logs mn-audio-transcoder --tail=200`
   - `docker logs mn-icecast --tail=200`
