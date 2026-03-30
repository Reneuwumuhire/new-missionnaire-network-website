# Fly.io deployment (live audio service)

This deploys a single Fly app that runs:

- MediaMTX (RTMP ingest on port `1935`)
- FFmpeg (audio-only transcoder; reads internal RTSP audio by default for better stability)
- Icecast (listener stream on port `8000`)

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

## 4) Deploy

```bash
fly deploy -c ops/fly/streaming/fly.toml -a <your-app-name> --ha=false
fly scale count 1 -a <your-app-name>
```

Important: keep this app on exactly one machine. RTMP ingest is stateful per machine.

If multiple machines exist, remove extras:

```bash
fly machine list -a <your-app-name>
fly machine destroy <machine-id> -a <your-app-name> --force
```

## 5) Verify

```bash
fly status -a <your-app-name>
fly logs -a <your-app-name>
```

Listener URL:

- `https://<your-app-name>.fly.dev/radio.mp3`

Note: `404` on `/radio.mp3` is expected while no source is publishing.

OBS settings:

- Service: `Custom...`
- Server: `rtmp://<your-app-name>.fly.dev/live`
- Stream key: your `STREAM_KEY` (default `obs`)

## 6) Connect Vercel website

Set these env vars in Vercel for your website:

- `PUBLIC_LIVE_STREAM_URL=https://<your-app-name>.fly.dev/radio.mp3`
- `LIVE_AUDIO_SOURCE_URL=https://<your-app-name>.fly.dev/radio.mp3`

Then redeploy your Vercel app.
