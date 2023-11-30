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

export interface NavigationLinkSubmenu {
	subName: string;
	link: string;
	subText?: string;
	image?: string;
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
			},
			{
				subName: 'Brochures',
				subText: "Téléchargez les brochures pour connaitre le Message qu'il apporte.",
				link: '/william-branham/biographie',
				image: '/img/book_icon.png'
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
		menuName: 'Prédications',
		link: '/predications/tous'
	},
	{
		id: 5,
		menuName: 'Chants',
		link: '/chants'
	},
	{
		id: 6,
		menuName: 'Galerie',
		link: '/galerie'
	}
];
