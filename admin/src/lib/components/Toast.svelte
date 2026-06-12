<script lang="ts">
	import { toast } from '$lib/stores/toast';
	import { t } from '$lib/i18n';
	import { fly } from 'svelte/transition';
</script>

<div class="fixed right-4 top-4 z-50 flex flex-col gap-3">
	{#each $toast as item (item.id)}
		<div
			transition:fly={{ x: 300, duration: 300 }}
			class="flex items-center gap-3 rounded-xl border px-5 py-3.5 shadow-lg backdrop-blur-sm {item.type === 'success'
				? 'border-green-200 bg-green-50/95 text-green-800'
				: item.type === 'error'
					? 'border-red-200 bg-red-50/95 text-red-800'
					: 'border-stone-200 bg-white/95 text-stone-800'}"
		>
			{#if item.type === 'success'}
				<svg class="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
				</svg>
			{:else if item.type === 'error'}
				<svg class="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
				</svg>
			{:else}
				<svg class="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
				</svg>
			{/if}
			<span class="text-sm font-medium">{item.message}</span>
			<button
				onclick={() => toast.dismiss(item.id)}
				class="ml-2 rounded-full p-1 transition-colors hover:bg-black/5"
				aria-label={$t('common.close')}
			>
				<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
				</svg>
			</button>
		</div>
	{/each}
</div>
