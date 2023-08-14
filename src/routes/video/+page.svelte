<script lang="ts">
	import Plyr from 'plyr';
	import { dict, locale, t } from '../../i18n';
	import fr from '../../translations/fr';
	import en from '../../translations/en';
	const languages = { en, fr };
	dict.set(languages);
	console.log(Plyr);
	let currentViewingUrl = '';
	const handleClick = () => {
		currentViewingUrl = 'https://www.youtube.com/embed/EK5u1gUI-KE';
	};
</script>

<!-- 
<select bind:value={$locale}>
	{#each Object.keys(languages) as lang}
		<option value={lang}>
			{lang}
		</option>
	{/each}
</select> -->

<div class="flex items-center justify-center">
	<div
		class="lg:grid sm:w-full xl:flex gap-[50px] xsm:px-[20px] 2xl:justify-center xl:px-[100px] mt-[60px]"
	>
		<div class="grid gap-5">
			<h3
				class="bg-primary w-fit px-[15px] h-[40px] py-[10px] text-center text-[15px] text-white font-bold"
			>
				LATEST UPLOADED
			</h3>
			<div class="relative xl:w-[calc(100vw-600px)] 2xl:max-w-[1400px]">
				{#if currentViewingUrl.length !== 0}
					<div class="plyr__video-embed w-full" id="player">
						<iframe
							class=" xsm:w-[calc(100vw-60px)] xsm:h-[300px] sm:w-full lg:h-[600px] 2xl:h-[800px] sm:h-[500px]"
							src={currentViewingUrl}
							allowfullscreen
							allowtransparency
							allow="autoplay"
						/>
					</div>
				{:else}
					<img class="w-full h-auto" src="/img/thumbnail.jpeg" alt="thumbnail" />
					<div
						class="absolute grid content-end h-full pl-10 w-full bg-gradient-to-t from-hardBlack bottom-0"
					>
						<h2 class="text-white font-bold xsm:text-sm lg:text-2xl leading-10 xsm:max-w-full lg:max-w-[60%]">
							[EN DIRECT DE KREFELD ] - 2023-06-04 10:00 - Réunion de Krefeld - Mu Kinyarwanda
						</h2>
						<div class="flex xsm:gap-5 ms:gap-12">
							<span class="text-grayWeak font-medium text-xs">Tuesday, June 4 2023</span>
							<span class="text-grayWeak font-medium text-sm">120 min</span>
						</div>
						<div class="xsm:mt-3 sm:mt-10 xsm:mb-5 lg:mb-10 flex gap-10">
							<button on:click={handleClick}>
								<img class=" xsm:w-[30px] lg:w-[45px] h-fit" src="/icons/play-yellow.png" alt="play" />
							</button>
							<button>
								<img class=" xsm:w-[30px]  w-[45px] h-fit" src="/icons/link-yellow.png" alt="play" />
							</button>
							<button>
								<img class=" xsm:w-[30px]  w-[45px] h-fit" src="/icons/download-yellow.png" alt="play" />
							</button>
						</div>
					</div>
				{/if}
			</div>
		</div>
		<div>
			<div>
				<div
					class="bg-primary xsm:mt-10 sm:mt-20 w-full flex gap-3 px-[15px] h-[40px] py-[10px] text-center text-[13px] text-white font-medium"
				>
					<span class="font-bold">Schedule</span>
					<span class="font-normal">July, 2023</span>
				</div>
				<div
					class="w-[400px] mt-3 lg:flex xl:grid lg:overflow-y-hidden xl:overflow-x-hidden shadow-4xl bg-pureWhite p-8"
				>
					<div class="flex mr-5">
						<div class="mt-2">
							<div class="w-[10px] h-[10px] bg-primary rounded-full" />
							<div class="h-[90%] ml-1 mt-2 w-1 border-l-2 border-weakGray border-dashed" />
						</div>
						<div class="ml-2">
							<h5 class="text-[16px] font-medium">July, 13 6:00 PM</h5>
							<img class="w-[300px] mt-2" src="/img/thumbnail.jpeg" alt="upcoming-img" />
							<p class="text-[15px] text-grayWeak mt-3">
								[RETRANSMISSION] - 2023-06-14 19:30 - Réunion de Krefeld [01.04.1973 15:00] - Mu
								Kinyarwanda
							</p>
							<button
								class="flex rounded-full mt-8 justify-center items-center bg-accentOrange w-full text-white"
								type="button"
							>
								<div class="flex p-3 justify-center items-center gap-3">
									<img class="w-6" src="/icons/notification-white.png" alt="upcoming-img" />
									<span class="text-[18px]">Notify me</span>
								</div>
							</button>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
</div>
