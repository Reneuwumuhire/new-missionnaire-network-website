import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { recorderStopById } from './recorder-client';

const fetchRecorder = vi.fn();

beforeEach(() => {
	vi.stubEnv('RECORDER_URL', 'https://recorder.example');
	vi.stubEnv('RECORDER_TOKEN', 'test-token');
	vi.stubGlobal('fetch', fetchRecorder);
});

afterEach(() => {
	fetchRecorder.mockReset();
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
});

it('uses the older scoped stop only when the drain route is missing', async () => {
	fetchRecorder
		.mockResolvedValueOnce(
			Response.json({ message: 'Route POST:/stop/rec/drain not found' }, { status: 404 })
		)
		.mockResolvedValueOnce(Response.json({ id: 'rec' }));

	await expect(recorderStopById('rec')).resolves.toEqual({ id: 'rec', tailComplete: false });
	expect(fetchRecorder.mock.calls.map(([url]) => url)).toEqual([
		'https://recorder.example/stop/rec/drain',
		'https://recorder.example/stop/rec'
	]);
});

it.each([404, 500])(
	'keeps a recorder %s error visible without retrying the stop',
	async (status) => {
		fetchRecorder.mockResolvedValueOnce(
			Response.json({ message: 'Recording unavailable' }, { status })
		);

		await expect(recorderStopById('rec')).rejects.toMatchObject({
			status,
			message: 'Recording unavailable'
		});
		expect(fetchRecorder).toHaveBeenCalledTimes(1);
	}
);
