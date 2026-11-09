import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	AWS_ACCESS_KEY_ID: { schema: (value) => value },
	AWS_S3_BUCKET: { schema: (value) => value },
	AWS_S3_REGION: { schema: (value) => value },
	AWS_SECRET_ACCESS_KEY: { schema: (value) => value },
	CRON_SECRET: { schema: (value) => value },
	ICECAST_OFFLINE_AUTO_END_MS: { schema: (value) => value },
	ICECAST_STATUS_URL: { schema: (value) => value },
	INTERNAL_API_SECRET: { schema: (value) => value },
	LIBRARY_ASSET_HOSTS: { schema: (value) => value },
	LIVE_AUDIO_HLS_URL: { schema: (value) => value },
	LIVE_AUDIO_SOURCE_URL: { schema: (value) => value },
	MONGODB_URI: { schema: (value) => value },
	PUSH_NOTIFICATIONS_ENABLED: { schema: (value) => value },
	VAPID_PRIVATE_KEY: { schema: (value) => value },
	YOUTUBE_API_KEY: { schema: (value) => value },
	YOUTUBE_WEBSUB_SECRET: { schema: (value) => value },
	PUBLIC_MAIN_URL: { public: true, schema: (value) => value },
	PUBLIC_VAPID_KEY: { public: true, schema: (value) => value }
});
