<script lang="ts">
	import { liveQuery } from 'dexie';
	import { onMount } from 'svelte';
	import BottomNav from '#lib/components/BottomNav.svelte';
	import TrendChart from '#lib/components/TrendChart.svelte';
	import { buildChart, periodRange, type Period, type Series } from '#lib/chart.js';
	import { db, type Reading } from '#lib/data/db.js';
	import { deviceTimeZone, getSettings } from '#lib/data/settings.js';
	import { toLocal } from '#lib/domain/dayPart.js';
	import { DEFAULT_THRESHOLDS } from '#lib/domain/thresholds.js';
	import { addDays, countReadings, formatDateRange } from '#lib/format.js';
	import { CATEGORY_LABEL } from '#lib/texts.js';

	const PERIODS: { value: Period; label: string }[] = [
		{ value: '7d', label: '7 d' },
		{ value: '30d', label: '30 d' },
		{ value: '90d', label: '90 d' },
		{ value: '1y', label: '1 jaar' },
		{ value: 'custom', label: 'Anders' }
	];
	const SERIES: { value: Series; label: string }[] = [
		{ value: 'systolic', label: 'Bovendruk' },
		{ value: 'diastolic', label: 'Onderdruk' }
	];

	const timeZone = deviceTimeZone();
	const today = toLocal(new Date().toISOString(), timeZone).date;

	let readings = $state.raw<Reading[] | null>(null);
	let thresholds = $state.raw(DEFAULT_THRESHOLDS);
	let period = $state<Period>('7d');
	let series = $state<Series>('systolic');
	let customStart = $state(addDays(today, -29));
	let customEnd = $state(today);

	const range = $derived(periodRange(period, today, { start: customStart, end: customEnd }));
	const data = $derived(
		buildChart(readings ?? [], { series, range, thresholds, timeZone })
	);
	const seriesName = $derived(series === 'systolic' ? 'Bovendruk' : 'Onderdruk');
	const rangeLabel = $derived(
		`${formatDateRange(range.start, range.end)}${data.granularity === 'week' ? ' · per week' : ''}`
	);
	const chartLabel = $derived(
		data.summary.count === 0
			? `${seriesName}, ${rangeLabel}: geen metingen`
			: `${seriesName} in mmHg, ${rangeLabel}: ${countReadings(data.summary.count)}, gemiddeld ${data.series === 'systolic' ? data.summary.systolic : data.summary.diastolic}`
	);

	onMount(() => {
		getSettings(db).then((settings) => (thresholds = settings.thresholds));
		const subscription = liveQuery(() => db.readings.toArray()).subscribe({
			next: (all) => (readings = all),
			error: () => (readings = [])
		});
		return () => subscription.unsubscribe();
	});

	function pair(values: { systolic: number; diastolic: number } | null): string {
		return values ? `${values.systolic} / ${values.diastolic}` : '–';
	}
</script>

<svelte:head>
	<title>Verloop · Tensie</title>
</svelte:head>

