<script lang="ts">
	const handleClick = () => {
		currentViewingUrl = 'https://www.youtube.com/embed/EK5u1gUI-KE';
	};
	export let currentViewingUrl: any;
</script>

<div class=" min-w-full flex items-center justify-center">
	<div class=" min-w-full flex flex-row justify-between space-x-4">
		<!-- video and title -->
		<div class=" w-full">
			<!-- <div class="bg-primary mb-2 p-2 w-fit">
				<h3 class="text-white font-bold">LATEST UPLOADED</h3>
			</div> -->
			<div class=" w-full relative bg-hardBlack">
				{#if currentViewingUrl.length}
					<div class=" flex flex-row items-center justify-center w-full" id="player">
						<iframe
							class=" w-full aspect-video"
							src={`${currentViewingUrl}`}
							allowfullscreen
							allow='autoplay'
							title=""
							allowtransparency
						/>
					</div>
				{:else}
					<img class="w-full h-auto" src="/img/thumbnail.jpeg" alt="thumbnail" />
					<div
						class="absolute grid content-end h-full pl-10 w-full bg-gradient-to-t from-hardBlack bottom-0"
					>
						<h2
							class="text-white font-bold xsm:text-sm lg:text-2xl leading-10 xsm:max-w-full lg:max-w-[60%]"
						>
							[EN DIRECT DE KREFELD ] - 2023-06-04 10:00 - Réunion de Krefeld - Mu Kinyarwanda
						</h2>
						<div class="flex xsm:gap-5 ms:gap-12">
							<span class="text-grayWeak font-medium text-xs">Tuesday, June 4 2023</span>
							<span class="text-grayWeak font-medium text-sm">120 min</span>
						</div>
						<div class="xsm:mt-3 sm:mt-10 xsm:mb-5 lg:mb-10 flex gap-10">
							<button on:click={handleClick}>
								<img
									class=" xsm:w-[30px] lg:w-[45px] h-fit"
									src="/icons/play-yellow.png"
									alt="play"
								/>
							</button>
							<button>
								<img class=" xsm:w-[30px] w-[45px] h-fit" src="/icons/link-yellow.png" alt="play" />
							</button>
							<button>
								<img
									class=" xsm:w-[30px] w-[45px] h-fit"
									src="/icons/download-yellow.png"
									alt="play"
								/>
							</button>
						</div>
					</div>
				{/if}
			</div>
		</div>
		<!-- schedule -->
		<div class="hidden md:flex w-fit max-w-xs shadow-md">
			<div>
				<div class="bg-primary mb-2 p-2 w-fit text-white">
					<h3 class=" font-bold">
						Schedule
						<span class="font-normal">July, 2023</span>
					</h3>
				</div>
				<div
					class="mt-3 lg:flex xl:grid lg:overflow-y-hidden xl:overflow-x-hidden shadow-4xl bg-pureWhite p-8"
				>
					<div class="flex mr-5">
						<div class="mt-2">
							<div class="w-[10px] h-[10px] bg-primary rounded-full" />
							<div class="h-[90%] ml-1 mt-2 w-1 border-l border-weakGray border-dashed" />
						</div>
						<div class="ml-2">
							<h5 class="text-xs font-medium">July, 13 6:00 PM</h5>
							<img class="w-full mt-2" src="/img/thumbnail.jpeg" alt="upcoming-img" />
							<p
								class=" w-full text-xs text-grayWeak mt-1 ext-ellipsis overflow-hidden line-clamp-2"
							>
								[RETRANSMISSION] - 2023-06-14 19:30 - Réunion de Krefeld [01.04.1973 15:00] - Mu
								Kinyarwanda
							</p>
							<button
								class="flex rounded-full mt-1 py-2 justify-center items-center bg-accentOrange w-full text-white"
								type="button"
							>
								<img class="w-4" src="/icons/notification-white.png" alt="upcoming-img" />
								<span class="text-xs">Notify me</span>
							</button>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
</div>
