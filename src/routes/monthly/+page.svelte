<script lang="ts">
	import { liveQuery } from 'dexie';
	import { onMount } from 'svelte';
	import BottomNav from '#lib/components/BottomNav.svelte';
	import CategoryBadge from '#lib/components/CategoryBadge.svelte';
	import { db, type Reading } from '#lib/data/db.js';
	import { deviceTimeZone, getSettings } from '#lib/data/settings.js';
	import type { Summary } from '#lib/domain/averages.js';
	import { DEFAULT_DAY_PART_WINDOWS, toLocal } from '#lib/domain/dayPart.js';
	import { DEFAULT_THRESHOLDS } from '#lib/domain/thresholds.js';
	import { countReadings } from '#lib/format.js';
	import { buildMonthly } from '#lib/monthly.js';

	const SYSTOLIC = { short: 'B', full: 'Bovendruk' };
	const DIASTOLIC = { short: 'O', full: 'Onderdruk' };
	const currentMonth = toLocal(new Date().toISOString(), deviceTimeZone()).month;

	let readings = $state.raw<Reading[] | null>(null);
	let thresholds = $state.raw(DEFAULT_THRESHOLDS);
	let windows = $state.raw(DEFAULT_DAY_PART_WINDOWS);

	const cards = $derived(readings ? buildMonthly(readings, { thresholds, windows, currentMonth }) : []);

	onMount(() => {
		getSettings(db).then((settings) => {
			thresholds = settings.thresholds;
			windows = settings.dayPartWindows;
		});
		const subscription = liveQuery(() => db.readings.toArray()).subscribe({
			next: (all) => (readings = all),
			error: () => (readings = [])
		});
		return () => subscription.unsubscribe();
	});

	function average(summary: Summary): string {
		return summary.count > 0 ? `${summary.systolic} / ${summary.diastolic}` : '–';
	}
</script>

<svelte:head>
	<title>Per maand · Tensie</title>
</svelte:head>

<div class="screen">
	<header>
		<h1>Per maand</h1>
		<p class="subtitle">Gemiddelde van alle metingen in de maand</p>
	</header>

	<main>
		{#if readings === null}
			<p class="empty">Metingen laden…</p>
		{:else if cards.length === 0}
			<div class="empty">
				<p>Nog geen metingen.</p>
				<p><a href="/new">Nieuwe meting</a> · <a href="/import">Importeren</a></p>
			</div>
		{:else}
			{#each cards as card (card.month)}
				<section class="card month" aria-labelledby="month-{card.month}">
					<div class="month-head">
						<h2 id="month-{card.month}">{card.label}</h2>
						<span class="count">{countReadings(card.summary.count)}</span>
					</div>
					{#if card.summary.classification}
						<div class="average">
							<span class="value">{card.summary.systolic} / {card.summary.diastolic}</span>
							<CategoryBadge category={card.summary.classification.systolic} prefix={SYSTOLIC} />
							<CategoryBadge category={card.summary.classification.diastolic} prefix={DIASTOLIC} />
						</div>
					{/if}
					<dl class="parts">
						<div>
							<dt>Ochtend</dt>
							<dd>{average(card.morning)}{#if card.morning.count > 0}{' '}<span class="times">({card.morning.count}×)</span>{/if}</dd>
						</div>
						<div>
							<dt>Avond</dt>
							<dd>{average(card.evening)}{#if card.evening.count > 0}{' '}<span class="times">({card.evening.count}×)</span>{/if}</dd>
						</div>
					</dl>
					{#if card.limitedData}
						<p class="limited">
							<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M12 8v5M12 16.5v.5"></path></svg>
							Beperkte gegevens (minder dan 6 metingen)
						</p>
					{/if}
				</section>
			{/each}
		{/if}
	</main>

	<BottomNav />
</div>

<style>
	.screen {
		max-width: 480px;
		margin: 0 auto;
		height: 100vh;
		height: 100dvh;
		display: flex;
		flex-direction: column;
	}

	header {
		padding: 20px 16px 4px;
	}

	h1 {
		margin: 0;
		font-size: 26px;
	}

	.subtitle {
		margin: 4px 0 0;
		color: var(--muted);
	}

	main {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 12px 16px 16px;
	}

	.empty {
		margin: 0;
		padding: 24px 0;
		color: var(--muted);
		text-align: center;
	}

	.empty p {
		margin: 0 0 8px;
	}

	.month {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 12px 14px;
	}

	.month-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 8px;
	}

	h2 {
		margin: 0;
		font-size: 17px;
	}

	.count {
		font-size: 15px;
		color: var(--muted);
		white-space: nowrap;
	}

	.average {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 8px 12px;
	}

	.value {
		font-size: 24px;
		font-weight: 700;
	}

	.parts {
		margin: 0;
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 10px;
		padding-top: 8px;
		border-top: 1px solid var(--line);
	}

	.parts dt {
		font-size: 15px;
		color: var(--muted);
	}

	.parts dd {
		margin: 0;
		font-size: 18px;
		font-weight: 700;
	}

	.times {
		font-size: 15px;
		font-weight: 400;
		color: var(--muted);
	}

	.limited {
		display: flex;
		align-items: center;
		gap: 6px;
		margin: 0;
		font-size: 15px;
		color: var(--warn-ink);
	}
</style>
