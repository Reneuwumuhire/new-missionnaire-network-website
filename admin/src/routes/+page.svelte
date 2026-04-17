<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	function formatBytes(bytes: number): string {
		if (bytes === 0) return '0 B';
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
	}

	function formatDate(date: string | Date): string {
		return new Date(date).toLocaleDateString('fr-FR', {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		});
	}

	function formatTime(date: string | Date): string {
		return new Date(date).toLocaleTimeString('fr-FR', {
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function actionLabel(action: string): string {
		const labels: Record<string, string> = {
			create: 'Ajout',
			update: 'Modification',
			delete: 'Suppression',
			bulk_delete: 'Suppression groupée',
			bulk_update: 'Modification groupée',
			login: 'Connexion',
			logout: 'Déconnexion'
		};
		return labels[action] ?? action;
	}

	function actionColor(action: string): string {
		if (action.includes('delete')) return 'bg-red-100 text-red-700';
		if (action === 'create') return 'bg-green-100 text-green-700';
		if (action.includes('update')) return 'bg-blue-100 text-blue-700';
		return 'bg-stone-100 text-stone-600';
	}

	const maxCategoryCount = $derived(
		Math.max(...(data.stats.categoryDistribution.map((c) => c.count) || [1]))
	);
</script>

<svelte:head>
	<title>Tableau de bord - Missionnaire Admin</title>
</svelte:head>

{#if data.liveButNotBroadcasting}
	<a
		href="/recordings"
		class="mb-6 flex items-start gap-3 rounded-2xl border border-green-200 bg-green-50/80 p-5 transition-colors hover:bg-green-50"
	>
		<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-green-100">
			<span class="relative inline-flex h-2.5 w-2.5">
				<span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-75"></span>
				<span class="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-600"></span>
			</span>
		</div>
		<div class="min-w-0 flex-1">
			<p class="text-sm font-semibold text-green-800">Direct détecté — prêt à passer en direct</p>
			<p class="mt-1 text-xs text-green-700">
				Le flux audio est actif sur Icecast mais l'audience ne le voit pas encore. Cliquez pour aller en direct.
			</p>
		</div>
	</a>
{:else if data.liveButNotRecording}
	<a
		href="/recordings"
		class="mb-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/80 p-5 transition-colors hover:bg-amber-50"
	>
		<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100">
			<svg class="h-5 w-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
				<path stroke-linecap="round" stroke-linejoin="round" d="M12 3a9 9 0 109 9" />
			</svg>
		</div>
		<div class="min-w-0 flex-1">
			<p class="text-sm font-semibold text-amber-800">En direct — aucun enregistrement en cours</p>
			<p class="mt-1 text-xs text-amber-700">
				Le direct est diffusé mais rien n'est sauvegardé. Cliquez pour démarrer l'enregistrement.
			</p>
		</div>
	</a>
{/if}

<!-- Header -->
<div class="mb-8 flex items-end justify-between">
	<div>
		<h1 class="font-display text-3xl font-bold text-stone-800">Tableau de bord</h1>
		<p class="mt-1 text-sm text-stone-500">Vue d'ensemble de votre bibliothèque audio</p>
	</div>
	<a href="/audio/new" class="admin-btn-primary">
		<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
			<path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
		</svg>
		Importer un audio
	</a>
</div>

<!-- Stats cards -->
<div class="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
	<!-- Total tracks -->
	<div class="card-lift rounded-2xl border border-stone-200/60 bg-white p-5">
		<div class="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-missionnaire-50">
			<svg class="h-5 w-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path stroke-linecap="round" stroke-linejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
			</svg>
		</div>
		<p class="text-2xl font-semibold text-stone-800">{data.stats.totalTracks}</p>
		<p class="text-sm text-stone-500">Pistes audio</p>
	</div>

	<!-- Total storage -->
	<div class="card-lift rounded-2xl border border-stone-200/60 bg-white p-5">
		<div class="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50">
			<svg class="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path stroke-linecap="round" stroke-linejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
			</svg>
		</div>
		<p class="text-2xl font-semibold text-stone-800">{formatBytes(data.stats.totalStorage)}</p>
		<p class="text-sm text-stone-500">Stockage total</p>
	</div>

	<!-- Uploads this month -->
	<div class="card-lift rounded-2xl border border-stone-200/60 bg-white p-5">
		<div class="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-green-50">
			<svg class="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path stroke-linecap="round" stroke-linejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
			</svg>
		</div>
		<p class="text-2xl font-semibold text-stone-800">{data.stats.uploadsThisMonth}</p>
		<p class="text-sm text-stone-500">Importés ce mois</p>
	</div>

	<!-- Missing metadata -->
	<div class="card-lift rounded-2xl border border-stone-200/60 bg-white p-5">
		<div class="mb-3 flex h-10 w-10 items-center justify-center rounded-xl {data.stats.missingMetadata > 0 ? 'bg-amber-50' : 'bg-green-50'}">
			<svg class="h-5 w-5 {data.stats.missingMetadata > 0 ? 'text-amber-600' : 'text-green-600'}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
			</svg>
		</div>
		<p class="text-2xl font-semibold text-stone-800">{data.stats.missingMetadata}</p>
		<p class="text-sm text-stone-500">Métadonnées manquantes</p>
	</div>
</div>

<div class="grid grid-cols-1 gap-6 xl:grid-cols-2">
	<!-- Category distribution -->
	<div class="rounded-2xl border border-stone-200/60 bg-white p-6">
		<h2 class="mb-4 font-display text-xl font-semibold text-stone-800">Répartition par catégorie</h2>
		<div class="space-y-3">
			{#each data.stats.categoryDistribution as cat}
				<div class="flex items-center gap-3">
					<span class="w-28 truncate text-sm text-stone-600">{cat.category}</span>
					<div class="flex-1">
						<div class="h-6 overflow-hidden rounded-full bg-cream-dark">
							<div
								class="h-full rounded-full bg-gradient-to-r from-primary to-missionnaire-400 transition-all duration-500"
								style="width: {(cat.count / maxCategoryCount) * 100}%"
							></div>
						</div>
					</div>
					<span class="w-10 text-right text-sm font-medium text-stone-700">{cat.count}</span>
				</div>
			{/each}
			{#if data.stats.categoryDistribution.length === 0}
				<p class="text-sm text-stone-400 italic">Aucune catégorie trouvée</p>
			{/if}
		</div>
	</div>

	<!-- Recent uploads -->
	<div class="rounded-2xl border border-stone-200/60 bg-white p-6">
		<div class="mb-4 flex items-center justify-between">
			<h2 class="font-display text-xl font-semibold text-stone-800">Ajouts récents</h2>
			<a href="/audio" class="text-sm font-medium text-primary hover:text-missionnaire-600">
				Voir tout &rarr;
			</a>
		</div>
		<div class="space-y-3">
			{#each data.stats.recentUploads as audio}
				<a
					href="/audio/{audio._id}"
					class="flex items-center gap-3 rounded-xl p-2.5 transition-colors hover:bg-cream"
				>
					<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-missionnaire-50">
						<svg class="h-4 w-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" />
						</svg>
					</div>
					<div class="min-w-0 flex-1">
						<p class="truncate text-sm font-medium text-stone-700">{audio.title || 'Sans titre'}</p>
						<p class="truncate text-xs text-stone-400">{audio.artist || 'Artiste inconnu'} &middot; {audio.category}</p>
					</div>
					<span class="shrink-0 text-xs text-stone-400">{formatDate(audio.uploaded_at)}</span>
				</a>
			{/each}
			{#if data.stats.recentUploads.length === 0}
				<p class="py-4 text-center text-sm text-stone-400 italic">Aucun audio importé</p>
			{/if}
		</div>
	</div>
</div>

<!-- Activity log -->
{#if data.recentActivity.length > 0}
	<div class="mt-6 rounded-2xl border border-stone-200/60 bg-white p-6">
		<h2 class="mb-4 font-display text-xl font-semibold text-stone-800">Activité récente</h2>
		<div class="space-y-2">
			{#each data.recentActivity as log}
				<div class="flex items-center gap-3 rounded-lg px-3 py-2">
					<span class="inline-flex shrink-0 rounded-md px-2 py-0.5 text-xs font-medium {actionColor(log.action)}">
						{actionLabel(log.action)}
					</span>
					<span class="min-w-0 flex-1 truncate text-sm text-stone-600">
						{log.user_email}
						{#if log.target_id}
							&middot; <span class="font-mono text-xs text-stone-400">{log.target_id.slice(-6)}</span>
						{/if}
					</span>
					<span class="shrink-0 text-xs text-stone-400">
						{formatDate(log.timestamp)} {formatTime(log.timestamp)}
					</span>
				</div>
			{/each}
		</div>
	</div>
{/if}
