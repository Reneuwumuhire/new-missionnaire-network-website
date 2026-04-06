<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let showCreateForm = $state(false);
	let createLoading = $state(false);
	let copiedPassword = $state(false);
	let confirmResetEmail = $state<string | null>(null);
	let confirmToggleEmail = $state<string | null>(null);
	let permissionsEmail = $state<string | null>(null);

	// The generated password to display after creation or reset
	const generatedPassword = $derived(form?.generatedPassword ?? form?.resetPassword ?? null);
	const passwordTargetEmail = $derived(form?.createdEmail ?? form?.resetEmail ?? null);

	function formatDate(date: string | Date | null): string {
		if (!date) return 'Jamais';
		return new Date(date).toLocaleDateString('fr-FR', {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		});
	}

	async function copyPassword() {
		if (!generatedPassword) return;
		await navigator.clipboard.writeText(generatedPassword as string);
		copiedPassword = true;
		setTimeout(() => (copiedPassword = false), 3000);
	}

	const roleLabel: Record<string, string> = {
		superadmin: 'Super Admin',
		editor: 'Éditeur'
	};
</script>

<svelte:head>
	<title>Utilisateurs - Missionnaire Admin</title>
</svelte:head>

<div class="mb-8 flex items-end justify-between">
	<div>
		<h1 class="font-display text-3xl font-bold text-stone-800">Utilisateurs</h1>
		<p class="mt-1 text-sm text-stone-500">{data.users.length} compte{data.users.length !== 1 ? 's' : ''} administrateur</p>
	</div>
	<button onclick={() => (showCreateForm = !showCreateForm)} class="admin-btn-primary">
		<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
			<path stroke-linecap="round" stroke-linejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
		</svg>
		Ajouter un utilisateur
	</button>
</div>

