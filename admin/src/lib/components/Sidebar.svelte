<script lang="ts">
	import { page } from '$app/stores';

	interface NavItem {
		href: string;
		label: string;
		icon: string;
	}

	let {
		user,
		broadcastIsLive = false
	}: {
		user: {
			name: string;
			email: string;
			role?: string;
			canViewDashboard?: boolean;
			canManageAudio?: boolean;
			canManageRecordings?: boolean;
			canReviewLyrics?: boolean;
			canViewQuestions?: boolean;
		};
		broadcastIsLive?: boolean;
	} = $props();

	const navItems: NavItem[] = $derived([
		...(user.canViewDashboard ? [{ href: '/', label: 'Tableau de bord', icon: 'home' }] : []),
		...(user.canViewQuestions ? [{ href: '/questions', label: 'Questions', icon: 'questions' }] : []),
		...(user.canManageRecordings ? [{ href: '/recordings', label: 'Enregistrements', icon: 'recordings' }] : []),
		...(user.canManageAudio ? [{ href: '/audio', label: 'Bibliothèque audio', icon: 'music' }] : []),
		...(user.canReviewLyrics ? [{ href: '/lyrics-review', label: 'Révision paroles', icon: 'lyrics' }] : []),
		...(user.role === 'superadmin' ? [{ href: '/users', label: 'Utilisateurs', icon: 'users' }] : []),
		{ href: '/settings', label: 'Paramètres', icon: 'settings' }
	]);
	let mobileOpen = $state(false);

	function isActive(href: string, pathname: string): boolean {
		if (href === '/') return pathname === '/';
		return pathname.startsWith(href);
	}
</script>

<!-- Mobile overlay -->
{#if mobileOpen}
	<button
		class="fixed inset-0 z-30 bg-stone-900/40 backdrop-blur-[2px] lg:hidden"
		onclick={() => (mobileOpen = false)}
		aria-label="Fermer le menu"
	></button>
{/if}

<!-- Mobile hamburger (only visible when sidebar is closed) -->
{#if !mobileOpen}
	<button
		class="fixed left-4 top-4 z-40 flex h-10 w-10 items-center justify-center bg-white shadow-md lg:hidden"
		onclick={() => (mobileOpen = true)}
		aria-label="Menu"
	>
		<svg
			class="h-[18px] w-[18px] text-stone-700"
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
			stroke-width="2.5"
		>
			<path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h10M4 18h16" />
		</svg>
	</button>
{/if}

<!-- Sidebar -->
<aside
	class="fixed inset-y-0 left-0 z-30 flex w-[272px] flex-col bg-white shadow-xl shadow-stone-200/40 transition-transform duration-300 ease-out lg:w-64 lg:border-r lg:border-stone-200/60 lg:shadow-none lg:translate-x-0
	{mobileOpen ? 'translate-x-0' : '-translate-x-full'}"
>
	<!-- Brand + close -->
	<div class="flex items-center justify-between px-6 py-6">
		<a href="/" class="flex items-center gap-3" onclick={() => (mobileOpen = false)}>
			<img src="/icons/logo.webp" alt="Missionnaire" class="h-10 w-10 object-contain" />
			<div>
				<h2 class="font-display text-[17px] font-semibold leading-tight text-stone-800">
					Missionnaire
				</h2>
				<span class="text-[10px] font-semibold tracking-[0.2em] text-earth/60 uppercase">
					Administration
				</span>
			</div>
		</a>
		<button
			class="flex h-8 w-8 items-center justify-center rounded-full text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600 lg:hidden"
			onclick={() => (mobileOpen = false)}
			aria-label="Fermer le menu"
		>
			<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
				<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
			</svg>
		</button>
	</div>

	<div class="mx-5 h-px bg-gradient-to-r from-transparent via-stone-200 to-transparent"></div>

	<!-- Navigation -->
	<nav class="flex-1 px-4 py-5">
		<div class="space-y-0.5">
			{#each navItems as item}
				{@const active = isActive(item.href, $page.url.pathname)}
				<a
					href={item.href}
					onclick={() => (mobileOpen = false)}
					class="group flex items-center gap-3 px-3.5 py-2.5 text-[13px] font-medium transition-all
					{active ? 'bg-primary/10 text-primary' : 'text-stone-500 hover:bg-stone-50 hover:text-stone-700'}"
				>
					<span
						class="flex h-8 w-8 items-center justify-center transition-colors
						{active
							? 'bg-primary text-white shadow-sm shadow-primary/25'
							: 'bg-stone-100/80 text-stone-400 group-hover:bg-stone-200/60 group-hover:text-stone-500'}"
					>
						{#if item.icon === 'home'}
							<svg
								class="h-[15px] w-[15px]"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								stroke-width="2"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
								/>
							</svg>
						{:else if item.icon === 'music'}
							<svg
								class="h-[15px] w-[15px]"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								stroke-width="2"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
								/>
							</svg>
						{:else if item.icon === 'users'}
							<svg
								class="h-[15px] w-[15px]"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								stroke-width="2"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
								/>
							</svg>
						{:else if item.icon === 'questions'}
							<svg class="h-[15px] w-[15px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
								<path stroke-linecap="round" stroke-linejoin="round" d="M8 10h8M8 14h5m8-2a9 9 0 11-4.219-7.62L21 3v5h-5" />
							</svg>
						{:else if item.icon === 'recordings'}
							<svg
								class="h-[15px] w-[15px]"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								stroke-width="2"
							>
								<circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M12 3a9 9 0 109 9M12 3v4m0 0a5 5 0 015 5"
								/>
							</svg>
						{:else if item.icon === 'lyrics'}
							<svg
								class="h-[15px] w-[15px]"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								stroke-width="2"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M8 6h10M8 10h10M8 14h6M5 6h.01M5 10h.01M5 14h.01M4 20h16"
								/>
							</svg>
						{:else if item.icon === 'settings'}
							<svg
								class="h-[15px] w-[15px]"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								stroke-width="2"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
								/>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
								/>
							</svg>
						{/if}
					</span>
					<span class="flex-1">{item.label}</span>
					{#if item.icon === 'recordings' && broadcastIsLive}
						<span
							class="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-red-600"
							title="Audience en direct"
						>
							<span class="relative inline-flex h-1.5 w-1.5">
								<span
									class="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75"
								></span>
								<span class="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-500"></span>
							</span>
							Live
						</span>
					{/if}
				</a>
			{/each}
		</div>
	</nav>

	<!-- User info -->
	<div class="mx-5 h-px bg-gradient-to-r from-transparent via-stone-200 to-transparent"></div>
	<div class="px-4 py-4">
		<a
			href="/settings"
			onclick={() => (mobileOpen = false)}
			class="flex items-center gap-3 px-2 py-2 transition-colors hover:bg-stone-50"
		>
			<div
				class="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-missionnaire-100 font-display text-sm font-semibold text-primary"
			>
				{user.name.charAt(0).toUpperCase()}
			</div>
			<div class="min-w-0 flex-1">
				<p class="truncate text-sm font-medium text-stone-700">{user.name}</p>
				<p class="truncate text-[11px] text-stone-400">{user.email}</p>
			</div>
		</a>
		<form action="/logout" method="POST" class="mt-2">
			<button
				type="submit"
				class="flex w-full items-center gap-2.5 px-3.5 py-2 text-[13px] font-medium text-stone-400 transition-colors hover:bg-red-50 hover:text-red-500"
			>
				<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
					/>
				</svg>
				Déconnexion
			</button>
		</form>
	</div>
</aside>
