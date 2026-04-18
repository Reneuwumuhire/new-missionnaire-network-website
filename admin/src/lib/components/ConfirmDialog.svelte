<script lang="ts">
	import { confirmDialog } from '$lib/stores/confirm-dialog';
	import { fade, scale } from 'svelte/transition';

	function onBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) confirmDialog.cancel();
	}

	function onKeydown(e: KeyboardEvent) {
		if (!$confirmDialog) return;
		if (e.key === 'Escape') {
			e.preventDefault();
			confirmDialog.cancel();
		} else if (e.key === 'Enter') {
			e.preventDefault();
			confirmDialog.accept();
		}
	}
</script>

<svelte:window onkeydown={onKeydown} />

{#if $confirmDialog}
	<div
		class="fixed inset-0 z-[60] flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-sm"
		onclick={onBackdropClick}
		onkeydown={onKeydown}
		role="dialog"
		aria-modal="true"
		aria-labelledby="confirm-dialog-title"
		tabindex="-1"
		transition:fade={{ duration: 150 }}
	>
		<div
			class="w-full max-w-md rounded-sm bg-white shadow-2xl"
			transition:scale={{ duration: 180, start: 0.96 }}
		>
			<div class="flex items-start gap-3 border-b border-stone-100 px-6 py-4">
				{#if $confirmDialog.tone === 'danger'}
					<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600">
						<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
							<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M4.93 19h14.14c1.54 0 2.5-1.67 1.73-3L13.73 4a2 2 0 00-3.46 0L3.2 16c-.77 1.33.2 3 1.73 3z" />
						</svg>
					</div>
				{:else if $confirmDialog.tone === 'warning'}
					<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600">
						<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
							<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M4.93 19h14.14c1.54 0 2.5-1.67 1.73-3L13.73 4a2 2 0 00-3.46 0L3.2 16c-.77 1.33.2 3 1.73 3z" />
						</svg>
					</div>
				{:else}
					<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-stone-100 text-stone-500">
						<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
							<path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
						</svg>
					</div>
				{/if}
				<div class="min-w-0 flex-1 pt-0.5">
					<h2 id="confirm-dialog-title" class="font-display text-lg font-semibold text-stone-800">
						{$confirmDialog.title}
					</h2>
				</div>
			</div>

			<div class="px-6 py-5">
				<p class="whitespace-pre-wrap text-sm leading-relaxed text-stone-600">
					{$confirmDialog.message}
				</p>
			</div>

			<div class="flex items-center justify-end gap-2 border-t border-stone-100 px-6 py-4">
				<button
					type="button"
					onclick={confirmDialog.cancel}
					class="rounded-none px-4 py-2.5 font-body text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-700"
				>
					{$confirmDialog.cancelLabel ?? 'Annuler'}
				</button>
				<button
					type="button"
					onclick={confirmDialog.accept}
					class="rounded-none px-5 py-2.5 font-body text-[11px] font-semibold uppercase tracking-[0.18em] text-white transition-colors {$confirmDialog.tone === 'danger'
						? 'bg-red-700 hover:bg-red-800'
						: $confirmDialog.tone === 'warning'
							? 'bg-amber-600 hover:bg-amber-700'
							: 'bg-primary hover:bg-missionnaire-600'}"
				>
					{$confirmDialog.confirmLabel ?? 'Confirmer'}
				</button>
			</div>
		</div>
	</div>
{/if}
