<script lang="ts">
	let {
		onfileselected,
		accept = '.mp3,.wav,.flac,.ogg,.m4a,.aac'
	}: {
		onfileselected: (file: File) => void;
		accept?: string;
	} = $props();

	let dragover = $state(false);
	let selectedFile: File | null = $state(null);
	let inputEl: HTMLInputElement | undefined = $state(undefined);
	let error = $state('');

	const ALLOWED_EXTENSIONS = ['mp3', 'wav', 'flac', 'ogg', 'm4a', 'aac'];
	const MAX_SIZE = 500 * 1024 * 1024; // 500MB

	function validateFile(file: File): boolean {
		const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
		if (!ALLOWED_EXTENSIONS.includes(ext)) {
			error = `Format non supporté (.${ext}). Formats acceptés: ${ALLOWED_EXTENSIONS.join(', ')}`;
			return false;
		}
		if (file.size > MAX_SIZE) {
			error = `Fichier trop volumineux (${(file.size / 1024 / 1024).toFixed(0)} MB). Maximum: 500 MB`;
			return false;
		}
		error = '';
		return true;
	}

	function handleFile(file: File) {
		if (validateFile(file)) {
			selectedFile = file;
			onfileselected(file);
		}
	}

	function handleDrop(e: DragEvent) {
		dragover = false;
		const file = e.dataTransfer?.files[0];
		if (file) handleFile(file);
	}

	function handleInput(e: Event) {
		const target = e.target as HTMLInputElement;
		const file = target.files?.[0];
		if (file) handleFile(file);
	}

	function formatBytes(bytes: number): string {
		if (bytes === 0) return '0 B';
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
	}
</script>

<div>
	<button
		type="button"
		class="relative w-full cursor-pointer rounded-none border-2 border-dashed transition-all duration-200
		{dragover
			? 'border-primary bg-missionnaire-50/50'
			: selectedFile
				? 'border-green-300 bg-green-50/30'
				: 'border-stone-200 bg-white/40 hover:border-stone-300 hover:bg-cream/50'}"
		ondragover={(e) => { e.preventDefault(); dragover = true; }}
		ondragleave={() => (dragover = false)}
		ondrop={(e) => { e.preventDefault(); handleDrop(e); }}
		onclick={() => inputEl?.click()}
	>
		<input
			bind:this={inputEl}
			type="file"
			{accept}
			class="hidden"
			onchange={handleInput}
		/>

		<div class="flex flex-col items-center justify-center px-6 py-12">
			{#if selectedFile}
				<div class="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
					<svg class="h-7 w-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
					</svg>
				</div>
				<p class="text-sm font-medium text-stone-700">{selectedFile.name}</p>
				<p class="mt-1 text-xs text-stone-400">
					{formatBytes(selectedFile.size)} &middot; {selectedFile.type || 'audio'}
				</p>
				<p class="mt-3 text-xs text-stone-400">Cliquez pour changer de fichier</p>
			{:else}
				<div class="mb-3 flex h-14 w-14 items-center justify-center rounded-full {dragover ? 'bg-missionnaire-100' : 'bg-cream-dark'}">
					<svg class="h-7 w-7 {dragover ? 'text-primary' : 'text-stone-400'}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
					</svg>
				</div>
				<p class="text-sm font-medium text-stone-600">
					Glissez un fichier audio ici
				</p>
				<p class="mt-1 text-xs text-stone-400">
					ou cliquez pour parcourir &middot; MP3, WAV, FLAC, OGG, M4A, AAC &middot; Max 500 MB
				</p>
			{/if}
		</div>
	</button>

	{#if error}
		<p class="mt-2 text-sm text-red-600">{error}</p>
	{/if}
</div>
