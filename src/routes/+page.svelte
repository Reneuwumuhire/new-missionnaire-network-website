<script lang="ts">
    import { browser } from '$app/environment';
    import { writable, derived } from 'svelte/store';
    import { createInfiniteQuery } from '@tanstack/svelte-query';
    import { currentViewingVideo } from '$lib/stores/global';
    import '../app.css';
    import ThumbnailVideo from '$lib/components/+thumbnailVideo.svelte';
    import VideoView from '$lib/components/+videoView.svelte';
    import CalendarWeekly from '$lib/components/+calendarWeekly.svelte';
    import type { YoutubeVideo } from '@mnlib/lib/models/youtube';
    import HomepageLoadingSkelton from '$lib/components/+homepageLoadingSkelton.svelte';
    import { availableTypesTag } from '../utils/data';

    let titleName: string = 'Missionnaire network';

    const limit = 20;
    const activeFilters = writable<Set<string>>(new Set());

    // Create a mapping between tag values and labels
    const tagLabelMap = new Map<string, string>();
    availableTypesTag.forEach(type => {
        type.value.forEach(value => {
            tagLabelMap.set(value, type.label);
        });
    });

    $: queryString = browser
        ? new URLSearchParams({
                limit: limit.toString()
          }).toString()
        : '';

    const fetchVideos = async ({ pageParam = 1 }) => {
        const res = await fetch(`/api/videos?page=${pageParam}&${queryString}`);
        if (!res.ok) throw new Error('Failed to fetch videos');
        return res.json();
    };

    const videosQuery = createInfiniteQuery({
        queryKey: ['videos'],
        queryFn: fetchVideos,
        initialPageParam: 1,
        getNextPageParam: (lastPage) => {
            if (lastPage.pagination.page < lastPage.pagination.totalPages) {
                return lastPage.pagination.page + 1;
            }
            return undefined;
        },
        enabled: browser
    });

    let observer: IntersectionObserver;
    let observerTarget: HTMLElement;

    function setupIntersectionObserver() {
        if (browser) {
            observer = new IntersectionObserver(
                (entries) => {
                    if (entries[0].isIntersecting && $videosQuery.hasNextPage && !$videosQuery.isFetchingNextPage) {
                        $videosQuery.fetchNextPage();
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

    let upComingEventData: YoutubeVideo[] | undefined;
    let selectedVideo: YoutubeVideo | undefined;

    $: videoSelected = (video: YoutubeVideo) => {
        currentViewingVideo.set(video);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    $: currentViewingVideo.subscribe((value) => {
        selectedVideo = value;
    });

    let allVideos: YoutubeVideo[] = [];
    let filteredVideos: YoutubeVideo[] = [];

    const filterCounts = writable<Map<string, number>>(new Map());

    function updateFilterCounts(videos: YoutubeVideo[]) {
        const counts = new Map<string, number>();

        // Count for 'All'
        counts.set('All', videos.length);

        // Count for tags
        availableTypesTag.forEach(tagType => {
            const count = videos.filter(video => 
                video.tags.some((tag: string) => tagType.value.includes(tag))
            ).length;
            counts.set(tagType.label, count);
        });

        filterCounts.set(counts);
    }

    $: {
        if ($videosQuery.data) {
            allVideos = $videosQuery.data.pages.flatMap((page) => page.videos);
            updateFilterCounts(allVideos);
        }
    }

    $: {
        filteredVideos = allVideos.filter(video => {
            if ($activeFilters.size === 0) return true;
            return video.tags.some((tag: string | undefined) => 
                $activeFilters.has(tagLabelMap.get(tag as string) || 'All')
            ) || ($activeFilters.has('All') && availableTypesTag[0].value.some(tag => video.tags.includes(tag)));
        });
        updateFilterCounts(filteredVideos);
    }

    function toggleFilter(filter: string) {
        activeFilters.update(filters => {
            if (filters.has(filter)) {
                filters.delete(filter);
            } else {
                filters.add(filter);
            }
            return filters;
        });
    }

    $: {
        if ($videosQuery.data) {
            filteredVideos = allVideos.filter(video => {
                if ($activeFilters.size === 0) return true;
                return video.tags.some((tag: string | undefined) => 
                    $activeFilters.has(tagLabelMap.get(tag as string) || 'All')
                ) || ($activeFilters.has('All') && availableTypesTag[0].value.some(tag => video.tags.includes(tag)));
            });
            updateFilterCounts(filteredVideos);
        }
    }

    function getFilterCount(filter: string): number {
        const counts = $filterCounts;
        return counts.get(filter) || 0;
    };
</script>

<svelte:head>
    <title>{titleName}</title>
</svelte:head>

<main
    class="align-middle flex flex-col items-center justify-center max-w-[1640px] mx-auto px-5 mt-[130px] relative"
>
    <div class="sticky top-0 bg-white z-10 w-full py-4 mb-6">
        <div class="flex flex-wrap gap-2 items-center">
            {#each availableTypesTag as tagType}
                <button
                    class="px-3 py-1 rounded-full text-sm {$activeFilters.has(tagType.label) ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-700'}"
                    on:click={() => toggleFilter(tagType.label)}
                >
                    {tagType.label} ({getFilterCount(tagType.label)})
                </button>
            {/each}
        </div>
    </div>

    {#if $videosQuery.isLoading || $videosQuery.isPending}
        <HomepageLoadingSkelton />
    {:else if $videosQuery.isError}
        <p>Error: {$videosQuery.error.message}</p>
    {:else if $videosQuery.data}
        {#if selectedVideo}
            <VideoView selectedVideoStore={selectedVideo} />
        {/if}
        {#if upComingEventData && upComingEventData.length > 0}
            <CalendarWeekly {upComingEventData} />
        {/if}

        {#if filteredVideos.length > 0}
            <div class="grid grid-cols-1 sm:px-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8">
                {#each filteredVideos as video, index (video.id + '-' + index)}
                    <button on:click={() => videoSelected(video)} class="text-left">
                        <ThumbnailVideo {video} {index} />
                    </button>
                {/each}
            </div>
        {:else if !$videosQuery.isFetchingNextPage}
            <div class="text-center w-full items-center justify-center">
                <p class="text-gray-500">No videos found for the selected filters.</p>
            </div>
        {/if}
        {#if $videosQuery.isFetchingNextPage}
            <HomepageLoadingSkelton />
        {/if}
    {/if}
    {#if $videosQuery.hasNextPage}
        <div use:intersectionObserver class="h-10" />
    {/if}
</main>
