<script lang="ts">
	import { connectYouTube, createSession, liveSession } from '../lib/live-session.svelte';
	import Icon from './Icon.svelte';

	let { oncreated }: { oncreated: () => void } = $props();
	let title = $state('');
	let scheduledAt = $state('');
	let description = $state('');
	let privacyStatus = $state<'private' | 'unlisted' | 'public'>('public');
	let madeForKids = $state(false);
	let thumbnail = $state<File | null>(null);
	let subtitle = $state<File | null>(null);
	let announce = $state(false);
	let reminderEnabled = $state(false);
	let notifyOnStart = $state(false);
	let youtubeChannelId = $state(
		liveSession.youtubeChannelId ?? liveSession.youtubeChannels[0]?.id ?? ''
	);
	let saving = $state(false);
	let formError = $state<string | null>(null);

	$effect(() => {
		if (!liveSession.youtubeChannels.some((channel) => channel.id === youtubeChannelId)) {
			youtubeChannelId = liveSession.youtubeChannelId ?? liveSession.youtubeChannels[0]?.id ?? '';
		}
	});

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
				reminderEnabled,
				notifyOnStart,
				youtubeChannelId
			})
		)
			oncreated();
		else formError = liveSession.error || 'Session could not be created.';
		saving = false;
	}
</script>

<form
	class="space-y-4 p-5"
	onsubmit={(event) => {
		event.preventDefault();
		void save();
	}}
