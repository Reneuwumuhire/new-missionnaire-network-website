<script lang="ts">
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import { browserSupportsWebAuthn, startAuthentication } from '@simplewebauthn/browser';
	import type { ActionData } from './$types';
	import { t } from '$lib/i18n';

	let { form, data }: { form: ActionData; data: { next: string } } = $props();
	let loading = $state(false);
	let passkeyChecked = $state(false);
	let passkeySupported = $state(false);
	let passkeyLoading = $state(false);
	let passkeyError = $state(false);

	onMount(() => {
		passkeySupported = browserSupportsWebAuthn();
		passkeyChecked = true;
	});

	async function signInWithPasskey(): Promise<void> {
		passkeyLoading = true;
		passkeyError = false;
		try {
			const optionsResponse = await fetch('/login/passkey');
			if (!optionsResponse.ok) throw new Error('Could not start passkey sign-in');
			const response = await startAuthentication({ optionsJSON: await optionsResponse.json() });
			const verificationResponse = await fetch('/login/passkey', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ response, next: data.next })
			});
			const verification = await verificationResponse.json();
			if (!verificationResponse.ok || !verification.verified) throw new Error('Passkey rejected');
			window.location.assign(verification.redirect);
		} catch {
			passkeyError = true;
			passkeyLoading = false;
		}
	}
</script>

<svelte:head>
	<title>{$t('auth.pageTitle')}</title>
</svelte:head>

<div class="flex min-h-screen items-center justify-center bg-cream px-4 py-10">
	<div class="w-full max-w-[440px]">
		<!-- Logo / Brand -->
		<div class="mb-10 text-center">
			<h1 class="font-display text-4xl font-semibold tracking-tight text-stone-800">
				Missionnaire
			</h1>
			<p class="mt-1 font-body text-sm tracking-widest text-earth uppercase">
				{$t('common.administration')}
			</p>
			<div class="ornament-line mt-6">
				<span class="text-xs text-earth/60">&#10047;</span>
			</div>
		</div>

		<!-- Login Card -->
		<div
			class="border border-stone-200/80 bg-white/80 p-8 shadow-[0_24px_70px_rgba(68,56,43,0.09)] backdrop-blur-sm sm:p-10"
		>
			{#if form?.error}
				<div class="mb-6 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
					{'errorIsKey' in form && form.errorIsKey ? $t('auth.tooManyAttempts') : form.error}
				</div>
			{/if}
			{#if passkeyError}
				<div
					class="mb-6 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
					role="alert"
				>
					{$t('auth.passkeyError')}
				</div>
			{/if}

			{#if passkeySupported}
				<div class="flex justify-center">
					<button
						type="button"
						disabled={passkeyLoading}
						onclick={signInWithPasskey}
						aria-label={passkeyLoading ? $t('auth.passkeyWaiting') : $t('auth.passkey')}
						aria-busy={passkeyLoading}
						title={$t('auth.passkey')}
						class="group flex size-20 items-center justify-center rounded-full bg-primary text-white shadow-[0_12px_30px_rgba(255,136,12,0.28)] transition hover:-translate-y-0.5 hover:bg-missionnaire-600 hover:shadow-[0_16px_36px_rgba(255,136,12,0.32)] disabled:cursor-wait disabled:opacity-60 disabled:hover:translate-y-0"
					>
						{#if passkeyLoading}
							<svg class="size-8 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
								<circle
									class="opacity-25"
									cx="12"
									cy="12"
									r="9"
									stroke="currentColor"
									stroke-width="2"
								/>
								<path
									class="opacity-80"
									fill="currentColor"
									d="M12 3a9 9 0 0 0-9 9H1a11 11 0 0 1 11-11z"
								/>
							</svg>
						{:else}
							<svg
								class="size-10 transition-transform group-hover:scale-105"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="1.5"
								stroke-linecap="round"
								aria-hidden="true"
							>
								<path d="M12 11a2 2 0 0 0-2 2c0 2.6-.4 5.2-1.3 7.6" />
								<path d="M14 13c0 3.1-.2 6.1-1.2 8.6" />
								<path d="M17.4 20.2c.4-2.1.6-4.4.6-7.2a6 6 0 0 0-10.8-3.6" />
								<path d="M5.9 12.4c0 3.1-.4 5.3-1.3 7.1" />
								<path d="M4 9.5A9 9 0 0 1 20.7 11" />
								<path d="M8.3 4.8A9 9 0 0 1 18 6.2" />
							</svg>
						{/if}
					</button>
				</div>
				<div class="my-6 flex items-center gap-3 text-xs text-stone-400">
					<span class="h-px flex-1 bg-stone-200"></span>
					{$t('auth.orPassword')}
					<span class="h-px flex-1 bg-stone-200"></span>
				</div>
			{:else if passkeyChecked}
				<p class="mb-6 text-center text-xs text-stone-400">{$t('auth.passkeyUnsupported')}</p>
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
				<input type="hidden" name="next" value={data.next} />
				<div class="mb-5">
					<label for="email" class="admin-label">{$t('auth.email')}</label>
					<input
						id="email"
						name="email"
						type="email"
						autocomplete="username webauthn"
						required
						value={form?.email ?? ''}
						class="admin-input"
						placeholder="admin@missionnaire.net"
					/>
				</div>

				<div class="mb-8">
					<label for="password" class="admin-label">{$t('auth.password')}</label>
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
					class="admin-btn-primary w-full justify-center disabled:opacity-60"
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
						{$t('auth.loggingIn')}
					{:else}
						{$t('auth.login')}
					{/if}
				</button>
			</form>
		</div>

		<p class="mt-8 text-center text-xs text-stone-400">
			Missionnaire Network &copy; {new Date().getFullYear()}
		</p>
	</div>
</div>
