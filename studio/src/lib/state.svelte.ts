// The whole show's state. Scenes and layers are plain serialisable data — the
// live objects they point at (MediaStream, <video>, <img>) live in media.ts,
// keyed by layer id, because putting them in a reactive proxy breaks them.

import type { FitMode, Rect } from './geom';
import { FULL_FRAME } from './geom';
import { t } from './i18n.svelte';
import { DEFAULT_LAYOUT, type Layout } from './layout';

export type LayerKind = 'camera' | 'screen' | 'image' | 'video' | 'text' | 'lyrics' | 'color';

export interface TextStyle {
	size: number; // fraction of canvas height
	color: string;
	weight: number;
	align: 'left' | 'center' | 'right';
	valign: 'top' | 'middle' | 'bottom';
	background: string; // css colour, or 'transparent'
	shadow: boolean;
	uppercase: boolean;
	lineHeight: number;
	font: 'body' | 'display';
}

export const DEFAULT_TEXT_STYLE: TextStyle = {
	size: 0.07,
	color: '#FFFFFF',
	weight: 600,
	align: 'center',
	valign: 'bottom',
	background: 'rgba(0,0,0,0.55)',
	shadow: true,
	uppercase: false,
	lineHeight: 1.25,
	font: 'body'
};

export interface Layer {
	id: string;
	/** Runtime-only handle pinned by a Program snapshot. Never persisted on the
	 * editable scene; reconnecting the source must not replace what is on air. */
	mediaHandleId?: string | null;
	name: string;
	kind: LayerKind;
	visible: boolean;
	locked: boolean;
	rect: Rect;
	opacity: number;
	fit: FitMode;
	/** camera / screen: which device. Empty = system default. */
	deviceId?: string;
	/** screen: the application whose own audio stands in for the share's sound,
	 *  because the engine hands a window over without any. Same field, same
	 *  meaning as on an `app` audio source. */
	appId?: string;
	/** screen: leave the mouse pointer out of the shared window, where the
	 *  engine lets us ask. */
	hideCursor?: boolean;
	/** text / lyrics content, or the flat colour for `color`. */
	text?: string;
	color?: string;
	style?: TextStyle;
	/** lyrics: also draw the upcoming line, dimmed. */
	showNext?: boolean;
	/** Audio-bearing layers (camera, screen, video). */
	hasAudio: boolean;
	gain: number;
	muted: boolean;
	/** video: the file is a recording with no picture. It still carries sound
	 *  into the mix, but it is not a video source that has failed to draw. */
	audioOnly?: boolean;
	/** Display-only: the file the operator picked. Blobs cannot be persisted,
	 *  so after a restart the layer asks for the file again. */
	fileName?: string;
	/** The page this source was added from, for a streamed one. Kept so
	 *  Reconnect can resolve it again rather than asking for it back: the signed
	 *  media address behind it expires after a few hours, so re-resolving is the
	 *  only thing that ever works — and it is exactly what the operator would
	 *  have to do by hand. */
	url?: string;
	/** A live page opened and captured as a dedicated window. Unlike a fetched
	 * clip, reconnecting this source reopens the page and the OS window picker. */
	youtubeLiveUrl?: string;
	/** Seconds, from the link itself, for a streamed source. WebKit reads
	 *  YouTube's audio-only container as exactly twice its real length —
	 *  measured at 38.1 s for a 19.0 s clip and 1269.2 s for a 635.0 s one — so
	 *  the element cannot be asked how long the track is. Its currentTime is
	 *  right and seeking lands where it should; only the total is invented. */
	duration?: number;
}

export interface Scene {
	id: string;
	name: string;
	layers: Layer[]; // index 0 is the TOP layer, like OBS
}

export function snapshotScene(scene: Scene, freezeDisconnectedMedia = false): Scene {
	const snapshot = structuredClone($state.snapshot(scene)) as Scene;
	if (freezeDisconnectedMedia) {
		for (const layer of snapshot.layers) {
			if (['camera', 'screen', 'image', 'video'].includes(layer.kind)) {
				layer.mediaHandleId = null;
			}
		}
	}
	return snapshot;
}

