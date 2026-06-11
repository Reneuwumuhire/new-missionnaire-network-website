<script lang="ts">
	import { goto } from '$app/navigation';
	import { portal } from '$lib/actions/portal';
	import { focusTrap } from '$lib/actions/focusTrap';
	import { t } from '../../i18n';
	import { buildSermonSlug } from '../../utils/sermonSlug';

	interface SearchResults {
		sermons: Array<{
			_id?: string;
			french_title?: string;
			english_title?: string;
			iso_date?: string;
			date_code?: string;
			full_date_code?: string;
		}>;
		songs: Array<{ _id?: string; title?: string; artist?: string }>;
		transcriptions: Array<{ _id: string; filename: string; videoDisplayId?: string }>;
		recordings: Array<{ id: string; title: string; started_at?: string }>;
		totals: { sermons: number; songs: number; transcriptions: number; recordings: number };
	}

	let open = $state(false);
	let query = $state('');
	let results = $state<SearchResults | null>(null);
	let isLoading = $state(false);
	let hasError = $state(false);
	let inputEl: HTMLInputElement | undefined = $state();
	let requestToken = 0;

	let trimmed = $derived(query.trim());
	let hasAnyResult = $derived.by(() => {
		const r = results;
		if (!r) return false;
		return (
			r.sermons.length > 0 ||
			r.songs.length > 0 ||
			r.transcriptions.length > 0 ||
			r.recordings.length > 0
		);
	});

	export function openSearch() {
		open = true;
		// Wait for the overlay to render, then focus the input.
		setTimeout(() => inputEl?.focus(), 30);
	}

	function close() {
		open = false;
		query = '';
		results = null;
		hasError = false;
	}

	async function runSearch(q: string) {
		const token = ++requestToken;
		if (q.length < 2) {
			results = null;
			isLoading = false;
			return;
		}
		isLoading = true;
		hasError = false;
		try {
			const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
			if (token !== requestToken) return;
			if (!res.ok) throw new Error(`search ${res.status}`);
			results = (await res.json()) as SearchResults;
		} catch {
			if (token !== requestToken) return;
			hasError = true;
			results = null;
		} finally {
			if (token === requestToken) isLoading = false;
		}
	}

	let searchDebounce: ReturnType<typeof setTimeout> | undefined;

	function onInput() {
		const q = trimmed;
		clearTimeout(searchDebounce);
		searchDebounce = setTimeout(() => void runSearch(q), 300);
	}

	function go(href: string) {
		close();
		void goto(href);
	}

	function onSubmit(e: SubmitEvent) {
		e.preventDefault();
		if (trimmed.length >= 2) go(`/predications?search=${encodeURIComponent(trimmed)}`);
	}

	function onBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) close();
	}
</script>

<!-- Search trigger (rendered where the component is placed in the navbar) -->
<button
	type="button"
	class="flex h-11 w-11 items-center justify-center text-stone-500 hover:text-missionnaire transition-colors"
	aria-label={$t('search.open')}
	onclick={openSearch}
>
	<svg
		width="18"
		height="18"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
	>
		<circle cx="11" cy="11" r="7" />
		<path d="m21 21-4.3-4.3" />
	</svg>
