function required(name) {
    const value = process.env[name];
    if (!value)
        throw new Error(`Missing required env var: ${name}`);
    return value;
}
function optional(name, fallback) {
    return process.env[name] ?? fallback;
}
export const ENV = {
    RECORDER_TOKEN: required('RECORDER_TOKEN'),
    ICECAST_URL: optional('ICECAST_URL', 'http://icecast:8000/radio.mp3'),
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
