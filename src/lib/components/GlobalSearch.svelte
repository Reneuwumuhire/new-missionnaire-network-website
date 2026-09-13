<script lang="ts">
	import { onDestroy, tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { portal } from '$lib/actions/portal';
	import { focusTrap } from '$lib/actions/focusTrap';
	import { libraryHref, type LibraryResponse } from '$lib/utils/librarySearch';
	import { MAX_PASSAGE_QUERY } from '$lib/utils/passageSearch';
	import { t } from '../../i18n';
	let open = $state(false),
		query = $state(''),
		loading = $state(false),
		failed = $state(false);
	let results: LibraryResponse | null = $state(null);
	let inputEl: HTMLInputElement | undefined = $state();
	let debounce: ReturnType<typeof setTimeout> | undefined;
	let controller: AbortController | null = null;
	let request = 0;
	function cancel() {
		clearTimeout(debounce);
		controller?.abort();
		controller = null;
		request++;
	}
	export function openSearch() {
		open = true;
		void tick().then(() => inputEl?.focus());
	}
	function close() {
		cancel();
		open = false;
		query = '';
		results = null;
		loading = false;
		failed = false;
	}
	function go(href: string) {
		close();
		void goto(href);
	}
	function onInput(event: Event) {
		query = (event.currentTarget as HTMLInputElement).value;
		cancel();
		results = null;
		failed = false;
		const q = query.trim(),
			token = request;
		loading = q.length >= 2;
		if (!loading) return;
		debounce = setTimeout(async () => {
			controller = new AbortController();
			try {
				const response = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
					signal: controller.signal
				});
				if (!response.ok) throw new Error('search');
				const payload = await response.json();
				if (token === request && open) results = payload;
			} catch {
				if (token === request && open) failed = true;
			} finally {
				if (token === request) loading = false;
			}
		}, 300);
	}
	onDestroy(cancel);
</script>

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
		aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg
	>
</button>

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="global-search-backdrop"
		use:portal
		onclick={(e) => {
			if (e.target === e.currentTarget) close();
		}}
	>
		<div
			class="global-search-panel"
			role="dialog"
			aria-modal="true"
			aria-label={$t('search.open')}
			use:focusTrap={{ onEscape: close, initialFocus: false }}
		>
			<form
				class="flex items-center gap-2 border-b border-stone-200 px-4"
				onsubmit={(e) => {
					e.preventDefault();
					if (query.trim().length >= 2) go(libraryHref({ q: query.trim() }));
				}}
			>
				<input
					bind:this={inputEl}
					bind:value={query}
					oninput={onInput}
					type="search"
					maxlength={MAX_PASSAGE_QUERY}
					placeholder={$t('search.placeholder')}
					class="min-w-0 w-full bg-transparent py-4 text-base font-body focus:outline-none"
					aria-label={$t('search.placeholder')}
					autocomplete="off"
				/>
				<button
					type="button"
					class="h-11 w-11 shrink-0 text-stone-600"
					aria-label={$t('search.close')}
					onclick={close}>✕</button
				>
			</form>
			<div class="overflow-y-auto overscroll-contain p-4" aria-live="polite" aria-busy={loading}>
				{#if query.trim().length < 2}<p class="py-6 text-sm text-stone-500">
						{$t('search.minChars')}
					</p>
				{:else if loading}<p class="py-6 text-sm text-stone-500">{$t('search.loading')}</p>
				{:else if failed}<p class="py-6 text-sm text-red-700" role="alert">
						{$t('search.unavailable')}
					</p>
				{:else if results}
					{#each results.results.slice(0, 5) as result (`${result.type}:${result.id}`)}
						{#if result.href}<a
								href={result.href}
								onclick={close}
								class="block rounded-lg p-3 hover:bg-missionnaire-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-missionnaire"
							>
								<span class="text-xs text-stone-500"
									>{$t(`search.${result.type}`)}{result.author ? ` · ${result.author}` : ''}</span
								>
								<span class="block text-sm font-medium text-stone-800 break-words"
									>{result.title}</span
								>
							</a>{/if}
					{:else}<p class="py-6 text-sm text-stone-500">{$t('search.noResults')}</p>{/each}
				{/if}
			</div>
			{#if query.trim().length >= 2}
				<a
					href={libraryHref({ q: query.trim() })}
					onclick={close}
					class="block border-t border-stone-200 px-6 py-4 text-sm font-semibold text-missionnaire-Yellow-700 hover:underline"
					>{$t('search.seeAll')}{results ? ` (${results.total})` : ''}</a
				>
			{/if}
		</div>
	</div>
{/if}

<style>
	.global-search-backdrop {
		position: fixed;
		inset: 0;
		z-index: 140;
		background: rgba(28, 25, 23, 0.45);
		backdrop-filter: blur(2px);
		display: flex;
		align-items: flex-start;
		justify-content: center;
		padding: 10vh 1rem 1rem;
	}
	.global-search-panel {
		width: 100%;
		max-width: 640px;
		max-height: 80dvh;
		display: flex;
		flex-direction: column;
		background: #faf8f3;
		color: #292524;
		border: 1px solid #e7e5e4;
		box-shadow: 0 16px 50px rgba(0, 0, 0, 0.2);
		font-family: var(--font-body, system-ui, sans-serif);
	}
	@media (max-width: 640px) {
		.global-search-backdrop {
			padding: env(safe-area-inset-top) 0 0;
		}
		.global-search-panel {
			max-height: 100dvh;
			border: 0;
		}
	}
</style>
