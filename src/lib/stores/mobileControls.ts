import { writable } from 'svelte/store';

// Shared UI state for the mobile compact toolbar on the list pages
// (/musique, /predications). The toolbar lives in each section layout;
// the page reads `mobileFiltersOpen` to reveal its collapsed filter
// sections. Both default to closed so the list is the priority on
// arrival — see `+mobileListToolbar.svelte`.

/** Is the collapsed search field shown? (mobile only) */
export const mobileSearchOpen = writable(false);

/** Is the collapsed filters panel shown? (mobile only) */
export const mobileFiltersOpen = writable(false);
