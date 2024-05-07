// Function to format time in MM:SS format
export const formatTime = (time: number) => {
	if (isNaN(time) || time === Infinity) {
		return '00:00';
	}

	const minutes = Math.floor(time / 60);
	const seconds = Math.floor(time % 60);

	const formattedMinutes = minutes < 10 ? `0${minutes}` : minutes;
	const formattedSeconds = seconds < 10 ? `0${seconds}` : seconds;

	return `${formattedMinutes} : ${formattedSeconds} `;
};

// function to format this dat: Mon Nov 27 2023 02:54:32 GMT+0200 (Central Africa Time) to this format: 27 Nov 2023

export const formatDate = (date: string | Date) => {
	const newDate = new Date(date);
	const day = newDate.getDate();
	const month = newDate.getMonth();
	const year = newDate.getFullYear();

	const months = [
		'Jan',
		'Feb',
		'Mar',
		'Apr',
		'May',
		'Jun',
		'July',
		'Aug',
		'Sept',
		'Oct',
		'Nov',
		'Dec'
	];

	return `${day} ${months[month]} ${year}`;
};
