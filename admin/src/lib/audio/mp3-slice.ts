/**
 * Frame-accurate MP3 slicer. Parses frame headers, walks the stream without
 * decoding PCM, and returns a byte-exact sub-MP3 for the requested time range.
 *
 * Precision is one frame (~26ms at 44.1 kHz for MPEG1 Layer III). No
 * re-encoding → zero quality loss. Handles CBR and VBR, MPEG1/2/2.5,
 * ID3v2 prefixes, and Xing/Info/VBRI informational frames.
 */

// Layer III is the only layer we emit for broadcast recordings, but the
// parser stays generic so a stray non-Layer-III frame doesn't break scanning.
type MpegVersion = 1 | 2 | 2.5;
type Layer = 1 | 2 | 3;

const MPEG_VERSION_TABLE: Record<number, MpegVersion | null> = {
	0b00: 2.5,
	0b01: null, // reserved
	0b10: 2,
	0b11: 1
};

const LAYER_TABLE: Record<number, Layer | null> = {
	0b00: null, // reserved
	0b01: 3,
	0b10: 2,
	0b11: 1
};

// Bitrates are kbps; index 0 (free) and 15 (bad) are invalid for seeking.
const BITRATE_TABLE: Record<string, readonly number[]> = {
	'1-1': [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448, -1],
	'1-2': [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384, -1],
	'1-3': [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, -1],
	'2-1': [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256, -1],
	'2-2': [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, -1],
	'2-3': [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, -1]
};

const SAMPLE_RATE_TABLE: Record<string, readonly number[]> = {
	'1': [44100, 48000, 32000],
	'2': [22050, 24000, 16000],
	'2.5': [11025, 12000, 8000]
};

function computeFrameGeometry(
	layer: Layer,
	version: MpegVersion,
	bitrate: number,
	sampleRate: number,
	padding: 0 | 1
): { samplesPerFrame: number; frameSize: number } {
	if (layer === 1) {
		const frameSize = (Math.floor((12 * bitrate) / sampleRate) + padding) * 4;
		return { samplesPerFrame: 384, frameSize };
	}
	if (layer === 2) {
		const frameSize = Math.floor((144 * bitrate) / sampleRate) + padding;
		return { samplesPerFrame: 1152, frameSize };
	}
	// Layer III
	const mpeg1 = version === 1;
	const samplesPerFrame = mpeg1 ? 1152 : 576;
	const coef = mpeg1 ? 144 : 72;
	const frameSize = Math.floor((coef * bitrate) / sampleRate) + padding;
	return { samplesPerFrame, frameSize };
}

interface FrameHeader {
	version: MpegVersion;
	layer: Layer;
	bitrate: number; // bits per second
	sampleRate: number; // Hz
	padding: 0 | 1;
	frameSize: number; // bytes, including header
	samplesPerFrame: number;
	durationSec: number;
}

interface FrameIndexEntry {
	byteOffset: number;
	timeOffset: number; // cumulative seconds from the first audio frame
	frameSize: number;
	durationSec: number;
}

/**
 * Parse a 4-byte MP3 frame header at the given offset. Returns null if the
 * header is invalid (wrong sync, reserved fields, free/bad bitrate).
 */
function readFrameHeader(bytes: Uint8Array, offset: number): FrameHeader | null {
	if (offset + 4 > bytes.length) return null;
	const b1 = bytes[offset];
	const b2 = bytes[offset + 1];
	const b3 = bytes[offset + 2];

	// 11-bit sync — all ones.
	if (b1 !== 0xff || (b2 & 0xe0) !== 0xe0) return null;

	const version = MPEG_VERSION_TABLE[(b2 >> 3) & 0b11];
	const layer = LAYER_TABLE[(b2 >> 1) & 0b11];
	if (version === null || layer === null) return null;

	const bitrateIdx = (b3 >> 4) & 0x0f;
	const sampleRateIdx = (b3 >> 2) & 0b11;
	const padding = ((b3 >> 1) & 0b1) as 0 | 1;

	if (sampleRateIdx === 0b11) return null;

	const brKey = `${version === 2.5 ? 2 : version}-${layer}`;
	const bitrateKbps = BITRATE_TABLE[brKey]?.[bitrateIdx];
	if (bitrateKbps === undefined || bitrateKbps <= 0) return null; // free or bad

	const srKey = `${version}`;
	const sampleRate = SAMPLE_RATE_TABLE[srKey]?.[sampleRateIdx];
	if (!sampleRate) return null;

	const bitrate = bitrateKbps * 1000;

	const { samplesPerFrame, frameSize } = computeFrameGeometry(
		layer,
		version,
		bitrate,
		sampleRate,
		padding
	);
	if (frameSize < 4) return null;

	return {
		version,
		layer,
		bitrate,
		sampleRate,
		padding,
		frameSize,
		samplesPerFrame,
		durationSec: samplesPerFrame / sampleRate
	};
}

/**
 *
 * Skip ID3v2 tag if present. Returns the byte offset of the first audio byte.
 * ID3v2: "ID3" + 2 bytes version + 1 byte flags + 4 bytes synchsafe size.
 */
