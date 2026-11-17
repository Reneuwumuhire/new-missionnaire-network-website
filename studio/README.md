# Missionnaire Studio

A live broadcast switcher for the Missionnaire Network — the piece that used to
be OBS. It is laid out like OBS on purpose (preview on top, docks along the
bottom, Studio Mode, dBFS meters), so anyone who has run OBS already knows how
to run this. What it adds is a lyrics panel, and streaming to the church's own
ingest and to YouTube at the same time.

Tauri (Rust), Svelte 5, and FFmpeg. The webview composites the Program
canvas and mixes its audio. The native media pipeline encodes that feed,
writes local recordings, and distributes encoded packets to RTMP publishers.

## Why it is built this way

Switching scenes or toggling Studio Mode keeps the Program canvas connected
to the recorder. The editing preview uses at most 960×540 at 15 fps.

Studio encodes an H.264/AAC feed once for its RTMP destinations. A local MP4
shares that encode when its quality settings match. Each destination has a
bounded packet queue and its own reconnect loop. When a destination stalls,
it reconnects with fresh codec headers and a keyframe while the encoder,
other publishers, and local recording continue.

## Running it

Release installers include FFmpeg and yt-dlp for macOS and Windows; operators do not need
to install it separately. Building Studio requires Node.js, pnpm and a Rust
toolchain (`rustup`). Then:

```bash
cd studio
pnpm install
pnpm studio          # dev
pnpm studio:build    # .app + .dmg in src-tauri/target/release/bundle
```

