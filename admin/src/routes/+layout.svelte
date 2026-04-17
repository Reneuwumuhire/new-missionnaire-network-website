<script lang="ts">
	import '../app.css';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import Toast from '$lib/components/Toast.svelte';
	import type { LayoutData } from './$types';
	import type { Snippet } from 'svelte';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();
	const isLoggedIn = $derived(!!data.user);
</script>

<Toast />

{#if isLoggedIn && data.user}
	<div class="min-h-screen bg-cream">
		<Sidebar
			user={{
				name: data.user.name,
				email: data.user.email,
				role: data.user.role,
				canManageRecordings: data.user.permissions.can_manage_recordings
			}}
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
