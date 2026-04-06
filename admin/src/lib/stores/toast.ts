import { writable } from 'svelte/store';

export interface Toast {
	id: string;
	type: 'success' | 'error' | 'info';
	message: string;
}

function createToastStore() {
	const { subscribe, update } = writable<Toast[]>([]);

	function add(type: Toast['type'], message: string, duration = 5000) {
		const id = crypto.randomUUID();
		update((toasts) => [...toasts, { id, type, message }]);
		setTimeout(() => dismiss(id), duration);
	}

	function dismiss(id: string) {
		update((toasts) => toasts.filter((t) => t.id !== id));
	}

	return {
		subscribe,
		success: (msg: string) => add('success', msg),
		error: (msg: string) => add('error', msg),
		info: (msg: string) => add('info', msg),
		dismiss
	};
}

export const toast = createToastStore();
