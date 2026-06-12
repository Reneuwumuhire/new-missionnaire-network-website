<script lang="ts">
	import { loadingSubmit } from '$lib/actions/loadingSubmit';
	import ListSkeleton from '$lib/components/ListSkeleton.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import { invalidateAll } from '$app/navigation';
	import { t } from '$lib/i18n';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	function formatDate(value: string): string {
		return new Date(value).toLocaleDateString('fr-FR', {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		});
	}
</script>

<svelte:head>
	<title>{$t('questions.reports.headTitle')}</title>
</svelte:head>

<div class="mb-8 flex items-end justify-between">
	<div>
		<h1 class="font-display text-3xl font-semibold text-stone-800">{$t('questions.reports.title')}</h1>
		{#await data.deferred}
			<div class="mt-2 h-3.5 w-40 animate-pulse rounded-full bg-stone-200" aria-hidden="true"></div>
		{:then d}
			<p class="mt-1 text-sm text-stone-500">
				{d.total === 1
					? $t('questions.reports.countOne', { count: d.total })
					: $t('questions.reports.countMany', { count: d.total })}
			</p>
		{/await}
	</div>
	<a href="/questions" class="admin-btn-secondary">{$t('questions.title')}</a>
</div>

{#await data.deferred}
	<ListSkeleton variant="cards" rows={4} />
{:then d}
{#if d.reports.length === 0}
	<EmptyState icon="flag" message={$t('questions.reports.empty')} />
{:else}
	<div class="grid gap-4">
		{#each d.reports as report}
			{@const question = d.questions[report.questionId]}
			<article class="border border-stone-200/60 bg-white/50 p-5">
				<div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
					<div>
						<p class="text-xs uppercase tracking-[0.16em] text-stone-400">
							{report.targetType} - {formatDate(report.createdAt)}
						</p>
						<h2 class="mt-2 font-display text-2xl font-semibold text-stone-800">
							{question?.title ?? $t('questions.questionNotFound')}
						</h2>
						<p class="mt-2 text-sm text-stone-600">
							{$t('questions.reportedBy', { name: report.reporterDisplayName })}
							<span class="font-semibold">{report.reason}</span>
						</p>
						{#if report.notes}
							<p
								class="mt-2 whitespace-pre-line border-l-2 border-stone-200 pl-3 text-sm text-stone-500"
							>
								{report.notes}
							</p>
						{/if}
					</div>
					<div class="flex shrink-0 flex-wrap gap-2">
						{#if question}
							<a href={`/questions/${question._id}`} class="admin-btn-secondary">{$t('questions.open')}</a>
						{/if}
						<form method="POST" action="?/resolve" use:loadingSubmit>
							<input type="hidden" name="reportId" value={report._id} />
							<input type="hidden" name="status" value="reviewed" />
							<button class="admin-btn-primary">{$t('questions.markReviewed')}</button>
						</form>
						<form method="POST" action="?/resolve" use:loadingSubmit>
							<input type="hidden" name="reportId" value={report._id} />
							<input type="hidden" name="status" value="dismissed" />
							<button class="admin-btn-secondary">{$t('questions.dismiss')}</button>
						</form>
					</div>
				</div>
			</article>
		{/each}
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
