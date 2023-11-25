<script lang="ts">
	const handleClick = () => {
		currentViewingUrl = 'https://www.youtube.com/embed/EK5u1gUI-KE';
	};
	export let currentViewingUrl: any;
</script>

<div class=" w-full flex items-center justify-center">
	<div class="flex w-full flex-row justify-between space-x-4">
		<!-- video and title -->
		<div class=" w-full">
			<!-- <div class="bg-primary mb-2 p-2 w-fit">
				<h3 class="text-white font-bold">LATEST UPLOADED</h3>
			</div> -->
			<div class=" relative w-full bg-hardBlack">
				{#if currentViewingUrl.length}
					<div
						class=" flex flex-row items-center justify-center w-full rounded-xl overflow-hidden"
						id="player"
					>
						<iframe
							class=" w-full aspect-video rounded-xl"
							src={`${currentViewingUrl}`}
							allowfullscreen
							allow="autoplay"
							title=""
							allowtransparency
						/>
					</div>
				{:else}
					<img class="relative w-full max-h-[600px]" src="/img/thumbnail.jpeg" alt="thumbnail" />
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
								<!-- <img
									class=" xsm:w-[30px] lg:w-[45px] h-fit"
									src="/icons/play-yellow.png"
									alt="play"
								/> -->
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
	</div>
</div>
