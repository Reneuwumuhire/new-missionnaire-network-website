// Launch-time smoke test, off unless STUDIO_SELFTEST holds an rtmp:// URL.
// It drives the real production path (program canvas → MediaRecorder → IPC →
// ffmpeg → RTMP) with a camera-free scene, so the chain can be verified on a
// machine with no camera permission and nobody at the keyboard.
//
//   STUDIO_SELFTEST=rtmp://127.0.0.1:1935/live/test pnpm studio

import { invoke } from '@tauri-apps/api/core';
import {
	broadcast,
	chunkCount,
	goLiveHeld,
	startBroadcast,
	stopBroadcast
} from './broadcast.svelte';
import { frameCount, onAirSceneId, renderFrame, takeToProgram } from './compositor';
 import { applyTheme } from './i18n.svelte';
 import {
	DESKTOP_AUDIO,
	appAudio,
	capturingApp,
	listWindows,
	matchWindow,
	received,
	startAppAudio,
	stopAppAudio
} from './appaudio.svelte';
 import type { Mixer } from './mixer';
import { toDb } from './meter';
import { handleFor, listDevices, openMic, release } from './media.svelte';
import { addAudioInput, id, makeLayer, persist, studio } from './state.svelte';

const say = (line: string) => invoke('report', { line }).catch(() => console.log(line));
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function selftestTarget(): Promise<string | null> {
	return invoke<string | null>('selftest_target').catch(() => null);
}

/** Proves the cross-fade actually blends. Two throwaway colour-only scenes,
 *  black then white: halfway through a 1 s fade the centre pixel must be grey.
 *  Before the compositing fix it jumped straight to white, because each layer
 *  reset globalAlpha and wiped the transition's. */
async function checkFade(canvas: HTMLCanvasElement) {
	const restore = {
		scenes: studio.scenes,
		activeSceneId: studio.activeSceneId,
		programSceneId: studio.programSceneId,
		type: studio.settings.transitionType,
		ms: studio.settings.transitionMs
	};
	const black = { id: id(), name: '__fade_from', layers: [makeLayer('color', 'a', { color: '#000000' })] };
	const white = { id: id(), name: '__fade_to', layers: [makeLayer('color', 'b', { color: '#ffffff' })] };
	studio.scenes = [...studio.scenes, black, white];
	studio.settings.transitionType = 'fade';
	studio.settings.transitionMs = 1000;

	const context = canvas.getContext('2d');
	const sample = () => {
		const data = context?.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1)
			.data;
		return data ? data[0] : -1;
	};

	// Drive the same path a scene click does — read what is on air, move the
	// edit selection, then take. Taking alone only moves the program canvas in
	// Studio Mode, which is why this check used to pass only by accident.
	const take = (sceneId: string, ms: number, type?: 'fade' | 'cut' | 'fadeToBlack') => {
		const from = onAirSceneId();
		studio.activeSceneId = sceneId;
		takeToProgram(sceneId, ms, from, type);
	};

	take(black.id, 0);
	await wait(300);
	const before = sample();

	take(white.id, 1000);
	await wait(500);
	const middle = sample();

	await wait(900);
	const after = sample();

	const blended = before < 40 && after > 215 && middle > 60 && middle < 200;
	await say(`SELFTEST fade before=${before} middle=${middle} after=${after} ${blended ? 'BLENDED' : 'NOT BLENDED'}`);

	// Fade to black goes white → black → white: the quarter and three-quarter
	// points must both be darker than either end.
	take(black.id, 0);
	await wait(250);
	take(white.id, 1200, 'fadeToBlack');
	await wait(550);
	const dip = sample();
	await wait(1000);
	const settled = sample();
	const dipped = dip < 60 && settled > 215;
	await say(`SELFTEST fadeToBlack dip=${dip} settled=${settled} ${dipped ? 'DIPPED' : 'NO DIP'}`);

	// Colour bars: a scene with a camera source that has no stream must paint
	// bars, and the same scene with the setting off must not.
	const broken = {
		id: id(),
		name: '__bars',
		layers: [makeLayer('camera', 'missing'), makeLayer('color', 'bg', { color: '#000000' })]
	};
	studio.scenes = [...studio.scenes, broken];
	const probe = (x: number) => {
		const data = context?.getImageData(x, Math.floor(canvas.height * 0.3), 1, 1).data;
		return data ? `${data[0]},${data[1]},${data[2]}` : '?';
	};
	if (context) {
		studio.settings.barsWhenNoSource = true;
		renderFrame(context, broken.id, false);
		const white = probe(Math.floor(canvas.width * 0.05));
		const yellow = probe(Math.floor(canvas.width * 0.2));
		studio.settings.barsWhenNoSource = false;
		renderFrame(context, broken.id, false);
		const off = probe(Math.floor(canvas.width * 0.2));
		studio.settings.barsWhenNoSource = true;
		const ok = white === '255,255,255' && yellow === '255,255,0' && off === '0,0,0';
		await say(`SELFTEST bars white=${white} yellow=${yellow} disabled=${off} ${ok ? 'OK' : 'WRONG'}`);
	}

	studio.scenes = restore.scenes;
	studio.activeSceneId = restore.activeSceneId;
	studio.programSceneId = restore.programSceneId;
	studio.settings.transitionType = restore.type;
	studio.settings.transitionMs = restore.ms;
	persist();
	return blended && dipped;
}

