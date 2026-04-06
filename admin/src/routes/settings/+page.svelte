<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let profileLoading = $state(false);
	let passwordLoading = $state(false);
	let showCurrentPassword = $state(false);
	let showNewPassword = $state(false);

	function formatDate(date: string | Date | null): string {
		if (!date) return 'Jamais';
		return new Date(date).toLocaleDateString('fr-FR', {
			day: 'numeric',
			month: 'long',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	const roleLabel: Record<string, string> = {
		superadmin: 'Super Administrateur',
		editor: 'Éditeur'
	};
</script>

<svelte:head>
	<title>Paramètres - Missionnaire Admin</title>
</svelte:head>

<div class="mb-8">
	<h1 class="font-display text-3xl font-bold text-stone-800">Paramètres</h1>
	<p class="mt-1 text-sm text-stone-500">Gérez votre profil et votre sécurité</p>
</div>

<div class="mx-auto max-w-2xl space-y-6">

	<!-- Profile card -->
	<div class="overflow-hidden rounded-2xl border border-stone-200/60 bg-white">
		<!-- Header with avatar -->
		<div class="relative border-b border-stone-100 bg-gradient-to-br from-missionnaire-50 via-cream to-cream-dark px-6 pb-6 pt-8">
			<div class="flex items-center gap-5">
				<div class="flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-2xl font-bold text-primary shadow-sm ring-4 ring-white font-display">
					{data.user.name.charAt(0).toUpperCase()}
				</div>
				<div>
					<h2 class="font-display text-xl font-bold text-stone-800">{data.user.name}</h2>
					<p class="text-sm text-stone-500">{data.user.email}</p>
					<span class="mt-1.5 inline-flex items-center rounded-full bg-white/80 px-2.5 py-0.5 text-xs font-medium text-earth shadow-sm">
						{roleLabel[data.user.role] ?? data.user.role}
					</span>
				</div>
			</div>
		</div>

		<!-- Profile form -->
		<form
			method="POST"
			action="?/profile"
			use:enhance={() => {
				profileLoading = true;
				return async ({ update }) => {
					profileLoading = false;
					await update();
				};
			}}
			class="p-6"
		>
			<h3 class="mb-4 flex items-center gap-2 text-sm font-semibold tracking-wide text-stone-500 uppercase">
				<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
				</svg>
				Profil
			</h3>

			{#if form?.profileSuccess}
				<div class="mb-5 rounded-xl border border-green-200 bg-green-50/80 px-4 py-3 text-sm text-green-700">
					Profil mis à jour avec succès
				</div>
			{/if}
			{#if form?.profileError}
				<div class="mb-5 rounded-xl border border-red-200 bg-red-50/80 px-4 py-3 text-sm text-red-700">
					{form.profileError}
				</div>
			{/if}

			<div class="space-y-4">
				<div>
					<label for="name" class="admin-label">Nom</label>
					<input
						id="name"
						name="name"
						type="text"
						required
						value={data.user.name}
						class="admin-input"
					/>
				</div>

				<div>
					<label for="email-display" class="admin-label">Adresse email</label>
					<input
						id="email-display"
						type="email"
						disabled
						value={data.user.email}
						class="admin-input cursor-not-allowed bg-cream/60 text-stone-400"
					/>
					<p class="mt-1 text-xs text-stone-400">L'adresse email ne peut pas être modifiée</p>
				</div>
			</div>

			<!-- Account info -->
			<div class="mt-5 rounded-xl bg-cream/50 p-4">
				<div class="grid grid-cols-2 gap-3 text-xs">
					<div>
						<span class="text-stone-400">Membre depuis</span>
						<p class="mt-0.5 font-medium text-stone-600">{formatDate(data.user.created_at)}</p>
					</div>
					<div>
						<span class="text-stone-400">Dernière connexion</span>
						<p class="mt-0.5 font-medium text-stone-600">{formatDate(data.user.last_login)}</p>
					</div>
				</div>
			</div>

			<div class="mt-5 flex justify-end">
				<button type="submit" disabled={profileLoading} class="admin-btn-primary disabled:opacity-50">
					{#if profileLoading}
						<svg class="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
							<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
							<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
						</svg>
					{/if}
					Enregistrer le profil
				</button>
			</div>
		</form>
	</div>

	<!-- Password card -->
	<div class="rounded-2xl border border-stone-200/60 bg-white p-6">
		<h3 class="mb-5 flex items-center gap-2 text-sm font-semibold tracking-wide text-stone-500 uppercase">
			<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
			</svg>
			Changer le mot de passe
		</h3>

		{#if form?.passwordSuccess}
			<div class="mb-5 rounded-xl border border-green-200 bg-green-50/80 px-4 py-3 text-sm text-green-700">
				Mot de passe mis à jour avec succès
			</div>
		{/if}
		{#if form?.passwordError}
			<div class="mb-5 rounded-xl border border-red-200 bg-red-50/80 px-4 py-3 text-sm text-red-700">
				{form.passwordError}
			</div>
		{/if}

		<form
			method="POST"
			action="?/password"
			use:enhance={() => {
				passwordLoading = true;
				return async ({ update, result }) => {
					passwordLoading = false;
					if (result.type === 'success') {
						// Clear password fields on success
						const formEl = document.querySelector('form[action="?/password"]') as HTMLFormElement;
						formEl?.reset();
					}
					await update();
				};
			}}
		>
			<div class="space-y-4">
				<div>
					<label for="currentPassword" class="admin-label">Mot de passe actuel</label>
					<div class="relative">
						<input
							id="currentPassword"
							name="currentPassword"
							type={showCurrentPassword ? 'text' : 'password'}
							required
							autocomplete="current-password"
							class="admin-input pr-10"
						/>
						<button
							type="button"
							onclick={() => (showCurrentPassword = !showCurrentPassword)}
							class="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 transition-colors hover:text-stone-600"
							aria-label={showCurrentPassword ? 'Masquer' : 'Afficher'}
						>
							{#if showCurrentPassword}
								<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
									<path stroke-linecap="round" stroke-linejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
								</svg>
							{:else}
								<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
									<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
									<path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
								</svg>
							{/if}
						</button>
					</div>
				</div>

				<div class="ornament-line my-2">
					<span class="text-xs text-earth/30">&#8226;</span>
				</div>

				<div>
					<label for="newPassword" class="admin-label">Nouveau mot de passe</label>
					<div class="relative">
						<input
							id="newPassword"
							name="newPassword"
							type={showNewPassword ? 'text' : 'password'}
							required
							minlength={8}
							autocomplete="new-password"
							class="admin-input pr-10"
							placeholder="Minimum 8 caractères"
						/>
						<button
							type="button"
							onclick={() => (showNewPassword = !showNewPassword)}
							class="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 transition-colors hover:text-stone-600"
							aria-label={showNewPassword ? 'Masquer' : 'Afficher'}
						>
							{#if showNewPassword}
								<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
									<path stroke-linecap="round" stroke-linejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
								</svg>
							{:else}
								<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
									<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
									<path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
								</svg>
							{/if}
						</button>
					</div>
				</div>

				<div>
					<label for="confirmPassword" class="admin-label">Confirmer le nouveau mot de passe</label>
					<input
						id="confirmPassword"
						name="confirmPassword"
						type="password"
						required
						minlength={8}
						autocomplete="new-password"
						class="admin-input"
						placeholder="Retapez le nouveau mot de passe"
					/>
				</div>
			</div>

			<div class="mt-5 flex justify-end">
				<button type="submit" disabled={passwordLoading} class="admin-btn-primary disabled:opacity-50">
					{#if passwordLoading}
						<svg class="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
							<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
							<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
						</svg>
					{/if}
					Mettre à jour le mot de passe
				</button>
			</div>
		</form>
	</div>
</div>