/** Microphones are global, not per-scene: the preacher must stay audible
 *  through every scene change. Layer audio (camera / screen / video file) is
 *  scene-scoped and stops when you switch away, which is what you want. */
export interface AudioSource {
	id: string;
	name: string;
	/** `input` is a capture device; `app` is another application's own output,
	 *  captured natively because the browser engine cannot. */
	kind: 'input' | 'app';
	deviceId?: string;
	/** Bundle identifier of the captured application, for `app` sources. */
	appId?: string;
	gain: number;
	muted: boolean;
}

export interface Destination {
	id: string;
	name: string;
	url: string;
	key: string;
	enabled: boolean;
	platform?: 'missionnaire' | 'youtube' | 'facebook' | 'custom';
	/** Managed YouTube credentials come from OAuth and never belong in saved
	 *  frontend settings. Manual RTMP destinations always leave this false. */
	managed?: boolean;
	/** Hold this one back until the operator presses Go Live, rather than
	 *  connecting it with Start Streaming. Nothing reaches the service at all
	 *  until then, so a platform that auto-publishes on first frame — which is
	 *  what YouTube's default stream key does — cannot jump the gun. */
	hold: boolean;
}

export function destinationPlatform(
	destination: Pick<Destination, 'name' | 'url' | 'platform'>
): NonNullable<Destination['platform']> {
	if (destination.platform) return destination.platform;
	if (/youtube/i.test(destination.name) || /youtube/i.test(destination.url)) return 'youtube';
	if (/facebook/i.test(destination.name) || /facebook/i.test(destination.url)) return 'facebook';
	if (/missionnaire/i.test(destination.name) || /missionnaire/i.test(destination.url))
		return 'missionnaire';
	return 'custom';
}

export function migrateDestination(destination: Destination): Destination {
	const platform = destinationPlatform(destination);
	const managed = platform === 'youtube' && destination.managed === true;
	return {
		...destination,
		platform,
		managed,
		key: managed ? '' : destination.key,
		enabled: managed ? false : destination.enabled,
		hold: platform === 'youtube' ? false : (destination.hold ?? false)
	};
}

export function requiresYouTubeGoLive(destinations: Destination[], isTest = false): boolean {
	return (
		!isTest &&
		destinations.some(
			(destination) =>
				destination.enabled &&
				destinationPlatform(destination) === 'youtube' &&
				destination.managed !== false
		)
	);
}

export interface Settings {
	mainSiteUrl: string;
	adminSiteUrl: string;
	width: number;
	height: number;
	fps: number;
	videoBitrateKbps: number;
	audioBitrateKbps: number;
	encoder: 'hardware' | 'software';
	/** Kept apart from the duration on purpose: switching to Cut and back used
	 *  to throw away whatever duration the operator had chosen. */
	transitionType: 'fade' | 'cut' | 'fadeToBlack';
	transitionMs: number;
	/** Show colour bars when a scene's video sources produce nothing. */
	barsWhenNoSource: boolean;
	/** OBS's Studio Mode: edit a scene on the left while a different one stays
	 *  on air on the right, then cut to it deliberately. */
	studioMode: boolean;
	monitorAudio: boolean;
	/** Panel sizes the operator has dragged to. */
	layout: Layout;
	recordingMode: 'off' | 'local' | 'cloud' | 'both';
}

export const DEFAULT_SETTINGS: Settings = {
	mainSiteUrl: 'https://www.missionnaire.net',
	adminSiteUrl: 'https://admin.missionnaire.net',
	width: 1280,
	height: 720,
	fps: 30,
	videoBitrateKbps: 3500,
	audioBitrateKbps: 160,
	encoder: 'hardware',
	transitionType: 'fade',
	transitionMs: 350,
	barsWhenNoSource: true,
	studioMode: false,
	monitorAudio: false,
	layout: DEFAULT_LAYOUT,
	recordingMode: 'off'
};

export const id = () => Math.random().toString(36).slice(2, 10);

