<script lang="ts">
	import Pagination from '$lib/components/Pagination.svelte';
	import type { Question } from '$lib/models/questions';
	import { stripRichTextFormatting } from '$lib/questions/rich-text';
	// @ts-ignore - svelte-icons-pack ships loose icon typings in this project.
	import Icon from 'svelte-icons-pack/Icon.svelte';
	import IoArrowForward from 'svelte-icons-pack/io/IoArrowForward';
	import IoChevronDown from 'svelte-icons-pack/io/IoChevronDown';
	import IoFilterOutline from 'svelte-icons-pack/io/IoFilterOutline';

	export let data;

	let filtersOpen = false;

	$: questions = (data.questions || []) as Question[];
	$: totalPages = Math.max(1, Math.ceil((data.total || 0) / (data.limit || 12)));

	const sortOptions = [
		{ value: 'newest', label: 'Plus récentes' },
		{ value: 'answered', label: 'Répondues' },
		{ value: 'popular', label: 'Populaires' },
		{ value: 'featured', label: 'En avant' }
	];

	function formatDate(value: string | null): string {
		if (!value) return '';
		return new Date(value).toLocaleDateString('fr-FR', {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		});
	}

	function formatShortDate(value: string | null): string {
		if (!value) return '-';
		return new Date(value).toLocaleDateString('fr-FR', {
			day: 'numeric',
			month: 'short'
		});
	}

	function activityDateValue(question: Question): string {
		return formatShortDate(question.answeredAt ?? question.approvedAt ?? question.createdAt);
	}

	function activityDateLabel(question: Question): string {
		return question.answeredAt ? 'Répondu' : 'Publié';
	}

	function getPageHref(page: number): string {
		const params = new URLSearchParams();
		if (data.search) params.set('search', data.search);
		if (data.sort && data.sort !== 'newest') params.set('sort', data.sort);
		if (data.category) params.set('category', data.category);
		if (data.answered) params.set('answered', data.answered);
		if (data.from) params.set('from', data.from);
		if (data.to) params.set('to', data.to);
		if (page > 1) params.set('page', String(page));
		const query = params.toString();
		return query ? `/questions?${query}` : '/questions';
	}
</script>

<svelte:head>
	<title>Questions et réponses - Missionnaire Network</title>
	<meta
		name="description"
		content="Parcourez les questions bibliques publiées et les réponses pastorales de Missionnaire Network."
	/>
	<meta property="og:title" content="Questions et réponses - Missionnaire Network" />
	<meta
		property="og:description"
		content="Questions publiques, réponses pastorales et références audio, vidéo et littérature."
	/>
</svelte:head>

