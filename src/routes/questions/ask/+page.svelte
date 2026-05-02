<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';
	// @ts-ignore - svelte-icons-pack ships loose icon typings in this project.
	import Icon from 'svelte-icons-pack/Icon.svelte';
	import IoArrowBack from 'svelte-icons-pack/io/IoArrowBack';

	export let data: PageData;
	export let form: ActionData;

	let submitting = false;
	$: isAdminUser = data.user?.role === 'superadmin' || data.user?.role === 'editor';
	$: displayName = form?.values?.displayName ?? (!isAdminUser && data.user ? data.user.name : '');

	const statusLabels: Record<string, string> = {
		pending: 'En attente',
		approved: 'Publiée',
		answered: 'Répondue',
		rejected: 'Non retenue',
		hidden: 'Masquée',
		archived: 'Archivée'
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
		<span>Toutes les questions</span>
	</a>

	<section class="mb-8">
		<p class="mb-3 text-[11px] font-bold uppercase tracking-[0.24em] text-missionnaire">
			Nouvelle question
		</p>
		<h1 class="font-display text-4xl font-semibold leading-tight text-stone-900 md:text-5xl">
			Poser une question
		</h1>
		<p class="mt-3 max-w-2xl text-sm leading-7 text-stone-600 md:text-base">
			Aucun compte n'est nécessaire. Vous pouvez indiquer un nom public ou rester anonyme ; ce
			navigateur gardera vos questions pour vous aider à suivre les réponses et à demander une
			précision.
		</p>
	</section>

	{#if data.submitted}
		<div class="mb-6 border border-green-200 bg-green-50 p-5 text-sm text-green-800">
			Votre question a été envoyée. Elle sera visible après validation par un modérateur, et vous
			pourrez la retrouver ici depuis ce même navigateur.
		</div>
	{/if}

	{#if data.myQuestions.length > 0}
		<div class="mb-6 border border-stone-200/70 bg-white/55 p-5">
			<div class="mb-4 flex flex-wrap items-end justify-between gap-3">
				<div>
					<p class="text-[11px] font-bold uppercase tracking-[0.18em] text-missionnaire">Suivi</p>
					<h2 class="font-display text-2xl font-semibold text-stone-900">Mes questions</h2>
				</div>
				<p class="text-xs text-stone-500">Gardées sur ce navigateur</p>
			</div>
			<div class="grid gap-3">
				{#each data.myQuestions as question}
					<article class="border border-stone-100 bg-white p-4">
						<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
							<div>
								<p class="text-[11px] font-semibold uppercase tracking-[0.16em] {question.status === 'answered' ? 'text-green-700' : 'text-stone-500'}">
									{statusLabels[question.status] ?? question.status}
								</p>
								<h3 class="mt-1 font-display text-xl font-semibold text-stone-900">{question.title}</h3>
								<p class="mt-1 text-xs text-stone-500">
									Posée le {formatDate(question.createdAt)}
									{#if question.answeredAt}
										- Réponse le {formatDate(question.answeredAt)}
									{/if}
								</p>
							</div>
							{#if isPublicQuestion(question.status)}
								<a href={`/questions/${question.slug}`} class="text-xs font-bold uppercase tracking-[0.16em] text-missionnaire hover:text-stone-900">
									Ouvrir
								</a>
							{:else}
								<span class="text-xs text-stone-400">En relecture</span>
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
			<div class="mb-5 border border-red-200 bg-red-50 p-4 text-sm text-red-700">
				{form.error}
			</div>
		{/if}

		<div class="grid gap-5">
			{#if !isAdminUser}
				<div>
					<label for="displayName" class="mb-2 block text-sm font-semibold text-stone-700">Nom à afficher <span class="font-normal text-stone-400">(optionnel)</span></label>
					<input
						id="displayName"
						name="displayName"
						maxlength="60"
						value={displayName}
						class="w-full border border-stone-200 bg-white px-4 py-3 text-stone-800 outline-none transition focus:border-missionnaire focus:ring-2 focus:ring-missionnaire/20"
						placeholder="Ex: Marie K. ou laisser vide"
					/>
					<p class="mt-2 text-xs leading-5 text-stone-500">
						Laissez vide pour publier sous un nom anonyme généré et gardé sur ce navigateur.
					</p>
				</div>
			{/if}

			<div>
				<label for="title" class="mb-2 block text-sm font-semibold text-stone-700">Titre</label>
				<input
					id="title"
					name="title"
					required
					minlength="8"
					maxlength="140"
					value={form?.values?.title ?? ''}
					class="w-full border border-stone-200 bg-white px-4 py-3 text-stone-800 outline-none transition focus:border-missionnaire focus:ring-2 focus:ring-missionnaire/20 disabled:bg-stone-50 disabled:text-stone-500"
					placeholder="Ex: Que signifie..."
				/>
			</div>

			<div class="grid gap-5 md:grid-cols-2">
				<div>
					<label for="category" class="mb-2 block text-sm font-semibold text-stone-700">Catégorie</label>
					<select
						id="category"
						name="category"
						class="w-full border border-stone-200 bg-white px-4 py-3 text-stone-800 outline-none transition focus:border-missionnaire focus:ring-2 focus:ring-missionnaire/20"
					>
						<option value="">Choisir une catégorie</option>
						{#each data.categories as category}
							<option value={category} selected={form?.values?.category === category}>{category}</option>
						{/each}
					</select>
				</div>
				<div>
					<label for="tags" class="mb-2 block text-sm font-semibold text-stone-700">Mots-clés</label>
					<input
						id="tags"
						name="tags"
						value={form?.values?.tags ?? ''}
						class="w-full border border-stone-200 bg-white px-4 py-3 text-stone-800 outline-none transition focus:border-missionnaire focus:ring-2 focus:ring-missionnaire/20"
						placeholder="foi, baptême, prière"
					/>
				</div>
			</div>

			<div>
				<label for="body" class="mb-2 block text-sm font-semibold text-stone-700">Question</label>
				<textarea
					id="body"
					name="body"
					required
					minlength="20"
					maxlength="4000"
					rows="10"
					class="w-full resize-y border border-stone-200 bg-white px-4 py-3 text-stone-800 outline-none transition focus:border-missionnaire focus:ring-2 focus:ring-missionnaire/20"
					placeholder="Écrivez votre question avec le contexte utile."
				>{form?.values?.body ?? ''}</textarea>
			</div>
		</div>

		<div class="mt-6 flex flex-col gap-3 border-t border-stone-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
			<p class="text-xs text-stone-500">
				{#if data.user}
					{data.user.isGuest ? `Nom gardé : ${data.user.name}` : `Connecté en tant que ${data.user.name}`}
				{:else}
					Aucun compte requis.
				{/if}
			</p>
			<button
				type="submit"
				disabled={submitting}
				class="bg-missionnaire px-6 py-3 text-xs font-bold uppercase tracking-[0.18em] text-white transition hover:bg-missionnaire-600 disabled:cursor-not-allowed disabled:opacity-60"
			>
				{submitting ? 'Envoi...' : 'Envoyer la question'}
			</button>
		</div>
	</form>
</div>
