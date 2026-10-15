/** Tauri maps registered schemes to .localhost HTTP origins in WebView2. */
export function mediaUrl(
	scheme: 'localmedia' | 'ytstream',
	token: string,
	userAgent: string
): string {
	const origin = /Windows/i.test(userAgent)
		? `http://${scheme}.localhost`
		: `${scheme}://localhost`;
	return `${origin}/media?id=${encodeURIComponent(token)}`;
}
