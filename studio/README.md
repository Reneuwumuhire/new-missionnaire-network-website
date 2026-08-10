# Missionnaire Studio

A live broadcast switcher for the Missionnaire Network — the piece that used to
be OBS. Scenes, sources, an audio mixer, and a lyrics panel that OBS does not
have, streaming to the church's own ingest and to YouTube at the same time.

Tauri (Rust) + Svelte 5. The Rust side owns exactly one thing: an `ffmpeg`
process. Everything visual happens on a canvas in the webview.

## Why it is built this way

```
scenes/layers ─► <canvas> ─► captureStream ─┐
mics/media ────► WebAudio bus ──────────────┴─► MediaRecorder (VP8/Opus)
                                                      │  250 ms chunks over IPC
                                                      ▼
                                       Rust ─► ffmpeg ─► H.264/AAC ─► RTMP ×N
```

The canvas **is** the broadcast. Switching a scene only changes what the next
frame paints, so the encoder and every RTMP connection stay up across a scene
change — no reconnect, no dropped viewers.

With more than one destination, ffmpeg's `tee` muxer fans one encode out to all
of them with `onfail=ignore`: **YouTube refusing a stream key cannot take the
church's own stream down with it.**

## Running it

Needs `ffmpeg` on the machine (`brew install ffmpeg`) and a Rust toolchain
(`rustup`). Then:

```bash
cd studio
pnpm install
pnpm studio          # dev
pnpm studio:build    # .app + .dmg in src-tauri/target/release/bundle
```

On first launch macOS asks for camera, microphone and screen-recording
permission. Screen recording additionally needs the app ticked in
**Réglages Système › Confidentialité et sécurité › Enregistrement de l'écran**.

## Destinations

`Destinations` tab. The two that matter:

| Where | URL | Key |
| --- | --- | --- |
| App + radio | `rtmp://<your-fly-app>.fly.dev/live` (locally `rtmp://localhost:1935/live`) | `obs`, or your `STREAM_KEY` |
| YouTube | `rtmp://a.rtmp.youtube.com/live2` | from YouTube Studio › Direct |

The first one is the same MediaMTX ingest OBS used to publish to, so the whole
existing chain downstream is untouched: MediaMTX → ffmpeg (strips video) →
Icecast → the app's radio player, plus the HLS DVR window. See
`ops/fly/streaming/README.md`.

Stream keys are stored in the app's local data in clear, the same as OBS stores
its own. Don't screenshot the Destinations tab with a key revealed.

## Lyrics

The `Paroles` tab drives every `Paroles` layer in every scene, and there are two
ways to run a service:

**Timed** — load a `.srt`. Press *Démarrer* on the first spoken line, or click
the line being sung right now in the list; nudge ±1/5/30 s if it drifts. Same
anchor + offset model the admin panel's live-transcript panel already uses.

**Manual** — paste the lyrics, one line per screen, and tap through with
**Space** (↑/↓ to correct). Every tap is timestamped, so *Exporter .srt* gives
you a real subtitle file for the recording afterwards.

Keyboard: **Space** next line, **1–9** switch scene.

### What this does and does not sync

The lyrics are painted into the video, so YouTube viewers and anyone watching
the video stream see them. Listeners on the **audio-only** radio player get
their transcript from the admin panel's own live-subtitle sync
(`/recordings` → *Sous-titres*) — the studio does not drive that yet. Wiring the
studio's anchor straight into the admin gate is the obvious next step; it needs
a token endpoint on the admin app.

## Things worth knowing

- **Don't minimise the window while live.** WebKit stops the render loop for a
  hidden page and the picture freezes. Merely *covering* the window is fine —
  macOS occlusion detection is switched off at startup for exactly this reason.
- Media files (image / video layers) are picked with a normal file dialog and
  held as blobs, so after a restart those layers ask for the file again. Scenes,
  layers, levels and destinations all persist.
- *Écoute locale* in the mixer is off by default. Turn it on only with
  headphones — otherwise the room mic picks up the speakers.

## Checking it works

Unit tests:

```bash
pnpm test                        # geometry, srt parsing, lyrics timing
cd src-tauri && cargo test       # ffmpeg argument building, key redaction
```

End-to-end, no camera and nobody at the keyboard — broadcasts a real scene
through the whole chain and prints the outcome:

```bash
# terminal 1: something to receive it
ffmpeg -listen 1 -i rtmp://127.0.0.1:11950/live/studio -c copy -y out.flv

# terminal 2
STUDIO_SELFTEST=rtmp://127.0.0.1:11950/live/studio pnpm studio
```

It prints a line a second (`frames`, `chunks`, encoded `f/kbps`) and finishes
with `SELFTEST OK`. `ffprobe out.flv` should show H.264 at your configured
resolution plus AAC 48 kHz stereo.
