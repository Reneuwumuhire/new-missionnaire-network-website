<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';
	import { t } from '$lib/i18n';

	let { form, data }: { form: ActionData; data: PageData } = $props();
	let loading = $state(false);
</script>

<svelte:head><title>{$t('auth.twoFactorTitle')}</title></svelte:head>

<div class="flex min-h-screen items-center justify-center bg-cream px-4">
	<div class="w-full max-w-md">
		<div class="mb-8 text-center">
			<h1 class="font-display text-3xl font-semibold text-stone-800">
				{$t('auth.twoFactorTitle')}
			</h1>
			<p class="mt-2 text-sm text-stone-500">{$t('auth.twoFactorHint', { email: data.email })}</p>
		</div>
		<div class="border border-stone-200/60 bg-white/40 p-8 shadow-4xl">
			{#if form?.error}
				<div class="mb-5 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
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
				<label for="code" class="admin-label">{$t('auth.authenticationCode')}</label>
				<input
					id="code"
					name="code"
					required
					autocomplete="one-time-code"
					class="admin-input text-center font-mono tracking-[0.25em]"
					placeholder="123456"
				/>
				<p class="mt-2 text-xs text-stone-400">{$t('auth.recoveryCodeHint')}</p>
				<button
					type="submit"
					disabled={loading}
					class="admin-btn-primary mt-6 w-full justify-center disabled:opacity-60"
				>
					{loading ? $t('auth.verifying') : $t('auth.verify')}
				</button>
			</form>
		</div>
	</div>
</div>
