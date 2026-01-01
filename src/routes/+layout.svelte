<script lang="ts">
	import '../app.css';
	import NavBar from '$lib/components/+navBar.svelte';
	import SocialMediaAbove from '$lib/components/+socialMediaAbove.svelte';
	import Footer from '$lib/components/+footer.svelte';
	import CopyButton from '$lib/components/+copyButton.svelte';
	import VideoPlaylistPlayer from '$lib/components/VideoPlaylistPlayer.svelte';
	import type { LayoutData } from './$types';
	import { QueryClientProvider } from '@tanstack/svelte-query';
	import { availableTypesTag } from '../utils/data';
	import { activeFilter, isLoading } from '$lib/stores/videoStore';
	import { setFilter } from '../utils/videoUtils';
	import { page } from '$app/stores';
	import { browser } from '$app/environment';
	export let data: LayoutData;

	if (browser) {
		(window as any).onYouTubeIframeAPIReady = () => {
			window.dispatchEvent(new CustomEvent('yt-ready'));
		};
	}
</script>

<svelte:head>
	<title>Missionnaire Network</title>
	<script src="https://www.youtube.com/iframe_api"></script>
	<meta property="og:site_name" content="Missionnaire Network" />
	<meta property="og:type" content="website" />
	<meta property="og:url" content={$page.url.href} />
	<meta property="og:logo" content="https://www.missionnaire.net/favicon.png" />
	<meta property="og:image" content="https://www.missionnaire.net/og-image.png" />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:image" content="https://www.missionnaire.net/og-image.png" />
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
		<div class={`relative ${$page.url.pathname === '/' ? 'mt-[160px]' : 'mt-[120px]'}`}>
			<slot />
		</div>
	</div>
	<Footer />
	<CopyButton />
	<VideoPlaylistPlayer />
</QueryClientProvider>