<!-- Generated password banner -->
{#if generatedPassword && passwordTargetEmail}
	<div class="mb-6 rounded-2xl border border-amber-200 bg-amber-50/80 p-5">
		<div class="flex items-start gap-3">
			<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100">
				<svg class="h-5 w-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
				</svg>
			</div>
			<div class="min-w-0 flex-1">
				<p class="text-sm font-semibold text-amber-800">
					Mot de passe généré pour {passwordTargetEmail}
				</p>
				<p class="mt-1 text-xs text-amber-600">
					Copiez ce mot de passe et partagez-le avec l'utilisateur. Il ne sera plus visible après avoir quitté cette page.
				</p>
				<div class="mt-3 flex items-center gap-2">
					<code class="rounded-lg border border-amber-200 bg-white px-4 py-2 font-mono text-base font-bold tracking-wider text-stone-800 select-all">
						{generatedPassword}
					</code>
					<button
						onclick={copyPassword}
						class="rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-50"
					>
						{#if copiedPassword}
							<span class="flex items-center gap-1">
								<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
									<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
								</svg>
								Copié
							</span>
						{:else}
							Copier
						{/if}
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}

<!-- Create user form -->
{#if showCreateForm}
	<div class="mb-6 rounded-2xl border border-stone-200/60 bg-white p-6">
		<h2 class="mb-5 flex items-center gap-2 font-display text-lg font-semibold text-stone-700">
			<svg class="h-5 w-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path stroke-linecap="round" stroke-linejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
			</svg>
			Nouvel utilisateur
		</h2>

		{#if form?.createError}
			<div class="mb-4 rounded-xl border border-red-200 bg-red-50/80 px-4 py-3 text-sm text-red-700">
				{form.createError}
			</div>
		{/if}

		<form
			method="POST"
			action="?/create"
			use:enhance={() => {
				createLoading = true;
				return async ({ update, result }) => {
					createLoading = false;
					if (result.type === 'success') {
						showCreateForm = false;
					}
					await update();
				};
			}}
		>
			<div class="grid gap-4 sm:grid-cols-3">
				<div>
					<label for="name" class="admin-label">Nom complet</label>
					<input id="name" name="name" type="text" required class="admin-input" placeholder="Jean Dupont" />
				</div>
				<div>
					<label for="email" class="admin-label">Adresse email</label>
					<input id="email" name="email" type="email" required class="admin-input" placeholder="jean@missionnaire.net" />
				</div>
				<div>
					<label for="role" class="admin-label">Rôle</label>
					<select id="role" name="role" class="admin-input">
						<option value="editor">Éditeur</option>
						<option value="superadmin">Super Administrateur</option>
					</select>
				</div>
			</div>

			<div class="mt-3 rounded-lg bg-cream/60 px-4 py-2.5 text-xs text-stone-500">
				Un mot de passe sera généré automatiquement. Vous pourrez le copier et le partager avec l'utilisateur.
			</div>

			<div class="mt-4 flex items-center gap-3">
				<button type="submit" disabled={createLoading} class="admin-btn-primary disabled:opacity-50">
					{#if createLoading}
						<svg class="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
							<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
							<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
						</svg>
					{/if}
					Créer l'utilisateur
				</button>
				<button type="button" onclick={() => (showCreateForm = false)} class="admin-btn-secondary">
					Annuler
				</button>
			</div>
		</form>
	</div>
{/if}

<!-- Users table -->
<div class="overflow-hidden rounded-2xl border border-stone-200/60 bg-white">
	<table class="w-full text-left text-sm">
		<thead>
			<tr class="border-b border-stone-100 bg-cream/50">
				<th class="px-5 py-3.5 font-medium text-stone-500">Utilisateur</th>
				<th class="px-5 py-3.5 font-medium text-stone-500">Rôle</th>
				<th class="px-5 py-3.5 font-medium text-stone-500">Permissions</th>
				<th class="px-5 py-3.5 font-medium text-stone-500">Statut</th>
				<th class="px-5 py-3.5 font-medium text-stone-500">Dernière connexion</th>
				<th class="px-5 py-3.5 text-right font-medium text-stone-500">Actions</th>
			</tr>
		</thead>
		<tbody>
			{#each data.users as user}
				{@const ep = user.effectivePermissions}
				<tr class="border-b border-stone-50 transition-colors hover:bg-cream/30">
					<td class="px-5 py-4">
						<div class="flex items-center gap-3">
							<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-display text-sm font-bold {user.is_active ? 'bg-missionnaire-50 text-primary' : 'bg-stone-100 text-stone-400'}">
								{user.name.charAt(0).toUpperCase()}
							</div>
							<div>
								<p class="font-medium text-stone-700">{user.name}</p>
								<p class="text-xs text-stone-400">{user.email}</p>
							</div>
						</div>
					</td>
					<td class="px-5 py-4">
						<span class="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium {user.role === 'superadmin' ? 'bg-primary/10 text-primary' : 'bg-earth/10 text-earth'}">
							{roleLabel[user.role] ?? user.role}
						</span>
					</td>
					<td class="px-5 py-4">
						{#if user.role === 'superadmin'}
							<span class="text-xs text-stone-400 italic">Accès complet</span>
						{:else}
							<div class="flex items-center gap-1.5">
								<span class="inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide {ep.can_add ? 'bg-green-100 text-green-700' : 'bg-stone-100 text-stone-400'}">
									Ajout
								</span>
								<span class="inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide {ep.can_edit ? 'bg-blue-100 text-blue-700' : 'bg-stone-100 text-stone-400'}">
									Modif
								</span>
								<span class="inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide {ep.can_delete ? 'bg-red-100 text-red-700' : 'bg-stone-100 text-stone-400'}">
									Suppr
								</span>
								<button
									onclick={() => permissionsEmail = permissionsEmail === user.email ? null : user.email}
									class="ml-1 rounded-md p-1 text-stone-400 transition-colors hover:bg-cream-dark hover:text-stone-600"
									title="Modifier les permissions"
								>
									<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
										<path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
									</svg>
								</button>
							</div>
						{/if}
					</td>
					<td class="px-5 py-4">
						<span class="inline-flex items-center gap-1.5 text-xs font-medium {user.is_active ? 'text-green-600' : 'text-stone-400'}">
							<span class="h-1.5 w-1.5 rounded-full {user.is_active ? 'bg-green-500' : 'bg-stone-300'}"></span>
							{user.is_active ? 'Actif' : 'Désactivé'}
						</span>
					</td>
					<td class="px-5 py-4 text-stone-500">{formatDate(user.last_login)}</td>
					<td class="px-5 py-4">
						<div class="flex items-center justify-end gap-1">
							<!-- Reset password -->
							{#if confirmResetEmail === user.email}
								<form
									method="POST"
									action="?/reset"
									use:enhance={() => {
										return async ({ update }) => {
											confirmResetEmail = null;
											await update();
										};
									}}
									class="flex items-center gap-1"
								>
									<input type="hidden" name="email" value={user.email} />
									<span class="text-xs text-amber-600">Confirmer ?</span>
									<button type="submit" class="rounded-lg bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-200">
										Oui
									</button>
									<button type="button" onclick={() => (confirmResetEmail = null)} class="rounded-lg px-2 py-1 text-xs text-stone-400 hover:text-stone-600">
										Non
									</button>
								</form>
							{:else}
								<button
									onclick={() => { confirmResetEmail = user.email; confirmToggleEmail = null; permissionsEmail = null; }}
									class="rounded-lg px-2.5 py-1.5 text-xs text-stone-500 transition-colors hover:bg-amber-50 hover:text-amber-700"
									title="Réinitialiser le mot de passe"
								>
									<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
										<path stroke-linecap="round" stroke-linejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
									</svg>
								</button>
							{/if}

							<!-- Toggle active -->
							{#if confirmToggleEmail === user.email}
								<form
									method="POST"
									action="?/toggle"
									use:enhance={() => {
										return async ({ update }) => {
											confirmToggleEmail = null;
											await update();
										};
									}}
									class="flex items-center gap-1"
								>
									<input type="hidden" name="email" value={user.email} />
									<input type="hidden" name="action" value={user.is_active ? 'deactivate' : 'activate'} />
									<span class="text-xs {user.is_active ? 'text-red-600' : 'text-green-600'}">
										{user.is_active ? 'Désactiver ?' : 'Activer ?'}
									</span>
									<button type="submit" class="rounded-lg px-2.5 py-1 text-xs font-medium {user.is_active ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-green-100 text-green-700 hover:bg-green-200'}">
										Oui
									</button>
									<button type="button" onclick={() => (confirmToggleEmail = null)} class="rounded-lg px-2 py-1 text-xs text-stone-400 hover:text-stone-600">
										Non
									</button>
								</form>
							{:else}
								<button
									onclick={() => { confirmToggleEmail = user.email; confirmResetEmail = null; permissionsEmail = null; }}
									class="rounded-lg px-2.5 py-1.5 text-xs transition-colors {user.is_active ? 'text-stone-500 hover:bg-red-50 hover:text-red-600' : 'text-stone-500 hover:bg-green-50 hover:text-green-600'}"
									title={user.is_active ? 'Désactiver' : 'Activer'}
								>
									{#if user.is_active}
										<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
											<path stroke-linecap="round" stroke-linejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
										</svg>
									{:else}
										<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
											<path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
										</svg>
									{/if}
								</button>
							{/if}
						</div>
					</td>
				</tr>

				<!-- Permissions editor row (expandable) -->
				{#if permissionsEmail === user.email && user.role !== 'superadmin'}
					<tr class="border-b border-stone-50 bg-cream/30">
						<td colspan="6" class="px-5 py-4">
							<form
								method="POST"
								action="?/permissions"
								use:enhance={() => {
									return async ({ update }) => {
										permissionsEmail = null;
										await update();
									};
								}}
								class="flex flex-wrap items-center gap-5"
							>
								<input type="hidden" name="email" value={user.email} />

								<span class="text-xs font-semibold tracking-wide text-stone-500 uppercase">
									Permissions pour {user.name}
								</span>

								<label class="flex cursor-pointer items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2 transition-colors has-[:checked]:border-green-300 has-[:checked]:bg-green-50">
									<input
										type="checkbox"
										name="can_add"
										checked={ep.can_add}
										class="h-4 w-4 rounded border-stone-300 text-green-600 focus:ring-green-500/30"
									/>
									<div>
										<span class="text-sm font-medium text-stone-700">Ajouter</span>
										<p class="text-[10px] text-stone-400">Importer de nouveaux audios</p>
									</div>
								</label>

								<label class="flex cursor-pointer items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2 transition-colors has-[:checked]:border-blue-300 has-[:checked]:bg-blue-50">
									<input
										type="checkbox"
										name="can_edit"
										checked={ep.can_edit}
										class="h-4 w-4 rounded border-stone-300 text-blue-600 focus:ring-blue-500/30"
									/>
									<div>
										<span class="text-sm font-medium text-stone-700">Modifier</span>
										<p class="text-[10px] text-stone-400">Éditer titre, artiste, catégorie</p>
									</div>
								</label>

								<label class="flex cursor-pointer items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2 transition-colors has-[:checked]:border-red-300 has-[:checked]:bg-red-50">
									<input
										type="checkbox"
										name="can_delete"
										checked={ep.can_delete}
										class="h-4 w-4 rounded border-stone-300 text-red-600 focus:ring-red-500/30"
									/>
									<div>
										<span class="text-sm font-medium text-stone-700">Supprimer</span>
										<p class="text-[10px] text-stone-400">Retirer des audios du serveur</p>
									</div>
								</label>

								<div class="flex items-center gap-2">
									<button type="submit" class="admin-btn-primary py-1.5 text-xs">
										Enregistrer
									</button>
									<button type="button" onclick={() => (permissionsEmail = null)} class="text-xs text-stone-400 hover:text-stone-600">
										Annuler
									</button>
								</div>
							</form>
						</td>
					</tr>
				{/if}
			{/each}
			{#if data.users.length === 0}
				<tr>
					<td colspan="6" class="px-5 py-12 text-center text-stone-400">
						Aucun utilisateur
					</td>
				</tr>
			{/if}
		</tbody>
	</table>
</div>

{#if form?.toggleError}
	<div class="mt-4 rounded-xl border border-red-200 bg-red-50/80 px-4 py-3 text-sm text-red-700">
		{form.toggleError}
	</div>
{/if}
{#if form?.permSuccess}
	<div class="mt-4 rounded-xl border border-green-200 bg-green-50/80 px-4 py-3 text-sm text-green-700">
		Permissions mises à jour pour {form.permEmail}
	</div>
{/if}
