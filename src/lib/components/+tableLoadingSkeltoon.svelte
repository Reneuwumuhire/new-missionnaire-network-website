<div class="w-full space-y-1">
	<!-- Table header shimmer -->
	<div class="flex items-center gap-4 px-5 py-4 border-b border-stone-200/40">
		<div class="skeleton-shimmer rounded-md h-3 w-8" style="animation-delay: 0ms;"></div>
		<div class="skeleton-shimmer rounded-md h-3 w-48" style="animation-delay: 60ms;"></div>
		<div class="skeleton-shimmer rounded-md h-3 w-24 ml-auto hidden sm:block" style="animation-delay: 120ms;"></div>
		<div class="skeleton-shimmer rounded-md h-3 w-16 hidden md:block" style="animation-delay: 180ms;"></div>
	</div>

	<!-- Table rows with staggered shimmer -->
	{#each Array(10) as _, i}
		<div
			class="flex items-center gap-4 px-5 py-4 skeleton-stagger {i % 2 === 0 ? 'bg-cream-dark/20' : ''}"
			style="animation-delay: {80 + i * 60}ms;"
		>
			<!-- Index number -->
			<div class="skeleton-shimmer rounded h-3 w-6 shrink-0"></div>

			<!-- Thumbnail placeholder -->
			<div class="skeleton-shimmer-warm rounded-lg h-10 w-10 shrink-0"></div>

			<!-- Title + subtitle -->
			<div class="flex-1 space-y-2 min-w-0">
				<div
					class="skeleton-shimmer rounded-md h-3.5"
					style="width: {65 + (i * 17) % 30}%; animation-delay: {100 + i * 60}ms;"
				></div>
				<div
					class="skeleton-shimmer rounded-md h-2.5"
					style="width: {30 + (i * 13) % 25}%; animation-delay: {140 + i * 60}ms;"
				></div>
			</div>

			<!-- Duration -->
			<div class="skeleton-shimmer rounded-md h-3 w-12 shrink-0 hidden sm:block" style="animation-delay: {160 + i * 60}ms;"></div>

			<!-- Action dot -->
			<div class="skeleton-shimmer rounded-full h-5 w-5 shrink-0 hidden md:block" style="animation-delay: {180 + i * 60}ms;"></div>
		</div>
	{/each}

	<!-- Bottom fade -->
	<div class="h-12 bg-gradient-to-t from-[#FAF8F3] to-transparent pointer-events-none"></div>
</div>
