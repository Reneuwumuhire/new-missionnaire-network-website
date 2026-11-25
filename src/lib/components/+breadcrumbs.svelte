<script lang="ts">
	import { t } from '../../i18n';

	interface Props {
		items?: { label: string; href?: string }[];
	}

	let { items = [] }: Props = $props();
</script>

<nav aria-label={$t('nav.breadcrumb')} class="w-full max-w-7xl mx-auto mb-4">
	<ol class="flex min-w-0 items-center gap-1.5 whitespace-nowrap text-xs font-medium text-gray-400">
		<li class="shrink-0">
			<a href="/" class="hover:text-orange-600 transition-colors">{$t('nav.home')}</a>
		</li>
		{#each items as item, i}
			<li class="flex min-w-0 items-center gap-1.5">
				<span aria-hidden="true" class="shrink-0 text-gray-300">/</span>
				{#if item.href && i < items.length - 1}
					<a href={item.href} class="truncate hover:text-orange-600 transition-colors"
						>{item.label}</a
					>
				{:else}
					<span aria-current="page" title={item.label} class="truncate font-bold text-gray-600">
						{item.label}
					</span>
				{/if}
			</li>
		{/each}
	</ol>
</nav>
