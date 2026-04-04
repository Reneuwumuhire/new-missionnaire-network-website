<!-- svelte-ignore a11y-no-static-element-interactions -->
<!-- SomeComponent.svelte -->
<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import { slide } from 'svelte/transition';
	import More from 'iconsax-svelte/More.svelte';
	import AudioSquare from 'iconsax-svelte/AudioSquare.svelte';
	import DocumentText1 from 'iconsax-svelte/DocumentText1.svelte';
	import VideoPlay from 'iconsax-svelte/VideoPlay.svelte';
	import type { YoutubeVideo } from '$lib/models/youtube';
	import Icon from 'svelte-icons-pack';
	import BsThreeDotsVertical from 'svelte-icons-pack/bs/BsThreeDotsVertical';

	export let video: YoutubeVideo;
	export let index: number;
	export const key = 'key';
	let playing;
	const dispatch = createEventDispatcher();
	let visible: boolean[] = [];

	let downloadDivElement: HTMLDivElement;

	const toggleVisible: (event: MouseEvent) => void = (event) => {
		event.stopPropagation();
		visible[index] = !visible[index];
		visible.map((_, i) => {
			return i === index ? true : false;
		});
	};

	const hideIfClickedOutside = (event: MouseEvent) => {
		event.stopPropagation();
		if (downloadDivElement && !downloadDivElement.contains(event.target as Node)) {
			visible = visible.map((_, i) => (i === index ? true : false));
			visible[index] = !visible[index];
		}
	};

	export function formatTime(date: number | Date | any) {
		const now: Date | number | any = new Date();
		const diff = now - date;

		// if it is in future return  "Upcoming"
		if (diff < 0) {
			return 'Upcoming';
		} else if (diff < 60000) {
			return 'just now';
		} else if (diff < 3600000) {
			return Math.floor(diff / 60000) + ' minutes ago';
		} else if (diff < 86400000) {
			return Math.floor(diff / 3600000) + ' hours ago';
		} else if (diff < 604800000) {
			const days = Math.floor(diff / 86400000);
			return days === 1 ? '1 day ago' : days + ' days ago';
		} else if (diff < 2419200000) {
			const weeks = Math.floor(diff / 604800000);
			return weeks === 1 ? '1 week ago' : weeks + ' weeks ago';
		} else if (diff < 29030400000) {
			const months = Math.floor(diff / 2419200000);
			return months === 1 ? '1 month ago' : months + ' months ago';
		} else {
			const years = Math.floor(diff / 29030400000);
			return years === 1 ? '1 year ago' : years + ' years ago';
		}
	}
</script>

<svelte:window on:click={hideIfClickedOutside} />
<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div
	class="group w-full cursor-pointer border border-stone-200/60 bg-white/40 overflow-hidden transition-all duration-300 hover:shadow-md hover:shadow-stone-200/40 hover:-translate-y-1"
	on:click={() => dispatch('selectedVideo', video)}
>
	<!-- Thumbnail -->
	<div class="relative overflow-hidden aspect-video">
		<img
			class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
			src={`https://i.ytimg.com/vi/${video.display_id}/mqdefault.jpg`}
			alt={video.title}
			loading="lazy"
			width="320"
			height="180"
			decoding="async"
		/>
		<!-- Play overlay on hover -->
		<div class="absolute inset-0 bg-stone-900/0 group-hover:bg-stone-900/15 transition-colors duration-300 flex items-center justify-center">
			<div class="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 scale-90 group-hover:scale-100 shadow-sm">
				<svg width="12" height="14" viewBox="0 0 14 16" fill="none">
					<path d="M2 1.5L12.5 8L2 14.5V1.5Z" fill="#292524" stroke="#292524" stroke-width="1.5" stroke-linejoin="round"/>
				</svg>
			</div>
		</div>
	</div>

	<!-- Content -->
	<div class="px-4 pt-3 pb-3">
		<p class="text-[13px] font-medium text-stone-700 group-hover:text-stone-900 line-clamp-2 leading-snug font-body">
			{video.title}
		</p>

		<!-- Actions row -->
		<div class="flex items-center justify-end mt-2 -mr-1">
			<button
				class="p-1.5 rounded-full text-stone-300 hover:text-stone-600 hover:bg-stone-100 transition-colors duration-200"
				on:click|stopPropagation={toggleVisible}
				aria-label="Options"
			>
				<Icon src={BsThreeDotsVertical} className="w-3.5 h-3.5" />
			</button>
		</div>
	</div>

	<!-- Dropdown menu -->
	{#if visible[index]}
		<!-- svelte-ignore a11y-click-events-have-key-events -->
		<!-- svelte-ignore a11y-no-static-element-interactions -->
		<div
			transition:slide={{ duration: 200 }}
			bind:this={downloadDivElement}
			class="relative"
		>
			<div class="absolute w-56 z-20 bg-white border border-stone-200/80 shadow-lg shadow-stone-200/30 right-2 bottom-1">
				<ul class="w-full text-[13px] font-body">
					<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
					<li
						on:click|stopPropagation={toggleVisible}
						class="w-full px-4 py-3 hover:bg-stone-50 flex items-center gap-3 text-stone-600 hover:text-stone-900 transition-colors cursor-pointer"
					>
						<AudioSquare size={16} color="currentColor" variant="Linear" /><span>Télécharger MP3</span>
					</li>
					<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
					<li
						on:click|stopPropagation={toggleVisible}
						class="w-full px-4 py-3 hover:bg-stone-50 flex items-center gap-3 text-stone-600 hover:text-stone-900 transition-colors border-t border-stone-100 cursor-pointer"
					>
						<DocumentText1 size={16} color="currentColor" variant="Linear" /><span>Télécharger PDF</span>
					</li>
					<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
					<li
						on:click|stopPropagation={toggleVisible}
						class="w-full px-4 py-3 hover:bg-stone-50 flex items-center gap-3 text-stone-600 hover:text-stone-900 transition-colors border-t border-stone-100 cursor-pointer"
					>
						<VideoPlay size={16} color="currentColor" variant="Linear" /><span>Télécharger vidéo</span>
					</li>
				</ul>
			</div>
		</div>
	{/if}
</div>
<!-- 
<div class="flex flex-col">
	<div class="flex flex-row items-center">
		<a
			href={link}
			class={`text-base font-medium ${
        active ? activeClass : inactiveClass
      }

      `}
		>
			{menuName}
		</a>
		{#if subMenu && subMenu.length > 0}
			<button
				class={`text-base font-medium ${
        active ? activeClass : inactiveClass
      }`}
				on:click={() => {
        showSubMenu = !showSubMenu;
      }}
			>
				<Icon className="w-4 h-4 ml-1" src={BsChevronDown} />
			</button>
		{/if}
	</div>
	{#if showSubMenu}
		<div class=" absolute mt-6 bg-primary flex flex-col">
			{#each subMenu as { name, link } (name)}
				<a
					href={link}
					class={`text-base font-medium ${
            activeLink === link
              ? activeLinkClass
              : inactiveLinkClass
          }`}
				>
					{name}
				</a>
			{/each}
		</div>
	{/if}
</div> -->
