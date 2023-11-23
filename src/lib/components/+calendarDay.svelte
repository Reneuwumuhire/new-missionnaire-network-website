<script lang="ts">
  type CalendarDayProps ={
  dayAndDate: string;
  videoTitle: string;
}
const getDayAndDate = (date: Date) => {
  const day = date.getDay();
  const dateOfMonth = date.getDate();
  const dayOfWeek = new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
  }).format(date);
    return `${dayOfWeek} ${dateOfMonth}`;
  };
  let date = new Date();
  let dayAndDate = getDayAndDate(date);
  export let VideoScheduleInfo: CalendarDayProps = {
    dayAndDate: "Lundi 12",
    videoTitle: "Titre de la vidéo",
  };

</script>

<div class=" flex flex-row space-x-3 w-96 min-w-[400px] rounded-md border-2 border-gray-200 p-3">
	<div class="flex flex-col space-y-2">
		<span class=" w-20 h-8 text-xl flex flex-row items-center justify-center bg-missionnaire-100"
			>OCT</span
		>
		<span
			class="flex h-14 text-5xl font-bold text-white flex-row items-center justify-center bg-missionnaire"
			>12</span
		>
	</div>
	<p class="flex flex-row items-center justify-center text-sm font-bold">
		{VideoScheduleInfo.videoTitle}
	</p>
</div>
