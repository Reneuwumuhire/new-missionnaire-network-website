<script lang="ts">
	import { browser } from '$app/environment';
	import { onMount, onDestroy } from 'svelte';

	let pullDistance = $state(0);
	let isRefreshing = $state(false);
	let isPulling = false;
	let startY = 0;
	let visible = $state(false);

	const THRESHOLD = 80;
	const MAX_PULL = 120;
	const RESISTANCE = 0.4;

	function isAtTop(): boolean {
		return window.scrollY <= 0;
	}

	function isAudioPlaying(): boolean {
		// Skip pull-to-refresh while a preview clip is playing so the gesture
		// doesn't yank the editor out from under the admin mid-listen.
		const audios = document.querySelectorAll('audio');
		for (const el of audios) {
			if (!el.paused) return true;
		}
		return false;
	}

	function isInteractingWithForm(target: EventTarget | null): boolean {
		// On admin pages the typical mobile gesture starts inside a form
		// field — pulling that down to "refresh" would discard whatever was
		// being edited. Bail out so the touch falls through to normal
		// scrolling / text-selection.
		if (!(target instanceof Element)) return false;
		return !!target.closest('input, textarea, select, [contenteditable="true"]');
	}

	function handleTouchStart(e: TouchEvent) {
		if (!isAtTop() || isRefreshing || isAudioPlaying()) return;
		if (isInteractingWithForm(e.target)) return;
		startY = e.touches[0].clientY;
		isPulling = true;
	}

	function handleTouchMove(e: TouchEvent) {
		if (!isPulling || isRefreshing) return;

		const currentY = e.touches[0].clientY;
		const diff = (currentY - startY) * RESISTANCE;

		if (diff < 0) {
			pullDistance = 0;
			return;
		}

		pullDistance = Math.min(diff, MAX_PULL);
		visible = pullDistance > 10;

		if (pullDistance > 0) {
			e.preventDefault();
		}
	}

	function handleTouchEnd() {
		if (!isPulling) return;
		isPulling = false;

		if (pullDistance >= THRESHOLD && !isRefreshing) {
			isRefreshing = true;
			pullDistance = 60;

			setTimeout(() => {
				window.location.reload();
			}, 600);
		} else {
			pullDistance = 0;
			visible = false;
		}
	}

	onMount(() => {
		if (!browser) return;
		document.addEventListener('touchstart', handleTouchStart, { passive: true });
		document.addEventListener('touchmove', handleTouchMove, { passive: false });
		document.addEventListener('touchend', handleTouchEnd, { passive: true });
	});

	onDestroy(() => {
		if (!browser) return;
		document.removeEventListener('touchstart', handleTouchStart);
		document.removeEventListener('touchmove', handleTouchMove);
		document.removeEventListener('touchend', handleTouchEnd);
	});

	let progress = $derived(Math.min(pullDistance / THRESHOLD, 1));
	let rotation = $derived(progress * 180);
</script>

{#if visible || isRefreshing}
	<div
		class="fixed left-1/2 z-[9999] flex items-center justify-center"
		style="top: 0; transform: translateX(-50%) translateY({pullDistance - 50}px); transition: transform 0.2s ease-out;"
	>
		<div
			class="w-11 h-11 rounded-full bg-white shadow-xl border border-gray-200 flex items-center justify-center"
		>
			{#if isRefreshing}
				<svg class="w-5 h-5 animate-spin text-primary" viewBox="0 0 24 24" fill="none">
					<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" stroke-opacity="0.2" />
					<path d="M12 2 A10 10 0 0 1 22 12" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
				</svg>
			{:else}
				<svg
					class="w-5 h-5 text-primary transition-transform duration-100"
					style="transform: rotate({rotation}deg);"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2.5"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<path d="M12 5v14" />
					<path d="M19 12l-7 7-7-7" />
				</svg>
			{/if}
		</div>
	</div>
{/if}
