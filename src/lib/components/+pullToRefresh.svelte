<script lang="ts">
	import { browser } from '$app/environment';
	import { onMount, onDestroy } from 'svelte';

	let pullDistance = 0;
	let isRefreshing = false;
	let isPulling = false;
	let startY = 0;
	let visible = false;

	const THRESHOLD = 80;
	const MAX_PULL = 120;
	const RESISTANCE = 0.4;

	function isAtTop(): boolean {
		return window.scrollY <= 0;
	}

	function isAudioPlaying(): boolean {
		const audios = document.querySelectorAll('audio');
		for (const el of audios) {
			if (!el.paused) return true;
		}
		return false;
	}

	function handleTouchStart(e: TouchEvent) {
		if (!isAtTop() || isRefreshing || isAudioPlaying()) return;
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

	$: progress = Math.min(pullDistance / THRESHOLD, 1);
	$: rotation = progress * 180;
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
				<!-- Spinning loader -->
				<svg class="w-5 h-5 animate-spin text-orange-600" viewBox="0 0 24 24" fill="none">
					<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" stroke-opacity="0.2" />
					<path d="M12 2 A10 10 0 0 1 22 12" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
				</svg>
			{:else}
				<!-- Arrow rotating to indicate pull progress -->
				<svg
					class="w-5 h-5 text-orange-600 transition-transform duration-100"
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
