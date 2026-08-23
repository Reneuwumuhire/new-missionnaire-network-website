<script lang="ts">
	import { connectYouTube, createSession, liveSession } from '../lib/live-session.svelte';

	let { oncreated }: { oncreated: () => void } = $props();
	let title = $state('');
	let scheduledAt = $state('');
	let description = $state('');
	let privacyStatus = $state<'private' | 'unlisted' | 'public'>('public');
	let madeForKids = $state(false);
	let thumbnail = $state<File | null>(null);
	let subtitle = $state<File | null>(null);
	let announce = $state(true);
	let reminderEnabled = $state(false);
	let saving = $state(false);
	let formError = $state<string | null>(null);

	async function save() {
		if (!title.trim() || !scheduledAt) {
			formError = 'Title and scheduled time are required.';
			return;
		}
		saving = true;
		formError = null;
		if (
			await createSession({
				title,
				scheduledAt,
				description,
				privacyStatus,
				madeForKids,
				thumbnail,
				subtitle,
				announce,
				reminderEnabled
			})
		)
			oncreated();
		else formError = liveSession.error || 'Session could not be created.';
		saving = false;
	}
</script>

<form
	class="space-y-4 p-4"
	onsubmit={(event) => {
		event.preventDefault();
		void save();
	}}
>
	<p class="text-[12px] text-fg/60">
		A stable public link is created immediately and remains available after the service.
	</p>
	<label class="block"
		><span class="studio-label">Title *</span><input
			class="studio-input w-full"
			required
			maxlength="100"
			bind:value={title}
			placeholder="Sunday morning service"
		/></label
	>
	<label class="block"
		><span class="studio-label">Date and time *</span><input
			class="studio-input studio-datetime w-full"
			required
			type="datetime-local"
			bind:value={scheduledAt}
		/></label
	>
	<label class="block"
		><span class="studio-label">Description</span><textarea
			class="studio-input min-h-20 w-full"
			bind:value={description}
			placeholder="Shown on the public live page"
		></textarea></label
	>
	<div class="grid gap-3 sm:grid-cols-3">
		<label class="block"
			><span class="studio-label">YouTube visibility</span><select
				class="studio-input h-[38px] w-full"
				bind:value={privacyStatus}
				><option value="public">Public</option><option value="unlisted">Unlisted</option><option
					value="private">Private</option
				></select
			></label
		>
		<label class="block"
			><span class="studio-label">YouTube audience</span><select
				class="studio-input h-[38px] w-full"
				bind:value={madeForKids}
				><option value={false}>Not made for kids</option><option value={true}>Made for kids</option></select
			></label
		>
		<div class="block">
			<span class="studio-label">YouTube channel</span>{#if liveSession.youtubeConnected}<div
					class="studio-input truncate text-emerald-300"
				>
					{liveSession.youtubeChannel}
				</div>{:else}<button
					class="studio-chip h-[42px] w-full"
					type="button"
					onclick={() => void connectYouTube()}>Connect YouTube</button
				>{/if}
		</div>
	</div>
	<div class="grid gap-3 sm:grid-cols-2">
		<label class="block"
			><span class="studio-label"
				>Thumbnail <span class="normal-case text-fg/35">(JPEG/PNG, max 2 MB)</span></span
			><input
				class="block w-full text-[11px] text-fg/60"
				type="file"
				accept="image/jpeg,image/png"
				onchange={(event) =>
					(thumbnail = (event.currentTarget as HTMLInputElement).files?.[0] ?? null)}
			/></label
		>
		<label class="block"
			><span class="studio-label"
				>Synchronized transcript <span class="normal-case text-fg/35">(.srt)</span></span
			><input
				class="block w-full text-[11px] text-fg/60"
				type="file"
				accept=".srt,text/plain"
				onchange={(event) =>
					(subtitle = (event.currentTarget as HTMLInputElement).files?.[0] ?? null)}
			/></label
		>
	</div>
	<label class="flex items-center gap-2 text-[12px] text-fg/75"
		><input type="checkbox" bind:checked={announce} /> Announce to subscribers</label
	>
	<label class="flex items-center gap-2 text-[12px] text-fg/75"
		><input type="checkbox" bind:checked={reminderEnabled} /> Send a reminder before the service</label
	>
	{#if formError}<p class="text-[12px] text-red-400">{formError}</p>{/if}
	<button
		class="h-9 w-full bg-primary text-[12px] font-semibold text-black disabled:opacity-50"
		disabled={saving || !liveSession.youtubeConnected}
		>{saving ? 'Creating YouTube + Missionnaire…' : 'Create YouTube + Missionnaire session'}</button
	>
</form>
