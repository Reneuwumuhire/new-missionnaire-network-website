<script lang="ts">
	import { selection } from '$lib/stores/selection';
	import { toast } from '$lib/stores/toast';
	import { invalidateAll } from '$app/navigation';

	let { categories = [] }: { categories: string[] } = $props();
	let showCategoryPicker = $state(false);
	let confirmDelete = $state(false);
	let loading = $state(false);

	async function bulkDelete() {
		const ids = $selection;
		if (ids.size === 0) return;
		loading = true;
		try {
			const res = await fetch('/api/audio/bulk', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'delete', ids: Array.from(ids) })
			});
			const data = await res.json();
			if (data.error) throw new Error(data.error);
			toast.success(`${data.data.deleted} audio(s) supprimé(s)`);
			selection.clear();
			confirmDelete = false;
			await invalidateAll();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Erreur lors de la suppression');
		} finally {
			loading = false;
		}
	}

	async function bulkUpdateCategory(category: string) {
		const ids = $selection;
		if (ids.size === 0) return;
		loading = true;
		try {
			const res = await fetch('/api/audio/bulk', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'update_category', ids: Array.from(ids), category })
			});
			const data = await res.json();
			if (data.error) throw new Error(data.error);
			toast.success(`${data.data.updated} audio(s) mis à jour`);
			selection.clear();
			showCategoryPicker = false;
			await invalidateAll();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Erreur lors de la mise à jour');
		} finally {
			loading = false;
		}
	}

	const count = selection.count;
</script>

{#if $count > 0}
	<div class="sticky bottom-4 z-20 mx-auto w-fit animate-[page-in_0.2s_ease] rounded-2xl border border-stone-200 bg-white px-6 py-3 shadow-lg">
		<div class="flex items-center gap-4">
			<span class="text-sm font-medium text-stone-700">
				{$count} sélectionné{$count > 1 ? 's' : ''}
			</span>

			<div class="h-5 w-px bg-stone-200"></div>

			<!-- Change category -->
			<div class="relative">
				<button
					onclick={() => { showCategoryPicker = !showCategoryPicker; confirmDelete = false; }}
					class="admin-btn-secondary py-1.5 text-xs"
				>
					Changer catégorie
				</button>
				{#if showCategoryPicker}
					<div class="absolute bottom-full left-0 mb-2 w-48 rounded-xl border border-stone-200 bg-white p-2 shadow-lg">
						{#each categories as cat}
							<button
								onclick={() => bulkUpdateCategory(cat)}
								disabled={loading}
								class="w-full rounded-lg px-3 py-1.5 text-left text-sm text-stone-600 transition-colors hover:bg-cream"
							>
								{cat}
							</button>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Delete -->
			{#if confirmDelete}
				<div class="flex items-center gap-2">
					<span class="text-xs text-red-600">Confirmer ?</span>
					<button onclick={bulkDelete} disabled={loading} class="admin-btn-danger py-1.5 text-xs">
						{loading ? 'Suppression...' : 'Oui, supprimer'}
					</button>
					<button onclick={() => (confirmDelete = false)} class="text-xs text-stone-500 hover:text-stone-700">
						Annuler
					</button>
				</div>
			{:else}
				<button
					onclick={() => { confirmDelete = true; showCategoryPicker = false; }}
					class="admin-btn-danger py-1.5 text-xs"
				>
					Supprimer
				</button>
			{/if}

			<button onclick={() => selection.clear()} class="text-xs text-stone-400 hover:text-stone-600">
				Désélectionner
			</button>
		</div>
	</div>
{/if}
