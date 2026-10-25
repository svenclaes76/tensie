<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { periodRange, type Period } from '#lib/chart.js';
	import { db } from '#lib/data/db.js';
	import { deviceTimeZone, getSettings, isValidBirthYear, saveSettings } from '#lib/data/settings.js';
	import { toLocal } from '#lib/domain/dayPart.js';
	import { download } from '#lib/download.js';
	import { buildFullExport } from '#lib/export/json.js';
	import { buildCsv } from '#lib/export/rows.js';
	import { addDays, countReadings } from '#lib/format.js';

	const PERIODS: { value: Exclude<Period, '7d'>; label: string }[] = [
		{ value: '30d', label: '30 d' },
		{ value: '90d', label: '90 d' },
		{ value: '1y', label: '1 jaar' },
		{ value: 'custom', label: 'Anders' }
	];

	const today = toLocal(new Date().toISOString(), deviceTimeZone()).date;

	let loaded = $state(false);
	let name = $state('');
	let birthYear = $state('');
	let period = $state<Exclude<Period, '7d'>>('90d');
	let customStart = $state(addDays(today, -89));
	let customEnd = $state(today);
	let count = $state<number | null>(null);
	let busy = $state<'xlsx' | 'csv' | 'json' | null>(null);
	let status = $state('');

	const birthYearValid = $derived(birthYear === '' || isValidBirthYear(Number(birthYear)));

	onMount(async () => {
		const settings = await getSettings(db);
		name = settings.patientName ?? '';
		birthYear = settings.birthYear ? String(settings.birthYear) : '';
		count = await db.readings.filter((r) => !r.deleted).count();
		loaded = true;
	});

	async function savePatient() {
		if (!birthYearValid) return;
		await saveSettings(db, {
			patientName: name,
			...(birthYear === '' ? {} : { birthYear: Number(birthYear) })
		});
	}

	async function openReport() {
		await savePatient();
		const range = periodRange(period, today, { start: customStart, end: customEnd });
		await goto(`/report?from=${range.start}&to=${range.end}`);
	}

	async function run(kind: 'xlsx' | 'csv' | 'json', make: () => Promise<void>) {
		busy = kind;
		status = '';
		try {
			await make();
			status = 'Je download is klaar.';
		} catch {
			status = 'Exporteren is mislukt. Probeer het opnieuw.';
		} finally {
			busy = null;
		}
	}

	const live = () => db.readings.filter((r) => !r.deleted).toArray();

	function exportXlsx() {
		return run('xlsx', async () => {
			// SheetJS is large: load it only when needed.
			const { buildWorkbook } = await import('#lib/export/workbook.js');
			download(
				`tensie-metingen-${today}.xlsx`,
				buildWorkbook(await live()),
				'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
			);
		});
	}

	function exportCsv() {
		return run('csv', async () => {
			download(`tensie-metingen-${today}.csv`, buildCsv(await live()), 'text/csv;charset=utf-8');
		});
	}

	function exportJson() {
		return run('json', async () => {
			const data = await buildFullExport(db);
			download(`tensie-gegevens-${today}.json`, JSON.stringify(data, null, 2), 'application/json');
		});
	}
</script>

<svelte:head>
	<title>Exporteren · Tensie</title>
</svelte:head>

