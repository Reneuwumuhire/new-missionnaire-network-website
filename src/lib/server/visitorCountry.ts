import { isIP } from 'node:net';
import geoip from 'geoip-country';
import { countryMapping } from '../../utils/countries';

export function visitorCountry(headers: Headers, onFly: boolean): string | null {
	if (onFly) {
		const ip = headers.get('fly-client-ip');
		if (ip && isIP(ip)) {
			const country = geoip.lookup(ip)?.country;
			if (country && Object.hasOwn(countryMapping, country)) return country;
		}
	}

	for (const name of ['cf-ipcountry', 'x-vercel-ip-country']) {
		const country = headers.get(name)?.toUpperCase();
		if (country && Object.hasOwn(countryMapping, country)) return country;
	}
	return null;
}
