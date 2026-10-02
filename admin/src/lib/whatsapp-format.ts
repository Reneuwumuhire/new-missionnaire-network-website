const escapeHtml = (value: string) =>
	value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');

export function whatsappToHtml(value: string): string {
	return escapeHtml(value.trim())
		.replace(/```([^]*?)```/g, '<code>$1</code>')
		.replace(/`([^`\n]+)`/g, '<code>$1</code>')
		.replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>')
		.replace(/_([^_\n]+)_/g, '<em>$1</em>')
		.replace(/~([^~\n]+)~/g, '<del>$1</del>')
		.split(/\r?\n/)
		.map((line) => (line.startsWith('&gt; ') ? `<blockquote>${line.slice(5)}</blockquote>` : line))
		.join('<br>')
		.replace(/(?:<br>){3,}/g, '<br><br>');
}

export function whatsappExcerpt(value: string): string {
	return value
		.replace(/^[>\s]+/, '')
		.replace(/[*_~`]/g, '')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 220);
}
