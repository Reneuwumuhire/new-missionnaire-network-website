<script lang="ts">
	import { t } from '../lib/i18n.svelte';

	export type HelpSection = 'getting-started' | 'shortcuts' | 'troubleshooting';

	let {
		section,
		onsection,
		onsettings
	}: {
		section: HelpSection;
		onsection: (section: HelpSection) => void;
		onsettings: (page: 'general' | 'output' | 'about') => void;
	} = $props();

	const sections: { id: HelpSection; label: () => string }[] = [
		{ id: 'getting-started', label: () => t('help.gettingStarted') },
		{ id: 'shortcuts', label: () => t('help.shortcuts') },
		{ id: 'troubleshooting', label: () => t('help.troubleshooting') }
	];
</script>

<div class="flex min-h-[30rem]">
	<nav class="w-44 shrink-0 border-r border-ink-700 bg-ink-850 py-2">
		{#each sections as entry (entry.id)}
			<button
				class="w-full px-3 py-2 text-left text-[13px] transition-colors {section === entry.id
					? 'bg-primary text-black'
					: 'text-fg/65 hover:bg-fg/5 hover:text-fg'}"
				onclick={() => onsection(entry.id)}>{entry.label()}</button
			>
		{/each}
	</nav>

	<section class="min-w-0 flex-1 space-y-5 p-5 text-[13px] leading-relaxed text-fg/70">
		{#if section === 'getting-started'}
			<div>
				<h3 class="text-base font-semibold text-fg/90">{t('help.gettingStarted')}</h3>
				<p class="mt-1 text-fg/45">{t('help.gettingStartedIntro')}</p>
			</div>
			<ol class="space-y-3">
				<li>
					<strong class="text-fg/85">1. {t('help.chooseSessionTitle')}</strong><br />{t(
						'help.chooseSession'
					)}
				</li>
				<li>
					<strong class="text-fg/85">2. {t('help.prepareTitle')}</strong><br />{t('help.prepare')}
				</li>
				<li>
					<strong class="text-fg/85">3. {t('help.programTitle')}</strong><br />{t('help.program')}
				</li>
				<li>
					<strong class="text-fg/85">4. {t('help.subtitlesTitle')}</strong><br />{t(
						'help.subtitles'
					)}
				</li>
				<li>
					<strong class="text-fg/85">5. {t('help.goLiveTitle')}</strong><br />{t('help.goLive')}
				</li>
			</ol>
			<div class="border border-amber-500/25 bg-amber-500/10 p-3 text-amber-200/90">
				{t('help.safety')}
			</div>
		{:else if section === 'shortcuts'}
			<div>
				<h3 class="text-base font-semibold text-fg/90">{t('help.shortcuts')}</h3>
				<p class="mt-1 text-fg/45">{t('help.shortcutsIntro')}</p>
			</div>
			<dl class="grid grid-cols-[9rem_1fr] items-center gap-x-4 gap-y-3">
				<dt><kbd>Space</kbd> / <kbd>→</kbd> / <kbd>↓</kbd></dt>
				<dd>{t('help.nextSubtitle')}</dd>
				<dt><kbd>←</kbd> / <kbd>↑</kbd></dt>
				<dd>{t('help.previousSubtitle')}</dd>
				<dt><kbd>1</kbd>–<kbd>9</kbd></dt>
				<dd>{t('help.selectScene')}</dd>
				<dt><kbd>Enter</kbd></dt>
				<dd>{t('help.takeScene')}</dd>
				<dt><kbd>Esc</kbd></dt>
				<dd>{t('help.closeDialog')}</dd>
				<dt><kbd>⌘/Ctrl</kbd> + <kbd>,</kbd></dt>
				<dd>{t('help.openSettings')}</dd>
				<dt><kbd>⌘/Ctrl</kbd> + <kbd>/</kbd></dt>
				<dd>{t('help.openHelp')}</dd>
			</dl>
		{:else}
			<div>
				<h3 class="text-base font-semibold text-fg/90">{t('help.troubleshooting')}</h3>
				<p class="mt-1 text-fg/45">{t('help.troubleshootingIntro')}</p>
			</div>
			<div class="space-y-3">
				<details open class="border border-ink-700 bg-ink-850 p-3">
					<summary class="cursor-pointer font-semibold text-fg/85"
						>{t('help.streamProblem')}</summary
					>
					<p class="mt-2">{t('help.streamSolution')}</p>
					<button class="studio-chip mt-2" onclick={() => onsettings('output')}
						>{t('help.openOutput')}</button
					>
				</details>
				<details class="border border-ink-700 bg-ink-850 p-3">
					<summary class="cursor-pointer font-semibold text-fg/85">{t('help.audioProblem')}</summary
					>
					<p class="mt-2">{t('help.audioSolution')}</p>
				</details>
				<details class="border border-ink-700 bg-ink-850 p-3">
					<summary class="cursor-pointer font-semibold text-fg/85"
						>{t('help.subtitleProblem')}</summary
					>
					<p class="mt-2">{t('help.subtitleSolution')}</p>
				</details>
				<details class="border border-ink-700 bg-ink-850 p-3">
					<summary class="cursor-pointer font-semibold text-fg/85"
						>{t('help.captureProblem')}</summary
					>
					<p class="mt-2">{t('help.captureSolution')}</p>
				</details>
			</div>
			<button class="studio-chip" onclick={() => onsettings('about')}>{t('help.openSystem')}</button
			>
		{/if}
	</section>
</div>

<style>
	kbd {
		border: 1px solid rgb(var(--ink-600));
		background: rgb(var(--ink-850));
		padding: 0.1rem 0.35rem;
		font:
			11px ui-monospace,
			monospace;
		color: rgb(var(--fg) / 0.8);
	}
</style>
