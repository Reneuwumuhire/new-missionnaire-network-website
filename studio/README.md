# Missionnaire Studio

A live broadcast switcher for the Missionnaire Network — the piece that used to
be OBS. It is laid out like OBS on purpose (preview on top, docks along the
bottom, Studio Mode, dBFS meters), so anyone who has run OBS already knows how
to run this. What it adds is a lyrics panel, and streaming to the church's own
ingest and to YouTube at the same time.

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
**System Settings › Privacy & Security › Screen Recording**.

## The layout, if you know OBS

```
┌──────────────────────────────────────────────┬──────────┐
│  preview   (Studio Mode: Preview │ Program)  │  Lyrics  │
├──────────────────────────────────────────────┤          │
│  canvas size · selected source · Properties  │          │
├────────┬─────────┬────────────┬───────┬──────┤          │
│ Scenes │ Sources │Audio Mixer │Trans. │Contr.│          │
└────────┴─────────┴────────────┴───────┴──────┴──────────┘
   LIVE: 00:00:00 · 30/30 fps · 3500 kbps · 0 dropped
```

Wording is OBS's own — Scenes, Sources, Audio Mixer, Scene Transitions,
Controls, Start Streaming, Studio Mode — so nobody has to learn a second name
for something they already know. English is the default; French is in
**Settings → General → Language** and uses OBS's French terms (Mélangeur audio,
Mode Studio, Paramètres).

Same muscle memory as OBS: click a scene to cut to it, eye and padlock on every
source, add/delete/properties/reorder buttons under Scenes and Sources, big
stacked buttons in Controls. Properties and Settings are dialogs rather than
permanent panels, and the stream destinations live under **Settings → Stream**,
exactly where OBS keeps them.

**Every seam is draggable** — between the preview and the dock row, between the
lyrics column and the preview, and between each pair of docks. Sizes are saved
with the scene collection. The dividers also take focus, so arrow keys resize
(hold shift for bigger steps). *Settings → Layout → Reset panels* puts them
back. Docks are laid out by proportion, so the row still fills the window
whatever size you drag it to.

**Studio Mode** (Controls → *Studio Mode*) splits the preview in two: the left
canvas is the scene you are editing, the right one is what is actually going
out. Build the next scene, then **Transition** (or `Enter`) cuts to it. The scene
on air carries an `AIR` badge in the Scenes dock, and its audio is the audio
being broadcast — setting up a scene never leaks its sound.

Keyboard: **Space** next lyric line, **1–9** switch scene, **Enter** transition
in Studio Mode.

## Destinations

*Settings → Stream*. The two that matter:

| Where | URL | Key |
| --- | --- | --- |
| App + radio | `rtmp://<your-fly-app>.fly.dev/live` (locally `rtmp://localhost:1935/live`) | `obs`, or your `STREAM_KEY` |
| YouTube | `rtmp://a.rtmp.youtube.com/live2` | from YouTube Studio › Direct |

The first one is the same MediaMTX ingest OBS used to publish to, so the whole
existing chain downstream is untouched: MediaMTX → ffmpeg (strips video) →
Icecast → the app's radio player, plus the HLS DVR window. See
`ops/fly/streaming/README.md`.

Stream keys are stored in the app's local data in clear, the same as OBS stores
its own. Don't screenshot the Stream page with a key revealed.

## Lyrics

The `Lyrics` dock drives every Lyrics source in every scene, and there are two
ways to run a service:

**Timed** — load a `.srt`. Press *Start* on the first spoken line, or click
the line being sung right now in the list; nudge ±1/5/30 s if it drifts. Same
anchor + offset model the admin panel's live-transcript panel already uses.

**Manual** — paste the lyrics, one line per screen, and tap through with
**Space** (↑/↓ to correct). Every tap is timestamped, so *Export .srt* gives you
a real subtitle file for the recording afterwards.

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
- *Monitor* in the mixer is off by default. Turn it on only with headphones —
  otherwise the room mic picks up the speakers.
- Meters are dBFS, like a real desk: green to about −20, amber to −9, red above
  that, with a peak-hold marker. Aim for the top of the green.
- No local recording button — the Fly recorder already captures every broadcast
  server-side (`/recordings` in the admin panel).

## Checking it works

Unit tests:

```bash
pnpm test                        # geometry, srt, lyrics timing, metering, layout, i18n
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
