<script lang="ts">
	import { onMount, tick } from 'svelte';

	export let targetId = '';

	type Action = 'bold' | 'italic' | 'underline' | 'strike' | 'link' | 'quote' | 'unorderedList' | 'orderedList';

	const actions: Array<{ action: Action; title: string }> = [
		{ action: 'bold', title: 'Gras' },
		{ action: 'italic', title: 'Italique' },
		{ action: 'underline', title: 'Souligner' },
		{ action: 'strike', title: 'Barrer' },
		{ action: 'link', title: 'Lien vidéo ou fichier' },
		{ action: 'quote', title: 'Citation' },
		{ action: 'unorderedList', title: 'Liste à puces' },
		{ action: 'orderedList', title: 'Liste numérotée' }
	];

	let linkModalOpen = false;
	let linkText = '';
	let linkHref = '';
	let linkError = '';
	let linkStart = 0;
	let linkEnd = 0;
	let linkTextInput: HTMLInputElement;
	let linkHrefInput: HTMLInputElement;
	let detachPasteListener: (() => void) | null = null;

	$: modalId = `link-modal-${targetId}`;
	$: linkTextId = `link-text-${targetId}`;
	$: linkHrefId = `link-href-${targetId}`;

	onMount(() => {
		let cancelled = false;

		tick().then(() => {
			if (cancelled) return;
			const textarea = getTextarea();
			if (!textarea) return;

			const handlePaste = (event: ClipboardEvent) => handleTextareaPaste(event, textarea);
			textarea.addEventListener('paste', handlePaste);
			detachPasteListener = () => textarea.removeEventListener('paste', handlePaste);
		});

		return () => {
			cancelled = true;
			detachPasteListener?.();
		};
	});

	function getTextarea(): HTMLTextAreaElement | null {
		return document.getElementById(targetId) as HTMLTextAreaElement | null;
	}

	function normalizeHref(value: string): string {
		const trimmed = value.trim();
		if (!trimmed) return '';
		if (trimmed.startsWith('/')) return trimmed.startsWith('//') ? '' : trimmed;

		const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
		try {
			const url = new URL(candidate);
			return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : '';
		} catch {
			return '';
		}
	}

	function markdownLabel(value: string): string {
		return value.replaceAll('[', '(').replaceAll(']', ')').replace(/\s+/g, ' ').trim();
	}

	function buildMarkdownLink(text: string, href: string): string {
		return `[${markdownLabel(text)}](${href})`;
	}

	function replaceTextareaRange(textarea: HTMLTextAreaElement, start: number, end: number, replacement: string) {
		textarea.setRangeText(replacement, start, end, 'end');
		textarea.focus();
		textarea.dispatchEvent(new Event('input', { bubbles: true }));
	}

	function handleTextareaPaste(event: ClipboardEvent, textarea: HTMLTextAreaElement) {
		const start = textarea.selectionStart ?? 0;
		const end = textarea.selectionEnd ?? start;
		if (start === end) return;

		const selected = textarea.value.slice(start, end).trim();
		const pasted = event.clipboardData?.getData('text/plain') ?? '';
		const href = normalizeHref(pasted);
		if (!selected || selected.includes('\n') || !href) return;

		event.preventDefault();
		replaceTextareaRange(textarea, start, end, buildMarkdownLink(selected, href));
	}

	async function readClipboardHref(): Promise<string> {
		try {
			const clipboardText = await navigator.clipboard?.readText?.();
			return normalizeHref(clipboardText ?? '');
		} catch {
			return '';
		}
	}

	async function linkSelectionFromClipboard(textarea: HTMLTextAreaElement): Promise<boolean> {
		const start = textarea.selectionStart ?? 0;
		const end = textarea.selectionEnd ?? start;
		if (start === end) return false;

		const selected = textarea.value.slice(start, end).trim();
		if (!selected || selected.includes('\n')) return false;

		const href = await readClipboardHref();
		if (!href) return false;

		replaceTextareaRange(textarea, start, end, buildMarkdownLink(selected, href));
		return true;
	}

	async function openLinkModal() {
		const textarea = getTextarea();
		if (!textarea) return;

		linkStart = textarea.selectionStart ?? 0;
		linkEnd = textarea.selectionEnd ?? linkStart;
		const selected = textarea.value.slice(linkStart, linkEnd).trim();
		const selectedHref = normalizeHref(selected);
		linkText = selected && !selectedHref ? selected : 'texte du lien';
		linkHref = selectedHref;
		linkError = '';
		linkModalOpen = true;

		await tick();
		const target = selected && !selectedHref ? linkHrefInput : linkTextInput;
		target?.focus();
		target?.select();
	}

	function closeLinkModal() {
		linkModalOpen = false;
		linkError = '';
		getTextarea()?.focus();
	}

	function applyLink() {
		const textarea = getTextarea();
		const href = normalizeHref(linkHref);
		const text = markdownLabel(linkText || linkHref);

		if (!textarea) return;
		if (!text) {
			linkError = 'Indiquez le texte du lien.';
			return;
		}
		if (!href) {
			linkError = 'Indiquez une adresse valide.';
			return;
		}

		replaceTextareaRange(textarea, linkStart, linkEnd, buildMarkdownLink(text, href));
		linkModalOpen = false;
	}

	async function wrapSelection(action: Action) {
		if (action === 'link') {
			const textarea = getTextarea();
			if (textarea && (await linkSelectionFromClipboard(textarea))) return;
			openLinkModal();
			return;
		}

		const textarea = getTextarea();
		if (!textarea) return;

		const start = textarea.selectionStart ?? 0;
		const end = textarea.selectionEnd ?? start;
		const selected = textarea.value.slice(start, end);
		const fallback = action === 'quote' ? 'citation' : action === 'unorderedList' || action === 'orderedList' ? 'élément' : 'texte';
		const value = selected || fallback;
		let replacement = value;
		let selectionOffset = 0;

		if (action === 'bold') {
			replacement = `**${value}**`;
			selectionOffset = 2;
		} else if (action === 'italic') {
			replacement = `*${value}*`;
			selectionOffset = 1;
		} else if (action === 'underline') {
			replacement = `__${value}__`;
			selectionOffset = 2;
		} else if (action === 'strike') {
			replacement = `~~${value}~~`;
			selectionOffset = 2;
		} else if (action === 'quote') {
			const lines = value.split('\n').map((line) => `> ${line || ' '}`);
			replacement = lines.join('\n');
			selectionOffset = 2;
		} else if (action === 'unorderedList') {
			const lines = value.split('\n').map((line) => `- ${line || fallback}`);
			replacement = lines.join('\n');
			selectionOffset = 2;
		} else {
			const lines = value.split('\n').map((line, index) => `${index + 1}. ${line || fallback}`);
			replacement = lines.join('\n');
			selectionOffset = 3;
		}

		replaceTextareaRange(textarea, start, end, replacement);
		if (!selected) {
			const innerStart = start + selectionOffset;
			textarea.setSelectionRange(innerStart, innerStart + fallback.length);
		}
	}
