<script lang="ts">
	import { enhance } from '$app/forms';
	import FormattedQuestionText from '$lib/components/questions/FormattedQuestionText.svelte';
	import QuestionReferenceCards from '$lib/components/questions/QuestionReferenceCards.svelte';
	import { stripRichTextFormatting } from '$lib/questions/rich-text';
	import type { ActionData, PageData } from './$types';
	// @ts-ignore - svelte-icons-pack ships loose icon typings in this project.
	import Icon from 'svelte-icons-pack/Icon.svelte';
	import IoArrowBack from 'svelte-icons-pack/io/IoArrowBack';
	import IoSendOutline from 'svelte-icons-pack/io/IoSendOutline';

	export let data: PageData;
	export let form: ActionData;

	let replying = false;

	$: question = data.question;
	$: officialAnswer = data.officialAnswer;
	$: replies = data.replies || [];
	$: questionReferences = data.references.filter((reference) => !reference.replyId);
	$: answerReferences = data.references.filter((reference) => reference.replyId);
	$: seoDescription = stripRichTextFormatting(question.body).slice(0, 155);
	$: isAdminUser = data.user?.role === 'superadmin' || data.user?.role === 'editor';
	$: replyDisplayName = form?.replyDisplayName ?? (!isAdminUser && data.user ? data.user.name : '');
	$: statusLabel = question.status === 'answered' ? 'Répondue' : 'Publiée';

	function formatDate(value: string | null): string {
		if (!value) return '';
		return new Date(value).toLocaleDateString('fr-FR', {
			day: 'numeric',
			month: 'long',
			year: 'numeric'
		});
	}

	function initials(name: string): string {
		return (
			name
				.split(/\s+/)
				.filter(Boolean)
				.slice(0, 2)
				.map((part) => part[0]?.toUpperCase())
				.join('') || '?'
		);
	}
</script>