/** The self-test needs the live mixer to prove app audio reaches it. */
let mixerRef: Mixer | null = null;
export function selftestMixer(mixer: Mixer | null) {
	mixerRef = mixer;
}

/** `STUDIO_SELFTEST=main,held` exercises the hold: the held destination must
 *  receive nothing at all until Go Live is pressed. */
async function checkHold(
	heldUrl: string,
	canvas: HTMLCanvasElement,
	audio: MediaStreamTrack | undefined
) {
	const restore = studio.destinations;
	studio.destinations = [
		{ id: 'st-main', name: 'main', url: restoreMainUrl, key: '', enabled: true, hold: false },
		{ id: 'st-held', name: 'held', url: heldUrl, key: '', enabled: true, hold: true }
	];

	await startBroadcast(canvas, audio);
	await say(`SELFTEST hold started phase=${broadcast.phase} heldLive=${broadcast.heldLive}`);
	await wait(6000);
	await say(
		`SELFTEST hold before-golive phase=${broadcast.phase} heldLive=${broadcast.heldLive} targets=${broadcast.targets.map((t) => `${t.name}/${t.group}:${t.state}`).join(' ')}`
	);

	await goLiveHeld();
	await wait(6000);
	await say(
		`SELFTEST hold after-golive heldLive=${broadcast.heldLive} targets=${broadcast.targets.map((t) => `${t.name}/${t.group}:${t.state}`).join(' ')}`
	);

	await stopBroadcast();
	studio.destinations = restore;
}

let restoreMainUrl = '';

/** `STUDIO_SELFTEST=audio` — the audio chain on its own, no ffmpeg and no RTMP.
 *  Everything here is something a human would otherwise have to hear: that the
 *  meter moves, that a microphone opens at the mixer's rate, that an
 *  application's sound actually arrives, and that a shared window can be traced
 *  back to the application behind it. */
