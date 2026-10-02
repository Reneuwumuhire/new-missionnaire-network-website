<script lang="ts">
	import { enhance } from '$app/forms';
	import { tick, untrack } from 'svelte';
	import type { ActionData, PageData } from './$types';
	import { whatsappToHtml } from '$lib/whatsapp-format';
	import { selectedSourceValues, type ExtraitSourceSuggestion } from '$lib/extrait-source';
	import { t } from '$lib/i18n';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const initial = untrack(() => ({
		edit: data.edit,
		savedValues: form?.values,
		defaultPublishedAt: data.defaultPublishedAt
	}));
	const edit = initial.edit;
	const savedValues = initial.savedValues;
	const initialSource = {
		kind: savedValues?.sourceKind ?? edit?.sourceKind ?? '',
		id: savedValues?.sourceId ?? edit?.sourceId ?? '',
		title: savedValues?.sourceTitle ?? edit?.sourceTitle ?? ''
	};

	function existingLink(kind: string): string {
		return edit?.links?.find((link: { kind: string }) => link.kind === kind)?.href ?? '';
	}

	let sourceTitle: string = $state(savedValues?.sourceTitle ?? edit?.sourceTitle ?? '');
	let body: string = $state(savedValues?.body ?? edit?.body ?? '');
	let publishedAt: string = $state(
		savedValues?.publishedAt ?? edit?.publishedAt ?? initial.defaultPublishedAt
	);
	let imageUrl: string = $state(savedValues?.imageUrl ?? edit?.imageUrl ?? '');
	let imageKey: string = $state(savedValues?.imageKey ?? edit?.imageKey ?? '');
	let imageWidth: string = $state(savedValues?.imageWidth ?? String(edit?.imageWidth ?? 1200));
	let imageHeight: string = $state(savedValues?.imageHeight ?? String(edit?.imageHeight ?? 675));
	let imagePreview: string = $state(savedValues?.imageUrl ?? edit?.imageUrl ?? '');
	let sermonUrl: string = $state(savedValues?.sermonUrl ?? existingLink('sermon'));
	let liveUrl: string = $state(savedValues?.liveUrl ?? existingLink('live'));
	let videoUrl: string = $state(savedValues?.videoUrl ?? existingLink('video'));
	let pdfUrl: string = $state(savedValues?.pdfUrl ?? existingLink('pdf'));
	let audioUrl: string = $state(savedValues?.audioUrl ?? existingLink('audio'));
	let transcriptionUrl: string = $state(
		savedValues?.transcriptionUrl ?? existingLink('transcription')
	);
	let sourceKind: string = $state(initialSource.kind);
	let sourceId: string = $state(initialSource.id);
	let sourceSearch = $state(initialSource.kind && initialSource.id ? initialSource.title : '');
	let sourceSuggestions = $state<ExtraitSourceSuggestion[]>([]);
	let sourceSearchOpen = $state(false);
	let sourceSearching = $state(false);
	let sourceSearchError = $state('');
	let activeSuggestion = $state(-1);
	let sourceSearchTimer: ReturnType<typeof setTimeout> | undefined;
	let sourceAbort: AbortController | null = null;
	let bodyField: HTMLTextAreaElement;
	let uploading = $state(false);
	let submitting = $state(false);
	let uploadError = $state('');

	let bodyHtml = $derived(whatsappToHtml(body || $t('extraits.bodyFallback')));
	let previewLinks = $derived(
		[
			{ label: $t('extraits.viewSermon'), href: sermonUrl },
			{ label: $t('extraits.listenRebroadcast'), href: liveUrl },
			{ label: $t('extraits.viewVideo'), href: videoUrl },
			{ label: $t('extraits.readPdf'), href: pdfUrl },
			{ label: $t('extraits.listenAudio'), href: audioUrl },
			{ label: $t('extraits.readTranscript'), href: transcriptionUrl }
		].filter((link) => link.href)
	);
	let sourceGroups = $derived([
		{
			kind: 'sermon',
			label: $t('extraits.sermons'),
			items: sourceSuggestions.filter((source) => source.kind === 'sermon')
		},
		{
			kind: 'recording',
			label: $t('extraits.rebroadcasts'),
			items: sourceSuggestions.filter((source) => source.kind === 'recording')
		}
	]);
	let previewTime = $derived.by(() => {
		const date = new Date(`${publishedAt}:00+02:00`);
		return Number.isNaN(date.getTime())
			? '--:--'
			: new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(date);
	});

	function resourceName(kind: string): string {
		return (
			(
				{
					sermon: $t('extraits.sermon'),
					live: $t('extraits.rebroadcast'),
					video: $t('extraits.video'),
					pdf: $t('extraits.pdf'),
					audio: $t('extraits.audio'),
					transcription: $t('extraits.transcription')
				} as Record<string, string>
			)[kind] ?? kind
		);
	}

	async function searchSources(query: string) {
		sourceAbort?.abort();
		const controller = new AbortController();
		sourceAbort = controller;
		sourceSearching = true;
		sourceSearchError = '';
		try {
			const response = await fetch(`/api/extraits/sources?q=${encodeURIComponent(query)}`, {
				signal: controller.signal
			});
			if (!response.ok) throw new Error($t('extraits.searchUnavailable'));
			const result = (await response.json()) as { suggestions: ExtraitSourceSuggestion[] };
			if (query !== sourceSearch.trim()) return;
			sourceSuggestions = result.suggestions;
			activeSuggestion = result.suggestions.length ? 0 : -1;
			sourceSearchOpen = true;
		} catch (cause) {
			if (cause instanceof DOMException && cause.name === 'AbortError') return;
			sourceSuggestions = [];
			sourceSearchError = cause instanceof Error ? cause.message : $t('extraits.searchFailed');
			sourceSearchOpen = true;
		} finally {
			if (sourceAbort === controller) sourceSearching = false;
		}
	}

	function queueSourceSearch(event: Event) {
		sourceSearch = (event.currentTarget as HTMLInputElement).value;
		clearTimeout(sourceSearchTimer);
		sourceAbort?.abort();
		sourceSearchError = '';
		activeSuggestion = -1;
		if (sourceSearch.trim().length < 2) {
			sourceSuggestions = [];
			sourceSearchOpen = false;
			sourceSearching = false;
			return;
		}
		sourceSearching = true;
		sourceSearchTimer = setTimeout(() => void searchSources(sourceSearch.trim()), 250);
	}

	function selectSource(source: ExtraitSourceSuggestion) {
		const selected = selectedSourceValues(source);
		sourceKind = selected.sourceKind;
		sourceId = selected.sourceId;
		sourceTitle = selected.sourceTitle;
		sourceSearch = source.title;
		sermonUrl = selected.sermonUrl;
		liveUrl = selected.liveUrl;
		videoUrl = selected.videoUrl;
		pdfUrl = selected.pdfUrl;
		audioUrl = selected.audioUrl;
		transcriptionUrl = selected.transcriptionUrl;
		sourceSuggestions = [];
		sourceSearchOpen = false;
		activeSuggestion = -1;
	}

	function changeSource() {
		sourceKind = '';
		sourceId = '';
		sourceSearch = '';
		sourceSuggestions = [];
		sourceSearchOpen = false;
	}

	function sourceSearchKeydown(event: KeyboardEvent) {
		if (!sourceSearchOpen || !sourceSuggestions.length) return;
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			activeSuggestion = Math.min(activeSuggestion + 1, sourceSuggestions.length - 1);
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			activeSuggestion = Math.max(activeSuggestion - 1, 0);
		} else if (event.key === 'Enter' && activeSuggestion >= 0) {
			event.preventDefault();
			selectSource(sourceSuggestions[activeSuggestion]);
		} else if (event.key === 'Escape') {
			sourceSearchOpen = false;
		}
	}

	async function wrap(startMarker: string, endMarker = startMarker) {
		const start = bodyField.selectionStart;
		const end = bodyField.selectionEnd;
		const selection = body.slice(start, end);
		body = `${body.slice(0, start)}${startMarker}${selection}${endMarker}${body.slice(end)}`;
		await tick();
		bodyField.focus();
		bodyField.setSelectionRange(start + startMarker.length, end + startMarker.length);
	}

	async function quoteSelection() {
		const start = bodyField.selectionStart;
		const end = bodyField.selectionEnd;
		const selection = body.slice(start, end) || $t('extraits.quoteFallback');
		const quoted = selection
			.split('\n')
			.map((line: string) => `> ${line}`)
			.join('\n');
		body = `${body.slice(0, start)}${quoted}${body.slice(end)}`;
		await tick();
		bodyField.focus();
		bodyField.setSelectionRange(start, start + quoted.length);
	}

	async function uploadImage(event: Event) {
		const file = (event.currentTarget as HTMLInputElement).files?.[0];
		if (!file) return;
		uploadError = '';
		uploading = true;
		const localPreview = URL.createObjectURL(file);
		imagePreview = localPreview;

		try {
			const bitmap = await createImageBitmap(file);
			imageWidth = String(bitmap.width);
			imageHeight = String(bitmap.height);
			bitmap.close();

			const response = await fetch('/api/extraits/image', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ contentType: file.type, size: file.size })
			});
			if (!response.ok)
				throw new Error((await response.text()) || $t('extraits.prepareImageError'));
			const upload = (await response.json()) as {
				uploadUrl: string;
				key: string;
				publicUrl: string;
			};
			const put = await fetch(upload.uploadUrl, {
				method: 'PUT',
				headers: { 'content-type': file.type },
				body: file
			});
			if (!put.ok) throw new Error($t('extraits.uploadImageError'));
			imageUrl = upload.publicUrl;
			imageKey = upload.key;
		} catch (cause) {
			imageUrl = '';
			imageKey = '';
			uploadError = cause instanceof Error ? cause.message : $t('extraits.uploadImageError');
		} finally {
			uploading = false;
			URL.revokeObjectURL(localPreview);
			if (imageUrl) imagePreview = imageUrl;
		}
	}
