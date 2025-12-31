// <HeaderMenuLink
// menuName="L'église"
// link="/"
// subMenu={[{ name: 'sub1', link: '/' }, { name: 'sub2', link: '/' }]}
// />
// <!-- William Branham, Ewald Frank, Prédications, Chants, Galerie -->
// <HeaderMenuLink
// menuName="William Branham"
// link="/"
// subMenu={[{ name: 'sub1', link: '/' }, { name: 'sub2', link: '/' }]}
// />
// <HeaderMenuLink
// menuName="Ewald Frank"
// link="/"
// subMenu={[{ name: 'sub1', link: '/' }, { name: 'sub2', link: '/' }]}
// />
// <HeaderMenuLink menuName="Prédications" link="/" />
// <HeaderMenuLink menuName="Chants" link="/" />
// <HeaderMenuLink menuName="Galerie" link="/" />

import IoMusicalNotes from 'svelte-icons-pack/io/IoMusicalNotes';
import IoVideocam from 'svelte-icons-pack/io/IoVideocam';

export interface NavigationLinkSubmenu {
	subName: string;
	link: string;
	subText?: string;
	image?: string;
	icon?: any;
}
export interface NavigationLink {
	id?: number;
	menuName: string;
	link: string;
	subMenu?: NavigationLinkSubmenu[];
}
export const NavigationLinkList: NavigationLink[] = [
	{
		id: 1,
		menuName: "L'église",
		link: '/eglise'
	},
	{
		id: 2,
		menuName: 'William Branham',
		link: '/william-branham/biographie',
		subMenu: [
			{
				subName: 'Qui est William Marrion Branham?',
				subText: 'Découvrez toute la biographie du prophète et son histoire.',
				link: '/william-branham/biographie',
				image: '/img/branham_icon.png'
			}
		]
	},
	{
		id: 3,
		menuName: 'Ewald Frank',
		link: '/ewald-frank'
	},
	{
		id: 4,
		menuName: 'Musique',
		link: '/musique',
		subMenu: [
			{
				subName: 'Cantiques (Audio)',
				subText: 'Ecoutez les chants de louange et adoration.',
				link: '/musique',
				icon: IoMusicalNotes
			},
			{
				subName: 'Chants en Vidéo',
				subText: 'Regardez nos clips et enregistrements de chants.',
				link: '/musique/videos',
				icon: IoVideocam
			}
		]
	},
	{
		id: 5,
		menuName: 'Prédications',
		link: '/predications',
		subMenu: [
			{
				subName: 'Prédications (Audio)',
				subText: 'Ecoutez les prédications de Branham, Ewald Frank et locales.',
				link: '/predications',
				icon: IoMusicalNotes
			}
		]
	},
	{
		id: 6,
		menuName: 'Transcriptions',
		link: '/transcriptions'
	},
	{
		id: 7,
		menuName: 'À propos',
		link: '/a-propos'
	}
];
