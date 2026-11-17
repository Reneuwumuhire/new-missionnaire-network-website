import assert from 'node:assert/strict';
import { once } from 'node:events';
import { connect } from 'node:net';
import { test } from 'node:test';
import { createRecordingFeed } from './recording-feed.js';

test(
	'delivers the final audio bytes before EOF on every new feed',
	{ timeout: 5000 },
	async (t) => {
		const { input, output } = createRecordingFeed();
		input.listen(0, '127.0.0.1');
		output.listen(0, '127.0.0.1');
		t.after(() => {
			input.close();
			output.close();
		});
		await Promise.all([once(input, 'listening'), once(output, 'listening')]);
		const ingest = input.address();
		const playback = output.address();
		assert.ok(ingest && typeof ingest !== 'string' && playback && typeof playback !== 'string');
		const readFeed = async (audio: ReturnType<typeof connect>) => {
			const chunks: Buffer[] = [];
			for await (const chunk of audio) chunks.push(chunk);
			return Buffer.concat(chunks).toString();
		};
		assert.equal(await readFeed(connect(playback.port, '127.0.0.1')), '');

		for (const tail of ['first ending', 'next ending']) {
			const connected = once(input, 'connection');
			const upload = connect(ingest.port, '127.0.0.1');
			t.after(() => {
				upload.destroy();
			});
			const disconnected = once(upload, 'close');
			await connected;

			const subscribed = once(output, 'connection');
			const audio = readFeed(connect(playback.port, '127.0.0.1'));
			await subscribed;
			upload.write('programme audio ');
			upload.end(tail);
			assert.equal(await audio, `programme audio ${tail}`);
			await disconnected;
		}
	}
);
