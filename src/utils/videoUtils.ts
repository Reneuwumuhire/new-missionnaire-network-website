import { browser } from '$app/environment';
import { goto } from '$app/navigation';
import { activeFilter, isLoading, isInitialLoading, skip, videos, hasMore, searchTerm, selectedVideo } from '$lib/stores/videoStore';
import { get } from 'svelte/store';
const limit = 20;

export async function fetchInitialVideos() {
    if (!browser) return;

    isLoading.set(true);
    isInitialLoading.set(true);

    try {
        const params: Record<string, string> = {
            skip: '0',
            limit: limit.toString(),
        }

        const searchValue = get(searchTerm).trim();
        if (searchValue) {
            params.search = searchValue;
        }

        const filterValue = get(activeFilter);
        if (filterValue) {
            params.filter = filterValue;
        }

        const queryString = new URLSearchParams(params).toString();

        const response = await fetch(`/pagination?${queryString}`);
        const responseData = await response.json();

        videos.set(responseData.data);

        if (responseData.data.length < limit) {
            hasMore.set(false);
        } else {
            skip.set(limit);
            hasMore.set(true);
        }
    } catch (error) {
        hasMore.set(false);
    } finally {
        isLoading.set(false);
        isInitialLoading.set(false);
    }
}

export function updateURL(filter: string) {
    if (!browser) return;

    const url = new URL(window.location.href);
    if (filter) {
        if (filter === 'All') {
            url.searchParams.delete('filter');
        } else {
            url.searchParams.set('filter', filter);
        }
    }
    goto(url.toString(), { replaceState: true });
}

export function resetPagination() {
    skip.set(0);
    videos.set([]);
    hasMore.set(true);
}

export async function fetchMoreVideos() {
    if (get(isLoading) || !get(hasMore)) return;

    isLoading.set(true);
    try {
        const params: Record<string, string> = {
            skip: get(skip).toString(),
            limit: limit.toString(),
        }

        const searchValue = get(searchTerm).trim();
        if (searchValue) {
            params.search = searchValue;
        }

        const filterValue = get(activeFilter);
        if (filterValue) {
            params.filter = filterValue;
        }

        const queryString = new URLSearchParams(params).toString();

        const response = await fetch(`/pagination?${queryString}`);
        const responseData = await response.json();

        // Always update videos array with new data, even if it's less than limit
        if (responseData.data.length > 0) {
            videos.update(currentVideos => [...currentVideos, ...responseData.data]);
            skip.set(get(skip) + responseData.data.length); // Update skip by actual number of items received
        }

        // Set hasMore to false if we received fewer items than requested
        if (responseData.data.length < limit) {
            hasMore.set(false);
        }

        // if it has more remaining, then set hasMore to true
        if (responseData.data.length > get(skip)) {
            hasMore.set(true);
        }
    } catch (error) {
        console.error('Error fetching more videos:', error);
        hasMore.set(false);
    } finally {
        isLoading.set(false);
    }
}

export async function setFilter(filter: string) {
    if (get(activeFilter) === filter) return;

    activeFilter.set(filter);
    selectedVideo.set(undefined);
    resetPagination();
    await fetchInitialVideos();
    updateURL(filter);
}