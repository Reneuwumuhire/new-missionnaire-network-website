<script lang="ts">
	import '../app.css';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import Toast from '$lib/components/Toast.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import PullToRefresh from '$lib/components/PullToRefresh.svelte';
	import type { LayoutData } from './$types';
	import type { Snippet } from 'svelte';
	import { navigating } from '$app/state';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();
	const isLoggedIn = $derived(!!data.user);
</script>

<Toast />
<ConfirmDialog />
<PullToRefresh />

<!-- Navigation indicator. Sits at the top of the viewport so admins get
     instant feedback when clicking a sidebar link — same visual contract as
     the public site's navigating state. -->
{#if navigating.type}
	<div class="fixed top-0 left-0 right-0 z-[60] h-0.5 overflow-hidden bg-primary/10">
		<div class="nav-progress-bar h-full bg-primary"></div>
	</div>
{/if}

{#if isLoggedIn && data.user}
	<div class="min-h-screen bg-cream">
		<Sidebar
			user={{
				name: data.user.name,
				email: data.user.email,
				role: data.user.role,
				canManageRecordings: data.user.permissions.can_manage_recordings
			}}
			broadcastIsLive={data.broadcastIsLive}
		/>

		<!-- Main content -->
		<main class="lg:pl-64">
			<div class="page-transition-enter px-4 py-6 sm:px-8 lg:px-10 lg:py-8">
				{@render children()}
			</div>
		</main>
	</div>
{:else}
	{@render children()}
{/if}

<style>
	/* Top progress bar: slides quickly to ~80% then crawls — gives a sense of
	 * progress without lying about completion (we don't know real progress). */
	.nav-progress-bar {
		width: 0%;
		animation: nav-progress 4s cubic-bezier(0.05, 0.65, 0.3, 1) forwards;
	}
	@keyframes nav-progress {
		0% {
			width: 0%;
		}
		40% {
			width: 60%;
		}
		70% {
			width: 80%;
		}
		100% {
			width: 92%;
		}
	}
</style>
