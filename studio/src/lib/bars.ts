// SMPTE-style colour bars, drawn when a scene has a video source that is not
// producing a picture. Black looks identical to a dead encoder; bars say "the
// stream is alive, the camera is not" — which is the whole point of putting
// them up.

const TOP = ['#FFFFFF', '#FFFF00', '#00FFFF', '#00FF00', '#FF00FF', '#FF0000', '#0000FF'];
const MIDDLE = ['#0000FF', '#FF00FF', '#FFFF00', '#FF0000', '#00FFFF', '#000000', '#FFFFFF'];
/** Row heights as fractions of the frame: bars, mid band, gradients, steps. */
const ROWS = [0.65, 0.1, 0.125, 0.125];
const STEPS = 11;

export function drawColorBars(ctx: CanvasRenderingContext2D) {
	const { width: w, height: h } = ctx.canvas;
	const barW = w / TOP.length;
	let y = 0;

	const rowHeight = (index: number) => Math.round(h * ROWS[index]);

	// ── Seven primaries ──
	const h0 = rowHeight(0);
	TOP.forEach((colour, i) => {
		ctx.fillStyle = colour;
		ctx.fillRect(Math.round(i * barW), y, Math.ceil(barW), h0);
	});
	y += h0;

	// ── Reverse band ──
	const h1 = rowHeight(1);
	MIDDLE.forEach((colour, i) => {
		ctx.fillStyle = colour;
		ctx.fillRect(Math.round(i * barW), y, Math.ceil(barW), h1);
	});
	y += h1;

	// ── Luminance ramp on the left, hue sweep on the right ──
	const h2 = rowHeight(2);
	const split = Math.round(w * 0.58);
	const ramp = ctx.createLinearGradient(0, 0, split, 0);
	ramp.addColorStop(0, '#FFFFFF');
	ramp.addColorStop(1, '#000000');
	ctx.fillStyle = ramp;
	ctx.fillRect(0, y, split, h2);

	const hue = ctx.createLinearGradient(split, 0, w, 0);
	for (let i = 0; i <= 6; i++) {
		hue.addColorStop(i / 6, `hsl(${(i * 300) / 6}, 100%, 50%)`);
	}
	ctx.fillStyle = hue;
	ctx.fillRect(split, y, w - split, h2);
	y += h2;

	// ── Stepped greyscale, black to white ──
	const h3 = h - y; // whatever is left, so rounding never leaves a seam
	ctx.fillStyle = '#000000';
	ctx.fillRect(0, y, w, h3);
	const stepsWidth = w * 0.55;
	const stepW = stepsWidth / STEPS;
	const inset = Math.round(w * 0.04);
	for (let i = 0; i < STEPS; i++) {
		const level = Math.round((i / (STEPS - 1)) * 255);
		ctx.fillStyle = `rgb(${level},${level},${level})`;
		ctx.fillRect(inset + Math.round(i * stepW), y, Math.ceil(stepW), h3);
	}
}

/** Bars stand in only when a scene *has* a video source and none of them
 *  produced an image — a camera that is unplugged, a screen share that was
 *  stopped, a file that went missing — or when the scene draws nothing at all.
 *  A scene made of a colour and some text is a deliberate slate, not a fault,
 *  so it is left alone. */
export function shouldShowBars(
	mediaLayers: number,
	mediaDrawn: number,
	paintedAnything: boolean,
	enabled: boolean
): boolean {
	if (!enabled) return false;
	if (!paintedAnything) return true;
	return mediaLayers > 0 && mediaDrawn === 0;
}
