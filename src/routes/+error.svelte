<script lang="ts">
	import { page } from '$app/stores';
	import { t } from '../i18n';

	let isNotFound = $derived($page.status === 404);

	const quickLinks = [
		{ href: '/predications', key: 'nav.predications' },
		{ href: '/musique', key: 'nav.musique' },
		{ href: '/live', key: 'nav.direct' },
		{ href: '/transcriptions', key: 'nav.transcriptions' }
	] as const;
</script>

<svelte:head>
	<title>{$page.status} — Missionnaire Network</title>
</svelte:head>

<div class="bg-cream flex flex-col items-center justify-center min-h-[70vh] px-6 py-16 text-center">
	<p class="text-[10px] font-bold uppercase tracking-[0.35em] text-missionnaire mb-4 font-body">
		{$page.status}
	</p>
	<h1 class="font-display text-4xl md:text-5xl font-semibold text-stone-900 mb-4">
		{isNotFound ? $t('errors.notFoundTitle') : $t('errors.serverTitle')}
	</h1>
	<p class="text-sm md:text-base text-stone-500 font-body max-w-md mb-2">
		{isNotFound ? $t('errors.notFoundBody') : $t('errors.serverBody')}
	</p>
	{#if !isNotFound && $page.error?.message}
		<p class="text-xs text-stone-400 font-body max-w-md">{$page.error.message}</p>
	{/if}

	<div class="mt-8 flex flex-col sm:flex-row items-center gap-3">
		<button
			class="inline-flex items-center justify-center rounded-full border border-missionnaire px-6 py-3 text-[11px] font-bold uppercase tracking-[0.18em] font-body text-missionnaire transition-colors hover:bg-missionnaire/5"
			onclick={() => location.reload()}
		>
			{$t('errors.retry')}
		</button>
		<a
			href="/"
			class="inline-flex items-center justify-center rounded-full bg-missionnaire px-6 py-3 text-[11px] font-bold uppercase tracking-[0.18em] font-body text-white transition-colors hover:bg-missionnaire/90"
		>
			{$t('errors.backHome')}
		</a>
	</div>

	<div class="mt-12 pt-8 border-t border-stone-200/60 w-full max-w-md">
		<p class="text-[10px] font-bold uppercase tracking-[0.25em] text-stone-400 font-body mb-4">
			{$t('errors.quickLinks')}
		</p>
		<nav class="flex flex-wrap items-center justify-center gap-2">
			{#each quickLinks as link}
				<a
					href={link.href}
					class="px-4 py-2 border border-stone-200/80 bg-white/40 text-[11px] font-bold uppercase tracking-wider font-body text-stone-500 transition-colors hover:border-missionnaire hover:text-missionnaire"
				>
					{$t(link.key)}
				</a>
			{/each}
		</nav>
	</div>
</div>
