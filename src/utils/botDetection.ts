/**
 * Detects bots, crawlers, and link-preview fetchers from a User-Agent string.
 * Used by analytics tracking to exclude non-human traffic from visitor counts.
 *
 * Covers: search crawlers (bot/spider/crawl/slurp), social previews
 * (WhatsApp, Facebook, Telegram, Discord, Slack, LinkedIn, Twitter, Pinterest,
 * Embedly), SEO/monitoring tools, headless browsers, and programmatic clients
 * (curl, wget, python-requests, axios, etc.). An empty UA is also treated as
 * a bot — real browsers always send one.
 */
const BOT_UA_PATTERN =
	/bot|spider|crawl|slurp|facebookexternalhit|whatsapp|embedly|pinterest|telegram|discord|slack|curl|wget|python-requests|python-urllib|go-http-client|okhttp|node-fetch|axios|headlesschrome|phantomjs|puppeteer|playwright|scraper|archiver|fetcher|preview|linkchecker|httpclient|libwww|lighthouse|ahrefs|semrush|yandex|baidu|duckduck/i;

export function isBotUserAgent(userAgent: string | null | undefined): boolean {
	if (!userAgent || userAgent === 'unknown') return true;
	return BOT_UA_PATTERN.test(userAgent);
}

export type DeviceType = 'Desktop' | 'Mobile' | 'Tablet' | 'Bot';

/**
 * Classifies a User-Agent into one of four device buckets. Tablet is checked
 * before Mobile because Android tablets include "Mobile" in their UA.
 */
export function classifyDevice(userAgent: string | null | undefined): DeviceType {
	if (isBotUserAgent(userAgent)) return 'Bot';
	if (/tablet|ipad|playbook|silk/i.test(userAgent!)) return 'Tablet';
	if (/mobile|android|iphone|ipod|phone|blackberry|opera mini|iemobile/i.test(userAgent!))
		return 'Mobile';
	return 'Desktop';
}
