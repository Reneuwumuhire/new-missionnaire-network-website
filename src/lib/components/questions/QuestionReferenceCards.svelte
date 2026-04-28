<script lang="ts">
	import type { QuestionReference } from '$lib/models/questions';
	// @ts-ignore - svelte-icons-pack ships loose icon typings in this project.
	import Icon from 'svelte-icons-pack/Icon.svelte';
	import IoBookOutline from 'svelte-icons-pack/io/IoBookOutline';
	import IoDocumentTextOutline from 'svelte-icons-pack/io/IoDocumentTextOutline';
	import IoMusicalNotesOutline from 'svelte-icons-pack/io/IoMusicalNotesOutline';
	import IoPlayCircleOutline from 'svelte-icons-pack/io/IoPlayCircleOutline';
	import IoVideocamOutline from 'svelte-icons-pack/io/IoVideocamOutline';

	export let references: QuestionReference[] = [];

	const typeLabel: Record<string, string> = {
		pdf: 'PDF',
		audio: 'Audio',
		video: 'Vidéo',
		sermon: 'Prédication',
		text: 'Texte',
		music: 'Cantique',
		bible: 'Bible'
	};

	const typeIcon: Record<string, unknown> = {
		pdf: IoDocumentTextOutline,
		audio: IoPlayCircleOutline,
		video: IoVideocamOutline,
		sermon: IoBookOutline,
		text: IoDocumentTextOutline,
		music: IoMusicalNotesOutline,
		bible: IoBookOutline
	};

	function metadataLine(reference: QuestionReference): string {
		const parts = [
			typeof reference.metadata.author === 'string' ? reference.metadata.author : null,
			typeof reference.metadata.artist === 'string' ? reference.metadata.artist : null,
			typeof reference.metadata.translation === 'string' ? reference.metadata.translation : null,
			typeof reference.metadata.date === 'string' ? reference.metadata.date : null,
			typeof reference.metadata.duration === 'string' ? reference.metadata.duration : null
		].filter(Boolean);
		return parts.join(' - ');
	}

	function referenceText(reference: QuestionReference): string {
		return typeof reference.metadata.text === 'string' ? reference.metadata.text : '';
	}
</script>

{#if references.length > 0}
	<div class="grid gap-2 sm:grid-cols-2">
		{#each references as reference}
			<svelte:element
				this={reference.href ? 'a' : 'article'}
				href={reference.href || undefined}
				target={reference.href ? '_blank' : undefined}
				rel={reference.href ? 'noreferrer' : undefined}
				class="group border border-stone-200/70 bg-white/70 p-3 transition-all hover:border-missionnaire/40 hover:bg-white focus-visible:outline-missionnaire"
			>
				<div class="flex items-start gap-2.5">
					<span
						class="flex h-8 w-8 shrink-0 items-center justify-center bg-missionnaire-50 text-missionnaire"
						aria-hidden="true"
					>
						<Icon src={typeIcon[reference.type] ?? IoDocumentTextOutline} className="h-4 w-4" />
					</span>
					<div class="min-w-0">
						<p class="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-missionnaire">
							{typeLabel[reference.type] ?? reference.type}
						</p>
						<p class="line-clamp-2 text-sm font-semibold text-stone-800 group-hover:text-missionnaire">
							{reference.title}
						</p>
						{#if metadataLine(reference)}
							<p class="mt-1 line-clamp-1 text-xs text-stone-500">{metadataLine(reference)}</p>
						{/if}
						{#if referenceText(reference)}
							<p class="mt-1.5 line-clamp-3 whitespace-pre-line text-xs leading-5 text-stone-600">
								{referenceText(reference)}
							</p>
						{/if}
					</div>
				</div>
			</svelte:element>
		{/each}
	</div>
{/if}
