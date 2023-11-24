<!-- raw table item 
  that take a row of data and display it
  1. video name
  2. video date
  3. download pdf link
  4. download audio link 
  5. play audio button 
  6. video thumbnail
 -->
<script lang="ts">
	// @ts-ignore
	import Icon from 'svelte-icons-pack/Icon.svelte';
	import BsCloudDownloadFill from 'svelte-icons-pack/bs/BsCloudDownloadFill';
	import BsFileEarmarkPdfFill from 'svelte-icons-pack/bs/BsFileEarmarkPdfFill';
	import BsPlayCircleFill from 'svelte-icons-pack/bs/BsPlayCircleFill';
	let showDropContents = false;
</script>

<div
	class="flex flex-col w-full bg-gray-100 hover:bg-missionnaire-50 hover:text-black transition-all duration-75 ease-in-out cursor-pointer"
>
	<div class=" flex flex-row items-center justify-between px-4 py-3 overflow-hidden space-x-3">
		<div>1</div>
		<div class=" flex-1">
			<p class=" max-w-2xl text-ellipsis overflow-hidden line-clamp-1">
				[RETRANSMISSION] - 2023-06-14 19:30 - Réunion de Krefeld [01.04.1973 15:00] - Mu Kinyarwanda
			</p>
		</div>
		<div class="flex flex-row space-x-6">
			<button class="flex flex-row items-center space-x-1 hover:text-missionnaire">
				<Icon src={BsFileEarmarkPdfFill} />
				<span>PDF</span>
			</button>
			<button class="flex flex-row items-center space-x-1 hover:text-missionnaire">
				<Icon src={BsCloudDownloadFill} />
				<span>MP3</span>
			</button>
			<button class="flex flex-row items-center space-x-1 hover:text-missionnaire">
				<Icon src={BsPlayCircleFill} />
				<span>Play</span>
			</button>
		</div>
	</div>
</div>
