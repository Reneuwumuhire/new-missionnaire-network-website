<script lang="ts">
	import type { PageData } from './$types';
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { formatFileSize } from '../../utils/FormatTime';
	import DocumentText1 from 'iconsax-svelte/DocumentText1.svelte';
	import Export from 'iconsax-svelte/Export.svelte';
	import VideoPlay from 'iconsax-svelte/VideoPlay.svelte';
	import ArrowDown2 from 'iconsax-svelte/ArrowDown2.svelte';
	import ArrowUp2 from 'iconsax-svelte/ArrowUp2.svelte';
	import { writable } from 'svelte/store';

	export let data: PageData;
	let selectedDocument: (typeof data.documents)[0] | null = null;
	const isDocumentOpen = writable(false);
	let searchTerm = '';
	let filteredDocuments = data.documents;
	let sortOrder = data.sort || 'desc';
	let selectedYear = data.selectedYear || '';

	$: currentPage = data.pagination.page;
	$: totalPages = Math.ceil(data.pagination.total / data.pagination.limit);
	
	$: {
		if (searchTerm.trim() === '') {
			filteredDocuments = data.documents;
		} else {
			const searchLower = searchTerm.toLowerCase();
			filteredDocuments = data.documents.filter(doc => 
				doc.filename.toLowerCase().includes(searchLower)
			);
		}
	}

	function handlePageChange(newPage: number) {
		if (browser) {
			const url = new URL(window.location.href);
			url.searchParams.set('page', newPage.toString());
			goto(url.toString(), { keepFocus: true });
		}
	}

	function handleSort() {
		if (browser) {
			const newSort = sortOrder === 'desc' ? 'asc' : 'desc';
			const url = new URL(window.location.href);
			url.searchParams.set('sort', newSort);
			goto(url.toString());
		}
	}

	function handleYearChange(e: Event) {
		if (browser) {
			const url = new URL(window.location.href);
			const year = (e.target as HTMLSelectElement).value;
			if (year) {
				url.searchParams.set('year', year);
			} else {
				url.searchParams.delete('year');
			}
			url.searchParams.set('page', '1'); // Reset to first page on year change
			goto(url.toString());
		}
	}

	function handleSearch(e: Event) {
		e.preventDefault();
		if (browser) {
			const url = new URL(window.location.href);
			if (searchTerm.trim()) {
				url.searchParams.set('search', searchTerm);
			} else {
				url.searchParams.delete('search');
			}
			url.searchParams.set('page', '1'); // Reset to first page on search
			goto(url.toString());
		}
	}

	function handleSelectDocument(doc: (typeof data.documents)[0]) {
		selectedDocument = doc;
		isDocumentOpen.set(true);
	}

	onMount(() => {
		// Initialize search term from URL
		if (browser) {
			const url = new URL(window.location.href);
			searchTerm = url.searchParams.get('search') || '';
		}
		window.scrollTo(0, 0);
	});
</script>

<svelte:head>
	<title>Transcriptions - Missionnaire Network</title>
</svelte:head>

