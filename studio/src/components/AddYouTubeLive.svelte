<script lang="ts">
	import { invoke } from '@tauri-apps/api/core';
	import { t } from '../lib/i18n.svelte';
	import { youtubeChatUrl, youtubePlayerUrl, youtubeVideoId } from '../lib/youtube';
	import Modal from './Modal.svelte';

	let { onclose, onready }: { onclose: () => void; onready: (url: string) => void } = $props();

	let value = $state('');
	let opened = $state(false);
	let error = $state<string | null>(null);
	const videoId = $derived(youtubeVideoId(value));
	const playerUrl = $derived(videoId ? youtubePlayerUrl(videoId) : null);

	async function openPlayer() {
		if (!playerUrl) return;
		error = null;
		try {
			await invoke('open_url', { url: playerUrl });
			opened = true;
		} catch (reason) {
			error = String(reason);
		}
	}

	async function openChat() {
		if (!videoId) return;
		error = null;
		try {
			await invoke('open_youtube_chat', { url: youtubeChatUrl(videoId) });
		} catch (reason) {
			error = String(reason);
		}
	}
</script>

<Modal title={t('youtubeLive.title')} {onclose}>
	<div class="flex flex-col gap-4 p-5">
		<label class="flex flex-col gap-2">
			<span class="text-[11px] uppercase tracking-[0.14em] text-fg/45">{t('youtubeLive.url')}</span>
			<!-- svelte-ignore a11y_autofocus -- this modal exists to accept this one URL -->
			<input
				class="studio-input"
				type="url"
				inputmode="url"
				autofocus
				placeholder="https://www.youtube.com/live/…"
				bind:value
				oninput={() => {
					opened = false;
					error = null;
				}}
			/>
		</label>

		<p class="text-[12px] leading-relaxed text-fg/50">{t('youtubeLive.hint')}</p>
		{#if value.trim() && !videoId}
			<p class="border border-red-500/30 bg-red-950/40 px-3 py-2 text-[12px] text-red-300">
				{t('youtubeLive.invalid')}
			</p>
		{:else if error}
			<p class="border border-red-500/30 bg-red-950/40 px-3 py-2 text-[12px] text-red-300">
				{error}
			</p>
		{/if}

		<div class="grid grid-cols-2 gap-2">
			<button class="studio-chip justify-center" disabled={!videoId} onclick={openPlayer}>
				{opened ? t('youtubeLive.playerOpened') : t('youtubeLive.openPlayer')}
			</button>
			<button class="studio-chip justify-center" disabled={!videoId} onclick={openChat}>
				{t('youtubeLive.openChat')}
			</button>
		</div>

		{#if opened}
			<p
				class="border border-primary/25 bg-primary/10 px-3 py-2 text-[12px] leading-relaxed text-fg/70"
			>
				{t('youtubeLive.captureHint')}
			</p>
		{/if}

		<div class="flex items-center justify-end gap-2 border-t border-ink-700 pt-4">
			<button class="studio-chip px-3" onclick={onclose}>{t('common.cancel')}</button>
			<button
				class="studio-btn-primary"
				disabled={!playerUrl || !opened}
				onclick={() => playerUrl && onready(playerUrl)}
			>
				{t('youtubeLive.capture')}
			</button>
		</div>
	</div>
</Modal>
