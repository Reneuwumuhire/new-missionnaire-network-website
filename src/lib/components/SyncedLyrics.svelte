<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { formatTime } from '../../utils/FormatTime';
	import { t } from '../../i18n';

	type LyricLine =
		| string
		| {
				text?: unknown;
				line?: unknown;
				lyrics?: unknown;
				content?: unknown;
				start?: unknown;
				start_time?: unknown;
				startTime?: unknown;
				time?: unknown;
				timestamp?: unknown;
				end?: unknown;
				end_time?: unknown;
				endTime?: unknown;
				kind?: unknown;
				role?: unknown;
				section_label?: unknown;
				section_title?: unknown;
				verse_number?: unknown;
		  };

	// Opt-in (used by the live transcript): a deliberate user scroll pauses
	// auto-follow so long texts can be read back; a sticky pill jumps back to
	// the current line and resumes following. Music lyrics keep the always-
	// follow behavior. Only wheel/touchmove count as "user scroll" — they
	
	// Fill-parent sizing + large type at ALL viewport widths — for the
	// transcript's fullscreen reading overlay. Keeps the default light palette
	// (dark text) so no dark theme is forced on the reader. (fullscreenMobile
	// goes dark under 768px, which is what the music drawer wants.)

	interface Props {
		lines?: LyricLine[];
		currentTime?: number;
		fullscreenMobile?: boolean;
		// never fire from our programmatic panel scroll, so no flag juggling.
		pauseOnUserScroll?: boolean;
		fullscreenLarge?: boolean;
		onseek?: (detail: { time: number }) => void;
	}

	let {
		lines = [],
		currentTime = 0,
		fullscreenMobile = false,
		pauseOnUserScroll = false,
		fullscreenLarge = false,
		onseek
	}: Props = $props();

	let panelElement: HTMLDivElement | undefined = $state();
	let lineElements: Array<HTMLButtonElement | HTMLDivElement | null> = $state([]);
	let activeLineIndex = $state(-1);
	let previousActiveLineIndex = $state(-1);
	let prefersReducedMotion = $state(false);
	let userScrolled = $state(false);
	// Which way the "back to current line" pill arrow points: down when the
	// live passage is below the reader's viewport (they scrolled up to read
	// earlier text), up when it's above (they scrolled ahead).
	let arrowPointsDown = $state(true);

	function updateScrollDirection() {
		const active = lineElements[activeLineIndex];
		if (!active || !panelElement) return;
		const panelRect = panelElement.getBoundingClientRect();
		const activeRect = active.getBoundingClientRect();
		const activeCenter = activeRect.top + activeRect.height / 2;
		const panelCenter = panelRect.top + panelRect.height / 2;
		// Active line below the viewport centre → reader is above it → point
		// down so the arrow leads them toward the live passage (and vice-versa).
		arrowPointsDown = activeCenter >= panelCenter;
	}

	function onUserScroll() {
		if (!pauseOnUserScroll) return;
		userScrolled = true;
		updateScrollDirection();
	}

	/** Center the active line WITHIN the panel's own scroll area only. We avoid
	 *  element.scrollIntoView() because it scrolls every scrollable ancestor —
	 *  including the document — which yanks the whole page as the passage
	 *  advances. Scrolling just the panel keeps the page where the reader left
	 *  it. */
	function scrollActiveLineIntoPanel(smooth: boolean) {
		const el = lineElements[activeLineIndex];
		if (!el || !panelElement) return;
		const panelRect = panelElement.getBoundingClientRect();
		const elRect = el.getBoundingClientRect();
		const delta = elRect.top + elRect.height / 2 - (panelRect.top + panelRect.height / 2);
		panelElement.scrollTo({
			top: panelElement.scrollTop + delta,
			behavior: smooth ? 'smooth' : 'auto'
		});
	}

	function resumeAutoScroll() {
		userScrolled = false;
		scrollActiveLineIntoPanel(!prefersReducedMotion);
	}

	function coerceSeconds(value: unknown): number | null {
		if (typeof value === 'number' && Number.isFinite(value)) return value;
		if (typeof value !== 'string') return null;

		const trimmed = value.trim();
		if (!trimmed) return null;

		const directNumber = Number(trimmed);
		if (Number.isFinite(directNumber)) return directNumber;

		const parts = trimmed.split(':').map((part) => Number(part));
		if (parts.some((part) => !Number.isFinite(part))) return null;

		if (parts.length === 2) return parts[0] * 60 + parts[1];
		if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
		return null;
	}

	function getLineText(line: LyricLine): string {
		if (typeof line === 'string') return line;
		if (!line || typeof line !== 'object') return '';
		const value = line.text ?? line.line ?? line.lyrics ?? line.content ?? '';
		return typeof value === 'string' ? value : String(value ?? '');
	}

	function getStringField(
		line: LyricLine,
		key: 'kind' | 'role' | 'section_label' | 'section_title'
	) {
		if (!line || typeof line !== 'object') return '';
		const value = line[key];
		return typeof value === 'string' ? value : String(value ?? '');
	}

	function getVerseNumber(line: LyricLine): number | null {
		if (!line || typeof line !== 'object') return null;
		const value = Number(line.verse_number);
		return Number.isFinite(value) && value > 0 ? value : null;
	}

	function isHeading(line: LyricLine) {
		return getStringField(line, 'kind') === 'heading';
	}

	function isChorus(line: LyricLine) {
		const searchable = [
			getLineText(line),
			getStringField(line, 'role'),
			getStringField(line, 'section_label'),
			getStringField(line, 'section_title')
		]
			.join(' ')
			.toLowerCase();

		return /\b(refrain|chorus|choeur|chœur|coro|korasi)\b/.test(searchable);
	}

	function getLineStart(line: LyricLine): number | null {
		if (!line || typeof line !== 'object') return null;
		return coerceSeconds(
			line.start ?? line.start_time ?? line.startTime ?? line.time ?? line.timestamp
		);
	}

	function getLineEnd(line: LyricLine): number | null {
		if (!line || typeof line !== 'object') return null;
		return coerceSeconds(line.end ?? line.end_time ?? line.endTime);
	}

	function findActiveLineIndex(time: number): number {
		let activeIndex = -1;

		for (let index = 0; index < lines.length; index += 1) {
			const start = getLineStart(lines[index]);
			if (start === null || start > time) continue;

			const end = getLineEnd(lines[index]);
			const nextTimedLine = lines.slice(index + 1).find((line) => getLineStart(line) !== null);
			const nextStart = nextTimedLine ? getLineStart(nextTimedLine) : null;

			if ((end === null || time <= end) && (nextStart === null || time < nextStart)) {
				activeIndex = index;
			}
		}

		return activeIndex;
	}

	function seekToLine(line: LyricLine) {
		const start = getLineStart(line);
		if (start === null) return;
		onseek?.({ time: start });
	}

	$effect(() => {
		activeLineIndex = findActiveLineIndex(currentTime);
	});

	$effect(() => {
		// As the live passage advances while the reader is parked elsewhere,
		// the pill's arrow may need to flip (the active line can move from
		// below the viewport to above it).
		void activeLineIndex;
		if (userScrolled) void tick().then(updateScrollDirection);
	});

	$effect(() => {
		if (activeLineIndex !== previousActiveLineIndex) {
			previousActiveLineIndex = activeLineIndex;
			if (activeLineIndex >= 0 && !userScrolled) {
				// Follow within the panel only — never scroll the page.
				void tick().then(() => scrollActiveLineIntoPanel(!prefersReducedMotion));
			}
		}
	});

	onMount(() => {
		const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
		const updateReducedMotion = () => {
			prefersReducedMotion = mediaQuery.matches;
		};

		updateReducedMotion();
		mediaQuery.addEventListener('change', updateReducedMotion);

		return () => {
			mediaQuery.removeEventListener('change', updateReducedMotion);
		};
	});