<div class="container mx-auto px-4 py-8">
	<!-- Search Header -->
	<div class="relative mb-8">
		<div class="flex flex-row items-center justify-center">
			<div class="w-full max-w-4xl text-center">
				<h1 class="text-3xl font-bold mb-4">Transcriptions</h1>
				<p class="text-gray-600 mb-6">Trouvez les transcriptions des prédications</p>
				<form on:submit={handleSearch} class="flex flex-row w-full max-w-xl mx-auto">
					<input
						type="text"
						class="border border-gray-300 rounded-l-full indent-4 p-2 w-full text-gray-900 outline-none focus:ring-2 focus:ring-missionnaire focus:border-transparent"
						placeholder="Rechercher par titre..."
						bind:value={searchTerm}
					/>
					<button type="submit" class="bg-missionnaire text-white px-6 py-2 rounded-r-full hover:bg-missionnaire/90">
						Rechercher
					</button>
				</form>
			</div>
		</div>
	</div>

	<div class="flex w-full h-full">
		<!-- List Panel -->
		<div class="flex-1 min-w-0 {$isDocumentOpen ? 'w-1/2' : 'w-full'} transition-all duration-300">
			<!-- Sort and Filter Controls -->
			<div class="flex justify-end mb-4 items-center space-x-4">
				<!-- Year Filter -->
				<div class="flex items-center space-x-2">
					<label for="year-filter" class="text-sm text-gray-600">Année:</label>
					<select
						id="year-filter"
						class="border border-gray-300 rounded-md px-3 py-1.5 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-missionnaire focus:border-transparent"
						value={selectedYear}
						on:change={handleYearChange}
					>
						<option value="">Toutes les années</option>
						{#each data.years as year}
							<option value={year}>{year}</option>
						{/each}
					</select>
				</div>

				<!-- Sort Button -->
				<button
					on:click={handleSort}
					class="flex items-center space-x-2 px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
				>
					<span>Date de publication</span>
					{#if sortOrder === 'desc'}
						<ArrowDown2 size={20} />
					{:else}
						<ArrowUp2 size={20} />
					{/if}
				</button>
			</div>

			{#if filteredDocuments.length === 0}
				<div class="text-center py-12">
					<p class="text-gray-600">Aucun document trouvé</p>
				</div>
			{:else}
				<div class="border border-gray-300 shadow rounded-md">
					{#each filteredDocuments as document}
						<div class="flex items-center border-b border-gray-200 last:border-b-0 hover:bg-gray-50">
							<button 
								class="flex-1 p-4 flex items-start space-x-4 text-left {selectedDocument?.filename === document.filename ? 'bg-gray-100' : ''}"
								on:click={() => handleSelectDocument(document)}
							>
								<div class="flex-shrink-0 pt-1">
									<DocumentText1 size={20} color="#6B7280"/>
								</div>
								<div class="flex-1 min-w-0">
									<h3 class="text-sm font-medium text-gray-900">{document.filename}</h3>
									<div class="mt-1 flex flex-col sm:flex-row sm:flex-wrap sm:space-x-6">
										<div class="text-xs text-gray-500">
											{formatFileSize(document.size)}
										</div>
										<div class="text-xs text-gray-500">
											{new Date(document.publishedOn).toLocaleDateString()}
										</div>
									</div>
								</div>
							</button>
							<div class="flex items-center space-x-2 px-4">
								{#if document.videoDisplayId}
									<a
										href={`https://www.youtube.com/watch?v=${document.videoDisplayId}`}
										target="_blank"
										rel="noopener noreferrer"
										class="p-2 text-gray-500 hover:text-missionnaire transition-colors"
										title="Voir la vidéo"
									>
										<VideoPlay size={20} />
									</a>
								{/if}
								<a
									href={document.url}
									download
									class="p-2 text-gray-500 hover:text-missionnaire transition-colors"
									title="Télécharger"
								>
									<Export size={20} />
								</a>
							</div>
						</div>
					{/each}
				</div>

				<!-- Pagination -->
				{#if totalPages > 1}
					<div class="flex justify-center mt-8 gap-2">
						<button
							class="px-4 py-2 rounded-md transition-colors duration-200 {currentPage === 1
								? 'bg-gray-100 text-gray-400'
								: 'bg-gray-100 text-gray-700 hover:bg-gray-200'}"
							disabled={currentPage === 1}
							on:click={() => handlePageChange(currentPage - 1)}
						>
							Précédent
						</button>
						{#each Array(totalPages) as _, i}
							<button
								class="px-4 py-2 rounded-md transition-colors duration-200 {currentPage === i + 1
									? 'bg-missionnaire text-white'
									: 'bg-gray-100 text-gray-700 hover:bg-gray-200'}"
								on:click={() => handlePageChange(i + 1)}
							>
								{i + 1}
							</button>
						{/each}
						<button
							class="px-4 py-2 rounded-md transition-colors duration-200 {currentPage === totalPages
								? 'bg-gray-100 text-gray-400'
								: 'bg-gray-100 text-gray-700 hover:bg-gray-200'}"
							disabled={currentPage === totalPages}
							on:click={() => handlePageChange(currentPage + 1)}
						>
							Suivant
						</button>
					</div>
				{/if}
			{/if}
		</div>

		<!-- Document Preview Panel -->
		{#if $isDocumentOpen && selectedDocument}
			<div class="w-1/2 border-l border-gray-200 bg-white p-6 min-h-screen">
				<div class="flex flex-col h-full">
					<div class="flex justify-between items-start mb-6">
						<h2 class="text-xl font-semibold text-gray-900">{selectedDocument.filename}</h2>
						<button 
							class="text-gray-400 hover:text-gray-500" 
							on:click={() => isDocumentOpen.set(false)}
						>
							<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
							</svg>
						</button>
					</div>

					<div class="flex-1">
						<div class="mb-6">
							<dl class="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
								<div>
									<dt class="text-sm font-medium text-gray-500">Taille du fichier</dt>
									<dd class="mt-1 text-sm text-gray-900">{formatFileSize(selectedDocument.size)}</dd>
								</div>
								<div>
									<dt class="text-sm font-medium text-gray-500">Date de publication</dt>
									<dd class="mt-1 text-sm text-gray-900">
										{new Date(selectedDocument.publishedOn).toLocaleDateString()}
									</dd>
								</div>
							</dl>
						</div>

						<div class="relative w-full h-[calc(100vh-300px)] border border-gray-200 rounded-lg bg-gray-50 flex flex-col items-center justify-center p-8 text-center">
							<DocumentText1 size={48} color="#9CA3AF" />
							<h3 class="mt-4 text-lg font-medium text-gray-900">Visualisation du document</h3>
							<p class="mt-2 text-sm text-gray-500 max-w-md">
								Pour des raisons de sécurité, la prévisualisation du document peut être bloquée par votre navigateur. 
								Vous pouvez :
							</p>
							<div class="mt-6 flex flex-col gap-4">
								<a
									href={selectedDocument.url}
									target="_blank"
									rel="noopener noreferrer"
									class="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-missionnaire"
								>
									<svg class="w-5 h-5 mr-2 -ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
									</svg>
									Ouvrir dans un nouvel onglet
								</a>
								<a
									href={selectedDocument.url}
									download
									class="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-missionnaire hover:bg-missionnaire/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-missionnaire"
								>
									<div class="mr-2">
										<Export size={18} />
									</div>
									Télécharger le document
								</a>
								{#if selectedDocument.videoDisplayId}
									<a
										href={`https://www.youtube.com/watch?v=${selectedDocument.videoDisplayId}`}
										target="_blank"
										rel="noopener noreferrer"
										class="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-missionnaire"
									>
										<div class="mr-2">
											<VideoPlay size={18} />
										</div>
										Voir la vidéo associée
									</a>
								{/if}
							</div>
						</div>
					</div>
				</div>
			</div>
		{/if}
	</div>
</div>