<script lang="ts">
	import { tick } from 'svelte';
	import { page, navigating } from '$app/stores';
	import { t } from '../../i18n';
	import {
		libraryTypes,
		libraryHref,
		type LibraryResult as Result
	} from '$lib/utils/librarySearch';
	import LibraryResult from '$lib/components/LibraryResult.svelte';
	import Pagination from '$lib/components/Pagination.svelte';
	import { selectAudio, playlist, basePlaylist, currentIndex, isPlaying } from '$lib/stores/global';
	import { pendingPlaybackSeek } from '$lib/utils/audioResume';
	import { dispatchAudioPlayerAction } from '$lib/utils/audioPlayerControls';
	import type { MusicAudio } from '$lib/models/music-audio';
	let { data } = $props();
	let playbackMessage = $state('');
	function play(result: Result) {
		const song: MusicAudio = {
			_id: result.id,
			title: result.title,
			artist: result.author,
			category: result.type === 'recordings' ? 'Direct' : result.category,
			book: null,
			number: null,
			s3_key: '',
			s3_url: result.audioUrl,
			file_size: 0,
			format: 'mp3',
			uploaded_at: new Date()
		};
		pendingPlaybackSeek.set(
			result.startSec !== null ? { url: song.s3_url, time: result.startSec } : null
		);
		const track =
			result.type === 'sermons'
				? {
						_id: result.id,
						author: result.author,
						full_date_code: result.code,
						date_code: result.code,
						french_title: result.title,
						mp3_url: result.audioUrl,
						iso_date: result.date
					}
				: song;
		playlist.set([track]);
		basePlaylist.set([track]);
		currentIndex.set(0);
		selectAudio.set(track);
		isPlaying.set(true);
		playbackMessage = $t('search.selected', { title: result.title });
		void tick().then(() => {
			if (result.startSec === 0)
				window.dispatchEvent(new CustomEvent('missionnaire-audio-seek', { detail: { time: 0 } }));
			dispatchAudioPlayerAction('play');
		});
	}
</script>

<section class="bg-cream font-body text-stone-800 px-5 sm:px-8 py-10 sm:py-14">
	<div class="mx-auto max-w-5xl">
		<h1 class="font-display text-4xl sm:text-5xl leading-tight">{$t('search.library')}</h1>
		<p class="mt-3 text-stone-600 max-w-2xl">{$t('search.libraryDescription')}</p>
		{#key $page.url.search}
			<form
				action="/recherche"
				method="GET"
				class="mt-7 space-y-4"
				role="search"
				aria-label={$t('search.library')}
			>
				<div class="flex gap-2">
					<label for="library-query" class="sr-only">{$t('search.placeholder')}</label>
					<input
						id="library-query"
						name="q"
						type="search"
						required
						minlength="2"
						maxlength="100"
						value={data.filters.q}
						placeholder={$t('search.placeholder')}
						class="search-field min-w-0 flex-1 text-base"
					/>
					<button
						class="rounded-lg px-4 sm:px-7 min-h-12 bg-missionnaire text-stone-950 font-semibold hover:bg-missionnaire-100 focus-visible:outline focus-visible:outline-2"
						type="submit">{$t('search.action')}</button
					>
				</div>
				<div class="grid grid-cols-2 md:grid-cols-3 gap-3">
					<label class="filter-label"
						>{$t('search.contentType')}<select
							name="type"
							class="search-field"
							value={data.filters.type}
						>
							<option value="">{$t('search.allTypes')}</option>{#each libraryTypes as type}<option
									value={type}>{$t(`search.${type}`)}</option
								>{/each}
						</select></label
					>
					<label class="filter-label"
						>{$t('search.language')}<select
							name="language"
							class="search-field"
							value={data.filters.language}
						>
							<option value="">{$t('search.allLanguages')}</option><option value="fr"
								>Français</option
							><option value="en">English</option><option value="rw">Kinyarwanda</option><option
								value="sw">Kiswahili</option
							><option value="unknown">{$t('search.unspecified')}</option>
						</select></label
					>
					<label class="filter-label"
						>{$t('search.author')}<input
							name="author"
							class="search-field"
							maxlength="100"
							value={data.filters.author}
						/></label
					>
					<label class="filter-label"
						>{$t('search.category')}<input
							name="category"
							class="search-field"
							maxlength="100"
							value={data.filters.category}
						/></label
					>
					<label class="filter-label"
						>{$t('search.from')}<input
							name="from"
							type="date"
							class="search-field"
							value={data.filters.from}
						/></label
					>
					<label class="filter-label"
						>{$t('search.to')}<input
							name="to"
							type="date"
							class="search-field"
							value={data.filters.to}
						/></label
					>
				</div>
				<div class="flex flex-wrap items-center gap-4">
					<button type="submit" class="min-h-11 text-sm font-semibold underline underline-offset-4"
						>{$t('search.applyFilters')}</button
					>
					<a
						href={libraryHref({ q: data.filters.q })}
						class="min-h-11 inline-flex items-center text-sm text-stone-600 hover:underline"
						>{$t('search.resetFilters')}</a
					>
				</div>
			</form>
		{/key}
	</div>
</section>

<section class="px-5 sm:px-8 pb-14 font-body" aria-busy={!!$navigating}>
	<div class="max-w-5xl mx-auto">
		<p class="sr-only" role="status">{playbackMessage}</p>
		{#if data.failure}
			<div role="alert" class="py-8 text-red-800">
				<p>{data.failure === 'invalid' ? $t('search.invalidFilters') : $t('search.unavailable')}</p>
				{#if data.failure === 'unavailable'}<a
						class="underline min-h-11 inline-flex items-center"
						href={$page.url.pathname + $page.url.search}
						data-sveltekit-reload>{$t('errors.retry')}</a
					>{/if}
			</div>
		{:else if data.filters.q.length < 2}
			<p class="py-8 text-stone-600">{$t('search.minChars')}</p>
		{:else}
			<p class="pt-7 pb-2 text-sm text-stone-600" role="status">
				{$t(data.result.total === 1 ? 'search.oneResult' : 'search.resultCount', {
					count: data.result.total,
					query: data.filters.q
				})}
			</p>
			{#each data.result.results as result (`${result.type}:${result.id}`)}<LibraryResult
					{result}
					onplay={play}
				/>
			{:else}<p class="py-10 text-stone-600">{$t('search.noResults')}</p>{/each}
			<div class="mt-7">
				<Pagination
					current={data.filters.page}
					total={data.result.pages}
					getHref={(page) => libraryHref(data.filters, { page })}
				/>
			</div>
		{/if}
		<p class="mt-8 text-xs leading-relaxed text-stone-500 max-w-2xl">{$t('search.coverage')}</p>
	</div>
</section>

<style>
	.search-field {
		display: block;
		width: 100%;
		min-width: 0;
		min-height: 48px;
		padding: 10px 12px;
		border: 1px solid #d6d3d1;
		border-radius: 8px;
		background: #fff;
		color: #292524;
		font: inherit;
	}
	.search-field:focus-visible {
		outline: 2px solid #ff880c;
		outline-offset: 2px;
	}
	.filter-label {
		display: flex;
		flex-direction: column;
		gap: 6px;
		min-width: 0;
		font-size: 13px;
		color: #57534e;
	}
</style>