{#snippet messageIcon(className: string)}
	<svg
		class={className}
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="1.8"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
		focusable="false"
	>
		<path
			d="M21 11.8a8.4 8.4 0 0 1-8.6 8.2H7.2L3 22l1.4-4.2A8.2 8.2 0 0 1 3 11.8a8.5 8.5 0 0 1 9-8.2 8.5 8.5 0 0 1 9 8.2Z"
		/>
	</svg>
{/snippet}

{#snippet checkIcon(className: string)}
	<svg
		class={className}
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="1.9"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
		focusable="false"
	>
		<circle cx="12" cy="12" r="9" />
		<path d="m8.2 12.2 2.4 2.4 5.2-5.2" />
	</svg>
{/snippet}

{#snippet eyeIcon(className: string)}
	<svg
		class={className}
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="1.8"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
		focusable="false"
	>
		<path d="M2.5 12s3.6-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.6 6.5-9.5 6.5S2.5 12 2.5 12Z" />
		<circle cx="12" cy="12" r="2.7" />
	</svg>
{/snippet}

{#snippet userIcon(className: string)}
	<svg
		class={className}
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="1.8"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
		focusable="false"
	>
		<circle cx="12" cy="8.2" r="3.2" />
		<path d="M5.2 20a6.8 6.8 0 0 1 13.6 0" />
	</svg>
{/snippet}

{#snippet calendarIcon(className: string)}
	<svg
		class={className}
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="1.8"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
		focusable="false"
	>
		<path d="M7 3.5v3M17 3.5v3" />
		<path d="M4.5 8.5h15" />
		<path
			d="M6.5 5.5h11A2.5 2.5 0 0 1 20 8v10a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 18V8a2.5 2.5 0 0 1 2.5-2.5Z"
		/>
	</svg>
{/snippet}

<svelte:head>
	<title>{question.title} - Questions et réponses</title>
	<meta name="description" content={seoDescription} />
	<link rel="canonical" href={`https://missionnaire.net/questions/${question.slug}`} />
	<meta property="og:title" content={question.title} />
	<meta property="og:description" content={seoDescription} />
</svelte:head>

<div class="container mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-8">
	<a
		href="/questions"
		class="group mb-4 inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-missionnaire transition hover:text-stone-900"
	>
		<span
			class="flex h-7 w-7 items-center justify-center border border-missionnaire/30 bg-white/70 transition group-hover:border-stone-900"
		>
			<Icon src={IoArrowBack} className="h-3.5 w-3.5" />
		</span>
		<span>Toutes les questions</span>
	</a>

	{#if data.replyPosted}
		<div class="mb-5 border border-green-200 bg-green-50 p-4 text-sm text-green-800">
			Votre réponse a été publiée.
		</div>
	{/if}
	<article class="overflow-hidden border border-stone-200/70 bg-white/75 shadow-sm">
		<div class="p-4 md:p-5">
			<div class="min-w-0">
				<div
					class="mb-3 flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em]"
				>
					<span class="inline-flex items-center gap-1.5 bg-green-50 px-2 py-1 text-green-700">
						{#if question.status === 'answered'}
							{@render checkIcon('h-3.5 w-3.5')}
						{:else}
							{@render messageIcon('h-3.5 w-3.5')}
						{/if}
						{statusLabel}
					</span>
					{#if question.locked}
						<span class="bg-stone-800 px-2 py-1 text-white">Verrouillée</span>
					{/if}
					{#if question.category}
						<span class="text-stone-400">/ {question.category}</span>
					{/if}
				</div>

				<h1 class="font-display text-3xl font-semibold leading-tight text-stone-950 md:text-4xl">
					{question.title}
				</h1>

				<div class="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-stone-500">
					<span class="inline-flex items-center gap-1.5">
						{@render userIcon('h-3.5 w-3.5 text-missionnaire')}
						{question.authorDisplayName}
					</span>
					<span class="inline-flex items-center gap-1.5">
						{@render calendarIcon('h-3.5 w-3.5 text-missionnaire')}
						{formatDate(question.createdAt)}
					</span>
				</div>

				<div class="mt-4 border-t border-stone-100 pt-3">
					<FormattedQuestionText
						text={question.body}
						proseClass="text-sm leading-7 text-stone-700"
					/>
				</div>
			</div>

			<div
				class="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-stone-100 pt-3 text-xs text-stone-500"
			>
				<span class="inline-flex h-7 items-center gap-1.5">
					{@render messageIcon('h-3.5 w-3.5 shrink-0 text-missionnaire')}
					<strong class="text-sm text-stone-900">{question.replyCount}</strong>
					<span class="font-semibold uppercase tracking-[0.14em]">
						réponse{question.replyCount === 1 ? '' : 's'}
					</span>
				</span>
				<span class="inline-flex h-7 items-center gap-1.5">
					{@render eyeIcon('h-3.5 w-3.5 shrink-0 text-missionnaire')}
					<strong class="text-sm text-stone-900">{question.viewCount}</strong>
					<span class="font-semibold uppercase tracking-[0.14em]">vues</span>
				</span>
				<a
					href="#discussion"
					class="group inline-flex h-8 items-center gap-1.5 border border-missionnaire/30 bg-missionnaire-50/35 px-3 text-[11px] font-bold uppercase tracking-[0.14em] text-missionnaire transition hover:border-missionnaire hover:bg-white sm:ml-auto"
				>
					{@render messageIcon('h-3.5 w-3.5')}
					Répondre
				</a>
			</div>
		</div>

		{#if questionReferences.length > 0}
			<div class="border-t border-stone-100 bg-cream/30 px-4 py-4 md:px-5">
				<h2 class="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-stone-500">
					Références
				</h2>
				<QuestionReferenceCards references={questionReferences} />
			</div>
		{/if}
	</article>

	<section class="mt-6">
		<div class="mb-3 flex flex-wrap items-end justify-between gap-3">
			<div>
				<h2 class="font-display text-2xl font-semibold text-stone-900 md:text-3xl">Réponse</h2>
			</div>
			{#if officialAnswer}
				<p class="text-xs text-stone-500">{formatDate(officialAnswer.createdAt)}</p>
			{/if}
		</div>
		{#if officialAnswer}
			<div class="overflow-hidden border border-missionnaire/25 bg-white shadow-sm">
				<div class="border-l-4 border-missionnaire p-4 md:p-5">
					<div class="mb-3 flex flex-wrap items-center gap-3">
						<span
							class="flex h-9 w-9 items-center justify-center bg-missionnaire text-xs font-bold text-white"
							aria-hidden="true"
						>
							{initials(officialAnswer.authorDisplayName)}
						</span>
						<div>
							<p class="text-[11px] font-bold uppercase tracking-[0.18em] text-missionnaire">
								Réponse officielle
							</p>
							<p class="mt-1 text-xs text-stone-500">
								{officialAnswer.authorDisplayName}
							</p>
						</div>
					</div>
					<FormattedQuestionText
						text={officialAnswer.body}
						proseClass="text-sm leading-7 text-stone-800"
					/>
				</div>

				{#if answerReferences.length > 0}
					<div class="border-t border-stone-100 bg-cream/30 px-4 py-4 md:px-5">
						<h3 class="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-stone-500">
							Pour approfondir
						</h3>
						<QuestionReferenceCards references={answerReferences} />
					</div>
				{/if}
			</div>
		{:else}
			<div class="border border-stone-200/70 bg-white/50 p-4 text-sm text-stone-600">
				Une réponse pastorale officielle n'a pas encore été publiée.
			</div>
		{/if}
	</section>

	<section id="discussion" class="mt-7">
		<div class="mb-3 flex items-end justify-between gap-4">
			<div>
				<p class="text-[11px] font-bold uppercase tracking-[0.2em] text-missionnaire">Discussion</p>
				<h2 class="font-display text-2xl font-semibold text-stone-900 md:text-3xl">
					Réponses publiques
				</h2>
			</div>
			<span
				class="border border-stone-200 bg-white/70 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-stone-500"
			>
				{replies.length} message{replies.length === 1 ? '' : 's'}
			</span>
		</div>

		{#if replies.length === 0}
			<div class="border border-stone-200/70 bg-white/50 p-4 text-sm text-stone-600">
				Aucune réponse publique pour le moment.
			</div>
		{:else}
			<div class="space-y-3">
				{#each replies as reply}
					<article
						class="group border border-stone-200/70 bg-white/70 p-3 transition hover:border-missionnaire/25 sm:p-4"
					>
						<div class="flex gap-3">
							<div
								class="flex h-8 w-8 shrink-0 items-center justify-center border border-stone-200 bg-cream text-[11px] font-bold text-stone-700"
								aria-hidden="true"
							>
								{initials(reply.authorDisplayName)}
							</div>
							<div class="min-w-0 flex-1">
								<div class="mb-2 flex flex-wrap items-center justify-between gap-2">
									<div>
										<p class="text-sm font-semibold text-stone-900">{reply.authorDisplayName}</p>
										<p class="mt-0.5 text-xs text-stone-400">{formatDate(reply.createdAt)}</p>
									</div>
								</div>
								<div class="whitespace-pre-line text-sm leading-6 text-stone-700">{reply.body}</div>
							</div>
						</div>
					</article>
				{/each}
			</div>
		{/if}

		<div class="mt-5 border border-stone-200/70 bg-white/75 shadow-sm">
			<div class="border-b border-stone-100 px-4 py-4">
				<p class="text-[11px] font-bold uppercase tracking-[0.2em] text-missionnaire">Suivi</p>
				<h3 class="mt-1 font-display text-xl font-semibold text-stone-900 md:text-2xl">
					{officialAnswer ? 'Demander une précision' : 'Ajouter une réponse'}
				</h3>
				<p class="mt-1 text-sm leading-6 text-stone-500">
					Vous pouvez répondre sans compte. Votre nom restera associé à ce navigateur pour le suivi.
				</p>
			</div>
			{#if form?.replyError}
				<div class="mx-5 mt-5 border border-red-200 bg-red-50 p-4 text-sm text-red-700">
					{form.replyError}
				</div>
			{/if}

			{#if question.locked}
				<p class="px-4 py-4 text-sm text-stone-500">Cette discussion est verrouillée.</p>
			{:else}
				<form
					method="POST"
					action="?/reply"
					class="grid gap-3 p-4"
					use:enhance={() => {
						replying = true;
						return async ({ update }) => {
							replying = false;
							await update();
						};
					}}
				>
					{#if !isAdminUser}
						<div>
							<label
								for="reply-display-name"
								class="mb-2 block text-sm font-semibold text-stone-700"
								>Nom à afficher <span class="font-normal text-stone-400">(optionnel)</span></label
							>
							<input
								id="reply-display-name"
								name="displayName"
								maxlength="60"
								value={replyDisplayName}
								class="w-full border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-800 outline-none focus:border-missionnaire focus:ring-2 focus:ring-missionnaire/20"
								placeholder="Ex: Marie K. ou laisser vide"
							/>
							<p class="mt-2 text-xs leading-5 text-stone-500">
								Laissez vide pour utiliser un nom anonyme gardé sur ce navigateur.
							</p>
						</div>
					{/if}
					<textarea
						name="body"
						rows="4"
						required
						minlength="5"
						maxlength="2500"
						class="w-full resize-y border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-800 outline-none focus:border-missionnaire focus:ring-2 focus:ring-missionnaire/20"
						>{form?.replyBody ?? ''}</textarea
					>
					<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
						<p class="text-xs text-stone-500">
							{#if data.user}
								{data.user.isGuest
									? `Nom gardé : ${data.user.name}`
									: `Connecté en tant que ${data.user.name}`}
							{:else}
								Aucun compte requis.
							{/if}
						</p>
						<button
							type="submit"
							disabled={replying}
							class="inline-flex items-center justify-center gap-2 bg-missionnaire px-4 py-2.5 text-xs font-bold uppercase tracking-[0.16em] text-white hover:bg-missionnaire-600 disabled:opacity-60"
						>
							<Icon src={IoSendOutline} className="h-4 w-4" />
							{replying ? 'Publication...' : 'Publier'}
						</button>
					</div>
				</form>
			{/if}
		</div>
	</section>
</div>
