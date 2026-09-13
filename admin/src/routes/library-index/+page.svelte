<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { enhance } from '$app/forms';
	import { t } from '$lib/i18n';
	import type { PageData, ActionData } from './$types';
	let { data, form }: { data: PageData; form: ActionData } = $props();
	const statuses = ['pending', 'processing', 'ready', 'failed', 'no_text'] as const;
	let refreshing = $state(false);
	async function refresh() {
		if (refreshing || document.hidden) return;
		refreshing = true;
		try {
			await invalidateAll();
		} finally {
			refreshing = false;
		}
	}
	onMount(() => {
		const timer = setInterval(() => {
			void refresh();
		}, 15000);
		return () => clearInterval(timer);
	});
</script>

<svelte:head><title>{$t('index.title')} — Missionnaire Admin</title></svelte:head>

<div class="mx-auto max-w-5xl space-y-6 p-4 sm:p-8">
	<header class="space-y-2">
		<h1 class="font-display text-3xl text-stone-800">{$t('index.title')}</h1>
		<p class="max-w-3xl text-sm leading-relaxed text-stone-500">{$t('index.description')}</p>
	</header>
	<div class="flex flex-wrap items-center justify-between gap-3 border-y border-stone-200 py-4">
		<p
			class="text-sm"
			class:text-amber-800={!data.workerOnline}
			class:text-stone-600={data.workerOnline}
		>
			{$t(data.workerOnline ? 'index.online' : 'index.offline')}
		</p>
		<button
			type="button"
			class="min-h-11 px-3 text-sm text-primary underline underline-offset-4 disabled:opacity-50"
			disabled={refreshing}
			onclick={refresh}>{$t('index.refresh')}</button
		>
	</div>
	<nav aria-label={$t('index.status')} class="flex flex-wrap gap-2">
		{#each statuses as status}
			<a
				href={`?status=${status}`}
				aria-current={data.status === status ? 'page' : undefined}
				class="min-h-11 border px-4 py-3 text-sm transition-colors"
				class:bg-primary={data.status === status}
				class:text-stone-900={data.status === status}
				class:border-primary={data.status === status}
				class:border-stone-200={data.status !== status}
			>
				{$t(`index.${status}`)} <span class="ml-2 tabular-nums">{data.counts[status]}</span>
			</a>
		{/each}
	</nav>
	{#if form?.retryFailed}<p role="alert" class="text-sm text-red-700">
			{$t('index.retryFailed')}
		</p>{/if}
	{#if form?.retried}<p role="status" class="text-sm text-stone-600">{$t('index.retried')}</p>{/if}
	<ul class="divide-y divide-stone-200 border-y border-stone-200">
		{#each data.jobs as job (job._id)}
			<li class="flex flex-wrap items-start justify-between gap-4 py-5">
				<div class="min-w-0 flex-1 space-y-1">
					<p class="break-words font-medium text-stone-800">{job.title}</p>
					<p class="break-all text-xs text-stone-500">{job.fileName}</p>
					<p class="text-xs text-stone-500">
						{job.collection} · {$t(`index.${job.status}`)} · {job.updatedAt
							.slice(0, 16)
							.replace('T', ' ')} UTC
					</p>
					{#if job.error}<p class="break-words text-sm text-red-700">{job.error}</p>{/if}
					{#if job.status === 'no_text'}<p class="text-sm text-stone-500">
							{$t('index.noTextHelp')}
						</p>{/if}
				</div>
				{#if job.status === 'failed' || job.status === 'no_text'}
					<form method="POST" action="?/retry" use:enhance>
						<input type="hidden" name="id" value={job._id} />
						<button class="min-h-11 border border-stone-300 px-4 text-sm hover:bg-stone-50"
							>{$t('index.retry')}</button
						>
					</form>
				{/if}
			</li>
		{:else}<li class="py-12 text-center text-sm text-stone-500">{$t('index.empty')}</li>{/each}
	</ul>
	<nav class="flex justify-between text-sm text-primary" aria-label={$t('index.pages')}>
		{#if data.page > 1}<a
				class="min-h-11 py-3 underline"
				href={`?status=${data.status}&page=${data.page - 1}`}>{$t('index.previous')}</a
			>{:else}<span></span>{/if}
		{#if data.page * 50 < data.counts[data.status]}<a
				class="min-h-11 py-3 underline"
				href={`?status=${data.status}&page=${data.page + 1}`}>{$t('index.next')}</a
			>{/if}
	</nav>
</div>
