<script lang="ts">
	import { loadingSubmit } from '$lib/actions/loadingSubmit';
	import { stripRichTextFormatting } from '$lib/questions/rich-text';
	import { confirmDialog } from '$lib/stores/confirm-dialog';
	import { invalidateAll } from '$app/navigation';
	import SkeletonRows from '$lib/components/SkeletonRows.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import { t, type TranslationKey } from '$lib/i18n';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const hasFilters = $derived(
		(data.status && data.status !== 'all') || Boolean(data.search) || Boolean(data.answered)
	);
	const confirmedPermanentDeleteForms = new WeakSet<HTMLFormElement>();

	const statuses: Array<{ value: string; label: TranslationKey }> = [
		{ value: 'all', label: 'questions.filterStatus.all' },
		{ value: 'pending', label: 'questions.filterStatus.pending' },
		{ value: 'approved', label: 'questions.filterStatus.approved' },
		{ value: 'answered', label: 'questions.filterStatus.answered' },
		{ value: 'hidden', label: 'questions.filterStatus.hidden' },
		{ value: 'rejected', label: 'questions.filterStatus.rejected' },
		{ value: 'archived', label: 'questions.filterStatus.archived' }
	];
	const statusLabels: Record<string, TranslationKey> = {
		pending: 'questions.statusLabel.pending',
		approved: 'questions.statusLabel.approved',
		answered: 'questions.statusLabel.answered',
		rejected: 'questions.statusLabel.rejected',
		hidden: 'questions.statusLabel.hidden',
		archived: 'questions.statusLabel.archived'
	};

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

	function formatDate(value: string | null): string {
		if (!value) return '-';
		return new Date(value).toLocaleDateString('fr-FR', {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		});
	}

	function pageHref(page: number): string {
		const params = new URLSearchParams();
		if (data.status && data.status !== 'all') params.set('status', data.status);
		if (data.search) params.set('search', data.search);
		if (data.answered) params.set('answered', data.answered);
		if (page > 1) params.set('page', String(page));
		const query = params.toString();
		return query ? `/questions?${query}` : '/questions';
	}
</script>

<svelte:head>
	<title>{$t('questions.headTitle')}</title>
</svelte:head>

