// Source of truth for UI-chrome strings. French is the canonical language —
// `TranslationKey` in src/i18n.ts derives from this file, and en.ts is
// type-checked against it so a missing English key fails `pnpm run check`.
export default {
	// ── Navigation ──────────────────────────────────────────────
	'nav.predications': 'Prédications',
	'nav.transcriptions': 'Transcriptions',
	'nav.williamBranham': 'William Branham',
	'nav.ewaldFrank': 'Ewald Frank',
	'nav.musique': 'Musique',
	'nav.questions': 'Questions',
	'nav.direct': 'Direct',
	'nav.eglise': "L'église",
	'nav.aPropos': 'À propos',
	'nav.galerie': 'Galerie',
	'nav.documents': 'Documents',
	'nav.literature': 'Littérature',
	'nav.videos': 'Vidéos',
	'nav.menu': 'Menu',
	'nav.openMenu': 'Ouvrir le menu',
	'nav.closeMenu': 'Fermer le menu',
	'nav.home': 'Accueil',
	'nav.breadcrumb': "Fil d'Ariane",
	'nav.englishSermons': 'Prédications en anglais',

	// ── Language picker ─────────────────────────────────────────
	'lang.label': 'Langue',
	'lang.french': 'Français',
	'lang.english': 'English',

	// ── Lists, search & filters ─────────────────────────────────
	'list.loading': 'Chargement...',
	'list.empty': 'Aucun élément à afficher.',
	'list.searchPlaceholder': 'Rechercher...',
	'list.resultsFor': '{count} résultats pour « {query} »',
	'list.oneResultFor': '1 résultat pour « {query} »',
	'list.noResultsFor': 'Aucun résultat pour « {query} »',
	'list.showing': 'Affichage de {from}–{to} sur {total}',
	'list.all': 'Tous',
	'list.clearFilters': 'Effacer les filtres',

	// ── Pagination ──────────────────────────────────────────────
	'pagination.previous': 'Précédent',
	'pagination.next': 'Suivant',
	'pagination.page': 'Page',
	'pagination.pageOf': 'Page {page} sur {total}',
	'pagination.jumpTo': 'Aller à la page',

	// ── Errors & feedback ───────────────────────────────────────
	'errors.listFailed': "La liste n'a pas pu être chargée.",
	'errors.retry': 'Réessayer',
	'errors.offline': 'Vous semblez être hors ligne. Vérifiez votre connexion.',
	'errors.notFoundTitle': 'Page introuvable',
	'errors.notFoundBody': "La page que vous cherchez n'existe pas ou a été déplacée.",
	'errors.serverTitle': 'Une erreur est survenue',
	'errors.serverBody': "Quelque chose s'est mal passé de notre côté. Réessayez dans un instant.",
	'errors.backHome': "Retour à l'accueil",
	'errors.quickLinks': 'Vous cherchiez peut-être :',

	// ── Audio player ────────────────────────────────────────────
	'player.play': 'Lecture',
	'player.pause': 'Pause',
	'player.previous': 'Piste précédente',
	'player.next': 'Piste suivante',
	'player.mute': 'Couper le son',
	'player.unmute': 'Activer le son',
	'player.shuffle': 'Lecture aléatoire',
	'player.repeatOne': 'Répéter la piste',
	'player.close': 'Fermer le lecteur',
	'player.download': 'Télécharger',
	'player.share': 'Partager',
	'player.favorite': 'Ajouter aux favoris',
	'player.unfavorite': 'Retirer des favoris',
	'player.lyrics': 'Paroles',
	'player.sleepTimer': 'Minuterie de veille',
	'player.progressLabel': 'Position de lecture',
	'player.timeOf': '{current} sur {total}',

	// ── Live player ─────────────────────────────────────────────
	'live.listen': 'Écouter le direct',
	'live.pause': 'Mettre en pause le direct',
	'live.backToLive': 'Revenir au direct',
	'live.atLive': 'En direct',
	'live.reload': 'Recharger le direct',
	'live.scrubberLabel': 'Position dans le direct',
	'live.behindLive': '{label} derrière le direct',
	'live.expandThumbnail': 'Agrandir la vignette',
	'live.closeLightbox': 'Fermer',

	// ── Forms ───────────────────────────────────────────────────
	'forms.submit': 'Envoyer',
	'forms.sending': 'Envoi en cours...',
	'forms.requiredField': 'Ce champ est requis.',

	// ── Global search ───────────────────────────────────────────
	'search.open': 'Rechercher sur le site',
	'search.placeholder': 'Rechercher une prédication, un chant...',
	'search.close': 'Fermer la recherche',
	'search.sermons': 'Prédications',
	'search.songs': 'Musique',
	'search.transcriptions': 'Transcriptions',
	'search.recordings': 'Rediffusions',
	'search.seeAll': 'Voir tous les résultats',
	'search.noResults': 'Aucun résultat. Essayez un autre mot.',
	'search.minChars': 'Tapez au moins 2 caractères pour rechercher.',

	// ── Misc chrome ─────────────────────────────────────────────
	'misc.views': 'vues',
	'misc.seeMore': 'Voir plus',
	'misc.seeLess': 'Voir moins',
	'misc.seeAll': 'Tout voir',
	'misc.sermonBadge': 'Prédication',
	'misc.retransmissionBadge': 'Retransmission'
} as const;
