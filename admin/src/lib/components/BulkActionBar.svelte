<script lang="ts">
	import { selection } from '$lib/stores/selection';
	import { toast } from '$lib/stores/toast';
	import { invalidateAll } from '$app/navigation';
	import { t } from '$lib/i18n';

	let {
		categories = [],
		canDelete = false,
		canEdit = false
	}: { categories: string[]; canDelete?: boolean; canEdit?: boolean } = $props();
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
			toast.success($t('audio.bulkbar.deletedToast', { count: data.data.deleted }));
			selection.clear();
			confirmDelete = false;
			await invalidateAll();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : $t('audio.bulkbar.deleteError'));
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
			toast.success($t('audio.bulkbar.updatedToast', { count: data.data.updated }));
			selection.clear();
			showCategoryPicker = false;
			await invalidateAll();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : $t('audio.bulkbar.updateError'));
		} finally {
			loading = false;
		}
	}

	const count = selection.count;
</script>

{#if $count > 0}
	<div class="sticky bottom-4 z-20 mx-auto w-fit animate-[page-in_0.2s_ease] rounded-sm border border-stone-200 bg-white px-6 py-3 shadow-lg">
		<div class="flex items-center gap-4">
			<span class="text-sm font-medium text-stone-700">
				{$count > 1 ? $t('audio.bulkbar.selectedMany', { count: $count }) : $t('audio.bulkbar.selectedOne', { count: $count })}
			</span>

			<div class="h-5 w-px bg-stone-200"></div>

			{#if canEdit}
				<!-- Change category -->
				<div class="relative">
					<button
						onclick={() => { showCategoryPicker = !showCategoryPicker; confirmDelete = false; }}
						class="admin-btn-secondary py-1.5 text-xs"
					>
						{$t('audio.bulkbar.changeCategory')}
					</button>
					{#if showCategoryPicker}
						<div class="absolute bottom-full left-0 mb-2 w-48 rounded-sm border border-stone-200 bg-white p-2 shadow-lg">
							{#each categories as cat}
								<button
									onclick={() => bulkUpdateCategory(cat)}
									disabled={loading}
									class="w-full rounded-none px-3 py-1.5 text-left text-sm text-stone-600 transition-colors hover:bg-cream"
								>
									{cat}
								</button>
							{/each}
						</div>
					{/if}
				</div>
			{/if}

			<!-- Delete -->
			{#if canDelete}
				{#if confirmDelete}
					<div class="flex items-center gap-2">
						<span class="text-xs text-red-600">{$t('audio.bulkbar.confirm')}</span>
						<button onclick={bulkDelete} disabled={loading} class="admin-btn-danger py-1.5 text-xs">
							{loading ? $t('audio.bulkbar.deleting') : $t('audio.bulkbar.yesDelete')}
						</button>
						<button onclick={() => (confirmDelete = false)} class="text-xs text-stone-500 hover:text-stone-700">
							{$t('audio.common.cancel')}
						</button>
					</div>
				{:else}
					<button
						onclick={() => { confirmDelete = true; showCategoryPicker = false; }}
						class="admin-btn-danger py-1.5 text-xs"
					>
						{$t('audio.bulkbar.delete')}
					</button>
				{/if}
			{/if}

			<button onclick={() => selection.clear()} class="text-xs text-stone-400 hover:text-stone-600">
				{$t('audio.bulkbar.deselect')}
			</button>
		</div>
	</div>
{/if}
