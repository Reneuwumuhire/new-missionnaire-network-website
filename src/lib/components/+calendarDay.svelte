<script lang="ts">
	type CalendarDayProps = {
		dateToWhen: Date;
		dayOfWeek?: string;
		dayNameOfWeek?: string;
		videoTitle: string;
	};
	const getDayAndDate = (date: Date) => {
		const day = date.getDay();
		const dateOfMonth = date.getDate();
		let dayOfWeek = '';
		switch (day) {
			case 0:
				dayOfWeek = 'Dimanche';
				break;
			case 1:
				dayOfWeek = 'Lundi';
				break;
			case 2:
				dayOfWeek = 'Mardi';
				break;
			case 3:
				dayOfWeek = 'Mercredi';
				break;
			case 4:
				dayOfWeek = 'Jeudi';
				break;
			case 5:
				dayOfWeek = 'Vendredi';
				break;
			case 6:
				dayOfWeek = 'Samedi';
				break;
			default:
				dayOfWeek = 'Dimanche';
				break;
		}

		return {
			dayName: dayOfWeek,
			date: dateOfMonth
		};
	};

	export let dateToWhen = new Date();
	export let videoTitle = 'Video Title';
</script>

<div class=" flex flex-row space-x-3 w-96 min-w-[400px] rounded-md border-2 border-gray-200 p-3">
	<div class="flex flex-col space-y-2">
		<span class=" w-20 h-8 flex flex-row items-center justify-center bg-missionnaire-100"
			>{`${getDayAndDate(dateToWhen).dayName}`}</span
		>
		<span
			class="flex h-8 md:h-14 text-xl md:text-5xl font-bold text-white flex-row items-center justify-center bg-missionnaire"
		>
			{getDayAndDate(dateToWhen).date}
		</span>
	</div>
	<p class="flex flex-row items-center justify-center text-sm font-bold">
		{videoTitle}
	</p>
</div>
