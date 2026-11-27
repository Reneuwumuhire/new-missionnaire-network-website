<script lang="ts">
	import { t } from '../../../i18n';
	import Breadcrumbs from '$lib/components/+breadcrumbs.svelte';
	import ArrowRight2 from 'iconsax-svelte/ArrowRight2.svelte';
	import Book1 from 'iconsax-svelte/Book1.svelte';
	import DocumentDownload from 'iconsax-svelte/DocumentDownload.svelte';
	let { data } = $props();
</script>

<header
	class="border-b border-stone-800 bg-stone-900 bg-[url('/img/predications_header.jpg')] bg-cover bg-[center_30%]"
>
	<div class="bg-stone-950/85">
		<div class="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 md:py-8">
			<a
				href="/literature"
				class="font-display text-[26px] font-semibold leading-none text-white transition-colors hover:text-missionnaire md:text-4xl"
			>
				{$t('nav.literature')}
			</a>
		</div>
	</div>
</header>

<div class="mx-auto w-full max-w-7xl px-4 pt-4 pb-16 sm:px-6 md:pt-8">
	<Breadcrumbs
		items={[{ label: $t('nav.literature'), href: '/literature' }, { label: data.title }]}
	/>
	<article class="mx-auto w-full max-w-4xl">
		<div
			class="flex flex-col gap-5 border border-stone-200 bg-white/60 p-4 sm:flex-row sm:items-start sm:gap-7 sm:p-6 md:p-8"
		>
			{#if data.coverUrl}
				<div
					aria-hidden="true"
					class="relative grid aspect-[5/7] w-24 shrink-0 place-items-center overflow-hidden border border-stone-200 bg-cream text-missionnaire-Yellow-700 shadow-sm sm:w-36"
				>
					<Book1 size={32} color="currentColor" />
					<img
						src={data.coverUrl}
						alt=""
						width="160"
						height="224"
						decoding="async"
						onerror={(event) => (event.currentTarget.hidden = true)}
						class="absolute inset-0 h-full w-full object-contain"
					/>
				</div>
			{/if}
			<div class="min-w-0 flex-1">
				<h1
					class="break-words font-display text-3xl font-semibold leading-tight text-stone-900 sm:text-4xl"
				>
					{data.title}
				</h1>
				<p class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-stone-600">
					<span class="font-semibold text-stone-800">{data.author}</span>
					<span class="border-l border-stone-300 pl-3">
						{$t(data.language === 'english' ? 'lang.english' : 'lang.french')}
					</span>
				</p>
				{#if data.description}
					<p
						class="mt-4 max-w-prose whitespace-pre-line break-words text-sm leading-relaxed text-stone-700 sm:text-base"
					>
						{data.description}
					</p>
				{/if}
				{#if data.pdfUrl}
					<a
						href={data.pdfUrl}
						class="mt-5 inline-flex min-h-11 items-center gap-2 border border-stone-900 bg-stone-900 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-missionnaire-Yellow-700"
						target="_blank"
						rel="noopener noreferrer"
					>
						<span aria-hidden="true"><DocumentDownload size={18} color="currentColor" /></span>
						{$t(data.parts.length ? 'literature.downloadBook' : 'predications.openPdf')}
					</a>
				{/if}
			</div>
		</div>
		{#if data.parts.length}
			<section aria-labelledby="literature-contents" class="mt-7">
				<h2
					id="literature-contents"
					class="mb-3 flex items-center gap-2 font-display text-2xl font-semibold text-stone-900"
				>
					<span aria-hidden="true" class="text-missionnaire-Yellow-700"
						><Book1 size={20} color="currentColor" /></span
					>
					{$t('literature.contents')}
				</h2>
				<ol class="divide-y divide-stone-200 border border-stone-200 bg-white/60">
					{#each data.parts as part}
						<li>
							<a
								href={part.url}
								target="_blank"
								rel="noopener noreferrer"
								class="flex min-h-14 items-center gap-3 px-3 py-3 text-sm font-semibold leading-snug text-stone-800 hover:bg-missionnaire-50 hover:text-missionnaire-Yellow-700 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-missionnaire-Yellow-700 sm:px-4"
							>
								<span
									aria-hidden="true"
									class="grid size-8 shrink-0 place-items-center border border-stone-200 bg-cream text-xs tabular-nums text-stone-600"
									>{part.position}</span
								>
								<span class="min-w-0 flex-1 break-words">
									{part.title}
									{#if part.code}<span class="mt-0.5 block text-xs font-normal text-stone-600"
											>{part.code}</span
										>{/if}
								</span>
								<span aria-hidden="true" class="shrink-0 text-missionnaire-Yellow-700"
									><ArrowRight2 size={16} color="currentColor" /></span
								>
							</a>
						</li>
					{/each}
				</ol>
			</section>
		{/if}
	</article>
</div>
