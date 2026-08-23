<script lang="ts">
	// Transport for a media source, under the preview where OBS keeps its source
	// toolbar. It was in the Properties dialog, which is the wrong place for it:
	// a recording is paused and wound back *while the service is running*, and
	// nobody opens a modal to do that with a congregation waiting.

	import Icon from './Icon.svelte';
	import { t } from '../lib/i18n.svelte';
	import { clampTime, handleFor, mediaVersion, shownDuration } from '../lib/media.svelte';
	import { followMedia, lyrics } from '../lib/lyrics.svelte';
	import { isStreaming } from '../lib/broadcast.svelte';
	import { markProgrammeRecordingStarted, startCloudRecording } from '../lib/recording.svelte';
	import { programScene, selectedLayer, type Layer } from '../lib/state.svelte';

	/** The recording this bar drives: whichever media source is selected, else
	 *  the first one on air. ponytail: first wins — give it a picker if a
	 *  service ever runs two recordings in one scene. */
	const layer = $derived.by((): Layer | null => {
		const selected = selectedLayer();
		if (selected?.kind === 'video') return selected;
		return programScene().layers.find((l) => l.kind === 'video') ?? null;
	});

	let position = $state(0);
	let duration = $state(0);
	let playing = $state(false);
	let element = $state<HTMLVideoElement | null>(null);
	/** Held while the operator drags, so the poll below cannot yank the thumb
	 *  back to where the track happens to be mid-scrub. */
	let scrubbing = $state(false);

	$effect(() => {
		void mediaVersion.n;
		const id = layer?.id;
		const timer = setInterval(() => {
			const el = id ? handleFor(id)?.el : null;
			element = el instanceof HTMLVideoElement ? el : null;
			if (!element) {
				position = duration = 0;
				playing = false;
				return;
			}
			if (!scrubbing) position = element.currentTime;
			// The link's own length wins where there is one: WebKit doubles it for
			// a streamed audio track, which would put the end of the song at the
			// middle of this bar.
			duration = shownDuration(layer?.duration, element.duration);
			playing = !element.paused && !element.ended;
		}, 100);
		return () => clearInterval(timer);
	});

	// A timed SRT selected alongside an audio/video source belongs to that
	// source. Starting it should never require a second "follow" click: its
	// own clock also covers pause, seek and resume automatically.
	$effect(() => {
		const source = element;
		const sourceId = layer?.id;
		if (!source || !sourceId || lyrics.mode !== 'timed' || lyrics.cues.length === 0) return;
		const sync = () => followMedia(sourceId);
		source.addEventListener('play', sync);
		if (!source.paused) sync();
		return () => source.removeEventListener('play', sync);
	});

	function seek(seconds: number) {
		if (!element) return;
		// Clamped against the length shown, not the element's — otherwise a
		// streamed track lets you scrub into a second half that does not exist.
		element.currentTime = clampTime(seconds, duration || element.duration);
		position = element.currentTime;
	}

	const skip = (delta: number) => seek((element?.currentTime ?? 0) + delta);

	function toggle() {
		if (!element) return;
		if (element.paused) {
			if (lyrics.mode === 'timed' && lyrics.cues.length > 0) {
				followMedia(layer!.id);
				if (isStreaming()) {
					markProgrammeRecordingStarted();
					void startCloudRecording();
				}
			}
			void element.play();
		}
		else element.pause();
		playing = !element.paused;
	}

	/** m:ss, and h:mm:ss once a recording is long enough to need it — a sermon
	 *  runs past the hour and "63:20" is a worse answer than "1:03:20". */
	function clock(seconds: number): string {
		if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
		const total = Math.floor(seconds);
		const s = String(total % 60).padStart(2, '0');
		const m = Math.floor(total / 60) % 60;
		const h = Math.floor(total / 3600);
		return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
	}

	const remaining = $derived(Math.max(0, duration - position));
	const following = $derived(Boolean(layer) && lyrics.followLayerId === layer?.id);
</script>

{#if layer}
	<div
		class="flex h-12 shrink-0 items-center gap-3 border-t border-ink-700 bg-ink-900 px-5"
		aria-label={t('media.transport')}
	>
		<Icon name={layer.audioOnly ? 'music' : 'film'} size={14} class="text-fg/35" />
		<span class="min-w-0 max-w-[14rem] shrink truncate text-[12px] text-fg/70">
			{layer.fileName || layer.name}
		</span>
		{#if !element}
			<!-- Neither a blob nor a signed link survives a restart, so the source
			     has to be fetched again. Dead controls with no reason given is the
			     worst version of that — and the two need different actions. -->
			<span class="shrink-0 text-[11px] text-amber-400/80">
				{layer.url ? t('media.needsLink') : t('media.needsFile')}
			</span>
		{/if}

		<button
			class="studio-icon-btn h-8 w-8 text-fg/55"
			title={t('media.back')}
			aria-label={t('media.back')}
			disabled={!element}
			onclick={() => skip(-10)}
		>
			<span class="font-mono text-[10px] tracking-tight">−10</span>
		</button>
		<button
			class="flex h-8 w-8 shrink-0 items-center justify-center bg-primary text-black transition-colors hover:bg-missionnaire-400 disabled:cursor-not-allowed disabled:bg-ink-700 disabled:text-fg/25"
			title={playing ? t('props.pause') : t('props.play')}
			aria-label={playing ? t('props.pause') : t('props.play')}
			disabled={!element}
			onclick={toggle}
		>
			<Icon name={playing ? 'pause' : 'play'} size={15} strokeWidth={playing ? 2 : 1.5} />
		</button>
		<button
			class="studio-icon-btn h-8 w-8 text-fg/55"
			title={t('media.forward')}
			aria-label={t('media.forward')}
			disabled={!element}
			onclick={() => skip(10)}
		>
			<span class="font-mono text-[10px] tracking-tight">+10</span>
		</button>

		<span class="w-14 shrink-0 text-right font-mono text-[11px] tabular-nums text-fg/70">
			{clock(position)}
		</span>
		<input
			type="range"
			min="0"
			max={Math.max(1, duration)}
			step="0.1"
			class="studio-scrub min-w-0 flex-1"
			style="--played: {duration > 0 ? (position / duration) * 100 : 0}%"
			aria-label={t('media.scrub')}
			value={position}
			disabled={!element}
			onpointerdown={() => (scrubbing = true)}
			onpointerup={() => (scrubbing = false)}
			oninput={(e) => seek(Number((e.currentTarget as HTMLInputElement).value))}
		/>
		<span class="w-14 shrink-0 font-mono text-[11px] tabular-nums text-fg/35">
			−{clock(remaining)}
		</span>

		<button
			class="studio-chip {element?.loop ? 'border-primary/40 bg-primary/15 text-primary' : ''}"
			title={t('props.loop')}
			aria-label={t('props.loop')}
			aria-pressed={Boolean(element?.loop)}
			disabled={!element}
			onclick={() => {
				if (element) element.loop = !element.loop;
			}}
		>
			<Icon name="repeat" size={13} />
		</button>
		<button
			class="studio-chip {following ? 'border-primary/40 bg-primary/15 text-primary' : ''}"
			title={t('props.followLyricsHint')}
			aria-pressed={following}
			disabled={!layer}
			onclick={() => followMedia(following ? null : layer.id)}
		>
			{t('media.followShort')}
		</button>
	</div>
{/if}
