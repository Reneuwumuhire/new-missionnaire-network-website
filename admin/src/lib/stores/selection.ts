import { writable, derived } from 'svelte/store';

function createSelectionStore() {
	const selected = writable<Set<string>>(new Set());

	function toggle(id: string) {
		selected.update((s) => {
			const next = new Set(s);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}

	function selectAll(ids: string[]) {
		selected.set(new Set(ids));
	}

	function clear() {
		selected.set(new Set());
	}

	function isSelected(id: string): boolean {
		let result = false;
		selected.subscribe((s) => (result = s.has(id)))();
		return result;
	}

	const count = derived(selected, ($selected) => $selected.size);
	const ids = derived(selected, ($selected) => Array.from($selected));

	return {
		subscribe: selected.subscribe,
		toggle,
		selectAll,
		clear,
		count,
		ids
	};
}

export const selection = createSelectionStore();
