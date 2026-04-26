<script lang="ts">
	import { stripRichTextFormatting } from '$lib/questions/rich-text';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

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
			<a href="/questions/pending" class="admin-btn-secondary py-2">En attente ({data.stats.pending})</a>
			<a href="/questions/reports" class="admin-btn-secondary py-2">Signalements ({data.stats.openReports})</a>
		</div>
	{/if}
</div>

<div class="mb-6 grid gap-3 sm:grid-cols-3">
	<div class="border border-stone-200/60 bg-white/50 p-4">
		<p class="text-xs uppercase tracking-[0.16em] text-stone-400">En attente</p>
		<p class="mt-1 text-2xl font-semibold text-stone-800">{data.stats.pending}</p>
	</div>
	<div class="border border-stone-200/60 bg-white/50 p-4">
		<p class="text-xs uppercase tracking-[0.16em] text-stone-400">Signalements ouverts</p>
		<p class="mt-1 text-2xl font-semibold text-stone-800">{data.stats.openReports}</p>
	</div>
	<div class="border border-stone-200/60 bg-white/50 p-4">
		<p class="text-xs uppercase tracking-[0.16em] text-stone-400">Masquées</p>
		<p class="mt-1 text-2xl font-semibold text-stone-800">{data.stats.hidden}</p>
	</div>
</div>

<form method="GET" class="mb-6 grid gap-3 border border-stone-200/60 bg-white/40 p-4 md:grid-cols-[1fr_170px_170px_auto]">
	<input
		name="search"
		value={data.search}
		placeholder="Rechercher"
		class="admin-input"
	/>
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
					<th class="px-5 py-3.5 text-right font-medium text-stone-500">Actions</th>
				</tr>
			</thead>
			<tbody>
				{#each data.questions as question}
					<tr class="border-b border-stone-50 align-top transition-colors hover:bg-cream/30">
						<td class="px-5 py-4">
							<a href={`/questions/${question._id}`} class="font-medium text-stone-800 hover:text-primary">
								{question.title}
							</a>
							<p class="mt-1 line-clamp-2 text-xs leading-5 text-stone-500">{stripRichTextFormatting(question.body)}</p>
							<p class="mt-2 text-[11px] text-stone-400">
								{question.authorDisplayName} - {formatDate(question.createdAt)}
							</p>
						</td>
						<td class="px-5 py-4">
							<span class="inline-flex bg-stone-100 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-stone-600">
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
						<td class="px-5 py-4">
							<div class="flex flex-wrap justify-end gap-2">
								<a href={`/questions/${question._id}`} class="admin-btn-secondary px-3 py-2 text-[10px]">
									Ouvrir
								</a>
								{#if data.canModerate && question.status === 'pending'}
									<form method="POST" action="?/moderate">
										<input type="hidden" name="id" value={question._id} />
										<input type="hidden" name="actionName" value="approve" />
										<button class="admin-btn-primary px-3 py-2 text-[10px]">Approuver</button>
									</form>
								{/if}
								{#if data.canModerate && question.status !== 'hidden'}
									<form method="POST" action="?/moderate">
										<input type="hidden" name="id" value={question._id} />
										<input type="hidden" name="actionName" value="hide" />
										<button class="admin-btn-secondary px-3 py-2 text-[10px]">Masquer</button>
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
			<a class="text-stone-500 hover:text-primary {data.page <= 1 ? 'pointer-events-none opacity-40' : ''}" href={pageHref(data.page - 1)}>
				Précédent
			</a>
			<span class="text-stone-500">Page {data.page} / {totalPages}</span>
			<a class="text-stone-500 hover:text-primary {data.page >= totalPages ? 'pointer-events-none opacity-40' : ''}" href={pageHref(data.page + 1)}>
				Suivant
			</a>
		</nav>
	{/if}
{/if}
