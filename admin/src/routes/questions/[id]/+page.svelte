<script lang="ts">
	import { enhance } from '$app/forms';
	import FormattedQuestionText from '$lib/components/questions/FormattedQuestionText.svelte';
	import MarkdownEditor from '$lib/components/questions/MarkdownEditor.svelte';
	import { loadingSubmit } from '$lib/actions/loadingSubmit';
	import { confirmDialog } from '$lib/stores/confirm-dialog';
	import { t, type TranslationKey } from '$lib/i18n';
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
	const typeLabels: Record<QuestionReferenceType, TranslationKey> = {
		pdf: 'questions.type.pdf',
		audio: 'questions.type.audio',
		video: 'questions.type.video',
		sermon: 'questions.type.sermon',
		text: 'questions.type.text',
		music: 'questions.type.music',
		bible: 'questions.type.bible'
	};

	const statusLabel: Record<string, TranslationKey> = {
		pending: 'questions.statusLabel.pending',
		approved: 'questions.statusLabel.approved',
		answered: 'questions.statusLabel.answered',
		rejected: 'questions.statusLabel.rejected',
		hidden: 'questions.statusLabel.hidden',
		archived: 'questions.statusLabel.archived',
		locked: 'questions.statusLabel.locked'
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
			title: $t('questions.confirmDelete.title'),
			message: $t('questions.confirmDelete.message'),
			confirmLabel: $t('questions.confirmDelete.confirm'),
			cancelLabel: $t('questions.confirmDelete.cancel'),
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
	<title>{$t('questions.detail.headTitle', { title: question.title })}</title>
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
			<span>{$t('questions.title')}</span>
		</a>
		<h1 class="font-display text-2xl font-semibold leading-tight text-stone-800 lg:text-[1.7rem]">
			{question.title}
		</h1>
		<p class="mt-1.5 text-xs text-stone-500">
			{question.authorDisplayName} - {formatDate(question.createdAt)} - {$t('questions.replyCount', { count: question.replyCount })}
		</p>
	</div>
	<div class="flex flex-wrap gap-2">
		<a
			href={`/questions/${question.slug}`}
			target="_blank"
			class="admin-btn-secondary px-4 py-2 text-[10px] tracking-[0.16em]">{$t('questions.detail.viewPublic')}</a
		>
		{#if data.canModerate}
			<form method="POST" action="?/moderate" use:loadingSubmit>
				<input
					type="hidden"
					name="actionName"
					value={question.featured ? 'unfeature' : 'feature'}
				/>
				<button class="admin-btn-secondary px-4 py-2 text-[10px] tracking-[0.16em]"
					>{question.featured ? $t('questions.detail.unfeature') : $t('questions.detail.feature')}</button
				>
			</form>
			<form method="POST" action="?/moderate" use:loadingSubmit>
				<input type="hidden" name="actionName" value={question.locked ? 'unlock' : 'lock'} />
				<button class="admin-btn-secondary px-4 py-2 text-[10px] tracking-[0.16em]"
					>{question.locked ? $t('questions.detail.unlock') : $t('questions.detail.lock')}</button
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
					{statusLabel[question.status] ? $t(statusLabel[question.status]) : question.status}
				</span>
				{#if question.locked}
					<span class="bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-700"
						>{$t('questions.statusLabel.locked')}</span
					>
				{/if}
				{#if question.deletedAt}
					<span class="bg-red-100 px-2.5 py-1 text-[11px] font-semibold text-red-700"
						>{$t('questions.detail.deletedBadge')}</span
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
					<label for="moderation-reason" class="sr-only">{$t('questions.detail.moderationReason')}</label>
					<input
						id="moderation-reason"
						name="reason"
						class="admin-input h-10 min-w-0 py-2 text-sm"
						placeholder={$t('questions.detail.reasonOptional')}
					/>
					<div class="flex flex-wrap gap-2 lg:justify-end">
						{#if question.status === 'pending' || question.status === 'rejected'}
							<button
								name="actionName"
								value="approve"
								class="admin-btn-primary px-3 py-2 text-[10px]"
							>
								{$t('questions.approve')}
							</button>
						{/if}
						{#if question.status !== 'hidden'}
							<button
								name="actionName"
								value="hide"
								class="admin-btn-secondary px-3 py-2 text-[10px]"
							>
								{$t('questions.hide')}
							</button>
						{:else}
							<button
								name="actionName"
								value="unhide"
								class="admin-btn-primary px-3 py-2 text-[10px]"
							>
								{$t('questions.detail.unhide')}
							</button>
						{/if}
						<button name="actionName" value="reject" class="admin-btn-danger px-3 py-2 text-[10px]">
							{$t('questions.reject')}
						</button>
						{#if data.canDelete && !data.canDeletePermanently && !question.deletedAt}
							<button
								name="actionName"
								value="soft_delete"
								class="admin-btn-danger px-3 py-2 text-[10px]"
								data-loading-label={$t('questions.deleting')}
							>
								{$t('questions.delete')}
							</button>
						{/if}
						{#if data.canDeletePermanently}
							<button
								name="actionName"
								value="permanent_delete"
								class="admin-btn-danger px-3 py-2 text-[10px]"
								data-loading-label={$t('questions.deleting')}
							>
								{$t('questions.permanent')}
							</button>
						{/if}
					</div>
				</form>
			{/if}
		</section>

		{#if data.canModerate}
			<details class="border border-stone-200/60 bg-white/50 p-4">
				<summary class="cursor-pointer font-display text-lg font-semibold text-stone-800">
					{$t('questions.detail.editForModeration')}
				</summary>
				<form method="POST" action="?/edit" class="mt-4 grid gap-3" use:loadingSubmit>
					{#if form?.editError}
						<div class="border border-red-200 bg-red-50 p-3 text-sm text-red-700">
							{form.editError}
						</div>
					{/if}
					<div>
						<label for="title" class="admin-label">{$t('questions.detail.titleLabel')}</label>
						<input id="title" name="title" class="admin-input" value={question.title} />
					</div>
					<div>
						<label for="body" class="admin-label">{$t('questions.detail.questionLabel')}</label>
						<MarkdownEditor id="body" name="body" rows={6} content={question.body} />
					</div>
					<div class="grid gap-3 md:grid-cols-3">
						<div>
							<label for="category" class="admin-label">{$t('questions.detail.categoryLabel')}</label>
							<input
								id="category"
								name="category"
								class="admin-input"
								value={question.category ?? ''}
							/>
						</div>
						<div>
							<label for="tags" class="admin-label">{$t('questions.detail.tagsLabel')}</label>
							<input id="tags" name="tags" class="admin-input" value={question.tags.join(', ')} />
						</div>
						<div>
							<label for="reason" class="admin-label">{$t('questions.detail.reasonLabel')}</label>
							<input id="reason" name="reason" class="admin-input" />
						</div>
					</div>
					<button
						class="admin-btn-primary justify-self-start px-4 py-2 text-[10px] tracking-[0.16em]"
					>
						{$t('questions.detail.save')}
					</button>
				</form>
			</details>
		{/if}

		<section class="border border-stone-200/60 bg-white/50 p-4">
			<h2 class="font-display text-xl font-semibold text-stone-800">{$t('questions.detail.officialAnswer')}</h2>
			{#if officialAnswer}
				<details class="group mt-3 border-l-4 border-primary bg-white">
					<summary
						class="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-primary transition hover:bg-primary/5 [&::-webkit-details-marker]:hidden"
					>
						<span class="min-w-0 truncate">
							{officialAnswer.authorDisplayName} - {formatDate(officialAnswer.createdAt)}
						</span>
						<span class="inline-flex items-center gap-1.5 text-stone-400">
							<span class="text-[10px] font-bold normal-case tracking-normal group-open:hidden"
								>{$t('questions.detail.show')}</span
							>
							<span
								class="hidden text-[10px] font-bold normal-case tracking-normal group-open:inline"
								>{$t('questions.hide')}</span
							>
							<svg
								class="h-4 w-4 shrink-0 transition-transform group-open:rotate-180"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								aria-hidden="true"
							>
								<path stroke-linecap="round" stroke-linejoin="round" d="m6 9 6 6 6-6" />
							</svg>
						</span>
					</summary>
					<div class="border-t border-stone-100 px-3 pb-3 pt-3">
						<FormattedQuestionText
							text={officialAnswer.body}
							proseClass="text-sm leading-6 text-stone-700"
						/>
					</div>
				</details>
			{:else}
				<p class="mt-3 text-sm text-stone-500">{$t('questions.detail.noOfficialAnswer')}</p>
			{/if}

			{#if data.canPublishOfficial}
				<form method="POST" action="?/official" class="mt-4 grid gap-3" use:loadingSubmit>
					<MarkdownEditor
						id="official-answer-body"
						name="body"
						rows={9}
						content={officialAnswer?.body ?? ''}
						placeholder={$t('questions.detail.officialPlaceholder')}
					/>
					<button
						class="admin-btn-primary justify-self-start px-4 py-2 text-[10px] tracking-[0.16em]"
					>
						{officialAnswer ? $t('questions.detail.update') : $t('questions.detail.publishAnswer')}
					</button>
				</form>
			{/if}
		</section>

		<section class="border border-stone-200/60 bg-white/50 p-4">
			<h2 class="font-display text-xl font-semibold text-stone-800">{$t('questions.detail.discussion')}</h2>
			{#if normalReplies.length === 0}
				<p class="mt-3 text-sm text-stone-500">{$t('questions.detail.noPublicReplies')}</p>
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
										<input name="reason" class="admin-input w-40 py-2" placeholder={$t('questions.reasonPlaceholder')} />
										<button class="admin-btn-secondary px-3 py-2 text-[10px]">
											{reply.visibilityStatus === 'hidden' ? $t('questions.detail.show') : $t('questions.hide')}
										</button>
									</form>
									<form method="POST" action="?/replyVisibility" use:loadingSubmit>
										<input type="hidden" name="replyId" value={reply._id} />
										<input type="hidden" name="visibilityStatus" value="deleted" />
										<button class="admin-btn-danger px-3 py-2 text-[10px]">{$t('questions.delete')}</button>
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
			<h2 class="font-display text-lg font-semibold text-stone-800">{$t('questions.detail.references')}</h2>

			{#if references.length > 0}
				<div class="mt-3 space-y-2">
					{#each references as reference (reference._id)}
						<div class="min-w-0 border border-stone-100 bg-white p-3">
							<p class="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
								{$t(typeLabels[reference.type])}
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
								{reference.replyId ? $t('questions.detail.officialAnswer') : $t('questions.detail.questionLabel')}
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
										{removingReferenceId === reference._id ? $t('questions.detail.removing') : $t('questions.detail.remove')}
									</button>
								</form>
							{/if}
						</div>
					{/each}
				</div>
			{:else}
				<p class="mt-3 text-sm text-stone-500">{$t('questions.detail.noReferences')}</p>
			{/if}

			{#if data.canAnswer}
				<form
					method="GET"
					class="mt-4 grid min-w-0 gap-2.5 border-t border-stone-100 pt-4"
					use:loadingSubmit
				>
					<div>
						<label for="referenceType" class="admin-label">{$t('questions.detail.referenceType')}</label>
						<select
							id="referenceType"
							bind:value={referenceType}
							name="referenceType"
							class="admin-input h-10 py-2 text-sm"
						>
							<option value="text">{$t('questions.detail.refOptionText')}</option>
							<option value="sermon">{$t('questions.type.sermon')}</option>
							<option value="audio">{$t('questions.type.audio')}</option>
							<option value="video">{$t('questions.type.video')}</option>
							<option value="pdf">{$t('questions.type.pdf')}</option>
							<option value="bible">{$t('questions.detail.refOptionBible')}</option>
						</select>
					</div>
					{#if supportsLibraryReference}
						<div>
							<label for="referenceSearch" class="admin-label">{$t('questions.detail.searchLibrary')}</label>
							<div class="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
								<input
									id="referenceSearch"
									name="referenceSearch"
									value={data.referenceSearch}
									class="admin-input h-10 py-2 text-sm"
									placeholder={$t('questions.detail.searchPlaceholder')}
								/>
								<button class="admin-btn-secondary px-3 py-2 text-[10px] tracking-[0.16em]">
									{$t('questions.detail.search')}
								</button>
							</div>
						</div>
						<p class="text-xs leading-5 text-stone-500">
							{$t('questions.detail.searchHint')}
						</p>
					{:else if referenceType === 'text'}
						<p class="text-xs leading-5 text-stone-500">
							{$t('questions.detail.textHint')}
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
							<label for="biblePassage" class="admin-label">{$t('questions.detail.biblePassage')}</label>
							<input
								id="biblePassage"
								name="biblePassage"
								class="admin-input h-10 py-2 text-sm"
								placeholder={$t('questions.detail.biblePassagePlaceholder')}
								required
							/>
						</div>
						<div>
							<label for="bibleText" class="admin-label">{$t('questions.detail.bibleText')}</label>
							<textarea
								id="bibleText"
								name="bibleText"
								rows="4"
								class="admin-input py-2 text-sm"
								placeholder={$t('questions.detail.bibleTextPlaceholder')}
							></textarea>
						</div>
						<div>
							<label for="bibleTranslation" class="admin-label">{$t('questions.detail.bibleTranslation')}</label>
							<input
								id="bibleTranslation"
								name="bibleTranslation"
								class="admin-input h-10 py-2 text-sm"
								placeholder={$t('questions.detail.bibleTranslationPlaceholder')}
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
									<span>{$t('questions.detail.library')}</span>
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
									<span>{referenceType === 'video' ? $t('questions.detail.videoLink') : $t('questions.detail.manualLink')}</span>
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
										{$t('questions.detail.results')}
									</p>
									<p class="text-xs text-stone-400">{$t('questions.detail.foundCount', { count: currentReferenceOptions.length })}</p>
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
													{$t(typeLabels[option.type])}
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
										{$t('questions.detail.manualTextHint')}
									{:else if referenceType === 'video'}
										{$t('questions.detail.manualVideoHint')}
									{:else}
										{$t('questions.detail.manualOtherHint')}
									{/if}
								</p>
								<div>
									<label for="manualTitle" class="admin-label">
										{referenceType === 'text'
											? $t('questions.detail.textTitle')
											: referenceType === 'video'
												? $t('questions.detail.videoTitle')
												: $t('questions.detail.displayTitle')}
									</label>
									<input
										id="manualTitle"
										name="manualTitle"
										class="admin-input h-10 py-2 text-sm"
										placeholder={referenceType === 'text'
											? $t('questions.detail.textTitlePlaceholder')
											: referenceType === 'video'
												? $t('questions.detail.videoTitlePlaceholder')
												: $t('questions.detail.displayTitlePlaceholder')}
										required={referenceMode === 'manual'}
									/>
								</div>
								{#if referenceType === 'text' || referenceType === 'video'}
									<div>
										<label for="manualNote" class="admin-label">
											{referenceType === 'video' ? $t('questions.detail.videoNoteLabel') : $t('questions.detail.textNoteLabel')}
										</label>
										<textarea
											id="manualNote"
											name="manualNote"
											rows="4"
											class="admin-input py-2 text-sm"
											placeholder={referenceType === 'video'
												? $t('questions.detail.videoNotePlaceholder')
												: $t('questions.detail.textNotePlaceholder')}
											required={referenceType === 'text'}
										></textarea>
									</div>
								{/if}
								<div>
									<label for="manualHref" class="admin-label">
										{referenceType === 'text'
											? $t('questions.detail.textHrefLabel')
											: referenceType === 'video'
												? $t('questions.detail.videoHrefLabel')
												: $t('questions.detail.linkLabel')}
									</label>
									<input
										id="manualHref"
										name="manualHref"
										class="admin-input h-10 py-2 text-sm"
										placeholder={referenceType === 'text'
											? $t('questions.detail.hrefPlaceholder')
											: referenceType === 'video'
												? $t('questions.detail.videoHrefPlaceholder')
												: $t('questions.detail.hrefPlaceholder')}
										required={referenceMode === 'manual'}
									/>
								</div>
							</div>
						{/if}
					{/if}
					<select name="replyId" class="admin-input h-10 py-2 text-sm">
						<option value="">{$t('questions.detail.attachToQuestion')}</option>
						{#if officialAnswer}
							<option value={officialAnswer._id}>{$t('questions.detail.attachToOfficial')}</option>
						{/if}
					</select>
					<button
						class="admin-btn-primary w-full min-w-0 justify-center px-3 py-2 text-center text-[10px] tracking-[0.16em]"
						disabled={!isBibleReference &&
							supportsLibraryReference &&
							referenceMode === 'existing' &&
							selectedReferenceId.length === 0}
					>
						{$t('questions.detail.addReference')}
					</button>
				</form>
			{/if}
		</section>

		{#if data.canModerate}
			<section class="border border-stone-200/60 bg-white/50 p-4">
				<h2 class="font-display text-lg font-semibold text-stone-800">{$t('questions.reports.title')}</h2>
				{#if data.reports.length === 0}
					<p class="mt-3 text-sm text-stone-500">{$t('questions.detail.noReports')}</p>
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
											<button class="text-xs font-semibold text-primary">{$t('questions.detail.reviewed')}</button>
										</form>
										<form method="POST" action="?/resolveReport" use:loadingSubmit>
											<input type="hidden" name="reportId" value={report._id} />
											<input type="hidden" name="status" value="dismissed" />
											<button class="text-xs font-semibold text-stone-500">{$t('questions.dismiss')}</button>
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
			<h2 class="font-display text-lg font-semibold text-stone-800">{$t('questions.detail.audit')}</h2>
			{#if data.actions.length === 0}
				<p class="mt-3 text-sm text-stone-500">{$t('questions.detail.noActions')}</p>
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
				<h2 class="font-display text-lg font-semibold text-red-900">{$t('questions.detail.userHeading')}</h2>
				<p class="mt-2 text-sm text-red-700">{question.authorId}</p>
				<form method="POST" action="?/suspendAuthor" class="mt-4" use:loadingSubmit>
					<input type="hidden" name="authorId" value={question.authorId} />
					<button class="admin-btn-danger px-4 py-2 text-[10px] tracking-[0.16em]">
						{$t('questions.detail.suspendAuthor')}
					</button>
				</form>
			</section>
		{/if}
	</aside>
</div>
