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

### Holding a destination back

YouTube publishes the instant its ingest sees a frame when you use a default
stream key — auto-start is on and cannot be turned off for that key. So
"Start Streaming" would put you live in public whether you meant to or not.

Tick **Wait for Go Live** on a destination (*Settings → Stream*; it is on by
default for YouTube, Facebook and Twitch) and **nothing is sent there at all**
when streaming starts. YouTube sees no stream, so it has nothing to publish.
A **Go Live** button then appears in Controls; press it and the held
destinations connect.

They get their own encoder rather than joining the running one, because an
output cannot be added to a live ffmpeg and restarting it would drop the
congregation's stream to bring up a public one. The cost is a second encode
while both run.

**This app still cannot stop a YouTube broadcast** — it has no YouTube API. Go
Live stops *feeding* YouTube; ending the broadcast is done in Studio, and the
*Open YouTube Studio* button takes you there.

If you would rather have YouTube's own two-stage flow, schedule the stream in
Studio and turn auto-start off there; the hold works either way.

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

## Capturing an application's sound

The browser engine cannot do this — WebKit ignores audio on `getDisplayMedia`
entirely — so it is captured natively instead, with **ScreenCaptureKit** on
macOS 13+.

**Audio Mixer → + → Application audio** asks which application first, the way
OBS asks in a source's properties before the source exists; the strip that
appears is named after the app and already capturing. Its sound is an ordinary
strip: its own fader, its own meter, monitored through the same bus and encoded
through the same mix. No virtual audio device, no BlackHole.

Several applications can be captured at once — each strip owns its own stream,
and stopping one leaves the others playing. Configured strips start themselves:
after a restart, or when a scene comes back on air, a strip that already knows
its application does not ask again.

Adding a **Display / Window Capture** does this by itself: the shared window is
matched to the application behind it and that application's sound comes up on
the window's own strip — fader, meter, mute — so a shared video plays out live
and can be ridden against the preacher's mic. If the guess is wrong, or there
was none, the strip's gear opens the list of applications.

The match works from what the engine says about the surface it shared: the
capture track's label against every on-screen window's title, then against
application names, and failing both a window whose size on screen is unique.
Sharing a whole display attaches **Desktop audio** instead — a screen has no
one application behind it, but it does have a sound. Every share prints what it
was given (`share label=… size=… matched=…`) to the terminal, which is the
first thing to read if the wrong application comes up.

Application sound carries across scenes. A window's picture stops when its
scene goes off air, but the application it is capturing keeps playing — cutting
to a slide or a break card does not stop the music. The same is true of the
mixer's own inputs: a mic or an application source belongs to the show, not to
a scene, the way a device in OBS's **Settings → Audio** does. The eye icon on
the source is what silences it, and deleting it stops its capture.

A camera's or media file's audio is still the scene's, and stops with it.

The studio excludes its own output from the capture, so monitoring cannot feed
back into the mix.

### Checking the audio chain without a human

```bash
STUDIO_SELFTEST=audio pnpm studio
```

Prints to the terminal and exercises what would otherwise have to be heard: a
−20 dBFS tone must meter −20 dB, a microphone must open at the mixer's rate and
land on the bus, an application's capture must deliver PCM blocks, two
applications must capture at once without silencing each other, desktop audio
must deliver, and every window on screen must be traceable back to its
application. It ends in `AUDIOTEST OK` or `AUDIOTEST FAIL`.

One link it cannot reach: `getDisplayMedia` refuses to run outside a user
gesture, so what the engine says about a shared surface can only be seen by
sharing one by hand — which is what the `share label=…` line is for.

### Permissions

The studio asks for the **microphone** on launch rather than waiting for a
source to need it: until the answer is yes, the engine reports no input devices
at all, so the mixer's device menu is empty with nothing to explain why. If it
is refused, the mixer shows a red bar with **Ask again** and a button that opens
the Privacy pane. Camera and screen sharing ask for themselves when a source is
added.

An application only appears under **Privacy & Security › Microphone** once it
has asked. Under `pnpm studio` (dev) the binary is not a bundle, so macOS
attributes the request to whatever launched it — your terminal — and
"Missionnaire Studio" never appears in that list. Run `pnpm studio:build` and
launch the built `.app` to get an entry of its own.

Needs **Screen Recording** permission (System Settings › Privacy & Security);
macOS asks the first time. Video of a shared window still comes from the
webview's own picker — only the audio is native.

**Properties → Hide the mouse pointer** asks the engine to leave the cursor out
of a share. It is a request: WebKit does not implement the `cursor` constraint
and paints the pointer in before we see the frame, so on macOS the panel says
so instead of pretending the switch worked. Chromium honours it.

## Windows

The app builds and runs on Windows: the webview there is Chromium, which does
support display-capture audio, and `pnpm studio:build` produces an installer.
Two differences to know about:

- **Application audio capture is macOS-only for now.** The module is
  platform-gated; on Windows the picker reports that the system cannot do it
  rather than failing. WASAPI process loopback is the equivalent API and is not
  written yet.
- `ffmpeg` must be on `PATH` (or in `FFMPEG_PATH`) — the bundled search paths
  are the Homebrew/MacPorts ones.

Everything else — compositing, scenes, transitions, the mixer, RTMP output —
is platform-independent.

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
