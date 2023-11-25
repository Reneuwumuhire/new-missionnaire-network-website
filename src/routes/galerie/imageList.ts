let page = 1;

export const getImages = async () => {
	const response = await fetch(`https://picsum.photos/v2/list?page=${page++}&limit=15`);
	const data = await response.json();

	return [...data];
};
