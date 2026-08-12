<script lang="ts">
	// Add a YouTube link as a media source. The app downloads it and hands the
	// bytes over; the webview cannot fetch it itself, because googlevideo serves
	// media with no CORS headers and a cross-origin video drawn onto the program
	// canvas taints it — captureStream() then throws and the broadcast stops.
	// See src-tauri/src/fetch.rs.

	import { invoke } from '@tauri-apps/api/core';
	import { listen, type UnlistenFn } from '@tauri-apps/api/event';
	import Icon from './Icon.svelte';
	import Modal from './Modal.svelte';
	import { t } from '../lib/i18n.svelte';

	let { onclose, onready }: {
		onclose: () => void;
		onready: (blob: Blob, title: string, audioOnly: boolean) => void;
	} = $props();

	interface Probed {
		title: string;
		isLive: boolean;
		duration: number;
	}

	let url = $state('');
	/** Audio by default: playing a song from YouTube is the common errand, and
	 *  an audio-only download is one small track instead of a merge. */
	let audioOnly = $state(true);
	let busy = $state(false);
	let percent = $state(0);
	let stage = $state<'download' | 'finish'>('download');
	let error = $state<string | null>(null);
	let title = $state('');

	$effect(() => {
		let stop: UnlistenFn | undefined;
		void listen<{ percent: number; stage: 'download' | 'finish' }>('media-fetch', (event) => {
			percent = event.payload.percent;
			stage = event.payload.stage;
		}).then((fn) => (stop = fn));
		return () => stop?.();
	});

	async function add() {
		if (!url.trim() || busy) return;
		busy = true;
		error = null;
		percent = 0;
		title = '';
		try {
			// Probe first: it names what is about to be added, and it is what stops
			// a live stream from starting a download that would never end.
			const probed = await invoke<Probed>('probe_media', { url: url.trim() });
			title = probed.title;
			if (probed.isLive) {
				error = t('web.liveHint');
				return;
			}
			const buffer = await invoke<ArrayBuffer>('fetch_media', {
				url: url.trim(),
				audioOnly
			});
			onready(
				new Blob([buffer], { type: audioOnly ? 'audio/mp4' : 'video/mp4' }),
				probed.title,
				audioOnly
			);
		} catch (e) {
			error = String(e);
		} finally {
			busy = false;
		}
	}
</script>

<Modal title={t('web.title')} {onclose}>
	<div class="flex flex-col gap-5 p-5">
		<label class="flex flex-col gap-2">
			<span class="text-[11px] uppercase tracking-[0.14em] text-fg/45">{t('web.url')}</span>
			<input
				class="studio-input"
				type="url"
				inputmode="url"
				placeholder="https://www.youtube.com/watch?v=…"
				bind:value={url}
				disabled={busy}
				onkeydown={(e) => e.key === 'Enter' && add()}
			/>
		</label>

		<div class="flex gap-2">
			<button
				class="studio-chip {audioOnly ? 'border-primary/40 bg-primary/15 text-primary' : ''}"
				aria-pressed={audioOnly}
				disabled={busy}
				onclick={() => (audioOnly = true)}
			>
				<Icon name="music" size={13} />
				{t('web.audioOnly')}
			</button>
			<button
				class="studio-chip {audioOnly ? '' : 'border-primary/40 bg-primary/15 text-primary'}"
				aria-pressed={!audioOnly}
				disabled={busy}
				onclick={() => (audioOnly = false)}
			>
				<Icon name="film" size={13} />
				{t('web.withPicture')}
			</button>
		</div>

		{#if busy}
			<div class="flex flex-col gap-2">
				<div class="flex items-baseline justify-between gap-3">
					<span class="min-w-0 truncate text-[12px] text-fg/70">{title || t('web.reading')}</span>
					<span class="shrink-0 font-mono text-[11px] tabular-nums text-fg/45">
						{stage === 'finish' ? t('web.merging') : `${percent.toFixed(0)}%`}
					</span>
				</div>
				<!-- A determinate bar, because yt-dlp reports real progress. The merge
				     at the end has none, so it says so rather than sitting at 100%. -->
				<div class="h-[3px] w-full bg-ink-700">
					<div
						class="h-full bg-primary transition-[width] duration-200 {stage === 'finish'
							? 'animate-pulse'
							: ''}"
						style="width: {stage === 'finish' ? 100 : percent}%"
					></div>
				</div>
			</div>
		{:else if error}
			<!-- Same treatment as the title bar's error strip, so a failure here reads
			     as the same kind of event it does everywhere else in the app. -->
			<p class="border border-red-500/30 bg-red-950/40 px-3 py-2 text-[12px] leading-relaxed text-red-300">
				{error}
			</p>
		{:else}
			<p class="text-[12px] leading-relaxed text-fg/45">{t('web.hint')}</p>
		{/if}

		<div class="flex items-center justify-end gap-2 border-t border-ink-700 pt-4">
			<button class="studio-chip px-3" onclick={onclose}>{t('common.cancel')}</button>
			<button class="studio-btn-primary" disabled={busy || !url.trim()} onclick={add}>
				{busy ? t('web.fetching') : t('web.add')}
			</button>
		</div>
	</div>
</Modal>
