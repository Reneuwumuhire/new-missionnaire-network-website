<script lang="ts">
	import AudioPlayer from '$lib/components/+audioPlayer.svelte';
	import AudioTableItem from '$lib/components/+audioTableItem.svelte';
	import { PredicationsRoutes, alphabeticCharacters } from './predicationsRoutesList.js';
	export let data: any;
</script>

<div class=" flex flex-col">
	<header>
		<div class="flex flex-row items-center justify-center space-x-2">
			<!-- "/img/branham_page_header.jpg" use the image as the background for the next div -->
			<div
				class="relative header-predications flex flex-col items-center backdrop-blur-sm justify-center w-full"
			>
				<div class="absolute inset-0 overlay-predications flex items-center justify-center">
					<div class="flex flex-col items-center text-white space-y-4 px-5">
						<small class=" text-missionnaire uppercase tracking-widest font-bold">
							Tous les Predications de
						</small>
						<h1 class="text-4xl font-black mb-4 text-center">Branham, Ewald Frank et Locales</h1>
						<p class=" text-sm max-w-md text-center font-light leading-5 tracking-wider">
							Trouvez ici les predication de William Marrion Branham et Ewald Frank traduits en
							Kinyarwanda et Predications Locales.
						</p>
						<div class="flex flex-row w-full max-w-md">
							<input
								type="text"
								class="border border-gray-300 p-2 w-full"
								placeholder="Rechercher par titre, annee, predicateur..."
							/>
							<button class="bg-missionnaire text-white px-4 py-2">Search</button>
						</div>
					</div>
				</div>
			</div>
		</div>
	</header>
	<div class="relative flex flex-row justify-center h-auto w-full py-6">
		<div class="relative flex flex-col items-start w-full max-w-5xl overflow-hidden space-y-6 px-5">
			<h1 class=" text-2xl font-black text-[#414141]">Par Auteur</h1>
			<ul class="flex flex-row w-full space-x-4">
				{#each PredicationsRoutes as slug}
					<!-- list has to have equal width and fill the container and all have same height -->
					<li class="flex-1 h-full">
						<!-- it the slug is as the same active the link slug.slug === params.body.params.slug -->
						<a
							href="/predications/{slug.slug}"
							class={`
							${slug.slug === data.body.params.slug ? 'bg-missionnaire-100 ' : ''}
						flex flex-col space-y-1 border-2 border-missionnaire-100 rounded-lg p-4 hover:bg-missionnaire-100 transition-all h-full
							`}
						>
							<span class=" font-bold text-lg">{slug.title}</span>
							<span class=" font-light text-sm text-gray-600">{slug.description}</span>
						</a>
					</li>
				{/each}
			</ul>
			<h1 class=" text-2xl font-black text-[#414141]">Par ordre alphabétique</h1>
			<ul class=" flex flex-row justify-between w-full">
				{#each alphabeticCharacters as character}
					<li class="flex flex-row items-center">
						<!-- add from the current url a &filter=alph&char=character avoid scrolling back to top -->
						<a
							href="?filter=alph&char={character}"
							class={`

							 text-missionnaire
							`}
						>
							<span class=" font-medium text-lg">{character}</span>
						</a>
					</li>
				{/each}
			</ul>
		</div>
	</div>
</div>
<div class="flex flex-row justify-center h-auto w-full py-6">
	<div class=" flex flex-col w-full max-w-5xl px-5">
		<h1 class=" text-2xl font-black text-[#414141]">List</h1>
		<slot />
	</div>
</div>

<AudioPlayer />

<style>
	.header-predications {
		background-image: url('/img/predications_header.jpg');
		background-color: #cccccc;
		background-repeat: no-repeat;
		background-size: cover;
		background-position: center;
		height: 300px;
	}
	.overlay-predications {
		background-color: rgba(0, 0, 0, 0.7);
		backdrop-filter: blur(5px);
		-webkit-backdrop-filter: blur(9px);
	}
</style>
