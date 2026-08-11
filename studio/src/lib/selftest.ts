// Launch-time smoke test, off unless STUDIO_SELFTEST holds an rtmp:// URL.
// It drives the real production path (program canvas → MediaRecorder → IPC →
// ffmpeg → RTMP) with a camera-free scene, so the chain can be verified on a
// machine with no camera permission and nobody at the keyboard.
//
//   STUDIO_SELFTEST=rtmp://127.0.0.1:1935/live/test pnpm studio

import { invoke } from '@tauri-apps/api/core';
import { broadcast, chunkCount, startBroadcast, stopBroadcast } from './broadcast.svelte';
import { frameCount, onAirSceneId, renderFrame, takeToProgram } from './compositor';
 import { applyTheme } from './i18n.svelte';
 import { appAudio, received, startAppAudio, stopAppAudio } from './appaudio.svelte';
 import type { Mixer } from './mixer';
import { id, makeLayer, persist, studio } from './state.svelte';

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

export async function runSelftest(target: string, canvas: () => HTMLCanvasElement | null, audio: () => MediaStreamTrack | undefined) {
	await say(`SELFTEST target=${target}`);

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
