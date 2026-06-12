<script lang="ts">
	import Icon from 'svelte-icons-pack/Icon.svelte';
	import BsChevronDown from 'svelte-icons-pack/bs/BsChevronDown';
	import type { NavigationLinkSubmenu } from '../../helpers/NavigationLinkList';
	import { t, type TranslationKey } from '../../i18n';


	interface Props {
		subMenu: NavigationLinkSubmenu[];
		menuName: TranslationKey;
		link: string;
		active?: boolean;
		isOpen?: boolean;
		activeClass?: string;
		inactiveClass?: string;
		ontoggle?: () => void;
		onclose?: () => void;
	}

	let {
		subMenu,
		menuName,
		link,
		active = false,
		isOpen = false,
		activeClass = 'text-stone-600',
		inactiveClass = 'text-stone-400',
		ontoggle,
		onclose
	}: Props = $props();

	let menuEl: HTMLDivElement | undefined = $state();

	function handleToggle() {
		ontoggle?.();
	}

	function handleClose() {
		onclose?.();
	}
</script>

<div class="flex flex-col text-[13px] relative" bind:this={menuEl}>
	{#if subMenu && subMenu.length > 0}
		<button
			type="button"
			class="flex items-center gap-1 px-3 py-2 whitespace-nowrap text-stone-600 hover:text-missionnaire transition-colors duration-200"
			onclick={(e) => {
				e.stopPropagation();
				handleToggle();
			}}
			aria-label={isOpen
				? $t('nav.submenuClose', { name: $t(menuName) })
				: $t('nav.submenuOpen', { name: $t(menuName) })}
		>
			{$t(menuName)}
			<Icon
				className="w-3 h-3 transition duration-300 ease-out {isOpen ? 'transform rotate-180' : ''}"
				src={BsChevronDown}
			/>
		</button>
	{:else}
		<a href={link} class="flex items-center px-3 py-2 whitespace-nowrap text-stone-600 hover:text-missionnaire transition-colors duration-200">
			{$t(menuName)}
		</a>
	{/if}
	{#if isOpen && subMenu && subMenu.length > 0}
		<div
			class="submenu-dropdown absolute z-50 self-center w-[400px] mt-10 bg-cream/95 backdrop-blur-sm border border-stone-200 flex flex-col shadow-lg shadow-stone-900/[0.06]"
		>
			<div class="flex items-center gap-3 px-5 pt-4 pb-3">
				<span class="font-body text-[10px] font-medium uppercase tracking-[0.2em] text-stone-400">
					{$t(menuName)}
				</span>
				<span class="h-px flex-1 bg-stone-200"></span>
				<span class="w-1 h-1 bg-missionnaire"></span>
			</div>
			<div class="flex flex-col pb-2">
				{#each subMenu as { subName, link: subLink, subText, image, icon } (subName)}
					<a
						href={subLink}
						class="group relative w-full flex items-center gap-4 px-5 py-3 transition-colors duration-200 hover:bg-orange-50/40"
						onclick={() => {
							onclose?.();
						}}
					>
						<span
							class="absolute left-0 top-1/2 -translate-y-1/2 h-0 w-[2px] bg-missionnaire transition-all duration-200 ease-out group-hover:h-7"
							aria-hidden="true"
						></span>
						{#if image}
							<img
								src={image}
								class="flex-shrink-0 w-8 h-8 object-cover border border-stone-200 grayscale opacity-80 transition-all duration-200 group-hover:grayscale-0 group-hover:opacity-100"
								alt={$t(subName)}
							/>
						{:else if icon}
							<span class="flex-shrink-0 text-stone-400 transition-colors duration-200 group-hover:text-missionnaire">
								<Icon src={icon} size="16" />
							</span>
						{/if}
						<span class="flex flex-col min-w-0">
							<span class="font-body text-sm font-semibold text-stone-900 leading-tight transition-colors duration-200 group-hover:text-missionnaire">
								{$t(subName)}
							</span>
							{#if subText}
								<span class="font-body text-xs text-stone-500 mt-0.5 line-clamp-2 leading-relaxed">
									{$t(subText)}
								</span>
							{/if}
						</span>
					</a>
				{/each}
			</div>
		</div>
	{/if}
</div>

<style>
	.submenu-dropdown {
		animation: dropdown-in 0.16s cubic-bezier(0.16, 1, 0.3, 1);
	}

	@keyframes dropdown-in {
		from {
			opacity: 0;
			transform: translateY(4px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.submenu-dropdown {
			animation: none;
		}
	}
</style>
