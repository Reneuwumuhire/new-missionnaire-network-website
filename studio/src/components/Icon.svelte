<script module lang="ts">
	// 24px stroke icons, inlined. A whole icon package for twenty glyphs would
	// be more bytes and one more thing to keep updated; these are geometry.
	// Shapes follow Feather (MIT, © Cole Bemis) so they read the way every
	// other broadcast tool's icons do.
	const PATHS = {
		plus: '<path d="M12 5v14M5 12h14"/>',
		trash:
			'<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/>',
		gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
		up: '<path d="M18 15l-6-6-6 6"/>',
		down: '<path d="M6 9l6 6 6-6"/>',
		eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
		eyeOff:
			'<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><path d="M1 1l22 22"/>',
		lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
		unlock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>',
		more: '<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>',
		pencil: '<path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>',
		volume:
			'<path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>',
		volumeOff: '<path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M23 9l-6 6M17 9l6 6"/>',
		camera: '<path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/>',
		mic: '<rect x="9" y="2" width="6" height="11" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v4M8 21h8"/>',
		monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
		image:
			'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
		film: '<rect x="2" y="2" width="20" height="20" rx="2.2"/><path d="M7 2v20M17 2v20M2 12h20M2 7h5M2 17h5M17 17h5M17 7h5"/>',
		text: '<path d="M4 7V4h16v3M9 20h6M12 4v16"/>',
		music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
		droplet: '<path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>',
		close: '<path d="M18 6L6 18M6 6l12 12"/>',
		refresh:
			'<path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
		alignLeft: '<path d="M17 10H3M21 6H3M21 14H3M17 18H3"/>',
		alignCenter: '<path d="M18 10H6M21 6H3M21 14H3M18 18H6"/>',
		alignRight: '<path d="M21 10H7M21 6H3M21 14H3M21 18H7"/>'
	};

	export type IconName = keyof typeof PATHS;
	export { PATHS };
</script>

<script lang="ts">
	let {
		name,
		size = 15,
		strokeWidth = 1.75,
		/** Quarter turns — the horizontal align icons double as vertical ones. */
		rotate = 0,
		class: klass = ''
	}: {
		name: IconName;
		size?: number;
		strokeWidth?: number;
		rotate?: number;
		class?: string;
	} = $props();
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width={strokeWidth}
	stroke-linecap="round"
	stroke-linejoin="round"
	class="shrink-0 {klass}"
	style={rotate ? `transform: rotate(${rotate * 90}deg)` : ''}
	aria-hidden="true"
>
	<!-- Static, authored above — never user input. -->
	{@html PATHS[name]}
</svg>
