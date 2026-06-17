<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { BroadcastAdminState } from '../../db/collections';
	import { toast } from '$lib/stores/toast';
	import { t } from '$lib/i18n';

	// Replaces the old "information shown during the live" block. A live's
	// metadata now always comes from its scheduled entry; this panel manages the
	// *default* info used when an admin starts an unscheduled live on the spot —
	// and the button that does exactly that. Nothing here persists onto a live
	// after the fact, so a recording can never inherit a previous broadcast's
	// title/description.
	let {
		broadcast
	}: {
		broadcast: BroadcastAdminState;
	} = $props();

	const YOUTUBE_CHANNEL_LIVE_URL = 'https://www.youtube.com/@MissionnaireNetwork/live';
	const FALLBACK_DEFAULT_TITLE = '{date} Missionnaire Network Live audio';
	const FALLBACK_DEFAULT_DESCRIPTION =
		'Rediffusion du direct de Missionnaire Network — prédications, enseignements et louanges.';

	function berlinDateYmd(d: Date): string {
		const parts = new Intl.DateTimeFormat('en-CA', {
			timeZone: 'Europe/Berlin',
			year: 'numeric',
			month: '2-digit',
			day: '2-digit'
		}).formatToParts(d);
		const y = parts.find((p) => p.type === 'year')?.value ?? '';
		const m = parts.find((p) => p.type === 'month')?.value ?? '';
		const day = parts.find((p) => p.type === 'day')?.value ?? '';
		return `${y}-${m}-${day}`;
	}

	/** What the title will actually read for a live started today. */
	function renderTitleTemplate(template: string): string {
		const date = berlinDateYmd(new Date());
		return template.includes('{date}') ? template.replaceAll('{date}', date) : `${date} ${template}`;
	}

	// Rendered preview of the title an instant live would get right now.
	const titlePreview = $derived(
		renderTitleTemplate(broadcast.default_title?.trim() || FALLBACK_DEFAULT_TITLE)
	);
	const descriptionPreview = $derived(
		broadcast.default_description?.trim() || FALLBACK_DEFAULT_DESCRIPTION
	);

	// ── Edit mode ──────────────────────────────────────────────────
	// Collapsed by default — defaults rarely change, so this stays out of the
	// way under the broadcast controls until the admin expands it.
	let collapsed = $state(true);
	let editing = $state(false);
	let saving = $state(false);
	let formError = $state<string | null>(null);
	let titleDraft = $state('');
	let descriptionDraft = $state('');
	let youtubeUrlDraft = $state('');
	let thumbnailFile = $state<File | null>(null);
	let thumbnailPreviewUrl = $state<string | null>(null);
	let thumbnailAction = $state<'keep' | 'replace' | 'remove'>('keep');
	let thumbnailBroken = $state(false);

	const previewSrc = $derived.by(() => {
		if (thumbnailPreviewUrl) return thumbnailPreviewUrl;
		if (thumbnailAction === 'remove') return null;
		if (thumbnailBroken) return null;
		return broadcast.default_thumbnail_url;
	});

	function enterEdit() {
		titleDraft = broadcast.default_title ?? '';
		descriptionDraft = broadcast.default_description ?? '';
		youtubeUrlDraft = broadcast.default_youtube_url ?? '';
		thumbnailFile = null;
		if (thumbnailPreviewUrl) URL.revokeObjectURL(thumbnailPreviewUrl);
		thumbnailPreviewUrl = null;
		thumbnailAction = 'keep';
		formError = null;
		collapsed = false;
		editing = true;
	}

	function cancelEdit() {
		if (thumbnailPreviewUrl) URL.revokeObjectURL(thumbnailPreviewUrl);
		thumbnailPreviewUrl = null;
		thumbnailFile = null;
		thumbnailAction = 'keep';
		formError = null;
		editing = false;
	}

	function onThumbnailFileChange(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		if (!file.type.startsWith('image/')) {
			formError = $t('recordings.error.selectImage');
			return;
		}
		if (file.size > 5 * 1024 * 1024) {
			formError = $t('recordings.error.imageTooLarge');
			return;
		}
		formError = null;
		if (thumbnailPreviewUrl) URL.revokeObjectURL(thumbnailPreviewUrl);
		thumbnailFile = file;
		thumbnailPreviewUrl = URL.createObjectURL(file);
		thumbnailAction = 'replace';
	}

	function markThumbnailForRemoval() {
		if (thumbnailPreviewUrl) URL.revokeObjectURL(thumbnailPreviewUrl);
		thumbnailPreviewUrl = null;
		thumbnailFile = null;
		thumbnailAction = 'remove';
	}

	/** Uploads the staged default thumbnail (or signals removal). Returns the
	 *  patch fields, or null on failure (formError is set). */
	async function uploadThumbnailIfNeeded(): Promise<{
		default_thumbnail_url: string | null;
		default_thumbnail_s3_key: string | null;
	} | null> {
		if (thumbnailAction === 'remove') {
			return { default_thumbnail_url: null, default_thumbnail_s3_key: null };
		}
		if (!thumbnailFile) return null;
		const presignRes = await fetch('/api/broadcast/thumbnail/presign', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ contentType: thumbnailFile.type, size: thumbnailFile.size })
		});
		if (!presignRes.ok) {
			formError = (await presignRes.text()) || $t('recordings.error.http', { status: presignRes.status });
			return null;
		}
		const { uploadUrl, key, publicUrl } = (await presignRes.json()) as {
			uploadUrl: string;
			key: string;
			publicUrl: string;
		};
		const uploadRes = await fetch(uploadUrl, {
			method: 'PUT',
			headers: { 'Content-Type': thumbnailFile.type },
			body: thumbnailFile
		});
		if (!uploadRes.ok) {
			formError = $t('recordings.error.s3UploadFailed');
			return null;
		}
		return { default_thumbnail_url: publicUrl, default_thumbnail_s3_key: key };
	}

	async function save() {
		if (saving) return;
		saving = true;
		formError = null;
		try {
			const patch: Record<string, unknown> = {
				default_title: titleDraft.trim() || null,
				default_description: descriptionDraft.trim() || null,
				default_youtube_url: youtubeUrlDraft.trim() || null
			};

			if (thumbnailAction !== 'keep') {
				const thumb = await uploadThumbnailIfNeeded();
				if (!thumb) return;
				patch.default_thumbnail_url = thumb.default_thumbnail_url;
				patch.default_thumbnail_s3_key = thumb.default_thumbnail_s3_key;
			}

			const res = await fetch('/api/broadcast/defaults', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(patch)
			});
			if (!res.ok) {
				formError = (await res.text()) || $t('recordings.error.http', { status: res.status });
				return;
			}
			toast.success($t('recordings.defaults.toast.saved'));
			cancelEdit();
			await invalidateAll();
		} finally {
			saving = false;
		}
	}

