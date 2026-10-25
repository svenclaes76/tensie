<script lang="ts">
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import TrendChart from '#lib/components/TrendChart.svelte';
	import { db, type Reading } from '#lib/data/db.js';
	import { deviceTimeZone, getSettings, type EffectiveSettings } from '#lib/data/settings.js';
	import type { Summary } from '#lib/domain/averages.js';
	import { toLocal } from '#lib/domain/dayPart.js';
	import type { Category } from '#lib/domain/types.js';
	import { addDays, countReadings, formatDate } from '#lib/format.js';
	import { buildReport } from '#lib/report.js';
	import { CATEGORY_CODE, CATEGORY_LABEL, DAY_PART_LABEL } from '#lib/texts.js';

	const timeZone = deviceTimeZone();
	const today = toLocal(new Date().toISOString(), timeZone).date;
	const isDate = (value: string | null): value is string => !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);

	const from = page.url.searchParams.get('from');
	const to = page.url.searchParams.get('to');
	const range =
		isDate(from) && isDate(to) && from <= to
			? { start: from, end: to }
			: { start: addDays(today, -89), end: today };

	let readings = $state.raw<Reading[] | null>(null);
	let settings = $state.raw<EffectiveSettings | null>(null);

	const report = $derived(
		readings && settings
			? buildReport(readings, {
					range,
					thresholds: settings.thresholds,
					windows: settings.dayPartWindows,
					timeZone
				})
			: null
	);

	onMount(async () => {
		settings = await getSettings(db);
		readings = await db.readings.toArray();
	});

	function average(summary: Summary): string {
		return summary.count > 0 ? `${summary.systolic} / ${summary.diastolic}` : '–';
	}

	function categories(summary: Summary): string {
		if (!summary.classification) return '–';
		const { systolic, diastolic } = summary.classification;
		return `${CATEGORY_LABEL[systolic]} / ${CATEGORY_LABEL[diastolic].toLowerCase()}`;
	}

	/** The thresholds and day parts behind the report, as one sentence. */
	function basis({ thresholds: t, dayPartWindows: w }: EffectiveSettings): string {
		const pair = (limit: 'mild' | 'moderate' | 'severe') => `${t.systolic[limit]}/${t.diastolic[limit]}`;
		return [
			`Bovendruk / onderdruk in mmHg, ondergrens telt mee: licht verhoogd vanaf ${pair('mild')}, gemiddeld verhoogd vanaf ${pair('moderate')}, ernstig verhoogd vanaf ${pair('severe')}.`,
			`Ochtend ${w.morning.start}–${w.morning.end}, avond ${w.evening.start}–${w.evening.end}.`,
			'Thuis gemeten en zelf ingevoerd met Tensie; gemiddelden over alle afzonderlijke metingen.'
		].join(' ');
	}

	function code(category: Category): string {
		return CATEGORY_CODE[category] ? ` ${CATEGORY_CODE[category]}` : '';
	}
</script>

<svelte:head>
	<title>Bloeddrukrapport · Tensie</title>
</svelte:head>

<div class="toolbar no-print">
	<a href="/export" class="back" aria-label="Terug">
		<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"></path></svg>
	</a>
	<button type="button" class="button-primary print" onclick={() => window.print()}>
		Afdrukken of opslaan als PDF
	</button>
</div>

