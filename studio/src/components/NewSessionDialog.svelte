<script lang="ts">
	import { createSession } from '../lib/live-session.svelte';

	let { oncreated }: { oncreated: () => void } = $props();
	let title = $state('');
	let scheduledAt = $state('');
	let description = $state('');
	let youtubeUrl = $state('');
	let thumbnail = $state<File | null>(null);
	let subtitle = $state<File | null>(null);
	let announce = $state(true);
	let reminderEnabled = $state(false);
	let saving = $state(false);
	let formError = $state<string | null>(null);

	async function save() {
		if (!title.trim() || !scheduledAt) { formError = 'Title and scheduled time are required.'; return; }
		saving = true; formError = null;
		if (await createSession({ title, scheduledAt, description, youtubeUrl, thumbnail, subtitle, announce, reminderEnabled })) oncreated();
		else formError = 'Session could not be created. Check the connection and upload files.';
		saving = false;
	}
</script>

<form class="space-y-4 p-4" onsubmit={(event) => { event.preventDefault(); void save(); }}>
	<p class="text-[12px] text-fg/60">A stable public link is created immediately and remains available after the service.</p>
	<label class="block"><span class="studio-label">Title *</span><input class="studio-input w-full" required bind:value={title} placeholder="Sunday morning service" /></label>
	<label class="block"><span class="studio-label">Date and time *</span><input class="studio-input w-full" required type="datetime-local" bind:value={scheduledAt} /></label>
	<label class="block"><span class="studio-label">Description</span><textarea class="studio-input min-h-20 w-full" bind:value={description} placeholder="Shown on the public live page"></textarea></label>
	<label class="block"><span class="studio-label">YouTube link <span class="normal-case text-fg/35">(optional)</span></span><input class="studio-input w-full" type="url" bind:value={youtubeUrl} placeholder="https://youtube.com/watch?v=…" /></label>
	<div class="grid gap-3 sm:grid-cols-2">
		<label class="block"><span class="studio-label">Thumbnail <span class="normal-case text-fg/35">(optional)</span></span><input class="block w-full text-[11px] text-fg/60" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onchange={(event) => (thumbnail = (event.currentTarget as HTMLInputElement).files?.[0] ?? null)} /></label>
		<label class="block"><span class="studio-label">Synchronized transcript <span class="normal-case text-fg/35">(.srt)</span></span><input class="block w-full text-[11px] text-fg/60" type="file" accept=".srt,text/plain" onchange={(event) => (subtitle = (event.currentTarget as HTMLInputElement).files?.[0] ?? null)} /></label>
	</div>
	<label class="flex items-center gap-2 text-[12px] text-fg/75"><input type="checkbox" bind:checked={announce} /> Announce to subscribers</label>
	<label class="flex items-center gap-2 text-[12px] text-fg/75"><input type="checkbox" bind:checked={reminderEnabled} /> Send a reminder before the service</label>
	{#if formError}<p class="text-[12px] text-red-400">{formError}</p>{/if}
	<button class="h-9 w-full bg-primary text-[12px] font-semibold text-black disabled:opacity-50" disabled={saving}>{saving ? 'Creating…' : 'Create public session'}</button>
</form>