<div class="screen">
	<header>
		<h1>Verloop</h1>
	</header>

	<main>
		<div class="segments periods" role="group" aria-label="Periode">
			{#each PERIODS as option (option.value)}
				<button type="button" aria-pressed={period === option.value} onclick={() => (period = option.value)}>
					{option.label}
				</button>
			{/each}
		</div>

		{#if period === 'custom'}
			<div class="custom">
				<div>
					<label for="from">Van</label>
					<input id="from" type="date" bind:value={customStart} max={today} />
				</div>
				<div>
					<label for="to">Tot en met</label>
					<input id="to" type="date" bind:value={customEnd} max={today} />
				</div>
			</div>
		{/if}

		<div class="series" role="group" aria-label="Waarde">
			{#each SERIES as option (option.value)}
				<button type="button" aria-pressed={series === option.value} onclick={() => (series = option.value)}>
					{option.label}
				</button>
			{/each}
		</div>

		<section class="card chart-card" aria-labelledby="chart-title">
			<h2 id="chart-title">{seriesName} in mmHg · {rangeLabel}</h2>
			{#if readings === null}
				<p class="empty">Metingen laden…</p>
			{:else if data.points.length === 0}
				<p class="empty">Geen metingen in deze periode.</p>
			{:else}
				<TrendChart {data} label={chartLabel} />
			{/if}
		</section>

		<div class="stats">
			<div class="card stat">
				<div class="stat-label">Gemiddeld</div>
				<div class="stat-value">
					{data.summary.count > 0 ? `${data.summary.systolic} / ${data.summary.diastolic}` : '–'}
				</div>
			</div>
			<div class="card stat">
				<div class="stat-label">Hoogste</div>
				<div class="stat-value">{pair(data.highest)}</div>
			</div>
			<div class="card stat">
				<div class="stat-label">Laagste</div>
				<div class="stat-value">{pair(data.lowest)}</div>
			</div>
		</div>
		<p class="stats-note">Hoogste en laagste: de meting met de hoogste of laagste {seriesName.toLowerCase()}.</p>

		{#if data.points.length > 0}
			<details class="card table-view">
				<summary>Toon als tabel</summary>
				<table>
					<caption class="visually-hidden">{seriesName} · {rangeLabel}</caption>
					<thead>
						<tr>
							<th scope="col">{data.granularity === 'week' ? 'Week' : 'Moment'}</th>
							<th scope="col" class="num">{seriesName}</th>
							<th scope="col">Categorie</th>
						</tr>
					</thead>
					<tbody>
						{#each data.points.toReversed() as point, i (i)}
							<tr>
								<td>{point.label}{point.count > 1 ? ` (${point.count}×)` : ''}</td>
								<td class="num">{point.value}</td>
								<td>{CATEGORY_LABEL[point.category]}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</details>
		{/if}
	</main>

	<BottomNav />
</div>

<style>
	/* Only the content scrolls; the navigation stays at the bottom, as on the list. */
	.screen {
		max-width: 480px;
		margin: 0 auto;
		height: 100vh;
		height: 100dvh;
		display: flex;
		flex-direction: column;
	}

	header {
		padding: 20px 16px 8px;
	}

	h1 {
		margin: 0;
		font-size: 26px;
	}

	main {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: 4px 16px 16px;
	}

	.segments {
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		gap: 4px;
		padding: 4px;
		border-radius: 12px;
		background: #e7ebe8;
	}

	.segments button {
		min-height: var(--tap);
		padding: 0 2px;
		border: 0;
		border-radius: 9px;
		background: transparent;
		color: var(--muted);
		font-size: 16px;
		font-weight: 700;
		white-space: nowrap;
		cursor: pointer;
	}

	.segments button[aria-pressed='true'] {
		background: var(--card);
		color: var(--ink);
	}

	.custom {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 10px;
	}

	.custom label {
		display: block;
		margin-bottom: 4px;
		font-weight: 700;
	}

	.custom input {
		width: 100%;
		height: var(--tap);
		padding: 0 10px;
		border-radius: 12px;
		border: 1px solid var(--field-line);
		background: var(--card);
	}

	.series {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 8px;
	}

	.series button {
		min-height: var(--tap);
		border-radius: 12px;
		border: 1px solid var(--field-line);
		background: var(--card);
		font-size: 16px;
		font-weight: 700;
		cursor: pointer;
	}

	.series button[aria-pressed='true'] {
		border: 2px solid var(--accent);
	}

	.chart-card {
		padding: 14px 10px 10px;
	}

	.chart-card h2 {
		margin: 0 0 8px 6px;
		font-size: 16px;
	}

	.empty {
		margin: 0;
		padding: 40px 8px;
		text-align: center;
		color: var(--muted);
	}

	.stats {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 8px;
	}

	.stat {
		padding: 10px 12px;
	}

	.stat-label {
		font-size: 14px;
		color: var(--muted);
	}

	.stat-value {
		font-size: 20px;
		font-weight: 700;
		white-space: nowrap;
	}

	.stats-note {
		margin: -6px 0 0;
		font-size: 14px;
		color: var(--muted);
	}

	.table-view summary {
		min-height: var(--tap);
		display: flex;
		align-items: center;
		font-weight: 700;
		color: var(--accent);
		cursor: pointer;
	}

	.table-view table {
		width: 100%;
		border-collapse: collapse;
		font-size: 15px;
	}

	.table-view th,
	.table-view td {
		padding: 6px 4px;
		border-bottom: 1px solid var(--line);
		text-align: left;
	}

	.table-view .num {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
</style>
