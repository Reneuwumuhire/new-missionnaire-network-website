import assert from 'node:assert/strict';
import { selectedSourceValues, sourcePublicUrl, sourceSermonSlug } from './extrait-source';

assert.equal(
	sourceSermonSlug({ french_title: 'Le Premier Sceau', date_code: '63-0318' }),
	'le-premier-sceau-63-0318'
);
assert.equal(sourcePublicUrl('javascript:alert(1)'), '');
assert.deepEqual(
	selectedSourceValues({
		id: 'abc',
		kind: 'recording',
		title: 'Réunion de Krefeld',
		subtitle: 'Retransmission',
		links: [
			{ kind: 'live', label: 'Écouter', href: '/live/rediffusions/abc' },
			{ kind: 'pdf', label: 'Lire', href: 'https://example.com/file.pdf' }
		]
	}),
	{
		sourceKind: 'recording',
		sourceId: 'abc',
		sourceTitle: 'Réunion de Krefeld',
		sermonUrl: '',
		liveUrl: '/live/rediffusions/abc',
		videoUrl: '',
		pdfUrl: 'https://example.com/file.pdf',
		audioUrl: '',
		transcriptionUrl: ''
	}
);

console.log('Extrait source checks passed.');