`pnpm studio` and `pnpm studio:build` prepare the media tools before building.
The release workflow packages both macOS architectures and Windows x64 into
the installers and updater artifacts. Both macOS binaries are built from
[FFmpeg 6.1.1 source](https://ffmpeg.org/releases/ffmpeg-6.1.1.tar.xz) with the
checked-in `scripts/build-macos-ffmpeg.sh` recipe. The script builds x264 and
LAME from pinned source and applies the SecureTransport RTMPS fix. Install
pkgconf on the build machine and NASM for Intel builds. On Windows, the binary
comes from [ffmpeg-static b6.1.1](https://github.com/eugeneware/ffmpeg-static/releases/tag/b6.1.1).
Downloaded tools are SHA-256 verified, and FFmpeg's license and build
notes ship beside the binary in Studio's resources.
The bundled yt-dlp is from [yt-dlp 2026.08.19](https://github.com/yt-dlp/yt-dlp/releases/tag/2026.08.19).

On macOS, install Studio in **Applications**. For window capture, choose
**Request screen recording access** in Studio and enable it in
**System Settings › Privacy & Security › Screen & System Audio Recording**.
Quit Studio with **⌘Q**, then reopen it from **Applications**. If the switch was
already on and capture still fails, quit Studio, remove its old recording entry
in System Settings, and add the copy from **Applications** again.

To keep that permission across updates, sign macOS releases with a
**Developer ID Application** certificate from the same Apple team. Configure
`APPLE_CERTIFICATE` (the base64-encoded `.p12`) and
`APPLE_CERTIFICATE_PASSWORD` as GitHub Actions secrets. For notarization,
also set `APPLE_ID`, `APPLE_PASSWORD` (an app-specific password), and
`APPLE_TEAM_ID`. The first update from an ad-hoc build may require granting
access again. Without a certificate the release workflow signs ad hoc.

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
(hold shift for bigger steps). _Settings → Layout → Reset panels_ puts them
back. Docks are laid out by proportion, so the row still fills the window
whatever size you drag it to.

**Scene Transitions** holds the type (Fade, Cut or Fade to Black) and the
duration, as OBS does. They are separate settings: switching to Cut and back
keeps the duration you chose. In Studio Mode the column between the two
canvases also has OBS's **Quick Transitions** — take with one specific
transition without changing the configured default.

**Studio Mode** (Controls → _Studio Mode_) splits the preview in two: the left
canvas is the scene you are editing, the right one is what is actually going
out. Build the next scene, then **Transition** (or `Enter`) cuts to it. The scene
on air carries an `AIR` badge in the Scenes dock, and its audio is the audio
being broadcast — setting up a scene never leaks its sound.

Keyboard: **Space** next lyric line, **1–9** switch scene, **Enter** transition
in Studio Mode.

Dark and light themes are in **Settings → General → Theme**. Every surface comes
from one set of CSS variables, so nothing is styled twice.

## Going live

**Start Streaming** opens the connections; the button reads _Reaching servers…_
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

Tick **Wait for Go Live** on a destination (_Settings → Stream_; it is on by
default for YouTube, Facebook and Twitch) and **nothing is sent there at all**
when streaming starts. YouTube sees no stream, so it has nothing to publish.
A **Go Live** button then appears in Controls; press it and the held
destinations connect.

Held destinations join the encoded feed at the next keyframe. Starting
YouTube while Missionnaire is on air leaves the Missionnaire connection and
local recording running.

**This app still cannot stop a YouTube broadcast** — it has no YouTube API. Go
Live stops _feeding_ YouTube; ending the broadcast is done in Studio, and the
_Open YouTube Studio_ button takes you there.

If you would rather have YouTube's own two-stage flow, schedule the stream in
Studio and turn auto-start off there; the hold works either way.

### Stream health

The fields OBS's Stats dock shows, sourced from ffmpeg:

| Field | What it measures |
| --- | --- |
| Dropped frames (encoder) | Frames omitted while encoding |
| Encoder backpressure events | The capture encoder reached its input queue limit |
| Frames missed (rendering lag) | The Program canvas painted fewer frames than requested |
| Encoder speed | Below 1.00× means encoding slower than real time |

Each destination shows its own connection state. Use Admin → Recordings →
Live Monitor to verify that Missionnaire is receiving audible audio.

## Destinations

On first launch, Studio connects to the admin app. That connection manages live
services, YouTube and cloud recording without copying server credentials to the
desktop app.

For local development only, _Settings → Advanced_ can import these keys
(database, AWS and recorder credentials are ignored):

```dotenv
MAIN_SITE_URL=https://www.missionnaire.net
ADMIN_SITE_URL=https://admin.missionnaire.net
MISSIONNAIRE_RTMP_URL=rtmp://<your-fly-app>.fly.dev/live
MISSIONNAIRE_STREAM_KEY=<stream-key>
YOUTUBE_STREAM_KEY=<youtube-stream-key>
```

_Settings → Stream_. The two that matter:

| Where       | URL                                                                         | Key                          |
| ----------- | --------------------------------------------------------------------------- | ---------------------------- |
| App + radio | `rtmp://<your-fly-app>.fly.dev/live` (locally `rtmp://localhost:1935/live`) | `obs`, or your `STREAM_KEY`  |
| YouTube     | `rtmp://a.rtmp.youtube.com/live2`                                           | from YouTube Studio › Direct |

The first one is the same MediaMTX ingest OBS used to publish to, so the whole
existing chain downstream is untouched: MediaMTX → ffmpeg (strips video) →
Icecast → the app's radio player, plus the HLS DVR window. See
`ops/fly/streaming/README.md`.

Stream keys are stored in the app's local data in clear, the same as OBS stores
its own. Don't screenshot the Stream page with a key revealed.

## Guided broadcast workflow

Studio offers exactly two service types in the service panel and when a public
session is created:

- **Pre-recorded Kinyarwanda** loads opening music, an existing Kinyarwanda
  sermon, closing music and its SRT. **Start programme** runs that queue once;
  subtitles follow only the sermon media clock. Krefeld can supply pictures,
  but its audio route remains excluded. No recorder is started in this mode.
- **Live from Krefeld** keeps one Krefeld source running. **Start sermon** opens
  the interpreter microphone, lowers Krefeld publicly, starts the sermon
  recording marker and subtitles; **End sermon** reverses the mix and saves the
  segment while Krefeld continues into closing music. The subtitle timing
  language must be identified, and small marker/caption corrections are
  available during the sermon.

Assignments and roles persist, but local media blobs do not. After a restart
the workflow restores safely at Ready with the microphone closed; use the file
inputs to locate local files again. Rehearse microphone and headphone hardware
with a private destination before the service.

## Lyrics

A **lyrics ribbon sits directly above the Program canvas**: the line on air is
large and lit, the two either side are dimmed and smaller, and the column glides
rather than jumps — the way a lyrics app shows a song. It follows the program,
not the scene you are editing, so it always matches the picture going out. The
badge next to it blanks every Lyrics source at once.

The `Lyrics` dock drives every Lyrics source in every scene, and there are two
ways to run a service:

**Timed** — load a `.srt`. Press _Start_ on the first spoken line, or click
the line being sung right now in the list; nudge ±1/5/30 s if it drifts. Same
anchor + offset model the admin panel's live-transcript panel already uses.

**Manual** — paste the lyrics, one line per screen, and tap through with
**Space** (↑/↓ to correct). Every tap is timestamped, so _Export .srt_ gives you
a real subtitle file for the recording afterwards.

### What this does and does not sync

The lyrics are painted into the video, so YouTube viewers and anyone watching
the video stream see them on the same frame. For the **audio-only** website,
Studio publishes the SRT position on ffmpeg's emitted media clock, corrected to
the website server clock. The player then follows the audio frame it is actually
playing through HLS `PROGRAM-DATE-TIME`, so network delay, buffering, pause and
DVR rewind move audio and text together instead of racing two arrival times.

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

On macOS 13+, **Display / Window Capture** automatically adds the selected
window's application to the mixer, even if playback starts later. The same
ScreenCaptureKit stream captures the picture and audio across monitors. macOS
captures audio at the application level, so other windows or tabs of that app
can also be heard. Closing the window or removing the source clears its mixer
strip. The Sources dock keeps a closed window's entry available to reconnect.

On Windows, Studio requests window audio from WebView2. Enable audio in the
system picker when it offers the option. Studio adds the track to the mixer
and removes it when the share ends.

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
macOS asks the first time. Studio lists and captures macOS windows with
ScreenCaptureKit.

**Properties → Hide the mouse pointer** changes the cursor setting on the
running macOS capture. Browser-managed shares use the video track's `cursor`
constraint when the webview supports it.

## Windows

The app builds and runs on Windows: the webview there is Chromium, which does
support display-capture audio, and `pnpm studio:build` produces an installer.
Two differences to know about:

- Standalone **Application audio** sources use ScreenCaptureKit on macOS.
  Windows window shares receive audio through the WebView2 picker.
- `ffmpeg` must be on `PATH` (or in `FFMPEG_PATH`) — the bundled search paths
  are the Homebrew/MacPorts ones.

Everything else — compositing, scenes, transitions, the mixer, RTMP output —
is platform-independent.

## Things worth knowing

- **Don't minimise the window while live.** WebKit stops the render loop for a
  hidden page and the picture freezes. Merely _covering_ the window is fine —
  macOS occlusion detection is switched off at startup for exactly this reason.
- Media files (image / video layers) are picked with a normal file dialog and
  held as blobs, so after a restart those layers ask for the file again. Scenes,
  layers, levels and destinations all persist.
- _Monitor_ in the mixer is off by default. Turn it on only with headphones —
  otherwise the room mic picks up the speakers.
- Meters are dBFS, like a real desk: green to about −20, amber to −9, red above
  that, with a peak-hold marker. Aim for the top of the green.
- Recording controls belong to the live sermon workflow. Live interpretation
  uses cloud segment recording plus the configured local safety capture;
  prepared Kinyarwanda reuses its existing sermon asset and cannot start either
  recorder. Saved cloud recordings remain available in `/recordings` in admin.
- In **Settings → Output → Recording**, choose Local (or local and cloud), then
  select **Audio only (MP3)**, **Video with audio (MP4)**, or **Both**. Both writes
  two files with the same name in `Movies/Missionnaire Studio` on macOS or
  `Videos/Missionnaire Studio` on Windows, ready to share once recording stops.
  Recording audio quality ranges from 96 to 320 kb/s; video has Compact, Standard,
  and High presets at the canvas resolution. These settings are saved separately
  from streaming quality and apply to the next recording. Existing setups keep
  MP4 as their default. Cloud recording is still controlled separately.

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

Use separate ingest infrastructure for network interruption rehearsals. The
production Fly ingest selects one active publisher across stream paths. Test
with the production scenes and devices, keep a local recording running, and
interrupt each destination independently. Check the saved file and listen in
Live Monitor after the signal returns.

## Native application menus

File provides Service Setup (⌘/Ctrl+Shift+S), Choose Live Session (⌘/Ctrl+Shift+O),
Recording Settings, and Open Recordings Folder (⌘/Ctrl+Shift+R).
View provides Toggle Lyrics Panel (⌘/Ctrl+Shift+L), Toggle Bottom Panels
(⌘/Ctrl+Shift+D), Toggle Studio Mode (⌘/Ctrl+Shift+M), Restore Default Layout,
and interface Zoom In / Out / Actual Size (⌘/Ctrl with + / − / 0).
Panel visibility persists; restoring the default layout brings both panels back.
Hidden panels remain mounted so audio and in-progress edits are retained.
Interface zoom is limited to 80–150% and does not change broadcast resolution.
Window retains native minimize/zoom/close actions and adds Center Window and,
on macOS, Bring All to Front. The application menu uses the product name and
includes Check for Updates; Help retains the guide, shortcuts, and troubleshooting.
