import type { z } from 'zod';
import type { PageLoad } from './$types';
import type { VideoItem, YtSearchResultSchema } from '../core/model/youtube';
import { browser } from '$app/environment';


export const load = (async () => {
    if(!browser) return {resultsPerPage: 0, videos: []};

    const requestOptions = {
        method: 'GET',
    };
    const url = `/api/yt/recent-videos?resultsPerPage=50`

    const response = await fetch(url, requestOptions);
    
    const apiResult: {resultsPerPage: number, videos: VideoItem[]} = await response.json();


    return apiResult;
}) satisfies PageLoad;