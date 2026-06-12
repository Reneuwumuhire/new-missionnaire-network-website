<script lang="ts">
	import { loadingSubmit } from '$lib/actions/loadingSubmit';
	import FormattedQuestionText from '$lib/components/questions/FormattedQuestionText.svelte';
	import ListSkeleton from '$lib/components/ListSkeleton.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import { confirmDialog } from '$lib/stores/confirm-dialog';
	import { invalidateAll } from '$app/navigation';
	import { t } from '$lib/i18n';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const confirmedPermanentDeleteForms = new WeakSet<HTMLFormElement>();

	function formatDate(value: string): string {
		return new Date(value).toLocaleDateString('fr-FR', {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		});
	}

	async function confirmPermanentDelete(event: SubmitEvent) {
		const form = event.currentTarget instanceof HTMLFormElement ? event.currentTarget : null;
		const submitter =
			event.submitter instanceof HTMLButtonElement || event.submitter instanceof HTMLInputElement
				? event.submitter
				: null;
		if (!form) return;

		if (confirmedPermanentDeleteForms.has(form)) {
			confirmedPermanentDeleteForms.delete(form);
			return;
		}

		event.preventDefault();
		const ok = await confirmDialog.ask({
			title: $t('questions.confirmDelete.title'),
			message: $t('questions.confirmDelete.message'),
			confirmLabel: $t('questions.confirmDelete.confirm'),
			cancelLabel: $t('questions.confirmDelete.cancel'),
			tone: 'danger'
		});
		if (!ok) return;

		confirmedPermanentDeleteForms.add(form);
		form.requestSubmit(submitter ?? undefined);
	}
</script>

<svelte:head>
	<title>{$t('questions.pending.headTitle')}</title>
</svelte:head>

<div class="mb-8 flex items-end justify-between">
	<div>
		<h1 class="font-display text-3xl font-semibold text-stone-800">{$t('questions.pending.title')}</h1>
		{#await data.deferred}
			<div class="mt-2 h-3.5 w-40 animate-pulse rounded-full bg-stone-200" aria-hidden="true"></div>
		{:then d}
			<p class="mt-1 text-sm text-stone-500">
				{d.total === 1
					? $t('questions.pending.countOne', { count: d.total })
					: $t('questions.pending.countMany', { count: d.total })}
			</p>
		{/await}
	</div>
	<a href="/questions" class="admin-btn-secondary">{$t('questions.allQuestions')}</a>
</div>

{#await data.deferred}
	<ListSkeleton variant="cards" rows={4} />
{:then d}
{#if d.questions.length === 0}
	<EmptyState message={$t('questions.pending.empty')} />
{:else}
	<div class="grid gap-4">
		{#each d.questions as question}
			<article class="border border-stone-200/60 bg-white/50 p-5">
				<div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
					<div class="min-w-0">
						<p class="text-xs uppercase tracking-[0.16em] text-stone-400">
							{question.authorDisplayName} - {formatDate(question.createdAt)}
						</p>
						<h2 class="mt-2 font-display text-2xl font-semibold text-stone-800">
							{question.title}
						</h2>
						<FormattedQuestionText
							text={question.body}
							proseClass="mt-2 text-sm leading-6 text-stone-600"
						/>
					</div>
					<div class="flex shrink-0 flex-wrap gap-2">
						<form method="POST" action="?/moderate" use:loadingSubmit>
							<input type="hidden" name="id" value={question._id} />
							<input type="hidden" name="actionName" value="approve" />
							<button class="admin-btn-primary">{$t('questions.approve')}</button>
						</form>
						<form method="POST" action="?/moderate" class="flex gap-2" use:loadingSubmit>
							<input type="hidden" name="id" value={question._id} />
							<input type="hidden" name="actionName" value="reject" />
							<input name="reason" class="admin-input w-48" placeholder={$t('questions.reasonPlaceholder')} />
							<button class="admin-btn-danger">{$t('questions.reject')}</button>
						</form>
						{#if data.canDelete && !data.canDeletePermanently}
							<form method="POST" action="?/moderate" use:loadingSubmit>
								<input type="hidden" name="id" value={question._id} />
								<input type="hidden" name="actionName" value="soft_delete" />
								<input
									type="hidden"
									name="reason"
									value="Suppression depuis les questions en attente"
								/>
								<button class="admin-btn-danger" data-loading-label={$t('questions.deleting')}>
									{$t('questions.delete')}
								</button>
							</form>
						{/if}
						{#if data.canDeletePermanently}
							<form
								method="POST"
								action="?/moderate"
								use:loadingSubmit
								onsubmit={confirmPermanentDelete}
							>
								<input type="hidden" name="id" value={question._id} />
								<input type="hidden" name="actionName" value="permanent_delete" />
								<input
									type="hidden"
									name="reason"
									value="Suppression définitive depuis les questions en attente"
								/>
								<button class="admin-btn-danger" data-loading-label={$t('questions.deleting')}>
									{$t('questions.deletePermanently')}
								</button>
							</form>
						{/if}
						<a href={`/questions/${question._id}`} class="admin-btn-secondary">{$t('questions.open')}</a>
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
