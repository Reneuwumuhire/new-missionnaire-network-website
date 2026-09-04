<script lang="ts">
	import { onMount } from 'svelte';
	import { t, type TranslationKey } from '$lib/i18n';
	import type { OperationalAlert, OperationalAlertId } from '$lib/operational-alerts';

	let alerts = $state<OperationalAlert[]>([]);
	let checkedAt = $state<string | null>(null);
	let refreshing = $state(false);

	const copy: Record<OperationalAlertId, { title: TranslationKey; body: TranslationKey }> = {
		'broadcast-offline': {
			title: 'operations.broadcastOfflineTitle',
			body: 'operations.broadcastOfflineBody'
		},
		'streaming-server-unavailable': {
			title: 'operations.streamingServerUnavailableTitle',
			body: 'operations.streamingServerUnavailableBody'
		},
		'stream-reconnecting': {
			title: 'operations.streamReconnectingTitle',
			body: 'operations.streamReconnectingBody'
		},
		'recorder-unavailable': {
			title: 'operations.recorderUnavailableTitle',
			body: 'operations.recorderUnavailableBody'
		},
		'live-not-recording': {
			title: 'operations.liveNotRecordingTitle',
			body: 'operations.liveNotRecordingBody'
		},
		'stream-ready': {
			title: 'operations.streamReadyTitle',
			body: 'operations.streamReadyBody'
		},
		'upload-recovery': {
			title: 'operations.uploadRecoveryTitle',
			body: 'operations.uploadRecoveryBody'
		},
		'failed-recordings': {
			title: 'operations.failedRecordingsTitle',
			body: 'operations.failedRecordingsBody'
		},
		'stream-recovered': {
			title: 'operations.streamRecoveredTitle',
			body: 'operations.streamRecoveredBody'
		},
		'monitor-unavailable': {
			title: 'operations.monitorUnavailableTitle',
			body: 'operations.monitorUnavailableBody'
		},
		'systems-recovered': {
			title: 'operations.systemsRecoveredTitle',
			body: 'operations.systemsRecoveredBody'
		}
	};

	function hasProblem(items: OperationalAlert[]): boolean {
		return items.some((item) => item.severity !== 'recovery');
	}

	async function refresh() {
		if (refreshing) return;
		refreshing = true;
		try {
			const response = await fetch('/api/recordings/status', { cache: 'no-store' });
			if (!response.ok) throw new Error('Operational status request failed');
			const result = (await response.json()) as {
				operationalAlerts: OperationalAlert[];
				checkedAt: string;
			};
			const next = result.operationalAlerts;
			alerts =
				hasProblem(alerts) && !hasProblem(next)
					? [...next, { id: 'systems-recovered', severity: 'recovery' }]
					: next;
			checkedAt = result.checkedAt;
		} catch {
			alerts = [{ id: 'monitor-unavailable', severity: 'critical' }];
			checkedAt = new Date().toISOString();
		} finally {
			refreshing = false;
		}
	}

	function colors(alert: OperationalAlert): string {
		if (alert.severity === 'critical') return 'border-red-200 bg-red-50 text-red-800';
		if (alert.severity === 'recovery') return 'border-green-200 bg-green-50 text-green-800';
		return 'border-amber-200 bg-amber-50 text-amber-800';
	}

	onMount(() => {
		void refresh();
		const interval = window.setInterval(refresh, 30_000);
		return () => window.clearInterval(interval);
	});
</script>

{#if alerts.length > 0}
	<section class="mb-6" aria-labelledby="operational-alerts-title" aria-live="polite">
		<div class="mb-2 flex items-center justify-between gap-4">
			<h2
				id="operational-alerts-title"
				class="text-xs font-bold uppercase tracking-[0.16em] text-stone-500"
			>
				{$t('operations.title')}
			</h2>
			<div class="flex items-center gap-3 text-[11px] text-stone-400">
				{#if checkedAt}
					<span
						>{$t('operations.checkedAt', {
							time: new Date(checkedAt).toLocaleTimeString([], {
								hour: '2-digit',
								minute: '2-digit'
							})
						})}</span
					>
				{/if}
				<button
					class="font-semibold text-primary hover:underline disabled:opacity-50"
					onclick={refresh}
					disabled={refreshing}
				>
					{$t('operations.refresh')}
				</button>
			</div>
		</div>
		<div class="space-y-2">
			{#each alerts as alert (alert.id)}
				<a
					href="/recordings"
					role={alert.severity === 'critical' ? 'alert' : undefined}
					class="flex items-start gap-3 border px-4 py-3 transition-opacity hover:opacity-80 {colors(
						alert
					)}"
				>
					<span class="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-current"></span>
					<span class="min-w-0 flex-1">
						<span class="block text-sm font-semibold"
							>{$t(copy[alert.id].title, { count: alert.count ?? 0 })}</span
						>
						<span class="mt-0.5 block text-xs opacity-80"
							>{$t(copy[alert.id].body, { count: alert.count ?? 0 })}</span
						>
					</span>
					<span aria-hidden="true">&rarr;</span>
				</a>
			{/each}
		</div>
	</section>
{/if}
