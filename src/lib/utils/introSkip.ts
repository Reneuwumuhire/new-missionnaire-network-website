/** Some tracks were ripped from YouTube videos whose first seconds are an
 *  on-screen title card — silent in the audio rip. Rather than playing the
 *  dead air, the player starts those tracks a few seconds in (with a short
 *  volume fade so the jump feels gentle).
 *
 *  A per-track `intro_skip_sec` field on the document always wins; the
 *  artist rules below are the fallback for known bulk imports.
 */

const MAX_SKIP_SEC = 30;

const ARTIST_INTRO_RULES: Array<{ pattern: RegExp; seconds: number }> = [
	// "Sr/Se Samonte" uploads: ~5s silent title card from the YouTube source.
	{ pattern: /samonte/i, seconds: 5 }
];

export function getIntroSkipSeconds(track: unknown): number {
	if (!track || typeof track !== 'object') return 0;
	const t = track as { intro_skip_sec?: unknown; artist?: unknown };

	const explicit = Number(t.intro_skip_sec);
	if (Number.isFinite(explicit) && explicit > 0) return Math.min(explicit, MAX_SKIP_SEC);

	const artist = typeof t.artist === 'string' ? t.artist : '';
	if (artist) {
		for (const rule of ARTIST_INTRO_RULES) {
			if (rule.pattern.test(artist)) return rule.seconds;
		}
	}
	return 0;
}
