<script lang="ts">
	export let targetId = '';

	type Action = 'bold' | 'underline' | 'strike' | 'quote' | 'unorderedList' | 'orderedList';

	const actions: Array<{ action: Action; label: string; title: string }> = [
		{ action: 'bold', label: 'B', title: 'Gras' },
		{ action: 'underline', label: 'U', title: 'Souligner' },
		{ action: 'strike', label: 'S', title: 'Barrer' },
		{ action: 'quote', label: '"', title: 'Citation' },
		{ action: 'unorderedList', label: '•', title: 'Liste à puces' },
		{ action: 'orderedList', label: '1.', title: 'Liste numérotée' }
	];

	function wrapSelection(action: Action) {
		const textarea = document.getElementById(targetId) as HTMLTextAreaElement | null;
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

		textarea.setRangeText(replacement, start, end, 'end');
		textarea.focus();
		if (!selected) {
			const innerStart = start + selectionOffset;
			textarea.setSelectionRange(innerStart, innerStart + fallback.length);
		}
		textarea.dispatchEvent(new Event('input', { bubbles: true }));
	}
</script>

<div class="flex flex-wrap items-center gap-1 border border-stone-200 bg-white/70 p-1.5">
	{#each actions as item}
		<button
			type="button"
			class="flex h-8 w-8 items-center justify-center border border-transparent text-sm font-bold text-stone-600 transition hover:border-primary/30 hover:bg-primary/10 hover:text-primary"
			title={item.title}
			aria-label={item.title}
			onclick={() => wrapSelection(item.action)}
		>
			{#if item.action === 'underline'}
				<span class="underline">{item.label}</span>
			{:else if item.action === 'strike'}
				<span class="line-through">{item.label}</span>
			{:else}
				{item.label}
			{/if}
		</button>
	{/each}
</div>
