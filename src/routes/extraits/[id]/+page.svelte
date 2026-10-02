<script lang="ts">
	import ExtraitsPage from '../+page.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<ExtraitsPage {data} />
