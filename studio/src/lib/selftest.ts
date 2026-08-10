// Launch-time smoke test, off unless STUDIO_SELFTEST holds an rtmp:// URL.
// It drives the real production path (program canvas → MediaRecorder → IPC →
// ffmpeg → RTMP) with a camera-free scene, so the chain can be verified on a
// machine with no camera permission and nobody at the keyboard.
//
//   STUDIO_SELFTEST=rtmp://127.0.0.1:1935/live/test pnpm studio

import { invoke } from '@tauri-apps/api/core';
import { broadcast, chunkCount, startBroadcast, stopBroadcast } from './broadcast.svelte';
import { frameCount } from './compositor';
import { studio } from './state.svelte';

const say = (line: string) => invoke('report', { line }).catch(() => console.log(line));
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function selftestTarget(): Promise<string | null> {
	return invoke<string | null>('selftest_target').catch(() => null);
}

export async function runSelftest(target: string, canvas: () => HTMLCanvasElement | null, audio: () => MediaStreamTrack | undefined) {
	await say(`SELFTEST target=${target}`);

	// A scene with no camera or screen source: nothing that would sit on an OS
	// permission prompt.
	const offline = studio.scenes.find(
		(scene) => !scene.layers.some((l) => l.kind === 'camera' || l.kind === 'screen')
	);
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
			`SELFTEST t=${i} wall=${Date.now() - t0}ms vis=${document.visibilityState} frames=${frameCount()} chunks=${chunkCount()} encoded=${st ? `${st.frames}f/${Math.round(st.bitrate_kbps)}kbps` : 'none'} err=${broadcast.error ?? '-'}`
		);
	}
	const stats = broadcast.stats;
	await say(
		stats
			? `SELFTEST stats frames=${stats.frames} fps=${stats.fps} bitrate=${stats.bitrate_kbps}kbps out=${stats.out_time_ms}ms dropped=${stats.dropped_frames} discarded=${stats.discarded_chunks} speed=${stats.speed}`
			: 'SELFTEST stats: aucune (ffmpeg n’a rien rapporté)'
	);
	if (broadcast.error) await say(`SELFTEST erreur: ${broadcast.error}`);
	for (const line of broadcast.log.slice(-8)) await say(`SELFTEST ffmpeg| ${line}`);

	await stopBroadcast();
	await wait(1200);
	const ok = Boolean(stats && stats.frames > 30 && !broadcast.error);
	await say(`SELFTEST ${ok ? 'OK' : 'FAIL'} — terminé`);
}
