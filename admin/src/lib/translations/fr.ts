// Source of truth for admin UI strings. French is the canonical language —
// `TranslationKey` in admin/src/lib/i18n.ts derives from this file, and en.ts
// is type-checked against it so a missing English key fails `pnpm run check`.
export default {
	// ── Common ──────────────────────────────────────────────────
	'common.administration': 'Administration',
	'common.bulkImport': 'Importer en lot',
	'common.untitled': 'Sans titre',
	'common.unknownArtist': 'Artiste inconnu',
	'common.title': 'Titre',
	'common.artist': 'Artiste',
	'common.category': 'Catégorie',
	'common.duration': 'Durée',
	'common.size': 'Taille',
	'common.date': 'Date',

	// ── Navigation (sidebar) ────────────────────────────────────
	'nav.dashboard': 'Tableau de bord',
	'nav.questions': 'Questions',
	'nav.recordings': 'Enregistrements',
	'nav.audioLibrary': 'Bibliothèque audio',
	'nav.lyricsReview': 'Révision paroles',
	'nav.users': 'Utilisateurs',
	'nav.settings': 'Paramètres',
	'nav.logout': 'Déconnexion',
	'nav.menu': 'Menu',
	'nav.closeMenu': 'Fermer le menu',
	'nav.liveAudience': 'Audience en direct',
	'nav.language': 'Langue',

	// ── Dashboard ───────────────────────────────────────────────
	'dashboard.pageTitle': 'Tableau de bord - Missionnaire Admin',
	'dashboard.title': 'Tableau de bord',
	'dashboard.subtitle': "Vue d'ensemble de votre bibliothèque audio",
	'dashboard.liveDetectedTitle': 'Direct détecté — prêt à passer en direct',
	'dashboard.liveDetectedBody':
		"Le flux audio est actif sur Icecast mais l'audience ne le voit pas encore. Cliquez pour aller en direct.",
	'dashboard.notRecordingTitle': 'En direct — aucun enregistrement en cours',
	'dashboard.notRecordingBody':
		"Le direct est diffusé mais rien n'est sauvegardé. Cliquez pour démarrer l'enregistrement.",
	'dashboard.importOne': 'Importer un audio',
	'dashboard.totalTracks': 'Pistes audio',
	'dashboard.totalStorage': 'Stockage total',
	'dashboard.uploadsThisMonth': 'Importés ce mois',
	'dashboard.missingMetadata': 'Métadonnées manquantes',
	'dashboard.categoryDistribution': 'Répartition par catégorie',
	'dashboard.noCategories': 'Aucune catégorie trouvée',
	'dashboard.recentUploads': 'Ajouts récents',
	'dashboard.viewAll': 'Voir tout',
	'dashboard.noUploads': 'Aucun audio importé',
	'dashboard.recentActivity': 'Activité récente',
	'dashboard.actionCreate': 'Ajout',
	'dashboard.actionUpdate': 'Modification',
	'dashboard.actionDelete': 'Suppression',
	'dashboard.actionBulkDelete': 'Suppression groupée',
	'dashboard.actionBulkUpdate': 'Modification groupée',
	'dashboard.actionLogin': 'Connexion',
	'dashboard.actionLogout': 'Déconnexion',

	// ── Auth (login) ────────────────────────────────────────────
	'auth.pageTitle': 'Connexion - Missionnaire Admin',
	'auth.email': 'Adresse email',
	'auth.password': 'Mot de passe',
	'auth.loggingIn': 'Connexion...',
	'auth.login': 'Se connecter',

	// ── Audio library (list) ────────────────────────────────────
	'audio.pageTitle': 'Bibliothèque audio - Missionnaire Admin',
	'audio.title': 'Bibliothèque audio',
	'audio.totalCountOne': '{count} piste au total',
	'audio.totalCountMany': '{count} pistes au total',
	'audio.import': 'Importer',
	'audio.noResults': 'Aucun audio trouvé'
} as const;
