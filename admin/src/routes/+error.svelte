<script lang="ts">
	import { page } from '$app/stores';
	import { t, type TranslationKey } from '$lib/i18n';

	// Status-aware copy: 404 (mistyped URL), 403 (permission walls are common in
	// the admin), everything else is treated as a server error.
	const kind = $derived(
		$page.status === 404 ? 'notFound' : $page.status === 403 ? 'forbidden' : 'server'
	);
	const titleKey = $derived(
		(kind === 'notFound'
			? 'errors.notFoundTitle'
			: kind === 'forbidden'
				? 'errors.forbiddenTitle'
				: 'errors.serverTitle') satisfies TranslationKey
	);
	const bodyKey = $derived(
		(kind === 'notFound'
			? 'errors.notFoundBody'
			: kind === 'forbidden'
				? 'errors.forbiddenBody'
				: 'errors.serverBody') satisfies TranslationKey
	);
</script>

<svelte:head>
	<title>{$page.status} — Missionnaire Admin</title>
</svelte:head>

<div class="flex min-h-[70vh] items-center justify-center px-4 py-12">
	<div class="w-full max-w-lg border border-stone-200/60 bg-white/40 p-10 text-center">
		<p class="mb-4 font-body text-[10px] font-bold uppercase tracking-[0.35em] text-primary">
			{$page.status}
		</p>
		<h1 class="mb-3 font-display text-3xl font-semibold text-stone-900 md:text-4xl">
			{$t(titleKey)}
		</h1>
		<p class="mx-auto mb-2 max-w-sm font-body text-sm text-stone-500">
			{$t(bodyKey)}
		</p>
		{#if kind === 'server' && $page.error?.message}
			<p class="mx-auto max-w-sm font-body text-xs text-stone-400">{$page.error.message}</p>
		{/if}

		<div class="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
			<button class="admin-btn-secondary" onclick={() => location.reload()}>
				{$t('errors.retry')}
			</button>
			<a href="/" class="admin-btn-primary">
				{$t('errors.backToDashboard')}
			</a>
		</div>
	</div>
</div>