</script>

{#snippet linkIcon()}
	<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.1" aria-hidden="true">
		<path stroke-linecap="round" stroke-linejoin="round" d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1" />
		<path stroke-linecap="round" stroke-linejoin="round" d="M14 11a5 5 0 0 0-7.1-.1l-2 2a5 5 0 0 0 7.1 7.1l1.1-1.1" />
	</svg>
{/snippet}

{#snippet quoteIcon()}
	<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
		<path stroke-linecap="round" stroke-linejoin="round" d="M8 10H5.5A2.5 2.5 0 0 0 3 12.5V16h5v-6Z" />
		<path stroke-linecap="round" stroke-linejoin="round" d="M19 10h-2.5A2.5 2.5 0 0 0 14 12.5V16h5v-6Z" />
	</svg>
{/snippet}

{#snippet unorderedListIcon()}
	<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
		<path stroke-linecap="round" stroke-linejoin="round" d="M9 7h11M9 12h11M9 17h11" />
		<path stroke-linecap="round" stroke-linejoin="round" d="M4 7h.01M4 12h.01M4 17h.01" />
	</svg>
{/snippet}

{#snippet orderedListIcon()}
	<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
		<path stroke-linecap="round" stroke-linejoin="round" d="M10 7h10M10 12h10M10 17h10" />
		<path stroke-linecap="round" stroke-linejoin="round" d="M4 6h1v4M4 10h2M4 14.5h2L4 18h2" />
	</svg>
{/snippet}

<div class="flex flex-wrap items-center gap-1 border border-stone-200 bg-white/70 p-1.5">
	{#each actions as item}
		<button
			type="button"
			class="flex h-8 w-8 items-center justify-center border border-transparent text-sm font-bold text-stone-600 transition hover:border-primary/30 hover:bg-primary/10 hover:text-primary"
			title={item.title}
			aria-label={item.title}
			onclick={() => wrapSelection(item.action)}
		>
			{#if item.action === 'bold'}
				<span class="font-serif text-[15px] font-black leading-none">B</span>
			{:else if item.action === 'underline'}
				<span class="font-serif text-[15px] font-bold leading-none underline underline-offset-2">U</span>
			{:else if item.action === 'italic'}
				<span class="font-serif text-[15px] font-bold italic leading-none">I</span>
			{:else if item.action === 'strike'}
				<span class="font-serif text-[15px] font-bold leading-none line-through">S</span>
			{:else if item.action === 'link'}
				{@render linkIcon()}
			{:else if item.action === 'quote'}
				{@render quoteIcon()}
			{:else if item.action === 'unorderedList'}
				{@render unorderedListIcon()}
			{:else}
				{@render orderedListIcon()}
			{/if}
		</button>
	{/each}
</div>

{#if linkModalOpen}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/45 px-4 py-6">
		<div
			class="w-full max-w-md border border-stone-200 bg-white shadow-2xl"
			role="dialog"
			aria-modal="true"
			aria-labelledby={modalId}
		>
			<div class="flex items-center justify-between border-b border-stone-100 px-5 py-4">
				<h2 id={modalId} class="font-display text-xl font-semibold text-stone-900">Ajouter un lien</h2>
				<button
					type="button"
					class="flex h-8 w-8 items-center justify-center text-stone-400 transition hover:bg-stone-100 hover:text-stone-900"
					aria-label="Fermer"
					onclick={closeLinkModal}
				>
					<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
						<path stroke-linecap="round" stroke-linejoin="round" d="M6 6l12 12M18 6 6 18" />
					</svg>
				</button>
			</div>

			<form
				class="grid gap-4 p-5"
				onsubmit={(event) => {
					event.preventDefault();
					applyLink();
				}}
			>
				{#if linkError}
					<p class="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{linkError}</p>
				{/if}
				<div>
					<label for={linkTextId} class="admin-label">Texte</label>
					<input
						bind:this={linkTextInput}
						bind:value={linkText}
						id={linkTextId}
						class="admin-input"
						placeholder="Texte du lien"
					/>
				</div>
				<div>
					<label for={linkHrefId} class="admin-label">Lien</label>
					<input
						bind:this={linkHrefInput}
						bind:value={linkHref}
						id={linkHrefId}
						class="admin-input"
						inputmode="url"
						placeholder="https://..."
					/>
				</div>
				<div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
					<button type="button" class="admin-btn-secondary justify-center" onclick={closeLinkModal}>Annuler</button>
					<button type="submit" class="admin-btn-primary justify-center">Insérer</button>
				</div>
			</form>
		</div>
	</div>
{/if}
