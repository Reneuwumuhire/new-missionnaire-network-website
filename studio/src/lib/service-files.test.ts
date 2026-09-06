import { expect, it } from 'vitest';
import { serviceFileError, subtitleContentError } from './service-files';

it('rejects files intended for a different service input and empty files', () => {
	expect(serviceFileError({ name: 'sermon.MP3', size: 100 }, 'audio')).toBeNull();
	expect(serviceFileError({ name: 'sermon.mp4', size: 100 }, 'audio')).toBeTruthy();
	expect(serviceFileError({ name: 'captions.txt', size: 100 }, 'subtitle')).toBeTruthy();
	expect(serviceFileError({ name: 'captions.srt', size: 0 }, 'subtitle')).toBeTruthy();
	expect(serviceFileError({ name: 'captions.SRT', size: 100 }, 'subtitle')).toBeNull();
});

it('validates timed subtitle content before replacing loaded cues', () => {
	expect(subtitleContentError('1\n00:00:01,000 --> 00:00:02,000\nHello')).toBeNull();
	expect(subtitleContentError('renamed plain text')).toBeTruthy();
	expect(subtitleContentError('1\n00:00:02,000 --> 00:00:01,000\nHello')).toBeTruthy();
});
