<script lang="ts">
	import FormattedQuestionText from '$lib/components/questions/FormattedQuestionText.svelte';
	import RichTextToolbar from '$lib/components/questions/RichTextToolbar.svelte';
	import type { ActionData, PageData } from './$types';
	import type { QuestionReferenceType } from '$lib/models/questions';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let referenceType = $state<QuestionReferenceType>('sermon');
	const typeLabels: Record<QuestionReferenceType, string> = {
		pdf: 'PDF',
		audio: 'Prédication audio',
		video: 'Vidéo',
		sermon: 'Prédication',
		music: 'Cantique',
		bible: 'Bible'
	};

	const statusLabel: Record<string, string> = {
		pending: 'En attente',
		approved: 'Publiée',
		answered: 'Répondue',
		rejected: 'Rejetée',
		hidden: 'Masquée',
		archived: 'Archivée',
		locked: 'Verrouillée'
	};

	function formatDate(value: string | null): string {
		if (!value) return '-';
		return new Date(value).toLocaleString('fr-FR', {
			day: 'numeric',
			month: 'short',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	const question = $derived(data.question);
	const officialAnswer = $derived(data.officialAnswer);
	const normalReplies = $derived(data.replies.filter((reply) => !reply.isOfficial));
	const currentReferenceOptions = $derived(data.referenceOptions[referenceType] || []);
	const isBibleReference = $derived(referenceType === 'bible');
</script>

<svelte:head>
	<title>{question.title} - Missionnaire Admin</title>
</svelte:head>

<div class="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
	<div>
		<a
			href="/questions"
			class="group mb-3 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-primary transition hover:text-stone-800"
		>
			<span class="flex h-7 w-7 items-center justify-center border border-primary/25 bg-white/70 transition group-hover:border-stone-700">
				<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.4" aria-hidden="true">
					<path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
				</svg>
			</span>
			<span>Questions</span>
		</a>
		<h1 class="font-display text-3xl font-semibold leading-tight text-stone-800">{question.title}</h1>
		<p class="mt-2 text-sm text-stone-500">
			{question.authorDisplayName} - {formatDate(question.createdAt)} - {question.replyCount} réponses
		</p>
	</div>
	<div class="flex flex-wrap gap-2">
		<a href={`/questions/${question.slug}`} target="_blank" class="admin-btn-secondary">Voir public</a>
		{#if data.canModerate}
			<form method="POST" action="?/moderate">
				<input type="hidden" name="actionName" value={question.featured ? 'unfeature' : 'feature'} />
				<button class="admin-btn-secondary">{question.featured ? "Retirer de l'avant" : 'Mettre en avant'}</button>
			</form>
			<form method="POST" action="?/moderate">
				<input type="hidden" name="actionName" value={question.locked ? 'unlock' : 'lock'} />
				<button class="admin-btn-secondary">{question.locked ? 'Déverrouiller' : 'Verrouiller'}</button>
			</form>
		{/if}
	</div>
</div>

{#if form?.error}
	<div class="mb-5 border border-red-200 bg-red-50 p-4 text-sm text-red-700">{form.error}</div>
{/if}
{#if form?.officialError}
	<div class="mb-5 border border-red-200 bg-red-50 p-4 text-sm text-red-700">{form.officialError}</div>
{/if}
{#if form?.referenceError}
	<div class="mb-5 border border-red-200 bg-red-50 p-4 text-sm text-red-700">{form.referenceError}</div>
{/if}

<div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
	<div class="space-y-6">
		<section class="border border-stone-200/60 bg-white/50 p-5">
			<div class="mb-4 flex flex-wrap items-center gap-2">
				<span class="bg-stone-100 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-stone-600">
					{statusLabel[question.status] ?? question.status}
				</span>
				{#if question.locked}
					<span class="bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">Verrouillée</span>
				{/if}
				{#if question.category}
					<span class="text-xs text-stone-500">{question.category}</span>
				{/if}
			</div>
			<FormattedQuestionText text={question.body} proseClass="text-sm leading-7 text-stone-700" />

			{#if data.canModerate}
				<div class="mt-5 flex flex-wrap gap-2 border-t border-stone-100 pt-4">
					{#if question.status === 'pending' || question.status === 'rejected'}
						<form method="POST" action="?/moderate">
							<input type="hidden" name="actionName" value="approve" />
							<button class="admin-btn-primary">Approuver</button>
						</form>
					{/if}
					{#if question.status !== 'hidden'}
						<form method="POST" action="?/moderate" class="flex gap-2">
							<input type="hidden" name="actionName" value="hide" />
							<input name="reason" class="admin-input w-44 py-2" placeholder="Raison" />
							<button class="admin-btn-secondary">Masquer</button>
						</form>
					{:else}
						<form method="POST" action="?/moderate">
							<input type="hidden" name="actionName" value="unhide" />
							<button class="admin-btn-primary">Rendre visible</button>
						</form>
					{/if}
					<form method="POST" action="?/moderate" class="flex gap-2">
						<input type="hidden" name="actionName" value="reject" />
						<input name="reason" class="admin-input w-44 py-2" placeholder="Raison" />
						<button class="admin-btn-danger">Rejeter</button>
					</form>
				</div>
			{/if}
		</section>

		{#if data.canModerate}
			<details class="border border-stone-200/60 bg-white/50 p-5">
				<summary class="cursor-pointer font-display text-xl font-semibold text-stone-800">
					Modifier pour modération
				</summary>
				<form method="POST" action="?/edit" class="mt-5 grid gap-4">
					{#if form?.editError}
						<div class="border border-red-200 bg-red-50 p-3 text-sm text-red-700">{form.editError}</div>
					{/if}
					<div>
						<label for="title" class="admin-label">Titre</label>
						<input id="title" name="title" class="admin-input" value={question.title} />
					</div>
					<div>
						<label for="body" class="admin-label">Question</label>
						<RichTextToolbar targetId="body" />
						<textarea id="body" name="body" rows="8" class="admin-input">{question.body}</textarea>
					</div>
					<div class="grid gap-4 md:grid-cols-3">
						<div>
							<label for="category" class="admin-label">Catégorie</label>
							<input id="category" name="category" class="admin-input" value={question.category ?? ''} />
						</div>
						<div>
							<label for="tags" class="admin-label">Tags</label>
							<input id="tags" name="tags" class="admin-input" value={question.tags.join(', ')} />
						</div>
						<div>
							<label for="reason" class="admin-label">Raison</label>
							<input id="reason" name="reason" class="admin-input" />
						</div>
					</div>
					<button class="admin-btn-primary justify-self-start">Enregistrer</button>
				</form>
			</details>
		{/if}

		<section class="border border-stone-200/60 bg-white/50 p-5">
			<h2 class="font-display text-2xl font-semibold text-stone-800">Réponse officielle</h2>
			{#if officialAnswer}
				<div class="mt-4 border-l-4 border-primary bg-white p-4">
					<p class="mb-2 text-xs uppercase tracking-[0.16em] text-primary">
						{officialAnswer.authorDisplayName} - {formatDate(officialAnswer.createdAt)}
					</p>
					<FormattedQuestionText text={officialAnswer.body} proseClass="text-sm leading-7 text-stone-700" />
				</div>
			{:else}
				<p class="mt-3 text-sm text-stone-500">Aucune réponse officielle publiée.</p>
			{/if}

			{#if data.canPublishOfficial}
				<form method="POST" action="?/official" class="mt-5 grid gap-3">
					<RichTextToolbar targetId="official-answer-body" />
					<textarea
						id="official-answer-body"
						name="body"
						rows="8"
						class="admin-input"
						placeholder="Écrire ou mettre à jour la réponse pastorale"
					>{officialAnswer?.body ?? ''}</textarea>
					<button class="admin-btn-primary justify-self-start">
						{officialAnswer ? 'Mettre à jour' : 'Publier la réponse'}
					</button>
				</form>
			{/if}
		</section>

		<section class="border border-stone-200/60 bg-white/50 p-5">
			<h2 class="font-display text-2xl font-semibold text-stone-800">Discussion</h2>
			{#if normalReplies.length === 0}
				<p class="mt-3 text-sm text-stone-500">Aucune réponse publique.</p>
			{:else}
				<div class="mt-4 grid gap-3">
					{#each normalReplies as reply}
						<article class="border border-stone-100 bg-white p-4">
							<div class="mb-2 flex flex-wrap items-center justify-between gap-2">
								<p class="text-sm font-semibold text-stone-700">{reply.authorDisplayName}</p>
								<span class="text-xs text-stone-400">
									{reply.visibilityStatus} - {formatDate(reply.createdAt)}
								</span>
							</div>
							<p class="whitespace-pre-line text-sm leading-6 text-stone-600">{reply.body}</p>
							{#if data.canModerate}
								<div class="mt-3 flex flex-wrap gap-2 border-t border-stone-100 pt-3">
									<form method="POST" action="?/replyVisibility" class="flex gap-2">
										<input type="hidden" name="replyId" value={reply._id} />
										<input type="hidden" name="visibilityStatus" value={reply.visibilityStatus === 'hidden' ? 'visible' : 'hidden'} />
										<input name="reason" class="admin-input w-40 py-2" placeholder="Raison" />
										<button class="admin-btn-secondary px-3 py-2 text-[10px]">
											{reply.visibilityStatus === 'hidden' ? 'Afficher' : 'Masquer'}
										</button>
									</form>
									<form method="POST" action="?/replyVisibility">
										<input type="hidden" name="replyId" value={reply._id} />
										<input type="hidden" name="visibilityStatus" value="deleted" />
										<button class="admin-btn-danger px-3 py-2 text-[10px]">Supprimer</button>
									</form>
								</div>
							{/if}
						</article>
					{/each}
				</div>
			{/if}
		</section>
	</div>

	<aside class="space-y-6">
		<section class="border border-stone-200/60 bg-white/50 p-5">
			<h2 class="font-display text-xl font-semibold text-stone-800">Références</h2>

			{#if data.references.length > 0}
				<div class="mt-4 space-y-3">
					{#each data.references as reference}
						<div class="border border-stone-100 bg-white p-3">
							<p class="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
								{typeLabels[reference.type]}
							</p>
							{#if reference.href}
								<a href={reference.href} target="_blank" rel="noreferrer" class="mt-1 block text-sm font-medium text-stone-800 hover:text-primary">
									{reference.title}
								</a>
							{:else}
								<p class="mt-1 text-sm font-medium text-stone-800">{reference.title}</p>
							{/if}
							{#if reference.type === 'bible' && typeof reference.metadata.text === 'string' && reference.metadata.text}
								<p class="mt-1 line-clamp-3 text-xs leading-5 text-stone-500">{reference.metadata.text}</p>
							{/if}
							<p class="mt-1 text-xs text-stone-400">
								{reference.replyId ? 'Réponse officielle' : 'Question'}
							</p>
							{#if data.canAnswer}
								<form method="POST" action="?/removeReference" class="mt-2">
									<input type="hidden" name="referenceId" value={reference._id} />
									<button class="text-xs font-semibold text-red-600 hover:text-red-800">Retirer</button>
								</form>
							{/if}
						</div>
					{/each}
				</div>
			{:else}
				<p class="mt-3 text-sm text-stone-500">Aucune référence attachée.</p>
			{/if}

			{#if data.canAnswer}
				<form method="GET" class="mt-5 flex gap-2">
					<input name="referenceSearch" value={data.referenceSearch} class="admin-input py-2" placeholder="Chercher du contenu" />
					<button class="admin-btn-secondary px-3 py-2">Chercher</button>
				</form>

				<form method="POST" action="?/addReference" class="mt-4 grid gap-3">
					<select bind:value={referenceType} name="type" class="admin-input">
						<option value="sermon">Prédication</option>
						<option value="audio">Prédication audio</option>
						<option value="music">Cantique audio</option>
						<option value="video">Vidéo</option>
						<option value="pdf">PDF</option>
						<option value="bible">Référence biblique</option>
					</select>
					{#if isBibleReference}
						<div>
							<label for="biblePassage" class="admin-label">Passage biblique</label>
							<input
								id="biblePassage"
								name="biblePassage"
								class="admin-input"
								placeholder="Ex: Jean 14:6"
								required
							/>
						</div>
						<div>
							<label for="bibleText" class="admin-label">Texte du verset</label>
							<textarea
								id="bibleText"
								name="bibleText"
								rows="4"
								class="admin-input"
								placeholder="Optionnel, pour afficher le verset sur la carte"
							></textarea>
						</div>
						<div>
							<label for="bibleTranslation" class="admin-label">Traduction</label>
							<input
								id="bibleTranslation"
								name="bibleTranslation"
								class="admin-input"
								placeholder="Ex: Louis Segond"
							/>
						</div>
					{:else}
						<select name="referencedContentId" class="admin-input">
							{#each currentReferenceOptions as option}
								<option value={option.id}>{option.title}</option>
							{/each}
						</select>
					{/if}
					<select name="replyId" class="admin-input">
						<option value="">Attacher à la question</option>
						{#if officialAnswer}
							<option value={officialAnswer._id}>Attacher à la réponse officielle</option>
						{/if}
					</select>
					<button class="admin-btn-primary justify-center" disabled={!isBibleReference && currentReferenceOptions.length === 0}>
						Ajouter la référence
					</button>
				</form>
			{/if}
		</section>

		{#if data.canModerate}
			<section class="border border-stone-200/60 bg-white/50 p-5">
				<h2 class="font-display text-xl font-semibold text-stone-800">Signalements</h2>
				{#if data.reports.length === 0}
					<p class="mt-3 text-sm text-stone-500">Aucun signalement.</p>
				{:else}
					<div class="mt-4 space-y-3">
						{#each data.reports as report}
							<div class="border border-stone-100 bg-white p-3">
								<p class="text-xs uppercase tracking-[0.16em] text-stone-400">
									{report.targetType} - {report.status}
								</p>
								<p class="mt-1 text-sm text-stone-700">{report.reason}</p>
								{#if report.notes}
									<p class="mt-1 text-xs text-stone-500">{report.notes}</p>
								{/if}
								{#if report.status === 'open'}
									<div class="mt-2 flex gap-2">
										<form method="POST" action="?/resolveReport">
											<input type="hidden" name="reportId" value={report._id} />
											<input type="hidden" name="status" value="reviewed" />
											<button class="text-xs font-semibold text-primary">Traité</button>
										</form>
										<form method="POST" action="?/resolveReport">
											<input type="hidden" name="reportId" value={report._id} />
											<input type="hidden" name="status" value="dismissed" />
											<button class="text-xs font-semibold text-stone-500">Ignorer</button>
										</form>
									</div>
								{/if}
							</div>
						{/each}
					</div>
				{/if}
			</section>
		{/if}

		<section class="border border-stone-200/60 bg-white/50 p-5">
			<h2 class="font-display text-xl font-semibold text-stone-800">Audit</h2>
			{#if data.actions.length === 0}
				<p class="mt-3 text-sm text-stone-500">Aucune action enregistrée.</p>
			{:else}
				<div class="mt-4 space-y-3">
					{#each data.actions as action}
						<div class="border-l-2 border-stone-200 pl-3">
							<p class="text-sm font-medium text-stone-700">{action.action}</p>
							<p class="text-xs text-stone-400">
								{action.moderatorDisplayName} - {formatDate(action.createdAt)}
							</p>
							{#if action.reason}
								<p class="mt-1 text-xs text-stone-500">{action.reason}</p>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		</section>

		{#if data.canManageUsers && question.authorId && question.authorId.includes('@')}
			<section class="border border-red-200 bg-red-50/60 p-5">
				<h2 class="font-display text-xl font-semibold text-red-900">Utilisateur</h2>
				<p class="mt-2 text-sm text-red-700">{question.authorId}</p>
				<form method="POST" action="?/suspendAuthor" class="mt-4">
					<input type="hidden" name="authorId" value={question.authorId} />
					<button class="admin-btn-danger">Suspendre l'auteur</button>
				</form>
			</section>
		{/if}
	</aside>
</div>