</button>

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="global-search-backdrop" use:portal onclick={onBackdropClick}>
		<div
			class="global-search-panel"
			role="dialog"
			aria-modal="true"
			aria-label={$t('search.open')}
			use:focusTrap={{ onEscape: close, initialFocus: false }}
		>
			<form class="flex items-center gap-2 border-b border-stone-200/60 px-4" onsubmit={onSubmit}>
				<svg
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					class="shrink-0 text-stone-400"
					aria-hidden="true"
				>
					<circle cx="11" cy="11" r="7" />
					<path d="m21 21-4.3-4.3" />
				</svg>
				<input
					bind:this={inputEl}
					bind:value={query}
					oninput={onInput}
					type="search"
					placeholder={$t('search.placeholder')}
					class="w-full bg-transparent py-4 text-[15px] text-stone-800 font-body placeholder:text-stone-400 focus:outline-none"
					aria-label={$t('search.placeholder')}
					autocomplete="off"
				/>
				<button
					type="button"
					class="flex h-11 w-11 shrink-0 items-center justify-center text-stone-400 hover:text-stone-700 transition-colors"
					aria-label={$t('search.close')}
					onclick={close}
				>
					<svg
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						aria-hidden="true"
					>
						<path d="M6 6l12 12M6 18L18 6" />
					</svg>
				</button>
			</form>

			<div class="max-h-[60vh] overflow-y-auto overscroll-contain px-2 py-2" aria-live="polite">
				{#if trimmed.length < 2}
					<p class="px-3 py-6 text-center text-[13px] text-stone-400 font-body">
						{$t('search.minChars')}
					</p>
				{:else if isLoading}
					<div class="space-y-2 px-3 py-4">
						{#each Array(4) as _}
							<div class="h-9 animate-pulse bg-stone-200/50"></div>
						{/each}
					</div>
				{:else if hasError}
					<p class="px-3 py-6 text-center text-[13px] text-red-600 font-body" role="alert">
						{$t('errors.listFailed')}
					</p>
				{:else if results && !hasAnyResult}
					<p class="px-3 py-6 text-center text-[13px] text-stone-400 font-body">
						{$t('search.noResults')}
					</p>
				{:else if results}
					{#if results.sermons.length > 0}
						<div class="px-1 pb-2">
							<p class="search-group-label">{$t('search.sermons')}</p>
							{#each results.sermons as sermon}
								<button
									type="button"
									class="search-result"
									onclick={() => go(`/predications/${buildSermonSlug(sermon as never)}`)}
								>
									<span class="truncate">{sermon.french_title || sermon.english_title}</span>
								</button>
							{/each}
							{#if results.totals.sermons > results.sermons.length}
								<button
									type="button"
									class="search-see-all"
									onclick={() => go(`/predications?search=${encodeURIComponent(trimmed)}`)}
								>
									{$t('search.seeAll')} ({results.totals.sermons}) →
								</button>
							{/if}
						</div>
					{/if}

					{#if results.songs.length > 0}
						<div class="px-1 pb-2">
							<p class="search-group-label">{$t('search.songs')}</p>
							{#each results.songs as song}
								<button
									type="button"
									class="search-result"
									onclick={() => go(`/musique?play=${song._id}`)}
								>
									<span class="truncate">{song.title}</span>
									{#if song.artist}
										<span class="ml-2 shrink-0 text-[11px] text-stone-400">{song.artist}</span>
									{/if}
								</button>
							{/each}
							{#if results.totals.songs > results.songs.length}
								<button
									type="button"
									class="search-see-all"
									onclick={() => go(`/musique?search=${encodeURIComponent(trimmed)}`)}
								>
									{$t('search.seeAll')} ({results.totals.songs}) →
								</button>
							{/if}
						</div>
					{/if}

					{#if results.transcriptions.length > 0}
						<div class="px-1 pb-2">
							<p class="search-group-label">{$t('search.transcriptions')}</p>
							{#each results.transcriptions as doc}
								<button
									type="button"
									class="search-result"
									onclick={() => go(`/transcriptions?search=${encodeURIComponent(trimmed)}`)}
								>
									<span class="truncate">{doc.filename}</span>
								</button>
							{/each}
							{#if results.totals.transcriptions > results.transcriptions.length}
								<button
									type="button"
									class="search-see-all"
									onclick={() => go(`/transcriptions?search=${encodeURIComponent(trimmed)}`)}
								>
									{$t('search.seeAll')} ({results.totals.transcriptions}) →
								</button>
							{/if}
						</div>
					{/if}

					{#if results.recordings.length > 0}
						<div class="px-1 pb-2">
							<p class="search-group-label">{$t('search.recordings')}</p>
							{#each results.recordings as rec}
								<button
									type="button"
									class="search-result"
									onclick={() => go(`/live/rediffusions/${rec.id}`)}
								>
									<span class="truncate">{rec.title}</span>
								</button>
							{/each}
							{#if results.totals.recordings > results.recordings.length}
								<button
									type="button"
									class="search-see-all"
									onclick={() => go(`/live/rediffusions?q=${encodeURIComponent(trimmed)}`)}
								>
									{$t('search.seeAll')} ({results.totals.recordings}) →
								</button>
							{/if}
						</div>
					{/if}
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.global-search-backdrop {
		position: fixed;
		inset: 0;
		z-index: 70;
		background: rgba(28, 25, 23, 0.45);
		backdrop-filter: blur(2px);
		-webkit-backdrop-filter: blur(2px);
		display: flex;
		align-items: flex-start;
		justify-content: center;
		padding: 10vh 1rem 1rem;
		animation: gs-fade 0.15s ease-out;
	}

	.global-search-panel {
		width: 100%;
		max-width: 640px;
		background: #faf8f3;
		border: 1px solid #e7e5e4;
		box-shadow: 0 16px 50px rgba(0, 0, 0, 0.2);
		animation: gs-pop 0.18s cubic-bezier(0.16, 1, 0.3, 1);
	}

	.search-group-label {
		padding: 8px 12px 4px;
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.25em;
		text-transform: uppercase;
		color: #ff880c;
		font-family: var(--font-body, system-ui, sans-serif);
	}

	.search-result {
		display: flex;
		align-items: center;
		width: 100%;
		min-height: 44px;
		padding: 8px 12px;
		text-align: left;
		font-size: 13px;
		color: #44403c;
		font-family: var(--font-body, system-ui, sans-serif);
		transition: background-color 0.12s ease;
	}

	.search-result:hover,
	.search-result:focus-visible {
		background: rgba(255, 136, 12, 0.07);
		color: #1c1917;
	}

	.search-see-all {
		display: block;
		width: 100%;
		min-height: 44px;
		padding: 8px 12px;
		text-align: left;
		font-size: 12px;
		font-weight: 700;
		color: #ff880c;
		font-family: var(--font-body, system-ui, sans-serif);
	}

	.search-see-all:hover {
		text-decoration: underline;
	}

	@media (max-width: 640px) {
		.global-search-backdrop {
			padding: 0;
			align-items: stretch;
		}
		.global-search-panel {
			max-width: none;
			border: 0;
		}
	}

	@keyframes gs-fade {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	@keyframes gs-pop {
		from {
			transform: translateY(-8px);
			opacity: 0;
		}
		to {
			transform: translateY(0);
			opacity: 1;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.global-search-backdrop,
		.global-search-panel {
			animation: none;
		}
	}
</style>
