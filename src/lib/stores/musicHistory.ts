import { writable } from 'svelte/store';
import { browser } from '$app/environment';

const RECENT_KEY = 'mn-recently-played';
const FAVORITES_KEY = 'mn-favorites';
const MAX_RECENT = 20;

export interface HistoryItem {
	id: string;
	title: string;
	artist?: string;
	category?: string;
	s3_url?: string;
	addedAt: number;
}

function loadFromStorage(key: string): HistoryItem[] {
	if (!browser) return [];
	try {
		const raw = localStorage.getItem(key);
		return raw ? JSON.parse(raw) : [];
	} catch {
		return [];
	}
}

function saveToStorage(key: string, items: HistoryItem[]) {
	if (!browser) return;
	try {
		localStorage.setItem(key, JSON.stringify(items));
	} catch {
		// Storage full or unavailable
	}
}

// Recently Played
export const recentlyPlayed = writable<HistoryItem[]>(loadFromStorage(RECENT_KEY));

export function addToRecentlyPlayed(song: { _id?: string; title?: string; artist?: string; category?: string; s3_url?: string }) {
	const id = song._id || song.s3_url || '';
	if (!id) return;

	recentlyPlayed.update((items) => {
		const filtered = items.filter((i) => i.id !== id);
		const entry: HistoryItem = {
			id,
			title: song.title || 'Sans titre',
			artist: song.artist,
			category: song.category,
			s3_url: song.s3_url,
			addedAt: Date.now()
		};
		const updated = [entry, ...filtered].slice(0, MAX_RECENT);
		saveToStorage(RECENT_KEY, updated);
		return updated;
	});
}

// Favorites
export const favorites = writable<HistoryItem[]>(loadFromStorage(FAVORITES_KEY));

export function toggleFavorite(song: { _id?: string; title?: string; artist?: string; category?: string; s3_url?: string }) {
	const id = song._id || song.s3_url || '';
	if (!id) return;

	favorites.update((items) => {
		const exists = items.find((i) => i.id === id);
		let updated: HistoryItem[];
		if (exists) {
			updated = items.filter((i) => i.id !== id);
		} else {
			updated = [{
				id,
				title: song.title || 'Sans titre',
				artist: song.artist,
				category: song.category,
				s3_url: song.s3_url,
				addedAt: Date.now()
			}, ...items];
		}
		saveToStorage(FAVORITES_KEY, updated);
		return updated;
	});
}

export function isFavorite(id: string, favs: HistoryItem[]): boolean {
	return favs.some((i) => i.id === id);
}
