// Function to format time in MM:SS format
export const formatTime = (time: number) => {
	if (isNaN(time) || time === Infinity) {
		return '00:00';
	}

	const minutes = Math.floor(time / 60);
	const seconds = Math.floor(time % 60);

	const formattedMinutes = minutes < 10 ? `0${minutes}` : minutes;
	const formattedSeconds = seconds < 10 ? `0${seconds}` : seconds;

	return `${formattedMinutes}:${formattedSeconds}`;
};
