<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';
	// @ts-ignore - svelte-icons-pack ships loose icon typings in this project.
	import Icon from 'svelte-icons-pack/Icon.svelte';
	import IoArrowBack from 'svelte-icons-pack/io/IoArrowBack';

	export let data: PageData;
	export let form: ActionData;

	let submitting = false;
	$: formDisabled = !data.user;
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
			Les questions sont relues avant publication afin de garder un espace paisible et utile à
			l'édification.
		</p>
	</section>

	{#if data.submitted}
		<div class="mb-6 border border-green-200 bg-green-50 p-5 text-sm text-green-800">
			Votre question a été envoyée. Elle sera visible après validation par un modérateur.
		</div>
	{/if}

	{#if !data.user}
		<div class="mb-6 border border-amber-200 bg-amber-50 p-6">
			<h2 class="font-display text-2xl font-semibold text-stone-800">Connexion requise</h2>
			<p class="mt-2 text-sm leading-6 text-stone-600">
				Le formulaire est affiché ci-dessous pour montrer le parcours. La soumission sera activée
				dès qu'une session utilisateur publique sera branchée.
			</p>
		</div>
	{/if}

	<form
		method="POST"
		class="border border-stone-200/70 bg-white/60 p-5 md:p-7 {formDisabled ? 'opacity-75' : ''}"
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
			<div>
				<label for="title" class="mb-2 block text-sm font-semibold text-stone-700">Titre</label>
				<input
					id="title"
					name="title"
					required
					disabled={formDisabled}
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
						disabled={formDisabled}
						class="w-full border border-stone-200 bg-white px-4 py-3 text-stone-800 outline-none transition focus:border-missionnaire focus:ring-2 focus:ring-missionnaire/20 disabled:bg-stone-50 disabled:text-stone-500"
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
						disabled={formDisabled}
						value={form?.values?.tags ?? ''}
						class="w-full border border-stone-200 bg-white px-4 py-3 text-stone-800 outline-none transition focus:border-missionnaire focus:ring-2 focus:ring-missionnaire/20 disabled:bg-stone-50 disabled:text-stone-500"
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
					disabled={formDisabled}
					minlength="20"
					maxlength="4000"
					rows="10"
					class="w-full resize-y border border-stone-200 bg-white px-4 py-3 text-stone-800 outline-none transition focus:border-missionnaire focus:ring-2 focus:ring-missionnaire/20 disabled:bg-stone-50 disabled:text-stone-500"
					placeholder="Écrivez votre question avec le contexte utile."
				>{form?.values?.body ?? ''}</textarea>
			</div>
		</div>

		<div class="mt-6 flex flex-col gap-3 border-t border-stone-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
			<p class="text-xs text-stone-500">
				{#if data.user}
					Connecté en tant que {data.user.name}
				{:else}
					Connexion requise pour envoyer la question.
				{/if}
			</p>
			<button
				type="submit"
				disabled={submitting || formDisabled}
				class="bg-missionnaire px-6 py-3 text-xs font-bold uppercase tracking-[0.18em] text-white transition hover:bg-missionnaire-600 disabled:cursor-not-allowed disabled:opacity-60"
			>
				{submitting ? 'Envoi...' : 'Envoyer la question'}
			</button>
		</div>
	</form>
</div>
