<script lang="ts">
	interface Props {
		text?: string;
	}

	let { text = "Provide a text" }: Props = $props();
</script>

<p class=" p-3 text-[#9A9A9A] leading-relaxed tracking-wide">
	{text}
</p>
