<script lang="ts">
	// @ts-ignore
	import Icon from 'svelte-icons-pack/Icon.svelte';
	import FaBrandsYoutube from 'svelte-icons-pack/fa/FaBrandsYoutube';
	import FaBrandsFacebook from 'svelte-icons-pack/fa/FaBrandsFacebook';
	import RiLogoWhatsappFill from 'svelte-icons-pack/ri/RiLogoWhatsappFill';
</script>

<footer class=" w-full flex flex-row justify-center text-gray-500">
	<!-- 	A propos
Prédications
Galerie
Actualités
Youtube -->
	<div
		class=" relative w-full max-w-5xl flex flex-col justify-center items-center self-center px-12 pt-12 pb-4 space-y-8"
	>
		<diV class=" w-14">
			<img src="/icons/logo.png" alt="logo" />
		</diV>
		<!-- div for links -->
		<div>
			<ul
				class="flex flex-col md:flex-row items-center justify-center md:space-x-9 font-semibold text-base"
			>
				<li>
					<a
						href="/a-propos"
						class="hover:text-missionnaire hover:font-bold transition-all duration-75 ease-in-out"
						>A propos</a
					>
				</li>
				<li>
					<a
						href="/predications"
						class="hover:text-missionnaire hover:font-bold transition-all duration-75 ease-in-out"
						>Prédications</a
					>
				</li>
				<li>
					<a
						href="/galerie"
						class="hover:text-missionnaire hover:font-bold transition-all duration-75 ease-in-out"
						>Galerie</a
					>
				</li>
				<!-- <li>
					<a
						href="/actualites"
						class="hover:text-missionnaire hover:font-bold transition-all duration-75 ease-in-out"
						>Actualités</a
					>
				</li> -->
				<li>
					<a
						href="https://www.youtube.com/channel/UCS3zqpqnCvT0SFa_jI662Kg"
						class="hover:text-missionnaire hover:font-bold transition-all duration-75 ease-in-out"
						target="_blank">Youtube</a
					>
				</li>
			</ul>
		</div>
		<div class="flex flex-row items-center space-x-5">
			<!-- add link to icons -->
			<a href="https://www.youtube.com/channel/UCS3zqpqnCvT0SFa_jI662Kg" target="_blank">
				<Icon className="w-4 h-" src={FaBrandsYoutube} />
			</a>
			<a href="https://www.facebook.com/missionnaire.net" target="_blank">
				<Icon className="w-4 h-4" src={FaBrandsFacebook} />
			</a>
			<a href="https://wa.me/+250728727726" target="_blank">
				<!-- when hover add a slight grey -->
				<Icon className="w-4 h-4" src={RiLogoWhatsappFill} />
			</a>
		</div>
		<small class=" text-center">© 2012 - 2023 Missionnaire Network. Tous droits réservés</small>
	</div>
</footer>
