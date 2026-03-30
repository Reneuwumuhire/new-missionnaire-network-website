<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	// @ts-ignore
	import Icon from 'svelte-icons-pack/Icon.svelte';
	import BsClipboard2CheckFill from 'svelte-icons-pack/bs/BsClipboard2CheckFill';

	let selectedText = '';
	let showCopyButton = false;
	let copied = false;
	let buttonPosition = { top: 0, left: 0 };
	let selectionChangeHandler: (() => void) | null = null;

	const handleCopy = () => {
		if (selectedText) {
			navigator.clipboard
				.writeText(selectedText)
				.then(() => {
					copied = true;
					setTimeout(() => {
						copied = false;
						showCopyButton = false;
						selectedText = '';
						window.getSelection()?.removeAllRanges();
					}, 1000);
				})
				.catch((err) => {
					console.error('Failed to copy text:', err);
				});
		}
	};

	function updatePosition() {
		const selection = window.getSelection();
		if (!selection || selection.rangeCount === 0) {
			showCopyButton = false;
			return;
		}

		const text = selection.toString().trim();
		if (text.length === 0) {
			showCopyButton = false;
			selectedText = '';
			return;
		}

		const range = selection.getRangeAt(0);
		const rect = range.getBoundingClientRect();

		if (rect.width === 0 && rect.height === 0) {
			showCopyButton = false;
			return;
		}

		selectedText = text;
		buttonPosition = {
			top: rect.top - 48,
			left: rect.left + rect.width / 2
		};
		showCopyButton = true;
		copied = false;
	}

	onMount(() => {
		selectionChangeHandler = () => updatePosition();
		document.addEventListener('selectionchange', selectionChangeHandler);
	});

	onDestroy(() => {
		if (selectionChangeHandler) {
			document.removeEventListener('selectionchange', selectionChangeHandler);
		}
	});
</script>

{#if showCopyButton}
	<button
		class="fixed z-[9999] flex flex-row items-center gap-1.5 bg-slate-900 rounded-full text-white text-xs font-bold px-4 py-2.5 shadow-lg -translate-x-1/2 pointer-events-auto select-none hover:bg-slate-700 transition-colors"
		style="top: {buttonPosition.top}px; left: {buttonPosition.left}px;"
		on:mousedown|preventDefault
		on:click={handleCopy}
	>
		<Icon src={BsClipboard2CheckFill} />
		<span>{copied ? 'Copied!' : 'Copy'}</span>
	</button>
{/if}
