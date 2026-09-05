<script lang="ts">
	import type { PageData } from './$types';
	import { invalidateAll } from '$app/navigation';
	import ListSkeleton from '$lib/components/ListSkeleton.svelte';
	import { t, type TranslationKey } from '$lib/i18n';

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

	function actionKey(action: string): TranslationKey | null {
		const keys: Record<string, TranslationKey> = {
			create: 'dashboard.actionCreate',
			update: 'dashboard.actionUpdate',
			delete: 'dashboard.actionDelete',
			bulk_delete: 'dashboard.actionBulkDelete',
			bulk_update: 'dashboard.actionBulkUpdate',
			login: 'dashboard.actionLogin',
			logout: 'dashboard.actionLogout'
		};
		return keys[action] ?? null;
	}

	function actionColor(action: string): string {
		if (action.includes('delete')) return 'bg-red-100 text-red-700';
		if (action === 'create') return 'bg-green-100 text-green-700';
		if (action.includes('update')) return 'bg-blue-100 text-blue-700';
		return 'bg-stone-100 text-stone-600';
	}
</script>

<svelte:head>
	<title>{$t('dashboard.pageTitle')}</title>
</svelte:head>

<!-- Header -->
<div class="mb-8 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
	<div class="min-w-0">
		<h1 class="font-display text-3xl font-semibold text-stone-800">{$t('dashboard.title')}</h1>
		<p class="mt-2 text-sm leading-relaxed text-stone-500">{$t('dashboard.subtitle')}</p>
	</div>
</div>

{#if data.user?.permissions.can_manage_recordings}
	<a
		href="/recordings"
		class="mb-6 flex items-center justify-between gap-4 border border-stone-200 bg-white p-4"
	>
		<span
			><span class="block text-sm font-semibold"
				>{$t(data.broadcastIsLive ? 'dashboard.onAir' : 'dashboard.offAir')}</span
			><span class="mt-1 block text-xs text-stone-500">{$t('dashboard.liveControls')}</span></span
		>
		<span
			class="h-2.5 w-2.5 shrink-0 rounded-full {data.broadcastIsLive
				? 'bg-red-500'
				: 'bg-stone-300'}"
		></span>
	</a>
{/if}

