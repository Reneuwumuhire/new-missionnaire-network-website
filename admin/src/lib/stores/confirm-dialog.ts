import { writable } from 'svelte/store';

export type ConfirmTone = 'default' | 'danger' | 'warning';

export interface ConfirmDialogOptions {
	title: string;
	message: string;
	confirmLabel?: string;
	cancelLabel?: string;
	tone?: ConfirmTone;
}

interface PendingConfirm extends ConfirmDialogOptions {
	id: string;
	resolve: (ok: boolean) => void;
}

function createConfirmStore() {
	const { subscribe, set, update } = writable<PendingConfirm | null>(null);

	function ask(opts: ConfirmDialogOptions): Promise<boolean> {
		return new Promise((resolve) => {
			set({ ...opts, id: crypto.randomUUID(), resolve });
		});
	}

	function close(ok: boolean) {
		update((current) => {
			if (current) current.resolve(ok);
			return null;
		});
	}

	return {
		subscribe,
		ask,
		accept: () => close(true),
		cancel: () => close(false)
	};
}

export const confirmDialog = createConfirmStore();
