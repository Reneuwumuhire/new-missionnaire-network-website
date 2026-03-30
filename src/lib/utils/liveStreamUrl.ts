const URL_SCHEME_REGEX = /^[a-z][a-z0-9+.-]*:\/\//i;
const DEFAULT_AUDIO_PATH = '/radio.mp3';
const HOSTNAME_PREFIX_REGEX = /^[a-z0-9.-]+\.[a-z]{2,}(?::\d+)?(\/|$)/i;

export function normalizeLiveStreamUrl(value?: string | null): string {
	const raw = value?.trim() ?? '';
	if (!raw) return '';

	const unquoted = raw.replace(/^['"]|['"]$/g, '');
	const withoutProtocolSlashes = unquoted.startsWith('//') ? `https:${unquoted}` : unquoted;

	// Keep internal app paths untouched.
	if (withoutProtocolSlashes.startsWith('/') && !HOSTNAME_PREFIX_REGEX.test(withoutProtocolSlashes.slice(1))) {
		return withoutProtocolSlashes;
	}

	const normalizedCandidate = withoutProtocolSlashes.startsWith('/')
		? withoutProtocolSlashes.slice(1)
		: withoutProtocolSlashes;

	try {
		const url = new URL(
			URL_SCHEME_REGEX.test(normalizedCandidate)
				? normalizedCandidate
				: `https://${normalizedCandidate}`
		);
		if (!url.pathname || url.pathname === '/') {
			url.pathname = DEFAULT_AUDIO_PATH;
		}
		return url.toString();
	} catch {
		return withoutProtocolSlashes;
	}
}
