<script lang="ts">
	import '../app.css';
	import NavBar from '$lib/components/+navBar.svelte';
	import SocialMediaAbove from '$lib/components/+socialMediaAbove.svelte';
	import Footer from '$lib/components/+footer.svelte';
	import CopyButton from '$lib/components/+copyButton.svelte';
	import type { LayoutData } from './$types';
	import { QueryClientProvider } from '@tanstack/svelte-query';
	import { availableTypesTag } from '../utils/data';
	import { activeFilter, isLoading } from '$lib/stores/videoStore';
	import { setFilter } from '../utils/videoUtils';
	import { page } from '$app/stores';
	export let data: LayoutData;
</script>

<svelte:head>
	<title>Missionnaire Network</title>
</svelte:head>

<QueryClientProvider client={data.queryClient}>
	<div class="relative">
		<div class="flex flex-col fixed top-0 z-40 bg-white w-full">
			<SocialMediaAbove
				isLiveStream={!!data.liveStream}
				liveUrl={data.liveStream?.webpage_url}
			/>
			<NavBar />
		</div>
		{#if $page.url.pathname === '/'}
			<div class="fixed top-[60px] left-0 right-0 z-30 bg-white shadow-sm">
				<div class="max-w-[1640px] mx-auto px-5 py-4">
					<div class="flex flex-wrap gap-2 items-center">
						{#each availableTypesTag as tagType}
							<button
								class="px-3 py-1 rounded-full text-sm {$activeFilter === tagType.label
									? 'bg-hardBlack text-white'
									: 'bg-gray-200 text-gray-700'}"
								on:click={() => setFilter(tagType.label)}
							>
								{tagType.label}
							</button>
						{/each}
						{#if $isLoading}
							<div class="inline-block">
								<div
									class="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-primary"
								/>
							</div>
						{/if}
					</div>
				</div>
			</div>
		{/if}
		<div class={`relative ${$page.url.pathname === '/' ? 'mt-[160px]' : 'mt-[60px]'}`}>
			<slot />
		</div>
	</div>
	<Footer />
	<CopyButton />
</QueryClientProvider>
