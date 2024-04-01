let timer: ReturnType<typeof setTimeout>;
const debounce = (func: Function, time: number) => {
	clearTimeout(timer);
	timer = setTimeout(() => {
		func();
		console.log('debounce');
	}, time);
};

export default debounce;
