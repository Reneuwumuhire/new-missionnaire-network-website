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

declare module 'svelte-icons-pack' {
	import type { Component } from 'svelte';
	const Icon: Component<{
		src?: any;
		size?: number | string;
		color?: string;
		className?: string;
	}>;
	export default Icon;
}

declare module 'svelte-icons-pack/Icon.svelte' {
	import type { Component } from 'svelte';
	const component: Component<{
		src?: any;
		size?: number | string;
		color?: string;
		className?: string;
	}>;
	export default component;
}

declare module 'svelte-icons-pack/*' {
	const icon: any;
	export default icon;
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
