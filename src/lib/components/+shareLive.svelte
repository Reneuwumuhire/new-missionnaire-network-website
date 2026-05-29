<script lang="ts">
	import { browser } from '$app/environment';
	import { onDestroy } from 'svelte';

	// ── Share the live stream ──────────────────────────────────────
	// Lets a listener share the live page with others. The shared link
	// points at /live, which auto-starts playback as soon as the direct
	// is on air — so recipients land straight on the live audio.
	// Same dropdown UI as the music player and rediffusion pages: a
	// "Partager" trigger that opens the native share sheet and a plain
	// "Copier le lien" fallback, with inline copy/error feedback.
	let isShareMenuOpen = false;
	let shareFeedback: 'copied' | 'error' | null = null;
	let shareFeedbackTimer: ReturnType<typeof setTimeout> | null = null;
	let shareWrapEl: HTMLElement | null = null;
	$: hasNativeShare =
		browser && typeof navigator !== 'undefined' && typeof navigator.share === 'function';

	// Title/text for the native share sheet — the page passes the current
	// live's title when on air, otherwise the generic copy. (The thumbnail
	// preview comes from the page's server-rendered og:image tags, which the
	// share-sheet/link-preview crawlers read; it can't be set here.)
	export let title = 'Écoute en direct - Missionnaire Network';
	export let text = 'Écoutez Missionnaire Network en direct 🎙️';

	function buildShareUrl(): string {
		if (!browser) return '';
		return `${window.location.origin}/live`;
	}

	function flashShareFeedback(state: 'copied' | 'error') {
		shareFeedback = state;
		if (shareFeedbackTimer) clearTimeout(shareFeedbackTimer);
		shareFeedbackTimer = setTimeout(() => (shareFeedback = null), 2200);
	}

	function toggleShareMenu() {
		if (browser) isShareMenuOpen = !isShareMenuOpen;
	}

	function closeShareMenu() {
		isShareMenuOpen = false;
	}

	async function copyShareLink() {
		closeShareMenu();
		const url = buildShareUrl();
		if (!url) return;
		try {
			await navigator.clipboard.writeText(url);
			flashShareFeedback('copied');
		} catch {
			flashShareFeedback('error');
		}
	}

	async function nativeShare() {
		closeShareMenu();
		const url = buildShareUrl();
		if (!url) return;
		const shareData: ShareData = {
			title,
			text,
			url
		};
		try {
			if (navigator.share && (!navigator.canShare || navigator.canShare(shareData))) {
				await navigator.share(shareData);
				return;
			}
		} catch (err) {
			// User dismissed the share sheet — not an error.
			if ((err as DOMException)?.name === 'AbortError') return;
		}
		// Web Share unsupported or threw — fall back to clipboard.
		try {
			await navigator.clipboard.writeText(url);
			flashShareFeedback('copied');
		} catch {
			flashShareFeedback('error');
		}
	}

	function handleShareOutsideClick(event: MouseEvent) {
		if (!isShareMenuOpen) return;
		if (shareWrapEl && !shareWrapEl.contains(event.target as Node)) closeShareMenu();
	}

	onDestroy(() => {
		if (shareFeedbackTimer) clearTimeout(shareFeedbackTimer);
	});
</script>

<svelte:window on:click={handleShareOutsideClick} />

<div class="relative mt-4" bind:this={shareWrapEl}>
	<button
		type="button"
		on:click|stopPropagation={toggleShareMenu}
		aria-haspopup="menu"
		aria-expanded={isShareMenuOpen}
		aria-label="Partager le direct"
		class="group flex w-full items-center justify-center gap-2 border px-5 py-3.5 text-[11px] font-bold uppercase tracking-[0.2em] font-body transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-missionnaire/40 {isShareMenuOpen
			? 'border-missionnaire/30 bg-missionnaire/5 text-missionnaire'
			: 'border-stone-200/60 bg-white/40 text-stone-600 hover:border-missionnaire/30 hover:bg-missionnaire hover:text-white'}"
	>
		<svg
			width="14"
			height="14"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<circle cx="18" cy="5" r="3" />
			<circle cx="6" cy="12" r="3" />
			<circle cx="18" cy="19" r="3" />
			<line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
			<line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
		</svg>
		{#if shareFeedback === 'copied'}
			Lien copié
		{:else if shareFeedback === 'error'}
			Échec — copiez l'URL
		{:else}
			Partager le direct
		{/if}
	</button>

	{#if isShareMenuOpen}
		<!-- svelte-ignore a11y-click-events-have-key-events -->
		<!-- svelte-ignore a11y-no-static-element-interactions -->
		<div
			class="absolute left-1/2 top-full z-[60] mt-1.5 w-56 -translate-x-1/2 overflow-hidden rounded-lg border border-stone-200 bg-white shadow-2xl"
			role="menu"
			tabindex="-1"
			on:click|stopPropagation={() => undefined}
		>
			{#if hasNativeShare}
				<button
					type="button"
					role="menuitem"
					class="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-xs font-semibold text-stone-700 transition-colors hover:bg-stone-50 hover:text-missionnaire"
					on:click={nativeShare}
				>
					<svg
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<circle cx="18" cy="5" r="3" />
						<circle cx="6" cy="12" r="3" />
						<circle cx="18" cy="19" r="3" />
						<line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
						<line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
					</svg>
					<span>Partager…</span>
				</button>
			{/if}
			<button
				type="button"
				role="menuitem"
				class="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-xs font-semibold text-stone-700 transition-colors hover:bg-stone-50 hover:text-missionnaire"
				on:click={copyShareLink}
			>
				<svg
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
					<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
				</svg>
				<span>Copier le lien</span>
			</button>
		</div>
	{/if}
</div>