/** How a source that lost its media gets it back.
 *
 *  A link has no file to pick: it is re-resolved from the page it came from,
 *  because the signed address behind it has expired. Sending the operator to
 *  the file picker for one asks them to find something that never existed on
 *  this machine. */
export function reconnectWith(layer: Layer): 'camera' | 'screen' | 'link' | 'file' {
	if (layer.kind === 'camera') return 'camera';
	if (layer.kind === 'screen') return 'screen';
	return layer.url ? 'link' : 'file';
}

export function makeLayer(kind: LayerKind, name: string, patch: Partial<Layer> = {}): Layer {
	const audioKinds: LayerKind[] = ['camera', 'screen', 'video'];
	return {
		id: id(),
		name,
		kind,
		visible: true,
		locked: false,
		rect: { ...FULL_FRAME },
		opacity: 1,
		fit: 'cover',
		hasAudio: audioKinds.includes(kind),
		gain: 1,
		// Not muted: adding a screen or media source is asking for its sound. A
		// source that arrives silent for no stated reason is worse than a loud one.
		muted: false,
		...patch
	};
}

function starterScenes(): Scene[] {
	return [
		{
			id: id(),
			name: t('scenes.starterLive'),
			layers: [
				makeLayer('lyrics', t('lyrics.starterLayer'), {
					rect: { x: 0.06, y: 0.7, w: 0.88, h: 0.24 },
					fit: 'contain',
					showNext: true,
					style: { ...DEFAULT_TEXT_STYLE }
				}),
				makeLayer('camera', t('sources.camera')),
				makeLayer('color', t('sources.starterBackground'), { color: '#0B0B0D' })
			]
		},
		{
			id: id(),
			name: t('scenes.starterScreen'),
			layers: [
				makeLayer('screen', t('sources.screen'), { fit: 'contain' }),
				makeLayer('color', t('sources.starterBackground'), { color: '#0B0B0D' })
			]
		},
		{
			id: id(),
			name: t('scenes.starterBreak'),
			layers: [
				makeLayer('text', t('sources.starterMessage'), {
					text: t('sources.starterBreakText'),
					rect: { x: 0.1, y: 0.4, w: 0.8, h: 0.2 },
					style: { ...DEFAULT_TEXT_STYLE, valign: 'middle', background: 'transparent', size: 0.08 }
				}),
				makeLayer('color', t('sources.starterBackground'), { color: '#111114' })
			]
		}
	];
}

const STORE_KEY = 'missionnaire-studio-v1';

interface Persisted {
	scenes: Scene[];
	activeSceneId: string;
	programSceneId: string;
	audioSources: AudioSource[];
	destinations: Destination[];
	settings: Settings;
}

/** Ids have to be unique or the docks take the whole app down with them: a
 *  keyed `{#each}` throws on a duplicate key, and a throw during render is a
 *  black window with nothing on the terminal. A saved file can hold anything —
 *  a session that was killed mid-write, two machines syncing the same folder —
 *  so the last thing read wins and the rest are dropped. */
export function uniqueById<T extends { id?: string }>(items: T[] | undefined): T[] {
	const seen = new Set<string>();
	return (items ?? []).filter((item) => {
		if (!item || typeof item.id !== 'string' || seen.has(item.id)) return false;
		seen.add(item.id);
		return true;
	});
}

