<script lang="ts">
    import { browser } from '$app/environment';
    import { writable, derived } from 'svelte/store';
    import { currentViewingVideo } from '$lib/stores/global';
    import '../app.css';
    import ThumbnailVideo from '$lib/components/+thumbnailVideo.svelte';
    import VideoView from '$lib/components/+videoView.svelte';
    // import CalendarWeekly from '$lib/components/+calendarWeekly.svelte';
    import type { YoutubeVideo } from '@mnlib/lib/models/youtube';
    import HomepageLoadingSkelton from '$lib/components/+homepageLoadingSkelton.svelte';
    import { availableTypesTag } from '../utils/data';
    import { searchTerm } from '$lib/stores/videoStore';
    import { onMount } from 'svelte';
    import { goto } from '$app/navigation';

    let titleName: string = 'Missionnaire network';
    export let data: { data: YoutubeVideo[] };

    const limit = 20;
    const activeFilter = writable<string>('');
    let skip = writable(0);
    let videos = writable<YoutubeVideo[]>([]);

    const tagLabelMap = new Map<string, string>();
    $: availableTypesTag.forEach(type => {
        type.value.forEach(value => {
            tagLabelMap.set(value, type.label);
        });
    });

    $: queryString = browser
        ? new URLSearchParams({
                skip: $skip.toString(),
                search: $searchTerm.trim(),
                filter: $activeFilter
          }).toString()
        : '';

    async function fetchVideos() {
        if (browser) {
            const response = await fetch(`/pagination?${queryString}`);
            if (!response.ok) throw new Error('Failed to fetch videos');
            const result = await response.json();
            return result.data;
        }
        return [];
    }

    let isLoading = writable(false);
    let hasMore = writable(true);

    async function loadMoreVideos() {
        if ($isLoading || !$hasMore) return;

        isLoading.set(true);
        try {
            const newVideos = await fetchVideos();
            if (newVideos.length < limit) {
                hasMore.set(false);
            }
            if (newVideos.length > 0) {
                videos.update(v => [...v, ...newVideos]);
                skip.update(s => s + limit);
            } else {
                hasMore.set(false);
            }
        } catch (error) {
            console.error('Error fetching videos:', error);
            hasMore.set(false);
        } finally {
            isLoading.set(false);
        }
    }

    let observer: IntersectionObserver;
    let observerTarget: HTMLElement;

    function setupIntersectionObserver() {
        if (browser) {
            observer = new IntersectionObserver(
                (entries) => {
                    if (entries[0].isIntersecting && $hasMore && !$isLoading) {
                        loadMoreVideos();
                    }
                },
                { threshold: 0.1 }
            );

            if (observerTarget) {
                observer.observe(observerTarget);
            }
        }
    }

    function intersectionObserver(node: HTMLElement) {
        observerTarget = node;
        setupIntersectionObserver();

        return {
            destroy() {
                if (observer) {
                    observer.disconnect();
                }
            }
        };
    }

    let selectedVideo: YoutubeVideo | undefined;

    $: videoSelected = (video: YoutubeVideo) => {
        currentViewingVideo.set(video);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    $: currentViewingVideo.subscribe((value) => {
        selectedVideo = value;
    });

    $: filteredVideos = derived([videos, activeFilter, searchTerm], ([$videos, $activeFilter, $searchTerm]) =>
        $videos.filter(video => {
            const matchesFilter = $activeFilter === '' ||
                video.tags.some((tag: string | undefined) =>
                    $activeFilter === tagLabelMap.get(tag as string) || 'All'
                ) || ($activeFilter === 'All' && availableTypesTag[0].value.some(tag => video.tags.includes(tag)));

            const matchesSearch = $searchTerm.trim() === '' ||
                video.title.toLowerCase().includes($searchTerm.toLowerCase()) ||
                video.description.toLowerCase().includes($searchTerm.toLowerCase());

            return matchesFilter && matchesSearch;
        })
    );

    function handleSearch() {
        resetPagination();
        loadMoreVideos();
    }

    function setFilter(filter: string) {
        activeFilter.set(filter === $activeFilter ? '' : filter);
        resetPagination();
        updateURL($activeFilter);
        loadMoreVideos();
    }

    function resetPagination() {
        skip.set(0);
        videos.set([]);
        hasMore.set(true);
    }

    function updateURL(filter: string) {
        const url = new URL(window.location.href);
        if (filter) {
            url.searchParams.set('filter', filter);
        } else {
            url.searchParams.delete('filter');
        }
        goto(url.toString(), { replaceState: true });
    }

    onMount(() => {
        if (browser) {
            const url = new URL(window.location.href);
            const filterParam = url.searchParams.get('filter');
            if (filterParam) {
                activeFilter.set(filterParam);
            }

            window.addEventListener('search', handleSearch);
            
            // Initialize videos with server-side data
            videos.set(data.data);
            if (data.data.length < limit) {
                hasMore.set(false);
            } else {
                skip.set(limit); // Set to limit since we've loaded the first page
            }
        }
    });
</script>

<svelte:head>
    <title>{titleName}</title>
</svelte:head>

<main class="align-middle flex flex-col items-center justify-center max-w-[1640px] mx-auto px-5 mt-[70px] relative">
    <div class="sticky top-0 bg-white z-10 w-full py-4 mb-6">
        <div class="flex flex-wrap gap-2 items-center">
            {#each availableTypesTag as tagType}
                <button
                    class="px-3 py-1 rounded-full text-sm {$activeFilter === tagType.label ? 'bg-hardBlack text-white' : 'bg-gray-200 text-gray-700'}"
                    on:click={() => setFilter(tagType.label)}
                >
                    {tagType.label}
                </button>
            {/each}
        </div>
    </div>

    {#if $isLoading && $videos.length === 0}
        <HomepageLoadingSkelton />
    {:else}
        {#if selectedVideo}
            <VideoView selectedVideoStore={selectedVideo} />
        {/if}

        {#if $filteredVideos.length > 0}
            <div class="grid grid-cols-1 sm:px-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8">
                {#each $filteredVideos as video, index (video._id)}
                    <button on:click={() => videoSelected(video)} class="text-left">
                        <ThumbnailVideo {video} {index} />
                    </button>
                {/each}
            </div>
        {:else}
            <div class="text-center w-full items-center justify-center">
                <p class="text-gray-500">No videos found for the selected filters.</p>
            </div>
        {/if}
        
        {#if $isLoading}
            <HomepageLoadingSkelton />
        {/if}
    {/if}
    
    {#if $hasMore}
        <div use:intersectionObserver class="h-10" />
    {/if}
</main>