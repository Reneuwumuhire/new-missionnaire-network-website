<script lang="ts">
	import FormattedQuestionText from '$lib/components/questions/FormattedQuestionText.svelte';
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
	<title>Questions en attente - Missionnaire Admin</title>
</svelte:head>

<div class="mb-8 flex items-end justify-between">
	<div>
		<h1 class="font-display text-3xl font-semibold text-stone-800">Questions en attente</h1>
		<p class="mt-1 text-sm text-stone-500">{data.total} question{data.total === 1 ? '' : 's'} à relire</p>
	</div>
	<a href="/questions" class="admin-btn-secondary">Toutes les questions</a>
</div>

{#if data.questions.length === 0}
	<div class="border border-stone-200/60 bg-white/40 p-8 text-center text-sm text-stone-500">
		Aucune question en attente.
	</div>
{:else}
	<div class="grid gap-4">
		{#each data.questions as question}
			<article class="border border-stone-200/60 bg-white/50 p-5">
				<div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
					<div class="min-w-0">
						<p class="text-xs uppercase tracking-[0.16em] text-stone-400">
							{question.authorDisplayName} - {formatDate(question.createdAt)}
						</p>
						<h2 class="mt-2 font-display text-2xl font-semibold text-stone-800">{question.title}</h2>
						<FormattedQuestionText text={question.body} proseClass="mt-2 text-sm leading-6 text-stone-600" />
					</div>
					<div class="flex shrink-0 flex-wrap gap-2">
						<form method="POST" action="?/moderate">
							<input type="hidden" name="id" value={question._id} />
							<input type="hidden" name="actionName" value="approve" />
							<button class="admin-btn-primary">Approuver</button>
						</form>
						<form method="POST" action="?/moderate" class="flex gap-2">
							<input type="hidden" name="id" value={question._id} />
							<input type="hidden" name="actionName" value="reject" />
							<input
								name="reason"
								class="admin-input w-48 py-2"
								placeholder="Raison"
							/>
							<button class="admin-btn-danger">Rejeter</button>
						</form>
						<a href={`/questions/${question._id}`} class="admin-btn-secondary">Ouvrir</a>
					</div>
				</div>
			</article>
		{/each}
	</div>
{/if}
