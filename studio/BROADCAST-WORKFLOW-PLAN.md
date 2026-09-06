# Studio plan for the Missionnaire broadcast procedure

Updated 5 September 2026 to reflect the operator’s latest two-case specification. Scope: product and implementation plan; no application behavior changed.

Evidence: the operator’s procedure and clarifications, supplied screenshot, and inspected Studio/admin/listener-app code. Repository and screenshot text describe the current product; they are not additional user instructions. The supplied YouTube channel could not be retrieved during inspection. No live broadcast or hardware rehearsal was run.

## 1. Confirmed requirements

Offer exactly two service types: **Pre-recorded Kinyarwanda** and **Live from Krefeld**. This replaces the previous three-choice proposal.

| Requirement         | Pre-recorded Kinyarwanda                                                                                         | Live from Krefeld                                                                                                 |
| ------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Programme           | One **Start programme** action, then automatic opening music → Kinyarwanda sermon → closing music                | One continuous Krefeld feed; **Start sermon** and **End sermon** control sermon subtitles and recording           |
| Public sound        | Prepared music/sermon files                                                                                      | Krefeld sound; during the sermon, live interpreter over reduced French, following the earlier confirmed procedure |
| Picture             | Optional Krefeld live images; otherwise a prepared title card                                                    | Krefeld live picture throughout                                                                                   |
| Krefeld input audio | Excluded from the public mix, including during reconnects and picture changes                                    | Audible for music, reduced during interpretation                                                                  |
| Sermon subtitles    | Prepared beforehand; automatically shown and synchronized when the Kinyarwanda audio starts, hidden when it ends | Prepared beforehand; **Start sermon** attaches/activates them; **End sermon** hides them                          |
| Sermon recording    | No new recording; use the existing Kinyarwanda sermon file                                                       | Required, with operator-marked sermon boundaries                                                                  |

Optional local/YouTube music before Krefeld begins remains a separate waiting step. It is not the opening-music item within the actual programme.

Any introduction is already part of the same continuous **Live from Krefeld** feed and is interpreted live. There is no separate introduction file, source, playback step, or service type. A service containing an introduction uses live interpretation, not a prerecorded Kinyarwanda sermon. Recording follows the admin’s sermon start/end markers; do not invent a separate introduction recording rule.

## 2. What the admin does

### Case A — Pre-recorded Kinyarwanda

Preparation:

1. Select **Pre-recorded Kinyarwanda**.
2. Add opening music, Kinyarwanda sermon audio, closing music, and the prepared sermon subtitle file.
3. Optionally add the Krefeld live video link with **Images only — sound excluded**.
4. Verify the files, picture, and subtitle association. No recorder setup or readiness check is required for this case.

Operation:

| Action/event                                        | Studio behavior                                                                                                                        |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Start programme** — the only routine start action | Play the prepared opening music; sermon subtitles remain hidden; run the remaining sequence automatically                              |
| Opening music reaches its natural end — automatic   | Start the existing Kinyarwanda sermon file and show its prepared subtitles on the audio playback clock; no admin click and no recorder |
| Change the picture or Krefeld reconnects            | Keep the Kinyarwanda file and its captions running; Krefeld input sound remains excluded                                               |
| Sermon file reaches its natural end — automatic     | Hide sermon subtitles and immediately start the prepared closing music; no admin click and no recorder                                 |
| Closing music finishes                              | Show **Programme complete**; leave ending the public broadcast as the explicit action below                                            |
| **End broadcast**                                   | Finish the public session; retain the existing sermon asset and its subtitle association                                               |

Automatic progression is the required normal behavior, not an optional **Auto-play next** setting. Validate all three audio files and the subtitle file before **Start programme**, and preload the next audio item. No routine **Start sermon**, subtitle-show, or closing-music button is needed in Case A. Pause/resume and deliberate skip/recovery controls remain available for intervention. A pause, seek, stall, or file error must not accidentally advance the queue. Show the existing file’s playback position and remaining time, not a recording timer.

If the Kinyarwanda sermon lasts longer than the French sermon, our prepared programme continues and plays its own closing song in full. Optional live images do not control the audio or subtitle timeline. Explain that live pictures may depict a different passage; a title card is the available alternative.

### Case B — Live from Krefeld

Preparation:

1. Select **Live from Krefeld**.
2. Attach the actual Krefeld live video link once. Save a shortcut to the channel for finding it.
3. Load the prepared sermon subtitles and identify the language/audio timeline they were prepared against.
4. Assign the interpreter microphone and headphone feed; verify required recorder readiness before the live sermon can begin.

Operation:

