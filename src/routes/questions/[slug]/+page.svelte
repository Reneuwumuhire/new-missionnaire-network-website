<script lang="ts">
	import { enhance } from '$app/forms';
	import FormattedQuestionText from '$lib/components/questions/FormattedQuestionText.svelte';
	import QuestionReferenceCards from '$lib/components/questions/QuestionReferenceCards.svelte';
	import { stripRichTextFormatting } from '$lib/questions/rich-text';
	import type { ActionData, PageData } from './$types';
	// @ts-ignore - svelte-icons-pack ships loose icon typings in this project.
	import Icon from 'svelte-icons-pack/Icon.svelte';
	import IoArrowBack from 'svelte-icons-pack/io/IoArrowBack';

	export let data: PageData;
	export let form: ActionData;

	let replying = false;

	$: question = data.question;
	$: officialAnswer = data.officialAnswer;
	$: replies = data.replies || [];
	$: questionReferences = data.references.filter((reference) => !reference.replyId);
	$: answerReferences = data.references.filter((reference) => reference.replyId);
	$: seoDescription = stripRichTextFormatting(question.body).slice(0, 155);

	function formatDate(value: string | null): string {
		if (!value) return '';
		return new Date(value).toLocaleDateString('fr-FR', {
			day: 'numeric',
			month: 'long',
			year: 'numeric'
		});
	}
</script>

<svelte:head>
	<title>{question.title} - Questions et réponses</title>
	<meta name="description" content={seoDescription} />
	<link rel="canonical" href={`https://missionnaire.net/questions/${question.slug}`} />
	<meta property="og:title" content={question.title} />
	<meta property="og:description" content={seoDescription} />
</svelte:head>

