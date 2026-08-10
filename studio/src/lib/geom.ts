// Layer geometry. Rects are stored normalised (0..1 of the canvas) so a scene
// laid out at 720p still looks right when the operator switches the broadcast
// to 1080p mid-week.

export interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}

export type FitMode = 'cover' | 'contain' | 'stretch';

export interface DrawBox {
	sx: number;
	sy: number;
	sw: number;
	sh: number;
	dx: number;
	dy: number;
	dw: number;
	dh: number;
}

export const FULL_FRAME: Rect = { x: 0, y: 0, w: 1, h: 1 };

export function toPixels(rect: Rect, canvasW: number, canvasH: number): Rect {
	return {
		x: rect.x * canvasW,
		y: rect.y * canvasH,
		w: rect.w * canvasW,
		h: rect.h * canvasH
	};
}

/** Source crop + destination box for drawImage. `cover` crops the source
 *  (no bars, no distortion), `contain` letterboxes, `stretch` distorts. */
export function drawBox(srcW: number, srcH: number, dst: Rect, mode: FitMode): DrawBox {
	if (srcW <= 0 || srcH <= 0 || dst.w <= 0 || dst.h <= 0) {
		return { sx: 0, sy: 0, sw: Math.max(srcW, 1), sh: Math.max(srcH, 1), dx: dst.x, dy: dst.y, dw: 0, dh: 0 };
	}
	if (mode === 'stretch') {
		return { sx: 0, sy: 0, sw: srcW, sh: srcH, dx: dst.x, dy: dst.y, dw: dst.w, dh: dst.h };
	}
	if (mode === 'cover') {
		const scale = Math.max(dst.w / srcW, dst.h / srcH);
		const sw = dst.w / scale;
		const sh = dst.h / scale;
		return {
			sx: (srcW - sw) / 2,
			sy: (srcH - sh) / 2,
			sw,
			sh,
			dx: dst.x,
			dy: dst.y,
			dw: dst.w,
			dh: dst.h
		};
	}
	const scale = Math.min(dst.w / srcW, dst.h / srcH);
	const dw = srcW * scale;
	const dh = srcH * scale;
	return {
		sx: 0,
		sy: 0,
		sw: srcW,
		sh: srcH,
		dx: dst.x + (dst.w - dw) / 2,
		dy: dst.y + (dst.h - dh) / 2,
		dw,
		dh
	};
}

export type Handle = 'move' | 'nw' | 'ne' | 'sw' | 'se';

/** Which grab handle (if any) sits under a normalised point. Handles are sized
 *  in canvas-relative terms so they stay grabbable on a small preview. */
export function hitHandle(rect: Rect, px: number, py: number, tolerance = 0.02): Handle | null {
	const corners: [Handle, number, number][] = [
		['nw', rect.x, rect.y],
		['ne', rect.x + rect.w, rect.y],
		['sw', rect.x, rect.y + rect.h],
		['se', rect.x + rect.w, rect.y + rect.h]
	];
	for (const [handle, cx, cy] of corners) {
		if (Math.abs(px - cx) <= tolerance && Math.abs(py - cy) <= tolerance) return handle;
	}
	const inside = px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h;
	return inside ? 'move' : null;
}

const MIN_SIZE = 0.03;

/** Apply a drag. Resizing keeps the opposite corner pinned; a layer can be
 *  dragged partly off-frame (that's a legitimate look) but never inverted or
 *  shrunk to nothing, which would make it unselectable. */
export function applyDrag(rect: Rect, handle: Handle, dx: number, dy: number): Rect {
	if (handle === 'move') {
		return { ...rect, x: rect.x + dx, y: rect.y + dy };
	}
	const right = rect.x + rect.w;
	const bottom = rect.y + rect.h;
	let { x, y } = rect;
	let w = rect.w;
	let h = rect.h;

	if (handle === 'nw' || handle === 'sw') {
		x = Math.min(rect.x + dx, right - MIN_SIZE);
		w = right - x;
	} else {
		w = Math.max(MIN_SIZE, rect.w + dx);
	}
	if (handle === 'nw' || handle === 'ne') {
		y = Math.min(rect.y + dy, bottom - MIN_SIZE);
		h = bottom - y;
	} else {
		h = Math.max(MIN_SIZE, rect.h + dy);
	}
	return { x, y, w, h };
}

/** Centre a rect of the given aspect inside the frame at `scale` of its width.
 *  Used when a source is added, so it lands looking deliberate. */
export function centeredRect(aspect: number, frameAspect: number, scale = 1): Rect {
	const w = scale;
	const h = (scale * frameAspect) / aspect;
	return { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
}
