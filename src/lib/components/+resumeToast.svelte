<script lang="ts">
	import { browser } from '$app/environment';
	import { onDestroy, onMount } from 'svelte';
	import {
		activeAudioElement,
		clearResumeState,
		isResumeEligible,
		readResumeState,
		type ResumeState
	} from '$lib/utils/audioResume';
	import {
		basePlaylist,
		currentIndex,
		isPlaying,
		playlist,
		selectAudio
	} from '$lib/stores/global';
	import { dispatchAudioPlayerAction } from '$lib/utils/audioPlayerControls';
	import { getPlayableAudioUrl, type PlayableAudio } from '../../utils/audioPlayback';

	// Resolve the current audio URL from the global player state. Driving the
	// toast straight off `$selectAudio` (instead of a per-page prop) lets it
	// surface anywhere under /predications, including the list page where
	// playback most often starts.
	$: currentAudioUrl = getPlayableAudioUrl($selectAudio) || null;

	const AUTO_DISMISS_MS = 15000;
	const SESSION_DISMISS_PREFIX = 'missionnaire:resume-dismissed:';

	let visible = false;
	let resumeTime = 0;
	let resumeDuration = 0;
	let progressPercent = 0;
	let savedAudioUrl: string | null = null;
	let savedSermon: Record<string, unknown> | null = null;
	let savedTitle = '';
	let autoDismissTimer: ReturnType<typeof setTimeout> | null = null;
	let currentAudio: HTMLAudioElement | null = null;
	let pendingResumeSeek = false;
	// Per-component flag, NOT persisted: once the listener has clicked Reprendre
	// in this mounted instance, don't bounce the toast back when the resulting
	// $selectAudio / $isPlaying changes re-trigger the reactive eligibility
	// check. It naturally clears on remount (page reload, leaving and re-
	// entering /predications), so the listener still sees the toast next time.
	let justResumed = false;

	const audioUnsub = activeAudioElement.subscribe((el) => {
		currentAudio = el;
		if (pendingResumeSeek && el) {
			applyResumeSeek(el);
		}
	});

	function dismissKey(u: string) {
		return `${SESSION_DISMISS_PREFIX}${u}`;
	}

	function wasDismissedThisSession(u: string): boolean {
		if (!browser) return false;
		try {
			return sessionStorage.getItem(dismissKey(u)) === '1';
		} catch {
			return false;
		}
	}

	function markDismissedThisSession(u: string) {
		if (!browser) return;
		try {
			sessionStorage.setItem(dismissKey(u), '1');
		} catch {
			// no-op
		}
	}

	function pickSavedTitle(sermon: Record<string, unknown>): string {
		const fr = sermon.french_title;
		const en = sermon.english_title;
		if (typeof fr === 'string' && fr.trim()) return fr;
		if (typeof en === 'string' && en.trim()) return en;
		return 'cette prédication';
	}

	function showToast(state: ResumeState) {
		resumeTime = state.time;
		resumeDuration = state.duration;
		savedAudioUrl = state.audioUrl;
		savedSermon = state.sermon;
		savedTitle = pickSavedTitle(state.sermon);
		progressPercent =
			resumeDuration > 0 ? Math.min(100, (resumeTime / resumeDuration) * 100) : 0;
		visible = true;

		if (autoDismissTimer) clearTimeout(autoDismissTimer);
		autoDismissTimer = setTimeout(() => {
			visible = false;
		}, AUTO_DISMISS_MS);
	}

	function hideToast() {
		visible = false;
		if (autoDismissTimer) {
			clearTimeout(autoDismissTimer);
			autoDismissTimer = null;
		}
	}

	function applyResumeSeek(el: HTMLAudioElement) {
		if (!pendingResumeSeek) return;
		// If metadata isn't ready, currentTime assignments silently clamp to 0;
		// wait for `loadedmetadata` so the seek lands at the saved position.
		if (Number.isFinite(el.duration) && el.duration > 0) {
			try {
				el.currentTime = resumeTime;
			} catch {
				// out-of-range seeks throw on some browsers
			}
			pendingResumeSeek = false;
			return;
		}
		const onMeta = () => {
			el.removeEventListener('loadedmetadata', onMeta);
			try {
				el.currentTime = resumeTime;
			} catch {
				// no-op
			}
			pendingResumeSeek = false;
		};
		el.addEventListener('loadedmetadata', onMeta);
	}

	function onResumeClick() {
		hideToast();
		pendingResumeSeek = true;
		justResumed = true;

		// Cold-load case: nothing in $selectAudio yet (user closed the tab and
		// reopened to /predications). Re-prime the global player from the saved
		// sermon snapshot so the audio element gets created and the seek lands.
		if (!currentAudioUrl && savedSermon) {
			const sermonItem = savedSermon as PlayableAudio;
			basePlaylist.set([sermonItem]);
			playlist.set([sermonItem]);
			currentIndex.set(0);
			selectAudio.set(sermonItem);
			isPlaying.set(true);
			return;
		}

		if (currentAudio) {
			applyResumeSeek(currentAudio);
		}
		if (!$isPlaying) {
			dispatchAudioPlayerAction('play');
		}
	}

	function onDismissClick() {
		hideToast();
		clearResumeState();
		const url = savedAudioUrl ?? currentAudioUrl;
		if (url) {
			markDismissedThisSession(url);
		}
	}

	function checkEligibility() {
		if (!browser) {
			hideToast();
			return;
		}
		// In-flight Resume click: the reactive block re-runs as $selectAudio /
		// $isPlaying flip, and without this we'd bounce the toast right back.
		// Cleared naturally on remount, so navigating away and returning still
		// surfaces the prompt.
		if (justResumed) {
			hideToast();
			return;
		}
		const state = readResumeState();
		if (!state) {
			hideToast();
			return;
		}
		if (wasDismissedThisSession(state.audioUrl)) {
			hideToast();
			return;
		}
		if (!isResumeEligible(state, currentAudioUrl)) {
			hideToast();
			return;
		}
		showToast(state);
	}

	// Re-evaluate whenever the live URL changes. Runs on initial render, which
	// covers the cold-load case where `currentAudioUrl` is null but a saved
	// state exists.
	$: if (browser) {
		void currentAudioUrl;
		checkEligibility();
	}

	function formatTime(seconds: number): string {
		if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
		const total = Math.floor(seconds);
		const m = Math.floor(total / 60);
		const s = total % 60;
		return `${m}:${s.toString().padStart(2, '0')}`;
	}

	onMount(() => {
		// One pass at mount in case audioUrl was already truthy when the
		// reactive block first evaluated (the assignment fires only on change).
		checkEligibility();
	});

	onDestroy(() => {
		if (autoDismissTimer) clearTimeout(autoDismissTimer);
		audioUnsub();
	});
