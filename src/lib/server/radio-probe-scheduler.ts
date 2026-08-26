const SCHEDULER_KEY = Symbol.for('missionnaire.radio-probe-scheduler');

type SchedulerState = { timer?: ReturnType<typeof setTimeout>; running?: boolean };

export function shouldRunRadioProbe(now: Date): boolean {
	const minute = now.getUTCMinutes();
	const hour = now.getUTCHours();
	const day = now.getUTCDay();

	return (
		minute % 5 === 0 ||
		((day === 3 || day === 6) && hour >= 16 && hour <= 21) ||
		(day === 0 && hour >= 6 && hour <= 11)
	);
}

export function startRadioProbeScheduler(): void {
	const state = ((globalThis as any)[SCHEDULER_KEY] ??= {}) as SchedulerState;
	if (state.timer) return;

	const domain = process.env.RAILWAY_PRIVATE_DOMAIN;
	const port = process.env.PORT;
	const secret = process.env.CRON_SECRET;
	if (!domain || !port || !secret) {
		console.warn('[CronRadioProbe] Railway scheduler disabled: private domain, port, or CRON_SECRET missing');
		return;
	}

	const tick = async () => {
		if (state.running || !shouldRunRadioProbe(new Date())) return;
		state.running = true;
		try {
			const response = await fetch(`http://${domain}:${port}/api/cron/radio-probe`, {
				headers: { Authorization: `Bearer ${secret}` }
			});
			if (!response.ok) console.error(`[CronRadioProbe] Scheduler received ${response.status}`);
		} catch (error) {
			console.error('[CronRadioProbe] Scheduler request failed:', error);
		} finally {
			state.running = false;
		}
	};

	const delay = 60_000 - (Date.now() % 60_000) + 1_000;
	state.timer = setTimeout(() => {
		void tick();
		state.timer = setInterval(() => void tick(), 60_000);
	}, delay);
}
