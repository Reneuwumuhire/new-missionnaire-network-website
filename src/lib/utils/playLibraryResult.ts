import { tick } from 'svelte';
import { selectAudio, playlist, basePlaylist, currentIndex, isPlaying } from '$lib/stores/global';
import { pendingPlaybackSeek } from './audioResume';
import { dispatchAudioPlayerAction } from './audioPlayerControls';
import type { MusicAudio } from '$lib/models/music-audio';
import type { LibraryResult as Result } from './librarySearch';
export function playLibraryResult(result: Result) {
	const song: MusicAudio = {
		_id: result.id,
		title: result.title,
		artist: result.author,
		category: result.type === 'recordings' ? 'Direct' : result.category,
		book: null,
		number: null,
		s3_key: '',
		s3_url: result.audioUrl,
		file_size: 0,
		format: 'mp3',
		uploaded_at: new Date()
	};
	pendingPlaybackSeek.set(
		result.startSec !== null ? { url: song.s3_url, time: result.startSec } : null
	);
	const track =
		result.type === 'sermons'
			? {
					_id: result.id,
					author: result.author,
					full_date_code: result.code,
					date_code: result.code,
					french_title: result.title,
					mp3_url: result.audioUrl,
					iso_date: result.date
				}
			: song;
	playlist.set([track]);
	basePlaylist.set([track]);
	currentIndex.set(0);
	selectAudio.set(track);
	isPlaying.set(true);
	void tick().then(() => {
		if (result.startSec === 0)
			window.dispatchEvent(new CustomEvent('missionnaire-audio-seek', { detail: { time: 0 } }));
		dispatchAudioPlayerAction('play');
	});
}