<article class="report">
	<h1>Bloeddrukrapport</h1>

	{#if report && settings}
		<dl class="facts">
			<div><dt>Naam</dt><dd>{settings.patientName ?? '–'}</dd></div>
			<div><dt>Geboortejaar</dt><dd>{settings.birthYear ?? '–'}</dd></div>
			<div><dt>Periode</dt><dd>{formatDate(range.start)} – {formatDate(range.end)}</dd></div>
			<div><dt>Metingen</dt><dd>{countReadings(report.summary.count)}</dd></div>
			<div><dt>Gemaakt op</dt><dd>{formatDate(today)}</dd></div>
		</dl>

		{#if report.summary.count === 0}
			<p>Geen metingen in deze periode.</p>
		{:else}
			<section aria-labelledby="summary-title">
				<h2 id="summary-title">Samenvatting</h2>
				<table>
					<thead>
						<tr>
							<th scope="col"></th>
							<th scope="col" class="num">Gemiddeld (mmHg)</th>
							<th scope="col">Categorie boven / onder</th>
							<th scope="col" class="num">Aantal</th>
						</tr>
					</thead>
					<tbody>
						{#each [{ label: 'Alle metingen', summary: report.summary }, { label: 'Ochtend', summary: report.morning }, { label: 'Avond', summary: report.evening }] as row (row.label)}
							<tr>
								<th scope="row">{row.label}</th>
								<td class="num">{average(row.summary)}</td>
								<td>{categories(row.summary)}</td>
								<td class="num">{row.summary.count}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</section>

			<section aria-labelledby="months-title">
				<h2 id="months-title">Per maand</h2>
				<table>
					<thead>
						<tr>
							<th scope="col">Maand</th>
							<th scope="col" class="num">Gemiddeld</th>
							<th scope="col">Categorie boven / onder</th>
							<th scope="col" class="num">Aantal</th>
						</tr>
					</thead>
					<tbody>
						{#each report.months as month (month.month)}
							<tr>
								<th scope="row">{month.label}</th>
								<td class="num">{average(month.summary)}</td>
								<td>{categories(month.summary)}</td>
								<td class="num">
									{month.summary.count}{#if month.limitedData}<span class="limited">*</span>{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
				{#if report.months.some((m) => m.limitedData)}
					<p class="small">* Beperkte gegevens: minder dan 6 metingen in die maand.</p>
				{/if}
			</section>

			<section class="charts" aria-labelledby="charts-title">
				<h2 id="charts-title">Verloop</h2>
				{#each [{ title: 'Bovendruk', data: report.systolicChart }, { title: 'Onderdruk', data: report.diastolicChart }] as chart (chart.title)}
					<figure>
						<figcaption>
							{chart.title} in mmHg{chart.data.granularity === 'week' ? ' (weekgemiddelden)' : ''}
						</figcaption>
						<TrendChart data={chart.data} label="{chart.title} in mmHg" />
					</figure>
				{/each}
			</section>

			<section aria-labelledby="readings-title">
				<h2 id="readings-title">Alle metingen</h2>
				<p class="small">L = licht verhoogd, G = gemiddeld verhoogd, E = ernstig verhoogd; zonder letter: normaal.</p>
				<table class="log">
					<thead>
						<tr>
							<th scope="col">Datum</th>
							<th scope="col">Uur</th>
							<th scope="col" class="num">Boven</th>
							<th scope="col" class="num">Onder</th>
							<th scope="col">Dagdeel</th>
							<th scope="col">Arm</th>
							<th scope="col">Notitie</th>
						</tr>
					</thead>
					<tbody>
						{#each report.rows as row, i (i)}
							<tr>
								<td>{row.date}</td>
								<td>{row.time}</td>
								<td class="num">{row.systolic}{code(row.systolicCategory)}</td>
								<td class="num">{row.diastolic}{code(row.diastolicCategory)}</td>
								<td>{row.dayPart === 'other' ? '' : DAY_PART_LABEL[row.dayPart]}</td>
								<td>{row.arm === 'left' ? 'links' : row.arm === 'right' ? 'rechts' : ''}</td>
								<td>{row.note ?? ''}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</section>
		{/if}

		<section class="basis" aria-labelledby="basis-title">
			<h2 id="basis-title">Gebruikte grenzen</h2>
			<p class="small">{basis(settings)}</p>
		</section>
	{:else}
		<p class="no-print">Rapport laden…</p>
	{/if}
</article>

<style>
	.toolbar {
		max-width: 760px;
		margin: 0 auto;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 12px;
	}

	.back {
		flex: none;
		width: var(--tap);
		height: var(--tap);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.print {
		min-height: 52px;
		font-size: 17px;
	}

	.report {
		max-width: 760px;
		margin: 0 auto 24px;
		padding: 20px 16px;
		background: #ffffff;
		color: #000000;
	}

	h1 {
		margin: 0 0 12px;
		font-size: 24px;
	}

	h2 {
		margin: 20px 0 8px;
		font-size: 18px;
	}

	.facts {
		margin: 0;
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
		gap: 6px 16px;
	}

	.facts dt {
		font-size: 14px;
		color: var(--muted);
	}

	.facts dd {
		margin: 0;
		font-weight: 700;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 15px;
	}

	th,
	td {
		padding: 4px 6px;
		border-bottom: 1px solid #cccccc;
		text-align: left;
		vertical-align: top;
	}

	thead th {
		border-bottom: 2px solid #000000;
		font-size: 14px;
	}

	.num {
		text-align: right;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.log td:nth-child(-n + 2) {
		white-space: nowrap;
	}

	.limited {
		margin-left: 2px;
	}

	.small {
		margin: 6px 0 0;
		font-size: 14px;
		color: #333333;
	}

	figure {
		margin: 0 0 12px;
		break-inside: avoid;
	}

	figcaption {
		margin-bottom: 4px;
		font-weight: 700;
	}

	tr {
		break-inside: avoid;
	}

	@media print {
		.no-print {
			display: none;
		}

		.report {
			max-width: none;
			margin: 0;
			padding: 0;
		}

		table {
			font-size: 10pt;
		}

		.small {
			font-size: 9pt;
		}

		.charts :global(svg) {
			width: 100%;
			height: auto;
		}
	}
</style>
