<script lang="ts">
	/** Pulsing placeholder `<tr>`s for table bodies during initial data loads.
	 *  Must be rendered inside a `<tbody>`. */
	interface Props {
		rows?: number;
		cols?: number;
	}

	let { rows = 8, cols = 6 }: Props = $props();

	// Stable pseudo-random widths so the skeleton doesn't look like a grid.
	const widths = ['w-3/4', 'w-1/2', 'w-2/3', 'w-1/3', 'w-3/5'];
</script>

{#each Array.from({ length: rows }) as _, i}
	<tr class="border-b border-stone-50" aria-hidden="true">
		{#each Array.from({ length: cols }) as _, j}
			<td class="px-4 py-4">
				<div
					class="h-3.5 animate-pulse rounded-full {widths[(i + j) % widths.length]} {j === 0
						? 'bg-stone-200'
						: 'bg-stone-100'}"
				></div>
			</td>
		{/each}
	</tr>
{/each}