<div class="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
	<div>
		<h1 class="font-display text-3xl font-semibold text-stone-800">{$t('questions.title')}</h1>
		<p class="mt-1 text-sm text-stone-500">
			{$t('questions.subtitle')}
		</p>
	</div>
	{#if data.canModerate}
		{#await data.deferred then d}
			<div class="flex flex-wrap gap-2">
				<a href="/questions/pending" class="admin-btn-secondary admin-btn-compact"
					>{$t('questions.pendingLink', { count: d.stats.pending })}</a
				>
				<a href="/questions/reports" class="admin-btn-secondary admin-btn-compact"
					>{$t('questions.reportsLink', { count: d.stats.openReports })}</a
				>
			</div>
		{/await}
	{/if}
</div>

{#await data.deferred}
	<div class="mb-6 grid gap-3 sm:grid-cols-3" aria-hidden="true">
		{#each Array.from({ length: 3 }) as _}
			<div class="animate-pulse border border-stone-200/60 bg-white/50 p-4">
				<div class="h-3 w-24 rounded-full bg-stone-100"></div>
				<div class="mt-3 h-7 w-12 rounded-full bg-stone-200"></div>
			</div>
		{/each}
	</div>
{:then d}
<div class="mb-6 grid gap-3 sm:grid-cols-3">
	<a
		href="/questions?status=pending"
		aria-current={data.status === 'pending' ? 'page' : undefined}
		class="group border p-4 transition-colors hover:border-primary hover:bg-orange-50/40 {data.status ===
		'pending'
			? 'border-primary bg-orange-50/50'
			: 'border-stone-200/60 bg-white/50'}"
	>
		<p class="text-xs uppercase tracking-[0.16em] text-stone-400">{$t('questions.statusLabel.pending')}</p>
		<div class="mt-1 flex items-end justify-between gap-3">
			<p class="text-2xl font-semibold text-stone-800">{d.stats.pending}</p>
			<span
				class="text-[10px] font-bold uppercase tracking-[0.16em] text-primary opacity-0 transition-opacity group-hover:opacity-100"
			>
				{$t('questions.filterAction')}
			</span>
		</div>
	</a>
	<a
		href="/questions/reports"
		class="group border border-stone-200/60 bg-white/50 p-4 transition-colors hover:border-primary hover:bg-orange-50/40"
	>
		<p class="text-xs uppercase tracking-[0.16em] text-stone-400">{$t('questions.openReports')}</p>
		<div class="mt-1 flex items-end justify-between gap-3">
			<p class="text-2xl font-semibold text-stone-800">{d.stats.openReports}</p>
			<span
				class="text-[10px] font-bold uppercase tracking-[0.16em] text-primary opacity-0 transition-opacity group-hover:opacity-100"
			>
				{$t('questions.review')}
			</span>
		</div>
	</a>
	<a
		href="/questions?status=hidden"
		aria-current={data.status === 'hidden' ? 'page' : undefined}
		class="group border p-4 transition-colors hover:border-primary hover:bg-orange-50/40 {data.status ===
		'hidden'
			? 'border-primary bg-orange-50/50'
			: 'border-stone-200/60 bg-white/50'}"
	>
		<p class="text-xs uppercase tracking-[0.16em] text-stone-400">{$t('questions.filterStatus.hidden')}</p>
		<div class="mt-1 flex items-end justify-between gap-3">
			<p class="text-2xl font-semibold text-stone-800">{d.stats.hidden}</p>
			<span
				class="text-[10px] font-bold uppercase tracking-[0.16em] text-primary opacity-0 transition-opacity group-hover:opacity-100"
			>
				{$t('questions.filterAction')}
			</span>
		</div>
	</a>
</div>
{/await}

<form
	method="GET"
	class="mb-6 grid gap-3 border border-stone-200/60 bg-white/40 p-4 md:grid-cols-[1fr_170px_170px_auto]"
	use:loadingSubmit
>
	<input name="search" value={data.search} placeholder={$t('questions.searchPlaceholder')} class="admin-input" />
	<select name="status" class="admin-input">
		{#each statuses as status}
			<option value={status.value} selected={data.status === status.value}>{$t(status.label)}</option>
		{/each}
	</select>
	<select name="answered" class="admin-input">
		<option value="">{$t('questions.filterStatus.all')}</option>
		<option value="answered" selected={data.answered === 'answered'}>{$t('questions.withAnswer')}</option>
		<option value="unanswered" selected={data.answered === 'unanswered'}>{$t('questions.withoutAnswer')}</option>
	</select>
	<button class="admin-btn-primary justify-center">{$t('questions.filterAction')}</button>
</form>

{#await data.deferred}
	<div class="overflow-hidden border border-stone-200/60 bg-white/40">
		<table class="w-full text-left text-sm">
			<thead>
				<tr class="border-b border-stone-100 bg-cream/50">
					<th class="px-5 py-3.5 font-medium text-stone-500">{$t('questions.table.question')}</th>
					<th class="px-5 py-3.5 font-medium text-stone-500">{$t('questions.table.status')}</th>
					<th class="px-5 py-3.5 font-medium text-stone-500">{$t('questions.table.activity')}</th>
					<th class="w-[260px] px-4 py-3.5 text-right font-medium text-stone-500">{$t('questions.table.actions')}</th>
				</tr>
			</thead>
			<tbody>
				<SkeletonRows rows={8} cols={4} />
			</tbody>
		</table>
	</div>
{:then d}
{#if d.questions.length === 0}
	<EmptyState
		message={$t('questions.empty')}
		actionLabel={hasFilters ? $t('common.resetFilters') : undefined}
		actionHref={hasFilters ? '/questions' : undefined}
	/>
{:else}
	{@const totalPages = Math.max(1, Math.ceil(d.total / data.limit))}
	<div class="overflow-hidden border border-stone-200/60 bg-white/40">
		<table class="w-full text-left text-sm">
			<thead>
				<tr class="border-b border-stone-100 bg-cream/50">
					<th class="px-5 py-3.5 font-medium text-stone-500">{$t('questions.table.question')}</th>
					<th class="px-5 py-3.5 font-medium text-stone-500">{$t('questions.table.status')}</th>
					<th class="px-5 py-3.5 font-medium text-stone-500">{$t('questions.table.activity')}</th>
					<th class="w-[260px] px-4 py-3.5 text-right font-medium text-stone-500">{$t('questions.table.actions')}</th>
				</tr>
			</thead>
			<tbody>
				{#each d.questions as question}
					<tr class="border-b border-stone-50 align-top transition-colors hover:bg-cream/30">
						<td class="px-5 py-4">
							<a
								href={`/questions/${question._id}`}
								class="font-medium text-stone-800 hover:text-primary"
							>
								{question.title}
							</a>
							<p class="mt-1 line-clamp-2 text-xs leading-5 text-stone-500">
								{stripRichTextFormatting(question.body)}
							</p>
							<p class="mt-2 text-[11px] text-stone-400">
								{question.authorDisplayName} - {formatDate(question.createdAt)}
							</p>
						</td>
						<td class="px-5 py-4">
							<span
								class="inline-flex bg-stone-100 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-stone-600"
							>
								{statusLabels[question.status] ? $t(statusLabels[question.status]) : question.status}
							</span>
							{#if question.locked}
								<span class="mt-2 block text-xs text-amber-600">{$t('questions.statusLabel.locked')}</span>
							{/if}
							{#if question.featured}
								<span class="mt-2 block text-xs text-primary">{$t('questions.featuredBadge')}</span>
							{/if}
						</td>
						<td class="px-5 py-4 text-xs text-stone-500">
							<p>{$t('questions.replyCount', { count: question.replyCount })}</p>
							<p>{$t('questions.viewCount', { count: question.viewCount })}</p>
							<p>{$t('questions.reportCount', { count: question.reportCount })}</p>
						</td>
						<td class="w-[260px] px-4 py-4">
							<div class="flex flex-wrap justify-end gap-1.5">
								<a
									href={`/questions/${question._id}`}
									class="admin-btn-secondary admin-btn-compact shrink-0"
								>
									{$t('questions.open')}
								</a>
								{#if data.canModerate && question.status === 'pending'}
									<form method="POST" action="?/moderate" use:loadingSubmit>
										<input type="hidden" name="id" value={question._id} />
										<input type="hidden" name="actionName" value="approve" />
										<button class="admin-btn-primary admin-btn-compact shrink-0"
											>{$t('questions.approve')}</button
										>
									</form>
								{/if}
								{#if data.canModerate && question.status !== 'hidden'}
									<form method="POST" action="?/moderate" use:loadingSubmit>
										<input type="hidden" name="id" value={question._id} />
										<input type="hidden" name="actionName" value="hide" />
										<button class="admin-btn-secondary admin-btn-compact shrink-0"
											>{$t('questions.hide')}</button
										>
									</form>
								{/if}
								{#if data.canDelete && !data.canDeletePermanently}
									<form method="POST" action="?/moderate" use:loadingSubmit>
										<input type="hidden" name="id" value={question._id} />
										<input type="hidden" name="actionName" value="soft_delete" />
										<input type="hidden" name="reason" value="Suppression depuis la liste admin" />
										<button
											class="admin-btn-danger admin-btn-compact shrink-0"
											data-loading-label={$t('questions.deleting')}
										>
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
											value="Suppression définitive depuis la liste admin"
										/>
										<button
											class="admin-btn-danger admin-btn-compact shrink-0"
											data-loading-label={$t('questions.deleting')}
										>
											{$t('questions.permanent')}
										</button>
									</form>
								{/if}
							</div>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	{#if totalPages > 1}
		<nav class="mt-6 flex items-center justify-between text-sm">
			<a
				class="text-stone-500 hover:text-primary {data.page <= 1
					? 'pointer-events-none opacity-40'
					: ''}"
				href={pageHref(data.page - 1)}
			>
				{$t('questions.previous')}
			</a>
			<span class="text-stone-500">{$t('questions.pageOf', { page: data.page, total: totalPages })}</span>
			<a
				class="text-stone-500 hover:text-primary {data.page >= totalPages
					? 'pointer-events-none opacity-40'
					: ''}"
				href={pageHref(data.page + 1)}
			>
				{$t('questions.next')}
			</a>
		</nav>
	{/if}
{/if}
{:catch}
	<div class="border border-red-200 bg-red-50/80 p-8 text-center">
		<p class="text-sm text-red-700">{$t('common.loadError')}</p>
		<button class="admin-btn-secondary admin-btn-compact mt-4" onclick={() => invalidateAll()}>
			{$t('errors.retry')}
		</button>
	</div>
{/await}