</script>

<div class="mb-8 border border-stone-200/60 bg-white/40 p-6" data-testid="default-info-panel">
	<!-- Header: the title row toggles the panel open/closed (collapsed by default). -->
	<div class="flex flex-wrap items-start justify-between gap-4">
		<button
			type="button"
			onclick={() => (collapsed = !collapsed)}
			aria-expanded={!collapsed}
			data-testid="default-info-toggle"
			class="group flex min-w-0 flex-1 items-start gap-2 text-left"
		>
			<svg
				class="mt-0.5 h-3 w-3 shrink-0 text-stone-400 transition-transform group-hover:text-stone-600 {collapsed ? '' : 'rotate-90'}"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="2.5"
				aria-hidden="true"
			>
				<path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
			</svg>
			<span class="min-w-0">
				<span class="block text-[10px] font-bold uppercase tracking-[0.2em] text-stone-500 group-hover:text-stone-700">
					{$t('recordings.defaults.title')}
				</span>
				<span class="mt-1 block text-[10px] text-stone-400">
					{$t('recordings.defaults.intro')}
				</span>
			</span>
		</button>
		{#if !editing}
			<button
				type="button"
				onclick={enterEdit}
				data-testid="default-info-edit"
				class="shrink-0 border border-stone-200 bg-white px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-600 transition-colors hover:border-primary hover:text-primary"
			>
				{$t('recordings.common.edit')}
			</button>
		{/if}
	</div>

	{#if !collapsed}
	{#if broadcast.is_live}
		<p class="mt-3 border border-stone-100 bg-stone-50/60 px-3 py-2 text-[11px] text-stone-400">
			{$t('recordings.defaults.liveHint')}
		</p>
	{/if}

	{#if !editing}
		<!-- View -->
		<div class="mt-5 flex flex-col gap-5 sm:flex-row sm:items-start">
			<div class="flex flex-col gap-2">
				<span class="text-[10px] font-semibold uppercase tracking-wider text-stone-400">
					{$t('recordings.common.thumbnail')}
				</span>
				<div class="h-28 w-44 overflow-hidden border border-stone-300 bg-stone-100">
					{#if broadcast.default_thumbnail_url && !thumbnailBroken}
						<img
							src={broadcast.default_thumbnail_url}
							alt={$t('recordings.common.thumbnail')}
							class="h-full w-full object-cover"
							onerror={() => (thumbnailBroken = true)}
						/>
					{:else}
						<div class="flex h-full w-full flex-col items-center justify-center gap-1.5 text-stone-300">
							<picture>
								<source srcset="/icons/logo.webp" type="image/webp" />
								<img src="/icons/logo.png" alt="" class="h-6 w-auto opacity-90" width="150" height="64" />
							</picture>
							<span class="text-[8px] font-semibold uppercase tracking-[0.2em] text-stone-400">
								{$t('recordings.defaults.noneThumb')}
							</span>
						</div>
					{/if}
				</div>
			</div>

			<div class="flex flex-1 flex-col gap-4">
				<div class="flex flex-col gap-1">
					<span class="text-[10px] font-semibold uppercase tracking-wider text-stone-400">
						{$t('recordings.defaults.titleLabel')}
					</span>
					<p class="text-sm text-stone-700">{titlePreview}</p>
				</div>
				<div class="flex flex-col gap-1">
					<span class="text-[10px] font-semibold uppercase tracking-wider text-stone-400">
						{$t('recordings.common.description')}
					</span>
					<p class="whitespace-pre-wrap text-sm text-stone-700">{descriptionPreview}</p>
				</div>
				<div class="flex flex-col gap-1">
					<span class="text-[10px] font-semibold uppercase tracking-wider text-stone-400">
						{$t('recordings.common.youtubeLink')}
					</span>
					<a
						href={broadcast.default_youtube_url || YOUTUBE_CHANNEL_LIVE_URL}
						target="_blank"
						rel="noopener noreferrer"
						class="inline-flex items-center gap-1.5 break-all text-sm transition-colors {broadcast.default_youtube_url
							? 'text-stone-700 hover:text-primary'
							: 'italic text-stone-400 hover:text-stone-500'}"
					>
						<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" class="shrink-0">
							<path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
						</svg>
						<span>{broadcast.default_youtube_url || $t('recordings.defaults.youtubeDefault', { url: YOUTUBE_CHANNEL_LIVE_URL })}</span>
					</a>
				</div>
			</div>
		</div>
	{:else}
		<!-- Edit -->
		<div class="mt-5 space-y-4">
			<div>
				<label for="default-title" class="mb-1 block text-xs font-semibold text-stone-600">
					{$t('recordings.defaults.titleLabel')}
				</label>
				<input
					id="default-title"
					type="text"
					maxlength="120"
					bind:value={titleDraft}
					placeholder={FALLBACK_DEFAULT_TITLE}
					class="w-full border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800 focus:border-primary focus:outline-none"
				/>
				<p class="mt-1 text-[11px] text-stone-400">
					{$t('recordings.defaults.titleHint', { preview: renderTitleTemplate(titleDraft.trim() || FALLBACK_DEFAULT_TITLE) })}
				</p>
			</div>

			<div>
				<label for="default-description" class="mb-1 block text-xs font-semibold text-stone-600">
					{$t('recordings.common.description')}
				</label>
				<textarea
					id="default-description"
					rows="3"
					maxlength="2000"
					bind:value={descriptionDraft}
					placeholder={FALLBACK_DEFAULT_DESCRIPTION}
					class="w-full border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800 focus:border-primary focus:outline-none"
				></textarea>
			</div>

			<div>
				<label for="default-youtube" class="mb-1 block text-xs font-semibold text-stone-600">
					{$t('recordings.common.youtubeLink')}
					<span class="ml-1 font-normal text-stone-400">{$t('recordings.scheduled.optional')}</span>
				</label>
				<input
					id="default-youtube"
					type="url"
					inputmode="url"
					bind:value={youtubeUrlDraft}
					placeholder={YOUTUBE_CHANNEL_LIVE_URL}
					class="w-full border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800 focus:border-primary focus:outline-none"
				/>
			</div>

			<div>
				<span class="mb-1 block text-xs font-semibold text-stone-600">{$t('recordings.common.thumbnail')}</span>
				<div class="flex items-center gap-3">
					<div class="h-16 w-28 shrink-0 overflow-hidden border border-stone-200 bg-stone-50">
						{#if previewSrc}
							<img src={previewSrc} alt={$t('recordings.common.thumbnail')} class="h-full w-full object-cover" />
						{:else}
							<div class="flex h-full w-full items-center justify-center text-[10px] text-stone-300">
								{$t('recordings.defaults.noneThumb')}
							</div>
						{/if}
					</div>
					<div class="flex flex-col gap-1.5">
						<label class="cursor-pointer border border-stone-200 bg-white px-3 py-1.5 text-center text-[11px] font-semibold text-stone-600 transition-colors hover:border-primary hover:text-primary">
							{previewSrc ? $t('recordings.common.replace') : $t('recordings.scheduled.chooseImage')}
							<input type="file" accept="image/*" class="hidden" onchange={onThumbnailFileChange} />
						</label>
						{#if previewSrc}
							<button
								type="button"
								class="border border-transparent px-3 py-1 text-[11px] font-semibold text-stone-400 hover:text-rose-600"
								onclick={markThumbnailForRemoval}
							>
								{$t('recordings.common.remove')}
							</button>
						{/if}
					</div>
				</div>
			</div>

			{#if formError}
				<p class="border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{formError}</p>
			{/if}

			<div class="flex justify-end gap-2">
				<button type="button" class="admin-btn-secondary" onclick={cancelEdit} disabled={saving}>
					{$t('recordings.common.cancel')}
				</button>
				<button type="button" class="admin-btn-primary disabled:opacity-50" onclick={save} disabled={saving} data-testid="default-info-save">
					{saving ? $t('recordings.common.saving') : $t('recordings.common.save')}
				</button>
			</div>
		</div>
	{/if}
	{/if}
</div>