function skipId3v2(bytes: Uint8Array): number {
	if (bytes.length < 10) return 0;
	if (bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return 0; // "ID3"
	const size =
		((bytes[6] & 0x7f) << 21) |
		((bytes[7] & 0x7f) << 14) |
		((bytes[8] & 0x7f) << 7) |
		(bytes[9] & 0x7f);
	const hasFooter = (bytes[5] & 0x10) !== 0;
	return 10 + size + (hasFooter ? 10 : 0);
}

/**
 * Find the first valid frame header starting at `from`, scanning forward.
 * Needed because ID3v2 padding or stray bytes may precede the first frame.
 */
function findFirstFrame(bytes: Uint8Array, from: number): number {
	const limit = Math.min(bytes.length - 4, from + 1024 * 64); // scan up to 64KB
	for (let i = from; i <= limit; i++) {
		const header = readFrameHeader(bytes, i);
		if (!header) continue;
		// Require a second valid sync at the next expected frame boundary —
		// rules out random 0xFF bytes inside ID3 text that look like a sync.
		const next = readFrameHeader(bytes, i + header.frameSize);
		if (next) return i;
	}
	return -1;
}

/**
 * Xing/Info/VBRI frames are audio frames whose payload is a VBR metadata
 * header rather than audible data. Detect so we can copy them verbatim
 * to the output (keeps VBR toc/info intact for players that rely on it).
 */
function isInfoFrame(bytes: Uint8Array, offset: number, header: FrameHeader): boolean {
	// Xing/Info sits at a fixed offset into the frame body depending on
	// MPEG version and channel mode. Instead of computing the exact
	// position, scan the first ~40 bytes of the frame body for the tag.
	const scanEnd = Math.min(offset + header.frameSize, bytes.length) - 4;
	for (let i = offset + 4; i <= scanEnd; i++) {
		const tag = String.fromCodePoint(bytes[i], bytes[i + 1], bytes[i + 2], bytes[i + 3]);
		if (tag === 'Xing' || tag === 'Info' || tag === 'VBRI') return true;
	}
	return false;
}

export interface Mp3Info {
	durationSec: number;
	frameCount: number;
	audioStart: number;
	audioEnd: number;
}

/**
 * Build a frame-by-frame index of the MP3 byte stream. Used by `sliceMp3`
 * and exposed so the UI can show "ready to trim" state before slicing.
 */
export function indexMp3(buffer: ArrayBuffer): { info: Mp3Info; index: FrameIndexEntry[] } {
	const bytes = new Uint8Array(buffer);
	const id3End = skipId3v2(bytes);
	const first = findFirstFrame(bytes, id3End);
	if (first < 0) throw new Error('Aucune trame MP3 trouvée');

	const index: FrameIndexEntry[] = [];
	let offset = first;
	let time = 0;

	while (offset + 4 <= bytes.length) {
		const header = readFrameHeader(bytes, offset);
		if (!header) break;

		// Skip Xing/Info metadata frames — they carry zero audio time.
		if (index.length === 0 && isInfoFrame(bytes, offset, header)) {
			offset += header.frameSize;
			continue;
		}

		index.push({
			byteOffset: offset,
			timeOffset: time,
			frameSize: header.frameSize,
			durationSec: header.durationSec
		});
		time += header.durationSec;
		offset += header.frameSize;
	}

	if (index.length === 0) throw new Error('Aucune trame audio utilisable');

	return {
		info: {
			durationSec: time,
			frameCount: index.length,
			audioStart: index[0].byteOffset,
			audioEnd: offset
		},
		index
	};
}

/**
 * Produce a new MP3 Blob covering `[startSec, endSec]` of the source.
 * Cuts at frame boundaries ≥ `startSec` and < `endSec` — precision is
 * one frame (~26ms at 44.1 kHz MPEG1 Layer III).
 *
 * The returned blob is a raw stream of frames: no ID3v2 tag is carried
 * over (we don't need it — Content-Disposition handles the download name
 * and duration is re-derived server-side).
 */
export function sliceMp3(buffer: ArrayBuffer, startSec: number, endSec: number): Blob {
	if (endSec <= startSec) throw new Error('Plage invalide (fin ≤ début)');

	const { info, index } = indexMp3(buffer);
	const clampedStart = Math.max(0, Math.min(startSec, info.durationSec));
	const clampedEnd = Math.max(clampedStart, Math.min(endSec, info.durationSec));

	// Binary search for the first frame whose timeOffset >= target.
	const findFrame = (target: number): number => {
		let lo = 0;
		let hi = index.length;
		while (lo < hi) {
			const mid = (lo + hi) >>> 1;
			if (index[mid].timeOffset < target) lo = mid + 1;
			else hi = mid;
		}
		return lo;
	};

	const startIdx = findFrame(clampedStart);
	const endIdx = findFrame(clampedEnd);

	const startByte = startIdx < index.length ? index[startIdx].byteOffset : info.audioEnd;
	const endByte = endIdx < index.length ? index[endIdx].byteOffset : info.audioEnd;

	if (endByte <= startByte) throw new Error('Plage trop courte — aucune trame à conserver');

	const bytes = new Uint8Array(buffer, startByte, endByte - startByte);
	return new Blob([bytes], { type: 'audio/mpeg' });
}
