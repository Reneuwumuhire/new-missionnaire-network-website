import { isIP } from 'node:net';
import geoip from 'geoip-country';
import { countryMapping } from '../../utils/countries';

function lookupIp(ip: string | null): string | null {
	if (!ip || !isIP(ip)) return null;
	const country = geoip.lookup(ip)?.country;
	return country && Object.hasOwn(countryMapping, country) ? country : null;
}

export function visitorCountry(headers: Headers, onFly: boolean): string | null {
	if (onFly) {
		const country = lookupIp(headers.get('fly-client-ip'));
		if (country) return country;
	}

	for (const name of ['cf-ipcountry', 'x-vercel-ip-country']) {
		const country = headers.get(name)?.toUpperCase();
		if (country && Object.hasOwn(countryMapping, country)) return country;
	}

	for (const header of ['x-forwarded-for', 'x-real-ip']) {
		const ip = headers.get(header)?.split(',')[0]?.trim() || null;
		const country = lookupIp(ip);
		if (country) return country;
	}

	return null;
}
