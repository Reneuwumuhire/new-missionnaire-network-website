<script lang="ts">
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let closeBlocked = $state(false);

	function closeWindow() {
		window.close();
		window.setTimeout(() => (closeBlocked = true), 250);
	}
</script>

<svelte:head>
	<title>{form?.approved ? 'Studio connected' : 'Connect Missionnaire Studio'}</title>
	<meta
		name="description"
		content="Securely connect Missionnaire Studio to your Missionnaire administration account."
	/>
</svelte:head>

<div class="fixed inset-0 z-[80] overflow-y-auto bg-cream text-stone-800">
	<div
		class="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_top,rgba(255,136,12,0.12),transparent_68%)]"
	></div>

	<main class="relative flex min-h-full items-center justify-center px-5 py-10 sm:py-16">
		<section class="w-full max-w-lg" aria-labelledby="studio-connection-title">
			<div class="mb-8 text-center sm:mb-10">
				<img
					src="/icons/logo.webp"
					alt="Missionnaire Network"
					class="mx-auto h-16 w-auto object-contain sm:h-[72px]"
				/>
				<p class="mt-4 text-[11px] font-semibold tracking-[0.24em] text-earth/70 uppercase">
					Missionnaire Studio
				</p>
			</div>

			<div class="border border-stone-200/80 bg-white/90 p-6 shadow-4xl backdrop-blur-sm sm:p-9">
				{#if form?.approved}
					<div aria-live="polite">
						<div
							class="flex items-start gap-4 border border-emerald-200 bg-emerald-50/80 p-4 sm:p-5"
							role="status"
						>
							<span
								class="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white shadow-sm"
							>
								<svg
									class="h-5 w-5"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2.5"
									aria-hidden="true"
								>
									<path stroke-linecap="round" stroke-linejoin="round" d="m5 12 4 4L19 6" />
								</svg>
							</span>
							<div>
								<h1
									id="studio-connection-title"
									class="font-display text-2xl font-semibold text-stone-900"
								>
									Connection approved
								</h1>
								<p class="mt-1 text-sm leading-6 text-stone-600">
									Missionnaire Studio is ready to use with this administration account.
								</p>
							</div>
						</div>

						<div class="mt-6 border-y border-stone-200/70 py-5">
							<div class="flex items-center justify-between gap-4 text-sm">
								<span class="text-stone-500">Connected as</span>
								<strong class="text-right font-semibold text-stone-800">{data.name}</strong>
							</div>
							<div class="mt-3 flex items-center justify-between gap-4 text-sm">
								<span class="text-stone-500">Authorization</span>
								<span class="font-medium text-stone-700">30 days</span>
							</div>
						</div>

						<div class="mt-6 flex gap-3">
							<svg
								class="mt-0.5 h-5 w-5 shrink-0 text-primary"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								aria-hidden="true"
							>
								<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v4m0 4h.01" />
								<circle cx="12" cy="12" r="9" />
							</svg>
							<p class="text-sm leading-6 text-stone-600">
								Return to Missionnaire Studio. The desktop app will finish setup automatically.
							</p>
						</div>

						<button
							type="button"
							class="admin-btn-primary mt-7 w-full justify-center"
							onclick={closeWindow}
						>
							Close this window
						</button>

						{#if closeBlocked}
							<p class="mt-3 text-center text-xs leading-5 text-stone-500" role="status">
								Your browser did not close this tab automatically. You can close it safely and
								return to Studio.
							</p>
						{/if}
					</div>
				{:else}
					<div class="text-center">
						<span
							class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-missionnaire-50 text-primary"
						>
							<svg
								class="h-6 w-6"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								aria-hidden="true"
							>
								<rect x="4" y="5" width="16" height="14" rx="2" />
								<path stroke-linecap="round" d="M8 9h8M8 13h5" />
							</svg>
						</span>
						<h1
							id="studio-connection-title"
							class="mt-5 font-display text-3xl font-semibold text-stone-900"
						>
							Connect Missionnaire Studio
						</h1>
						<p class="mx-auto mt-3 max-w-sm text-sm leading-6 text-stone-600">
							Allow this Studio computer to manage live sessions and cloud recordings for the next
							30 days.
						</p>
					</div>

					<div class="mt-7 border border-stone-200/70 bg-cream/60 px-4 py-3.5">
						<p class="text-[11px] font-semibold tracking-[0.15em] text-stone-400 uppercase">
							Signed in as
						</p>
						<p class="mt-1 text-sm font-semibold text-stone-800">{data.name}</p>
					</div>

					<form method="POST" class="mt-6">
						<input type="hidden" name="code" value={data.code} />
						<button class="admin-btn-primary w-full justify-center">Approve connection</button>
					</form>

					<p class="mt-5 text-center text-xs leading-5 text-stone-400">
						Only administrators with recording permission can approve this connection.
					</p>
				{/if}
			</div>

			<p class="mt-6 text-center text-xs text-stone-400">
				Missionnaire Network &copy; {new Date().getFullYear()}
			</p>
		</section>
	</main>
</div>
