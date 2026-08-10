// The program canvas. This canvas IS the broadcast: captureStream() on it is
// what MediaRecorder encodes, so anything drawn here reaches both the app and
// YouTube. Switching scenes only changes what the next frame draws, which is
// why a scene change never interrupts the encoder or the RTMP connections.

import { drawBox, toPixels, type Rect } from './geom';
import { handleFor } from './media.svelte';
import { onAirLines } from './lyrics.svelte';
import { onAirSceneId, persist, studio, type Layer, type TextStyle } from './state.svelte';
import { DEFAULT_TEXT_STYLE } from './state.svelte';

export type TransitionType = 'cut' | 'fade' | 'fadeToBlack';

export interface TransitionPlan {
	fromSceneId: string;
	durationMs: number;
	type: TransitionType;
}

export interface Transition extends TransitionPlan {
	startedAt: number;
}

let transition: Transition | null = null;
let frames = 0;

/** Diagnostics only: frames the compositor has actually painted. */
export const frameCount = () => frames;

/** Whether a scene change should fade, and for how long. Null means cut.
 *  Pure, so the decision can be tested without a canvas. */
export function transitionPlan(
	from: string,
	to: string,
	type: TransitionType,
	durationMs: number
): TransitionPlan | null {
	if (type === 'cut' || durationMs <= 0) return null;
	// Re-taking the scene already on air is a no-op, not a fade to itself.
	if (from === to) return null;
	return { fromSceneId: from, durationMs, type };
}

/** Put a scene on air, fading from whatever was there. This is the only way
 *  the program scene should ever change — it is what the encoder is reading.
 *  Returns the plan it made, which is what makes the behaviour testable. */
export function takeToProgram(
	sceneId: string,
	durationMs = studio.settings.transitionMs,
	from = onAirSceneId(),
	/** Quick-transition override: take with this instead of the configured one. */
	type: TransitionType = studio.settings.transitionType
): TransitionPlan | null {
	const plan = transitionPlan(from, sceneId, type, durationMs);
	studio.programSceneId = sceneId;
	transition = plan ? { ...plan, startedAt: performance.now() } : null;
	persist();
	return plan;
}

/** Select a scene for editing. Outside Studio Mode that also puts it on air —
 *  which is exactly how OBS behaves with Studio Mode off. */
export function selectScene(sceneId: string) {
	// Read what is on air BEFORE moving the edit selection: outside Studio Mode
	// the on-air scene IS the edit scene, so assigning first would make the
	// transition think it was already showing the new scene and cut instead.
	const from = onAirSceneId();
	studio.activeSceneId = sceneId;
	studio.selectedLayerId = null;
	if (!studio.settings.studioMode) takeToProgram(sceneId, studio.settings.transitionMs, from);
	else persist();
}

const FONTS = {
	body: "'Outfit', system-ui, -apple-system, sans-serif",
	display: "'Cormorant Garamond', Georgia, serif"
};

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
	const out: string[] = [];
	// Respect the operator's own line breaks first — a lyric sheet's line
	// endings are a deliberate choice, not an accident of width.
	for (const paragraph of text.split('\n')) {
		const words = paragraph.split(/\s+/).filter(Boolean);
		if (words.length === 0) {
			out.push('');
			continue;
		}
		let line = words[0];
		for (let i = 1; i < words.length; i++) {
			const candidate = `${line} ${words[i]}`;
			if (ctx.measureText(candidate).width <= maxWidth) {
				line = candidate;
			} else {
				out.push(line);
				line = words[i];
			}
		}
		out.push(line);
	}
	return out;
}

interface TextBlock {
	text: string;
	alpha: number;
	scale: number;
}

