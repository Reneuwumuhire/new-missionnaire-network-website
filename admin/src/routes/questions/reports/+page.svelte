<script lang="ts">
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
	<title>Signalements - Missionnaire Admin</title>
</svelte:head>

<div class="mb-8 flex items-end justify-between">
	<div>
		<h1 class="font-display text-3xl font-semibold text-stone-800">Signalements</h1>
		<p class="mt-1 text-sm text-stone-500">{data.total} signalement{data.total === 1 ? '' : 's'} ouvert{data.total === 1 ? '' : 's'}</p>
	</div>
	<a href="/questions" class="admin-btn-secondary">Questions</a>
</div>

{#if data.reports.length === 0}
	<div class="border border-stone-200/60 bg-white/40 p-8 text-center text-sm text-stone-500">
		Aucun signalement ouvert.
	</div>
{:else}
	<div class="grid gap-4">
		{#each data.reports as report}
			{@const question = data.questions[report.questionId]}
			<article class="border border-stone-200/60 bg-white/50 p-5">
				<div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
					<div>
						<p class="text-xs uppercase tracking-[0.16em] text-stone-400">
							{report.targetType} - {formatDate(report.createdAt)}
						</p>
						<h2 class="mt-2 font-display text-2xl font-semibold text-stone-800">
							{question?.title ?? 'Question introuvable'}
						</h2>
						<p class="mt-2 text-sm text-stone-600">
							Signalé par {report.reporterDisplayName}: <span class="font-semibold">{report.reason}</span>
						</p>
						{#if report.notes}
							<p class="mt-2 whitespace-pre-line border-l-2 border-stone-200 pl-3 text-sm text-stone-500">{report.notes}</p>
						{/if}
					</div>
					<div class="flex shrink-0 flex-wrap gap-2">
						{#if question}
							<a href={`/questions/${question._id}`} class="admin-btn-secondary">Ouvrir</a>
						{/if}
						<form method="POST" action="?/resolve">
							<input type="hidden" name="reportId" value={report._id} />
							<input type="hidden" name="status" value="reviewed" />
							<button class="admin-btn-primary">Marquer traité</button>
						</form>
						<form method="POST" action="?/resolve">
							<input type="hidden" name="reportId" value={report._id} />
							<input type="hidden" name="status" value="dismissed" />
							<button class="admin-btn-secondary">Ignorer</button>
						</form>
					</div>
				</div>
			</article>
		{/each}
	</div>
{/if}
