<script lang="ts">
	export let image: string = '';
	export let alt: string = '';
</script>

<div class="relative w-full bg-slate-300 rounded-3xl overflow-hidden">
	<img src={image} {alt} class="w-full h-full object-cover" />
</div>
