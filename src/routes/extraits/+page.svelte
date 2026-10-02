<script lang="ts">
	import { onMount, tick } from 'svelte';
	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();
	const PAGE_SIZE = 6;
	let copiedPostId = $state<string | null>(null);
	let copyResetTimer: ReturnType<typeof setTimeout> | undefined;
	let visibleCount = $state(PAGE_SIZE);
	let visiblePosts = $derived(data.posts.slice(0, visibleCount));
	let hasMore = $derived(visibleCount < data.posts.length);

	const dateFormatter = new Intl.DateTimeFormat('fr-FR', {
		day: 'numeric',
		month: 'long',
		year: 'numeric',
		timeZone: 'Africa/Kigali'
	});
	const timeFormatter = new Intl.DateTimeFormat('fr-FR', {
		hour: '2-digit',
		minute: '2-digit',
		timeZone: 'Africa/Kigali'
	});

	function dateLabel(iso: string) {
		return dateFormatter.format(new Date(iso));
	}

	function timeLabel(iso: string) {
		return timeFormatter.format(new Date(iso));
	}

	function revealMore() {
		visibleCount = Math.min(visibleCount + PAGE_SIZE, data.posts.length);
	}

	function infiniteScroll(node: HTMLElement) {
		if (!('IntersectionObserver' in window)) return;
		const observer = new IntersectionObserver(
			([entry]) => {
				if (entry.isIntersecting && hasMore) revealMore();
			},
			{ rootMargin: '600px 0px', threshold: 0 }
		);
		observer.observe(node);
		return { destroy: () => observer.disconnect() };
	}

	onMount(() => {
		const id = window.location.hash.slice(1);
		const targetIndex = data.posts.findIndex((post) => post.id === id);
		if (targetIndex < visibleCount) return;
		visibleCount = targetIndex + 1;
		void tick().then(() => document.getElementById(id)?.scrollIntoView());
	});

	async function sharePost(id: string, title: string, excerpt: string) {
		const url = `${window.location.origin}${window.location.pathname}#${id}`;

		if (navigator.share) {
			try {
				await navigator.share({ title, text: excerpt, url });
				return;
			} catch (error) {
				if (error instanceof DOMException && error.name === 'AbortError') return;
			}
		}

		try {
			await navigator.clipboard.writeText(url);
			copiedPostId = id;
			clearTimeout(copyResetTimer);
			copyResetTimer = setTimeout(() => (copiedPostId = null), 2000);
		} catch {
			window.location.hash = id;
		}
	}
</script>