function load(): Persisted {
	const scenes = starterScenes();
	const fallback: Persisted = {
		scenes,
		activeSceneId: scenes[0].id,
		programSceneId: scenes[0].id,
		audioSources: [{ id: id(), name: t('mixer.starterMic'), kind: 'input', gain: 1, muted: false }],
		destinations: [
			{
				id: id(),
				name: t('stream.presetMissionnaire'),
				url: 'rtmp://localhost:1935/live',
				key: 'obs',
				enabled: true,
				platform: 'missionnaire',
				managed: false,
				hold: false
			},
			{
				id: id(),
				// YouTube receives the preflight signal. Keep Auto-start disabled in
				// YouTube so viewers do not see it before its own Go Live action.
				name: 'YouTube',
				url: 'rtmp://a.rtmp.youtube.com/live2',
				key: '',
				enabled: false,
				platform: 'youtube',
				managed: true,
				hold: false
			}
		],
		settings: {
			...DEFAULT_SETTINGS,
			layout: { ...DEFAULT_LAYOUT, weights: { ...DEFAULT_LAYOUT.weights } }
		}
	};
	try {
		const raw = localStorage.getItem(STORE_KEY);
		if (!raw) return fallback;
		const parsed = JSON.parse(raw) as Partial<Persisted>;
		if (!parsed.scenes?.length) return fallback;
		// Recorder credentials from early Studio builds must never survive in
		// app storage. Cloud recording is now authorized and proxied by admin.
		const saved = (parsed.settings ?? {}) as Partial<Settings> & {
			recorderUrl?: string;
			recorderToken?: string;
			adminUrl?: string;
			adminToken?: string;
		};
		const {
			recorderUrl: _recorderUrl,
			recorderToken: _recorderToken,
			adminUrl: _adminUrl,
			adminToken: _adminToken,
			...savedSettings
		} = saved;
		if (
			_recorderUrl !== undefined ||
			_recorderToken !== undefined ||
			_adminUrl !== undefined ||
			_adminToken !== undefined
		) {
			try {
				localStorage.setItem(STORE_KEY, JSON.stringify({ ...parsed, settings: savedSettings }));
			} catch {
				// The sanitized in-memory state is still safe and usable on a full disk.
			}
		}
		return {
			scenes: uniqueById(parsed.scenes).map((scene) => ({
				...scene,
				layers: uniqueById(scene.layers)
			})),
			activeSceneId: parsed.activeSceneId ?? parsed.scenes[0].id,
			programSceneId: parsed.programSceneId ?? parsed.activeSceneId ?? parsed.scenes[0].id,
			// `kind` arrived after the first shows were saved; anything without one
			// is a capture device.
			audioSources: uniqueById(parsed.audioSources ?? fallback.audioSources).map((source) => ({
				...source,
				kind: source.kind ?? 'input'
			})),
			// YouTube must receive the preflight signal so the operator can inspect
			// it in Live Control Room before opening the public site gate.
			destinations: uniqueById(parsed.destinations ?? fallback.destinations).map(
				migrateDestination
			),
			// Merge, so a setting added in a later version gets its default
			// instead of `undefined` reaching ffmpeg. Layout is merged a level
			// deeper for the same reason — a new dock must get a weight.
			settings: {
				...DEFAULT_SETTINGS,
				...savedSettings,
				mainSiteUrl: (saved.mainSiteUrl ?? DEFAULT_SETTINGS.mainSiteUrl).replace(
					/^https:\/\/missionnaire\.net\/?$/,
					'https://www.missionnaire.net'
				),
				adminSiteUrl: (saved.adminSiteUrl ?? DEFAULT_SETTINGS.adminSiteUrl).replace(
					/^https:\/\/www\.admin\.missionnaire\.net\/?$/,
					'https://admin.missionnaire.net'
				),
				layout: {
					...DEFAULT_LAYOUT,
					...saved.layout,
					weights: { ...DEFAULT_LAYOUT.weights, ...saved.layout?.weights }
				}
			}
		};
	} catch {
		return fallback;
	}
}

const initial = load();

export const studio = $state({
	scenes: initial.scenes,
	/** The scene being edited — what the Sources dock and the left preview show. */
	activeSceneId: initial.activeSceneId,
	/** The scene actually going out. Same as activeSceneId unless Studio Mode
	 *  is on; this is the one the program canvas paints and the encoder sees. */
	programSceneId: initial.programSceneId,
	/** Frozen layer settings and media generations for Program while Studio
	 *  Mode edits or reconnects the source. */
	programSceneSnapshot: snapshotScene(
		initial.scenes.find((scene) => scene.id === initial.programSceneId) ?? initial.scenes[0],
		true
	) as Scene | null,
	selectedLayerId: null as string | null,
	audioSources: initial.audioSources,
	destinations: initial.destinations,
	settings: initial.settings
});

