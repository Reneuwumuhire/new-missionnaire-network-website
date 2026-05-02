<script lang="ts">
	import { enhance } from '$app/forms';
	import FormattedQuestionText from '$lib/components/questions/FormattedQuestionText.svelte';
	import RichTextToolbar from '$lib/components/questions/RichTextToolbar.svelte';
	import { loadingSubmit } from '$lib/actions/loadingSubmit';
	import { confirmDialog } from '$lib/stores/confirm-dialog';
	import type { ActionData, PageData } from './$types';
	import type {
		QuestionReference,
		QuestionReferenceType,
		ReferenceOption
	} from '$lib/models/questions';

	type EnhanceSubmit = NonNullable<Parameters<typeof enhance>[1]>;

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let references = $state<PageData['references']>([]);
	let removingReferenceId = $state<string | null>(null);
	let referenceType = $state<QuestionReferenceType>('sermon');
	const confirmedPermanentDeleteForms = new WeakSet<HTMLFormElement>();
	const typeLabels: Record<QuestionReferenceType, string> = {
		pdf: 'PDF',
		audio: 'Prédication audio',
		video: 'Vidéo',
		sermon: 'Prédication',
		text: 'Texte',
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

	async function confirmPermanentDelete(event: SubmitEvent) {
		const submitter =
			event.submitter instanceof HTMLButtonElement || event.submitter instanceof HTMLInputElement
				? event.submitter
				: null;
		if (submitter?.value !== 'permanent_delete') return;

		const form = event.currentTarget instanceof HTMLFormElement ? event.currentTarget : null;
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
		form.requestSubmit(submitter);
	}

	const question = $derived(data.question);
	const officialAnswer = $derived(data.officialAnswer);
	const normalReplies = $derived(data.replies.filter((reply) => !reply.isOfficial));
	const currentReferenceOptions = $derived(data.referenceOptions[referenceType] || []);
	const isBibleReference = $derived(referenceType === 'bible');
	const supportsLibraryReference = $derived(!isBibleReference && referenceType !== 'text');
	let referenceMode = $state<'existing' | 'manual'>('existing');
	let selectedReferenceId = $state('');

	$effect(() => {
		references = data.references;
	});

	$effect(() => {
		referenceType = data.referenceType;
	});

	$effect(() => {
		const options = currentReferenceOptions;
		if (isBibleReference) {
			referenceMode = 'existing';
			selectedReferenceId = '';
			return;
		}
		if (!supportsLibraryReference) {
			referenceMode = 'manual';
			selectedReferenceId = '';
			return;
		}
		if (options.length === 0) {
			referenceMode = 'manual';
			selectedReferenceId = '';
			return;
		}
		if (!options.some((option) => option.id === selectedReferenceId)) {
			selectedReferenceId = options[0].id;
		}
	});

	function referenceMeta(option: ReferenceOption): string {
		const metadata = option.metadata;
		return [metadata.author, metadata.artist, metadata.date, metadata.duration, metadata.size]
			.filter(
				(value): value is string | number => typeof value === 'string' || typeof value === 'number'
			)
			.map(String)
			.join(' - ');
	}

	function referenceText(reference: QuestionReference): string {
		return typeof reference.metadata.text === 'string' ? reference.metadata.text : '';
	}

	const removeReference: EnhanceSubmit = ({ formData }) => {
		const referenceId = formData.get('referenceId')?.toString() ?? null;
		removingReferenceId = referenceId;

		return async ({ result, update }) => {
			try {
				if (result.type === 'success' && referenceId) {
					references = references.filter((reference) => reference._id !== referenceId);
					return;
				}

				await update();
			} finally {
				if (removingReferenceId === referenceId) {
					removingReferenceId = null;
				}
			}
		};
	};
</script>

<svelte:head>
	<title>{question.title} - Missionnaire Admin</title>
</svelte:head>

<div class="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
	<div>
		<a
			href="/questions"
			class="group mb-2 inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-primary transition hover:text-stone-800"
		>
			<span
				class="flex h-6 w-6 items-center justify-center border border-primary/25 bg-white/70 transition group-hover:border-stone-700"
			>
				<svg
					class="h-3 w-3"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="2.4"
					aria-hidden="true"
				>
					<path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
				</svg>
			</span>
			<span>Questions</span>
		</a>
		<h1 class="font-display text-2xl font-semibold leading-tight text-stone-800 lg:text-[1.7rem]">
			{question.title}
		</h1>
		<p class="mt-1.5 text-xs text-stone-500">
			{question.authorDisplayName} - {formatDate(question.createdAt)} - {question.replyCount} réponses
		</p>
	</div>
	<div class="flex flex-wrap gap-2">
		<a
			href={`/questions/${question.slug}`}
			target="_blank"
			class="admin-btn-secondary px-4 py-2 text-[10px] tracking-[0.16em]">Voir public</a
		>
		{#if data.canModerate}
			<form method="POST" action="?/moderate" use:loadingSubmit>
				<input
					type="hidden"
					name="actionName"
					value={question.featured ? 'unfeature' : 'feature'}
				/>
				<button class="admin-btn-secondary px-4 py-2 text-[10px] tracking-[0.16em]"
					>{question.featured ? "Retirer de l'avant" : 'Mettre en avant'}</button
				>
			</form>
			<form method="POST" action="?/moderate" use:loadingSubmit>
				<input type="hidden" name="actionName" value={question.locked ? 'unlock' : 'lock'} />
				<button class="admin-btn-secondary px-4 py-2 text-[10px] tracking-[0.16em]"
					>{question.locked ? 'Déverrouiller' : 'Verrouiller'}</button
				>
			</form>
		{/if}
	</div>
</div>

{#if form?.error}
	<div class="mb-5 border border-red-200 bg-red-50 p-4 text-sm text-red-700">{form.error}</div>
{/if}
{#if form?.officialError}
	<div class="mb-5 border border-red-200 bg-red-50 p-4 text-sm text-red-700">
		{form.officialError}
	</div>
{/if}
{#if form?.referenceError}
	<div class="mb-5 border border-red-200 bg-red-50 p-4 text-sm text-red-700">
		{form.referenceError}
	</div>
{/if}

<div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(330px,370px)]">
	<div class="space-y-4">
		<section class="border border-stone-200/60 bg-white/50 p-4">
			<div class="mb-3 flex flex-wrap items-center gap-2">
				<span
					class="bg-stone-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-stone-600"
				>
					{statusLabel[question.status] ?? question.status}
				</span>
				{#if question.locked}
					<span class="bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-700"
						>Verrouillée</span
					>
				{/if}
				{#if question.deletedAt}
					<span class="bg-red-100 px-2.5 py-1 text-[11px] font-semibold text-red-700"
						>Supprimée</span
					>
				{/if}
				{#if question.category}
					<span class="text-xs text-stone-500">{question.category}</span>
				{/if}
			</div>
			<FormattedQuestionText text={question.body} proseClass="text-sm leading-6 text-stone-700" />

			{#if data.canModerate}
				<form
					method="POST"
					action="?/moderate"
					class="mt-4 grid gap-2 border-t border-stone-100 pt-3 md:grid-cols-[minmax(220px,1fr)_auto] md:items-center"
					use:loadingSubmit
					onsubmit={confirmPermanentDelete}
				>
					<label for="moderation-reason" class="sr-only">Raison de modération</label>
					<input
						id="moderation-reason"
						name="reason"
						class="admin-input h-10 min-w-0 py-2 text-sm"
						placeholder="Raison (optionnelle)"
					/>
					<div class="flex flex-wrap gap-2 lg:justify-end">
						{#if question.status === 'pending' || question.status === 'rejected'}
							<button
								name="actionName"
								value="approve"
								class="admin-btn-primary px-3 py-2 text-[10px]"
							>
								Approuver
							</button>
						{/if}
						{#if question.status !== 'hidden'}
							<button
								name="actionName"
								value="hide"
								class="admin-btn-secondary px-3 py-2 text-[10px]"
							>
								Masquer
							</button>
						{:else}
							<button
								name="actionName"
								value="unhide"
								class="admin-btn-primary px-3 py-2 text-[10px]"
							>
								Rendre visible
							</button>
						{/if}
						<button name="actionName" value="reject" class="admin-btn-danger px-3 py-2 text-[10px]">
							Rejeter
						</button>
						{#if data.canDelete && !data.canDeletePermanently && !question.deletedAt}
							<button
								name="actionName"
								value="soft_delete"
								class="admin-btn-danger px-3 py-2 text-[10px]"
								data-loading-label="Suppression..."
							>
								Supprimer
							</button>
						{/if}
						{#if data.canDeletePermanently}
							<button
								name="actionName"
								value="permanent_delete"
								class="admin-btn-danger px-3 py-2 text-[10px]"
								data-loading-label="Suppression..."
							>
								Définitif
							</button>
						{/if}
					</div>
				</form>
			{/if}
		</section>

		{#if data.canModerate}
			<details class="border border-stone-200/60 bg-white/50 p-4">
				<summary class="cursor-pointer font-display text-lg font-semibold text-stone-800">
					Modifier pour modération
				</summary>
				<form method="POST" action="?/edit" class="mt-4 grid gap-3" use:loadingSubmit>
					{#if form?.editError}
						<div class="border border-red-200 bg-red-50 p-3 text-sm text-red-700">
							{form.editError}
						</div>
					{/if}
					<div>
						<label for="title" class="admin-label">Titre</label>
						<input id="title" name="title" class="admin-input" value={question.title} />
					</div>
					<div>
						<label for="body" class="admin-label">Question</label>
						<RichTextToolbar targetId="body" />
						<textarea id="body" name="body" rows="6" class="admin-input">{question.body}</textarea>
					</div>
					<div class="grid gap-3 md:grid-cols-3">
						<div>
							<label for="category" class="admin-label">Catégorie</label>
							<input
								id="category"
								name="category"
								class="admin-input"
								value={question.category ?? ''}
							/>
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
					<button
						class="admin-btn-primary justify-self-start px-4 py-2 text-[10px] tracking-[0.16em]"
					>
						Enregistrer
					</button>
				</form>
			</details>
		{/if}

		<section class="border border-stone-200/60 bg-white/50 p-4">
			<h2 class="font-display text-xl font-semibold text-stone-800">Réponse officielle</h2>
			{#if officialAnswer}
				<div class="mt-3 border-l-4 border-primary bg-white p-3">
					<p class="mb-2 text-[11px] uppercase tracking-[0.16em] text-primary">
						{officialAnswer.authorDisplayName} - {formatDate(officialAnswer.createdAt)}
					</p>
					<FormattedQuestionText
						text={officialAnswer.body}
						proseClass="text-sm leading-6 text-stone-700"
					/>
				</div>
			{:else}
				<p class="mt-3 text-sm text-stone-500">Aucune réponse officielle publiée.</p>
			{/if}

			{#if data.canPublishOfficial}
				<form method="POST" action="?/official" class="mt-4 grid gap-3" use:loadingSubmit>
					<RichTextToolbar targetId="official-answer-body" />
					<textarea
						id="official-answer-body"
						name="body"
						rows="7"
						class="admin-input"
						placeholder="Écrire ou mettre à jour la réponse pastorale"
						>{officialAnswer?.body ?? ''}</textarea
					>
					<button
						class="admin-btn-primary justify-self-start px-4 py-2 text-[10px] tracking-[0.16em]"
					>
						{officialAnswer ? 'Mettre à jour' : 'Publier la réponse'}
					</button>
				</form>
			{/if}
		</section>

		<section class="border border-stone-200/60 bg-white/50 p-4">
			<h2 class="font-display text-xl font-semibold text-stone-800">Discussion</h2>
			{#if normalReplies.length === 0}
				<p class="mt-3 text-sm text-stone-500">Aucune réponse publique.</p>
			{:else}
				<div class="mt-3 grid gap-3">
					{#each normalReplies as reply}
						<article class="border border-stone-100 bg-white p-3">
							<div class="mb-2 flex flex-wrap items-center justify-between gap-2">
								<p class="text-sm font-semibold text-stone-700">{reply.authorDisplayName}</p>
								<span class="text-xs text-stone-400">
									{reply.visibilityStatus} - {formatDate(reply.createdAt)}
								</span>
							</div>
							<p class="whitespace-pre-line text-sm leading-6 text-stone-600">{reply.body}</p>
							{#if data.canModerate}
								<div class="mt-3 flex flex-wrap gap-2 border-t border-stone-100 pt-3">
									<form
										method="POST"
										action="?/replyVisibility"
										class="flex gap-2"
										use:loadingSubmit
									>
										<input type="hidden" name="replyId" value={reply._id} />
										<input
											type="hidden"
											name="visibilityStatus"
											value={reply.visibilityStatus === 'hidden' ? 'visible' : 'hidden'}
										/>
										<input name="reason" class="admin-input w-40 py-2" placeholder="Raison" />
										<button class="admin-btn-secondary px-3 py-2 text-[10px]">
											{reply.visibilityStatus === 'hidden' ? 'Afficher' : 'Masquer'}
										</button>
									</form>
									<form method="POST" action="?/replyVisibility" use:loadingSubmit>
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

	<aside class="min-w-0 space-y-4">
		<section class="min-w-0 overflow-hidden border border-stone-200/60 bg-white/50 p-4">
			<h2 class="font-display text-lg font-semibold text-stone-800">Références</h2>

			{#if references.length > 0}
				<div class="mt-3 space-y-2">
					{#each references as reference (reference._id)}
						<div class="min-w-0 border border-stone-100 bg-white p-3">
							<p class="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
								{typeLabels[reference.type]}
							</p>
							{#if reference.href}
								<a
									href={reference.href}
									target="_blank"
									rel="noreferrer"
									class="mt-1 block break-words text-sm font-medium text-stone-800 hover:text-primary"
								>
									{reference.title}
								</a>
							{:else}
								<p class="mt-1 break-words text-sm font-medium text-stone-800">{reference.title}</p>
							{/if}
							{#if referenceText(reference)}
								<p class="mt-1 line-clamp-4 whitespace-pre-line text-xs leading-5 text-stone-500">
									{referenceText(reference)}
								</p>
							{/if}
							<p class="mt-1 text-xs text-stone-400">
								{reference.replyId ? 'Réponse officielle' : 'Question'}
							</p>
							{#if data.canAnswer}
								<form
									method="POST"
									action="?/removeReference"
									class="mt-2"
									use:enhance={removeReference}
								>
									<input type="hidden" name="referenceId" value={reference._id} />
									<button
										class="inline-flex items-center gap-1.5 text-xs font-semibold text-red-600 hover:text-red-800 disabled:cursor-wait disabled:opacity-60"
										disabled={removingReferenceId === reference._id}
									>
										{#if removingReferenceId === reference._id}
											<span
												class="h-3 w-3 rounded-full border-2 border-current border-r-transparent motion-safe:animate-spin"
												aria-hidden="true"
											></span>
										{/if}
										{removingReferenceId === reference._id ? 'Retrait...' : 'Retirer'}
									</button>
								</form>
							{/if}
						</div>
					{/each}
				</div>
			{:else}
				<p class="mt-3 text-sm text-stone-500">Aucune référence attachée.</p>
			{/if}

			{#if data.canAnswer}
				<form
					method="GET"
					class="mt-4 grid min-w-0 gap-2.5 border-t border-stone-100 pt-4"
					use:loadingSubmit
				>
					<div>
						<label for="referenceType" class="admin-label">Type de référence</label>
						<select
							id="referenceType"
							bind:value={referenceType}
							name="referenceType"
							class="admin-input h-10 py-2 text-sm"
						>
							<option value="text">Texte / transcription</option>
							<option value="sermon">Prédication</option>
							<option value="audio">Prédication audio</option>
							<option value="video">Vidéo</option>
							<option value="pdf">PDF</option>
							<option value="bible">Référence biblique</option>
						</select>
					</div>
					{#if supportsLibraryReference}
						<div>
							<label for="referenceSearch" class="admin-label">Chercher dans la bibliothèque</label>
							<div class="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
								<input
									id="referenceSearch"
									name="referenceSearch"
									value={data.referenceSearch}
									class="admin-input h-10 py-2 text-sm"
									placeholder="Titre, auteur, date, lien..."
								/>
								<button class="admin-btn-secondary px-3 py-2 text-[10px] tracking-[0.16em]">
									Chercher
								</button>
							</div>
						</div>
						<p class="text-xs leading-5 text-stone-500">
							Les 25 meilleurs résultats sont affichés. Si le contenu n'apparaît pas, affinez la
							recherche ou ajoutez un lien manuel.
						</p>
					{:else if referenceType === 'text'}
						<p class="text-xs leading-5 text-stone-500">
							Collez le passage utile et ajoutez le lien vers la transcription, le PDF ou la page
							source.
						</p>
					{/if}
				</form>

				<form
					method="POST"
					action="?/addReference"
					class="mt-3 grid min-w-0 gap-2.5"
					use:loadingSubmit
				>
					<input type="hidden" name="type" value={referenceType} />
					{#if isBibleReference}
						<div>
							<label for="biblePassage" class="admin-label">Passage biblique</label>
							<input
								id="biblePassage"
								name="biblePassage"
								class="admin-input h-10 py-2 text-sm"
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
								class="admin-input py-2 text-sm"
								placeholder="Optionnel, pour afficher le verset sur la carte"
							></textarea>
						</div>
						<div>
							<label for="bibleTranslation" class="admin-label">Traduction</label>
							<input
								id="bibleTranslation"
								name="bibleTranslation"
								class="admin-input h-10 py-2 text-sm"
								placeholder="Ex: Louis Segond"
							/>
						</div>
					{:else}
						{#if supportsLibraryReference}
							<div class="grid gap-2 text-xs font-bold uppercase tracking-[0.14em]">
								<label
									class={`flex cursor-pointer items-center gap-2 border px-3 py-2.5 transition ${referenceMode === 'existing' ? 'border-primary bg-orange-50 text-stone-900' : 'border-stone-200 bg-white text-stone-500 hover:border-primary hover:text-stone-800'} ${currentReferenceOptions.length === 0 ? 'opacity-60' : ''}`}
								>
									<input
										bind:group={referenceMode}
										class="h-4 w-4 accent-orange-500"
										type="radio"
										name="referenceMode"
										value="existing"
										disabled={currentReferenceOptions.length === 0}
									/>
									<span>Bibliothèque</span>
								</label>
								<label
									class={`flex cursor-pointer items-center gap-2 border px-3 py-2.5 transition ${referenceMode === 'manual' ? 'border-primary bg-orange-50 text-stone-900' : 'border-stone-200 bg-white text-stone-500 hover:border-primary hover:text-stone-800'}`}
								>
									<input
										bind:group={referenceMode}
										class="h-4 w-4 accent-orange-500"
										type="radio"
										name="referenceMode"
										value="manual"
									/>
									<span>{referenceType === 'video' ? 'Lien vidéo' : 'Lien manuel'}</span>
								</label>
							</div>
						{:else}
							<input type="hidden" name="referenceMode" value="manual" />
						{/if}

						{#if supportsLibraryReference && referenceMode === 'existing'}
							<div class="min-w-0 overflow-hidden border border-stone-200 bg-white">
								<div
									class="flex items-center justify-between gap-3 border-b border-stone-100 px-3 py-2"
								>
									<p class="text-xs font-bold uppercase tracking-[0.14em] text-stone-500">
										Résultats
									</p>
									<p class="text-xs text-stone-400">{currentReferenceOptions.length} trouvés</p>
								</div>
								<div class="max-h-64 overflow-y-auto">
									{#each currentReferenceOptions as option}
										<label
											class="flex min-w-0 cursor-pointer gap-3 border-b border-stone-100 px-3 py-2.5 last:border-b-0 hover:bg-orange-50/40"
										>
											<input
												bind:group={selectedReferenceId}
												type="radio"
												name="referencedContentId"
												value={option.id}
												class="mt-1 h-4 w-4 shrink-0 border-stone-300 text-primary"
											/>
											<span class="min-w-0 flex-1">
												<span
													class="block text-[10px] font-bold uppercase tracking-[0.16em] text-primary"
												>
													{typeLabels[option.type]}
												</span>
												<span
													class="mt-1 block break-words text-sm font-semibold leading-5 text-stone-800"
													>{option.title}</span
												>
												{#if referenceMeta(option)}
													<span class="mt-1 block break-words text-xs text-stone-500"
														>{referenceMeta(option)}</span
													>
												{/if}
												<span
													class="mt-1 block max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-xs text-stone-400"
													title={option.href}>{option.href}</span
												>
											</span>
										</label>
									{/each}
								</div>
							</div>
						{:else}
							<div class="grid gap-3 border border-stone-200 bg-orange-50/30 p-3">
								<p class="text-xs leading-5 text-stone-600">
									{#if referenceType === 'text'}
										Collez le texte à mettre en évidence, puis ajoutez le lien vers sa source.
									{:else if referenceType === 'video'}
										Ajoutez le lien de la vidéo. Vous pouvez aussi noter brièvement ce qui est dit
										dans l'extrait.
									{:else}
										Utilisez ce mode lorsqu'une prédication, un PDF ou un fichier existe déjà en
										ligne mais n'apparaît pas dans la recherche.
									{/if}
								</p>
								<div>
									<label for="manualTitle" class="admin-label">
										{referenceType === 'text'
											? 'Titre du texte'
											: referenceType === 'video'
												? 'Titre de la vidéo'
												: 'Titre affiché'}
									</label>
									<input
										id="manualTitle"
										name="manualTitle"
										class="admin-input h-10 py-2 text-sm"
										placeholder={referenceType === 'text'
											? 'Ex: Citation de la transcription'
											: referenceType === 'video'
												? 'Ex: Extrait vidéo sur la prière'
												: 'Ex: Transcription: La Communion'}
										required={referenceMode === 'manual'}
									/>
								</div>
								{#if referenceType === 'text' || referenceType === 'video'}
									<div>
										<label for="manualNote" class="admin-label">
											{referenceType === 'video' ? "Ce qu'il dit dans la vidéo" : 'Texte cité'}
										</label>
										<textarea
											id="manualNote"
											name="manualNote"
											rows="4"
											class="admin-input py-2 text-sm"
											placeholder={referenceType === 'video'
												? 'Optionnel: résumez ou citez le passage utile.'
												: 'Collez ici le passage du texte à afficher.'}
											required={referenceType === 'text'}
										></textarea>
									</div>
								{/if}
								<div>
									<label for="manualHref" class="admin-label">
										{referenceType === 'text'
											? 'Lien vers le texte'
											: referenceType === 'video'
												? 'Lien de la vidéo'
												: 'Lien'}
									</label>
									<input
										id="manualHref"
										name="manualHref"
										class="admin-input h-10 py-2 text-sm"
										placeholder={referenceType === 'text'
											? 'https://... ou /transcriptions/...'
											: referenceType === 'video'
												? 'https://www.youtube.com/watch?v=...'
												: 'https://... ou /transcriptions/...'}
										required={referenceMode === 'manual'}
									/>
								</div>
							</div>
						{/if}
					{/if}
					<select name="replyId" class="admin-input h-10 py-2 text-sm">
						<option value="">Attacher à la question</option>
						{#if officialAnswer}
							<option value={officialAnswer._id}>Attacher à la réponse officielle</option>
						{/if}
					</select>
					<button
						class="admin-btn-primary w-full min-w-0 justify-center px-3 py-2 text-center text-[10px] tracking-[0.16em]"
						disabled={!isBibleReference &&
							supportsLibraryReference &&
							referenceMode === 'existing' &&
							selectedReferenceId.length === 0}
					>
						Ajouter la référence
					</button>
				</form>
			{/if}
		</section>

		{#if data.canModerate}
			<section class="border border-stone-200/60 bg-white/50 p-4">
				<h2 class="font-display text-lg font-semibold text-stone-800">Signalements</h2>
				{#if data.reports.length === 0}
					<p class="mt-3 text-sm text-stone-500">Aucun signalement.</p>
				{:else}
					<div class="mt-3 space-y-2">
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
										<form method="POST" action="?/resolveReport" use:loadingSubmit>
											<input type="hidden" name="reportId" value={report._id} />
											<input type="hidden" name="status" value="reviewed" />
											<button class="text-xs font-semibold text-primary">Traité</button>
										</form>
										<form method="POST" action="?/resolveReport" use:loadingSubmit>
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

		<section class="border border-stone-200/60 bg-white/50 p-4">
			<h2 class="font-display text-lg font-semibold text-stone-800">Audit</h2>
			{#if data.actions.length === 0}
				<p class="mt-3 text-sm text-stone-500">Aucune action enregistrée.</p>
			{:else}
				<div class="mt-3 space-y-2.5">
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
			<section class="border border-red-200 bg-red-50/60 p-4">
				<h2 class="font-display text-lg font-semibold text-red-900">Utilisateur</h2>
				<p class="mt-2 text-sm text-red-700">{question.authorId}</p>
				<form method="POST" action="?/suspendAuthor" class="mt-4" use:loadingSubmit>
					<input type="hidden" name="authorId" value={question.authorId} />
					<button class="admin-btn-danger px-4 py-2 text-[10px] tracking-[0.16em]">
						Suspendre l'auteur
					</button>
				</form>
			</section>
		{/if}
	</aside>
</div>
