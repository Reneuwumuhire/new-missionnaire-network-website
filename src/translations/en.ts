import type fr from './fr';

// Typed against the French dictionary: adding a key to fr.ts without a
// matching English entry fails `pnpm run check`.
const en: Record<keyof typeof fr, string> = {
	// ── Navigation ──────────────────────────────────────────────
	'nav.predications': 'Sermons',
	'nav.transcriptions': 'Transcripts',
	'nav.williamBranham': 'William Branham',
	'nav.ewaldFrank': 'Ewald Frank',
	'nav.musique': 'Music',
	'nav.questions': 'Questions',
	'nav.direct': 'Live',
	'nav.eglise': 'The church',
	'nav.aPropos': 'About',
	'nav.galerie': 'Gallery',
	'nav.documents': 'Documents',
	'nav.literature': 'Literature',
	'nav.videos': 'Videos',
	'nav.menu': 'Menu',
	'nav.openMenu': 'Open menu',
	'nav.closeMenu': 'Close menu',
	'nav.home': 'Home',
	'nav.breadcrumb': 'Breadcrumb',
	'nav.englishSermons': 'Sermons in English',

	// ── Language picker ─────────────────────────────────────────
	'lang.label': 'Language',
	'lang.french': 'Français',
	'lang.english': 'English',

	// ── Lists, search & filters ─────────────────────────────────
	'list.loading': 'Loading...',
	'list.empty': 'Nothing to show here.',
	'list.searchPlaceholder': 'Search...',
	'list.resultsFor': '{count} results for “{query}”',
	'list.oneResultFor': '1 result for “{query}”',
	'list.noResultsFor': 'No results for “{query}”',
	'list.showing': 'Showing {from}–{to} of {total}',
	'list.all': 'All',
	'list.clearFilters': 'Clear filters',

	// ── Pagination ──────────────────────────────────────────────
	'pagination.previous': 'Previous',
	'pagination.next': 'Next',
	'pagination.page': 'Page',
	'pagination.pageOf': 'Page {page} of {total}',
	'pagination.jumpTo': 'Jump to page',

	// ── Errors & feedback ───────────────────────────────────────
	'errors.listFailed': 'The list could not be loaded.',
	'errors.retry': 'Retry',
	'errors.offline': 'You appear to be offline. Check your connection.',
	'errors.notFoundTitle': 'Page not found',
	'errors.notFoundBody': "The page you're looking for doesn't exist or has moved.",
	'errors.serverTitle': 'Something went wrong',
	'errors.serverBody': 'Something failed on our side. Please try again in a moment.',
	'errors.backHome': 'Back to home',
	'errors.quickLinks': 'You might be looking for:',

	// ── Audio player ────────────────────────────────────────────
	'player.play': 'Play',
	'player.pause': 'Pause',
	'player.previous': 'Previous track',
	'player.next': 'Next track',
	'player.mute': 'Mute',
	'player.unmute': 'Unmute',
	'player.shuffle': 'Shuffle',
	'player.repeatOne': 'Repeat track',
	'player.close': 'Close player',
	'player.download': 'Download',
	'player.share': 'Share',
	'player.favorite': 'Add to favorites',
	'player.unfavorite': 'Remove from favorites',
	'player.lyrics': 'Lyrics',
	'player.sleepTimer': 'Sleep timer',
	'player.progressLabel': 'Playback position',
	'player.timeOf': '{current} of {total}',

	// ── Live player ─────────────────────────────────────────────
	'live.listen': 'Listen live',
	'live.pause': 'Pause the live stream',
	'live.backToLive': 'Back to live',
	'live.atLive': 'Live',
	'live.reload': 'Reload the stream',
	'live.scrubberLabel': 'Position in the live stream',
	'live.behindLive': '{label} behind live',
	'live.expandThumbnail': 'Expand thumbnail',
	'live.closeLightbox': 'Close',

	// ── Forms ───────────────────────────────────────────────────
	'forms.submit': 'Send',
	'forms.sending': 'Sending...',
	'forms.requiredField': 'This field is required.',

	// ── Global search ───────────────────────────────────────────
	'search.open': 'Search the site',
	'search.placeholder': 'Search for a sermon, a song...',
	'search.close': 'Close search',
	'search.sermons': 'Sermons',
	'search.songs': 'Music',
	'search.transcriptions': 'Transcripts',
	'search.recordings': 'Replays',
	'search.seeAll': 'See all results',
	'search.noResults': 'No results. Try another word.',
	'search.minChars': 'Type at least 2 characters to search.',

	// ── Misc chrome ─────────────────────────────────────────────
	'misc.views': 'views',
	'misc.seeMore': 'See more',
	'misc.seeLess': 'See less',
	'misc.seeAll': 'See all',
	'misc.sermonBadge': 'Sermon',
	'misc.retransmissionBadge': 'Live replay'
};

export default en;
