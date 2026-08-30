<script lang="ts">
	import { importedCount, mergeEnvDestinations, parseStudioEnv } from '../lib/env-config';
	import { persist, studio } from '../lib/state.svelte';

	let { oncomplete }: { oncomplete: () => void } = $props();
	let contents = $state('');
	let filename = $state('');
	let error = $state('');

	async function choose(event: Event) {
		const file = (event.currentTarget as HTMLInputElement).files?.[0];
		if (!file) return;
		filename = file.name;
		contents = await file.text();
		error = '';
	}

	function apply() {
		try {
			const config = parseStudioEnv(contents);
			if (importedCount(config) === 0) {
				throw new Error('No supported Studio settings were found in this file.');
			}
			if (config.mainSiteUrl) studio.settings.mainSiteUrl = config.mainSiteUrl;
			if (config.adminSiteUrl) studio.settings.adminSiteUrl = config.adminSiteUrl;
			studio.destinations = mergeEnvDestinations(studio.destinations, config);
			persist();
			oncomplete();
		} catch (cause) {
			error = cause instanceof Error ? cause.message : String(cause);
		}
	}
</script>

<div class="space-y-4 p-5">
	<div>
		<h3 class="text-lg font-semibold text-fg/90">Developer configuration</h3>
		<p class="mt-1 max-w-2xl text-[12px] leading-relaxed text-fg/50">
			Optional local-development import for site URLs and manual RTMP destinations. Installed apps
			do not need this file. Database, AWS and recorder credentials are ignored.
		</p>
	</div>

	<label class="studio-chip inline-flex cursor-pointer items-center gap-2 px-3">
		Import .env file
		<input class="sr-only" type="file" onchange={choose} />
	</label>
	{#if filename}<span class="ml-2 text-[11px] text-fg/45">{filename}</span>{/if}

	<textarea
		class="studio-input min-h-56 w-full resize-y font-mono text-[11px] leading-relaxed"
		bind:value={contents}
		placeholder={'MAIN_SITE_URL=http://localhost:8080\nADMIN_SITE_URL=http://localhost:5174\nMISSIONNAIRE_RTMP_URL=rtmp://localhost:1935/live\nMISSIONNAIRE_STREAM_KEY=obs\nYOUTUBE_STREAM_KEY=…'}
	></textarea>

	<p class="text-[11px] text-amber-300/80">
		Manual stream keys are stored locally on this computer. Prefer managed YouTube channels for
		production.
	</p>
	{#if error}<p class="text-[12px] text-red-400">{error}</p>{/if}

	<div class="flex justify-end gap-2 border-t border-ink-700 pt-4">
		<button class="studio-chip px-3" onclick={oncomplete}>Cancel</button>
		<button
			class="studio-chip bg-primary/20 px-4 text-primary"
			disabled={!contents.trim()}
			onclick={apply}>Import configuration</button
		>
	</div>
</div>
