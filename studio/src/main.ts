import './app.css';
import { mount } from 'svelte';
import App from './App.svelte';
import { applyTheme } from './lib/i18n.svelte';

// Before the first paint, so a light-theme operator never sees a dark flash.
applyTheme();

export default mount(App, { target: document.getElementById('app')! });
