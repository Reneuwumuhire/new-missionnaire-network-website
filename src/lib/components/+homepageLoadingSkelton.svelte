<div class="w-full space-y-14 pb-12">
	<!-- Hero Skeleton — cinematic aspect with warm shimmer -->
	<div
		class="w-full h-[50vh] max-h-[600px] min-h-[400px] rounded-none overflow-hidden relative skeleton-stagger"
		style="animation-delay: 0ms;"
	>
		<!-- Full background shimmer -->
		<div class="absolute inset-0 skeleton-shimmer-warm"></div>

		<!-- Gradient overlay mimicking the real hero -->
		<div class="absolute inset-0 bg-gradient-to-t from-[#FAF8F3] via-transparent to-transparent"></div>

		<!-- Content placeholders at bottom -->
		<div class="absolute bottom-0 left-0 w-full p-6 md:p-12 space-y-5">
			<!-- Tag badge -->
			<div
				class="skeleton-shimmer rounded-full h-6 w-24"
				style="animation-delay: 200ms;"
			></div>

			<!-- Title lines -->
			<div class="space-y-3">
				<div
					class="skeleton-shimmer rounded-lg h-8 md:h-12 w-11/12 md:w-3/4"
					style="animation-delay: 300ms;"
				></div>
				<div
					class="skeleton-shimmer rounded-lg h-8 md:h-12 w-2/3 md:w-1/2 hidden md:block"
					style="animation-delay: 400ms;"
				></div>
			</div>

			<!-- Description -->
			<div
				class="skeleton-shimmer rounded-md h-4 w-3/5 max-w-md"
				style="animation-delay: 500ms;"
			></div>

			<!-- CTA buttons -->
			<div class="flex gap-4 pt-3">
				<div
					class="skeleton-shimmer rounded-full h-12 w-44"
					style="animation-delay: 600ms;"
				></div>
				<div
					class="skeleton-shimmer rounded-full h-12 w-36 hidden sm:block"
					style="animation-delay: 700ms;"
				></div>
			</div>
		</div>
	</div>

	<!-- Grid Section -->
	<div class="space-y-8">
		<!-- Section Header -->
		<div class="skeleton-stagger px-2" style="animation-delay: 400ms;">
			<div class="space-y-2">
				<div class="skeleton-shimmer-warm rounded-md h-2.5 w-28"></div>
				<div class="skeleton-shimmer rounded-lg h-7 w-52"></div>
			</div>
		</div>

		<!-- Video Card Grid -->
		<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
			{#each Array(8) as _, i}
				<div
					class="flex flex-col gap-3 skeleton-stagger"
					style="animation-delay: {500 + i * 80}ms;"
				>
					<!-- Thumbnail with warm shimmer -->
					<div class="relative aspect-video rounded-xl overflow-hidden">
						<div class="absolute inset-0 skeleton-shimmer-warm"></div>
						<!-- Play icon ghost -->
						<div class="absolute inset-0 flex items-center justify-center">
							<div class="w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm"></div>
						</div>
						<!-- Duration badge ghost -->
						<div class="absolute bottom-2 right-2">
							<div class="skeleton-shimmer rounded h-5 w-12"></div>
						</div>
					</div>

					<!-- Metadata -->
					<div class="space-y-2 px-1">
						<div
							class="skeleton-shimmer rounded-md h-3.5"
							style="width: {70 + (i * 11) % 25}%; animation-delay: {600 + i * 80}ms;"
						></div>
						<div class="flex items-center gap-3">
							<div
								class="skeleton-shimmer rounded-md h-2.5"
								style="width: {35 + (i * 7) % 20}%; animation-delay: {660 + i * 80}ms;"
							></div>
							<div class="w-1 h-1 rounded-full bg-stone-200"></div>
							<div
								class="skeleton-shimmer rounded-md h-2.5 w-10"
								style="animation-delay: {700 + i * 80}ms;"
							></div>
						</div>
					</div>
				</div>
			{/each}
		</div>
	</div>
</div>
