<script lang="ts">
	export let image: string = '';
	export let alt: string = '';
</script>

<div class="relative w-80 h-96">
	<div class="background-dot absolute top-0 right-0" />
	<img
		src={image}
		{alt}
		class="relative top-32 -left-20 w-full h-full object-cover rounded-[48px]"
	/>
</div>

<style>
	.background-dot {
		background-image: url('/img/dots.png');
		background-size: cover;
		background-position: center;
		height: 400px;
		width: 260px;
	}
</style>
