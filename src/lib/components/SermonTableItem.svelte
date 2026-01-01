<script lang="ts">
    import Icon from 'svelte-icons-pack/Icon.svelte';
    import IoCloudDownloadOutline from 'svelte-icons-pack/io/IoCloudDownloadOutline';
    import BsFileEarmarkPdfFill from 'svelte-icons-pack/bs/BsFileEarmarkPdfFill';
    import IoPlayCircle from 'svelte-icons-pack/io/IoPlayCircle';
    import IoPauseCircle from 'svelte-icons-pack/io/IoPauseCircle';
    import { selectAudio, isPlaying, currentIndex } from '../stores/global';
    import type { Sermon } from '$lib/models/sermon';
    import type { AudioAsset } from '$lib/models/media-assets';
    import type { MusicAudio } from '$lib/models/music-audio';

    export let sermon: Sermon;
    export let index: number;
    export let absoluteIndex: number;
    export let language: string = 'french';

    $: isActive = isSermonActive(sermon, $selectAudio);

    function isSermonActive(s: Sermon, current: Sermon | AudioAsset | MusicAudio | null) {
        // Check for specific english audio URL match
        if (language === 'english') {
            if (!s.english_audio_url) return false;
            // Check if current is null before using 'in' operator
            if (!current) return false;
            const currentUrl = 'mp3_url' in current ? current.mp3_url : ('s3_url' in current ? current.s3_url : (current as any).url);
            return currentUrl === s.english_audio_url;
        }

        if (!current || !s.mp3_url) return false;
        const currentUrl = 'mp3_url' in current ? current.mp3_url : ('s3_url' in current ? current.s3_url : (current as any).url);
        return currentUrl === s.mp3_url;
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            togglePlay();
        }
    }

    function togglePlay() {
        const audioUrl = language === 'english' ? sermon.english_audio_url : sermon.mp3_url;
        
        if (!audioUrl) return;
        
        if (isActive) {
            isPlaying.update(v => !v);
        } else {
            currentIndex.set(index);
            // If English, we might need to create a temporary object or modify logic to use English URL
            // Ideally, the global player should just take a URL and metadata. 
            // For now, let's try modifying the sermon object passed to selectAudio if it's English
            if (language === 'english' && sermon.english_audio_url) {
                 const englishSermon = { ...sermon, mp3_url: sermon.english_audio_url, french_title: sermon.english_title || sermon.french_title, title: sermon.english_title };
                 selectAudio.set(englishSermon);
            } else {
                 selectAudio.set(sermon);
            }
            isPlaying.set(true);
        }
    }

    function downloadMp3() {
        const url = language === 'english' ? sermon.english_audio_url : sermon.mp3_url;
        if (url) {
            window.open(url, '_blank');
        }
    }

    function downloadPdf() {
        const url = language === 'english' ? sermon.english_pdf_url : sermon.pdf_url;
        if (url) {
            window.open(url, '_blank');
        }
    }

    function formatTime(s: number | undefined) {
        if (!s) return '--:--';
        const mins = Math.floor(s / 60);
        const secs = Math.floor(s % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
</script>

<!-- svelte-ignore a11y-no-noninteractive-tabindex -->
<div 
    class="grid grid-cols-[30px_1fr_auto_auto] md:grid-cols-[30px_2.5fr_1.2fr_1fr_auto_auto] gap-2 md:gap-4 px-3 md:px-4 py-3 md:py-4 items-center transition-all group cursor-pointer {isActive ? 'bg-orange-50/80 border-l-4 border-l-orange-500' : 'hover:bg-gray-50'}"
    on:click={togglePlay}
    on:keydown={handleKeydown}
    role="button"
    tabindex="0"
    aria-label="Lire la prédication {sermon.french_title || sermon.english_title}"
>
    <!-- Index -->
    <div class="text-center text-[10px] md:text-xs font-bold {isActive ? 'text-orange-500' : 'text-gray-300'}">
        {absoluteIndex}
    </div>
    
    <!-- Title and Mobile Metadata -->
    <div class="flex flex-col min-w-0">
        <div class="text-sm font-bold line-clamp-1 transition-colors {isActive ? 'text-orange-600' : 'text-gray-800 group-hover:text-orange-500'}">
            {#if language === 'english'}
                {sermon.english_title || 'Untitled'}
            {:else}
                {sermon.french_title || sermon.english_title || 'Sans titre'}
            {/if}
        </div>
        <div class="flex flex-row items-center gap-2 md:hidden overflow-hidden text-ellipsis whitespace-nowrap">
            <span class="text-[10px] font-medium {isActive ? 'text-orange-400' : 'text-gray-500'}">
                {sermon.full_date_code}
            </span>
            <span class="text-[10px] text-gray-300">•</span>
            <span class="text-[10px] font-medium italic {isActive ? 'text-orange-300' : 'text-gray-400'}">
                {sermon.author}
            </span>
        </div>
    </div>

    <!-- Desktop Author -->
    <div class="hidden md:block text-xs font-medium line-clamp-1 {isActive ? 'text-orange-400' : 'text-gray-500'}">
        {sermon.author}
    </div>

    <!-- Desktop Date -->
    <div class="hidden md:block text-xs font-medium line-clamp-1 italic {isActive ? 'text-orange-300' : 'text-gray-400'}">
        {sermon.full_date_code}
    </div>

    <!-- Actions -->
    <div class="flex items-center justify-end gap-1 md:gap-2">
        {#if (language === 'english' && sermon.english_pdf_url) || (language !== 'english' && sermon.pdf_url)}
            <button 
                class="p-2 text-gray-400 hover:text-red-500 transition-colors"
                on:click|stopPropagation={downloadPdf}
                title="Télécharger PDF"
            >
                <Icon src={BsFileEarmarkPdfFill} size="18" />
            </button>
        {/if}

        {#if (language === 'english' && sermon.english_audio_url) || (language !== 'english' && sermon.mp3_url)}
            <button 
                class="p-2 text-gray-400 hover:text-orange-500 transition-colors"
                on:click|stopPropagation={downloadMp3}
                title="Télécharger MP3"
            >
                <Icon src={IoCloudDownloadOutline} size="20" />
            </button>
        {/if}

        {#if (language === 'english' && sermon.english_audio_url) || (language !== 'english' && sermon.mp3_url)}
            <button 
                class="hover:scale-110 active:scale-95 transition-all p-2 {isActive ? 'text-orange-600' : 'text-orange-500'}"
                on:click|stopPropagation={togglePlay}
                title={isActive && $isPlaying ? 'Pause' : 'Lire'}
            >
                <Icon src={isActive && $isPlaying ? IoPauseCircle : IoPlayCircle} size="24" />
            </button>
        {/if}
    </div>
</div>