>
	<div class="flex items-start gap-3 border border-primary/20 bg-primary/[0.05] px-3 py-2.5">
		<span class="mt-1 h-2 w-2 shrink-0 bg-primary"></span>
		<div>
			<p class="text-[12px] font-medium text-fg/80">One service, published in both places</p>
			<p class="mt-0.5 text-[11px] leading-relaxed text-fg/45">
				Creates the YouTube broadcast and a stable Missionnaire public link.
			</p>
		</div>
	</div>

	<section class="space-y-3 border border-ink-700 bg-ink-850/40 p-4">
		<div>
			<h3 class="text-[12px] font-semibold text-fg/85">Service information</h3>
			<p class="mt-0.5 text-[10px] text-fg/40">Used on YouTube and Missionnaire.</p>
		</div>
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
				class="studio-input min-h-20 w-full resize-y"
				bind:value={description}
				placeholder="What is this service about?"
			></textarea></label
		>
	</section>

	<section class="space-y-3 border border-ink-700 bg-ink-850/40 p-4">
		<div>
			<h3 class="text-[12px] font-semibold text-fg/85">YouTube</h3>
			<p class="mt-0.5 text-[10px] text-fg/40">Choose where and how the broadcast appears.</p>
		</div>
		<div class="grid gap-3 sm:grid-cols-2">
			<label class="block">
				<span class="studio-label">Channel</span>
				{#if liveSession.youtubeChannels.length > 0}
					<div class="relative">
						<select
							class="studio-input h-10 w-full appearance-none pr-9"
							bind:value={youtubeChannelId}
						>
							{#each liveSession.youtubeChannels as channel (channel.id)}
								<option value={channel.id}>{channel.title}</option>
							{/each}
						</select>
						<span
							class="pointer-events-none absolute inset-y-0 right-3 flex items-center text-fg/40"
						>
							<Icon name="down" size={14} />
						</span>
					</div>
				{:else}
					<button
						class="studio-chip h-10 w-full justify-center border-primary/40 text-primary"
						type="button"
						onclick={async () => {
							youtubeChannelId = (await connectYouTube()) ?? youtubeChannelId;
						}}>Connect YouTube</button
					>
				{/if}
			</label>
			<label class="block">
				<span class="studio-label">Visibility</span>
				<div class="relative">
					<select class="studio-input h-10 w-full appearance-none pr-9" bind:value={privacyStatus}>
						<option value="public">Public</option>
						<option value="unlisted">Unlisted</option>
						<option value="private">Private</option>
					</select>
					<span class="pointer-events-none absolute inset-y-0 right-3 flex items-center text-fg/40">
						<Icon name="down" size={14} />
					</span>
				</div>
			</label>
		</div>
		<label
			class="group flex cursor-pointer items-start gap-3 border border-ink-700 bg-ink-800/50 p-3 transition-colors hover:border-ink-500"
		>
			<input class="peer sr-only" type="checkbox" bind:checked={madeForKids} />
			<span
				class="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center border border-ink-500 bg-ink-800 text-transparent transition-colors peer-checked:border-primary peer-checked:bg-primary peer-checked:text-black peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary"
			>
				<svg
					viewBox="0 0 16 16"
					class="h-3 w-3"
					fill="none"
					stroke="currentColor"
					stroke-width="2.5"><path d="m3 8 3 3 7-7" /></svg
				>
			</span>
			<span>
				<strong class="block text-[12px] font-medium text-fg/80">Made for kids</strong>
				<span class="mt-0.5 block text-[10px] leading-relaxed text-fg/40"
					>Select only when children are the intended audience.</span
				>
			</span>
		</label>
	</section>

	<section class="space-y-3 border border-ink-700 bg-ink-850/40 p-4">
		<div>
			<h3 class="text-[12px] font-semibold text-fg/85">Missionnaire</h3>
			<p class="mt-0.5 text-[10px] text-fg/40">
				Public page, artwork, transcript, and notifications.
			</p>
		</div>
		<div class="grid gap-3 sm:grid-cols-2">
			<label
				class="block border border-dashed border-ink-600 bg-ink-800/30 p-3 transition-colors hover:border-ink-500"
			>
				<span class="studio-label"
					>Thumbnail <span class="normal-case tracking-normal text-fg/30">JPEG/PNG</span></span
				>
				<input
					class="block w-full text-[11px] text-fg/55 file:mr-2 file:border-0 file:bg-ink-700 file:px-2.5 file:py-1.5 file:text-[10px] file:text-fg/70"
					type="file"
					accept="image/jpeg,image/png"
					onchange={(event) =>
						(thumbnail = (event.currentTarget as HTMLInputElement).files?.[0] ?? null)}
				/>
			</label>
			<label
				class="block border border-dashed border-ink-600 bg-ink-800/30 p-3 transition-colors hover:border-ink-500"
			>
				<span class="studio-label"
					>Synchronized transcript <span class="normal-case tracking-normal text-fg/30">SRT</span
					></span
				>
				<input
					class="block w-full text-[11px] text-fg/55 file:mr-2 file:border-0 file:bg-ink-700 file:px-2.5 file:py-1.5 file:text-[10px] file:text-fg/70"
					type="file"
					accept=".srt,text/plain"
					onchange={(event) =>
						(subtitle = (event.currentTarget as HTMLInputElement).files?.[0] ?? null)}
				/>
			</label>
		</div>
		<div class="grid gap-2 sm:grid-cols-3">
			<label
				class="group flex cursor-pointer items-start gap-3 border border-ink-700 bg-ink-800/50 p-3 transition-colors hover:border-ink-500"
			>
				<input class="peer sr-only" type="checkbox" bind:checked={announce} />
				<span
					class="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center border border-ink-500 bg-ink-800 text-transparent transition-colors peer-checked:border-primary peer-checked:bg-primary peer-checked:text-black peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary"
				>
					<svg
						viewBox="0 0 16 16"
						class="h-3 w-3"
						fill="none"
						stroke="currentColor"
						stroke-width="2.5"><path d="m3 8 3 3 7-7" /></svg
					>
				</span>
				<span>
					<strong class="block text-[12px] font-medium text-fg/80">Announce when scheduled</strong>
					<span class="mt-0.5 block text-[10px] leading-relaxed text-fg/40"
						>Send an “upcoming live” alert now.</span
					>
				</span>
			</label>
			<label
				class="group flex cursor-pointer items-start gap-3 border border-ink-700 bg-ink-800/50 p-3 transition-colors hover:border-ink-500"
			>
				<input class="peer sr-only" type="checkbox" bind:checked={notifyOnStart} />
				<span
					class="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center border border-ink-500 bg-ink-800 text-transparent transition-colors peer-checked:border-primary peer-checked:bg-primary peer-checked:text-black peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary"
				>
					<svg
						viewBox="0 0 16 16"
						class="h-3 w-3"
						fill="none"
						stroke="currentColor"
						stroke-width="2.5"><path d="m3 8 3 3 7-7" /></svg
					>
				</span>
				<span>
					<strong class="block text-[12px] font-medium text-fg/80">Notify when live starts</strong>
					<span class="mt-0.5 block text-[10px] leading-relaxed text-fg/40"
						>Send an alert only when selected.</span
					>
				</span>
			</label>
			<label
				class="group flex cursor-pointer items-start gap-3 border border-ink-700 bg-ink-800/50 p-3 transition-colors hover:border-ink-500"
			>
				<input class="peer sr-only" type="checkbox" bind:checked={reminderEnabled} />
				<span
					class="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center border border-ink-500 bg-ink-800 text-transparent transition-colors peer-checked:border-primary peer-checked:bg-primary peer-checked:text-black peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary"
				>
					<svg
						viewBox="0 0 16 16"
						class="h-3 w-3"
						fill="none"
						stroke="currentColor"
						stroke-width="2.5"><path d="m3 8 3 3 7-7" /></svg
					>
				</span>
				<span>
					<strong class="block text-[12px] font-medium text-fg/80">Send a reminder</strong>
					<span class="mt-0.5 block text-[10px] leading-relaxed text-fg/40"
						>Remind subscribers before the service.</span
					>
				</span>
			</label>
		</div>
	</section>
	{#if formError}<p class="text-[12px] text-red-400">{formError}</p>{/if}
	<button class="studio-btn-primary h-10 w-full" disabled={saving || !youtubeChannelId}
		>{saving ? 'Creating YouTube + Missionnaire…' : 'Create YouTube + Missionnaire session'}</button
	>
</form>
