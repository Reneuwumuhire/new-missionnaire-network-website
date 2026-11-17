import { createServer, type Socket } from 'node:net';

/** One local MP3 transcoder feeds the recorder. Pipe the final bytes through
 * to the reader before closing its response, and propagate a broken upload. */
export function createRecordingFeed() {
	let source: Socket | undefined;
	let listener: Socket | undefined;

	const input = createServer((socket) => {
		if (source) {
			socket.destroy();
			return;
		}
		source = socket;
		socket.once('close', () => {
			if (!socket.readableEnded) listener?.resetAndDestroy();
			listener = undefined;
			source = undefined;
		});
		socket.on('error', () => socket.destroy());
		socket.resume();
	});
	const output = createServer((socket) => {
		if (!source || source.readableEnded || listener) {
			socket.end();
			return;
		}
		const upstream = source;
		listener = socket;
		socket.on('error', () => socket.destroy());
		socket.once('close', () => {
			if (listener !== socket) return;
			listener = undefined;
			upstream.unpipe(socket);
			upstream.resume();
		});
		upstream.pipe(socket);
	});
	return { input, output };
}
