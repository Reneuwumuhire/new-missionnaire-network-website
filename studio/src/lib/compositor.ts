// The program canvas. This canvas IS the broadcast: captureStream() on it is
// what MediaRecorder encodes, so anything drawn here reaches both the app and
// YouTube. Switching scenes only changes what the next frame draws, which is
// why a scene change never interrupts the encoder or the RTMP connections.

import { drawBox, toPixels, type Rect } from './geom';
import { handleFor } from './media.svelte';
import { onAirLines } from './lyrics.svelte';
import { activeScene, studio, type Layer, type TextStyle } from './state.svelte';
import { DEFAULT_TEXT_STYLE } from './state.svelte';

export interface Transition {
	fromSceneId: string;
	startedAt: number;
	durationMs: number;
}

let transition: Transition | null = null;
let frames = 0;

/** Diagnostics only: frames the compositor has actually painted. */
export const frameCount = () => frames;

export function beginTransition(fromSceneId: string, durationMs: number) {
	if (durationMs <= 0 || fromSceneId === studio.activeSceneId) {
		transition = null;
		return;
	}
	transition = { fromSceneId, startedAt: performance.now(), durationMs };
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

export function renderFrame(ctx: CanvasRenderingContext2D, nowMs = Date.now()) {
	frames++;
	ctx.save();
	ctx.fillStyle = '#000000';
	ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

	const active = activeScene();
	if (transition) {
		const t = (performance.now() - transition.startedAt) / transition.durationMs;
		if (t >= 1) {
			transition = null;
		} else {
			drawScene(ctx, transition.fromSceneId, nowMs);
			ctx.globalAlpha = t;
			drawScene(ctx, active.id, nowMs);
			ctx.globalAlpha = 1;
			ctx.restore();
			return;
		}
	}
	drawScene(ctx, active.id, nowMs);
	ctx.restore();
}

/** Drives renderFrame at the configured fps. Returns a stop function.
 *
 *  WebKit stops requestAnimationFrame outright once the page is hidden, so the
 *  loop falls back to a timer — which WebKit throttles to about 1 Hz, but a
 *  stuttering picture beats a frozen one. macOS window-occlusion detection is
 *  disabled at startup (see src-tauri/src/lib.rs) so merely covering the window
 *  does not count as hidden; minimising it still does. */
export function startRenderLoop(canvas: HTMLCanvasElement, fps: () => number): () => void {
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
			last = now;
			renderFrame(ctx);
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
