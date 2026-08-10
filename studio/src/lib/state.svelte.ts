// The whole show's state. Scenes and layers are plain serialisable data — the
// live objects they point at (MediaStream, <video>, <img>) live in media.ts,
// keyed by layer id, because putting them in a reactive proxy breaks them.

import type { FitMode, Rect } from './geom';
import { FULL_FRAME } from './geom';

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
	name: string;
	kind: LayerKind;
	visible: boolean;
	locked: boolean;
	rect: Rect;
	opacity: number;
	fit: FitMode;
	/** camera / screen: which device. Empty = system default. */
	deviceId?: string;
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
	/** Display-only: the file the operator picked. Blobs cannot be persisted,
	 *  so after a restart the layer asks for the file again. */
	fileName?: string;
}

export interface Scene {
	id: string;
	name: string;
	layers: Layer[]; // index 0 is the TOP layer, like OBS
}

/** Microphones are global, not per-scene: the preacher must stay audible
 *  through every scene change. Layer audio (camera / screen / video file) is
 *  scene-scoped and stops when you switch away, which is what you want. */
export interface AudioSource {
	id: string;
	name: string;
	deviceId?: string;
	gain: number;
	muted: boolean;
}

export interface Destination {
	id: string;
	name: string;
	url: string;
	key: string;
	enabled: boolean;
}

export interface Settings {
	width: number;
	height: number;
	fps: number;
	videoBitrateKbps: number;
	audioBitrateKbps: number;
	encoder: 'hardware' | 'software';
	transitionMs: number;
	/** OBS's Studio Mode: edit a scene on the left while a different one stays
	 *  on air on the right, then cut to it deliberately. */
	studioMode: boolean;
	monitorAudio: boolean;
	/** Admin panel base URL + shared token, for driving Go Live and the live
	 *  transcript from here instead of a second browser tab. Optional. */
	adminUrl: string;
	adminToken: string;
}

export const DEFAULT_SETTINGS: Settings = {
	width: 1280,
	height: 720,
	fps: 30,
	videoBitrateKbps: 3500,
	audioBitrateKbps: 160,
	encoder: 'hardware',
	transitionMs: 350,
	studioMode: false,
	monitorAudio: false,
	adminUrl: '',
	adminToken: ''
};

export const id = () => Math.random().toString(36).slice(2, 10);

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
		muted: kind === 'screen', // desktop audio surprises people mid-service
		...patch
	};
}

function starterScenes(): Scene[] {
	return [
		{
			id: id(),
			name: 'Direct',
			layers: [
				makeLayer('lyrics', 'Paroles', {
					rect: { x: 0.06, y: 0.7, w: 0.88, h: 0.24 },
					fit: 'contain',
					showNext: true,
					style: { ...DEFAULT_TEXT_STYLE }
				}),
				makeLayer('camera', 'Caméra'),
				makeLayer('color', 'Fond', { color: '#0B0B0D' })
			]
		},
		{
			id: id(),
			name: 'Écran',
			layers: [
				makeLayer('screen', 'Partage écran', { fit: 'contain' }),
				makeLayer('color', 'Fond', { color: '#0B0B0D' })
			]
		},
		{
			id: id(),
			name: 'Pause',
			layers: [
				makeLayer('text', 'Message', {
					text: 'Le direct reprend dans un instant',
					rect: { x: 0.1, y: 0.4, w: 0.8, h: 0.2 },
					style: { ...DEFAULT_TEXT_STYLE, valign: 'middle', background: 'transparent', size: 0.08 }
				}),
				makeLayer('color', 'Fond', { color: '#111114' })
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

function load(): Persisted {
	const scenes = starterScenes();
	const fallback: Persisted = {
		scenes,
		activeSceneId: scenes[0].id,
		programSceneId: scenes[0].id,
		audioSources: [{ id: id(), name: 'Micro', gain: 1, muted: false }],
		destinations: [
			{
				id: id(),
				name: 'Missionnaire (app + radio)',
				url: 'rtmp://localhost:1935/live',
				key: 'obs',
				enabled: true
			},
			{
				id: id(),
				name: 'YouTube',
				url: 'rtmp://a.rtmp.youtube.com/live2',
				key: '',
				enabled: false
			}
		],
		settings: { ...DEFAULT_SETTINGS }
	};
	try {
		const raw = localStorage.getItem(STORE_KEY);
		if (!raw) return fallback;
		const parsed = JSON.parse(raw) as Partial<Persisted>;
		if (!parsed.scenes?.length) return fallback;
		return {
			scenes: parsed.scenes,
			activeSceneId: parsed.activeSceneId ?? parsed.scenes[0].id,
			programSceneId: parsed.programSceneId ?? parsed.activeSceneId ?? parsed.scenes[0].id,
			audioSources: parsed.audioSources ?? fallback.audioSources,
			destinations: parsed.destinations ?? fallback.destinations,
			// Merge, so a setting added in a later version gets its default
			// instead of `undefined` reaching ffmpeg.
			settings: { ...DEFAULT_SETTINGS, ...parsed.settings }
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
	selectedLayerId: null as string | null,
	audioSources: initial.audioSources,
	destinations: initial.destinations,
	settings: initial.settings
});

export function persist() {
	try {
		localStorage.setItem(
			STORE_KEY,
			JSON.stringify({
				scenes: studio.scenes,
				activeSceneId: studio.activeSceneId,
				programSceneId: studio.programSceneId,
				audioSources: studio.audioSources,
				destinations: studio.destinations,
				settings: studio.settings
			})
		);
	} catch {
		// A full disk must not take the broadcast down.
	}
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
	return studio.scenes.find((s) => s.id === onAirSceneId()) ?? activeScene();
}

export function selectedLayer(): Layer | null {
	return activeScene().layers.find((l) => l.id === studio.selectedLayerId) ?? null;
}

/** Audio-bearing layers of the scene currently ON AIR — the program scene, not
 *  the one being edited. Setting up a scene in Studio Mode must not push its
 *  audio out over the live one. */
export function liveAudioLayers(): Layer[] {
	return programScene().layers.filter((l) => l.hasAudio && l.visible);
}

/** Full ingest URL for a destination. Slashes are normalised because operators
 *  paste both `rtmp://host/live` and `rtmp://host/live/`. */
export function destinationUrl(d: Destination): string {
	const base = d.url.trim().replace(/\/+$/, '');
	const key = d.key.trim().replace(/^\/+/, '');
	return key ? `${base}/${key}` : base;
}
