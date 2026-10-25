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
	import { buildHome, type Trend } from '#lib/home.js';
	import { DAY_PART_LABEL, MEDICAL_NOTE } from '#lib/texts.js';

	const SYSTOLIC = { short: 'Boven', full: 'Bovendruk' };
	const DIASTOLIC = { short: 'Onder', full: 'Onderdruk' };
	const today = toLocal(new Date().toISOString(), deviceTimeZone()).date;

	let readings = $state.raw<Reading[] | null>(null);
	let thresholds = $state.raw(DEFAULT_THRESHOLDS);
	let windows = $state.raw(DEFAULT_DAY_PART_WINDOWS);

	const home = $derived(readings ? buildHome(readings, { thresholds, windows, today }) : null);

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

	/** H7 trend in plain words; deliberately neutral, the app never judges a value. */
	function trendText(trend: Trend): string {
		switch (trend.kind) {
			case 'none':
				return 'Nog niet genoeg metingen om met vorige week te vergelijken.';
			case 'same':
				return 'Gelijk aan vorige week';
			case 'lower':
				return `${trend.systolic} / ${trend.diastolic} mmHg lager dan vorige week`;
			case 'higher':
				return `${trend.systolic} / ${trend.diastolic} mmHg hoger dan vorige week`;
			case 'mixed': {
				const part = (name: string, delta: number) =>
					`${name} ${Math.abs(delta)} ${delta < 0 ? 'lager' : 'hoger'}`;
				return `${part('Bovendruk', trend.systolic)}, ${part('onderdruk', trend.diastolic)} dan vorige week`;
			}
		}
	}

	function pair(summary: Summary): string {
		return summary.count > 0 ? `${summary.systolic} / ${summary.diastolic}` : '–';
	}
</script>

<svelte:head>
	<title>Tensie</title>
</svelte:head>

<div class="screen">
	<header>
		<div class="brand">Tensie</div>
		<a href="/settings" class="settings" aria-label="Instellingen">
			<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"></path><circle cx="16" cy="6" r="2"></circle><circle cx="10" cy="12" r="2"></circle><circle cx="18" cy="18" r="2"></circle></svg>
		</a>
	</header>

	<main>
		<h1 class="visually-hidden">Overzicht</h1>

		{#if home?.last}
			<section class="card" aria-labelledby="last-title">
				<div class="card-head">
					<h2 id="last-title">Laatste meting</h2>
					<span class="muted">{home.last.when}</span>
				</div>
				<div class="last-values">
					<div class="last-value">
						<span class="muted">Bovendruk</span>
						<span class="big">{home.last.systolic}</span>
						<CategoryBadge category={home.last.classification.systolic} />
					</div>
					<div class="last-value">
						<span class="muted">Onderdruk</span>
						<span class="big">{home.last.diastolic}</span>
						<CategoryBadge category={home.last.classification.diastolic} />
					</div>
				</div>
				<p class="muted unit">
					mmHg{home.last.dayPart === 'other' ? '' : ` · ${DAY_PART_LABEL[home.last.dayPart]}`}
				</p>
			</section>

			<section class="card week" aria-labelledby="week-title">
				<h2 id="week-title">Gemiddelde laatste 7 dagen</h2>
				{#if home.week.classification}
					<div class="week-average">
						<span class="average">{home.week.systolic} / {home.week.diastolic}</span>
						<span class="muted">mmHg</span>
					</div>
					<div class="badges">
						<CategoryBadge category={home.week.classification.systolic} prefix={SYSTOLIC} />
						<CategoryBadge category={home.week.classification.diastolic} prefix={DIASTOLIC} />
					</div>
					<p class="trend">
						{#if home.trend.kind === 'lower'}
							<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M6 13l6 6 6-6"></path></svg>
						{:else if home.trend.kind === 'higher'}
							<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6"></path></svg>
						{:else if home.trend.kind === 'same'}
							<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"></path></svg>
						{/if}
						<span>{trendText(home.trend)}</span>
					</p>
					<dl class="parts">
						<div>
							<dt class="muted">Ochtend</dt>
							<dd>{pair(home.morning)}</dd>
						</div>
						<div>
							<dt class="muted">Avond</dt>
							<dd>{pair(home.evening)}</dd>
						</div>
					</dl>
				{:else}
					<p class="muted">Geen metingen in de laatste 7 dagen.</p>
				{/if}
			</section>
		{:else if home}
			<section class="card welcome">
				<h2>Welkom bij Tensie</h2>
				<p>Nog geen metingen. Voeg je eerste meting toe of importeer je Excel-bestand.</p>
				<a href="/import">Importeren uit Excel</a>
			</section>
		{/if}

		<a href="/new" class="button-primary new">
			<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"></path></svg>
			Nieuwe meting
		</a>

		<p class="note">{MEDICAL_NOTE}</p>
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
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 20px 16px 8px;
	}

	.brand {
		font-size: 26px;
		font-weight: 700;
		letter-spacing: -0.3px;
		color: var(--accent);
	}

	.settings {
		width: var(--tap);
		height: var(--tap);
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 12px;
		color: var(--ink);
	}

	main {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: 8px 16px 16px;
	}

	.card {
		padding: 18px;
		border-radius: 18px;
	}

	.card-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 8px;
	}

	h2 {
		margin: 0;
		font-size: 17px;
	}

	.muted {
		color: var(--muted);
		font-size: 15px;
	}

	.last-values {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 12px;
		margin-top: 14px;
	}

	.last-value {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.big {
		font-size: 44px;
		font-weight: 700;
		line-height: 1;
	}

	.unit {
		margin: 12px 0 0;
	}

	.week {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.week p {
		margin: 0;
	}

	.week-average {
		display: flex;
		align-items: baseline;
		gap: 10px;
	}

	.average {
		font-size: 34px;
		font-weight: 700;
	}

	.badges {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.trend {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.trend svg {
		flex: none;
	}

	.parts {
		margin: 0;
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 10px;
		padding-top: 12px;
		border-top: 1px solid var(--line);
	}

	.parts dd {
		margin: 0;
		font-size: 20px;
		font-weight: 700;
	}

	.welcome {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.welcome p {
		margin: 0;
	}

	.welcome a {
		font-weight: 700;
	}

	.new {
		gap: 10px;
		font-size: 19px;
	}

	.note {
		margin: 0;
		font-size: 15px;
		line-height: 1.45;
		color: var(--muted);
	}
</style>