<div class="screen">
	<header>
		<a href="/settings" class="back" aria-label="Terug">
			<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"></path></svg>
		</a>
		<h1>Exporteren</h1>
	</header>

	<main>
		{#if count !== null}
			<p class="muted">Je hebt {countReadings(count)} opgeslagen.</p>
		{/if}

		<section class="card" aria-labelledby="report-title">
			<h2 id="report-title">Rapport voor je arts</h2>
			<p class="muted">Een A4-rapport met gemiddelden, grafieken en alle metingen. Druk het af of bewaar het als PDF.</p>

			<div class="field">
				<label for="name">Naam</label>
				<input id="name" autocomplete="name" disabled={!loaded} bind:value={name} onchange={savePatient} />
			</div>
			<div class="field">
				<label for="birth-year">Geboortejaar</label>
				<input
					id="birth-year"
					inputmode="numeric"
					pattern="[0-9]*"
					autocomplete="bday-year"
					disabled={!loaded}
					value={birthYear}
					oninput={(e) => {
						birthYear = e.currentTarget.value.replace(/\D/g, '').slice(0, 4);
						e.currentTarget.value = birthYear;
					}}
					onchange={savePatient}
					aria-invalid={!birthYearValid}
					aria-describedby={birthYearValid ? undefined : 'birth-year-error'}
				/>
			</div>
			{#if !birthYearValid}
				<p id="birth-year-error" class="error" role="alert">Vul een geboortejaar in, bijvoorbeeld 1976.</p>
			{/if}

			<div class="segments" role="group" aria-label="Periode">
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

			<button type="button" class="button-primary" disabled={!loaded || !birthYearValid} onclick={openReport}>
				Rapport maken
			</button>
		</section>

		<section class="card" aria-labelledby="sheet-title">
			<h2 id="sheet-title">Excel of CSV</h2>
			<p class="muted">Alle metingen, één per rij, in de opmaak die Importeren weer inleest.</p>
			<div class="buttons">
				<button type="button" class="secondary" disabled={busy !== null} onclick={exportXlsx}>
					{busy === 'xlsx' ? 'Bezig…' : 'Download Excel (.xlsx)'}
				</button>
				<button type="button" class="secondary" disabled={busy !== null} onclick={exportCsv}>
					{busy === 'csv' ? 'Bezig…' : 'Download CSV'}
				</button>
			</div>
		</section>

		<section class="card" aria-labelledby="all-title">
			<h2 id="all-title">Al je gegevens</h2>
			<p class="muted">
				Alles wat Tensie over jou bewaart, ook verwijderde metingen en je instellingen, in één JSON-bestand.
			</p>
			<button type="button" class="secondary" disabled={busy !== null} onclick={exportJson}>
				{busy === 'json' ? 'Bezig…' : 'Download alles (.json)'}
			</button>
		</section>

		<p class="status" role="status">{status}</p>
	</main>
</div>

<style>
	.screen {
		max-width: 480px;
		margin: 0 auto;
		min-height: 100vh;
		min-height: 100dvh;
	}

	header {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 16px 12px 8px;
	}

	.back {
		width: var(--tap);
		height: var(--tap);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	h1 {
		margin: 0;
		font-size: 22px;
	}

	main {
		display: flex;
		flex-direction: column;
		gap: 16px;
		padding: 4px 16px 24px;
	}

	.muted {
		margin: 0;
		color: var(--muted);
	}

	.card {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 16px;
	}

	h2 {
		margin: 0;
		font-size: 17px;
	}

	.field {
		display: grid;
		grid-template-columns: 110px minmax(0, 1fr);
		gap: 10px;
		align-items: center;
	}

	label {
		font-weight: 700;
	}

	.field input,
	.custom input {
		width: 100%;
		height: var(--tap);
		padding: 0 10px;
		border-radius: 12px;
		border: 1px solid var(--field-line);
		background: var(--card);
	}

	.field input[aria-invalid='true'] {
		border: 2px solid var(--error-ink);
	}

	.error {
		margin: 0;
		font-weight: 700;
		color: var(--error-ink);
	}

	.segments {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 4px;
		padding: 4px;
		border-radius: 12px;
		background: #e7ebe8;
	}

	.segments button {
		min-height: var(--tap);
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
	}

	.buttons {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.secondary {
		min-height: 52px;
		border-radius: 14px;
		border: 2px solid var(--accent);
		background: var(--card);
		color: var(--accent);
		font-size: 17px;
		font-weight: 700;
		cursor: pointer;
	}

	.secondary:disabled {
		opacity: 0.6;
		cursor: wait;
	}

	.status {
		min-height: 24px;
		margin: 0;
		text-align: center;
		font-weight: 700;
		color: var(--accent);
	}
</style>
