<script lang="ts">
	import { enhance } from '$app/forms';
	import { locale, t, type TranslationKey } from '$lib/i18n';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let profileLoading = $state(false);
	let passwordLoading = $state(false);
	let studioWorking = $state<string | null>(null);
	let securityWorking = $state<string | null>(null);
	let showCurrentPassword = $state(false);
	let showNewPassword = $state(false);

	// Field-level action errors → translated inline messages (aria-invalid).
	const profileFieldError = $derived(form?.profileFieldError ?? null);
	const passwordFieldError = $derived(form?.passwordFieldError ?? null);
	const fieldErrorKeys: Record<string, TranslationKey> = {
		nameTooShort: 'settings.error.nameTooShort',
		passwordTooShort: 'settings.error.passwordTooShort',
		passwordMismatch: 'settings.error.passwordMismatch',
		currentPasswordWrong: 'settings.error.currentPasswordWrong'
	};
	function fieldErrorMessage(code: string): string {
		const key = fieldErrorKeys[code];
		return key ? $t(key) : code;
	}

	function formatDate(date: string | Date | null): string {
		if (!date) return $t('settings.never');
		return new Date(date).toLocaleDateString($locale === 'en' ? 'en-US' : 'fr-FR', {
			day: 'numeric',
			month: 'long',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	const roleLabel: Record<string, TranslationKey> = {
		superadmin: 'settings.roleSuperadmin',
		editor: 'settings.roleEditor'
	};
</script>

<svelte:head>
	<title>{$t('settings.headTitle')}</title>
</svelte:head>

<div class="mb-8">
	<h1 class="font-display text-3xl font-semibold text-stone-800">{$t('settings.title')}</h1>
	<p class="mt-1 text-sm text-stone-500">{$t('settings.subtitle')}</p>
</div>

<div class="mx-auto max-w-2xl space-y-6">
	{#if data.passwordRequired && !form?.passwordSuccess}
		<div class="border border-amber-300 bg-amber-50 px-5 py-4 text-sm text-amber-900" role="alert">
			<p class="font-semibold">{$t('settings.passwordRequiredTitle')}</p>
			<p class="mt-1">{$t('settings.passwordRequiredBody')}</p>
			<a href="#change-password" class="mt-2 inline-block font-medium underline"
				>{$t('settings.changePasswordNow')}</a
			>
		</div>
	{/if}

	{#if data.failedLoginAttempts >= 3}
		<div class="border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800" role="alert">
			<p class="font-semibold">{$t('settings.failedAttemptsTitle')}</p>
			<p class="mt-1">{$t('settings.failedAttemptsBody', { count: data.failedLoginAttempts })}</p>
		</div>
	{/if}

	<!-- Profile card -->
	<div class="overflow-hidden border border-stone-200/60 bg-white/40">
		<!-- Header with avatar -->
		<div
			class="relative border-b border-stone-100 bg-gradient-to-br from-missionnaire-50 via-cream to-cream-dark px-6 pb-6 pt-8"
		>
			<div class="flex items-center gap-5">
				<div
					class="flex h-16 w-16 items-center justify-center rounded-full bg-white text-2xl font-semibold text-primary shadow-sm ring-4 ring-white font-display"
				>
					{data.user.name.charAt(0).toUpperCase()}
				</div>
				<div>
					<h2 class="font-display text-xl font-semibold text-stone-800">{data.user.name}</h2>
					<p class="text-sm text-stone-500">{data.user.email}</p>
					<span
						class="mt-1.5 inline-flex items-center rounded-full bg-white/80 px-2.5 py-0.5 text-xs font-medium text-earth shadow-sm"
					>
						{roleLabel[data.user.role] ? $t(roleLabel[data.user.role]) : data.user.role}
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
			<h3
				class="mb-4 flex items-center gap-2 text-sm font-semibold tracking-wide text-stone-500 uppercase"
			>
				<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
					/>
				</svg>
				{$t('settings.profile')}
			</h3>

			{#if form?.profileSuccess}
				<div class="mb-5 border border-green-200 bg-green-50/80 px-4 py-3 text-sm text-green-700">
					{$t('settings.profileUpdated')}
				</div>
			{/if}
			{#if form?.profileError}
				<div class="mb-5 border border-red-200 bg-red-50/80 px-4 py-3 text-sm text-red-700">
					{form.profileError}
				</div>
			{/if}

			<div class="space-y-4">
				<div>
					<label for="name" class="admin-label">{$t('settings.name')}</label>
					<input
						id="name"
						name="name"
						type="text"
						required
						value={data.user.name}
						class="admin-input {profileFieldError?.field === 'name'
							? 'border-red-400 focus:border-red-500 focus:ring-red-200'
							: ''}"
						aria-invalid={profileFieldError?.field === 'name' ? 'true' : undefined}
						aria-describedby={profileFieldError?.field === 'name' ? 'name-error' : undefined}
					/>
					{#if profileFieldError?.field === 'name'}
						<p id="name-error" class="mt-1.5 text-xs text-red-600">
							{fieldErrorMessage(profileFieldError.code)}
						</p>
					{/if}
				</div>

				<div>
					<label for="email-display" class="admin-label">{$t('settings.email')}</label>
					<input
						id="email-display"
						type="email"
						disabled
						value={data.user.email}
						class="admin-input cursor-not-allowed bg-cream/60 text-stone-400"
					/>
					<p class="mt-1 text-xs text-stone-400">{$t('settings.emailNotEditable')}</p>
				</div>
			</div>

			<!-- Account info -->
			<div class="mt-5 bg-cream/50 p-4">
				<div class="grid grid-cols-2 gap-3 text-xs">
					<div>
						<span class="text-stone-400">{$t('settings.memberSince')}</span>
						<p class="mt-0.5 font-medium text-stone-600">{formatDate(data.user.created_at)}</p>
					</div>
					<div>
						<span class="text-stone-400">{$t('settings.lastLogin')}</span>
						<p class="mt-0.5 font-medium text-stone-600">{formatDate(data.user.last_login)}</p>
					</div>
				</div>
			</div>

			<div class="mt-5 flex justify-end">
				<button
					type="submit"
					disabled={profileLoading}
					class="admin-btn-primary disabled:opacity-50"
				>
					{#if profileLoading}
						<svg class="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
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
					{/if}
					{$t('settings.saveProfile')}
				</button>
			</div>
		</form>
	</div>

	<!-- Security center -->
	<div class="border border-stone-200/60 bg-white/40 p-6">
		<div class="flex flex-wrap items-start justify-between gap-3">
			<div>
				<h3
					class="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-stone-500"
				>
					<svg
						class="h-4 w-4"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2"
						><path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
						/></svg
					>
					{$t('settings.securityCenter')}
				</h3>
				<p class="mt-2 text-sm text-stone-500">{$t('settings.securityCenterHint')}</p>
			</div>
		</div>

		{#if form?.sessionRevoked || form?.otherSessionsRevoked !== undefined}
			<div class="mt-4 border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
				{$t('settings.sessionsRevoked')}
			</div>
		{/if}
		{#if form?.sessionError}
			<div class="mt-4 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
				{form.sessionError}
			</div>
		{/if}

		<div class="mt-6">
			<div class="flex items-center justify-between gap-3">
				<div>
					<h4 class="font-medium text-stone-700">{$t('settings.activeSessions')}</h4>
					<p class="mt-1 text-xs text-stone-400">{$t('settings.activeSessionsHint')}</p>
				</div>
				{#if data.sessions.length > 1}
					<form
						method="POST"
						action="?/revokeOtherSessions"
						use:enhance={() => {
							securityWorking = 'all';
							return async ({ update }) => {
								securityWorking = null;
								await update();
							};
						}}
						onsubmit={(event) => {
							if (!confirm($t('settings.revokeOthersConfirm'))) event.preventDefault();
						}}
					>
						<button
							type="submit"
							disabled={securityWorking === 'all'}
							class="admin-btn-secondary text-red-600 disabled:opacity-50"
							>{$t('settings.revokeOthers')}</button
						>
					</form>
				{/if}
			</div>
			<div class="mt-4 divide-y divide-stone-100 border border-stone-200/70">
				{#each data.sessions as session (session.id)}
					<div class="flex items-start justify-between gap-4 p-4">
						<div>
							<div class="flex flex-wrap items-center gap-2">
								<p class="text-sm font-medium text-stone-700">{session.device}</p>
								{#if session.is_current}<span
										class="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-green-700"
										>{$t('settings.currentSession')}</span
									>{/if}
								{#if session.is_new_device}<span
										class="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-700"
										>{$t('settings.newDevice')}</span
									>{/if}
							</div>
							<p class="mt-1 text-xs text-stone-400">
								{session.ip_address ?? $t('settings.unknownIp')} · {$t('settings.signedInAt')}
								{formatDate(session.created_at)} · {$t('settings.expiresAt')}
								{formatDate(session.expires_at)}
							</p>
						</div>
						{#if !session.is_current && session.id}
							<form
								method="POST"
								action="?/revokeSession"
								use:enhance={() => {
									securityWorking = session.id ?? null;
									return async ({ update }) => {
										securityWorking = null;
										await update();
									};
								}}
							>
								<input type="hidden" name="id" value={session.id} />
								<button
									type="submit"
									disabled={securityWorking === session.id}
									class="admin-btn-secondary text-red-600 disabled:opacity-50"
									>{$t('settings.revokeSession')}</button
								>
							</form>
						{/if}
					</div>
				{/each}
			</div>
		</div>

		{#if data.user.role === 'superadmin'}
			<div class="mt-7 border-t border-stone-100 pt-6">
				<div class="flex items-center justify-between gap-3">
					<div>
						<h4 class="font-medium text-stone-700">{$t('settings.twoFactor')}</h4>
						<p class="mt-1 text-xs text-stone-400">{$t('settings.twoFactorHint')}</p>
					</div>
					<span
						class="rounded-full px-2.5 py-1 text-xs font-medium {data.user.two_factor_enabled
							? 'bg-green-100 text-green-700'
							: 'bg-amber-100 text-amber-700'}"
						>{$t(data.user.two_factor_enabled ? 'settings.enabled' : 'settings.disabled')}</span
					>
				</div>

				{#if form?.twoFactorError}<div
						class="mt-4 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
					>
						{form.twoFactorError}
					</div>{/if}
				{#if data.twoFactorStatus === 'enabled'}<div
						class="mt-4 border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700"
					>
						{$t('settings.twoFactorEnabled')}
					</div>{/if}
				{#if data.twoFactorStatus === 'disabled'}<div
						class="mt-4 border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700"
					>
						{$t('settings.twoFactorDisabled')}
					</div>{/if}

				{#if data.user.two_factor_enabled}
					<p class="mt-4 text-sm text-stone-500">
						{$t('settings.recoveryRemaining', { count: data.user.recovery_codes_remaining })}
					</p>
					<form method="POST" action="?/disableTwoFactor" class="mt-4 grid gap-3 sm:grid-cols-2">
						<input
							name="currentPassword"
							type="password"
							required
							autocomplete="current-password"
							class="admin-input"
							placeholder={$t('settings.currentPassword')}
						/>
						<input
							name="code"
							required
							autocomplete="one-time-code"
							class="admin-input"
							placeholder={$t('settings.authenticationCode')}
						/>
						<button type="submit" class="admin-btn-secondary text-red-600 sm:col-span-2"
							>{$t('settings.disableTwoFactor')}</button
						>
					</form>
				{:else if form?.twoFactorSetup}
					<div class="mt-4 space-y-4 bg-cream/60 p-4">
						<p class="text-sm font-medium text-stone-700">{$t('settings.scanOrEnter')}</p>
						<a
							href={form.twoFactorSetup.otpAuthUri}
							class="break-all text-xs text-primary underline">{$t('settings.openAuthenticator')}</a
						>
						<div>
							<p class="text-xs text-stone-400">{$t('settings.manualSecret')}</p>
							<code class="mt-1 block break-all bg-white px-3 py-2 text-sm"
								>{form.twoFactorSetup.secret}</code
							>
						</div>
						<div>
							<p class="text-xs font-medium text-red-700">{$t('settings.saveRecoveryCodes')}</p>
							<div class="mt-2 grid grid-cols-2 gap-2">
								{#each form.twoFactorSetup.recoveryCodes as code}<code
										class="bg-white px-2 py-1 text-center text-xs">{code}</code
									>{/each}
							</div>
						</div>
						<form method="POST" action="?/enableTwoFactor" class="flex gap-2">
							<input
								name="code"
								required
								autocomplete="one-time-code"
								class="admin-input"
								placeholder={$t('settings.authenticationCode')}
							/>
							<button type="submit" class="admin-btn-primary shrink-0"
								>{$t('settings.enableTwoFactor')}</button
							>
						</form>
					</div>
				{:else if data.twoFactorConfigured}
					<form method="POST" action="?/beginTwoFactor" class="mt-4 flex gap-2">
						<input
							name="currentPassword"
							type="password"
							required
							autocomplete="current-password"
							class="admin-input"
							placeholder={$t('settings.currentPassword')}
						/>
						<button type="submit" class="admin-btn-primary shrink-0"
							>{$t('settings.startSetup')}</button
						>
					</form>
				{:else}
					<p class="mt-4 border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
						{$t('settings.twoFactorNotConfigured')}
					</p>
				{/if}
			</div>
		{/if}
	</div>

	<!-- Connected Studio sessions -->
	<div class="border border-stone-200/60 bg-white/40 p-6">
		<h3
			class="flex items-center gap-2 text-sm font-semibold tracking-wide text-stone-500 uppercase"
		>
			<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
				/>
			</svg>
			{$t('settings.connectedStudios')}
		</h3>
		<p class="mt-2 text-sm text-stone-500">{$t('settings.connectedStudiosHint')}</p>

		{#if form?.studioRevoked}
			<div class="mt-4 border border-green-200 bg-green-50/80 px-4 py-3 text-sm text-green-700">
				{$t('settings.studioRevoked')}
			</div>
		{/if}
		{#if form?.studioDeleted}
			<div class="mt-4 border border-green-200 bg-green-50/80 px-4 py-3 text-sm text-green-700">
				{$t('settings.studioDeleted')}
			</div>
		{/if}
		{#if form?.studioError}
			<div class="mt-4 border border-red-200 bg-red-50/80 px-4 py-3 text-sm text-red-700">
				{$t('settings.studioRevokeError')}
			</div>
		{/if}
		{#if form?.studioDeleteError}
			<div class="mt-4 border border-red-200 bg-red-50/80 px-4 py-3 text-sm text-red-700">
				{$t('settings.studioDeleteError')}
			</div>
		{/if}

		{#if data.studioAuthorizations.length === 0}
			<p class="mt-5 bg-cream/50 px-4 py-3 text-sm text-stone-500">{$t('settings.studioNone')}</p>
		{:else}
			<div class="mt-5 divide-y divide-stone-100 border border-stone-200/70">
				{#each data.studioAuthorizations as authorization (authorization.id)}
					<div class="flex items-start justify-between gap-4 p-4">
						<div class="min-w-0">
							<div class="flex flex-wrap items-center gap-2">
								<p class="font-medium text-stone-700">
									{authorization.device?.deviceName ?? 'Missionnaire Studio'}
								</p>
								<span
									class="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide {authorization.online
										? 'bg-green-100 text-green-700'
										: authorization.connected
											? 'bg-amber-100 text-amber-700'
											: 'bg-stone-100 text-stone-500'}"
								>
									{$t(
										authorization.online
											? 'settings.studioOnline'
											: authorization.connected
												? 'settings.studioOffline'
												: 'settings.studioDisconnected'
									)}
								</span>
							</div>
							{#if authorization.device}
								<p class="mt-1 text-xs text-stone-500">
									{authorization.device.os ?? $t('settings.studioUnknown')}
									{#if authorization.device.architecture}
										· {authorization.device.architecture}{/if}
									{#if authorization.device.username}
										· {$t('settings.studioUser')}: {authorization.device.username}{/if}
									{#if authorization.device.appVersion}
										· {$t('settings.studioApp')}: {authorization.device.appVersion}{/if}
								</p>
							{:else}
								<p class="mt-1 text-xs text-stone-400">{$t('settings.studioLegacyDevice')}</p>
							{/if}
							<p class="mt-1 text-xs text-stone-400">
								{$t('settings.studioAuthorized')}: {formatDate(authorization.approvedAt)}
								<span class="mx-1">·</span>
								{$t('settings.studioLastSeen')}: {formatDate(authorization.lastSeenAt)}
								<span class="mx-1">·</span>
								{$t('settings.studioExpires')}: {formatDate(authorization.expiresAt)}
							</p>
						</div>
						<form
							method="POST"
							action={authorization.connected ? '?/revokeStudio' : '?/deleteStudio'}
							onsubmit={(event) => {
								const key = authorization.connected
									? 'settings.studioRevokeConfirm'
									: 'settings.studioDeleteConfirm';
								if (!confirm($t(key))) event.preventDefault();
							}}
							use:enhance={() => {
								studioWorking = authorization.id;
								return async ({ update }) => {
									studioWorking = null;
									await update();
								};
							}}
						>
							<input type="hidden" name="id" value={authorization.id} />
							<button
								type="submit"
								disabled={studioWorking === authorization.id}
								class="admin-btn-secondary text-red-600 disabled:opacity-50"
							>
								{$t(authorization.connected ? 'settings.studioRevoke' : 'settings.studioDelete')}
							</button>
						</form>
					</div>
				{/each}
			</div>
		{/if}
	</div>

	<!-- Password card -->
	<div id="change-password" class="scroll-mt-6 border border-stone-200/60 bg-white/40 p-6">
		<h3
			class="mb-5 flex items-center gap-2 text-sm font-semibold tracking-wide text-stone-500 uppercase"
		>
			<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
				/>
			</svg>
			{$t('settings.changePassword')}
		</h3>

		{#if form?.passwordSuccess}
			<div class="mb-5 border border-green-200 bg-green-50/80 px-4 py-3 text-sm text-green-700">
				{$t('settings.passwordUpdated')}
			</div>
		{/if}
		{#if form?.passwordError}
			<div class="mb-5 border border-red-200 bg-red-50/80 px-4 py-3 text-sm text-red-700">
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
					<label for="currentPassword" class="admin-label">{$t('settings.currentPassword')}</label>
					<div class="relative">
						<input
							id="currentPassword"
							name="currentPassword"
							type={showCurrentPassword ? 'text' : 'password'}
							required
							autocomplete="current-password"
							class="admin-input pr-10 {passwordFieldError?.field === 'currentPassword'
								? 'border-red-400 focus:border-red-500 focus:ring-red-200'
								: ''}"
							aria-invalid={passwordFieldError?.field === 'currentPassword' ? 'true' : undefined}
							aria-describedby={passwordFieldError?.field === 'currentPassword'
								? 'currentPassword-error'
								: undefined}
						/>
						<button
							type="button"
							onclick={() => (showCurrentPassword = !showCurrentPassword)}
							class="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 transition-colors hover:text-stone-600"
							aria-label={showCurrentPassword ? $t('settings.hide') : $t('settings.show')}
						>
							{#if showCurrentPassword}
								<svg
									class="h-4 w-4"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
									stroke-width="2"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
									/>
								</svg>
							{:else}
								<svg
									class="h-4 w-4"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
									stroke-width="2"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
									/>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
									/>
								</svg>
							{/if}
						</button>
					</div>
					{#if passwordFieldError?.field === 'currentPassword'}
						<p id="currentPassword-error" class="mt-1.5 text-xs text-red-600">
							{fieldErrorMessage(passwordFieldError.code)}
						</p>
					{/if}
				</div>

				<div class="ornament-line my-2">
					<span class="text-xs text-earth/30">&#8226;</span>
				</div>

				<div>
					<label for="newPassword" class="admin-label">{$t('settings.newPassword')}</label>
					<div class="relative">
						<input
							id="newPassword"
							name="newPassword"
							type={showNewPassword ? 'text' : 'password'}
							required
							minlength={8}
							autocomplete="new-password"
							class="admin-input pr-10 {passwordFieldError?.field === 'newPassword'
								? 'border-red-400 focus:border-red-500 focus:ring-red-200'
								: ''}"
							placeholder={$t('settings.minChars')}
							aria-invalid={passwordFieldError?.field === 'newPassword' ? 'true' : undefined}
							aria-describedby={passwordFieldError?.field === 'newPassword'
								? 'newPassword-error'
								: undefined}
						/>
						<button
							type="button"
							onclick={() => (showNewPassword = !showNewPassword)}
							class="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 transition-colors hover:text-stone-600"
							aria-label={showNewPassword ? $t('settings.hide') : $t('settings.show')}
						>
							{#if showNewPassword}
								<svg
									class="h-4 w-4"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
									stroke-width="2"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
									/>
								</svg>
							{:else}
								<svg
									class="h-4 w-4"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
									stroke-width="2"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
									/>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
									/>
								</svg>
							{/if}
						</button>
					</div>
					{#if passwordFieldError?.field === 'newPassword'}
						<p id="newPassword-error" class="mt-1.5 text-xs text-red-600">
							{fieldErrorMessage(passwordFieldError.code)}
						</p>
					{/if}
				</div>

				<div>
					<label for="confirmPassword" class="admin-label"
						>{$t('settings.confirmNewPassword')}</label
					>
					<input
						id="confirmPassword"
						name="confirmPassword"
						type="password"
						required
						minlength={8}
						autocomplete="new-password"
						class="admin-input {passwordFieldError?.field === 'confirmPassword'
							? 'border-red-400 focus:border-red-500 focus:ring-red-200'
							: ''}"
						placeholder={$t('settings.retypePassword')}
						aria-invalid={passwordFieldError?.field === 'confirmPassword' ? 'true' : undefined}
						aria-describedby={passwordFieldError?.field === 'confirmPassword'
							? 'confirmPassword-error'
							: undefined}
					/>
					{#if passwordFieldError?.field === 'confirmPassword'}
						<p id="confirmPassword-error" class="mt-1.5 text-xs text-red-600">
							{fieldErrorMessage(passwordFieldError.code)}
						</p>
					{/if}
				</div>
			</div>

			<div class="mt-5 flex justify-end">
				<button
					type="submit"
					disabled={passwordLoading}
					class="admin-btn-primary disabled:opacity-50"
				>
					{#if passwordLoading}
						<svg class="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
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
					{/if}
					{$t('settings.updatePassword')}
				</button>
			</div>
		</form>
	</div>
</div>
