<script lang="ts">
	export let size = 16;
	export let strokeWidth = 2.5;
	export let className = '';
</script>

<div
	class={`pointer-events-none inline-flex items-center justify-center text-missionnaire ${className}`.trim()}
	aria-hidden="true"
>
	<svg class="block animate-spin" width={size} height={size} viewBox="0 0 24 24" fill="none">
		<circle
			cx="12"
			cy="12"
			r="10"
			stroke="currentColor"
			stroke-width={strokeWidth}
			stroke-dasharray="42 62"
			stroke-linecap="round"
		/>
	</svg>
</div>
