<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { t } from '../../i18n';
	import type { MusicAudio } from '$lib/models/music-audio';

	let { id, suggestions = true }: { id: string; suggestions?: boolean } = $props();
	let query = $state('');
	let open = $state(false);
	let loading = $state(false);
	let failed = $state(false);
	let matches = $state<MusicAudio[]>([]);
	let active = $state(-1);
	let input: HTMLInputElement;
	const showDropdown = $derived(suggestions && open && query.trim().length > 0);

	// Only navigation syncs the draft. Typing never navigates or reloads the list.
	$effect(() => {
		query = $page.url.searchParams.get('search') ?? '';
		open = false;
		active = -1;
	});

	$effect(() => {
		const search = query.trim();
		const category = $page.url.searchParams.get('category');
		if (!suggestions || !open || !search) return;
		const controller = new AbortController();
		matches = [];
		loading = true;
		failed = false;
		const timer = setTimeout(async () => {
			try {
				const params = new URLSearchParams({ search, limit: '5', pageNumber: '1' });
				if (category) params.set('category', category);
				const response = await fetch(`/api/music-audio?${params}`, { signal: controller.signal });
				if (!response.ok) throw new Error('Music search failed');
				const result = await response.json();
				if (!controller.signal.aborted) matches = (result.data ?? []).slice(0, 5);
			} catch {
				if (!controller.signal.aborted) failed = true;
			} finally {
				if (!controller.signal.aborted) loading = false;
			}
		}, 300);
		return () => {
			clearTimeout(timer);
			controller.abort();
		};
	});

	function submit(song?: MusicAudio) {
		open = false;
		active = -1;
		const params = new URLSearchParams($page.url.searchParams);
		const search = query.trim();
		if (search) params.set('search', search);
		else params.delete('search');
		for (const key of ['alpha', 'artist', 'seed', 'play']) params.delete(key);
		params.set('page', '1');
		if (song?._id) params.set('play', song._id);
		void goto(`?${params}`, { keepFocus: true, noScroll: true });
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.isComposing) return;
		if (event.key === 'Escape') {
			open = false;
			active = -1;
		} else if (showDropdown && matches.length && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
			event.preventDefault();
			active =
				event.key === 'ArrowDown'
					? (active + 1) % matches.length
					: (active <= 0 ? matches.length : active) - 1;
		} else if (event.key === 'Enter' && showDropdown && active >= 0 && matches[active]) {
			event.preventDefault();
			submit(matches[active]);
		}
	}
</script>

<form
	class="relative w-full"
	role="search"
	autocomplete="off"
	onsubmit={(event) => {
		event.preventDefault();
		submit();
	}}
	onfocusout={(event) => {
		if (!event.currentTarget.contains(event.relatedTarget as Node | null)) open = false;
	}}
>
	<div
		class="flex h-10 items-center rounded-full border border-stone-200/80 bg-white/90 transition-shadow focus-within:border-missionnaire/50 focus-within:ring-2 focus-within:ring-missionnaire/10 md:h-11 md:items-stretch md:rounded-none md:border-stone-200 md:bg-white md:focus-within:border-missionnaire/60 md:focus-within:ring-0"
	>
		<button
			type="submit"
			aria-label={$t('search.action')}
			title={$t('search.action')}
			class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-stone-400 transition-colors hover:text-missionnaire focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-missionnaire/40 md:hidden"
		>
			<svg
				width="16"
				height="16"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="1.8"
				stroke-linecap="round"
				aria-hidden="true"
			>
				<circle cx="10.5" cy="10.5" r="6.5" />
				<path d="m16 16 4.5 4.5" />
			</svg>
		</button>
		<input
			bind:this={input}
			{id}
			type="text"
			inputmode="search"
			enterkeyhint="search"
			role="combobox"
			aria-autocomplete="list"
			aria-expanded={showDropdown}
			aria-controls={showDropdown ? `${id}-results` : undefined}
			aria-activedescendant={showDropdown && matches[active] ? `${id}-result-${active}` : undefined}
			aria-label={$t('music.searchPlaceholder')}
			placeholder={$t('music.searchPlaceholder')}
			autocomplete="off"
			class="h-full min-w-0 flex-1 bg-transparent pr-4 font-body text-sm text-stone-800 outline-none placeholder:text-stone-400 md:px-3"
			bind:value={query}
			oninput={() => {
				active = -1;
				open = true;
			}}
			onfocus={() => {
				open = true;
			}}
			onkeydown={onKeydown}
		/>
		{#if query}
			<button
				type="button"
				class="mr-1 flex h-8 w-8 shrink-0 items-center justify-center self-center rounded-full text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-missionnaire/40 md:mr-0 md:w-auto md:rounded-none md:px-2"
				aria-label={$t('music.clearSearch')}
				onclick={() => {
					query = '';
					active = -1;
					input.focus();
					if ($page.url.searchParams.has('search')) submit();
				}}
			>
				<svg
					width="14"
					height="14"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="1.8"
					stroke-linecap="round"
					aria-hidden="true"><path d="m6 6 12 12M6 18 18 6" /></svg
				>
			</button>
		{/if}
		<button
			type="submit"
			class="hidden bg-missionnaire px-3 font-body text-[10px] font-bold uppercase tracking-wider text-white hover:bg-missionnaire/90 md:block"
			>{$t('search.action')}</button
		>
	</div>
	{#if showDropdown}
		<div
			class="absolute left-0 right-0 top-full z-40 mt-2 overflow-hidden rounded-xl border border-stone-200/80 bg-[#fdfcf9] shadow-lg shadow-stone-900/10 md:mt-1 md:rounded-none md:border-stone-200 md:bg-white md:shadow-xl"
		>
			<div
				id={`${id}-results`}
				role="listbox"
				aria-label={$t('music.searchPlaceholder')}
				aria-busy={loading}
				class="divide-y divide-stone-100"
			>
				{#each matches as song, index}
					<button
						type="button"
						role="option"
						id={`${id}-result-${index}`}
						aria-selected={active === index}
						tabindex="-1"
						class="block w-full px-4 py-3 text-left transition-colors hover:bg-missionnaire/5 {active ===
						index
							? 'bg-missionnaire/5'
							: ''}"
						onclick={() => submit(song)}
					>
						<span class="block truncate font-body text-[13px] font-medium text-stone-800"
							>{song.title || song.category}</span
						>
						{#if song.artist}<span
								class="mt-0.5 block truncate font-body text-[11px] text-stone-400"
								>{song.artist}</span
							>{/if}
					</button>
				{/each}
			</div>
			{#if loading || failed || matches.length === 0}
				<p role="status" class="px-4 py-3 text-sm text-stone-500">
					{$t(loading ? 'music.searchLoading' : failed ? 'music.searchFailed' : 'search.noResults')}
				</p>
			{/if}
			<button
				type="submit"
				class="w-full border-t border-stone-200/60 px-4 py-3 text-left font-body text-xs font-medium text-missionnaire transition-colors hover:bg-missionnaire/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-missionnaire/40"
				>{$t('search.seeAll')} →</button
			>
		</div>
	{/if}
</form>