export function persistableDestinations(destinations: Destination[]): Destination[] {
	return destinations.map((destination) =>
		destination.managed ? { ...destination, key: '', enabled: false } : destination
	);
}

export function persist() {
	try {
		localStorage.setItem(
			STORE_KEY,
			JSON.stringify({
				scenes: studio.scenes,
				activeSceneId: studio.activeSceneId,
				programSceneId: studio.programSceneId,
				audioSources: studio.audioSources,
				destinations: persistableDestinations(studio.destinations),
				settings: studio.settings
			})
		);
	} catch {
		// A full disk must not take the broadcast down.
	}
}

/** Add a capture device to the mixer. Audio sources are global on purpose —
 *  they are added from either dock and belong to the show, not to a scene. */
export function addAudioInput(): AudioSource {
	const source: AudioSource = {
		id: id(),
		name: t('mixer.micName', { number: studio.audioSources.length + 1 }),
		kind: 'input',
		gain: 1,
		muted: false
	};
	studio.audioSources = [...studio.audioSources, source];
	persist();
	return source;
}

/** Add an application's own output to the mixer, already named and ready to
 *  capture — the strip picks it up from `appId`. */
export function addAppAudio(appId: string, name: string): AudioSource {
	const source: AudioSource = { id: id(), name, kind: 'app', appId, gain: 1, muted: false };
	studio.audioSources = [...studio.audioSources, source];
	persist();
	return source;
}

/** The settings a dialog may stage and apply as a set. The layout is left out
 *  on purpose: the splitters write to it while the dialog is open, so applying
 *  a copy taken when it opened would undo whatever was dragged in the meantime. */
export function stageableSettings(from: Settings): Omit<Settings, 'layout'> {
	const { layout: _live, ...rest } = $state.snapshot(from) as Settings;
	return rest;
}

export function activeScene(): Scene {
	return studio.scenes.find((s) => s.id === studio.activeSceneId) ?? studio.scenes[0];
}

/** The scene actually going out. Outside Studio Mode the edit scene IS the
 *  program scene — deriving that rather than storing it twice means the two can
 *  never drift, which they did: leaving Studio Mode left a stale programSceneId
 *  painting one scene while the docks edited another. */
export function onAirSceneId(): string {
	return studio.settings.studioMode ? studio.programSceneId : studio.activeSceneId;
}

export function programScene(): Scene {
	if (studio.settings.studioMode && studio.programSceneSnapshot) {
		return studio.programSceneSnapshot;
	}
	return studio.scenes.find((s) => s.id === onAirSceneId()) ?? activeScene();
}

export function selectedLayer(): Layer | null {
	return activeScene().layers.find((l) => l.id === studio.selectedLayerId) ?? null;
}

/** The layers that get a mixer strip.
 *
 *  Audio-bearing layers of the scene currently ON AIR — the program scene, not
 *  the one being edited, so setting up a scene in Studio Mode does not push its
 *  audio out over the live one.
 *
 *  Plus every window capturing an application, whatever scene it sits in: that
 *  sound belongs to the application, not to the scene, and cutting to a slide
 *  must not stop the music. Its picture still comes and goes with its scene —
 *  only the sound carries. The eye icon remains the way to silence it. */
export function audioLayers(): Layer[] {
	const strips = new Map<string, Layer>();
	for (const layer of programScene().layers) {
		if (layer.hasAudio && layer.visible) strips.set(layer.id, layer);
	}
	for (const scene of studio.scenes) {
		for (const layer of scene.layers) {
			if (layer.appId && layer.visible) strips.set(layer.id, layer);
		}
	}
	return [...strips.values()];
}

/** Full ingest URL for a destination. Slashes are normalised because operators
 *  paste both `rtmp://host/live` and `rtmp://host/live/`. */
export function destinationUrl(d: Destination): string {
	const base = d.url.trim().replace(/\/+$/, '');
	const key = d.key.trim().replace(/^\/+/, '');
	return key ? `${base}/${key}` : base;
}
