export function visitedPageUrl(path: string, publicSiteBase: string): string | null {
	if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) return null;
	if (/[\u0000-\u001f\u007f]/u.test(path)) return null;

	try {
		const base = new URL(publicSiteBase);
		if (base.protocol !== 'https:' && base.protocol !== 'http:') return null;
		const destination = new URL(path, base);
		return destination.origin === base.origin ? destination.href : null;
	} catch {
		return null;
	}
}
