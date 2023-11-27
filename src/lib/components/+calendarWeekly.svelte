<script lang="ts">
	import { date } from 'zod';
	import CalendarDay from './+calendarDay.svelte';

	const scrollLeft = () => {
		const container = document.querySelector('.overflow-x-scroll');
		if (container) container.scrollBy({ left: -400, behavior: 'smooth' });
	};

	const scrollRight = () => {
		const container = document.querySelector('.overflow-x-scroll');
		if (container) container.scrollBy({ left: 400, behavior: 'smooth' });
	};
</script>

<div class="w-full flex flex-col sm:flex-row mt-10 space-x-1 md:space-x-3 p-2 md:p-5 border">
	<div class=" flex flex-row items-center">
		<h1 class=" text-lg md:text-4xl font-black text-start mr-4">Cette Semaine</h1>
	</div>
	<!-- verical line between -->
	<div class="hidden md:flex flex-col items-center justify-center">
		<div class="w-1 h-10 bg-gray-200" />
	</div>

	<div class="relative flex flex-row items-center scroll-smooth overflow-x-hidden w-auto">
		<!-- Left arrow for navigation -->
		<button
			class=" hidden md:flex absolute top-0 bottom-0 w-24 z-10 pl-2 items-center justify-start cursor-pointe right-arrow-button left-0"
			on:click={scrollLeft}
			aria-label="Scroll Left"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-8 w-8 text-gray-600"
				fill="none"
				viewBox="0 0 32 32"
				stroke="currentColor"
			>
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
			</svg>
		</button>
		<div
			class="flex flex-row items-center space-x-3 overflow-x-scroll md:overflow-x-scroll md:overflow-y-hidden px-1 md:px-16"
		>
			<CalendarDay
				dateToWhen={new Date('Tue Nov 28 2023 09:42:56 GMT+0200 (Central Africa Time)')}
				videoTitle="[RETRANSMISSION] - 2023-06-14 19:30 - Réunion de Krefeld [01.04.1973 15:00] - Mu Kinyarwanda"
			/>
			<CalendarDay
				dateToWhen={new Date('Wed Nov 29 2023 09:42:56 GMT+0200 (Central Africa Time)')}
				videoTitle="[RETRANSMISSION] - 2023-06-14 19:30 - Réunion de Krefeld [01.04.1973 15:00] - Mu Kinyarwanda"
			/>
			<CalendarDay
				dateToWhen={new Date('Fri Dec 01 2023 09:42:56 GMT+0200 (Central Africa Time)')}
				videoTitle="[RETRANSMISSION] - 2023-06-14 19:30 - Réunion de Krefeld [01.04.1973 15:00] - Mu Kinyarwanda"
			/>
			<CalendarDay
				dateToWhen={new Date('Sad Dec 02 2023 09:42:56 GMT+0200 (Central Africa Time)')}
				videoTitle="[RETRANSMISSION] - 2023-06-14 19:30 - Réunion de Krefeld [01.04.1973 15:00] - Mu Kinyarwanda"
			/>
			<CalendarDay
				dateToWhen={new Date('Sun Dec 03 2023 09:42:56 GMT+0200 (Central Africa Time)')}
				videoTitle="[RETRANSMISSION] - 2023-06-14 19:30 - Réunion de Krefeld [01.04.1973 15:00] - Mu Kinyarwanda"
			/>
		</div>
		<!-- Right arrow for navigation -->
		<button
			class="hidden md:flex absolute top-0 bottom-0 w-24 z-10 items-center justify-end cursor-pointer left-arrow-button right-0"
			on:click={scrollRight}
			aria-label="Scroll Right"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-8 w-8 text-gray-600"
				fill="none"
				viewBox="0 0 32 32"
				stroke="currentColor"
			>
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
			</svg>
		</button>
	</div>
</div>

<style>
	/* Hide scrollbar */
	.overflow-x-scroll::-webkit-scrollbar {
		display: none; /* Safari and Chrome browsers */
	}
	.right-arrow-button {
		background: linear-gradient(
			89deg,
			#fff 1.14%,
			#fff 50%,
			#fff 10%,
			rgba(255, 255, 255, 0) 90.25%
		);
	}
	.left-arrow-button {
		background: linear-gradient(271deg, #fff 1.14%, #fff 40%, rgba(255, 255, 255, 0) 80.25%);
	}
</style>