<nav aria-label={$t('dashboard.quickActions')} class="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
	{#each [{ show: data.user?.permissions.can_manage_recordings, href: '/recordings', label: 'nav.recordings', detail: 'dashboard.liveControls' }, { show: data.canAddAudio, href: '/audio/new', label: 'dashboard.importOne', detail: 'dashboard.addContent' }, { show: data.canManageAudio && !data.canAddAudio, href: '/audio', label: 'nav.audioLibrary', detail: 'dashboard.browse' }, { show: data.user?.permissions.can_view_questions, href: '/questions', label: 'nav.questions', detail: 'dashboard.answer' }, { show: data.user?.permissions.can_review_lyrics, href: '/lyrics-review', label: 'nav.lyricsReview', detail: 'dashboard.review' }] as action}
		{#if action.show}
			<a
				href={action.href}
				class="group min-w-0 border border-stone-200 bg-white p-4 transition-colors hover:border-primary hover:bg-orange-50"
			>
				<span class="mb-3 block text-primary" aria-hidden="true">↗</span>
				<span class="block text-sm font-semibold text-stone-800"
					>{$t(action.label as TranslationKey)}</span
				>
				<span class="mt-1 block text-xs leading-relaxed text-stone-500"
					>{$t(action.detail as TranslationKey)}</span
				>
			</a>
		{/if}
	{/each}
</nav>

{#await data.deferred}
	<ListSkeleton variant="panel" rows={3} />
{:then dash}
	<section class="mb-6 border border-stone-200/60 bg-white/60 p-4 sm:p-6">
		<h2 class="mb-3 font-display text-xl font-semibold">{$t('dashboard.attention')}</h2>
		<div class="divide-y divide-stone-200/60">
			{#if dash.stats}
				<a
					class="flex items-center justify-between gap-3 py-3 text-sm hover:text-primary"
					href="/audio?metadata=missing"
					><span>{$t('dashboard.missingMetadata')}</span><strong
						>{dash.stats.missingMetadata} →</strong
					></a
				>
			{/if}
			{#if dash.questions}
				<a
					class="flex items-center justify-between gap-3 py-3 text-sm hover:text-primary"
					href="/questions/pending"
					><span>{$t('dashboard.pendingQuestions')}</span><strong>{dash.questions.pending} →</strong
					></a
				>
				<a
					class="flex items-center justify-between gap-3 py-3 text-sm hover:text-primary"
					href="/questions/reports"
					><span>{$t('dashboard.reports')}</span><strong>{dash.questions.openReports} →</strong></a
				>
			{/if}
			{#if data.user?.permissions.can_review_lyrics}
				<a
					class="flex items-center justify-between gap-3 py-3 text-sm hover:text-primary"
					href="/lyrics-review"
					><span>{$t('nav.lyricsReview')}</span><span aria-hidden="true">→</span></a
				>
			{/if}
			{#if !dash.stats && !dash.questions && !data.user?.permissions.can_review_lyrics}
				<a class="block py-3 text-sm hover:text-primary" href="/recordings"
					>{$t('dashboard.liveControls')} →</a
				>
			{/if}
		</div>
	</section>
	{#if data.user?.permissions.can_manage_recordings}
		<section class="mb-6 border border-stone-200/60 bg-white/60 p-4 sm:p-6">
			<h2 class="font-display text-xl font-semibold">{$t('dashboard.nextLive')}</h2>
			{#each dash.upcoming as live}
				<a href="/recordings" class="mt-3 block hover:text-primary"
					><span class="block text-sm font-semibold">{live.title}</span><span
						class="mt-1 block text-xs text-stone-500"
						>{formatDate(live.scheduled_at)} · {formatTime(live.scheduled_at)}</span
					></a
				>
			{:else}<p class="mt-2 text-sm text-stone-500">{$t('dashboard.noUpcoming')}</p>{/each}
			<a href="/recordings" class="mt-4 inline-block text-sm font-medium text-primary"
				>{$t('dashboard.manageSchedule')} →</a
			>
		</section>
	{/if}
	{#if dash.stats}
		<div class="grid grid-cols-1 gap-6">
			<!-- Recent uploads -->
			<div class="border border-stone-200/60 bg-white/40 p-6">
				<div class="mb-4 flex items-center justify-between">
					<h2 class="font-display text-xl font-semibold text-stone-800">
						{$t('dashboard.recentUploads')}
					</h2>
					{#if data.canManageAudio}
						<a href="/audio" class="text-sm font-medium text-primary hover:text-missionnaire-600">
							{$t('dashboard.viewAll')} &rarr;
						</a>
					{/if}
				</div>
				<div class="space-y-3">
					{#each dash.stats.recentUploads.slice(0, 5) as audio}
						<svelte:element
							this={data.canManageAudio ? 'a' : 'div'}
							href={data.canManageAudio ? `/audio/${audio._id}` : undefined}
							class="flex items-center gap-3 p-2.5 transition-colors {data.canManageAudio
								? 'hover:bg-cream'
								: ''}"
						>
							<div
								class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-missionnaire-50"
							>
								<svg
									class="h-4 w-4 text-primary"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
									stroke-width="2"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z"
									/>
								</svg>
							</div>
							<div class="min-w-0 flex-1">
								<p class="truncate text-sm font-medium text-stone-700">
									{audio.title || $t('common.untitled')}
								</p>
								<p class="truncate text-xs text-stone-400">
									{audio.artist || $t('common.unknownArtist')} &middot; {audio.category}
								</p>
							</div>
							<span class="shrink-0 text-xs text-stone-400">{formatDate(audio.uploaded_at)}</span>
						</svelte:element>
					{/each}
					{#if dash.stats.recentUploads.length === 0}
						<p class="py-4 text-center text-sm text-stone-400 italic">
							{$t('dashboard.noUploads')}
						</p>
					{/if}
				</div>
			</div>
		</div>

		<h2 class="mb-3 mt-6 font-display text-xl font-semibold">{$t('dashboard.overview')}</h2>
		<!-- Stats cards -->
		<div class="mb-8 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
			<!-- Total tracks -->
			<div class="card-lift border border-stone-200/60 bg-white/40 min-w-0 p-3.5 sm:p-5">
				<div
					class="mb-2 flex h-8 w-8 sm:mb-3 sm:h-10 sm:w-10 items-center justify-center rounded-full bg-missionnaire-50"
				>
					<svg
						class="h-5 w-5 text-primary"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
						/>
					</svg>
				</div>
				<p class="text-xl sm:text-2xl font-semibold text-stone-800">{dash.stats.totalTracks}</p>
				<p class="text-xs leading-relaxed sm:text-sm text-stone-500">
					{$t('dashboard.totalTracks')}
				</p>
			</div>

			<!-- Total storage -->
			<div class="card-lift border border-stone-200/60 bg-white/40 min-w-0 p-3.5 sm:p-5">
				<div
					class="mb-2 flex h-8 w-8 sm:mb-3 sm:h-10 sm:w-10 items-center justify-center rounded-full bg-blue-50"
				>
					<svg
						class="h-5 w-5 text-blue-600"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"
						/>
					</svg>
				</div>
				<p class="text-xl sm:text-2xl font-semibold text-stone-800">
					{formatBytes(dash.stats.totalStorage)}
				</p>
				<p class="text-xs leading-relaxed sm:text-sm text-stone-500">
					{$t('dashboard.totalStorage')}
				</p>
			</div>

			<!-- Uploads this month -->
			<div class="card-lift border border-stone-200/60 bg-white/40 min-w-0 p-3.5 sm:p-5">
				<div
					class="mb-2 flex h-8 w-8 sm:mb-3 sm:h-10 sm:w-10 items-center justify-center rounded-full bg-green-50"
				>
					<svg
						class="h-5 w-5 text-green-600"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
						/>
					</svg>
				</div>
				<p class="text-xl sm:text-2xl font-semibold text-stone-800">
					{dash.stats.uploadsThisMonth}
				</p>
				<p class="text-xs leading-relaxed sm:text-sm text-stone-500">
					{$t('dashboard.uploadsThisMonth')}
				</p>
			</div>

			<!-- Missing metadata -->
			<div class="card-lift border border-stone-200/60 bg-white/40 min-w-0 p-3.5 sm:p-5">
				<div
					class="mb-2 flex h-8 w-8 sm:mb-3 sm:h-10 sm:w-10 items-center justify-center rounded-full {dash
						.stats.missingMetadata > 0
						? 'bg-amber-50'
						: 'bg-green-50'}"
				>
					<svg
						class="h-5 w-5 {dash.stats.missingMetadata > 0 ? 'text-amber-600' : 'text-green-600'}"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"
						/>
					</svg>
				</div>
				<p class="text-xl sm:text-2xl font-semibold text-stone-800">{dash.stats.missingMetadata}</p>
				<p class="text-xs leading-relaxed sm:text-sm text-stone-500">
					{$t('dashboard.missingMetadata')}
				</p>
			</div>
		</div>
	{/if}

	<!-- Activity log -->
	{#if dash.recentActivity.length > 0}
		<div class="mt-6 border border-stone-200/60 bg-white/40 p-6">
			<h2 class="mb-4 font-display text-xl font-semibold text-stone-800">
				{$t('dashboard.recentActivity')}
			</h2>
			<div class="space-y-2">
				{#each dash.recentActivity as log}
					{@const labelKey = actionKey(log.action)}
					<div class="flex items-center gap-3 px-3 py-2">
						<span
							class="inline-flex shrink-0 rounded-md px-2 py-0.5 text-xs font-medium {actionColor(
								log.action
							)}"
						>
							{labelKey ? $t(labelKey) : log.action}
						</span>
						<span class="min-w-0 flex-1 truncate text-sm text-stone-600">
							{log.user_email}
							{#if log.target_id}
								&middot; <span class="font-mono text-xs text-stone-400"
									>{log.target_id.slice(-6)}</span
								>
							{/if}
						</span>
						<span class="shrink-0 text-xs text-stone-400">
							{formatDate(log.timestamp)}
							{formatTime(log.timestamp)}
						</span>
					</div>
				{/each}
			</div>
		</div>
	{/if}
{:catch}
	<div class="border border-red-200 bg-red-50/80 p-8 text-center">
		<p class="text-sm text-red-700">{$t('common.loadError')}</p>
		<button class="admin-btn-secondary admin-btn-compact mt-4" onclick={() => invalidateAll()}>
			{$t('errors.retry')}
		</button>
	</div>
{/await}
