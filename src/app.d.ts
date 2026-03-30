// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface Platform {}
	}
}

declare module '*?raw' {
	const content: string;
	export default content;
}

declare module 'iconsax-svelte/*.svelte' {
	import type { Component } from 'svelte';
	const component: Component<{
		size?: number | string;
		color?: string;
		variant?: 'Linear' | 'Outline' | 'Broken' | 'Bold' | 'Bulk' | 'TwoTone';
	}>;
	export default component;
}
