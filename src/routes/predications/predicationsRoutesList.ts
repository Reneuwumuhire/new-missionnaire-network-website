export type PredicationRoutesType = {
	slug: string;
	title: string;
	description?: string;
};

export const PredicationsRoutes: PredicationRoutesType[] = [
	{
		slug: 'tous',
		title: 'Tous',
		description: 'Listes des tous les predications sur notre site. '
	},
	{
		slug: 'branham',
		title: 'William Branham',
		description: 'Listes les predications de William Marrion Branham  sur notre site. '
	},
	{
		slug: 'ewald-frank',
		title: 'Ewald Frank',
		description: 'Listes les predications de Ewald Frank sur notre site. '
	},
	{
		slug: 'eglise-locale',
		title: 'Eglise locale',
		description: "Listes les predications de l'eglise locale sur notre site. "
	}
];

// all alphabetic characters [A-Z] to be used as search filter for predications list with first letter
export const alphabeticCharacters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
