<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
	let loading = $state(false);
</script>

<svelte:head>
	<title>Connexion - Missionnaire Admin</title>
</svelte:head>

<div class="flex min-h-screen items-center justify-center bg-cream px-4">
	<div class="w-full max-w-md">
		<!-- Logo / Brand -->
		<div class="mb-10 text-center">
			<h1 class="font-display text-4xl font-bold tracking-tight text-stone-800">
				Missionnaire
			</h1>
			<p class="mt-1 font-body text-sm tracking-widest text-earth uppercase">
				Administration
			</p>
			<div class="ornament-line mt-6">
				<span class="text-xs text-earth/60">&#10047;</span>
			</div>
		</div>

		<!-- Login Card -->
		<div class="rounded-2xl border border-stone-200/60 bg-white p-8 shadow-4xl">
			{#if form?.error}
				<div
					class="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
				>
					{form.error}
				</div>
			{/if}

			<form
				method="POST"
				use:enhance={() => {
					loading = true;
					return async ({ update }) => {
						loading = false;
						await update();
					};
				}}
			>
				<div class="mb-5">
					<label for="email" class="admin-label">Adresse email</label>
					<input
						id="email"
						name="email"
						type="email"
						autocomplete="email"
						required
						value={form?.email ?? ''}
						class="admin-input"
						placeholder="admin@missionnaire.net"
					/>
				</div>

				<div class="mb-8">
					<label for="password" class="admin-label">Mot de passe</label>
					<input
						id="password"
						name="password"
						type="password"
						autocomplete="current-password"
						required
						class="admin-input"
						placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;"
					/>
				</div>

				<button
					type="submit"
					disabled={loading}
					class="admin-btn-primary w-full justify-center py-3 text-base disabled:opacity-60"
				>
					{#if loading}
						<svg class="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
							<circle
								class="opacity-25"
								cx="12"
								cy="12"
								r="10"
								stroke="currentColor"
								stroke-width="4"
							/>
							<path
								class="opacity-75"
								fill="currentColor"
								d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
							/>
						</svg>
						Connexion...
					{:else}
						Se connecter
					{/if}
				</button>
			</form>
		</div>

		<p class="mt-8 text-center text-xs text-stone-400">
			Missionnaire Network &copy; {new Date().getFullYear()}
		</p>
	</div>
</div>
