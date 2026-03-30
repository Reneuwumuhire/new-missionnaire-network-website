<script lang="ts">
	import LiveRadioPlayer from '$lib/components/+liveRadioPlayer.svelte';
	import NotificationBell from '$lib/components/+notificationBell.svelte';

	let bellRef: any;
</script>

<svelte:head>
	<title>Radio en direct - Missionnaire Network</title>
</svelte:head>

<section class="w-full py-10 px-4 md:px-8">
	<div class="max-w-3xl mx-auto">
		<!-- Header -->
		<div class="mb-8">
			<p class="text-[11px] font-black uppercase tracking-[0.2em] text-orange-600 mb-2">
				Radio Missionnaire
			</p>
			<h1 class="text-2xl md:text-4xl font-black text-gray-900">Radio en direct</h1>
			<p class="mt-2 text-sm text-gray-500 max-w-lg">
				La page se met a jour automatiquement en temps reel. Des que le direct commence, appuyez sur Lecture.
			</p>
		</div>

		<!-- Notification opt-in -->
		<button
			on:click={() => bellRef?.toggle()}
			class="flex items-center gap-3 w-full text-left rounded-xl bg-gray-50 hover:bg-gray-100 px-4 py-3 mb-6 transition-colors cursor-pointer"
		>
			<NotificationBell bind:this={bellRef} />
			<p class="text-xs text-gray-500">
				{#if bellRef?.isSubscribed}
					<span class="font-semibold text-orange-600">Notifications activees</span> — vous serez alerte quand la radio est en direct
				{:else}
					<span class="font-semibold text-gray-700">Recevoir une notification</span> quand la radio est en direct
				{/if}
			</p>
		</button>

		<!-- Player -->
		<LiveRadioPlayer />
	</div>
</section>