</script>

{#if visible}
	<div class="resume-toast" role="status" aria-live="polite">
		<div class="resume-toast__accent"></div>
		<button
			type="button"
			class="resume-toast__close"
			on:click={onDismissClick}
			aria-label="Ignorer"
		>
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
				<path d="M6 6l12 12M6 18L18 6" />
			</svg>
		</button>

		<p class="resume-toast__eyebrow font-body">Reprendre l'écoute</p>
		<h3 class="resume-toast__title font-display" title={savedTitle}>{savedTitle}</h3>
		<p class="resume-toast__meta font-body">
			Vous étiez à <span class="resume-toast__time">{formatTime(resumeTime)}</span>
		</p>

		<div
			class="resume-toast__progress"
			role="progressbar"
			aria-valuenow={Math.round(progressPercent)}
			aria-valuemin="0"
			aria-valuemax="100"
		>
			<div class="resume-toast__progress-fill" style="width: {progressPercent}%"></div>
		</div>

		<div class="resume-toast__actions">
			<button
				type="button"
				class="resume-toast__btn-primary font-body"
				on:click={onResumeClick}
			>
				Reprendre
			</button>
			<button
				type="button"
				class="resume-toast__btn-secondary font-body"
				on:click={onDismissClick}
			>
				Ignorer
			</button>
		</div>
	</div>
{/if}

<style>
	.resume-toast {
		position: fixed;
		left: 50%;
		transform: translateX(-50%);
		bottom: calc(20px + var(--audio-player-height, 0px));
		z-index: 9998;
		width: calc(100vw - 32px);
		max-width: 360px;
		padding: 20px 22px 18px;
		background: #faf8f3;
		color: #1c1917;
		border: 1px solid rgba(231, 229, 228, 0.6);
		box-shadow: 0 18px 40px -16px rgba(28, 25, 23, 0.18);
		animation: resume-toast-in 0.35s cubic-bezier(0.16, 1, 0.3, 1) both;
	}
	.resume-toast__accent {
		position: absolute;
		top: 0;
		left: 24px;
		right: 24px;
		height: 2px;
		background: linear-gradient(
			to right,
			transparent,
			#ff880c,
			transparent
		);
	}
	.resume-toast__close {
		position: absolute;
		top: 12px;
		right: 12px;
		width: 28px;
		height: 28px;
		display: flex;
		align-items: center;
		justify-content: center;
		appearance: none;
		background: transparent;
		border: none;
		color: rgb(214, 211, 209);
		cursor: pointer;
		transition: color 0.2s ease;
	}
	.resume-toast__close:hover {
		color: rgb(120, 113, 108);
	}
	.resume-toast__close svg {
		width: 14px;
		height: 14px;
	}
	.resume-toast__eyebrow {
		font-size: 9px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.3em;
		color: #ff880c;
		margin: 0 0 6px;
	}
	.resume-toast__title {
		font-size: 18px;
		font-weight: 600;
		line-height: 1.25;
		color: rgb(28, 25, 23);
		margin: 0;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		word-break: break-word;
	}
	.resume-toast__meta {
		font-size: 12px;
		color: rgb(120, 113, 108);
		margin: 8px 0 14px;
	}
	.resume-toast__time {
		color: rgb(68, 64, 60);
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}
	.resume-toast__progress {
		height: 3px;
		width: 100%;
		background: rgba(231, 229, 228, 0.8);
		overflow: hidden;
		margin-bottom: 16px;
	}
	.resume-toast__progress-fill {
		height: 100%;
		background: #ff880c;
		transition: width 0.3s ease;
	}
	.resume-toast__actions {
		display: flex;
		gap: 10px;
	}
	.resume-toast__btn-primary,
	.resume-toast__btn-secondary {
		appearance: none;
		font-size: 11px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		padding: 9px 16px;
		cursor: pointer;
		transition: background-color 0.15s ease, color 0.15s ease,
			border-color 0.15s ease;
	}
	.resume-toast__btn-primary {
		background: rgb(28, 25, 23);
		color: #fff;
		border: 1px solid rgb(28, 25, 23);
		flex: 1;
	}
	.resume-toast__btn-primary:hover {
		background: rgb(41, 37, 36);
	}
	.resume-toast__btn-secondary {
		background: transparent;
		color: rgb(120, 113, 108);
		border: 1px solid rgba(231, 229, 228, 0.8);
	}
	.resume-toast__btn-secondary:hover {
		border-color: #ff880c;
		color: #ff880c;
	}
	@keyframes resume-toast-in {
		from {
			opacity: 0;
			transform: translate(-50%, 12px);
		}
		to {
			opacity: 1;
			transform: translate(-50%, 0);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.resume-toast {
			animation: none;
		}
	}
</style>
