<script lang="ts">
	/** Standardized empty state: icon + one sentence + optional action
	 *  (e.g. "reset filters" when the emptiness is filter-induced). */
	interface Props {
		message: string;
		actionLabel?: string;
		actionHref?: string;
		onAction?: () => void;
		icon?: 'inbox' | 'music' | 'users' | 'flag';
	}

	let { message, actionLabel, actionHref, onAction, icon = 'inbox' }: Props = $props();
</script>

<div class="border border-dashed border-stone-200 bg-white/40 px-6 py-14 text-center">
	<svg
		class="mx-auto h-8 w-8 text-stone-300"
		fill="none"
		viewBox="0 0 24 24"
		stroke="currentColor"
		stroke-width="1.5"
		aria-hidden="true"
	>
		{#if icon === 'music'}
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z"
			/>
		{:else if icon === 'users'}
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 10-4-4 4 4 0 004 4zm6-4a3 3 0 11-3-3"
			/>
		{:else if icon === 'flag'}
			<path stroke-linecap="round" stroke-linejoin="round" d="M3 21V5a2 2 0 012-2h9l1 2h6v11h-7l-1-2H5" />
		{:else}
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-5l-2 2h-2l-2-2H4"
			/>
		{/if}
	</svg>
	<p class="mt-3 font-body text-sm text-stone-500">{message}</p>
	{#if actionLabel && (onAction || actionHref)}
		{#if actionHref}
			<a
				href={actionHref}
				class="mt-4 inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.15em] text-primary underline-offset-4 hover:underline"
			>
				{actionLabel}
			</a>
		{:else}
			<button
				type="button"
				onclick={onAction}
				class="mt-4 inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.15em] text-primary underline-offset-4 hover:underline"
			>
				{actionLabel}
			</button>
		{/if}
	{/if}
</div>
