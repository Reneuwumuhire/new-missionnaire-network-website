<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { focusTrap } from '$lib/actions/focusTrap';
	import { locale, t, type TranslationKey } from '../../i18n';
	// @ts-ignore
	import Icon from 'svelte-icons-pack/Icon.svelte';
	import BsLink45deg from 'svelte-icons-pack/bs/BsLink45deg';
	import RiSystemEyeLine from 'svelte-icons-pack/ri/RiSystemEyeLine';
	import RiSystemShareForwardLine from 'svelte-icons-pack/ri/RiSystemShareForwardLine';
	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();
	const PAGE_SIZE = 6;
	let openSharePostId = $state<string | null>(null);
	let shareFeedback = $state<{ postId: string; state: 'copied' | 'error' } | null>(null);
	let hasNativeShare = $state(false);
	let copyResetTimer: ReturnType<typeof setTimeout> | undefined;
	let visibleCount = $state(PAGE_SIZE);
	let visiblePosts = $derived(data.posts.slice(0, visibleCount));
	let hasMore = $derived(visibleCount < data.posts.length);
	type Reaction = 'like' | 'heart' | 'laugh' | 'wow' | 'sad' | 'pray';
	const reactionOptions: { id: Reaction; emoji: string; label: TranslationKey }[] = [
		{ id: 'like', emoji: '👍', label: 'publications.reactLike' },
		{ id: 'heart', emoji: '❤️', label: 'publications.reactHeart' },
		{ id: 'laugh', emoji: '😂', label: 'publications.reactLaugh' },
		{ id: 'wow', emoji: '😮', label: 'publications.reactWow' },
		{ id: 'sad', emoji: '😢', label: 'publications.reactSad' },
		{ id: 'pray', emoji: '🙏', label: 'publications.reactPray' }
	];
	let openReactionPostId = $state<string | null>(null);
	let openReactionSummaryPostId = $state<string | null>(null);
	function initialEngagement() {
		return Object.fromEntries(
			data.posts.map((post) => [
				post.id,
				{
					views: post.engagement.views,
					shares: post.engagement.shares,
					reactions: { ...post.engagement.reactions }
				}
			])
		);
	}
	let engagement = $state(initialEngagement());
	let selectedReactions = $state<Record<string, Reaction | undefined>>({});
	let pendingReactions = $state<Record<string, boolean>>({});

	let dateFormatter = $derived(
		new Intl.DateTimeFormat($locale === 'fr' ? 'fr-FR' : 'en-GB', {
			day: 'numeric',
			month: 'long',
			year: 'numeric',
			timeZone: 'Africa/Kigali'
		})
	);
	let timeFormatter = $derived(
		new Intl.DateTimeFormat($locale === 'fr' ? 'fr-FR' : 'en-GB', {
			hour: '2-digit',
			minute: '2-digit',
			timeZone: 'Africa/Kigali'
		})
	);

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
		hasNativeShare = typeof navigator.share === 'function';
		for (const post of data.posts) {
			try {
				const reaction = localStorage.getItem(`publication-reaction:${post.id}`);
				if (reactionOptions.some(({ id }) => id === reaction)) {
					selectedReactions[post.id] = reaction as Reaction;
				}
			} catch {
				/* Storage can be blocked in private mode. */
			}
		}
		const id = window.location.hash.slice(1);
		const targetIndex = data.posts.findIndex((post) => post.id === id);
		if (targetIndex < visibleCount) return;
		visibleCount = targetIndex + 1;
		void tick().then(() => document.getElementById(id)?.scrollIntoView());
	});

	function postUrl(id: string) {
		return `${window.location.origin}/publications/${encodeURIComponent(id)}`;
	}

	async function syncEngagement(postId: string, body: Record<string, unknown>) {
		try {
			const response = await fetch(`/api/publications/${encodeURIComponent(postId)}/engagement`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body),
				keepalive: true
			});
			if (response.ok) engagement[postId] = await response.json();
		} catch {
			/* Engagement is best-effort and never interrupts reading. */
		}
	}

	function trackPostView(node: HTMLElement, postId: string) {
		const countView = () => {
			const key = `publication-viewed:${postId}`;
			try {
				if (localStorage.getItem(key) === '1') return;
				localStorage.setItem(key, '1');
			} catch {
				/* Count once for this mount when local storage is unavailable. */
			}
			engagement[postId].views += 1;
			void syncEngagement(postId, { action: 'view' });
		};
		if (!('IntersectionObserver' in window)) {
			countView();
			return;
		}
		const observer = new IntersectionObserver(
			([entry]) => {
				if (!entry.isIntersecting) return;
				observer.disconnect();
				countView();
			},
			{ threshold: 0.5 }
		);
		observer.observe(node);
		return { destroy: () => observer.disconnect() };
	}

	function recordShare(postId: string) {
		engagement[postId].shares += 1;
		void syncEngagement(postId, { action: 'share' });
	}

	async function toggleReaction(postId: string, reaction: Reaction) {
		if (pendingReactions[postId]) return;
		pendingReactions[postId] = true;
		const previous = selectedReactions[postId];
		const next = previous === reaction ? undefined : reaction;
		if (previous) {
			engagement[postId].reactions[previous] = Math.max(
				0,
				engagement[postId].reactions[previous] - 1
			);
		}
		if (next) engagement[postId].reactions[next] += 1;
		selectedReactions[postId] = next;
		try {
			if (next) localStorage.setItem(`publication-reaction:${postId}`, next);
			else localStorage.removeItem(`publication-reaction:${postId}`);
		} catch {
			/* The reaction still works for this page view. */
		}
		await syncEngagement(postId, { action: 'reaction', reaction: next, previous });
		pendingReactions[postId] = false;
	}

	function formatCount(value: number) {
		return value.toLocaleString($locale === 'fr' ? 'fr-FR' : 'en-GB');
	}

	function totalReactions(postId: string) {
		return reactionOptions.reduce((total, { id }) => total + engagement[postId].reactions[id], 0);
	}

	function shownReactions(postId: string) {
		return reactionOptions.filter(({ id }) => engagement[postId].reactions[id] > 0);
	}

	function toggleReactionSummary(postId: string) {
		if (totalReactions(postId) === 0) {
			openReactionSummaryPostId = null;
			openReactionPostId = openReactionPostId === postId ? null : postId;
			return;
		}
		openReactionPostId = null;
		openReactionSummaryPostId = openReactionSummaryPostId === postId ? null : postId;
	}

	function openCardReactions(event: MouseEvent, postId: string) {
		if (event.target instanceof Element && event.target.closest('a, button')) return;
		event.stopPropagation();
		openReactionSummaryPostId = null;
		openReactionPostId = openReactionPostId === postId ? null : postId;
	}

	function toggleShareMenu(id: string) {
		openSharePostId = openSharePostId === id ? null : id;
	}

	function closeMenus() {
		openSharePostId = null;
		openReactionPostId = null;
		openReactionSummaryPostId = null;
	}

	function flashShareFeedback(postId: string, state: 'copied' | 'error') {
		shareFeedback = { postId, state };
		clearTimeout(copyResetTimer);
		copyResetTimer = setTimeout(() => (shareFeedback = null), 2000);
	}

	async function copyShareLink(post: (typeof data.posts)[number]) {
		closeMenus();
		try {
			await navigator.clipboard.writeText(postUrl(post.id));
			recordShare(post.id);
			flashShareFeedback(post.id, 'copied');
		} catch {
			flashShareFeedback(post.id, 'error');
		}
	}

	async function nativeShare(post: (typeof data.posts)[number]) {
		closeMenus();
		const url = postUrl(post.id);
		try {
			await navigator.share({
				title: post.sourceTitle,
				text: post.shareText || post.text,
				url
			});
			recordShare(post.id);
			return;
		} catch (error) {
			if (error instanceof DOMException && error.name === 'AbortError') return;
		}

		try {
			await navigator.clipboard.writeText(`${post.shareText || post.text}\n\n${url}`);
			recordShare(post.id);
			flashShareFeedback(post.id, 'copied');
		} catch {
			flashShareFeedback(post.id, 'error');
		}
	}
