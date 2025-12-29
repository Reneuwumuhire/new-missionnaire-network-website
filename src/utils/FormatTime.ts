export const formatTime = (time: number): string => {
	if (isNaN(time) || time === Infinity || time <= 0) {
		return '0:00';
	}

	const hours = Math.floor(time / 3600);
	const minutes = Math.floor((time % 3600) / 60);
	const seconds = Math.floor(time % 60);

	const formattedSeconds = seconds < 10 ? `0${seconds}` : `${seconds}`;

	if (hours > 0) {
		const formattedMinutes = minutes < 10 ? `0${minutes}` : `${minutes}`;
		return `${hours}:${formattedMinutes}:${formattedSeconds}`;
	} else {
		return `${minutes}:${formattedSeconds}`;
	}
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

// Function to format file size
export function formatFileSize(bytes: number): string {
	if (bytes === 0) return '0 B';

	const k = 1024;
	const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));

	return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}
