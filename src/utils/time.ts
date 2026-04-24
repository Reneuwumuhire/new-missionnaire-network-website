/**
 * Returns today's date (YYYY-MM-DD) in Africa/Kigali timezone.
 *
 * The server may run in UTC (Vercel, most Linux boxes), but the audience is in
 * Rwanda. Without this, the "day" rolls over at 02:00 Kigali time and the
 * "Visiteurs aujourd'hui" counter lags by up to two hours every night.
 * Kigali is permanently UTC+2 (no DST), but Intl handles that for us.
 */
export function getTodayInKigali(): string {
	return new Intl.DateTimeFormat('en-CA', {
		timeZone: 'Africa/Kigali',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(new Date());
}

/** YYYY-MM extracted from a YYYY-MM-DD string. */
export function monthOf(date: string): string {
	return date.slice(0, 7);
}