</script>

<div
	bind:this={panelElement}
	class:fullscreen-mobile={fullscreenMobile}
	class:fullscreen-large={fullscreenLarge}
	class="lyrics-panel"
	role="group"
	aria-label={$t('syncedLyrics.label')}
	onwheel={onUserScroll}
	ontouchmove={onUserScroll}
	onscroll={() => userScrolled && updateScrollDirection()}
>
	{#each lines as line, index}
		{@const start = getLineStart(line)}
		{@const text = getLineText(line)}
		{@const heading = isHeading(line)}
		{@const chorus = isChorus(line)}
		{@const verseNumber = getVerseNumber(line)}
		{#if heading}
			<div
				bind:this={lineElements[index]}
				class="lyric-section"
				class:chorus={chorus}
				class:past={activeLineIndex >= 0 && index < activeLineIndex}
				class:future={activeLineIndex >= 0 && index > activeLineIndex}
			>
				<span class="lyric-section-rule" aria-hidden="true"></span>
				{#if chorus}
					<span class="lyric-section-ornament" aria-hidden="true"></span>
				{/if}
				<span class="lyric-section-label">{text}</span>
				{#if chorus}
					<span class="lyric-section-ornament" aria-hidden="true"></span>
				{/if}
				<span class="lyric-section-rule" aria-hidden="true"></span>
			</div>
		{:else if start !== null}
			<button
				type="button"
				bind:this={lineElements[index]}
				class="lyric-line timed"
				class:active={index === activeLineIndex}
				class:chorus={chorus}
				class:past={activeLineIndex >= 0 && index < activeLineIndex}
				class:future={activeLineIndex >= 0 && index > activeLineIndex}
				onclick={() => seekToLine(line)}
				aria-current={index === activeLineIndex ? 'true' : undefined}
				aria-label={verseNumber !== null
					? `${$t('syncedLyrics.verse', { number: verseNumber })}, ${formatTime(start)} : ${text}`
					: `${formatTime(start)} : ${text}`}
				title={`${formatTime(start)} — ${$t('syncedLyrics.clickToListen')}`}
			>
				<span class="lyric-text">{text}</span>
			</button>
		{:else}
			<div
				bind:this={lineElements[index]}
				class="lyric-line untimed"
				class:chorus={chorus}
				class:past={activeLineIndex >= 0 && index < activeLineIndex}
				class:future={activeLineIndex >= 0 && index > activeLineIndex}
				aria-label={verseNumber !== null
				? `${$t('syncedLyrics.verse', { number: verseNumber })} : ${text}`
				: text}
			>
				<span class="lyric-text">{text}</span>
			</div>
		{/if}
	{/each}
	{#if pauseOnUserScroll && userScrolled && activeLineIndex >= 0}
		<button type="button" class="resume-follow" onclick={resumeAutoScroll}>
			<span aria-hidden="true">{arrowPointsDown ? '↓' : '↑'}</span>
			{$t('syncedLyrics.backToCurrent')}
		</button>
	{/if}
</div>

<style>
	/* ─── Editorial / hymnal lyric view ─────────────────────────────────────
	   Typography-first. No card chrome. The active line is the visual focus —
	   warm glow + serif weight bump + subtle scale. Past/future fade away.
	   Theme: light cream by default; inverts to a darker palette when used in
	   the fullscreen mobile drawer (artwork-blurred backdrop). */

	.lyrics-panel {
		--lyric-color-active: rgb(28 25 23); /* warm stone-900 */
		--lyric-color-default: rgb(120 113 108); /* warm stone-500 */
		--lyric-color-chorus-default: #9a5a1f; /* warm sienna — chorus reads warmer at rest */
		--lyric-color-accent: #c2640c; /* deeper sienna — chorus active state */
		--lyric-chorus-bg: rgba(255, 136, 12, 0.045);
		--lyric-chorus-bg-active: rgba(255, 136, 12, 0.085);
		--lyric-glow-active: rgba(255, 136, 12, 0.32);
		--lyric-rule-color: rgba(120, 113, 108, 0.42);
		--lyric-rule-chorus: rgba(194, 100, 12, 0.65);

		max-height: 42vh;
		overflow-y: auto;
		overscroll-behavior: contain;
		display: flex;
		flex-direction: column;
		gap: 0;
		padding: 0.5rem 0.5rem 1.25rem;
		scroll-padding-block: 38%;
		scrollbar-width: thin;
		scrollbar-color: rgba(168, 162, 158, 0.4) transparent;
	}

	.lyrics-panel::-webkit-scrollbar {
		width: 8px;
	}

	.lyrics-panel::-webkit-scrollbar-thumb {
		background: rgba(168, 162, 158, 0.4);
		border-radius: 999px;
	}

	/* ─── Each lyric line ─────────────────────────────────────────────────
	   The wrapper holds background + scale; opacity dimming happens on the
	   inner .lyric-text so chorus background tints stay legible even when
	   their text is faded. That preserves the song's macro structure when
	   you're scrolling through past/future content. */
	.lyric-line {
		display: block;
		width: 100%;
		margin-top: 0.35rem;
		border: 0;
		background: transparent;
		padding: 0.45rem 1rem;
		color: var(--lyric-color-default);
		text-align: center;
		cursor: default;
		transition:
			color 480ms cubic-bezier(0.16, 1, 0.3, 1),
			background-color 480ms cubic-bezier(0.16, 1, 0.3, 1),
			transform 600ms cubic-bezier(0.16, 1, 0.3, 1),
			text-shadow 600ms cubic-bezier(0.16, 1, 0.3, 1);
	}

	.lyric-line:first-child {
		margin-top: 0;
	}

	.lyric-line.timed {
		cursor: pointer;
	}

	.lyric-text {
		display: inline-block;
		max-width: min(100%, 38rem);
		/* Cormorant Garamond is the site's display serif — gives lyrics a
		   hymnal/liturgical character that distinguishes this from a generic
		   sans-serif music app. Letter-spacing nudged up for breathing room
		   at large weights. */
		font-family: var(--font-display, 'Cormorant Garamond', Georgia, serif);
		font-size: 1.4rem;
		font-weight: 500;
		line-height: 1.5;
		letter-spacing: 0.005em;
		font-feature-settings: 'liga', 'dlig', 'kern';
		transition: opacity 480ms cubic-bezier(0.16, 1, 0.3, 1);
	}

	@media (min-width: 768px) {
		.lyric-text {
			font-size: 1.625rem;
			line-height: 1.55;
		}
	}

	/* ─── Past/future dimming applies to text only, not wrapper ──────────
	   So the chorus background tint persists, keeping song structure
	   visible at any scroll position. */
	.lyric-line.past .lyric-text {
		opacity: 0.34;
	}

	.lyric-line.future .lyric-text {
		opacity: 0.62;
	}

	.lyric-line.timed:hover:not(.active) {
		color: var(--lyric-color-active);
	}

	.lyric-line.timed:hover:not(.active) .lyric-text {
		opacity: 0.92;
	}

	/* ─── Refrain (chorus) lines: italic, warmer color, tinted backdrop ──
	   Adjacent chorus lines merge into one continuous block by collapsing
	   the inter-line margin and rounding only the block's outer corners. */
	.lyric-line.chorus {
		color: var(--lyric-color-chorus-default);
		background-color: var(--lyric-chorus-bg);
	}

	.lyric-line.chorus .lyric-text {
		font-style: italic;
	}

	/* Merge consecutive chorus lines into a single visual block */
	.lyric-line.chorus + .lyric-line.chorus {
		margin-top: 0;
	}

	/* Round only the top corners of the FIRST chorus line in a run */
	.lyric-line.chorus:first-child,
	.lyric-line:not(.chorus) + .lyric-line.chorus,
	.lyric-section + .lyric-line.chorus {
		border-top-left-radius: 0.6rem;
		border-top-right-radius: 0.6rem;
	}

	/* Round only the bottom corners of the LAST chorus line in a run */
	.lyric-line.chorus:last-child,
	.lyric-line.chorus:has(:global(+ .lyric-line:not(.chorus))),
	.lyric-line.chorus:has(:global(+ .lyric-section)) {
		border-bottom-left-radius: 0.6rem;
		border-bottom-right-radius: 0.6rem;
	}

	/* ─── The current line gets the spotlight ──────────────
	   Scale + weight + warm orange glow. Karaoke moment. */
	.lyric-line.active {
		color: var(--lyric-color-active);
		transform: scale(1.025);
		text-shadow:
			0 0 22px var(--lyric-glow-active),
			0 0 1px rgba(255, 136, 12, 0.18);
	}

	.lyric-line.active .lyric-text {
		opacity: 1;
		font-weight: 600;
	}

	.lyric-line.active.chorus {
		color: var(--lyric-color-accent);
		background-color: var(--lyric-chorus-bg-active);
		text-shadow:
			0 0 24px rgba(255, 136, 12, 0.45),
			0 0 1px rgba(255, 136, 12, 0.32);
	}

	/* ─── Section dividers (Refrain, Couplet N) ───────────────────────────
	   Editorial small-caps with hairline rules either side — hymnal style.
	   Chorus dividers get a heavier rule + sienna ornament so the eye
	   instantly catches "here's the refrain block coming up". */
	.lyric-section {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.7rem;
		margin: 1.25rem auto 0.4rem;
		max-width: 26rem;
		padding: 0 1rem;
		text-transform: uppercase;
		transition:
			opacity 480ms cubic-bezier(0.16, 1, 0.3, 1),
			color 480ms cubic-bezier(0.16, 1, 0.3, 1);
	}

	.lyric-section.past {
		opacity: 0.34;
	}

	.lyric-section.future {
		opacity: 0.72;
	}

	.lyric-section-rule {
		flex: 1;
		height: 1px;
		background: linear-gradient(
			to right,
			transparent,
			var(--lyric-rule-color) 50%,
			transparent
		);
	}

	.lyric-section-label {
		flex: 0 0 auto;
		font-family: var(--font-body, 'Outfit', system-ui, sans-serif);
		font-size: 0.62rem;
		font-weight: 800;
		letter-spacing: 0.28em;
		color: var(--lyric-color-default);
	}

	/* CSS-drawn diamond — small rotated square, guaranteed to render
	   identically across platforms (no font subset gamble). Sits flanking
	   the "Refrain" label as a hymnal-style fleuron. */
	.lyric-section-ornament {
		flex: 0 0 auto;
		display: inline-block;
		width: 5px;
		height: 5px;
		background: var(--lyric-color-accent);
		opacity: 0.7;
		transform: rotate(45deg);
	}

	.lyric-section.chorus {
		margin-top: 1.5rem; /* a touch more breathing room above refrains */
	}

	.lyric-section.chorus .lyric-section-label {
		color: var(--lyric-color-accent);
		font-size: 0.68rem;
		letter-spacing: 0.32em;
	}

	.lyric-section.chorus .lyric-section-rule {
		height: 1.5px;
		background: linear-gradient(
			to right,
			transparent,
			var(--lyric-rule-chorus) 50%,
			transparent
		);
	}

	/* ─── Mobile fullscreen overlay theme (dark) ──────────────────────────
	   Inherits all the structure above; just inverts the palette for the
	   blurred-artwork backdrop. */
	@media (max-width: 767px) {
		/* Light mobile theme: dark text on the player's light reading surface —
		   no dark theme forced on the reader. Inherits the default light palette;
		   only sizing/spacing change for the full-screen drawer. */
		.lyrics-panel.fullscreen-mobile {
			max-height: none;
			min-height: 0;
			flex: 1 1 auto;
			padding: 0.5rem 0 3rem;
			scroll-padding-block: 42%;
		}

		.lyrics-panel.fullscreen-mobile .lyric-line {
			margin-top: 0.25rem;
			padding: 0.55rem 0.85rem;
		}

		.lyrics-panel.fullscreen-mobile .lyric-line:first-child {
			margin-top: 0;
		}

		.lyrics-panel.fullscreen-mobile .lyric-line.chorus + .lyric-line.chorus {
			margin-top: 0;
		}

		.lyrics-panel.fullscreen-mobile .lyric-line.past .lyric-text {
			opacity: 0.3;
		}

		.lyrics-panel.fullscreen-mobile .lyric-line.future .lyric-text {
			opacity: 0.55;
		}

		.lyrics-panel.fullscreen-mobile .lyric-text {
			font-size: 1.45rem;
			line-height: 1.5;
		}
	}

	/* ─── Fullscreen overlay reading view (all widths) ────────────────────
	   Keeps the default light palette (dark text on the overlay's light
	   background) so no dark theme is forced on the reader — only the sizing
	   changes to a fill-screen, large-type layout for reading/projection. */
	.lyrics-panel.fullscreen-large {
		max-height: none;
		min-height: 0;
		flex: 1 1 auto;
		/* Extra bottom padding so the last lines clear the floating close bar. */
		padding: 1rem 1rem calc(6.5rem + env(safe-area-inset-bottom, 0px));
		scroll-padding-block: 42%;
	}

	/* Bigger type for reading at a distance (projection / across the room) */
	.lyrics-panel.fullscreen-large .lyric-text {
		max-width: min(100%, 52rem);
		font-size: 1.7rem;
		line-height: 1.55;
	}

	@media (min-width: 768px) {
		.lyrics-panel.fullscreen-large .lyric-text {
			font-size: 2.2rem;
			line-height: 1.6;
		}
	}

	.lyrics-panel.fullscreen-large .lyric-line.past .lyric-text {
		opacity: 0.3;
	}

	.lyrics-panel.fullscreen-large .lyric-line.future .lyric-text {
		opacity: 0.55;
	}

	.lyrics-panel.fullscreen-large .resume-follow {
		/* Sit above the overlay's floating close bar. */
		bottom: calc(4.4rem + env(safe-area-inset-bottom, 0px));
	}

	/* Floating "back to current line" pill — sticky inside the scroll
	   container so it stays visible while the reader browses history. */
	.resume-follow {
		position: sticky;
		bottom: 0.5rem;
		align-self: center;
		margin-top: 0.5rem;
		border: 1px solid rgba(255, 136, 12, 0.4);
		border-radius: 999px;
		background: rgba(255, 251, 245, 0.95);
		padding: 0.45rem 1.1rem;
		font-family: var(--font-body, 'Outfit', system-ui, sans-serif);
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		color: #c2640c;
		box-shadow: 0 2px 10px rgba(0, 0, 0, 0.08);
		cursor: pointer;
		transition: background-color 160ms ease;
	}

	.resume-follow:hover {
		background: rgba(255, 243, 226, 0.98);
	}

	@media (prefers-reduced-motion: reduce) {
		.lyric-line,
		.lyric-section {
			transition:
				color 0ms,
				opacity 0ms;
		}

		.lyric-line.active {
			transform: none;
		}
	}
</style>
