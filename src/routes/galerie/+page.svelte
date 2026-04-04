<script lang="ts">
	import { getImages } from './imageList';
	import { onMount } from 'svelte';
	import viewport from './viewport';

	let _list: string | any[] = [];

	let FILL_SCREEN_WIDTH = true;

	let ADAPTIVE_COLS = Math.min(Math.max(Math.ceil(Math.floor(window.innerWidth * 0.33) / 100)), 4);

	onMount(() => {
		paginate();
	});

	const chunk = (arr: string | any[]) => {
		let numCols = FILL_SCREEN_WIDTH ? ADAPTIVE_COLS : 4;
		const columns = Math.floor(arr.length / numCols);

		return new Array(numCols).fill('').map((_, i) => arr.slice(i * columns, (i + 1) * columns));
	};

	const paginate = async () => {
		const promise = await getImages();
		const images = chunk([...promise]);
		if (_list.length < 1) {
			_list = [...images];
		}

		for (let i = 0; i < _list.length; i++) {
			// @ts-ignore
			_list[i] = [...(_list[i] as any[]), ...images[i]] as any[];
		}
	};

	$: console.log(_list);
</script>

<svelte:head>
	<title>Galerie - Missionnaire Network</title>
	<meta name="robots" content="noindex, nofollow" />
	<meta
		name="description"
		content="Galerie photo de l'assemblée locale et des activités Missionnaire Network."
	/>
	<meta property="og:title" content="Galerie - Missionnaire Network" />
	<meta
		property="og:description"
		content="Explorez les images des réunions, événements et moments marquants."
	/>
</svelte:head>
<div class="flex flex-col">
	<header>
		<div class="flex flex-row items-center justify-center space-x-2">
			<div class="header-branham flex flex-col items-center justify-center w-full" />
		</div>
	</header>
	<div class="relative flex flex-row justify-center h-auto w-full py-14">
		<div class="relative flex flex-col items-start w-full max-w-6xl space-y-8 px-6">
			<div>
				<p class="text-[10px] font-bold uppercase tracking-[0.35em] text-missionnaire mb-3 font-body"
					>ASSEMBLÉE LOCALE</p
				>
				<h1 class="font-display text-3xl md:text-4xl font-semibold text-stone-900">Galerie</h1>
			</div>
			<div class="grid gap-1">
				{#each _list as col}
					<div class="col">
						{#each col as item}
							<img loading="lazy" src={item.download_url} alt="" class="img-zoom" />
						{/each}
					</div>
				{/each}
			</div>
			<div use:viewport={{ onEnter: paginate }} class="loader"></div>
		</div>
	</div>
</div>

<style>
	.header-branham {
		background-image: url('/img/eglise_header.jpg');
		background-color: #cccccc;
		background-repeat: no-repeat;
		background-size: cover;
		background-position: center;
		/* background-attachment: fixed; */
		height: 500px;
	}
	.loader {
		position: relative;
		height: 0.5rem;
	}
	img::before,
	video::before {
		display: block;
		content: '';
		padding-top: calc(100% * 1 / 2);
	}

	img {
		min-height: 0;
		max-width: 100%;
	}
	.col {
		flex: 1 1;
		min-width: 0;
	}
	.grid {
		display: flex;
		position: relative;
		align-items: flex-start;
		gap: 0.5rem;
	}
</style>
