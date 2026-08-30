<script lang="ts">
	// Add a YouTube link as a media source. Nothing is downloaded: the app works
	// out the direct address and the element plays it through the `ytstream`
	// proxy, which adds the CORS header googlevideo never sends. Without that
	// the first frame drawn would taint the program canvas and captureStream()
	// would throw mid-broadcast. See src-tauri/src/fetch.rs.

	import { invoke } from '@tauri-apps/api/core';
	import Icon from './Icon.svelte';
	import Modal from './Modal.svelte';
	import { t } from '../lib/i18n.svelte';

	interface Resolved {
		token: string;
		title: string;
		duration: number;
		reduced: boolean;
	}

	let { onclose, onready }: {
		onclose: () => void;
		onready: (found: Resolved, url: string, audioOnly: boolean) => void;
	} = $props();

	let url = $state('');
	/** Audio by default: playing a song from YouTube is the common errand, and
	 *  sound is the one thing a link always streams at full quality. */
	let audioOnly = $state(true);
	let busy = $state(false);
	let error = $state<string | null>(null);

	async function add() {
		if (!url.trim() || busy) return;
		busy = true;
		error = null;
		try {
			const found = await invoke<Resolved>('resolve_media', {
				url: url.trim(),
				audioOnly
			});
			onready(found, url.trim(), audioOnly);
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
			<!-- svelte-ignore a11y_autofocus -- the dialog exists to take this one value -->
			<input
				class="studio-input"
				type="url"
				inputmode="url"
				autofocus
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

		{#if error}
			<!-- Same treatment as the title bar's error strip, so a failure here reads
			     as the same kind of event it does everywhere else in the app. -->
			<p class="border border-red-500/30 bg-red-950/40 px-3 py-2 text-[12px] leading-relaxed text-red-300">
				{error}
			</p>
		{:else}
			<p class="text-[12px] leading-relaxed text-fg/45">
				{audioOnly ? t('web.hintAudio') : t('web.hintVideo')}
			</p>
		{/if}

		<div class="flex items-center justify-end gap-2 border-t border-ink-700 pt-4">
			<button class="studio-chip px-3" onclick={onclose}>{t('common.cancel')}</button>
			<button class="studio-btn-primary" disabled={busy || !url.trim()} onclick={add}>
				{busy ? t('web.reading') : t('web.add')}
			</button>
		</div>
	</div>
</Modal>