export async function runAudioSelftest(): Promise<void> {
	const bus = mixerRef;
	if (!bus) {
		await say('AUDIOTEST FAIL: no mixer');
		return;
	}
	let ok = true;
	// Anything a previous run left behind goes first: a probe id that is already
	// in the saved state would be added twice, and two sources with one id is a
	// duplicate key, which takes the whole window down.
	studio.audioSources = studio.audioSources.filter((source) => !source.id.startsWith('__'));
	const restoreSources = studio.audioSources;
	// The reconciler tears down any strip that is not a source it knows about —
	// which is right in a show and fatal to a probe. So each probe is a real
	// source for as long as it is measured, and the list is put back after.
	const asSource = (probeId: string) => {
		studio.audioSources = [
			...studio.audioSources.filter((source) => source.id !== probeId),
			{ id: probeId, name: probeId, kind: 'app' as const, gain: 1, muted: false }
		];
	};
	await bus.resume();
	await say(`AUDIOTEST context state=${bus.ctx.state} rate=${bus.ctx.sampleRate}`);
	if (bus.ctx.state !== 'running') ok = false;

	// 1. The meter itself: a −20 dBFS tone must read −20 dB on the strip. This
	//    is the whole visualiser path — analyser, float samples, dB scale.
	asSource('__tone');
	const osc = bus.ctx.createOscillator();
	const gain = bus.ctx.createGain();
	gain.gain.value = 0.1;
	osc.connect(gain);
	osc.start();
	const strip = bus.addNode('__tone', gain);
	// A analyser of our own on the same node, read both ways: if the strip's
	// meter is flat and this one is not, the fault is in the wiring; if float is
	// flat and bytes are not, it is the engine's float API.
	const probe = bus.ctx.createAnalyser();
	probe.fftSize = 1024;
	gain.connect(probe);
	const floats = new Float32Array(1024);
	const bytes = new Uint8Array(1024);
	for (let i = 1; i <= 3; i++) {
		await wait(400);
		probe.getFloatTimeDomainData(floats);
		probe.getByteTimeDomainData(bytes);
		const probeFloat = Math.max(...Array.from(floats, Math.abs));
		const probeByte = Math.max(...Array.from(bytes, (v) => Math.abs(v - 128) / 128));
		const stripPeak = Math.max(...bus.peaks('__tone'));
		await say(
			`AUDIOTEST meter t=${i} strip=${stripPeak.toFixed(4)} probe-float=${probeFloat.toFixed(4)} probe-byte=${probeByte.toFixed(4)} has=${bus.has('__tone')} chans=${strip.analysers[0].channelCount}`
		);
	}
	const tone = Math.max(...bus.peaks('__tone'));
	const toneDb = toDb(tone);
	const meterOk = Math.abs(toneDb + 20) < 3;
	await say(`AUDIOTEST meter tone=${toneDb.toFixed(1)}dB expected=-20dB ${meterOk ? 'OK' : 'WRONG'}`);
	if (!meterOk) ok = false;

	// Stereo, or dual mono? Hard-panning the tone must show on one bar only. If
	// this passes, anything that meters the same on both legs is a mono source,
	// not a bus that has collapsed it.
	// Remove first: the mixer disconnects a strip's node on the way out, which
	// would cut the very connection this is about to make.
	bus.remove('__tone');
	const panner = bus.ctx.createStereoPanner();
	gain.disconnect();
	gain.connect(panner);
	bus.addNode('__tone', panner);
	panner.pan.value = -1;
	await wait(400);
	const [leftL, leftR] = bus.peaks('__tone');
	panner.pan.value = 1;
	await wait(400);
	const [rightL, rightR] = bus.peaks('__tone');
	const stereo = leftL > leftR * 4 && rightR > rightL * 4;
	await say(
		`AUDIOTEST stereo panned-left=${leftL.toFixed(3)}/${leftR.toFixed(3)} panned-right=${rightL.toFixed(3)}/${rightR.toFixed(3)} ${stereo ? 'OK' : 'COLLAPSED'}`
	);
	if (!stereo) ok = false;
	osc.stop();
	bus.remove('__tone');

	// 2. A microphone: it must open, run at the mixer's rate — WebKit plays
	//    silence rather than resampling — and land on the bus as a strip.
	asSource('__selftest_mic');
	const handle = await openMic('__selftest_mic');
	const track = handle.stream?.getAudioTracks()[0];
	const settings = track?.getSettings();
	const devices = await listDevices('audioinput');
	await say(
		`AUDIOTEST mic error=${handle.error ?? '-'} label=${JSON.stringify(track?.label ?? '')} rate=${settings?.sampleRate ?? '?'} channels=${settings?.channelCount ?? '?'} devices=${devices.length}`
	);
	if (handle.stream) {
		const strip = bus.addStream('__selftest_mic', handle.stream);
		await wait(800);
		const legs = bus.peaks('__selftest_mic');
		const room = toDb(Math.max(...legs));
		// A silent room is not a failure; a missing strip is.
		await say(
			`AUDIOTEST mic strip=${strip ? 'yes' : 'NO'} room=${Number.isFinite(room) ? `${room.toFixed(1)}dB` : 'silence'} L/R=${legs[0].toFixed(4)}/${legs[1].toFixed(4)} node-channels=${strip?.node.channelCount ?? '?'} both-legs=${legs[0] > 0 && legs[1] > 0}`
		);
		if (!strip) ok = false;
		// Silence meters as silence on both legs, so this only judges a room that
		// is making some noise at all.
		if (legs[0] > 0.0005 && legs[1] === 0) {
			await say('AUDIOTEST mic FAIL: right leg dead — mono source not up-mixed');
			ok = false;
		}
		if (settings?.sampleRate && settings.sampleRate !== bus.ctx.sampleRate) ok = false;
		bus.remove('__selftest_mic');
	} else {
		ok = false;
	}
	release('__selftest_mic');

	// 3. Application audio, the native capture: it must deliver PCM. Silence
	//    still produces buffers, so blocks separate "started" from "delivering".
	const apps = await invoke<{ id: string; name: string }[]>('list_audio_apps').catch(() => []);
	const windows = await listWindows();
	await say(`AUDIOTEST apps=${apps.length} windows=${windows.length}`);
	if (apps.length === 0) {
		await say('AUDIOTEST FAIL: no applications — Screen Recording permission?');
		ok = false;
	} else {
		asSource('__selftest_app');
		asSource('__selftest_app2');
		const app = apps.find((a) => /arc|chrome|safari|music|vlc|spotify/i.test(a.name)) ?? apps[0];
		received.bytes = 0;
		received.blocks = 0;
		const started = await startAppAudio(bus, '__selftest_app', app);
		await wait(2500);
		const peak = toDb(Math.max(...bus.peaks('__selftest_app')));
		const legs = bus.peaks('__selftest_app');
		await say(
			`AUDIOTEST appaudio app=${app.name} started=${started} blocks=${received.blocks} bytes=${received.bytes} peak=${Number.isFinite(peak) ? `${peak.toFixed(1)}dB` : 'silence'} L/R=${legs[0].toFixed(4)}/${legs[1].toFixed(4)} err=${appAudio.error ?? '-'}`
		);
		if (!started || received.blocks === 0) ok = false;

		// Two at once: OBS captures several applications, and the second must
		// not silence the first.
		const other = apps.find((a) => a.id !== app.id);
		if (other) {
			const secondStarted = await startAppAudio(bus, '__selftest_app2', other);
			await wait(1500);
			const first = bus.has('__selftest_app');
			await say(
				`AUDIOTEST appaudio two-at-once second=${other.name} started=${secondStarted} first-still-there=${first} capturing=${appAudio.capturing.length}`
			);
			const both =
				appAudio.capturing.includes('__selftest_app') &&
				appAudio.capturing.includes('__selftest_app2');
			if (!secondStarted || !first || !both) ok = false;
			await stopAppAudio(bus, '__selftest_app2');
		}
		await stopAppAudio(bus, '__selftest_app');
		await say(`AUDIOTEST appaudio after-stop capturing=${appAudio.capturing.length} strip=${bus.has('__selftest_app')}`);

		// The whole desktop, which is what a shared screen sounds like.
		received.bytes = 0;
		received.blocks = 0;
		const desk = await startAppAudio(bus, '__selftest_app', {
			id: DESKTOP_AUDIO,
			name: 'desktop'
		});
		await wait(2000);
		await say(
			`AUDIOTEST desktop started=${desk} blocks=${received.blocks} bytes=${received.bytes} err=${appAudio.error ?? '-'}`
		);
		if (!desk || received.blocks === 0) ok = false;
		await stopAppAudio(bus, '__selftest_app');

		// A window carrying an application's sound must keep it when the
		// programme cuts to a scene that does not contain the window. This is
		// the one the operator hit twice: the music stopped at the transition.
		const restoreScenes = studio.scenes;
		const restoreProgram = studio.programSceneId;
		const restoreActive = studio.activeSceneId;
		const shared = makeLayer('screen', '__shared_window', { appId: app.id });
		const withWindow = { id: id(), name: '__with', layers: [shared] };
		const without = { id: id(), name: '__without', layers: [makeLayer('color', 'bg')] };
		studio.scenes = [...studio.scenes, withWindow, without];
		studio.activeSceneId = withWindow.id;
		studio.programSceneId = withWindow.id;
		// The mixer's own effect starts it, exactly as it would for the operator.
		await wait(2500);
		const onAir = bus.has(shared.id);
		studio.activeSceneId = without.id;
		studio.programSceneId = without.id;
		await wait(2000);
		const afterCut = bus.has(shared.id);
		received.blocks = 0;
		await wait(1200);
		await say(
			`AUDIOTEST scene-cut strip-before=${onAir} strip-after=${afterCut} still-delivering=${received.blocks > 0} capturing=${appAudio.capturing.includes(shared.id)}`
		);
		if (!onAir || !afterCut || received.blocks === 0) ok = false;

		// And back again, which is the round trip an operator makes all service:
		// away to a slide, then back to the window.
		studio.activeSceneId = withWindow.id;
		studio.programSceneId = withWindow.id;
		await wait(2500);
		received.blocks = 0;
		await wait(1200);
		await say(
			`AUDIOTEST scene-return strip=${bus.has(shared.id)} delivering=${received.blocks > 0} meter-visible=${Boolean(document.querySelector(`[data-meter="${shared.id}"]`))} capturing=${appAudio.capturing.includes(shared.id)} err=${appAudio.error ?? '-'}`
		);
		if (!bus.has(shared.id) || received.blocks === 0) ok = false;

		// Re-sharing the source: the window is pointed at another application and
		// then back. The strip already exists throughout, so the capture has to
		// follow the application rather than sit on the first one it was given.
		const elsewhere = apps.find((a) => a.id !== app.id);
		// Through the store, not the object that was handed to it: state is
		// proxied on the way in, and writing to the original notifies nobody —
		// which is what the UI would never do, and what made this check pass by
		// accident the first time.
		const live = studio.scenes.find((scene) => scene.id === withWindow.id)!.layers[0];
		if (elsewhere) {
			live.appId = elsewhere.id;
			await wait(2500);
			const followed = capturingApp(shared.id) === elsewhere.id;
			live.appId = app.id;
			await wait(2500);
			received.blocks = 0;
			await wait(1000);
			const cameBack = capturingApp(shared.id) === app.id;
			await say(
				`AUDIOTEST re-share followed=${followed} back=${cameBack} strip=${bus.has(shared.id)} meter-visible=${Boolean(document.querySelector(`[data-meter="${shared.id}"]`))} delivering=${received.blocks > 0}`
			);
			if (!followed || !cameBack || !bus.has(shared.id)) ok = false;
		}

		await stopAppAudio(bus, shared.id);
		studio.scenes = restoreScenes;
		studio.programSceneId = restoreProgram;
		studio.activeSceneId = restoreActive;
		persist();
	}

	// 4. Delete an input and add another: the new one must open by itself. The
	//    guard against re-entering openMic while a request is in flight is what
	//    this would catch if it regressed.
	const first = addAudioInput();
	await wait(2500);
	const firstUp = Boolean(handleFor(first.id)?.stream) && bus.has(first.id);
	// On screen, not just on the bus. A strip can exist in the mixer and still
	// show the operator nothing — which is exactly what happened when the row's
	// "connected" answer was computed once, before the device had opened.
	const meterShown = Boolean(document.querySelector(`[data-meter="${first.id}"]`));
	// And it must keep moving: a meter that paints once is not a meter.
	const before = bus.peaks(first.id).join();
	await wait(700);
	const moving = bus.peaks(first.id).join() !== before;
	await say(
		`AUDIOTEST input meter-visible=${meterShown} meter-moving=${moving} strips-drawn=${document.querySelectorAll('[data-meter]').length}`
	);
	if (!meterShown) ok = false;
	release(first.id);
	bus.remove(first.id);
	studio.audioSources = studio.audioSources.filter((s) => s.id !== first.id);
	await wait(500);
	const second = addAudioInput();
	await wait(2500);
	const secondUp = Boolean(handleFor(second.id)?.stream) && bus.has(second.id);
	await say(`AUDIOTEST input add=${firstUp} delete-then-add=${secondUp} label=${JSON.stringify(handleFor(second.id)?.stream?.getAudioTracks()[0]?.label ?? '')}`);

	// Choosing a device again is the same call the select makes. The strip is
	// kept alive across the gap because it is global, so the mixer has to notice
	// the stream underneath it has been replaced — otherwise it holds the node
	// of a stopped track and meters nothing for the rest of the service.
	const wasStrip = bus.addStream(second.id, handleFor(second.id)!.stream!);
	await openMic(second.id);
	await wait(1500);
	const rebuilt = bus.addStream(second.id, handleFor(second.id)!.stream!);
	const reselected =
		Boolean(rebuilt) && rebuilt !== wasStrip && rebuilt?.stream === handleFor(second.id)?.stream;
	const legs = bus.peaks(second.id);
	await say(
		`AUDIOTEST input re-select rebuilt=${reselected} L/R=${legs[0].toFixed(4)}/${legs[1].toFixed(4)} strip=${bus.has(second.id)}`
	);
	if (!reselected) ok = false;
	if (!firstUp || !secondUp) ok = false;
	release(second.id);
	bus.remove(second.id);
	studio.audioSources = studio.audioSources.filter((s) => s.id !== second.id);

	// 4. The automatic association: every window on screen must be recognisable
	//    from its own title, which is what a shared window gives us to go on.
	if (windows.length > 0) {
		const named = windows.filter((w) => w.title.length >= 3).slice(0, 5);
		const hits = named.filter((w) => matchWindow(w.title, {}, windows)?.appId === w.appId);
		await say(
			`AUDIOTEST match by-title ${hits.length}/${named.length} e.g. ${named[0]?.title ?? '-'} → ${matchWindow(named[0]?.title ?? '', {}, windows)?.appName ?? 'none'}`
		);
		if (named.length > 0 && hits.length < named.length) ok = false;
		// And by size, which is the fallback when the engine gives no label.
		const bySize = windows.filter(
			(w) => matchWindow('', { width: w.width, height: w.height }, windows)?.appId === w.appId
		);
		await say(`AUDIOTEST match by-size ${bySize.length}/${windows.length} unique`);
	}

	// 5. The share itself. This is the one link a unit test cannot reach: what
	//    the engine tells us about the surface the operator picked is what the
	//    application behind it is matched from. If the picker needs a human the
	//    request simply times out, and that is worth knowing too.
	try {
		const shared = await Promise.race([
			navigator.mediaDevices.getDisplayMedia({ video: true, audio: true }),
			new Promise<null>((resolve) => setTimeout(() => resolve(null), 12000))
		]);
		if (!shared) {
			await say('AUDIOTEST share: no answer in 12s — the picker is waiting for a human');
		} else {
			const video = shared.getVideoTracks()[0];
			const settings = video?.getSettings() as MediaTrackSettings & { displaySurface?: string };
			const guess = matchWindow(video?.label ?? '', settings ?? {}, windows);
			await say(
				`AUDIOTEST share label=${JSON.stringify(video?.label ?? '')} surface=${settings?.displaySurface ?? '?'} size=${settings?.width}x${settings?.height} audio=${shared.getAudioTracks().length} matched=${guess?.appName ?? 'none'}`
			);
			shared.getTracks().forEach((track) => track.stop());
		}
	} catch (err) {
		await say(`AUDIOTEST share refused: ${err}`);
	}

	// Written back to disk, not just to memory: a probe source left in the saved
	// state is a duplicate id waiting to take the next launch down.
	studio.audioSources = restoreSources;
	persist();
	await say(`AUDIOTEST ${ok ? 'OK' : 'FAIL'} — terminé`);
}

