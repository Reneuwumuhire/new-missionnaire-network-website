import type fr from './fr';

// Typed against the French dictionary: adding a key to fr.ts without a
// matching English entry fails `pnpm run check`.
const en: Record<keyof typeof fr, string> = {
	// ── Common ──────────────────────────────────────────────────
	'common.administration': 'Administration',
	'common.bulkImport': 'Bulk import',
	'common.untitled': 'Untitled',
	'common.unknownArtist': 'Unknown artist',
	'common.title': 'Title',
	'common.artist': 'Artist',
	'common.category': 'Category',
	'common.duration': 'Duration',
	'common.size': 'Size',
	'common.date': 'Date',

	// ── Navigation (sidebar) ────────────────────────────────────
	'nav.dashboard': 'Dashboard',
	'nav.questions': 'Questions',
	'nav.recordings': 'Recordings',
	'nav.audioLibrary': 'Audio library',
	'nav.lyricsReview': 'Lyrics review',
	'nav.users': 'Users',
	'nav.settings': 'Settings',
	'nav.logout': 'Log out',
	'nav.menu': 'Menu',
	'nav.closeMenu': 'Close menu',
	'nav.liveAudience': 'Live audience',
	'nav.language': 'Language',

	// ── Dashboard ───────────────────────────────────────────────
	'dashboard.pageTitle': 'Dashboard - Missionnaire Admin',
	'dashboard.title': 'Dashboard',
	'dashboard.subtitle': 'Overview of your audio library',
	'dashboard.liveDetectedTitle': 'Live stream detected — ready to go live',
	'dashboard.liveDetectedBody':
		'The audio stream is active on Icecast but the audience cannot see it yet. Click to go live.',
	'dashboard.notRecordingTitle': 'Live — no recording in progress',
	'dashboard.notRecordingBody':
		'The live stream is being broadcast but nothing is being saved. Click to start recording.',
	'dashboard.importOne': 'Import an audio',
	'dashboard.totalTracks': 'Audio tracks',
	'dashboard.totalStorage': 'Total storage',
	'dashboard.uploadsThisMonth': 'Uploaded this month',
	'dashboard.missingMetadata': 'Missing metadata',
	'dashboard.categoryDistribution': 'Breakdown by category',
	'dashboard.noCategories': 'No categories found',
	'dashboard.recentUploads': 'Recent uploads',
	'dashboard.viewAll': 'View all',
	'dashboard.noUploads': 'No audio uploaded',
	'dashboard.recentActivity': 'Recent activity',
	'dashboard.actionCreate': 'Created',
	'dashboard.actionUpdate': 'Updated',
	'dashboard.actionDelete': 'Deleted',
	'dashboard.actionBulkDelete': 'Bulk delete',
	'dashboard.actionBulkUpdate': 'Bulk update',
	'dashboard.actionLogin': 'Login',
	'dashboard.actionLogout': 'Logout',

	// ── Auth (login) ────────────────────────────────────────────
	'auth.pageTitle': 'Sign in - Missionnaire Admin',
	'auth.email': 'Email address',
	'auth.password': 'Password',
	'auth.loggingIn': 'Signing in...',
	'auth.login': 'Sign in',

	// ── Audio library (list) ────────────────────────────────────
	'audio.pageTitle': 'Audio library - Missionnaire Admin',
	'audio.title': 'Audio library',
	'audio.totalCountOne': '{count} track in total',
	'audio.totalCountMany': '{count} tracks in total',
	'audio.import': 'Import',
	'audio.noResults': 'No audio found'
};

export default en;
