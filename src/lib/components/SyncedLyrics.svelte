<script lang="ts">
	import { createEventDispatcher, onMount, tick } from 'svelte';
	import { formatTime } from '../../utils/FormatTime';

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

	export let lines: LyricLine[] = [];
	export let currentTime = 0;
	export let fullscreenMobile = false;

	const dispatch = createEventDispatcher<{ seek: { time: number } }>();

	let panelElement: HTMLDivElement;
	let lineElements: Array<HTMLButtonElement | HTMLDivElement | null> = [];
	let activeLineIndex = -1;
	let previousActiveLineIndex = -1;
	let prefersReducedMotion = false;

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
		dispatch('seek', { time: start });
	}

	$: activeLineIndex = findActiveLineIndex(currentTime);

	$: if (activeLineIndex !== previousActiveLineIndex) {
		previousActiveLineIndex = activeLineIndex;
		if (activeLineIndex >= 0) {
			void tick().then(() => {
				const activeElement = lineElements[activeLineIndex];
				if (!activeElement || !panelElement) return;
				activeElement.scrollIntoView({
					block: 'center',
					behavior: prefersReducedMotion ? 'auto' : 'smooth'
				});
			});
		}
	}

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
	class="lyrics-panel"
	aria-label="Paroles synchronisées"
