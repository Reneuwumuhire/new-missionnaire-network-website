<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';
	// @ts-ignore - svelte-icons-pack ships loose icon typings in this project.
	import Icon from 'svelte-icons-pack/Icon.svelte';
	import IoArrowBack from 'svelte-icons-pack/io/IoArrowBack';
	import { t, type TranslationKey } from '../../../i18n';

	interface Props {
		data: PageData;
		form: ActionData;
	}

	let { data, form }: Props = $props();

	let submitting = $state(false);
	let isAdminUser = $derived(data.user?.role === 'superadmin' || data.user?.role === 'editor');
	let displayName = $derived(form?.values?.displayName ?? (!isAdminUser && data.user ? data.user.name : ''));

	// Status → translation key, resolved through `$t` at render time.
	const statusLabelKeys: Record<string, TranslationKey> = {
		pending: 'questions.status.pending',
		approved: 'questions.status.approved',
		answered: 'questions.status.answered',
		rejected: 'questions.status.rejected',
		hidden: 'questions.status.hidden',
		archived: 'questions.status.archived'
	};

	function formatDate(value: string | null): string {
		if (!value) return '';
		return new Date(value).toLocaleDateString('fr-FR', {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		});
	}

	function isPublicQuestion(status: string): boolean {
		return status === 'approved' || status === 'answered';
	}
</script>

<svelte:head>
	<title>Poser une question - Missionnaire Network</title>
	<meta
		name="description"
		content="Soumettez une question biblique à l'équipe pastorale de Missionnaire Network."
	/>
</svelte:head>

