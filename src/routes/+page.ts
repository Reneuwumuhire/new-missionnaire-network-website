import type { PageLoad } from './$types';

export const load: PageLoad = async ({ url }) => {
    const filter = url.searchParams.get('filter') || 'All';
    const search = url.searchParams.get('search') || '';

    return {
        initialFilter: filter,
        initialSearch: search
    };
};

export const prerender = false;