function drawTextBlocks(
	ctx: CanvasRenderingContext2D,
	blocks: TextBlock[],
	box: Rect,
	style: TextStyle
) {
	const visible = blocks.filter((b) => b.text.trim().length > 0);
	if (visible.length === 0) return;

	const basePx = style.size * ctx.canvas.height;
	const padding = basePx * 0.45;
	const innerWidth = Math.max(10, box.w - padding * 2);

	// Lay out first, then paint: the background box has to be sized to the
	// wrapped text, and the text has to be positioned inside that box.
	const laid = visible.map((block) => {
		const px = basePx * block.scale;
		ctx.font = `${style.weight} ${px}px ${FONTS[style.font]}`;
		const content = style.uppercase ? block.text.toUpperCase() : block.text;
		const lines = wrap(ctx, content, innerWidth);
		return { ...block, px, lines, height: lines.length * px * style.lineHeight };
	});

	const totalHeight = laid.reduce((sum, b) => sum + b.height, 0) + padding * 2;
	let top: number;
	if (style.valign === 'top') top = box.y;
	else if (style.valign === 'middle') top = box.y + (box.h - totalHeight) / 2;
	else top = box.y + box.h - totalHeight;

	if (style.background !== 'transparent') {
		ctx.fillStyle = style.background;
		ctx.fillRect(box.x, top, box.w, totalHeight);
	}

	const x =
		style.align === 'left'
			? box.x + padding
			: style.align === 'right'
				? box.x + box.w - padding
				: box.x + box.w / 2;
	ctx.textAlign = style.align;
	ctx.textBaseline = 'top';

	let y = top + padding;
	for (const block of laid) {
		ctx.font = `${style.weight} ${block.px}px ${FONTS[style.font]}`;
		ctx.globalAlpha = block.alpha;
		for (const line of block.lines) {
			if (style.shadow) {
				// A stage is bright and a projector wall is not; the shadow is what
				// keeps white text readable over both.
				ctx.shadowColor = 'rgba(0,0,0,0.85)';
				ctx.shadowBlur = block.px * 0.18;
				ctx.shadowOffsetY = block.px * 0.04;
			}
			ctx.fillStyle = style.color;
			ctx.fillText(line, x, y);
			ctx.shadowColor = 'transparent';
			ctx.shadowBlur = 0;
			ctx.shadowOffsetY = 0;
			y += block.px * style.lineHeight;
		}
	}
	ctx.globalAlpha = 1;
}

function drawLayer(ctx: CanvasRenderingContext2D, layer: Layer, nowMs: number) {
	if (!layer.visible) return;
	const box = toPixels(layer.rect, ctx.canvas.width, ctx.canvas.height);
	ctx.globalAlpha = layer.opacity;

	if (layer.kind === 'color') {
		ctx.fillStyle = layer.color ?? '#000000';
		ctx.fillRect(box.x, box.y, box.w, box.h);
		ctx.globalAlpha = 1;
		return;
	}

	if (layer.kind === 'text' || layer.kind === 'lyrics') {
		const style = layer.style ?? DEFAULT_TEXT_STYLE;
		if (layer.kind === 'text') {
			drawTextBlocks(ctx, [{ text: layer.text ?? '', alpha: 1, scale: 1 }], box, style);
		} else {
			const { current, next } = onAirLines(nowMs);
			drawTextBlocks(
				ctx,
				[
					{ text: current, alpha: 1, scale: 1 },
					// The next line at 55% keeps a singer ahead of the beat without
					// competing with the line being sung.
					{ text: layer.showNext ? next : '', alpha: 0.55, scale: 0.72 }
				],
				box,
				style
			);
		}
		ctx.globalAlpha = 1;
		return;
	}

	const handle = handleFor(layer.id);
	const el = handle?.el;
	if (!el) {
		ctx.globalAlpha = 1;
		return;
	}
	const srcW = el instanceof HTMLVideoElement ? el.videoWidth : el.naturalWidth;
	const srcH = el instanceof HTMLVideoElement ? el.videoHeight : el.naturalHeight;
	// A camera that has not delivered its first frame reports 0×0; drawing it
	// throws in some engines and draws garbage in others.
	if (!srcW || !srcH) {
		ctx.globalAlpha = 1;
		return;
	}
	const d = drawBox(srcW, srcH, box, layer.fit);
	try {
		ctx.drawImage(el, d.sx, d.sy, d.sw, d.sh, d.dx, d.dy, d.dw, d.dh);
	} catch {
		// Source went away between the check and the draw — skip this frame.
	}
	ctx.globalAlpha = 1;
}

function drawScene(ctx: CanvasRenderingContext2D, sceneId: string, nowMs: number) {
	const scene = studio.scenes.find((s) => s.id === sceneId);
	if (!scene) return;
	// Index 0 is the top layer (OBS order), so paint back to front.
	for (let i = scene.layers.length - 1; i >= 0; i--) {
		drawLayer(ctx, scene.layers[i], nowMs);
	}
}

/** Scratch canvas for cross-fades. The incoming scene has to be composited
 *  whole before it is faded in: drawing its layers straight onto the program
 *  canvas at a reduced alpha does not work, because every layer sets its own
 *  globalAlpha and wipes the transition's. It also looks wrong — you would see
 *  each layer of the new scene through the others instead of one picture
 *  dissolving into another. */