>
	{#each lines as line, index}
		{@const start = getLineStart(line)}
		{@const text = getLineText(line)}
		{@const heading = isHeading(line)}
		{@const chorus = isChorus(line)}
		{@const verseNumber = getVerseNumber(line)}
		{#if start !== null}
			<button
				type="button"
				bind:this={lineElements[index]}
				class="lyric-line lyric-row timed"
				class:active={index === activeLineIndex}
				class:chorus-line={chorus}
				class:past={activeLineIndex >= 0 && index < activeLineIndex}
				class:future={activeLineIndex >= 0 && index > activeLineIndex}
				on:click={() => seekToLine(line)}
				aria-current={index === activeLineIndex ? 'true' : undefined}
			>
				<span class="lyric-time">{formatTime(start)}</span>
				{#if verseNumber !== null}
					<span class="lyric-marker has-number" aria-label={`Couplet ${verseNumber}`}>
						{verseNumber}
					</span>
				{:else if !chorus}
					<span class="lyric-marker" aria-hidden="true"></span>
				{/if}
				<span class="lyric-copy">
					{#if chorus}
						<span class="chorus-label">Refrain</span>
					{/if}
					<span>{text}</span>
				</span>
			</button>
		{:else if heading}
			<div
				bind:this={lineElements[index]}
				class="lyric-line lyric-heading"
				class:chorus-line={chorus}
				class:past={activeLineIndex >= 0 && index < activeLineIndex}
				class:future={activeLineIndex >= 0 && index > activeLineIndex}
			>
				{text}
			</div>
		{:else}
			<div
				bind:this={lineElements[index]}
				class="lyric-line lyric-row untimed"
				class:chorus-line={chorus}
				class:past={activeLineIndex >= 0 && index < activeLineIndex}
				class:future={activeLineIndex >= 0 && index > activeLineIndex}
			>
				<span class="lyric-time" aria-hidden="true"></span>
				{#if verseNumber !== null}
					<span class="lyric-marker has-number" aria-label={`Couplet ${verseNumber}`}>
						{verseNumber}
					</span>
				{:else if !chorus}
					<span class="lyric-marker" aria-hidden="true"></span>
				{/if}
				<span class="lyric-copy">
					{#if chorus}
						<span class="chorus-label">Refrain</span>
					{/if}
					<span>{text}</span>
				</span>
			</div>
		{/if}
	{/each}
</div>

<style>
	.lyrics-panel {
		max-height: 42vh;
		overflow-y: auto;
		overscroll-behavior: contain;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.25rem 0.125rem 1rem;
		scroll-padding-block: 35%;
		scrollbar-width: thin;
		scrollbar-color: rgba(168, 162, 158, 0.45) transparent;
	}

	.lyrics-panel::-webkit-scrollbar {
		width: 8px;
	}

	.lyrics-panel::-webkit-scrollbar-thumb {
		background: rgba(168, 162, 158, 0.45);
		border-radius: 999px;
	}

	.lyric-row {
		position: relative;
		display: grid;
		grid-template-areas:
			'. time marker .'
			'copy copy copy copy';
		grid-template-columns: 1fr auto auto 1fr;
		column-gap: 0.45rem;
		row-gap: 0.55rem;
		align-items: center;
		width: 100%;
		border: 1px solid transparent;
		border-radius: 1.1rem;
		background: transparent;
		padding: 0.95rem 1rem;
		color: rgb(120 113 108);
		text-align: center;
		transition:
			background-color 180ms ease,
			border-color 180ms ease,
			box-shadow 180ms ease,
			color 180ms ease,
			transform 180ms ease;
	}

	.lyric-row.timed {
		cursor: pointer;
	}

	.lyric-row.timed:hover {
		background: rgba(255, 255, 255, 0.72);
		color: rgb(68 64 60);
	}

	.lyric-row.chorus-line {
		border-color: rgba(245, 158, 11, 0.12);
		background: rgba(255, 251, 235, 0.56);
	}

	.lyric-row.active {
		border-color: rgba(255, 136, 12, 0.2);
		background: linear-gradient(135deg, rgba(255, 255, 255, 0.96), rgba(255, 247, 237, 0.94));
		box-shadow: 0 18px 45px rgba(120, 113, 108, 0.14);
		color: rgb(28 25 23);
		transform: translateY(-1px);
	}

	.lyric-row.chorus-line.active {
		background: linear-gradient(135deg, rgba(255, 251, 235, 0.98), rgba(255, 237, 213, 0.92));
	}

	.lyric-time {
		grid-area: time;
		color: rgb(168 162 158);
		font-size: 0.68rem;
		font-weight: 800;
		font-variant-numeric: tabular-nums;
		line-height: 1;
	}

	.lyric-row.active .lyric-time {
		color: rgb(194 100 12);
	}

	.untimed .lyric-time {
		display: none;
	}

	.lyric-marker {
		grid-area: marker;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 1.85rem;
		height: 1.85rem;
		border: 1px solid rgb(231 229 228);
		border-radius: 999px;
		background: rgba(250, 250, 249, 0.95);
		color: rgb(120 113 108);
		font-size: 0.78rem;
		font-weight: 900;
		line-height: 1;
		transition:
			background-color 180ms ease,
			border-color 180ms ease,
			color 180ms ease,
			transform 180ms ease;
	}

	.lyric-marker:not(.has-number)::after {
		content: '';
		display: block;
		width: 0.48rem;
		height: 0.48rem;
		border-radius: 999px;
		background: rgb(214 211 209);
	}

	.chorus-line .lyric-marker {
		border-color: rgba(251, 146, 60, 0.28);
		background: rgba(255, 237, 213, 0.8);
		color: rgb(154 83 8);
	}

	.chorus-line .lyric-marker:not(.has-number)::after {
		background: rgb(245 158 11);
	}

	.lyric-row.active .lyric-marker {
		border-color: rgb(139 115 85);
		background: rgb(139 115 85);
		color: white;
		transform: scale(1.08);
	}

	.lyric-row.active .lyric-marker:not(.has-number)::after {
		background: white;
	}

	.lyric-copy {
		grid-area: copy;
		min-width: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.45rem;
		width: min(100%, 44rem);
		margin: 0 auto;
		color: inherit;
		font-size: 1rem;
		font-weight: 600;
		line-height: 1.75;
	}

	.lyric-row.active .lyric-copy {
		font-weight: 700;
	}

	.chorus-label {
		align-self: center;
		border: 1px solid rgba(251, 146, 60, 0.2);
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.7);
		padding: 0.2rem 0.5rem;
		color: rgb(194 100 12);
		font-size: 0.62rem;
		font-weight: 900;
		letter-spacing: 0.14em;
		line-height: 1;
		text-transform: uppercase;
	}

	.lyric-heading {
		margin: 0.45rem 0 0.25rem;
		border-radius: 1rem;
		background: linear-gradient(135deg, rgba(250, 250, 249, 0.95), rgba(245, 245, 244, 0.92));
		padding: 0.95rem 1rem;
		color: rgb(87 83 78);
		text-align: center;
		font-size: 0.82rem;
		font-weight: 900;
		letter-spacing: 0.18em;
		line-height: 1.5;
		text-transform: uppercase;
	}

	.lyric-heading.chorus-line {
		background: rgba(255, 237, 213, 0.68);
		color: rgb(194 100 12);
	}

	@media (min-width: 768px) {
		.lyric-copy {
			font-size: 1.0625rem;
		}
	}

	@media (max-width: 767px) {
		.lyrics-panel.fullscreen-mobile {
			max-height: none;
			min-height: 0;
			flex: 1 1 auto;
			gap: 0.35rem;
			padding: 0.35rem 0 2.75rem;
			scroll-padding-block: 42%;
			scrollbar-color: rgba(255, 255, 255, 0.18) transparent;
		}

		.lyrics-panel.fullscreen-mobile::-webkit-scrollbar-thumb {
			background: rgba(255, 255, 255, 0.18);
		}

		.lyrics-panel.fullscreen-mobile .lyric-row {
			column-gap: 0.4rem;
			row-gap: 0.42rem;
			border-radius: 1.1rem;
			border-color: transparent;
			background: transparent;
			padding: 0.95rem 0.55rem;
			color: rgba(255, 255, 255, 0.56);
			box-shadow: none;
		}

		.lyrics-panel.fullscreen-mobile .lyric-row.timed:hover {
			background: rgba(255, 255, 255, 0.07);
			color: rgba(255, 255, 255, 0.78);
		}

		.lyrics-panel.fullscreen-mobile .lyric-line.past {
			opacity: 0.62;
		}

		.lyrics-panel.fullscreen-mobile .lyric-line.future {
			opacity: 0.42;
		}

		.lyrics-panel.fullscreen-mobile .lyric-row.active {
			border-color: rgba(255, 255, 255, 0.12);
			background: rgba(255, 255, 255, 0.08);
			box-shadow: none;
			color: rgb(255, 255, 255);
			opacity: 1;
			transform: none;
		}

		.lyrics-panel.fullscreen-mobile .lyric-row.chorus-line {
			border-color: transparent;
			background: rgba(255, 255, 255, 0.035);
		}

		.lyrics-panel.fullscreen-mobile .lyric-row.chorus-line.active {
			background: rgba(255, 136, 12, 0.12);
		}

		.lyrics-panel.fullscreen-mobile .lyric-time {
			color: rgba(255, 255, 255, 0.42);
			font-size: 0.64rem;
		}

		.lyrics-panel.fullscreen-mobile .lyric-row.active .lyric-time {
			color: rgba(255, 214, 169, 0.78);
		}

		.lyrics-panel.fullscreen-mobile .lyric-marker {
			border-color: rgba(255, 255, 255, 0.18);
			background: rgba(255, 255, 255, 0.08);
			color: rgba(255, 255, 255, 0.72);
		}

		.lyrics-panel.fullscreen-mobile .lyric-marker:not(.has-number)::after {
			background: rgba(255, 255, 255, 0.34);
		}

		.lyrics-panel.fullscreen-mobile .lyric-row.active .lyric-marker {
			border-color: rgba(255, 136, 12, 0.9);
			background: rgb(255, 136, 12);
			color: white;
		}

		.lyrics-panel.fullscreen-mobile .lyric-copy {
			width: min(100%, 21rem);
			color: inherit;
			font-size: 1.08rem;
			font-weight: 600;
			line-height: 1.62;
		}

		.lyrics-panel.fullscreen-mobile .lyric-row.active .lyric-copy {
			font-weight: 700;
		}

		.lyrics-panel.fullscreen-mobile .chorus-label {
			border-color: rgba(255, 255, 255, 0.14);
			background: rgba(255, 255, 255, 0.1);
			color: rgba(255, 222, 186, 0.92);
		}

		.lyrics-panel.fullscreen-mobile .lyric-heading {
			margin: 0.6rem 0 0.25rem;
			border: 1px solid rgba(255, 255, 255, 0.08);
			border-radius: 1rem;
			background: rgba(255, 255, 255, 0.07);
			padding: 0.85rem 0.9rem;
			color: rgba(255, 255, 255, 0.7);
			font-size: 0.75rem;
			letter-spacing: 0.14em;
		}

		.lyrics-panel.fullscreen-mobile .lyric-heading.chorus-line {
			background: rgba(255, 136, 12, 0.1);
			color: rgba(255, 222, 186, 0.88);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.lyric-line {
			transition: none;
		}
	}
</style>
