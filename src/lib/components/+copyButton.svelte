<script lang="ts">
	import { onMount } from 'svelte';
	// @ts-ignore
	import Icon from 'svelte-icons-pack/Icon.svelte';
	import BsClipboard2CheckFill from 'svelte-icons-pack/bs/BsClipboard2CheckFill';

	let selectedText = '';
	let showCopyButton = false;
	let buttonPosition = { top: '0px', left: '0px' }; // Button position
	const buttonOffset = 30; // Offset value to position the button above the text

	const handleCopy = () => {
		if (selectedText) {
			navigator.clipboard
				.writeText(selectedText)
				.then(() => {
					console.log('Text copied to clipboard:', selectedText);
				})
				.catch((err) => {
					console.error('Failed to copy text:', err);
				});
			selectedText = '';
			showCopyButton = false;
		}
	};

	onMount(() => {
		document.addEventListener('selectionchange', () => {
			const selection = window.getSelection();
			if (!selection) return;
			const range = selection.getRangeAt(0);
			const rect = range.getBoundingClientRect();

			buttonPosition = {
				top: (rect.top + window.scrollY - buttonOffset).toString(),
				left: (rect.left + window.scrollX + rect.width / 2).toString() // Adjust position near text horizontally
			};

			selectedText = selection.toString();
			showCopyButton = selectedText.length > 0;
		});
	});
</script>

{#if showCopyButton}
	<button
		class="copy-button flex flex-row space-x-2 items-center bg-slate-900 rounded-full text-white text-xs font-bold px-5 py-4"
		style="
      top: {buttonPosition.top}px;
      left: {buttonPosition.left}px;
      display: {showCopyButton ? 'flex' : 'hidden'}
    "
		on:click={handleCopy}
	>
		<Icon src={BsClipboard2CheckFill} />
		<span class="copy-button-icon">Copy</span>
	</button>
{/if}

<style>
	.copy-button {
		position: absolute;
		z-index: 9999; /* Ensures the button stays on top */
	}
</style>
