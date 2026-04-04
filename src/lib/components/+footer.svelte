<script lang="ts">
	// @ts-ignore
	import Icon from 'svelte-icons-pack/Icon.svelte';
	import FaBrandsYoutube from 'svelte-icons-pack/fa/FaBrandsYoutube';
	import FaBrandsFacebook from 'svelte-icons-pack/fa/FaBrandsFacebook';
	import RiLogoWhatsappFill from 'svelte-icons-pack/ri/RiLogoWhatsappFill';

	const navColumns = [
		{
			title: 'Ressources',
			links: [
				{ label: 'Prédications', href: '/predications' },
				{ label: 'Musique', href: '/musique' },
				{ label: 'Vidéos', href: '/videos' },
				{ label: 'Transcriptions', href: '/transcriptions' },
				{ label: 'Littérature', href: '/literature' }
			]
		},
		{
			title: 'Découvrir',
			links: [
				{ label: 'William Branham', href: '/william-branham/biographie' },
				{ label: 'Ewald Frank', href: '/ewald-frank' },
				{ label: "L'église", href: '/eglise' },
				{ label: 'Galerie', href: '/galerie' },
				{ label: 'Radio', href: '/live' }
			]
		},
		{
			title: 'Informations',
			links: [
				{ label: 'À propos', href: '/a-propos' },
				{
					label: 'YouTube',
					href: 'https://www.youtube.com/channel/UCS3zqpqnCvT0SFa_jI662Kg',
					external: true
				}
			]
		}
	];

	import { onMount, onDestroy } from 'svelte';

	const bibleVerses = [
		{ text: 'Car la parole de Dieu est vivante et efficace, plus tranchante qu\u2019une épée quelconque à deux tranchants.', ref: 'Hébreux 4:12' },
		{ text: 'Ainsi la foi vient de ce qu\u2019on entend, et ce qu\u2019on entend vient de la parole de Christ.', ref: 'Romains 10:17' },
		{ text: 'Ta parole est une lampe à mes pieds, et une lumière sur mon sentier.', ref: 'Psaume 119:105' },
		{ text: 'Veillez donc, car vous ne savez ni le jour, ni l\u2019heure.', ref: 'Matthieu 25:13' },
		{ text: 'Voici, je viens bientôt. Heureux celui qui garde les paroles de la prophétie de ce livre.', ref: 'Apocalypse 22:7' },
		{ text: 'Ne crains point, car je suis avec toi ; ne t\u2019effraie point, car je suis ton Dieu.', ref: 'Ésaïe 41:10' },
		{ text: 'Je puis tout par celui qui me fortifie.', ref: 'Philippiens 4:13' },
		{ text: 'L\u2019Éternel est mon berger : je ne manquerai de rien.', ref: 'Psaume 23:1' },
		{ text: 'Celui qui a commencé en vous cette bonne œuvre la rendra parfaite pour le jour de Jésus-Christ.', ref: 'Philippiens 1:6' },
		{ text: 'Je suis le chemin, la vérité, et la vie. Nul ne vient au Père que par moi.', ref: 'Jean 14:6' },
		{ text: 'Voici, je me tiens à la porte, et je frappe. Si quelqu\u2019un entend ma voix et ouvre la porte, j\u2019entrerai.', ref: 'Apocalypse 3:20' },
		{ text: 'Car Dieu a tant aimé le monde qu\u2019il a donné son Fils unique.', ref: 'Jean 3:16' },
	];

	let verseIndex = 0;
	let verseVisible = true;
	let verseInterval: ReturnType<typeof setInterval>;

	onMount(() => {
		verseInterval = setInterval(() => {
			verseVisible = false;
			setTimeout(() => {
				verseIndex = (verseIndex + 1) % bibleVerses.length;
				verseVisible = true;
			}, 500);
		}, 8000);
	});

	onDestroy(() => {
		clearInterval(verseInterval);
	});

	const socials = [
		{
			label: 'YouTube',
			href: 'https://www.youtube.com/channel/UCS3zqpqnCvT0SFa_jI662Kg',
			icon: FaBrandsYoutube
		},
		{
			label: 'Facebook',
			href: 'https://www.facebook.com/missionnaire.net',
			icon: FaBrandsFacebook
		},
		{
			label: 'WhatsApp',
			href: 'https://wa.me/250788567415',
			icon: RiLogoWhatsappFill
		}
	];
