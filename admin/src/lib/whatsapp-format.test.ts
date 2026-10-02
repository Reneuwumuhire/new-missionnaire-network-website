import assert from 'node:assert/strict';
import { whatsappExcerpt, whatsappToHtml } from './whatsapp-format';

const html = whatsappToHtml('> Une citation\n\n*fort* _italique_ ~rayé~ `mono` <script>');
assert.equal(
	html,
	'<blockquote>Une citation</blockquote><br><br><strong>fort</strong> <em>italique</em> <del>rayé</del> <code>mono</code> &lt;script&gt;'
);
assert.equal(whatsappExcerpt('🎧 *Une parole*\nqui continue'), '🎧 Une parole qui continue');

console.log('WhatsApp formatting checks passed.');
