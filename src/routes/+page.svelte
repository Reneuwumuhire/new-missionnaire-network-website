
<script lang="ts">
	import type { PageData } from './$types';
    
    export let data: PageData;

    const webName: string = "missionaire network website";


    
    
</script>
<h1>Welcome to {webName}</h1>
<h1>{data.resultsPerPage}</h1>
<ul>
    {#each data.videos as  video}
    <li>
        <div>{video.title}</div>
        <img src={video.thumbnails.default.url} alt="">
    </li>
    {/each}
</ul>