<div class="container mx-auto max-w-6xl px-4 py-10 md:px-8">
	<section class="mb-8 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
		<div>
			<p class="mb-3 text-[11px] font-bold uppercase tracking-[0.24em] text-missionnaire">
				Questions bibliques
			</p>
			<h1 class="font-display text-4xl font-semibold leading-tight text-stone-900 md:text-5xl">
				Questions et réponses
			</h1>
			<p class="mt-3 max-w-2xl text-sm leading-7 text-stone-600 md:text-base">
				Retrouvez les questions déjà publiées et les réponses données pour l'édification de
				l'assemblée.
			</p>
		</div>
		<a href="/questions/ask" class="section-cta self-start md:self-auto">
			<span class="section-cta-label">Poser une question</span>
			<span class="section-cta-arrow" aria-hidden="true">
				<Icon src={IoArrowForward} className="h-3.5 w-3.5" />
			</span>
		</a>
	</section>

	<button
		type="button"
		class="mb-3 flex min-h-11 w-full items-center justify-between border border-stone-200/80 bg-white/65 px-4 text-xs font-bold uppercase tracking-[0.18em] text-stone-800 md:hidden"
		aria-controls="question-filters"
		aria-expanded={filtersOpen}
		on:click={() => (filtersOpen = !filtersOpen)}
	>
		<span class="inline-flex items-center gap-2">
			<Icon src={IoFilterOutline} className="h-4 w-4 text-missionnaire" />
			Filtres
		</span>
		<span class="transition-transform {filtersOpen ? 'rotate-180' : ''}" aria-hidden="true">
			<Icon src={IoChevronDown} className="h-4 w-4" />
		</span>
	</button>

	<form
		id="question-filters"
		method="GET"
		class="mb-8 {filtersOpen ? 'grid' : 'hidden'} gap-3 border border-stone-200/70 bg-white/45 p-4 md:grid md:grid-cols-[minmax(0,1fr)_180px_170px_150px_auto]"
	>
		<label class="sr-only" for="question-search">Recherche</label>
		<input
			id="question-search"
			name="search"
			value={data.search}
			placeholder="Rechercher une question"
			class="min-h-11 border border-stone-200 bg-white px-4 text-sm text-stone-800 outline-none transition focus:border-missionnaire focus:ring-2 focus:ring-missionnaire/20"
		/>

		<label class="sr-only" for="question-category">Catégorie</label>
		<select
			id="question-category"
			name="category"
			class="min-h-11 border border-stone-200 bg-white px-3 text-sm text-stone-700 outline-none focus:border-missionnaire focus:ring-2 focus:ring-missionnaire/20"
		>
			<option value="">Toutes catégories</option>
			{#each data.categories as category}
				<option value={category} selected={category === data.category}>{category}</option>
			{/each}
		</select>

		<label class="sr-only" for="question-answered">État</label>
		<select
			id="question-answered"
			name="answered"
			class="min-h-11 border border-stone-200 bg-white px-3 text-sm text-stone-700 outline-none focus:border-missionnaire focus:ring-2 focus:ring-missionnaire/20"
		>
			<option value="">Toutes</option>
			<option value="answered" selected={data.answered === 'answered'}>Avec réponse</option>
			<option value="unanswered" selected={data.answered === 'unanswered'}>Sans réponse</option>
		</select>

		<label class="sr-only" for="question-sort">Tri</label>
		<select
			id="question-sort"
			name="sort"
			class="min-h-11 border border-stone-200 bg-white px-3 text-sm text-stone-700 outline-none focus:border-missionnaire focus:ring-2 focus:ring-missionnaire/20"
		>
			{#each sortOptions as option}
				<option value={option.value} selected={data.sort === option.value}>{option.label}</option>
			{/each}
		</select>

		<button
			type="submit"
			class="min-h-11 bg-stone-900 px-5 text-xs font-bold uppercase tracking-[0.18em] text-white transition hover:bg-missionnaire"
		>
			Filtrer
		</button>
	</form>

	{#if data.loadError}
		<div class="border border-red-200 bg-red-50 p-5 text-sm text-red-700">{data.loadError}</div>
	{:else if questions.length === 0}
		<div class="border border-stone-200/70 bg-white/50 p-8 text-center">
			<p class="font-display text-2xl font-semibold text-stone-800">Aucune question publiée</p>
			<p class="mt-2 text-sm text-stone-500">Essayez une autre recherche ou revenez plus tard.</p>
		</div>
	{:else}
		<div class="grid gap-4">
			{#each questions as question}
				<article class="border border-stone-200/70 bg-white/70 p-5 transition hover:border-missionnaire/40">
					<div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
						<div class="min-w-0">
							<div class="mb-3 flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em]">
								{#if question.featured}
									<span class="bg-missionnaire px-2 py-1 text-white">En avant</span>
								{/if}
								<span class={question.status === 'answered' ? 'text-green-700' : 'text-stone-500'}>
									{question.status === 'answered' ? 'Répondue' : 'Publiée'}
								</span>
								{#if question.category}
									<span class="text-stone-400">/ {question.category}</span>
								{/if}
							</div>
							<h2 class="font-display text-2xl font-semibold leading-snug text-stone-900">
								<a href={`/questions/${question.slug}`} class="hover:text-missionnaire">
									{question.title}
								</a>
							</h2>
							<p class="mt-2 line-clamp-2 text-sm leading-6 text-stone-600">{stripRichTextFormatting(question.body)}</p>
						</div>
						<div class="grid grid-cols-3 gap-2 text-center md:w-64 md:shrink-0">
							<div class="border border-stone-100 bg-cream/60 px-3 py-2">
								<p class="text-lg font-semibold text-stone-800">{question.replyCount}</p>
								<p class="text-[10px] uppercase tracking-wider text-stone-400">Réponses</p>
							</div>
							<div class="border border-stone-100 bg-cream/60 px-3 py-2">
								<p class="text-lg font-semibold text-stone-800">{question.viewCount}</p>
								<p class="text-[10px] uppercase tracking-wider text-stone-400">Vues</p>
							</div>
							<div class="border border-stone-100 bg-cream/60 px-2 py-2">
								<p class="whitespace-nowrap text-sm font-semibold leading-6 text-stone-800">
									{activityDateValue(question)}
								</p>
								<p class="text-[10px] uppercase tracking-wider text-stone-400">{activityDateLabel(question)}</p>
							</div>
						</div>
					</div>
					<div class="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-stone-100 pt-4 text-xs text-stone-500">
						<span>Posée par {question.authorDisplayName} le {formatDate(question.createdAt)}</span>
						<a href={`/questions/${question.slug}`} class="font-semibold text-missionnaire hover:text-stone-900">
							Lire la question
						</a>
					</div>
				</article>
			{/each}
		</div>

		<div class="mt-8">
			<Pagination current={data.page} total={totalPages} getHref={getPageHref} />
		</div>
	{/if}
</div>
