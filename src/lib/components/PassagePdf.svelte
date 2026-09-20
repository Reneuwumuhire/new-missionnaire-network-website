<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { passageRanges } from '$lib/utils/passageSearch';
	import { t } from '../../i18n';
	let {
		url,
		page,
		phrase,
		matchIndex,
		reveal = false,
		onunavailable
	}: {
		url: string;
		page: number;
		phrase: string;
		matchIndex: number;
		reveal?: boolean;
		onunavailable?: () => void;
	} = $props();
	let host: HTMLDivElement, canvas: HTMLCanvasElement, layer: HTMLDivElement;
	let failed = $state(false),
		loading = $state(true),
		highlighted = $state(false);
	let rectangles: { left: number; top: number; width: number; height: number }[] = $state([]);
	onMount(() => {
		let disposed = false;
		let task: import('pdfjs-dist').PDFDocumentLoadingTask | undefined;
		let render: import('pdfjs-dist').RenderTask | undefined;
		let textLayer: import('pdfjs-dist').TextLayer | undefined;
		void (async () => {
			try {
				const pdfjs = await import('pdfjs-dist');
				const { default: worker } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
				if (disposed) return;
				pdfjs.GlobalWorkerOptions.workerSrc = worker;
				task = pdfjs.getDocument({ url });
				const doc = await task.promise;
				const pdfPage = await doc.getPage(page);
				if (disposed) return;
				const viewport = pdfPage.getViewport({
					scale: Math.min(host.clientWidth, 900) / pdfPage.getViewport({ scale: 1 }).width
				});
				const ratio = Math.min(window.devicePixelRatio || 1, 2);
				canvas.width = Math.floor(viewport.width * ratio);
				canvas.height = Math.floor(viewport.height * ratio);
				host.style.width = `${viewport.width}px`;
				host.style.height = `${viewport.height}px`;
				host.style.setProperty('--total-scale-factor', String(viewport.scale));
				render = pdfPage.render({ canvas, viewport, transform: [ratio, 0, 0, ratio, 0, 0] });
				await render.promise;
				const content = await pdfPage.getTextContent();
				if (disposed) return;
				textLayer = new pdfjs.TextLayer({ textContentSource: content, container: layer, viewport });
				await textLayer.render();
				if (disposed) return;
				const strings = textLayer.textContentItemsStr;
				const range = passageRanges(strings.join(' '), phrase)[matchIndex];
				if (range) {
					let offset = 0;
					const origin = host.getBoundingClientRect();
					const boxes: typeof rectangles = [];
					strings.forEach((text, i) => {
						const start = Math.max(0, range.start - offset),
							end = Math.min(text.length, range.end - offset);
						const node = textLayer!.textDivs[i]?.firstChild;
						if (end > start && node?.nodeType === Node.TEXT_NODE) {
							const selection = document.createRange();
							selection.setStart(node, start);
							selection.setEnd(node, end);
							for (const rect of selection.getClientRects())
								boxes.push({
									left: rect.left - origin.left,
									top: rect.top - origin.top,
									width: rect.width,
									height: rect.height
								});
						}
						offset += text.length + 1;
					});
					rectangles = boxes;
					highlighted = boxes.length > 0;
				}
			} catch {
				if (!disposed) failed = true;
			} finally {
				if (!disposed) {
					loading = false;
					if (!highlighted) onunavailable?.();
					await tick();
					if (!disposed && reveal && highlighted)
						host
							.querySelector('.passage-highlight')
							?.scrollIntoView({ block: 'center', behavior: 'instant' });
				}
			}
		})();
		return () => {
			disposed = true;
			render?.cancel();
			textLayer?.cancel();
			void task?.destroy();
		};
	});
</script>

<figure class="my-5">
	<figcaption class="mb-2 text-sm text-stone-600">{$t('search.pdfPage', { page })}</figcaption>
	{#if loading}<p role="status" class="text-sm">{$t('reader.loading')}</p>{/if}
	{#if failed || (!loading && !highlighted)}<p role="status" class="text-sm text-stone-600 mb-3">
			{$t('reader.pdfFallback')}
		</p>{/if}
	<div class="overflow-x-auto">
		<div bind:this={host} class="passage-pdf relative w-full bg-white" class:hidden={failed}>
			<canvas bind:this={canvas} class="w-full h-full" aria-label={$t('search.pdfPage', { page })}
			></canvas>
			<div bind:this={layer} class="textLayer"></div>
			{#each rectangles as rect}<div
					class="passage-highlight absolute pointer-events-none bg-orange-400/35"
					style:left={`${rect.left}px`}
					style:top={`${rect.top}px`}
					style:width={`${rect.width}px`}
					style:height={`${rect.height}px`}
				></div>{/each}
		</div>
	</div>
</figure>

<style>
	.textLayer {
		position: absolute;
		inset: 0;
		overflow: clip;
		line-height: 1;
		text-align: initial;
		letter-spacing: normal;
		word-spacing: normal;
		text-size-adjust: none;
		transform-origin: 0 0;
		--min-font-size: 1;
		--text-scale-factor: calc(var(--total-scale-factor) * var(--min-font-size));
		--min-font-size-inv: calc(1 / var(--min-font-size));
	}
	.textLayer :global(span),
	.textLayer :global(br) {
		color: transparent;
		position: absolute;
		white-space: pre;
		cursor: text;
		transform-origin: 0 0;
		user-select: text;
	}
	.textLayer :global(> :not(.markedContent)),
	.textLayer :global(.markedContent span:not(.markedContent)) {
		z-index: 1;
		--font-height: 0;
		font-size: calc(var(--text-scale-factor) * var(--font-height));
		--scale-x: 1;
		--rotate: 0deg;
		transform: rotate(var(--rotate)) scaleX(var(--scale-x)) scale(var(--min-font-size-inv));
	}
	.textLayer :global(.markedContent) {
		display: contents;
	}
	.textLayer :global(::selection) {
		background: #ff880c66;
	}
</style>