</script>

<svelte:window
	onclick={closeMenus}
	onkeydown={(event) => {
		if (event.key === 'Escape') closeMenus();
	}}
/>

<main class="publications-page">
	<header class="hero">
		<p class="eyebrow">{$t('publications.eyebrow')}</p>
		<h1>{$t('publications.title')}</h1>
		<p class="introduction">
			{$t('publications.introduction')}
		</p>
		<div class="hero-meta">
			<span
				>{$t(data.posts.length === 1 ? 'publications.countOne' : 'publications.countMany', {
					count: data.posts.length
				})}</span
			>
			<span aria-hidden="true">•</span>
			<a href={data.channelUrl} target="_blank" rel="noreferrer"
				>{$t('publications.openWhatsapp')}</a
			>
		</div>
	</header>

	<section class="feed" aria-label={$t('publications.publishedPosts')}>
		{#each visiblePosts as post, index (post.id)}
			{#if index === 0 || dateLabel(post.publishedAt) !== dateLabel(visiblePosts[index - 1].publishedAt)}
				<div class="date-divider"><span>{dateLabel(post.publishedAt)}</span></div>
			{/if}

			<!-- The card click is a pointer shortcut; the reaction summary remains keyboard accessible. -->
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
			<article
				id={post.id}
				class="post"
				use:trackPostView={post.id}
				onclick={(event) => openCardReactions(event, post.id)}
			>
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
							aria-label={$t('publications.resourcesFor', { date: dateLabel(post.publishedAt) })}
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

					<div class="engagement-bar" aria-label={$t('publications.engagement')}>
						<div class="reaction-zone">
							<button
								type="button"
								class="reaction-summary"
								onclick={(event) => {
									event.stopPropagation();
									toggleReactionSummary(post.id);
								}}
								aria-expanded={openReactionSummaryPostId === post.id ||
									openReactionPostId === post.id}
								aria-label={$t('publications.reactionCount', { count: totalReactions(post.id) })}
							>
								{#if totalReactions(post.id)}
									<span class="reaction-stack" aria-hidden="true">
										{#each shownReactions(post.id).slice(0, 3) as reaction}
											<span>{reaction.emoji}</span>
										{/each}
									</span>
									<strong>{formatCount(totalReactions(post.id))}</strong>
								{:else}
									<span class="add-reaction" aria-hidden="true">☺</span>
								{/if}
							</button>

							{#if openReactionSummaryPostId === post.id}
								<div class="reaction-breakdown">
									<strong
										>{$t('publications.reactionCount', { count: totalReactions(post.id) })}</strong
									>
									<div>
										{#each shownReactions(post.id) as reaction}
											<button
												type="button"
												class:reaction-selected={selectedReactions[post.id] === reaction.id}
												disabled={pendingReactions[post.id]}
												onclick={() => toggleReaction(post.id, reaction.id)}
												aria-label={$t(reaction.label)}
											>
												<span aria-hidden="true">{reaction.emoji}</span>
												{formatCount(engagement[post.id].reactions[reaction.id])}
											</button>
										{/each}
									</div>
								</div>
							{:else}
								<div class="reaction-picker" class:picker-open={openReactionPostId === post.id}>
									{#each reactionOptions as reaction}
										<button
											type="button"
											class:reaction-selected={selectedReactions[post.id] === reaction.id}
											disabled={pendingReactions[post.id]}
											onclick={() => {
												void toggleReaction(post.id, reaction.id);
												openReactionPostId = null;
											}}
											aria-pressed={selectedReactions[post.id] === reaction.id}
											aria-label={$t(reaction.label)}
											title={$t(reaction.label)}
										>
											<span aria-hidden="true">{reaction.emoji}</span>
										</button>
									{/each}
								</div>
							{/if}
						</div>
						<div class="engagement-counts">
							<span
								title={$t('publications.views')}
								aria-label={$t('publications.viewCount', {
									count: engagement[post.id].views
								})}
							>
								{formatCount(engagement[post.id].views)}
								<Icon src={RiSystemEyeLine} size="15" />
							</span>
							<span
								title={$t('publications.reshares')}
								aria-label={$t('publications.reshareCount', {
									count: engagement[post.id].shares
								})}
							>
								{formatCount(engagement[post.id].shares)}
								<Icon src={RiSystemShareForwardLine} size="15" />
							</span>
						</div>
					</div>

					<footer class="post-meta">
						<span class="source-title">{post.sourceTitle}</span>
						<div class="post-actions">
							<time datetime={post.publishedAt}>{timeLabel(post.publishedAt)}</time>
							<div class="share-wrap">
								<button
									type="button"
									class:share-active={openSharePostId === post.id}
									class="share-button"
									onclick={(event) => {
										event.stopPropagation();
										toggleShareMenu(post.id);
									}}
									aria-haspopup="menu"
									aria-expanded={openSharePostId === post.id}
									aria-label={$t('publications.shareFor', { date: dateLabel(post.publishedAt) })}
									title={$t('publications.share')}
								>
									<Icon src={RiSystemShareForwardLine} size="16" />
									<span>{$t('publications.share')}</span>
								</button>

								{#if openSharePostId === post.id}
									<!-- svelte-ignore a11y_click_events_have_key_events -->
									<!-- svelte-ignore a11y_no_static_element_interactions -->
									<div
										class="share-menu"
										role="menu"
										tabindex="-1"
										use:focusTrap={{ onEscape: closeMenus }}
										onclick={(event) => event.stopPropagation()}
									>
										{#if hasNativeShare}
											<button type="button" role="menuitem" onclick={() => nativeShare(post)}>
												<Icon src={RiSystemShareForwardLine} size="17" />
												<span>{$t('publications.shareNative')}</span>
											</button>
										{/if}
										<button type="button" role="menuitem" onclick={() => copyShareLink(post)}>
											<Icon src={BsLink45deg} size="18" />
											<span>{$t('publications.copyLink')}</span>
										</button>
									</div>
								{/if}

								{#if shareFeedback?.postId === post.id}
									<span class="share-feedback" role="status">
										{shareFeedback.state === 'copied'
											? $t('publications.copied')
											: $t('publications.copyFailed')}
									</span>
								{/if}
							</div>
						</div>
					</footer>
				</div>
			</article>
		{/each}

		{#if hasMore}
			<div class="feed-loader" use:infiniteScroll aria-live="polite">
				<button type="button" onclick={revealMore}>{$t('publications.showMore')}</button>
			</div>
		{:else if data.posts.length > PAGE_SIZE}
			<p class="feed-end">{$t('publications.allShown')}</p>
		{/if}
	</section>
</main>

<style>
	.publications-page {
		min-height: 100vh;
		padding: clamp(2rem, 5vw, 4rem) 1rem 6rem;
		font-family: var(--font-body);
		color: #292524;
		background: #faf8f3;
	}

	.hero,
	.feed {
		width: min(100%, 500px);
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

	.engagement-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.65rem;
		margin-top: 0.65rem;
		padding-top: 0.55rem;
		border-top: 1px solid #eeeae3;
	}

	.reaction-zone,
	.engagement-counts {
		display: flex;
		align-items: center;
		gap: 0.35rem;
	}

	.reaction-zone {
		position: relative;
	}

	.reaction-summary {
		display: inline-flex;
		min-width: 32px;
		min-height: 32px;
		align-items: center;
		justify-content: center;
		gap: 0.38rem;
		padding: 0.25rem 0.48rem;
		border: 1px solid #e7e5e4;
		border-radius: 999px;
		font: inherit;
		font-size: 0.72rem;
		font-weight: 700;
		color: #57534e;
		background: #fafaf9;
		cursor: pointer;
	}

	.reaction-summary:hover,
	.reaction-summary:focus-visible {
		border-color: #a8a29e;
		color: #292524;
		background: #e7e5e4;
		outline: none;
	}

	.reaction-summary:focus-visible,
	.reaction-picker button:focus-visible,
	.reaction-breakdown button:focus-visible {
		box-shadow:
			0 0 0 2px #fff,
			0 0 0 4px rgb(255 136 12 / 55%);
		outline: none;
	}

	.add-reaction {
		font-size: 1rem;
		line-height: 1;
	}

	.reaction-stack {
		display: inline-flex;
	}

	.reaction-stack span {
		width: 1.15rem;
		height: 1.15rem;
		margin-left: -0.2rem;
		border: 1px solid #fff;
		border-radius: 999px;
		font-size: 0.76rem;
		line-height: 1rem;
		background: #fff;
	}

	.reaction-stack span:first-child {
		margin-left: 0;
	}

	.reaction-picker,
	.reaction-breakdown {
		position: absolute;
		bottom: calc(100% + 0.5rem);
		left: 0;
		z-index: 20;
		border: 1px solid #292524;
		border-radius: 1.25rem;
		color: #fff;
		background: #1c1917;
		box-shadow: 0 12px 28px rgb(28 25 23 / 28%);
	}

	.reaction-picker {
		display: flex;
		gap: 0.08rem;
		padding: 0.3rem;
		opacity: 0;
		pointer-events: none;
		transform: translateY(0.25rem) scale(0.96);
		transform-origin: bottom left;
		transition:
			opacity 120ms ease,
			transform 120ms ease;
	}

	.post:hover .reaction-picker,
	.post:focus-within .reaction-picker,
	.reaction-picker.picker-open {
		opacity: 1;
		pointer-events: auto;
		transform: none;
	}

	.reaction-picker button {
		display: grid;
		width: 38px;
		height: 38px;
		padding: 0;
		border: 0;
		border-radius: 999px;
		place-items: center;
		font: inherit;
		font-size: 1.35rem;
		background: transparent;
		cursor: pointer;
		transition:
			transform 100ms ease,
			background-color 100ms ease;
	}

	.reaction-picker button:hover,
	.reaction-picker button.reaction-selected {
		background: #44403c;
		transform: translateY(-0.18rem) scale(1.12);
	}

	.reaction-breakdown {
		width: 14rem;
		padding: 0.75rem;
		border-radius: 0.65rem;
	}

	.reaction-breakdown > strong {
		display: block;
		margin-bottom: 0.55rem;
		font-size: 0.78rem;
	}

	.reaction-breakdown > div {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
	}

	.reaction-breakdown button {
		display: inline-flex;
		min-height: 34px;
		align-items: center;
		gap: 0.32rem;
		padding: 0.25rem 0.52rem;
		border: 1px solid #57534e;
		border-radius: 999px;
		font: inherit;
		font-size: 0.72rem;
		font-weight: 700;
		color: #f5f5f4;
		background: #292524;
		cursor: pointer;
	}

	.reaction-breakdown button:hover,
	.reaction-breakdown button.reaction-selected {
		border-color: #f59e0b;
		background: #44403c;
	}

	.reaction-picker button:disabled,
	.reaction-breakdown button:disabled {
		cursor: wait;
		opacity: 0.65;
	}

	.engagement-counts {
		gap: 0.65rem;
		font-size: 0.69rem;
		font-variant-numeric: tabular-nums;
		color: #78716c;
	}

	.engagement-counts span {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
	}

	.post-meta {
		display: flex;
		justify-content: space-between;
		gap: 0.75rem;
		align-items: flex-end;
		margin-top: 0.45rem;
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

	.share-wrap {
		position: relative;
	}

	.share-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.375rem;
		min-height: 32px;
		padding: 0.5rem 0.7rem;
		border: 0;
		border-radius: 999px;
		font: inherit;
		font-weight: 700;
		line-height: 1;
		color: #78716c;
		background: rgb(245 245 244 / 85%);
		cursor: pointer;
		transition:
			color 160ms ease,
			background-color 160ms ease,
			transform 160ms ease,
			box-shadow 160ms ease;
	}

	.share-button:active {
		transform: scale(0.96);
	}

	.share-button:hover,
	.share-button:focus-visible {
		color: var(--color-missionnaire);
		background: #e7e5e4;
	}

	.share-button:focus-visible {
		outline: 2px solid var(--color-missionnaire);
		outline-offset: 2px;
	}

	.share-button.share-active {
		color: #fff;
		background: var(--color-missionnaire);
		box-shadow: 0 6px 18px -8px rgb(255 136 12 / 55%);
	}

	.share-menu {
		position: absolute;
		right: 0;
		bottom: calc(100% + 0.5rem);
		z-index: 30;
		width: 13rem;
		overflow: hidden;
		border: 1px solid #e7e5e4;
		border-radius: 0.55rem;
		background: #fff;
		box-shadow: 0 18px 42px rgb(41 37 36 / 18%);
	}

	.share-menu button {
		display: flex;
		width: 100%;
		align-items: center;
		gap: 0.65rem;
		padding: 0.7rem 0.8rem;
		border: 0;
		font: inherit;
		font-size: 0.75rem;
		font-weight: 650;
		text-align: left;
		color: #44403c;
		background: #fff;
		cursor: pointer;
	}

	.share-menu button + button {
		border-top: 1px solid #e7e5e4;
	}

	.share-menu button:hover,
	.share-menu button:focus-visible {
		color: var(--color-missionnaire);
		background: #fafaf9;
		outline: none;
	}

	.share-feedback {
		position: absolute;
		right: 0;
		bottom: calc(100% + 0.5rem);
		z-index: 31;
		padding: 0.35rem 0.5rem;
		border-radius: 0.35rem;
		font-size: 0.62rem;
		font-weight: 700;
		white-space: nowrap;
		color: #fff;
		background: #1c1917;
		box-shadow: 0 6px 18px rgb(41 37 36 / 18%);
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

	@media (prefers-reduced-motion: reduce) {
		.reaction-picker,
		.reaction-picker button {
			transition: none;
		}
	}

	@media (max-width: 640px) {
		.publications-page {
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
