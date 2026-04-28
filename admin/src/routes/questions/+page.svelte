<script lang="ts">
	import { loadingSubmit } from '$lib/actions/loadingSubmit';
	import { stripRichTextFormatting } from '$lib/questions/rich-text';
	import { confirmDialog } from '$lib/stores/confirm-dialog';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const confirmedPermanentDeleteForms = new WeakSet<HTMLFormElement>();

	const statuses = [
		{ value: 'all', label: 'Toutes' },
		{ value: 'pending', label: 'En attente' },
		{ value: 'approved', label: 'Publiées' },
		{ value: 'answered', label: 'Répondues' },
		{ value: 'hidden', label: 'Masquées' },
		{ value: 'rejected', label: 'Rejetées' },
		{ value: 'archived', label: 'Archivées' }
	];
	const statusLabels: Record<string, string> = {
		pending: 'En attente',
		approved: 'Publiée',
		answered: 'Répondue',
		rejected: 'Rejetée',
		hidden: 'Masquée',
		archived: 'Archivée'
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
			title: 'Supprimer définitivement ?',
			message:
				'Cette question sera retirée avec ses réponses, références et signalements. Cette action est irréversible.',
			confirmLabel: 'Supprimer',
			cancelLabel: 'Annuler',
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

	const totalPages = $derived(Math.max(1, Math.ceil(data.total / data.limit)));
</script>

<svelte:head>
	<title>Questions - Missionnaire Admin</title>
</svelte:head>

<div class="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
	<div>
		<h1 class="font-display text-3xl font-semibold text-stone-800">Questions</h1>
		<p class="mt-1 text-sm text-stone-500">
			Modération des questions publiques, réponses pastorales et signalements.
		</p>
	</div>
	{#if data.canModerate}
		<div class="flex flex-wrap gap-2">
			<a href="/questions/pending" class="admin-btn-secondary py-2"
				>En attente ({data.stats.pending})</a
			>
			<a href="/questions/reports" class="admin-btn-secondary py-2"
				>Signalements ({data.stats.openReports})</a
			>
		</div>
	{/if}
</div>

<div class="mb-6 grid gap-3 sm:grid-cols-3">
	<a
		href="/questions?status=pending"
		aria-current={data.status === 'pending' ? 'page' : undefined}
		class="group border p-4 transition-colors hover:border-primary hover:bg-orange-50/40 {data.status ===
		'pending'
			? 'border-primary bg-orange-50/50'
			: 'border-stone-200/60 bg-white/50'}"
	>
		<p class="text-xs uppercase tracking-[0.16em] text-stone-400">En attente</p>
		<div class="mt-1 flex items-end justify-between gap-3">
			<p class="text-2xl font-semibold text-stone-800">{data.stats.pending}</p>
			<span
				class="text-[10px] font-bold uppercase tracking-[0.16em] text-primary opacity-0 transition-opacity group-hover:opacity-100"
			>
				Filtrer
			</span>
		</div>
	</a>
	<a
		href="/questions/reports"
		class="group border border-stone-200/60 bg-white/50 p-4 transition-colors hover:border-primary hover:bg-orange-50/40"
	>
		<p class="text-xs uppercase tracking-[0.16em] text-stone-400">Signalements ouverts</p>
		<div class="mt-1 flex items-end justify-between gap-3">
			<p class="text-2xl font-semibold text-stone-800">{data.stats.openReports}</p>
			<span
				class="text-[10px] font-bold uppercase tracking-[0.16em] text-primary opacity-0 transition-opacity group-hover:opacity-100"
			>
				Revoir
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
		<p class="text-xs uppercase tracking-[0.16em] text-stone-400">Masquées</p>
		<div class="mt-1 flex items-end justify-between gap-3">
			<p class="text-2xl font-semibold text-stone-800">{data.stats.hidden}</p>
			<span
				class="text-[10px] font-bold uppercase tracking-[0.16em] text-primary opacity-0 transition-opacity group-hover:opacity-100"
			>
				Filtrer
			</span>
		</div>
	</a>
</div>

<form
	method="GET"
	class="mb-6 grid gap-3 border border-stone-200/60 bg-white/40 p-4 md:grid-cols-[1fr_170px_170px_auto]"
	use:loadingSubmit
>
	<input name="search" value={data.search} placeholder="Rechercher" class="admin-input" />
	<select name="status" class="admin-input">
		{#each statuses as status}
			<option value={status.value} selected={data.status === status.value}>{status.label}</option>
		{/each}
	</select>
	<select name="answered" class="admin-input">
		<option value="">Toutes</option>
		<option value="answered" selected={data.answered === 'answered'}>Avec réponse</option>
		<option value="unanswered" selected={data.answered === 'unanswered'}>Sans réponse</option>
	</select>
	<button class="admin-btn-primary justify-center">Filtrer</button>
</form>

{#if data.questions.length === 0}
	<div class="border border-stone-200/60 bg-white/40 p-8 text-center text-sm text-stone-500">
		Aucune question trouvée.
	</div>
{:else}
	<div class="overflow-hidden border border-stone-200/60 bg-white/40">
		<table class="w-full text-left text-sm">
			<thead>
				<tr class="border-b border-stone-100 bg-cream/50">
					<th class="px-5 py-3.5 font-medium text-stone-500">Question</th>
					<th class="px-5 py-3.5 font-medium text-stone-500">Statut</th>
					<th class="px-5 py-3.5 font-medium text-stone-500">Activité</th>
					<th class="w-[235px] px-4 py-3.5 text-right font-medium text-stone-500">Actions</th>
				</tr>
			</thead>
			<tbody>
				{#each data.questions as question}
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
								{statusLabels[question.status] ?? question.status}
							</span>
							{#if question.locked}
								<span class="mt-2 block text-xs text-amber-600">Verrouillée</span>
							{/if}
							{#if question.featured}
								<span class="mt-2 block text-xs text-primary">En avant</span>
							{/if}
						</td>
						<td class="px-5 py-4 text-xs text-stone-500">
							<p>{question.replyCount} réponses</p>
							<p>{question.viewCount} vues</p>
							<p>{question.reportCount} signalements</p>
						</td>
						<td class="w-[235px] px-4 py-4">
							<div class="flex flex-nowrap justify-end gap-1.5 whitespace-nowrap">
								<a
									href={`/questions/${question._id}`}
									class="admin-btn-secondary shrink-0 px-2.5 py-1.5 text-[9px] leading-none tracking-[0.12em]"
								>
									Ouvrir
								</a>
								{#if data.canModerate && question.status === 'pending'}
									<form method="POST" action="?/moderate" use:loadingSubmit>
										<input type="hidden" name="id" value={question._id} />
										<input type="hidden" name="actionName" value="approve" />
										<button
											class="admin-btn-primary shrink-0 px-2.5 py-1.5 text-[9px] leading-none tracking-[0.12em]"
											>Approuver</button
										>
									</form>
								{/if}
								{#if data.canModerate && question.status !== 'hidden'}
									<form method="POST" action="?/moderate" use:loadingSubmit>
										<input type="hidden" name="id" value={question._id} />
										<input type="hidden" name="actionName" value="hide" />
										<button
											class="admin-btn-secondary shrink-0 px-2.5 py-1.5 text-[9px] leading-none tracking-[0.12em]"
											>Masquer</button
										>
									</form>
								{/if}
								{#if data.canDelete && !data.canDeletePermanently}
									<form method="POST" action="?/moderate" use:loadingSubmit>
										<input type="hidden" name="id" value={question._id} />
										<input type="hidden" name="actionName" value="soft_delete" />
										<input type="hidden" name="reason" value="Suppression depuis la liste admin" />
										<button
											class="admin-btn-danger shrink-0 px-2.5 py-1.5 text-[9px] leading-none tracking-[0.12em]"
											data-loading-label="Suppression..."
										>
											Supprimer
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
											class="admin-btn-danger shrink-0 px-2.5 py-1.5 text-[9px] leading-none tracking-[0.12em]"
											data-loading-label="Suppression..."
										>
											Définitif
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
				Précédent
			</a>
			<span class="text-stone-500">Page {data.page} / {totalPages}</span>
			<a
				class="text-stone-500 hover:text-primary {data.page >= totalPages
					? 'pointer-events-none opacity-40'
					: ''}"
				href={pageHref(data.page + 1)}
			>
				Suivant
			</a>
		</nav>
	{/if}
{/if}
