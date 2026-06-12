<script lang="ts">
	interface Props {
		quote?: string;
	}

	let { quote = "Provide a quote" }: Props = $props();
</script>

<p class=" italic w-full bg-missionnaire-Yellow p-10 rounded-xl">
	{quote}
</p>
