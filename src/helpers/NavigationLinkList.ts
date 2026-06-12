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
import IoBookOutline from 'svelte-icons-pack/io/IoBookOutline';
import IoInformationCircleOutline from 'svelte-icons-pack/io/IoInformationCircleOutline';
import type { TranslationKey } from '../i18n';

// `menuName`, `subName` and `subText` are translation KEYS — the nav
// components render them through `$t(...)` so the header follows the
// FR/EN toggle.
export interface NavigationLinkSubmenu {
	subName: TranslationKey;
	link: string;
	subText?: TranslationKey;
	image?: string;
	icon?: any;
}
export interface NavigationLink {
	id?: number;
	menuName: TranslationKey;
	link: string;
	subMenu?: NavigationLinkSubmenu[];
}
export const NavigationLinkList: NavigationLink[] = [
	{
		id: 1,
		menuName: 'nav.predications',
		link: '/predications',
		subMenu: [
			{
				subName: 'nav.sub.sermonsAudio',
				subText: 'nav.sub.sermonsAudioText',
				link: '/predications',
				icon: IoMusicalNotes
			},
			{
				subName: 'nav.sub.videos',
				subText: 'nav.sub.videosText',
				link: '/videos',
				icon: IoVideocam
			}
		]
	},
	{
		id: 2,
		menuName: 'nav.transcriptions',
		link: '/transcriptions'
	},
	{
		id: 3,
		menuName: 'nav.williamBranham',
		link: '/william-branham/biographie',
		subMenu: [
			{
				subName: 'nav.sub.branhamBio',
				subText: 'nav.sub.branhamBioText',
				link: '/william-branham/biographie',
				image: '/img/branham_icon.png'
			},
			{
				subName: 'nav.sub.branhamBrochures',
				subText: 'nav.sub.branhamBrochuresText',
				link: '/literature?author=William Marrion Branham&category=book',
				icon: IoBookOutline
			}
		]
	},
	{
		id: 4,
		menuName: 'nav.ewaldFrank',
		link: '/ewald-frank',
		subMenu: [
			{
				subName: 'nav.sub.frankAbout',
				subText: 'nav.sub.frankAboutText',
				link: '/ewald-frank',
				icon: IoInformationCircleOutline
			},
			{
				subName: 'nav.sub.frankBooks',
				subText: 'nav.sub.frankBooksText',
				link: '/literature?author=Ewald Frank&category=book',
				icon: IoBookOutline
			}
		]
	},
	{
		id: 5,
		menuName: 'nav.musique',
		link: '/musique',
		subMenu: [
			{
				subName: 'nav.sub.songsAudio',
				subText: 'nav.sub.songsAudioText',
				link: '/musique',
				icon: IoMusicalNotes
			},
			{
				subName: 'nav.sub.songsVideo',
				subText: 'nav.sub.songsVideoText',
				link: '/musique/videos',
				icon: IoVideocam
			}
		]
	},
	{
		id: 6,
		menuName: 'nav.questions',
		link: '/questions'
	},
	{
		id: 7,
		menuName: 'nav.direct',
		link: '/live'
	},
	{
		id: 8,
		menuName: 'nav.eglise',
		link: '/eglise'
	},
	{
		id: 9,
		menuName: 'nav.aPropos',
		link: '/a-propos'
	}
];