</script>

<svelte:head>
	<title>{edit ? $t('extraits.pageTitleEdit') : $t('extraits.pageTitleNew')}</title>
</svelte:head>

<header class="mb-6 flex flex-col gap-4 sm:mb-7 sm:flex-row sm:items-end sm:justify-between">
	<div>
		<p class="mb-2 text-[10px] font-bold uppercase tracking-[0.22em] text-primary">
			{$t('extraits.eyebrow')}
		</p>
		<h1 class="font-display text-3xl font-semibold leading-none text-stone-800 sm:text-4xl">
			{edit ? $t('extraits.editTitle') : $t('extraits.newTitle')}
		</h1>
		<p class="mt-2 text-sm text-stone-500">
			{$t('extraits.subtitle')}
		</p>
	</div>
	<a
		href="https://missionnaire.net/extraits"
		target="_blank"
		rel="noreferrer"
		class="admin-btn-secondary h-11 justify-center sm:h-9"
	>
		{$t('extraits.viewPublicPage')}
	</a>
</header>

{#if data.saved}
	<div
		role="status"
		class="mb-6 border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800"
	>
		{data.saved === 'published' ? $t('extraits.savedPublished') : $t('extraits.savedDraft')}
	</div>
{/if}

{#if data.managed}
	<div
		role="status"
		class="mb-6 border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800"
	>
		{data.managed === 'deleted'
			? $t('extraits.managedDeleted')
			: data.managed === 'hidden'
				? $t('extraits.managedHidden')
				: $t('extraits.managedPublished')}
	</div>
{/if}

{#if form?.error}
	<div role="alert" class="mb-6 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
		{form.error}
	</div>
{/if}

<form
	method="POST"
	action="?/save"
	class="editor-form grid items-start gap-5 md:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_minmax(360px,520px)] xl:gap-7"
	use:enhance={() => {
		submitting = true;
		return async ({ update }) => {
			submitting = false;
			await update();
		};
	}}
>
	<input type="hidden" name="postId" value={edit?.id ?? ''} />
	<input type="hidden" name="imageUrl" value={imageUrl} />
	<input type="hidden" name="imageKey" value={imageKey} />
	<input type="hidden" name="imageWidth" value={imageWidth} />
	<input type="hidden" name="imageHeight" value={imageHeight} />
	<input type="hidden" name="sourceKind" value={sourceKind} />
	<input type="hidden" name="sourceId" value={sourceId} />

	<div class="grid gap-4 sm:gap-5">
		<section class="border border-stone-200/70 bg-white/65 p-4 sm:p-6">
			<div class="grid gap-5">
				<div>
					<label for="sourceSearch" class="admin-label">{$t('extraits.findSource')}</label>
					{#if sourceKind && sourceId}
						<div class="selected-source">
							<div class="min-w-0 flex-1">
								<p class="text-xs font-semibold text-primary">{$t('extraits.linkedSource')}</p>
								<p class="mt-1 line-clamp-2 text-sm font-medium leading-5 text-stone-800">
									{sourceTitle}
								</p>
								<div class="mt-2 flex flex-wrap gap-1.5">
									{#each previewLinks as link}
										<span class="resource-chip">{link.label}</span>
									{/each}
								</div>
							</div>
							<button type="button" class="source-change" onclick={changeSource}
								>{$t('extraits.change')}</button
							>
						</div>
					{:else}
						<div class="source-search-wrap">
							<div class="relative">
								<svg class="source-search-icon" aria-hidden="true" viewBox="0 0 24 24">
									<circle cx="11" cy="11" r="6" />
									<path d="m16 16 4 4" />
								</svg>
								<input
									id="sourceSearch"
									class="admin-input !h-12 !pl-11 !pr-10"
									value={sourceSearch}
									placeholder={$t('extraits.sourcePlaceholder')}
									autocomplete="off"
									role="combobox"
									aria-autocomplete="list"
									aria-expanded={sourceSearchOpen}
									aria-controls="source-suggestions"
									aria-activedescendant={activeSuggestion >= 0
										? `source-option-${activeSuggestion}`
										: undefined}
									oninput={queueSourceSearch}
									onkeydown={sourceSearchKeydown}
									onfocus={() => {
										if (sourceSuggestions.length) sourceSearchOpen = true;
									}}
									onblur={() => setTimeout(() => (sourceSearchOpen = false), 150)}
								/>
								{#if sourceSearching}<span
										class="source-spinner"
										aria-label={$t('extraits.searching')}
									></span>{/if}
							</div>

							{#if sourceSearchOpen}
								<div
									id="source-suggestions"
									class="source-results"
									role="listbox"
									aria-label={$t('extraits.sourcesFound')}
								>
									{#if sourceSearchError}
										<p role="alert" class="p-4 text-sm text-red-700">{sourceSearchError}</p>
									{:else if !sourceSearching && !sourceSuggestions.length}
										<p class="p-4 text-sm text-stone-500">
											{$t('extraits.noSourceFound')}
										</p>
									{:else}
										{#each sourceGroups as group}
											{#if group.items.length}
												<section
													class="source-group"
													role="group"
													aria-labelledby={`source-group-${group.kind}`}
												>
													<p id={`source-group-${group.kind}`} class="source-group-title">
														{group.label}<span>{group.items.length}</span>
													</p>
													{#each group.items as source (`${source.kind}:${source.id}`)}
														{@const index = sourceSuggestions.indexOf(source)}
														<button
															id={`source-option-${index}`}
															type="button"
															role="option"
															aria-selected={activeSuggestion === index}
															class:active={activeSuggestion === index}
															onmouseenter={() => (activeSuggestion = index)}
															onmousedown={(event) => event.preventDefault()}
															onclick={() => selectSource(source)}
														>
															<strong>{source.title}</strong>
															<small>{source.subtitle}</small>
															<span class="mt-2 flex flex-wrap gap-1.5">
																{#each source.links as link}<span class="resource-chip"
																		>{resourceName(link.kind)}</span
																	>{/each}
															</span>
														</button>
													{/each}
												</section>
											{/if}
										{/each}
									{/if}
								</div>
							{/if}
						</div>
						<p class="mt-2 text-xs leading-5 text-stone-500">
							{$t('extraits.chooseSourceHelp')}
						</p>
					{/if}
				</div>

				<div>
					<label for="sourceTitle" class="admin-label">{$t('extraits.displayTitle')}</label>
					<input
						id="sourceTitle"
						name="sourceTitle"
						class="admin-input"
						required
						maxlength="180"
						bind:value={sourceTitle}
						placeholder={$t('extraits.displayTitlePlaceholder')}
					/>
				</div>

				<div>
					<label for="publishedAt" class="admin-label">{$t('extraits.dateTime')}</label>
					<input
						id="publishedAt"
						name="publishedAt"
						type="datetime-local"
						class="admin-input"
						required
						bind:value={publishedAt}
					/>
				</div>

				<div>
					<label for="image" class="admin-label">{$t('extraits.image')}</label>
					<label
						class="flex min-h-28 cursor-pointer items-center justify-center border border-dashed border-stone-300 bg-stone-50 px-5 text-center transition hover:border-primary hover:bg-orange-50/40"
					>
						<input
							id="image"
							type="file"
							accept="image/jpeg,image/png,image/webp"
							class="sr-only"
							onchange={uploadImage}
						/>
						<span class="text-sm text-stone-600">
							{uploading
								? $t('extraits.uploading')
								: imageUrl
									? $t('extraits.replaceImage')
									: $t('extraits.chooseImage')}
						</span>
					</label>
					{#if uploadError}<p class="mt-2 text-sm text-red-700">{uploadError}</p>{/if}
				</div>

				<div>
					<div
						class="mb-2 flex flex-col items-start gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
					>
						<label for="body" class="admin-label !mb-0">{$t('extraits.bodyLabel')}</label>
						<div class="flex gap-1" aria-label={$t('extraits.formatting')}>
							<button
								type="button"
								class="format-button font-bold"
								onclick={() => wrap('*')}
								aria-label={$t('extraits.boldAction')}
								title={$t('extraits.bold')}>B</button
							>
							<button
								type="button"
								class="format-button italic"
								onclick={() => wrap('_')}
								aria-label={$t('extraits.italicAction')}
								title={$t('extraits.italic')}>I</button
							>
							<button
								type="button"
								class="format-button line-through"
								onclick={() => wrap('~')}
								aria-label={$t('extraits.strikethroughAction')}
								title={$t('extraits.strikethrough')}>S</button
							>
							<button
								type="button"
								class="format-button font-mono"
								onclick={() => wrap('`')}
								aria-label={$t('extraits.monospaceAction')}
								title={$t('extraits.monospace')}>&lt;/&gt;</button
							>
							<button
								type="button"
								class="format-button"
								onclick={quoteSelection}
								aria-label={$t('extraits.quoteAction')}
								title={$t('extraits.quote')}>❯</button
							>
						</div>
					</div>
					<textarea
						id="body"
						name="body"
						class="admin-input min-h-56 resize-y sm:min-h-64"
						required
						maxlength="50000"
						bind:this={bodyField}
						bind:value={body}
						placeholder={$t('extraits.bodyPlaceholder')}
					></textarea>
					<p class="mt-2 text-xs text-stone-400">
						{$t('extraits.formatHelp')}
					</p>
				</div>
			</div>
		</section>

		<details class="links-section border border-stone-200/70 bg-white/65">
			<summary
				class="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 p-4 sm:px-6"
			>
				<div>
					<h2 class="font-display text-2xl font-semibold text-stone-800">
						{$t('extraits.adjustLinks')}
					</h2>
					<p class="mt-0.5 text-sm text-stone-500">
						{previewLinks.length
							? $t(
									previewLinks.length === 1
										? 'extraits.resourceCountOne'
										: 'extraits.resourceCountMany',
									{
										count: previewLinks.length
									}
								)
							: $t('extraits.manualCorrection')}
					</p>
				</div>
				<span
					class="links-chevron flex h-11 w-11 shrink-0 items-center justify-center border border-stone-200 bg-white text-lg text-stone-500"
					aria-hidden="true">⌄</span
				>
			</summary>
			<div class="grid gap-4 border-t border-stone-100 px-4 pb-5 pt-4 sm:grid-cols-2 sm:px-6">
				<label class="admin-label"
					>{$t('extraits.sermon')}<input
						name="sermonUrl"
						class="admin-input mt-1.5"
						bind:value={sermonUrl}
						placeholder="/predications/…"
					/></label
				>
				<label class="admin-label"
					>{$t('extraits.rebroadcast')}<input
						name="liveUrl"
						class="admin-input mt-1.5"
						bind:value={liveUrl}
						placeholder="/live/rediffusions/…"
					/></label
				>
				<label class="admin-label"
					>{$t('extraits.video')}<input
						name="videoUrl"
						class="admin-input mt-1.5"
						bind:value={videoUrl}
						placeholder="https://…"
					/></label
				>
				<label class="admin-label"
					>{$t('extraits.pdf')}<input
						name="pdfUrl"
						class="admin-input mt-1.5"
						bind:value={pdfUrl}
						placeholder="https://…pdf"
					/></label
				>
				<label class="admin-label"
					>{$t('extraits.audio')}<input
						name="audioUrl"
						class="admin-input mt-1.5"
						bind:value={audioUrl}
						placeholder="https://…mp3"
					/></label
				>
				<label class="admin-label"
					>{$t('extraits.transcription')}<input
						name="transcriptionUrl"
						class="admin-input mt-1.5"
						bind:value={transcriptionUrl}
						placeholder="/lecture/…"
					/></label
				>
			</div>
		</details>
	</div>

	<aside class="md:sticky md:top-6 xl:top-8">
		<div class="mb-3 flex items-center justify-between px-1">
			<p class="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-500">
				{$t('extraits.livePreview')}
			</p>
			<span class="h-2 w-2 rounded-full bg-green-500" title={$t('extraits.previewCurrent')}></span>
		</div>
		<article class="preview-card">
			{#if imagePreview}
				<figure><img src={imagePreview} alt={sourceTitle || $t('extraits.previewAlt')} /></figure>
			{:else}
				<div class="preview-empty">{$t('extraits.imagePlaceholder')}</div>
			{/if}
			<div class="preview-message">
				<div class="preview-copy">{@html bodyHtml}</div>
				{#if previewLinks.length}
					<nav class="preview-links" aria-label={$t('extraits.previewLinks')}>
						{#each previewLinks as link}<span>{link.label}</span>{/each}
					</nav>
				{/if}
				<footer>
					<span class="truncate">{sourceTitle || $t('extraits.sourceTitleFallback')}</span>
					<div><time>{previewTime}</time><span class="share">↪ {$t('extraits.share')}</span></div>
				</footer>
			</div>
		</article>

		<div
			class="action-bar sticky bottom-0 z-20 mt-4 grid grid-cols-2 gap-2 border border-stone-200 bg-[#faf8f3]/95 p-2 shadow-[0_-8px_24px_rgba(41,37,36,0.08)] backdrop-blur-sm xl:static xl:border-0 xl:bg-transparent xl:p-0 xl:shadow-none"
		>
			<button
				type="submit"
				name="intent"
				value="draft"
				class="admin-btn-secondary w-full justify-center px-3"
				disabled={uploading || submitting}
			>
				{#if submitting}
					{$t('extraits.saving')}
				{:else}
					<span class="xl:hidden">{$t('extraits.save')}</span>
					<span class="hidden xl:inline">{$t('extraits.saveDraft')}</span>
				{/if}
			</button>
			<button
				type="submit"
				name="intent"
				value="publish"
				class="admin-btn-primary w-full justify-center px-3"
				disabled={uploading || submitting}
			>
				{$t('extraits.publish')}
			</button>
		</div>

		{#if data.recent.length}
			<section class="mt-7 border-t border-stone-200 pt-5">
				<h2 class="text-xs font-bold uppercase tracking-[0.18em] text-stone-500">
					{$t('extraits.recentPublications')}
				</h2>
				<div class="mt-3 grid gap-2">
					{#each data.recent as post}
						<article class="border border-stone-200/70 bg-white/60 p-3 text-sm">
							<div class="flex items-start justify-between gap-3">
								<p class="line-clamp-2 min-w-0 text-stone-700">{post.sourceTitle}</p>
								<span
									class="shrink-0 text-[10px] font-bold uppercase tracking-wider {post.status ===
									'published'
										? 'text-green-700'
										: 'text-amber-700'}"
								>
									{post.status === 'published' ? $t('extraits.published') : $t('extraits.draft')}
								</span>
							</div>
							<div class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs font-semibold">
								<a
									href={`/extraits?edit=${post.id}`}
									data-sveltekit-reload
									class="text-stone-600 hover:text-primary">{$t('extraits.edit')}</a
								>
								{#if post.status === 'published'}
									<a
										href={`https://missionnaire.net/extraits/${post.id}`}
										target="_blank"
										rel="noreferrer"
										class="text-stone-600 hover:text-primary">{$t('extraits.view')}</a
									>
								{/if}
								<button
									type="submit"
									name="targetId"
									value={post.id}
									formaction="?/toggle"
									formnovalidate
									class="text-stone-600 hover:text-primary"
								>
									{post.status === 'published' ? $t('extraits.hide') : $t('extraits.publish')}
								</button>
								<button
									type="submit"
									name="targetId"
									value={post.id}
									formaction="?/delete"
									formnovalidate
									class="ml-auto text-red-700 hover:text-red-900"
									onclick={(event) => {
										if (!confirm($t('extraits.confirmDelete', { title: post.sourceTitle })))
											event.preventDefault();
									}}
								>
									{$t('extraits.delete')}
								</button>
							</div>
						</article>
					{/each}
				</div>
			</section>
		{/if}
	</aside>
</form>

<style>
	.source-search-wrap {
		position: relative;
	}
	.source-search-icon {
		position: absolute;
		top: 50%;
		left: 0.95rem;
		z-index: 1;
		width: 1.15rem;
		height: 1.15rem;
		transform: translateY(-50%);
		fill: none;
		stroke: #78716c;
		stroke-linecap: round;
		stroke-width: 1.8;
	}
	.source-spinner {
		position: absolute;
		top: 50%;
		right: 0.9rem;
		width: 1rem;
		height: 1rem;
		transform: translateY(-50%);
		border: 2px solid #fed7aa;
		border-right-color: #ff880c;
		border-radius: 999px;
		animation: source-spin 0.7s linear infinite;
	}
	.source-results {
		position: absolute;
		z-index: 40;
		top: calc(100% + 0.35rem);
		left: 0;
		right: 0;
		max-height: min(25rem, 60vh);
		overflow-y: auto;
		border: 1px solid #d6d3d1;
		background: #fff;
		box-shadow: 0 14px 32px rgb(41 37 36 / 14%);
	}
	.source-group + .source-group {
		border-top: 1px solid #d6d3d1;
	}
	.source-group-title {
		position: sticky;
		top: 0;
		z-index: 1;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.55rem 1rem;
		font-size: 0.68rem;
		font-weight: 700;
		color: #78716c;
		background: #faf8f3;
	}
	.source-group-title span {
		color: #a8a29e;
	}
	.source-group button {
		display: block;
		width: 100%;
		min-height: 4.75rem;
		padding: 0.8rem 1rem;
		border-bottom: 1px solid #f0ece6;
		text-align: left;
		background: #fff;
	}
	.source-group button:last-child {
		border-bottom: 0;
	}
	.source-group button:hover,
	.source-group button.active {
		background: #fff7ed;
	}
	.source-results strong,
	.source-results small {
		display: block;
	}
	.source-results strong {
		margin-top: 0.18rem;
		font-size: 0.88rem;
		font-weight: 600;
		line-height: 1.35;
		color: #292524;
	}
	.source-results small {
		margin-top: 0.2rem;
		font-size: 0.72rem;
		line-height: 1.35;
		color: #78716c;
	}
	.resource-chip {
		display: inline-flex;
		align-items: center;
		min-height: 1.45rem;
		padding: 0.18rem 0.45rem;
		border: 1px solid #fed7aa;
		border-radius: 999px;
		font-size: 0.62rem;
		font-weight: 650;
		line-height: 1;
		color: #9a4d00;
		background: #fff7ed;
	}
	.selected-source {
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
		padding: 0.9rem;
		border: 1px solid #fed7aa;
		background: #fffaf3;
	}
	.source-change {
		min-width: 4.5rem;
		min-height: 2.75rem;
		padding-inline: 0.65rem;
		border: 1px solid #fed7aa;
		font-size: 0.72rem;
		font-weight: 650;
		color: #9a4d00;
		background: #fff;
	}
	@keyframes source-spin {
		to {
			transform: translateY(-50%) rotate(360deg);
		}
	}
	.format-button {
		display: inline-flex;
		width: 2.75rem;
		height: 2.75rem;
		align-items: center;
		justify-content: center;
		border: 1px solid #e7e5e4;
		background: #fff;
		font-size: 0.72rem;
		color: #57534e;
	}
	.format-button:hover,
	.format-button:focus-visible {
		border-color: #ff880c;
		color: #9a4d00;
	}
	.links-section summary::-webkit-details-marker {
		display: none;
	}
	.links-section[open] .links-chevron {
		transform: rotate(180deg);
	}
	.links-chevron {
		transition: transform 160ms ease;
	}
	.preview-card {
		overflow: hidden;
		border: 1px solid #ded9cf;
		border-radius: 0.55rem;
		background: white;
		box-shadow: 0 8px 30px rgb(41 37 36 / 10%);
	}
	figure {
		margin: 0;
		background: #1c1917;
		line-height: 0;
	}
	figure img {
		display: block;
		width: 100%;
		height: auto;
	}
	.preview-empty {
		display: grid;
		min-height: 10rem;
		place-items: center;
		background: #eeeae2;
		color: #a8a29e;
		font-size: 0.78rem;
	}
	.preview-message {
		padding: 0.72rem 0.82rem 0.55rem;
	}
	.preview-copy {
		overflow-wrap: anywhere;
		font-size: 0.94rem;
		line-height: 1.48;
		color: #292524;
	}
	.preview-copy :global(strong) {
		font-weight: 700;
		color: #1c1917;
	}
	.preview-copy :global(em) {
		font-style: italic;
	}
	.preview-copy :global(del) {
		color: #78716c;
	}
	.preview-copy :global(code) {
		padding: 0.03em 0.16em;
		font-family: ui-monospace, monospace;
		font-size: 0.86em;
		color: #7c2d12;
		background: #fff7ed;
	}
	.preview-copy :global(blockquote) {
		margin: 0.35rem 0;
		padding-left: 0.65rem;
		border-left: 3px solid #f59e0b;
		color: #57534e;
	}
	.preview-links {
		display: flex;
		flex-wrap: wrap;
		gap: 0.42rem;
		margin-top: 0.75rem;
		padding-top: 0.65rem;
		border-top: 1px solid #e7e5e4;
	}
	.preview-links span {
		padding: 0.38rem 0.65rem;
		border: 1px solid #fed7aa;
		border-radius: 999px;
		background: #fff7ed;
		font-size: 0.7rem;
		font-weight: 650;
		color: #9a4d00;
	}
	footer {
		display: flex;
		justify-content: space-between;
		gap: 0.75rem;
		align-items: flex-end;
		margin-top: 0.55rem;
		font-size: 0.66rem;
		color: #78716c;
	}
	footer > span {
		max-width: 62%;
	}
	footer div {
		display: flex;
		flex: none;
		align-items: center;
		gap: 0.5rem;
	}
	.share {
		padding: 0.3rem 0.55rem;
		border: 1px solid #fed7aa;
		border-radius: 999px;
		font-weight: 700;
		color: #9a4d00;
		background: #fff7ed;
	}
	@media (min-width: 640px) {
		.preview-empty {
			min-height: 14rem;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.links-chevron,
		.source-spinner {
			transition: none;
			animation: none;
		}
	}
</style>
