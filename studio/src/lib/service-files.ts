import { parseSrt } from './srt';
import { invoke } from '@tauri-apps/api/core';

export async function pickServiceFile(kind: 'audio' | 'subtitle'): Promise<File | null> {
	const buffer = await invoke<ArrayBuffer>('pick_service_file', { kind });
	if (!buffer.byteLength) return null;
	const nameLength = new DataView(buffer).getUint32(0, true);
	const name = new TextDecoder().decode(new Uint8Array(buffer, 4, nameLength));
	return new File([buffer.slice(4 + nameLength)], name);
}

export const SERVICE_AUDIO_ACCEPT = '.mp3,.wav,.m4a,.aac,.aiff,.aif,.flac';

export function serviceFileError(
	file: Pick<File, 'name' | 'size'>,
	kind: 'audio' | 'subtitle'
): string | null {
	if (!file.size) return 'This file is empty. Choose another file.';
	const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
	if (kind === 'subtitle')
		return extension === '.srt' ? null : 'Choose a SubRip subtitle file (.srt).';
	return SERVICE_AUDIO_ACCEPT.split(',').includes(extension)
		? null
		: 'Choose an audio file: MP3, WAV, M4A, AAC, AIFF or FLAC.';
}

export function subtitleContentError(text: string): string | null {
	const cues = parseSrt(text);
	return cues.length && cues.every((cue) => cue.endMs > cue.startMs && cue.text.trim())
		? null
		: 'This SRT has no valid timed subtitles. Check the file and try again.';
}

/** Check the webview can decode the file before replacing a working source. */
export async function audioContentError(file: File): Promise<string | null> {
	const url = URL.createObjectURL(file);
	const audio = document.createElement('audio');
	try {
		return await new Promise((resolve) => {
			const timer = setTimeout(
				() => finish('Could not read this audio file. Try an MP3 or WAV version.'),
				10000
			);
			function finish(error: string | null) {
				clearTimeout(timer);
				resolve(error);
			}
			audio.onloadedmetadata = () =>
				finish(
					Number.isFinite(audio.duration) && audio.duration > 0
						? null
						: 'This audio file has no playable duration.'
				);
			audio.onerror = () =>
				finish('This audio format could not be played. Try an MP3 or WAV version.');
			audio.preload = 'metadata';
			audio.src = url;
		});
	} finally {
		audio.onloadedmetadata = null;
		audio.onerror = null;
		audio.removeAttribute('src');
		audio.load();
		URL.revokeObjectURL(url);
	}
}
