<script lang="ts">
  import CalendarDay from "./+calendarDay.svelte";

  const scrollLeft = () => {
    const container = document.querySelector('.overflow-x-scroll');
    if (container)
    container.scrollBy({ left: -400, behavior: 'smooth' });
  };

  const scrollRight = () => {
    const container = document.querySelector('.overflow-x-scroll');
    if (container)
    container.scrollBy({ left: 400, behavior: 'smooth' });
  };

</script>

<div class="w-full flex flow-row mt-10 space-x-3 p-5 border">
	<div class="flex flex-row items-center">
		<h1 class="text-4xl font-black text-start mr-4">Cette <br /> Semaine</h1>
	</div>
	<!-- verical line between -->
	<div class="flex flex-col items-center justify-center">
		<div class="w-1 h-10 bg-gray-200" />
	</div>

	<div class="relative flex flex-row items-center scroll-smooth overflow-x-hidden w-auto">
		<!-- Left arrow for navigation -->
		<button
			class="absolute top-0 bottom-0 w-24 z-10 pl-2 flex items-center justify-start cursor-pointe right-arrow-button left-0"
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
		<div class="flex flex-row items-center space-x-3 overflow-x-scroll overflow-y-hidden px-16">
			<CalendarDay
				VideoScheduleInfo={{ dayAndDate: "Lundi 12", videoTitle: "[RETRANSMISSION] - 2023-06-14 19:30 - Réunion de Krefeld [01.04.1973 15:00] - Mu Kinyarwanda" }}
			/>
			<CalendarDay
				VideoScheduleInfo={{ dayAndDate: "Mardi 13", videoTitle: "[RETRANSMISSION] - 2023-06-14 19:30 - Réunion de Krefeld [01.04.1973 15:00] - Mu Kinyarwanda" }}
			/>
			<CalendarDay
				VideoScheduleInfo={{ dayAndDate: "Mercredi 14", videoTitle: "[RETRANSMISSION] - 2023-06-14 19:30 - Réunion de Krefeld [01.04.1973 15:00] - Mu Kinyarwanda" }}
			/>
			<CalendarDay
				VideoScheduleInfo={{ dayAndDate: "Jeudi 15", videoTitle: "[RETRANSMISSION] - 2023-06-14 19:30 - Réunion de Krefeld [01.04.1973 15:00] - Mu Kinyarwanda" }}
			/>
		</div>
		<!-- Right arrow for navigation -->
		<button
			class="absolute top-0 bottom-0 w-24 z-10 flex items-center justify-end cursor-pointer left-arrow-button right-0"
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
    background: linear-gradient(89deg, #FFF 1.14%, #FFF 50%, #FFF 10%, rgba(255, 255, 255, 0.00) 90.25%);
  }
  .left-arrow-button {
    background: linear-gradient(271deg, #FFF 1.14%, #FFF 40%, rgba(255, 255, 255, 0.00) 80.25%);
    }
</style>