<div class="container mx-auto max-w-4xl px-4 py-10 md:px-8">
	<a
		href="/questions"
		class="group mb-7 inline-flex items-center gap-3 text-xs font-bold uppercase tracking-[0.16em] text-missionnaire transition hover:text-stone-900"
	>
		<span class="flex h-8 w-8 items-center justify-center border border-missionnaire/30 bg-white/70 transition group-hover:border-stone-900">
			<Icon src={IoArrowBack} className="h-4 w-4" />
		</span>
		<span>{$t('questions.allQuestions')}</span>
	</a>

	<section class="mb-8">
		<p class="mb-3 text-[11px] font-bold uppercase tracking-[0.24em] text-missionnaire">
			{$t('questions.newQuestion')}
		</p>
		<h1 class="font-display text-4xl font-semibold leading-tight text-stone-900 md:text-5xl">
			{$t('questions.askTitle')}
		</h1>
		<p class="mt-3 max-w-2xl text-sm leading-7 text-stone-600 md:text-base">
			{$t('questions.intro')}
		</p>
	</section>

	{#if data.submitted}
		<div role="status" class="mb-6 border border-green-200 bg-green-50 p-5 text-sm text-green-800">
			{$t('questions.submitted')}
		</div>
	{/if}

	{#if data.myQuestions.length > 0}
		<div class="mb-6 border border-stone-200/70 bg-white/55 p-5">
			<div class="mb-4 flex flex-wrap items-end justify-between gap-3">
				<div>
					<p class="text-[11px] font-bold uppercase tracking-[0.18em] text-missionnaire">
						{$t('questions.followUp')}
					</p>
					<h2 class="font-display text-2xl font-semibold text-stone-900">
						{$t('questions.myQuestions')}
					</h2>
				</div>
				<p class="text-xs text-stone-500">{$t('questions.keptOnBrowser')}</p>
			</div>
			<div class="grid gap-3">
				{#each data.myQuestions as question}
					<article class="border border-stone-100 bg-white p-4">
						<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
							<div>
								<p class="text-[11px] font-semibold uppercase tracking-[0.16em] {question.status === 'answered' ? 'text-green-700' : 'text-stone-500'}">
									{statusLabelKeys[question.status]
										? $t(statusLabelKeys[question.status])
										: question.status}
								</p>
								<h3 class="mt-1 font-display text-xl font-semibold text-stone-900">{question.title}</h3>
								<p class="mt-1 text-xs text-stone-500">
									{$t('questions.askedOn', { date: formatDate(question.createdAt) })}
									{#if question.answeredAt}
										- {$t('questions.answeredOn', { date: formatDate(question.answeredAt) })}
									{/if}
								</p>
							</div>
							{#if isPublicQuestion(question.status)}
								<a href={`/questions/${question.slug}`} class="text-xs font-bold uppercase tracking-[0.16em] text-missionnaire hover:text-stone-900">
									{$t('questions.open')}
								</a>
							{:else}
								<span class="text-xs text-stone-400">{$t('questions.inReview')}</span>
							{/if}
						</div>
					</article>
				{/each}
			</div>
		</div>
	{/if}

	<form
		method="POST"
		class="border border-stone-200/70 bg-white/60 p-5 md:p-7"
		use:enhance={() => {
			submitting = true;
			return async ({ update }) => {
				submitting = false;
				await update();
			};
		}}
	>
		{#if form?.error}
			<div role="alert" class="mb-5 border border-red-200 bg-red-50 p-4 text-sm text-red-700">
				{form.error}
			</div>
		{/if}

		<div class="grid gap-5">
			{#if !isAdminUser}
				<div>
					<label for="displayName" class="mb-2 block text-sm font-semibold text-stone-700"
						>{$t('questions.displayNameLabel')}
						<span class="font-normal text-stone-400">{$t('forms.optional')}</span></label
					>
					<input
						id="displayName"
						name="displayName"
						maxlength="60"
						value={displayName}
						class="w-full border border-stone-200 bg-white px-4 py-3 text-stone-800 outline-none transition focus:border-missionnaire focus:ring-2 focus:ring-missionnaire/20"
						placeholder={$t('questions.displayNamePlaceholder')}
					/>
					<p class="mt-2 text-xs leading-5 text-stone-500">
						{$t('questions.displayNameHint')}
					</p>
				</div>
			{/if}

			<div>
				<label for="title" class="mb-2 block text-sm font-semibold text-stone-700">{$t('list.title')}</label>
				<input
					id="title"
					name="title"
					required
					minlength="8"
					maxlength="140"
					value={form?.values?.title ?? ''}
					class="w-full border border-stone-200 bg-white px-4 py-3 text-stone-800 outline-none transition focus:border-missionnaire focus:ring-2 focus:ring-missionnaire/20 disabled:bg-stone-50 disabled:text-stone-500"
					placeholder={$t('questions.titlePlaceholder')}
				/>
			</div>

			<div class="grid gap-5 md:grid-cols-2">
				<div>
					<label for="category" class="mb-2 block text-sm font-semibold text-stone-700"
						>{$t('questions.category')}</label
					>
					<select
						id="category"
						name="category"
						class="w-full border border-stone-200 bg-white px-4 py-3 text-stone-800 outline-none transition focus:border-missionnaire focus:ring-2 focus:ring-missionnaire/20"
					>
						<option value="">{$t('questions.chooseCategory')}</option>
						{#each data.categories as category}
							<option value={category} selected={form?.values?.category === category}>{category}</option>
						{/each}
					</select>
				</div>
				<div>
					<label for="tags" class="mb-2 block text-sm font-semibold text-stone-700"
						>{$t('questions.tagsLabel')}</label
					>
					<input
						id="tags"
						name="tags"
						value={form?.values?.tags ?? ''}
						class="w-full border border-stone-200 bg-white px-4 py-3 text-stone-800 outline-none transition focus:border-missionnaire focus:ring-2 focus:ring-missionnaire/20"
						placeholder={$t('questions.tagsPlaceholder')}
					/>
				</div>
			</div>

			<div>
				<label for="body" class="mb-2 block text-sm font-semibold text-stone-700"
					>{$t('questions.questionLabel')}</label
				>
				<textarea
					id="body"
					name="body"
					required
					minlength="20"
					maxlength="4000"
					rows="10"
					class="w-full resize-y border border-stone-200 bg-white px-4 py-3 text-stone-800 outline-none transition focus:border-missionnaire focus:ring-2 focus:ring-missionnaire/20"
					placeholder={$t('questions.bodyPlaceholder')}
				>{form?.values?.body ?? ''}</textarea>
			</div>
		</div>

		<div class="mt-6 flex flex-col gap-3 border-t border-stone-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
			<p class="text-xs text-stone-500">
				{#if data.user}
					{data.user.isGuest
						? $t('questions.nameKept', { name: data.user.name })
						: $t('questions.signedInAs', { name: data.user.name })}
				{:else}
					{$t('questions.noAccount')}
				{/if}
			</p>
			<button
				type="submit"
				disabled={submitting}
				class="bg-missionnaire px-6 py-3 text-xs font-bold uppercase tracking-[0.18em] text-white transition hover:bg-missionnaire-600 disabled:cursor-not-allowed disabled:opacity-60"
			>
				{submitting ? $t('forms.sendingShort') : $t('questions.submit')}
			</button>
		</div>
	</form>
</div>
