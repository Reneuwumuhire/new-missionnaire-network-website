# Missionnaire Network Website

SvelteKit app for the Missionnaire Network website (Vite + TypeScript).

## Prerequisites

- Node.js 20 (recommended) or 18 (supported). `pnpm build` will fail on newer majors unless the Vercel runtime is explicitly configured.
- pnpm (recommended; this repo ships a `pnpm-lock.yaml`)

## Quick start (local)

0. If you cloned without submodules and see missing `mn-lib` errors, initialize them:

```bash
git submodule update --init --recursive
```

1. Install dependencies:

```bash
pnpm install
```

2. Create your local env file:

```bash
cp .env-example .env.local
```

3. Edit `.env.local` and add the required variables (see table below), then start the dev server:

```bash
pnpm dev -- --open
```

Dev server runs on `http://localhost:8080` (configured in `vite.config.ts`).

## Environment variables

This project uses SvelteKit `$env/static/*`, which means these variables must exist at build/dev time (even if you set them to an empty string). After changing any `.env*` file, restart the dev server.

Keep secrets in `.env.local` (it’s ignored by git).

| Name                      | Type    | Required | Example                           | Notes                                                                                                                   |
| ------------------------- | ------- | -------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `PUBLIC_MAIN_URL`         | public  | yes      | `http://localhost:8080/`          | Base URL used to build internal API URLs.                                                                               |
| `PUBLIC_LIVE_STREAM_URL`  | public  | yes      | `https://…`                       | Live radio stream URL. Set to an empty string (`""`) to hide the player.                                                |
| `MONGODB_URI`             | private | yes      | `mongodb://127.0.0.1:27017`       | Used for analytics + other server routes. Provide a real connection string to avoid Mongo connection errors on startup. |
| `YOUTUBE_API_KEY`         | private | yes      | `AIza…`                           | Used by the YouTube poller. Set to `""` to disable polling (it will skip the check).                                    |
| `LIVE_AUDIO_SOURCE_URL`   | private | no       | `http://localhost:8000/radio.mp3` | Upstream audio source for the live radio proxy. Only needed if testing live streaming.                                  |
| `LYRICS_MATCHES_CSV_PATH` | private | no       | `lyrics-matches.csv`              | Optional CSV path for the temporary admin lyrics review workflow.                                                       |

Example `.env.local` (safe defaults for local dev):

```bash
PUBLIC_MAIN_URL="http://localhost:8080/"
PUBLIC_LIVE_STREAM_URL=""
MONGODB_URI="mongodb://127.0.0.1:27017"
YOUTUBE_API_KEY=""
```

## Common commands

```bash
pnpm dev          # start dev server (port 8080)
pnpm build        # production build
pnpm preview      # preview production build
pnpm lint         # prettier check + eslint
pnpm format       # prettier write
pnpm check        # svelte-check
pnpm test         # vitest
```

## Live audio streaming (local)

The site includes a live radio feature at `/live`. To test it locally you need Docker and OBS (or any RTMP source).

### Prerequisites

- Docker & Docker Compose
- OBS Studio (or any RTMP streaming tool)

### Architecture

```
OBS (RTMP) --> MediaMTX --> FFmpeg transcoder --> Icecast --> /api/live/audio --> Radio player
```

Three containers run locally:

- **mediamtx** — receives RTMP from OBS on port 1935
- **audio-transcoder** — strips video with FFmpeg, outputs audio-only
- **icecast** — serves the MP3 stream on port 8000

### Quick start

1. Start the streaming stack:

```bash
pnpm stream:up
```

2. Configure OBS:
   - **Server:** `rtmp://localhost:1935/live`
   - **Stream Key:** `obs`
   - Start streaming in OBS

3. Add streaming env vars to `.env.local`:

```bash
PUBLIC_LIVE_STREAM_URL="http://localhost:8000/radio.mp3"
LIVE_AUDIO_SOURCE_URL="http://localhost:8000/radio.mp3"
```

4. Start the dev server and visit `http://localhost:8080/live`:

```bash
pnpm dev
```

### Useful commands

```bash
pnpm stream:up      # start all streaming containers
pnpm stream:down    # stop all streaming containers
pnpm stream:logs    # tail container logs
```

### Verify audio is working

- Raw stream: open `http://localhost:8000/radio.mp3` in a browser or VLC
- Via the app: open `http://localhost:8080/live` — the player should show "En direct" when audio is detected

### Troubleshooting

- **Containers not starting:** run `docker compose -f ops/streaming/docker-compose.yml ps` to check status
- **No audio:** check transcoder logs with `docker logs mn-audio-transcoder --tail=200`
- **Player shows "hors ligne":** ensure OBS is actively streaming and `LIVE_AUDIO_SOURCE_URL` points to `http://localhost:8000/radio.mp3`

See `ops/streaming/README.md` for detailed configuration and `ops/fly/streaming/README.md` for production deployment on Fly.io.

## YouTube Data API routes

API endpoints for the _@MissionnaireNetwork_ YouTube channel live under `src/routes/api/yt`.
See `src/routes/api/yt/README.md` for usage.

## Troubleshooting

- **`"PUBLIC_*" is not exported by "virtual:$env/static/public"`**: add the missing `PUBLIC_*` var to `.env.local` (it must exist even if empty), then restart `pnpm dev`.
- **`"SOME_KEY" is not exported by "virtual:$env/static/private"`**: add the missing private env var to `.env.local`, then restart `pnpm dev`.
- **`Unsupported Node.js version: vX.Y.Z` during `pnpm build`**: switch to Node 20 or 18 (for example via `nvm use 20`) or configure the adapter runtime.
- **MongoDB connection errors on startup**: ensure `MONGODB_URI` points to a reachable MongoDB instance (for local dev you can run MongoDB separately and use `mongodb://127.0.0.1:27017`).
- **Port 8080 already in use**: stop the process using the port or run `pnpm dev -- --port 3000` (and update `PUBLIC_MAIN_URL` accordingly).