<main class="extraits-page">
	<header class="hero">
		<p class="eyebrow">Le canal sur le site</p>
		<h1>Extraits des prédications</h1>
		<p class="introduction">
			Les publications du canal, avec leurs images et leurs liens vers les prédications.
		</p>
		<div class="hero-meta">
			<span>{data.posts.length} extraits</span>
			<span aria-hidden="true">•</span>
			<a href={data.channelUrl} target="_blank" rel="noreferrer">Ouvrir dans WhatsApp</a>
		</div>
	</header>

	<section class="feed" aria-label="Extraits publiés">
		{#each visiblePosts as post, index (post.id)}
			{#if index === 0 || dateLabel(post.publishedAt) !== dateLabel(visiblePosts[index - 1].publishedAt)}
				<div class="date-divider"><span>{dateLabel(post.publishedAt)}</span></div>
			{/if}

			<article id={post.id} class="post">
				<figure>
					<img
						src={post.image}
						alt={post.sourceTitle}
						width={post.imageWidth}
						height={post.imageHeight}
						loading={index < 2 ? 'eager' : 'lazy'}
						decoding="async"
					/>
				</figure>

				<div class="message">
					<!-- bodyHtml is reduced by the importer to text plus strong/em/del/code/br only. -->
					<div class="post-copy">{@html post.bodyHtml}</div>

					{#if post.links.length}
						<nav
							class="source-links"
							aria-label={`Ressources pour l’extrait du ${dateLabel(post.publishedAt)}`}
						>
							{#each post.links as link}
								{#if link.href.startsWith('http')}
									<a href={link.href} target="_blank" rel="noreferrer">{link.label}</a>
								{:else}
									<a href={link.href}>{link.label}</a>
								{/if}
							{/each}
						</nav>
					{/if}

					<footer class="post-meta">
						<span class="source-title">{post.sourceTitle}</span>
						<div class="post-actions">
							<time datetime={post.publishedAt}>{timeLabel(post.publishedAt)}</time>
							<button
								type="button"
								class="share-button"
								onclick={() => sharePost(post.id, post.sourceTitle, post.excerpt)}
								aria-label={`Partager l’extrait du ${dateLabel(post.publishedAt)}`}
							>
								<svg aria-hidden="true" viewBox="0 0 24 24">
									<path d="M9 7 4 12l5 5" />
									<path d="M5 12h8.5a5.5 5.5 0 0 1 5.5 5.5V19" />
								</svg>
								<span>{copiedPostId === post.id ? 'Lien copié' : 'Partager'}</span>
							</button>
						</div>
					</footer>
				</div>
			</article>
		{/each}

		{#if hasMore}
			<div class="feed-loader" use:infiniteScroll aria-live="polite">
				<button type="button" onclick={revealMore}>Afficher plus d’extraits</button>
			</div>
		{:else if data.posts.length > PAGE_SIZE}
			<p class="feed-end">Tous les extraits sont affichés</p>
		{/if}
	</section>
</main>

<style>
	.extraits-page {
		min-height: 100vh;
		padding: clamp(2rem, 5vw, 4rem) 1rem 6rem;
		font-family: var(--font-body);
		color: #292524;
		background: #faf8f3;
	}

	.hero,
	.feed {
		width: min(100%, 560px);
		margin-inline: auto;
	}

	.hero {
		margin-bottom: 2.25rem;
		padding-inline: 0.25rem;
	}

	.eyebrow {
		margin: 0 0 0.45rem;
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.15em;
		text-transform: uppercase;
		color: var(--color-missionnaire);
	}

	h1 {
		margin: 0;
		font-family: var(--font-display);
		font-size: clamp(2.25rem, 8vw, 3.35rem);
		font-weight: 600;
		line-height: 0.98;
		letter-spacing: -0.035em;
		color: #1c1917;
	}

	.introduction {
		max-width: 48ch;
		margin: 0.9rem 0 0;
		font-size: 0.94rem;
		line-height: 1.55;
		color: #57534e;
	}

	.hero-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
		align-items: center;
		margin-top: 0.8rem;
		font-size: 0.75rem;
		font-weight: 600;
		color: #78716c;
	}

	.hero-meta a,
	.source-links a {
		color: #9a4d00;
	}

	.date-divider {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin: 1.6rem 0 0.8rem;
		font-size: 0.7rem;
		font-weight: 650;
		text-transform: capitalize;
		color: #78716c;
	}

	.date-divider::before,
	.date-divider::after {
		content: '';
		flex: 1;
		height: 1px;
		background: #d6d3d1;
	}

	.date-divider span {
		padding: 0.35rem 0.65rem;
		border: 1px solid #e7e5e4;
		border-radius: 0.45rem;
		background: #f3efe7;
	}

	.post {
		overflow: hidden;
		scroll-margin-top: calc(var(--header-height) + 1.5rem);
		margin-bottom: 0.85rem;
		border: 1px solid #ded9cf;
		border-radius: 0.55rem;
		background: #fff;
		box-shadow: 0 3px 16px rgb(41 37 36 / 8%);
	}

	figure {
		margin: 0;
		line-height: 0;
		background: #1c1917;
	}

	figure img {
		display: block;
		width: 100%;
		height: auto;
	}

	.message {
		padding: 0.72rem 0.82rem 0.55rem;
	}

	.post-copy {
		font-size: 0.94rem;
		line-height: 1.48;
		color: #292524;
	}

	.post-copy :global(strong) {
		font-weight: 700;
		color: #1c1917;
	}

	.post-copy :global(em) {
		font-style: italic;
	}

	.post-copy :global(del) {
		color: #78716c;
		text-decoration-thickness: 1px;
	}

	.post-copy :global(code) {
		padding: 0.03em 0.16em;
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		font-size: 0.86em;
		color: #7c2d12;
		background: #fff7ed;
	}

	.post-copy :global(blockquote) {
		margin: 0.35rem 0;
		padding-left: 0.65rem;
		border-left: 3px solid #f59e0b;
		color: #57534e;
	}

	.source-links {
		display: flex;
		flex-wrap: wrap;
		gap: 0.42rem;
		margin-top: 0.75rem;
		padding-top: 0.65rem;
		border-top: 1px solid #e7e5e4;
	}

	.source-links a {
		display: inline-flex;
		align-items: center;
		min-height: 32px;
		padding: 0.38rem 0.65rem;
		border: 1px solid #fed7aa;
		border-radius: 999px;
		font-size: 0.7rem;
		font-weight: 650;
		line-height: 1.15;
		text-decoration: none;
		background: #fff7ed;
	}

	.source-links a:hover,
	.source-links a:focus-visible,
	.hero-meta a:hover,
	.hero-meta a:focus-visible {
		color: #7c2d12;
	}

	.post-meta {
		display: flex;
		justify-content: space-between;
		gap: 0.75rem;
		align-items: flex-end;
		margin-top: 0.55rem;
		font-size: 0.66rem;
		line-height: 1.35;
		color: #78716c;
	}

	.source-title {
		overflow: hidden;
		max-width: 75%;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.post-actions {
		display: flex;
		flex: none;
		gap: 0.55rem;
		align-items: center;
	}

	.share-button {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		min-height: 30px;
		padding: 0.3rem 0.58rem;
		border: 1px solid #fed7aa;
		border-radius: 999px;
		font: inherit;
		font-weight: 700;
		color: #9a4d00;
		background: #fff7ed;
		cursor: pointer;
	}

	.share-button svg {
		width: 1rem;
		height: 1rem;
		fill: none;
		stroke: currentColor;
		stroke-linecap: round;
		stroke-linejoin: round;
		stroke-width: 1.8;
	}

	.share-button:hover,
	.share-button:focus-visible {
		border-color: var(--color-missionnaire);
		color: #fff;
		background: var(--color-missionnaire);
		outline: none;
	}

	.feed-loader {
		display: grid;
		min-height: 5rem;
		place-items: center;
	}

	.feed-loader button {
		min-height: 44px;
		padding: 0.65rem 1rem;
		border: 1px solid #d6d3d1;
		border-radius: 999px;
		font: inherit;
		font-size: 0.75rem;
		font-weight: 650;
		color: #57534e;
		background: #fff;
		cursor: pointer;
	}

	.feed-loader button:hover,
	.feed-loader button:focus-visible {
		border-color: var(--color-missionnaire);
		color: #9a4d00;
		outline: none;
	}

	.feed-end {
		margin: 2rem 0 0;
		text-align: center;
		font-size: 0.72rem;
		color: #a8a29e;
	}

	@media (max-width: 640px) {
		.extraits-page {
			padding: 1.75rem 0.55rem 4rem;
		}

		.hero {
			padding-inline: 0.35rem;
		}

		h1 {
			font-size: clamp(2.1rem, 12vw, 2.8rem);
		}

		.post-copy {
			font-size: 0.91rem;
		}
	}
</style>
