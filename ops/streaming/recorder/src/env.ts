function required(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`Missing required env var: ${name}`);
	return value;
}

function optional(name: string, fallback: string): string {
	return process.env[name] ?? fallback;
}

export const ENV = {
	RECORDER_TOKEN: required('RECORDER_TOKEN'),
	ICECAST_URL: optional('ICECAST_URL', 'http://icecast:8000/radio.mp3'),
	/** Icecast status page, used to tell whether the REAL broadcast source is
	 *  connected. With the silence fallback mount the recording stream never
	 *  EOFs, so this is the only end-of-broadcast signal the recorder has.
	 *  Defaults to /status-json.xsl next to ICECAST_URL. */
	ICECAST_STATUS_URL: optional(
		'ICECAST_STATUS_URL',
		new URL('/status-json.xsl', optional('ICECAST_URL', 'http://icecast:8000/radio.mp3')).toString()
	),
	/** Auto-stop a recording once the real source mount has been absent this
	 *  long (the audio being captured in the meantime is fallback silence).
	 *  Default 30 min — parity with the old multi-segment recovery give-up. */
	SOURCE_GONE_STOP_SECONDS: Number(optional('SOURCE_GONE_STOP_SECONDS', String(30 * 60))),
	RECORDINGS_DIR: optional('RECORDINGS_DIR', '/data/recordings'),
	MAX_RECORDING_SECONDS: Number(optional('MAX_RECORDING_SECONDS', String(4 * 60 * 60))),
	PORT: Number(optional('PORT', '8080')),
	MONGODB_URI: required('MONGODB_URI'),
	MONGODB_DB: optional('MONGODB_DB', 'youtube_data'),
	AWS_ACCESS_KEY_ID: required('AWS_ACCESS_KEY_ID'),
	AWS_SECRET_ACCESS_KEY: required('AWS_SECRET_ACCESS_KEY'),
	AWS_S3_BUCKET: required('AWS_S3_BUCKET'),
	AWS_S3_REGION: required('AWS_S3_REGION')
};
