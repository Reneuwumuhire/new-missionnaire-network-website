<script lang="ts">
	import LiveRadioPlayer from '$lib/components/+liveRadioPlayer.svelte';
	import NotificationBell from '$lib/components/+notificationBell.svelte';
</script>

<svelte:head>
	<title>Radio en direct - Missionnaire Network</title>
</svelte:head>

<section class="w-full py-10 px-4 md:px-8">
	<div class="max-w-3xl mx-auto">
		<!-- Header with notification -->
		<div class="flex items-start justify-between mb-8">
			<div>
				<p class="text-[11px] font-black uppercase tracking-[0.2em] text-orange-600 mb-2">
					Radio Missionnaire
				</p>
				<h1 class="text-2xl md:text-4xl font-black text-gray-900">Radio en direct</h1>
				<p class="mt-2 text-sm text-gray-500 max-w-lg">
					La page surveille automatiquement le signal. Des que le direct commence, appuyez sur Lecture.
				</p>
			</div>
			<div class="flex items-center gap-2 shrink-0 mt-1">
				<NotificationBell />
				<span class="text-[10px] font-bold text-gray-400 uppercase tracking-wider hidden sm:block">
					Alertes
				</span>
			</div>
		</div>

		<!-- Player -->
		<LiveRadioPlayer />
	</div>
</section>
