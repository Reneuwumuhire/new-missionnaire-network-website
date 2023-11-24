<script>
	// @ts-ignore
	import Icon from 'svelte-icons-pack/Icon.svelte';
	import BsChevronRight from 'svelte-icons-pack/bs/BsChevronRight';
	import BsChevronDoubleRight from 'svelte-icons-pack/bs/BsChevronDoubleRight';
	import BsChevronLeft from 'svelte-icons-pack/bs/BsChevronLeft';
	import BsChevronDoubleLeft from 'svelte-icons-pack/bs/BsChevronDoubleLeft';
	import AudioTableItem from './+audioTableItem.svelte';
	import { Pagination } from 'flowbite-svelte';
	let helper = { start: 1, end: 10, total: 100 };
	const previous = () => {
		alert('Previous btn clicked. Make a call to your server to fetch data.');
	};
	const next = () => {
		alert('Next btn clicked. Make a call to your server to fetch data.');
	};
</script>

<div class=" w-full">
	<!-- <AudioTableItem /> -->
	<!-- table with ten AudioTableItem -->
	<table class="w-full">
		<thead>
			<!-- <tr>
				<th class="text-left">No</th>
				<th class="text-left">Title</th>
				<th class="text-left">PDF</th>
				<th class="text-left">MP3</th>
				<th class="text-left">Play</th>
			</tr> -->
		</thead>
		<tbody class=" space-y-2">
			{#each Array(10) as _, index}
				<AudioTableItem />
			{/each}
		</tbody>
	</table>
	<div class=" flex flex-col items-end px-5 mt-5">
		<div class="text-sm text-gray-700 dark:text-gray-400">
			Showing <span class="font-semibold text-gray-900">{helper.start}</span>
			to
			<span class="font-semibold text-gray-900">{helper.end}</span>
			of
			<span class="font-semibold text-gray-900">{helper.total}</span>
			Entries
		</div>
		<Pagination table large class=" flex flex-row  self-end">
			<div slot="prev" class="flex flex-row items-center space-x-4">
				<Icon src={BsChevronLeft} />
				<span> Prev </span>
			</div>
			<div slot="next" class="flex flex-row items-center space-x-4">
				<span> Prev </span>
				<Icon src={BsChevronRight} />
			</div>
		</Pagination>
	</div>
</div>