| Action/event                                      | Studio behavior                                                                                                                                                                                            |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Take Krefeld live**                             | Show/hear its opening music; keep one continuous source playing                                                                                                                                            |
| **Start sermon**                                  | Trigger sermon recording with a start marker, attach/activate and anchor the prepared subtitles, and apply the live-interpretation audio preset in one action                                              |
| During the sermon                                 | Keep the Krefeld feed playing; interpreter is clear publicly, French is low publicly and clear in interpreter headphones                                                                                   |
| **End sermon**                                    | Stop the sermon recording segment after the final interpreted words, hide sermon subtitles, close the interpreter mic, and restore Krefeld volume; keep the source playing while waiting for closing music |
| Waiting for closing music / closing music arrives | Hear it through the same still-running Krefeld feed, with no further playback action; do not load a replacement closing file or restart the source                                                         |
| **End broadcast**                                 | Finish the public session and verify the saved sermon recording                                                                                                                                            |

Use **Start sermon** and **End sermon** as the button labels. Before the sermon, show **Start sermon**; while it is active, show **End sermon**. After ending, show **Sermon ended — recording saving/saved; Krefeld continues** rather than claiming closing music has already begun. The admin can simply wait for it. Do not require another button press to hear it.

Opening music, sermon, and closing music are phases of one live source, not three separately played media items. Sermon controls change mixing, subtitles, and recording boundaries; they do not stop or seek Krefeld playback or end the public broadcast.

If Krefeld begins closing music while the interpreter is finishing, retain the interpretation mix and recording until the admin marks the sermon ended. Then restore music volume. A local backup track is a recovery action for source failure, not the normal closing workflow.

## 3. Recording applies only to live interpretation

**Pre-recorded Kinyarwanda: do not record again.** The sermon file already exists. Reuse it and its prepared subtitles; do not create a duplicate recording or gate playback on recorder readiness.

**Live from Krefeld: record the sermon part.** This requirement must not depend on whether subtitles loaded successfully. The following capture rules apply only to this case:

- Record the interpreter/French programme mix that listeners receive. Preserve programme video where supported by the existing recording path. Never substitute the untouched French source as the sermon recording.
- Save the sermon portion between the admin’s start/end markers, excluding the surrounding opening and closing music. An introduction remains part of the continuous live input, with no separate capture or exclusion control.
- Prepare and verify the recorder before the live sermon.
- A live source cannot wait for a cloud recording request. Begin safety capture before the live sermon and use start/end markers to save or extract the sermon segment. Opening/closing material in an internal safety capture must not appear in the delivered sermon recording. Reuse the existing recorder and processing path; verify accurate trimming rather than assuming a start request is instantaneous.
- Use outgoing programme media timestamps for the recording markers, accounting for encoded audio still in flight. A UI click timestamp alone is insufficient for precise boundaries.
- In the live case, the admin marks the boundaries. Provide a small marker correction control against the retained recording so a late click can be corrected without altering the broadcast.
- Finalize asynchronously after the end marker while closing music continues. Show **Recording sermon**, **Saving sermon**, **Saved**, or a specific failure. Show a running timer during the sermon and a link to the saved result afterward.
- Local/cloud/both can remain a technical storage choice, but **Off** is unavailable for the live-interpretation case. Prepared mode does not start local, cloud, or safety recording. Prefer an available local safety copy when cloud storage fails; validate that path before the service rather than promising an unconfigured fallback.
- If every capture path fails during an already-running live sermon, keep the live service audible and show an immediate persistent recording failure with recovery controls. Do not falsely display recording success or silently claim the missing section can be recovered.
- Save the subtitle file and its relationship to the recorded segment. Replay subtitles must be rebased to the saved sermon start, including any pauses, seeks, or timing corrections that occurred on air.

## 4. Changes to create in Studio

### A. Guided service setup and service-order panel

Add the two-case selector to the existing session form and a compact service panel showing **Opening music → Sermon → Closing music**, plus optional before-service waiting. Any introduction stays inside the continuous live feed; do not add an introduction upload or separate playback step.

The current phase should show its source and subtitle status. In Case A, show **Start programme** before playback and automatic progress with pause/resume afterward. In Case B, show **Start sermon** then **End sermon** as the main sermon actions. Show recording status only in live mode; prepared mode can say **Existing sermon file**. Keep the current sermon’s controls fixed while the admin prepares another source. In live mode, show phase markers instead of implying each item is a separate playable file.

Save a reusable template and session-specific media assignments. Remember durable file references, validate them on reopen, and offer **Locate file**. Restore paused after a restart, with the microphone closed and no automatic publication.

### B. Independent picture and sound

Make **Use Krefeld images only** an explicit routing policy for the prepared case. Do not rely solely on muting the browser player or dragging one fader down. Enforce exclusion from the programme audio route across scene changes, source replacement, and reconnects.

