<script lang="ts">
	import { connectWithAdmin, liveSession } from '../lib/live-session.svelte';

	let { oncomplete }: { oncomplete: () => void } = $props();
	let connecting = $state(false);
	let error = $state('');

	async function connect() {
		connecting = true;
		error = '';
		try {
			await connectWithAdmin();
			if (!liveSession.operatorName) {
				throw new Error(liveSession.error || 'The admin connection was not approved.');
			}
			oncomplete();
		} catch (cause) {
			error = cause instanceof Error ? cause.message : String(cause);
		} finally {
			connecting = false;
		}
	}
</script>

<div class="space-y-5 p-5">
	<div>
		<h3 class="text-lg font-semibold text-fg/90">Welcome to Missionnaire Studio</h3>
		<p class="mt-1 max-w-2xl text-[12px] leading-relaxed text-fg/50">
			Connect this computer to the admin app to manage services, YouTube and cloud recordings.
			Server credentials stay on the server and are never copied into Studio.
		</p>
	</div>

	<div class="border border-ink-700 bg-ink-850 p-4 text-[12px] leading-relaxed text-fg/55">
		Your browser will open the admin app. Sign in and approve this Studio computer, then return
		here.
	</div>

	{#if error}<p class="text-[12px] text-red-400">{error}</p>{/if}

	<div class="flex justify-end gap-2 border-t border-ink-700 pt-4">
		<button class="studio-chip px-3" disabled={connecting} onclick={oncomplete}
			>Continue offline</button
		>
		<button
			class="studio-chip bg-primary/20 px-4 text-primary"
			disabled={connecting}
			onclick={() => void connect()}
			>{connecting ? 'Waiting for admin…' : 'Connect to admin app'}</button
		>
	</div>
</div>