</script>

<footer class="footer relative bg-stone-900 text-stone-400 overflow-hidden">
	<!-- Decorative top accent line -->
	<div class="h-px w-full bg-gradient-to-r from-transparent via-missionnaire/40 to-transparent"></div>

	<!-- Bible verse rotator -->
	<div class="border-b border-stone-800 py-6">
		<div class="max-w-5xl mx-auto px-6 text-center" style="min-height: 5rem;">
			<div
				style="opacity: {verseVisible ? 1 : 0}; transform: translateY({verseVisible ? '0' : '6px'}); transition: opacity 0.7s cubic-bezier(0.16, 1, 0.3, 1), transform 0.7s cubic-bezier(0.16, 1, 0.3, 1);"
			>
				<p class="font-display text-xl md:text-2xl italic text-stone-300 leading-relaxed">
					« {bibleVerses[verseIndex].text} »
				</p>
				<p class="text-[12px] font-semibold uppercase tracking-[0.25em] text-missionnaire mt-3 font-body">
					{bibleVerses[verseIndex].ref}
				</p>
			</div>
		</div>
	</div>

	<div class="max-w-5xl mx-auto px-6 pt-16 pb-8">
		<!-- Top section: Logo + Nav columns -->
		<div class="grid grid-cols-2 md:grid-cols-12 gap-10 md:gap-8 pb-12 border-b border-stone-800">
			<!-- Brand column -->
			<div class="col-span-2 md:col-span-4">
				<div class="flex items-center gap-3 mb-5">
					<picture>
						<source srcset="/icons/logo.webp" type="image/webp" />
						<img
							src="/icons/logo.png"
							alt="Missionnaire Network"
							class="h-8 w-auto brightness-0 invert opacity-80"
							width="75"
							height="32"
							loading="lazy"
						/>
					</picture>
				</div>
				<p class="text-sm leading-relaxed text-stone-400 max-w-xs">
					Prédications, cantiques et ressources du Message de l'Heure pour l'édification des croyants.
				</p>

				<!-- Social icons -->
				<div class="flex items-center gap-4 mt-6">
					{#each socials as social}
						<a
							href={social.href}
							target="_blank"
							rel="noopener noreferrer"
							aria-label={social.label}
							class="flex items-center justify-center w-9 h-9 border border-stone-700 text-stone-400 hover:border-missionnaire hover:text-missionnaire transition-all duration-300"
						>
							<Icon className="w-3.5 h-3.5" color="#a8a29e" src={social.icon} />
						</a>
					{/each}
				</div>
			</div>

			<!-- Nav columns -->
			{#each navColumns as column}
				<div class="col-span-1 md:col-span-2 {column.title === 'Informations' ? 'md:col-start-11 md:col-span-2' : ''}">
					<p class="text-[10px] font-semibold uppercase tracking-[0.25em] text-stone-400 mb-4">
						{column.title}
					</p>
					<ul class="flex flex-col gap-2.5">
						{#each column.links as link}
							<li>
								<a
									href={link.href}
									class="text-sm text-stone-400 hover:text-white transition-colors duration-200"
									target={link.external ? '_blank' : undefined}
									rel={link.external ? 'noopener noreferrer' : undefined}
								>
									{link.label}
								</a>
							</li>
						{/each}
					</ul>
				</div>
			{/each}
		</div>

		<!-- Bottom bar -->
		<div class="flex flex-col sm:flex-row items-center justify-between gap-4 pt-8">
			<p class="text-xs text-stone-400">
				© 2012 – {new Date().getFullYear()} Missionnaire Network. Tous droits réservés.
			</p>

			<!-- Decorative cross -->
			<svg width="16" height="22" viewBox="0 0 16 22" fill="none" class="opacity-20 hidden sm:block" aria-hidden="true">
				<rect x="5.5" y="0" width="5" height="22" rx="1" fill="#FF880C" />
				<rect x="0" y="5" width="16" height="5" rx="1" fill="#FF880C" />
			</svg>

			<p class="text-[11px] italic text-stone-400 font-display hidden sm:block">
				« Jésus-Christ est le même hier, aujourd'hui, et éternellement » — Hébreux 13:8
			</p>
		</div>
	</div>
</footer>