The currently inspected code keeps some application audio active across scene changes. Guided mode must therefore own the role routing explicitly, independent of source visibility. The optional live video should be allowed to reconnect without touching the local sermon transport.

When the live picture fails, continue prepared audio with a title card. Missing optional Krefeld audio must not fail readiness in images-only mode.

### C. Audio presets and interpreter headphones

Name the relevant controls **Krefeld**, **Kinyarwanda recording**, **Interpreter**, and **Music**; show only applicable controls for the selected case.

- Prepared: local files public, Krefeld input audio excluded, interpreter mic closed.
- Live music: Krefeld normal public volume, interpreter mic closed.
- Live sermon/introduction: French at a rehearsed low public level, interpreter mic open.

Give interpreter headphones a separate French feed. The current monitor follows the master mix and cannot provide this independence. Keep French reference matching independent of the public volume too. Verify actual audio-device routing in rehearsal.

Use one capture of Krefeld. Do not create multiple application captures to represent its music and sermon phases. Avoid capturing unrelated browser audio through the same application route.

### D. Prepared subtitles with one clear timing source

Require selection of the prepared sermon subtitle file in both normal workflows, and validate it before the service. Attach/load it in advance where useful, but keep it hidden during music and activate it only at the sermon boundary.

- Prepared case: automatically show the loaded sermon subtitles as the queued Kinyarwanda audio starts; follow the media element’s actual playback position, including pause and seek. Hide them automatically at its end before closing music. No second operator action is required. Silent Krefeld video must never take over the subtitle clock.
- Live case: **Start sermon** attaches/activates and anchors the prepared track to the observed sermon start while triggering the sermon recording. Provide first-cue selection, pause/resume timing, and small corrections for drift. If an exact matching French reference recording exists, reuse reference matching as an optional timing aid.
- Identify which audio the live subtitles were timed against. French-timed subtitles do not automatically become precisely timed to live Kinyarwanda interpretation; use operator correction/manual cue following when needed. No cross-language synchronization is assumed.
- Hide sermon subtitles at the sermon end without stopping the continuous live source.

Subtitle failure must be visible and recoverable during the live programme; it must not stop or disable required sermon recording. Previewing another media source must not replace the active sermon’s subtitle timing.

### E. Atomic handovers and recovery

Use a small service controller with explicit phases and source roles. It owns the start/end action, caption timing, mixing preset, and live-only recording markers. Prepare target media first; perform a transition only once even if the admin clicks twice or a media-end event arrives twice. In prepared mode, the active item’s natural end advances the queue exactly once and owns the automatic subtitle handover. In live mode, the two sermon buttons own the boundaries; source events must not automatically end the sermon recording. Never restart the encoder merely because the sermon phase changes.

Extend preflight with the selected case’s file/source and subtitle checks; microphone, headphone, and required recording checks apply to live interpretation. Gate every automatic recorder entry point, including media playback and broadcast startup, by service type so prepared mode cannot accidentally start recording. Provide **Reconnect source**, **Locate file**, **Emergency music/card**, and explicit recording recovery actions. Show source silence/clipping and failed saves clearly.

## 5. Screen proposal

```text
Service: [Pre-recorded Kinyarwanda | Live from Krefeld]
Broadcast status              Existing file / Live recording status

[ Programme picture ]       Opening music → SERMON → Closing music
                            Current source / elapsed time
                            Subtitles: ready / running / needs correction
                            Prepared: automatic progress; pause/resume
                            Live: [ Start sermon / End sermon ]

Applicable audio controls   [Advanced controls]   [Emergency music/card]
```

For the prepared case, label optional Krefeld video **Images only — sound excluded**. For the live case, label the source **Continuous Krefeld live**. Reduce the permanently occupied lyrics area and reveal detailed source/transition editing under Advanced controls. Keep broadcast-ending controls distinct from ending the sermon: closing music continues after the sermon ends. In live mode this also ends the sermon recording segment; prepared mode simply advances playback.

## 6. Admin, listener app, and replay

- Save service type, active phase, assigned assets, and sermon start/end markers on the existing live session. Keep machine-specific local file paths on that machine.
- Publish what Missionnaire is actually broadcasting; do not label the prepared programme from Krefeld’s current phase.
- Keep the same public session and output stream through music/sermon handovers. Do not send another start notification on sermon start.
- Reuse the existing output/server clock alignment for audio-player subtitles. Retain phase/subtitle timing history over the DVR window so rewinding into music does not show current sermon captions.
- Live mode: save the sermon segment with title, date, duration, service type, and associated prepared subtitles. Verify playback and caption alignment before showing it as ready. Prepared mode: associate the existing sermon file and subtitles with the session, without generating a duplicate recording.
- Do not end the public session when the sermon ends. Live mode finalizes its recording while closing music plays; prepared mode needs no recording finalization.