let scratch: HTMLCanvasElement | null = null;

function scratchContext(width: number, height: number): CanvasRenderingContext2D | null {
	if (!scratch) scratch = document.createElement('canvas');
	if (scratch.width !== width || scratch.height !== height) {
		scratch.width = width;
		scratch.height = height;
	}
	const context = scratch.getContext('2d');
	// Transparent, not black: filling black first would dip the fade through
	// a dark frame instead of dissolving cleanly.
	context?.clearRect(0, 0, width, height);
	return context;
}

/** Paint `sceneId` into `ctx`. `withTransition` is true only for the program
 *  canvas — the edit preview shows its scene outright, so the operator sees
 *  what they are building rather than a fade they did not ask for. */
export function renderFrame(
	ctx: CanvasRenderingContext2D,
	sceneId: string,
	withTransition: boolean,
	nowMs = Date.now()
) {
	frames++;
	ctx.save();
	ctx.fillStyle = '#000000';
	ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

	if (withTransition && transition) {
		const t = (performance.now() - transition.startedAt) / transition.durationMs;
		if (t >= 1) {
			transition = null;
		} else {
			const scene = scratchContext(ctx.canvas.width, ctx.canvas.height);
			if (!scene) {
				// No scratch context: cut rather than freeze the outgoing scene
				// for the length of the transition.
				drawScene(ctx, sceneId, nowMs);
			} else if (transition.type === 'fadeToBlack') {
				// Out to black over the first half, in from black over the second.
				// The canvas is already black, so only one scene is ever drawn.
				const first = t < 0.5;
				drawScene(scene, first ? transition.fromSceneId : sceneId, nowMs);
				ctx.globalAlpha = first ? 1 - t * 2 : (t - 0.5) * 2;
				ctx.drawImage(scene.canvas, 0, 0);
				ctx.globalAlpha = 1;
			} else {
				drawScene(ctx, transition.fromSceneId, nowMs);
				drawScene(scene, sceneId, nowMs);
				ctx.globalAlpha = t;
				ctx.drawImage(scene.canvas, 0, 0);
				ctx.globalAlpha = 1;
			}
			ctx.restore();
			return;
		}
	}
	drawScene(ctx, sceneId, nowMs);
	ctx.restore();
}

/** Drives renderFrame at the configured fps. Returns a stop function.
 *
 *  WebKit stops requestAnimationFrame outright once the page is hidden, so the
 *  loop falls back to a timer — which WebKit throttles to about 1 Hz, but a
 *  stuttering picture beats a frozen one. macOS window-occlusion detection is
 *  disabled at startup (see src-tauri/src/lib.rs) so merely covering the window
 *  does not count as hidden; minimising it still does. */
export function startRenderLoop(
	canvas: HTMLCanvasElement,
	sceneId: () => string,
	withTransition: boolean,
	fps: () => number
): () => void {
	const ctx = canvas.getContext('2d', { alpha: false });
	if (!ctx) throw new Error('Canvas 2D indisponible');
	let stopped = false;
	let rafId = 0;
	let timerId: ReturnType<typeof setTimeout> | undefined;
	let last = 0;

	const tick = (now: number) => {
		if (stopped) return;
		const interval = 1000 / Math.max(1, fps());
		if (now - last >= interval - 1) {
			// Carry the leftover instead of snapping to `now`: on a display whose
			// refresh is not a multiple of the target (100 Hz against 30 fps) the
			// error compounds and every render slips to the next tick — 25 fps
			// delivered for 30 asked. Keeping the phase averages out to the target.
			last = now - ((now - last) % interval);
			renderFrame(ctx, sceneId(), withTransition);
		}
		schedule();
	};

	function schedule() {
		if (stopped) return;
		if (document.visibilityState === 'hidden') {
			timerId = setTimeout(() => tick(performance.now()), 1000 / Math.max(1, fps()));
		} else {
			rafId = requestAnimationFrame(tick);
		}
	}

	schedule();
	const onVisibility = () => {
		cancelAnimationFrame(rafId);
		clearTimeout(timerId);
		schedule();
	};
	document.addEventListener('visibilitychange', onVisibility);

	return () => {
		stopped = true;
		cancelAnimationFrame(rafId);
		clearTimeout(timerId);
		document.removeEventListener('visibilitychange', onVisibility);
	};
}
