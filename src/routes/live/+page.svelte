<script lang="ts">
	import LiveRadioPlayer from '$lib/components/+liveRadioPlayer.svelte';
	import ShareLive from '$lib/components/+shareLive.svelte';
	import NotificationBell from '$lib/components/+notificationBell.svelte';
	import RecentRecordings from '$lib/components/+recentRecordings.svelte';
	import { t } from '../../i18n';
	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();
	let bellRef: NotificationBell | undefined = $state();
	// Bound to the bell's $bindable prop — component-instance property access
	// (bellRef?.isSubscribed) always reads undefined in Svelte 5, which left
	// this card stuck on "Enable notifications" even when already subscribed.
	let bellSubscribed = $state(false);

	// og:*/twitter:*/<title>/<canonical> are rendered once by the root
	// +layout.svelte from the `meta` object this route returns in its load —
	// emitting them here too would duplicate the tags and let crawlers pick the
	// layout's default image over the live thumbnail. `liveMeta` is kept only to
	// drive the share-sheet copy below.
	let liveMeta = $derived(data.liveMeta);
</script>

<section class="w-full px-6 pt-4 pb-10 md:pt-6">
	<div class="max-w-2xl mx-auto">
		<!-- Header -->
		<div class="text-center mb-6 md:mb-12">
			<div class="flex justify-center mb-3 md:mb-5">
				<!-- Audio waveform icon -->
				<svg width="32" height="28" viewBox="0 0 32 28" fill="none">
					<rect x="0" y="8" width="4" height="12" rx="2" fill="#FF880C" fill-opacity="0.3">
						<animate attributeName="height" values="12;20;12" dur="1.2s" repeatCount="indefinite" />
						<animate attributeName="y" values="8;4;8" dur="1.2s" repeatCount="indefinite" />
					</rect>
					<rect x="7" y="4" width="4" height="20" rx="2" fill="#FF880C" fill-opacity="0.4">
						<animate attributeName="height" values="20;10;20" dur="1s" repeatCount="indefinite" />
						<animate attributeName="y" values="4;9;4" dur="1s" repeatCount="indefinite" />
					</rect>
					<rect x="14" y="2" width="4" height="24" rx="2" fill="#FF880C" fill-opacity="0.5">
						<animate attributeName="height" values="24;14;24" dur="1.4s" repeatCount="indefinite" />
						<animate attributeName="y" values="2;7;2" dur="1.4s" repeatCount="indefinite" />
					</rect>
					<rect x="21" y="6" width="4" height="16" rx="2" fill="#FF880C" fill-opacity="0.4">
						<animate attributeName="height" values="16;22;16" dur="1.1s" repeatCount="indefinite" />
						<animate attributeName="y" values="6;3;6" dur="1.1s" repeatCount="indefinite" />
					</rect>
					<rect x="28" y="9" width="4" height="10" rx="2" fill="#FF880C" fill-opacity="0.3">
						<animate attributeName="height" values="10;18;10" dur="1.3s" repeatCount="indefinite" />
						<animate attributeName="y" values="9;5;9" dur="1.3s" repeatCount="indefinite" />
					</rect>
				</svg>
			</div>
			<p
				class="text-[10px] font-semibold uppercase tracking-[0.3em] text-missionnaire mb-3 font-body"
			>
				{$t('live.page.kicker')}
			</p>
			<h1 class="font-display text-4xl md:text-5xl font-semibold tracking-tight leading-[1.05] text-stone-900">
				{$t('live.page.title')}
			</h1>
			<p
				class="mt-2 md:mt-3 text-[13px] md:text-[15px] text-stone-400 font-body font-light max-w-md mx-auto leading-relaxed"
			>
				{$t('live.page.subtitle')}
			</p>
		</div>

		<!-- Player -->
		<LiveRadioPlayer />

		<!-- Share the live stream with others -->
		<ShareLive
			liveSessionId={data.liveSessionId}
			title={liveMeta?.title ? `🔴 ${liveMeta.title}` : $t('live.page.shareTitle')}
			text={liveMeta?.title
				? $t('live.shareLiveText', { title: liveMeta.title })
				: $t('live.page.shareText')}
		/>

		<!-- Recent recordings -->
		<RecentRecordings recordings={data.recentRecordings} />

		<!-- Notification opt-in -->
		<button
			onclick={() => bellRef?.toggle()}
			class="flex items-center gap-4 w-full text-left border-2 px-5 py-4 mt-6 transition-all duration-300 active:scale-[0.98] cursor-pointer group {bellSubscribed
				? 'border-missionnaire bg-orange-50/70'
				: 'border-stone-200/60 bg-white/40 hover:border-missionnaire/30 hover:bg-missionnaire/5 hover:-translate-y-0.5 hover:shadow-sm'}"
		>
			<div
				class="w-10 h-10 flex items-center justify-center shrink-0 border transition-colors duration-300 {bellSubscribed
					? 'border-missionnaire/60 bg-white text-missionnaire'
					: 'border-stone-200/60 text-stone-400 group-hover:border-missionnaire/30 group-hover:text-missionnaire'}"
			>
				<NotificationBell bind:this={bellRef} bind:isSubscribed={bellSubscribed} />
			</div>
			<div class="font-body flex-1 min-w-0">
				{#if bellSubscribed}
					<p class="text-sm font-semibold text-missionnaire">{$t('live.notif.disableTitle')}</p>
					<p class="text-[11px] text-stone-400 mt-0.5">{$t('live.notif.enabledSubtitle')}</p>
				{:else}
					<p
						class="text-sm font-semibold text-stone-700 group-hover:text-missionnaire transition-colors"
					>
						{$t('live.notif.enableTitle')}
					</p>
					<p class="text-[11px] text-stone-400 mt-0.5">
						{$t('live.notif.enableSubtitle')}
					</p>
				{/if}
			</div>
			<span
				class="text-[11px] font-bold uppercase tracking-[0.15em] font-body shrink-0 transition-colors duration-300 {bellSubscribed
					? 'text-white bg-missionnaire px-2.5 py-1 rounded-full'
					: 'text-stone-300 group-hover:text-missionnaire'}"
			>
				{bellSubscribed ? $t('live.notif.on') : $t('live.notif.activate')}
			</span>
		</button>

		<!-- Info when offline -->
		<div class="mt-8 text-center">
			<p class="ornament-line text-stone-200 mb-6">
				<svg width="10" height="10" viewBox="0 0 14 14" fill="none"
					><path
						d="M7 0L8.5 5.5L14 7L8.5 8.5L7 14L5.5 8.5L0 7L5.5 5.5L7 0Z"
						fill="currentColor"
					/></svg
				>
			</p>
			<p class="font-display text-lg italic text-stone-400 leading-relaxed">
				{$t('live.verse')}
			</p>
			<p
				class="text-[11px] font-bold uppercase tracking-[0.25em] text-missionnaire/60 mt-2 font-body"
			>
				{$t('live.verseRef')}
			</p>
		</div>
	</div>
</section>
