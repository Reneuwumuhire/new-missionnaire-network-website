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
		class="flex h-10 items-stretch border border-stone-200 bg-white focus-within:border-missionnaire/60 md:h-11"
	>
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
			class="min-w-0 flex-1 bg-transparent px-3 font-body text-sm text-stone-800 outline-none placeholder:text-stone-400"
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
				class="px-2 text-stone-500 hover:text-stone-800"
				aria-label={$t('music.clearSearch')}
				onclick={() => {
					query = '';
					active = -1;
					input.focus();
					if ($page.url.searchParams.has('search')) submit();
				}}>✕</button
			>
		{/if}
		<button
			type="submit"
			class="bg-missionnaire px-3 font-body text-[10px] font-bold uppercase tracking-wider text-white hover:bg-missionnaire/90"
			>{$t('search.action')}</button
		>
	</div>
	{#if showDropdown}
		<div
			class="absolute left-0 right-0 top-full z-40 mt-1 border border-stone-200 bg-white shadow-xl"
		>
			<div
				id={`${id}-results`}
				role="listbox"
				aria-label={$t('music.searchPlaceholder')}
				aria-busy={loading}
			>
				{#each matches as song, index}
					<button
						type="button"
						role="option"
						id={`${id}-result-${index}`}
						aria-selected={active === index}
						tabindex="-1"
						class="block w-full px-4 py-3 text-left hover:bg-stone-100 {active === index
							? 'bg-stone-100'
							: ''}"
						onclick={() => submit(song)}
					>
						<span class="block truncate text-sm font-medium text-stone-800"
							>{song.title || song.category}</span
						>
						{#if song.artist}<span class="block truncate text-xs text-stone-500">{song.artist}</span
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
				class="w-full border-t border-stone-100 px-4 py-3 text-left text-sm font-medium text-missionnaire"
				>{$t('search.seeAll')} →</button
			>
		</div>
	{/if}
</form>