export async function runSelftest(target: string, canvas: () => HTMLCanvasElement | null, audio: () => MediaStreamTrack | undefined) {
	const [mainUrl, heldUrl] = target.split(',');
	restoreMainUrl = mainUrl;
	target = mainUrl;
	await say(`SELFTEST target=${target}${heldUrl ? ` held=${heldUrl}` : ''}`);

	// A scene with no camera or screen source: nothing that would sit on an OS
	// permission prompt.
	const offline = studio.scenes.find(
		(scene) => !scene.layers.some((l) => l.kind === 'camera' || l.kind === 'screen')
	);
	const previousScene = studio.activeSceneId;
	if (offline) studio.activeSceneId = offline.id;
	await say(`SELFTEST scene=${offline?.name ?? '(aucune sans caméra)'}`);

	await wait(1200); // let the render loop paint real frames first
	const el = canvas();
	if (!el) {
		await say('SELFTEST FAIL: pas de canvas');
		return;
	}

	if (heldUrl) {
		// A one-shot ffmpeg listener accepts a single publisher, so running the
		// ordinary broadcast first would consume it and the hold check would
		// fail to connect for reasons of its own making.
		await checkHold(heldUrl, el, audio());
		const faded = await checkFade(el);
		await say(`SELFTEST ${faded ? 'OK' : 'FAIL'} — terminé (hold run)`);
		return;
	}

	await startBroadcast(el, audio(), [{ name: 'selftest', url: target }]);
	if (broadcast.error) {
		await say(`SELFTEST FAIL au démarrage: ${broadcast.error}`);
		return;
	}
	await say(`SELFTEST diffusion démarrée cmd=${broadcast.command.join(' ')}`);

	const t0 = Date.now();
	for (let i = 1; i <= 8; i++) {
		await wait(1000);
		const st = broadcast.stats;
		await say(
			`SELFTEST t=${i} wall=${Date.now() - t0}ms studio=${studio.settings.studioMode} canvases=${document.querySelectorAll('canvas').length} vis=${document.visibilityState} frames=${frameCount()} chunks=${chunkCount()} encoded=${st ? `${st.frames}f/${Math.round(st.bitrate_kbps)}kbps` : 'none'} err=${broadcast.error ?? '-'}`
		);
	}
	const stats = broadcast.stats;
	await say(
		stats
			? `SELFTEST stats frames=${stats.frames} fps=${stats.fps} bitrate=${stats.bitrate_kbps}kbps out=${stats.out_time_ms}ms dropped=${stats.dropped_frames} discarded=${stats.discarded_chunks} speed=${stats.speed}`
			: 'SELFTEST stats: aucune (ffmpeg n’a rien rapporté)'
	);
	await say(
		`SELFTEST targets ${broadcast.targets.map((target) => `${target.name}:${target.state}`).join(', ') || 'none'} phase=${broadcast.phase}`
	);
	if (broadcast.error) await say(`SELFTEST erreur: ${broadcast.error}`);
	for (const line of broadcast.log.slice(-8)) await say(`SELFTEST ffmpeg| ${line}`);

	await stopBroadcast();

	const faded = await checkFade(el);
	studio.activeSceneId = previousScene;
	await wait(1200);
	// Both themes must at least resolve their variables to different surfaces.
	applyTheme('light');
	await wait(150);
	const lightBg = getComputedStyle(document.body).backgroundColor;
	applyTheme('dark');
	await wait(150);
	const darkBg = getComputedStyle(document.body).backgroundColor;
	await say(`SELFTEST theme light=${lightBg} dark=${darkBg} ${lightBg !== darkBg ? 'OK' : 'SAME'}`);

	// ScreenCaptureKit reachable at all? It needs Screen Recording permission,
	// so a refusal here is information rather than a failure.
	try {
		const apps = await invoke<{ id: string; name: string }[]>('list_audio_apps');
		const sample = apps
			.slice(0, 3)
			.map((app) => app.name)
			.join(', ');
		await say(
			`SELFTEST appaudio apps=${apps.length}${apps.length ? ` e.g. ${sample}` : ' (no permission, or unsupported system)'}`
		);
		// Start one and see whether PCM actually arrives. Silence still produces
		// buffers, so this separates "the stream started" from "it delivers".
		if (apps.length > 0 && mixerRef) {
			const app = apps.find((a) => /arc|chrome|safari|music|vlc/i.test(a.name)) ?? apps[0];
			received.bytes = 0;
			received.blocks = 0;
			const started = await startAppAudio(mixerRef, '__selftest_app', app);
			await wait(2000);
			await say(
				`SELFTEST appaudio capture=${app.name} started=${started} blocks=${received.blocks} bytes=${received.bytes} ${appAudio.error ?? ''}`
			);
			await stopAppAudio(mixerRef, '__selftest_app');
		}
	} catch (err) {
		await say(`SELFTEST appaudio FAILED ${err}`);
	}

	const ok = Boolean(stats && stats.frames > 30 && !broadcast.error) && faded && lightBg !== darkBg;
	await say(`SELFTEST ${ok ? 'OK' : 'FAIL'} — terminé`);
}