<div class="container mx-auto max-w-5xl px-4 py-10 md:px-8">
	<a
		href="/questions"
		class="group mb-7 inline-flex items-center gap-3 text-xs font-bold uppercase tracking-[0.16em] text-missionnaire transition hover:text-stone-900"
	>
		<span class="flex h-8 w-8 items-center justify-center border border-missionnaire/30 bg-white/70 transition group-hover:border-stone-900">
			<Icon src={IoArrowBack} className="h-4 w-4" />
		</span>
		<span>Toutes les questions</span>
	</a>

	{#if data.replyPosted}
		<div class="mb-5 border border-green-200 bg-green-50 p-4 text-sm text-green-800">
			Votre réponse a été publiée.
		</div>
	{/if}
	{#if data.reportSent}
		<div class="mb-5 border border-green-200 bg-green-50 p-4 text-sm text-green-800">
			Signalement envoyé aux modérateurs.
		</div>
	{/if}
	{#if form?.reportError}
		<div class="mb-5 border border-red-200 bg-red-50 p-4 text-sm text-red-700">
			{form.reportError}
		</div>
	{/if}

	<article class="border border-stone-200/70 bg-white/70 p-5 md:p-8">
		<div class="mb-4 flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em]">
			<span class={question.status === 'answered' ? 'text-green-700' : 'text-stone-500'}>
				{question.status === 'answered' ? 'Répondue' : 'Publiée'}
			</span>
			{#if question.locked}
				<span class="bg-stone-800 px-2 py-1 text-white">Verrouillée</span>
			{/if}
			{#if question.category}
				<span class="text-stone-400">/ {question.category}</span>
			{/if}
		</div>

		<h1 class="font-display text-4xl font-semibold leading-tight text-stone-950 md:text-5xl">
			{question.title}
		</h1>

		<div class="mt-4 flex flex-wrap gap-3 text-xs text-stone-500">
			<span>Posée par {question.authorDisplayName}</span>
			<span>{formatDate(question.createdAt)}</span>
			<span>{question.viewCount} vues</span>
			<span>{question.replyCount} réponses</span>
		</div>

		<FormattedQuestionText text={question.body} proseClass="mt-7 text-base leading-8 text-stone-700" />

		{#if questionReferences.length > 0}
			<div class="mt-8 border-t border-stone-100 pt-6">
				<h2 class="mb-3 text-sm font-bold uppercase tracking-[0.18em] text-stone-500">Références</h2>
				<QuestionReferenceCards references={questionReferences} />
			</div>
		{/if}

		{#if data.user}
			<details class="mt-6 border-t border-stone-100 pt-4">
				<summary class="cursor-pointer text-xs font-semibold uppercase tracking-[0.16em] text-stone-500 hover:text-missionnaire">
					Signaler cette question
				</summary>
				<form method="POST" action="?/report" class="mt-3 grid gap-3 sm:grid-cols-[180px_1fr_auto]">
					<input type="hidden" name="targetType" value="question" />
					<input type="hidden" name="targetId" value={question._id} />
					<select name="reason" class="border border-stone-200 bg-white px-3 py-2 text-sm">
						<option value="inappropriate">Inapproprié</option>
						<option value="spam">Spam</option>
						<option value="unsafe">Contenu dangereux</option>
					</select>
					<input name="notes" class="border border-stone-200 bg-white px-3 py-2 text-sm" placeholder="Note optionnelle" />
					<button class="bg-stone-900 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-missionnaire">
						Signaler
					</button>
				</form>
			</details>
		{/if}
	</article>

	<section class="mt-8">
		<h2 class="mb-4 font-display text-3xl font-semibold text-stone-900">Réponse pastorale</h2>
		{#if officialAnswer}
			<div class="border-l-4 border-missionnaire bg-white p-5 shadow-sm md:p-7">
				<div class="mb-4 flex flex-wrap items-center justify-between gap-3">
					<div>
						<p class="text-[11px] font-bold uppercase tracking-[0.18em] text-missionnaire">
							Réponse officielle
						</p>
						<p class="mt-1 text-xs text-stone-500">
							{officialAnswer.authorDisplayName} - {formatDate(officialAnswer.createdAt)}
						</p>
					</div>
				</div>
				<FormattedQuestionText text={officialAnswer.body} proseClass="text-base leading-8 text-stone-800" />

				{#if answerReferences.length > 0}
					<div class="mt-6 border-t border-stone-100 pt-5">
						<h3 class="mb-3 text-sm font-bold uppercase tracking-[0.18em] text-stone-500">
							Pour approfondir
						</h3>
						<QuestionReferenceCards references={answerReferences} />
					</div>
				{/if}
			</div>
		{:else}
			<div class="border border-stone-200/70 bg-white/50 p-6 text-sm text-stone-600">
				Une réponse pastorale officielle n'a pas encore été publiée.
			</div>
		{/if}
	</section>

	<section id="discussion" class="mt-10">
		<div class="mb-4 flex items-end justify-between gap-4">
			<div>
				<p class="text-[11px] font-bold uppercase tracking-[0.2em] text-missionnaire">Discussion</p>
				<h2 class="font-display text-3xl font-semibold text-stone-900">Réponses publiques</h2>
			</div>
			<span class="text-sm text-stone-500">{replies.length} message{replies.length === 1 ? '' : 's'}</span>
		</div>

		{#if replies.length === 0}
			<div class="border border-stone-200/70 bg-white/50 p-6 text-sm text-stone-600">
				Aucune réponse publique pour le moment.
			</div>
		{:else}
			<div class="grid gap-4">
				{#each replies as reply}
					<article class="border border-stone-200/70 bg-white/65 p-5">
						<div class="mb-3 flex flex-wrap items-center justify-between gap-2">
							<p class="text-sm font-semibold text-stone-800">{reply.authorDisplayName}</p>
							<p class="text-xs text-stone-500">{formatDate(reply.createdAt)}</p>
						</div>
						<div class="whitespace-pre-line text-sm leading-7 text-stone-700">{reply.body}</div>

						{#if data.user}
							<details class="mt-4 border-t border-stone-100 pt-3">
								<summary class="cursor-pointer text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400 hover:text-missionnaire">
									Signaler
								</summary>
								<form method="POST" action="?/report" class="mt-3 grid gap-3 sm:grid-cols-[180px_1fr_auto]">
									<input type="hidden" name="targetType" value="reply" />
									<input type="hidden" name="targetId" value={reply._id} />
									<select name="reason" class="border border-stone-200 bg-white px-3 py-2 text-sm">
										<option value="inappropriate">Inapproprié</option>
										<option value="spam">Spam</option>
										<option value="unsafe">Contenu dangereux</option>
									</select>
									<input name="notes" class="border border-stone-200 bg-white px-3 py-2 text-sm" placeholder="Note optionnelle" />
									<button class="bg-stone-900 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-missionnaire">
										Signaler
									</button>
								</form>
							</details>
						{/if}
					</article>
				{/each}
			</div>
		{/if}

		<div class="mt-6 border border-stone-200/70 bg-white/60 p-5">
			<h3 class="font-display text-2xl font-semibold text-stone-900">Ajouter une réponse</h3>
			{#if form?.replyError}
				<div class="mt-4 border border-red-200 bg-red-50 p-4 text-sm text-red-700">
					{form.replyError}
				</div>
			{/if}

			{#if question.locked}
				<p class="mt-3 text-sm text-stone-500">Cette discussion est verrouillée.</p>
			{:else if !data.user}
				<p class="mt-3 text-sm text-stone-500">Connexion requise pour participer à la discussion.</p>
			{:else}
				<form
					method="POST"
					action="?/reply"
					class="mt-4"
					use:enhance={() => {
						replying = true;
						return async ({ update }) => {
							replying = false;
							await update();
						};
					}}
				>
					<textarea
						name="body"
						rows="5"
						required
						minlength="5"
						maxlength="2500"
						class="w-full resize-y border border-stone-200 bg-white px-4 py-3 text-sm text-stone-800 outline-none focus:border-missionnaire focus:ring-2 focus:ring-missionnaire/20"
					>{form?.replyBody ?? ''}</textarea>
					<div class="mt-3 flex items-center justify-between gap-3">
						<p class="text-xs text-stone-500">Connecté en tant que {data.user.name}</p>
						<button
							type="submit"
							disabled={replying}
							class="bg-missionnaire px-5 py-3 text-xs font-bold uppercase tracking-[0.18em] text-white hover:bg-missionnaire-600 disabled:opacity-60"
						>
							{replying ? 'Publication...' : 'Publier'}
						</button>
					</div>
				</form>
			{/if}
		</div>
	</section>
</div>
