<script lang="ts">
	import { t } from '../../../i18n';
	import TableAudioList from '$lib/components/+tableAudioList.svelte';
	import Breadcrumbs from '$lib/components/+breadcrumbs.svelte';
	import { page } from '$app/state';
	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	let slug = $derived(page.params.slug || '');
	let pageTitle = $derived(
		slug.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
	);
</script>

<!-- Title/description/og:*/canonical come from `meta` in this route's
     load — the root layout renders the single canonical tag set ($lib/seo). -->

<Breadcrumbs items={[{ label: $t('nav.musique'), href: '/musique' }, { label: pageTitle }]} />

<TableAudioList audioList={data.songs} loading={false} />
