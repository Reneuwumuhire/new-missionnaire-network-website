<script lang="ts">
	interface Props {
		image?: string;
		alt?: string;
	}

	let { image = '', alt = '' }: Props = $props();
</script>

<div class="relative w-full bg-slate-300 rounded-3xl overflow-hidden">
	<img src={image} {alt} class="w-full h-full object-cover" />
</div>