## 7. Implementation order and existing code to extend

| Order | Deliverable                                                                                                                           | Existing code areas                                                                                                       | Acceptance gate                                                                                                                                    |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Two service types and explicit phase/source model                                                                                     | Studio `state.svelte.ts`, `App.svelte`, `NewSessionDialog.svelte`; new small service controller/panel                     | Exactly two cases; live is one source, prepared is a file package                                                                                  |
| 2     | Automatic prepared queue and subtitle handovers, independent images-only routing, interpreter audio presets/headphones                | `media.svelte.ts`, `MediaBar.svelte`, `mixer.ts`, `MixerDock.svelte`, `appaudio.svelte.ts`, `SourcesDock.svelte`          | One prepared start plays all three files automatically with no recording; Krefeld sound never leaks in prepared mode; live source stays continuous |
| 3     | Live-only sermon recording, prepared-mode recorder guards, ready-before-start capture, accurate markers, save/extraction and recovery | `recording.svelte.ts`, `broadcast.svelte.ts`, native FFmpeg code, existing recorder/admin recording paths, `preflight.ts` | Live sermon saved without programme music; no recorder starts in prepared mode; recording does not depend on captions                              |
| 4     | Prepared subtitle attachment and correct per-case timing                                                                              | `lyrics.svelte.ts`, `reference-match.svelte.ts`, `LyricsPanel.svelte`, `live-session.svelte.ts`                           | Captions start/end with sermon; selected picture or preview cannot steal timing                                                                    |
| 5     | Listener/DVR/replay metadata and subtitle alignment                                                                                   | `src/routes/api/studio/live/+server.ts`, existing broadcast state, player/transcript and recording code                   | Public playback and saved sermon agree with the actual programme timeline                                                                          |
| 6     | Packaged-app rehearsal and operator instructions                                                                                      | Existing Vitest/native self-tests, Studio README                                                                          | Both cases pass an end-to-end private rehearsal                                                                                                    |

Reuse the current compositor, encoder, session APIs, recording facilities, and media controls. No new streaming backend, automatic translator, source-delay buffer, or separate media-library service is required by these procedures. Update the README to reflect current recording and YouTube capabilities as well as the new procedure.

## 8. Acceptance checklist

1. Prepared: click **Start programme** once, then provide no admin input. Opening music ends → Kinyarwanda audio and prepared subtitles start automatically → subtitles hide and closing music starts automatically. No local, cloud, or safety recording starts and no duplicate sermon asset is created.
2. Prepared: connect/reconnect Krefeld, switch picture, or prepare another source. Krefeld sound never enters public output; local sermon and captions remain uninterrupted.
3. Prepared: run without optional live video and with a sermon longer/shorter than French. The package follows its own timeline and closes with its own complete music.
4. Live: keep one Krefeld feed running. **Start sermon** attaches/shows prepared subtitles and triggers sermon recording; **End sermon** stops the recording segment and hides subtitles. The feed continues through any wait and into closing music with no additional action or playback restart.
5. Live with introduction: interpret it within the same running source. No separate introduction file, playback action, or prerecorded Kinyarwanda sermon option appears; the admin marks the sermon recording boundaries.
6. Live: interpreter finishes after Krefeld moves into music. Retain their final words in the recording, then restore music volume.
7. Verify first/last sermon words in both local and cloud recording paths, including delayed cloud acknowledgement and late operator markers. The delivered segment excludes opening/closing sections.
8. Double-click starts, deliver duplicate media-end events, pause/seek prepared audio, stall a file, and fail subtitle loading. Never skip an item or duplicate transitions; prepared playback must not trigger recording, and live recording must not stop because subtitles failed.
9. In live mode, fail cloud recording and verify the configured fallback; fail all recording paths and verify an unmistakable failure state without a false Saved indicator. In prepared mode, unavailable recording services must not block playback.
10. Pause/rewind listener playback across sermon boundaries and play the saved sermon. The correct subtitle track and timing follow the audio actually heard.
11. Restart before publication; restore assignments or offer relinking, with microphone closed and no automatic publication.
12. Rehearse with the packaged application, actual microphone/headphones, private destination, and source-loss/recovery scenarios. Check render health and resulting recording availability.

The remaining preparation details are the live subtitle track’s language/timing reference and actual headphone routing. There are exactly two cases: prepared Kinyarwanda reuses its existing sermon file without recording; live interpretation uses one continuous Krefeld feed, including any introduction, and records the sermon portion.
