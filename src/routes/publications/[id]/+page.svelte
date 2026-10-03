<script lang="ts">
	import PublicationsPage from '../+page.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<PublicationsPage {data} />
