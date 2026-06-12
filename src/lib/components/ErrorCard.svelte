<script lang="ts">
	import { t } from '../../i18n';

	/** Friendly error block for failed list loads. `message` overrides the
	 *  default i18n copy; the retry button only renders when `onRetry` is
	 *  provided. */
	interface Props {
		message?: string;
		onRetry?: () => void;
	}

	let { message, onRetry }: Props = $props();
</script>

<div role="alert" class="border border-red-200 bg-red-50/60 px-6 py-12 text-center">
	<p class="text-sm font-bold uppercase tracking-widest text-red-700 font-body">
		{message || $t('errors.listFailed')}
	</p>
	{#if onRetry}
		<button
			class="mt-5 inline-flex items-center rounded-full border border-missionnaire px-4 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-missionnaire transition-colors hover:bg-missionnaire/5"
			onclick={() => onRetry?.()}
		>
			{$t('errors.retry')}
		</button>
	{/if}
</div>
