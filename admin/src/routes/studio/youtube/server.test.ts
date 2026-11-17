import { beforeEach, expect, it, vi } from 'vitest';
import { GET } from './+server';

const mocks = vi.hoisted(() => ({
	verifyAdminSession: vi.fn(),
	beginYouTubeOAuth: vi.fn(),
	findOne: vi.fn()
}));

vi.mock('$lib/server/admin-session', () => ({ verifyAdminSession: mocks.verifyAdminSession }));
vi.mock('$lib/models/admin-user', () => ({
	getPermissions: () => ({ can_manage_recordings: true })
}));
vi.mock('$lib/server/youtube-oauth', () => ({ beginYouTubeOAuth: mocks.beginYouTubeOAuth }));
vi.mock('../../../db/mongo', () => ({
	getDb: async () => ({ collection: () => ({ findOne: mocks.findOne }) })
}));

const request = () => ({
	url: new URL(
		'https://admin.missionnaire.net/studio/youtube?code=00000000-0000-4000-8000-000000000000'
	),
	cookies: {}
});

beforeEach(() => {
	vi.resetAllMocks();
	mocks.verifyAdminSession.mockResolvedValue({ email: 'operator@example.com' });
	mocks.findOne.mockResolvedValue({ user_email: 'operator@example.com' });
});

it('redirects an approved Studio session to Google OAuth', async () => {
	const location = 'https://accounts.google.com/o/oauth2/v2/auth?state=test-state';
	mocks.beginYouTubeOAuth.mockResolvedValue(location);
	await expect(GET(request() as never)).rejects.toMatchObject({ status: 302, location });
});

it('rejects redirects outside the Google login origin', async () => {
	mocks.beginYouTubeOAuth.mockResolvedValue('https://accounts.google.com.evil.example/auth');
	await expect(GET(request() as never)).rejects.toThrow();
});

it('requires Studio approval before starting Google OAuth', async () => {
	mocks.findOne.mockResolvedValue(null);
	await expect(GET(request() as never)).rejects.toMatchObject({ status: 403 });
	expect(mocks.beginYouTubeOAuth).not.toHaveBeenCalled();
});
