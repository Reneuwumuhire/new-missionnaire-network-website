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

import FiBookOpen from 'svelte-icons-pack/fi/FiBookOpen';
import FiFileText from 'svelte-icons-pack/fi/FiFileText';
import FiHome from 'svelte-icons-pack/fi/FiHome';
import FiInfo from 'svelte-icons-pack/fi/FiInfo';
import FiMessageSquare from 'svelte-icons-pack/fi/FiMessageSquare';
import FiMusic from 'svelte-icons-pack/fi/FiMusic';
import FiPlayCircle from 'svelte-icons-pack/fi/FiPlayCircle';
import FiUser from 'svelte-icons-pack/fi/FiUser';
import FiUsers from 'svelte-icons-pack/fi/FiUsers';
import FiVideo from 'svelte-icons-pack/fi/FiVideo';
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
		link: '/predications'
	},
	{
		id: 2,
		menuName: 'nav.resources',
		link: '/transcriptions',
		subMenu: [
			{
				subName: 'nav.transcriptions',
				subText: 'nav.sub.transcriptionsText',
				link: '/transcriptions',
				icon: FiFileText
			},
			{
				subName: 'nav.extraits',
				subText: 'nav.sub.extraitsText',
				link: '/extraits',
				icon: FiMessageSquare
			},
			{
				subName: 'nav.sub.videos',
				subText: 'nav.sub.videosText',
				link: '/videos',
				icon: FiVideo
			},
			{
				subName: 'nav.literature',
				subText: 'nav.sub.literatureText',
				link: '/literature',
				icon: FiBookOpen
			}
		]
	},
	{
		id: 3,
		menuName: 'nav.ministries',
		link: '/william-branham/biographie',
		subMenu: [
			{
				subName: 'nav.williamBranham',
				subText: 'nav.sub.branhamBioText',
				link: '/william-branham/biographie',
				icon: FiUser
			},
			{
				subName: 'nav.ewaldFrank',
				subText: 'nav.sub.frankAboutText',
				link: '/ewald-frank',
				icon: FiUsers
			}
		]
	},
	{
		id: 4,
		menuName: 'nav.musique',
		link: '/musique',
		subMenu: [
			{
				subName: 'nav.sub.songsAudio',
				subText: 'nav.sub.songsAudioText',
				link: '/musique',
				icon: FiMusic
			},
			{
				subName: 'nav.sub.songsVideo',
				subText: 'nav.sub.songsVideoText',
				link: '/musique/videos',
				icon: FiPlayCircle
			}
		]
	},
	{
		id: 5,
		menuName: 'nav.questions',
		link: '/questions'
	},
	{
		id: 6,
		menuName: 'nav.direct',
		link: '/live'
	},
	{
		id: 7,
		menuName: 'nav.aPropos',
		link: '/a-propos',
		subMenu: [
			{
				subName: 'nav.eglise',
				subText: 'nav.sub.churchText',
				link: '/eglise',
				icon: FiHome
			},
			{
				subName: 'nav.aPropos',
				subText: 'nav.sub.aboutText',
				link: '/a-propos',
				icon: FiInfo
			}
		]
	}
];
