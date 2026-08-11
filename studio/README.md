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

**Scene Transitions** holds the type (Fade, Cut or Fade to Black) and the
duration, as OBS does. They are separate settings: switching to Cut and back
keeps the duration you chose. In Studio Mode the column between the two
canvases also has OBS's **Quick Transitions** — take with one specific
transition without changing the configured default.

**Studio Mode** (Controls → *Studio Mode*) splits the preview in two: the left
canvas is the scene you are editing, the right one is what is actually going
out. Build the next scene, then **Transition** (or `Enter`) cuts to it. The scene
on air carries an `AIR` badge in the Scenes dock, and its audio is the audio
being broadcast — setting up a scene never leaks its sound.

Keyboard: **Space** next lyric line, **1–9** switch scene, **Enter** transition
in Studio Mode.

Dark and light themes are in **Settings → General → Theme**. Every surface comes
from one set of CSS variables, so nothing is styled twice.

## Going live

**Start Streaming** opens the connections; the button reads *Reaching servers…*
until ffmpeg has actually pushed something, and only then does the clock start
and the header say LIVE. You are never told you are on air before you are.

Controls lists every destination with its own state — Connecting / Connected /
Failed, and the host it is talking to. A destination that fails is named: with
several destinations ffmpeg's `tee` reports which slave died, so YouTube
refusing a key shows up against YouTube and the church stream carries on.

**This app cannot start or stop a YouTube broadcast** — it has no YouTube API,
only an RTMP push. What happens after the stream reaches YouTube is YouTube's
decision:

- **Default stream key** (Studio → Go live → Stream): auto-start is on, so the
  broadcast **publishes itself the moment ffmpeg connects**. You are live before
  you touch anything here.
- **Scheduled stream** with auto-start off: YouTube holds it in preview until
  you press Go Live in Studio.

Once the YouTube ingest is receiving, an *Open YouTube Studio* button appears.
It opens a browser tab, nothing more. If you want the two-stage behaviour,
schedule the stream in YouTube Studio and turn auto-start off there.

### Stream health

The fields OBS's Stats dock shows, sourced from ffmpeg:

| Field | What it means when it climbs |
| --- | --- |
| Dropped frames (network) | ffmpeg gave up on frames it could not send |
| Skipped chunks (encoder / uplink) | the queue to ffmpeg overflowed — a slow uplink blocks its output, which backs up the pipe. **This is the congestion signal to watch** |
| Frames missed (rendering lag) | the compositor could not paint at the target fps — lower the resolution or fps |
| Encoder speed | below 1.00× means encoding slower than real time |

Bitrate is shown against what you asked for, plus total data sent.

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

A **lyrics ribbon sits directly above the Program canvas**: the line on air is
large and lit, the two either side are dimmed and smaller, and the column glides
rather than jumps — the way a lyrics app shows a song. It follows the program,
not the scene you are editing, so it always matches the picture going out. The
badge next to it blanks every Lyrics source at once.

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

## No-signal test pattern

When a scene has a camera, screen share or media file that is **not producing a
picture**, the frame is replaced with SMPTE-style colour bars. Black looks
exactly like a dead encoder; bars say the stream is alive and the source is not.

The rule is deliberately narrow: bars appear only when a scene owns at least one
video source and none of them drew, or when the scene draws nothing at all. A
scene made of a colour and some text — a "back shortly" card — is a deliberate
slate and is left alone. Turn it off in **Settings → Video**.

## Sharing a window or tab: the sound

**The picture comes through; the sound does not.** macOS's browser engine
(WKWebView, which is what Tauri uses) does not implement audio capture of a
shared window or screen — it accepts the request, returns video only, and
raises no error. Chromium does this; WebKit does not. No change in this app can
work around it, so the mixer says so on the strip instead of leaving you hunting
for a fault that is not yours.

The way round it, and what every macOS streamer does:

1. Install a virtual audio device — [BlackHole](https://existential.audio/blackhole/)
   (free) or Loopback.
2. Send the app's output to it. Simplest is a **Multi-Output Device** in
   *Audio MIDI Setup* containing both your speakers and BlackHole, selected as
   the system output — you still hear it, and BlackHole gets a copy.
3. In the studio's Audio Mixer, **+ → BlackHole** as an audio input.

Now the tab's sound is a normal strip with its own fader and meter, which is
better than a bundled track anyway: you can ride it against the preacher's mic.

Real per-app capture without the virtual device would mean ScreenCaptureKit on
the Rust side (macOS 13+). It is a genuine option, just a much larger one.

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
pnpm test                        # geometry, srt, lyrics, metering, layout, i18n, transitions
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
