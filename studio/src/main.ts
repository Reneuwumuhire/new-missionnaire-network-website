import './app.css';
import { invoke } from '@tauri-apps/api/core';

// A packaged .app has no console anyone can reach, and a failure during boot
// leaves a black window with nothing to go on. These two lines are registered
// before the app is imported — a module that throws on load happens before any
// code inside it runs — and put whatever went wrong on the terminal.
const shout = (line: string) => void invoke('report', { line }).catch(() => {});
window.addEventListener('error', (event) =>
	shout(`JS ERROR ${event.message} @ ${event.filename}:${event.lineno}`)
);
window.addEventListener('unhandledrejection', (event) => shout(`JS REJECTED ${event.reason}`));

// Dynamic so the listeners above are already in place if this import is what
// fails. Before the first paint, so a light-theme operator never sees a dark
// flash.
const [{ mount }, { default: App }, { applyTheme }] = await Promise.all([
	import('svelte'),
	import('./App.svelte'),
	import('./lib/i18n.svelte')
]);
applyTheme();

export default mount(App, { target: document.getElementById('app')! });
