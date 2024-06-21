// Function to format time in MM:SS format
export const formatTime = (time: number): string => {
	if (isNaN(time) || time === Infinity) {
		return "00h:00min:00sec";
	}

	const hours = Math.floor(time / 3600);
	const minutes = Math.floor((time % 3600) / 60);
	const seconds = Math.floor(time % 60);

	const formattedHours = hours > 0 ? `${hours}h` : "";
	const formattedMinutes = minutes > 0 ? `${minutes}min` : "";
	const formattedSeconds = `${seconds}sec`;

	return `${formattedHours} ${formattedMinutes} ${formattedSeconds}`;
};

// function to format this dat: Mon Nov 27 2023 02:54:32 GMT+0200 (Central Africa Time) to this format: 27 Nov 2023

export const formatDate = (date: string | Date) => {
	const newDate = new Date(date);
	const day = newDate.getDate();
	const month = newDate.getMonth();
	const year = newDate.getFullYear();

	const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "July", "Aug", "Sept", "Oct", "Nov", "Dec"];

	return `${day} ${months[month]} ${year}`;
};
