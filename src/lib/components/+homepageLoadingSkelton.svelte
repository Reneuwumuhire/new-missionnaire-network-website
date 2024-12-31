<div class="relative w-full animate-pulse">
	<div class="mx-auto mt-6">
		<!-- Row 1 -->
		<div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 mb-8 w-full relative">
			{#each Array(12) as _, i}
				<div class="w-full">
					<!-- Thumbnail skeleton -->
					<div class="bg-gray-200 w-full aspect-video rounded-xl" />

					<!-- Title skeleton -->
					<div class="mt-2 space-y-2">
						<div class="h-4 bg-gray-200 rounded w-full" />
						<div class="h-4 bg-gray-200 rounded w-3/4" />
					</div>
				</div>
			{/each}
		</div>
	</div>
</div>
