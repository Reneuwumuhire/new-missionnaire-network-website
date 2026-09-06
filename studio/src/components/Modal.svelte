<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import Icon from './Icon.svelte';
	import { t } from '../lib/i18n.svelte';

	// Settings, Properties and Destinations are dialogs, not permanent panels —
	// the same call OBS makes. They are opened rarely and need room when they
	// are, and the docks stay uncluttered the rest of the time.
	let { title, onclose, children }: { title: string; onclose: () => void; children: Snippet } =
		$props();
	let dialog: HTMLDialogElement;
	onMount(() => {
		dialog.showModal();
		return () => dialog.close();
	});
</script>

<dialog
	bind:this={dialog}
	aria-label={title}
	class="fixed inset-0 m-0 h-full max-h-none w-full max-w-none items-center justify-center border-0 bg-transparent p-4 text-fg backdrop:bg-black/70 open:flex sm:p-8"
	oncancel={(event) => {
		// File inputs also emit cancel when their native picker is dismissed.
		// That event must not dismiss the dialog behind the picker.
		if (event.target !== event.currentTarget) return;
		event.preventDefault();
		onclose();
	}}
>
	<!-- Click-outside closes; the panel swallows its own clicks. -->
	<button class="absolute inset-0 cursor-default" aria-label={t('common.close')} onclick={onclose}
	></button>
	<div
		class="relative flex max-h-full w-full max-w-3xl flex-col border border-ink-600 bg-ink-900 shadow-2xl shadow-black/80"
	>
		<header class="flex h-11 shrink-0 items-center justify-between border-b border-ink-700 px-4">
			<h2 class="text-[13px] font-semibold text-fg/85">{title}</h2>
			<button class="studio-icon-btn" aria-label={t('common.close')} onclick={onclose}
				><Icon name="close" /></button
			>
		</header>
		<div class="min-h-0 flex-1 overflow-y-auto">
			{@render children()}
		</div>
	</div>
</dialog>
