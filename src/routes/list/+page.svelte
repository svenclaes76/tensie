<script lang="ts">
	import { goto } from '$app/navigation';
	import { liveQuery } from 'dexie';
	import { onMount } from 'svelte';
	import BottomNav from '#lib/components/BottomNav.svelte';
	import UndoDelete from '#lib/components/UndoDelete.svelte';
	import { db, type Reading } from '#lib/data/db.js';
	import { getSettings } from '#lib/data/settings.js';
	import { DEFAULT_DAY_PART_WINDOWS } from '#lib/domain/dayPart.js';
	import { DEFAULT_THRESHOLDS } from '#lib/domain/thresholds.js';
	import { buildList, type ListFilter } from '#lib/list.js';
	import { CATEGORY_CODE, CATEGORY_LABEL } from '#lib/texts.js';

	const FILTERS: { value: ListFilter; label: string }[] = [
		{ value: 'all', label: 'Alles' },
		{ value: 'morning', label: 'Ochtend' },
		{ value: 'evening', label: 'Avond' }
	];

	let readings = $state.raw<Reading[] | null>(null);
	let thresholds = $state.raw(DEFAULT_THRESHOLDS);
	let windows = $state.raw(DEFAULT_DAY_PART_WINDOWS);
	let filter = $state<ListFilter>('all');

	const groups = $derived(readings ? buildList(readings, { filter, thresholds, windows }) : []);

	onMount(() => {
		getSettings(db).then((settings) => {
			thresholds = settings.thresholds;
			windows = settings.dayPartWindows;
		});
		// Live: the table follows saves, imports and undos, also from other tabs.
		const subscription = liveQuery(() => db.readings.toArray()).subscribe({
			next: (all) => (readings = all),
			error: () => (readings = [])
		});
		return () => subscription.unsubscribe();
	});
</script>

<svelte:head>
	<title>Metingen · Tensie</title>
</svelte:head>

<div class="screen">
	<header>
		<h1>Metingen</h1>
		<a href="/import" class="import">
			<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M4 19h16"></path></svg>
			Importeren
		</a>
	</header>

	<div class="controls">
		<div class="filter" role="group" aria-label="Dagdeel">
			{#each FILTERS as option (option.value)}
				<button
					type="button"
					aria-pressed={filter === option.value}
					onclick={() => (filter = option.value)}
				>
					{option.label}
				</button>
			{/each}
		</div>
		<ul class="legend" aria-label="Legende">
			<li><span class="swatch normal" aria-hidden="true"></span>Normaal</li>
			<li><span class="swatch mild" aria-hidden="true"></span>L = licht</li>
			<li><span class="swatch moderate" aria-hidden="true"></span>G = gemiddeld</li>
			<li><span class="swatch severe" aria-hidden="true"></span>E = ernstig</li>
		</ul>
	</div>

	<main>
		{#if readings === null}
			<p class="empty">Metingen laden…</p>
		{:else if groups.length === 0}
			<div class="empty">
				{#if readings.some((r) => !r.deleted)}
					<p>Geen metingen in dit dagdeel.</p>
				{:else}
					<p>Nog geen metingen.</p>
					<p><a href="/new">Nieuwe meting</a> · <a href="/import">Importeren</a></p>
				{/if}
			</div>
		{:else}
			<table aria-label="Alle metingen">
				<colgroup>
					<col class="col-date" />
					<col class="col-time" />
					<col />
					<col />
					<col class="col-note" />
				</colgroup>
				<thead>
					<tr>
						<th scope="col">Datum</th>
						<th scope="col">Uur</th>
						<th scope="col" class="num">Boven</th>
						<th scope="col" class="num">Onder</th>
						<th scope="col"><span class="visually-hidden">Notitie</span></th>
					</tr>
				</thead>
				{#each groups as group (group.month)}
					<tbody>
						<tr class="month">
							<th scope="rowgroup" colspan="2">{group.label}</th>
							<td colspan="3" class="month-summary">
								{#if group.summary.count > 0}
									gem. <strong>{group.summary.systolic}/{group.summary.diastolic}</strong> · {group.summary.count}×
								{/if}
							</td>
						</tr>
						{#each group.rows as row (row.id)}
							<!-- The whole row opens the reading; the link in the time cell is the keyboard route. -->
							<tr class="reading" onclick={() => goto(`/reading/${row.id}`)}>
								<td class="day">{row.dayLabel ?? ''}</td>
								<td class="time">
									<a href="/reading/{row.id}" aria-label="Meting van {row.day} {row.time} bewerken">{row.time}</a>
								</td>
								<td class="num">
									<span class="value {row.systolicCategory}">
										{row.systolic}<span class="code" aria-hidden="true">{CATEGORY_CODE[row.systolicCategory]}</span><span class="visually-hidden">, {CATEGORY_LABEL[row.systolicCategory].toLowerCase()}</span>
									</span>
								</td>
								<td class="num">
									<span class="value {row.diastolicCategory}">
										{row.diastolic}<span class="code" aria-hidden="true">{CATEGORY_CODE[row.diastolicCategory]}</span><span class="visually-hidden">, {CATEGORY_LABEL[row.diastolicCategory].toLowerCase()}</span>
									</span>
								</td>
								<td class="note">
									{#if row.hasNote}
										<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Heeft notitie"><path d="M4 4h16v12H8l-4 4z"></path></svg>
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				{/each}
			</table>
		{/if}
	</main>

	<UndoDelete />
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

	h1 {
		margin: 0;
		font-size: 26px;
	}

	.import {
		min-height: var(--tap);
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 0 4px;
		font-weight: 700;
		text-decoration: none;
	}

	.controls {
		padding: 0 16px 10px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.filter {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 4px;
		padding: 4px;
		border-radius: 12px;
		background: #e7ebe8;
	}

	.filter button {
		min-height: var(--tap);
		border: 0;
		border-radius: 9px;
		background: transparent;
		color: var(--muted);
		font-size: 16px;
		font-weight: 700;
		cursor: pointer;
	}

	.filter button[aria-pressed='true'] {
		background: var(--card);
		color: var(--ink);
	}

	.legend {
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-wrap: wrap;
		gap: 6px 12px;
		font-size: 14px;
		color: var(--muted);
	}

	.legend li {
		display: flex;
		align-items: center;
		gap: 5px;
	}

	.swatch {
		width: 12px;
		height: 12px;
		border-radius: 3px;
	}

	.swatch.normal {
		background: var(--card);
		border: 1px solid var(--field-line);
	}

	main {
		flex: 1;
		min-height: 0;
		margin: 0 12px 12px;
		overflow: auto;
		background: var(--card);
		border: 1px solid var(--line);
		border-radius: var(--radius);
	}

	.empty {
		margin: 0;
		padding: 24px 16px;
		color: var(--muted);
		text-align: center;
	}

	.empty p {
		margin: 0 0 8px;
	}

	table {
		width: 100%;
		border-collapse: separate;
		border-spacing: 0;
		table-layout: fixed;
		font-variant-numeric: tabular-nums;
	}

	.col-date {
		width: 92px;
	}

	.col-time {
		width: 56px;
	}

	.col-note {
		width: 36px;
	}

	thead th {
		position: sticky;
		top: 0;
		z-index: 1;
		height: 40px;
		background: var(--card);
		border-bottom: 2px solid var(--step-off);
		font-size: 14px;
		color: var(--muted);
		text-align: left;
	}

	thead th:first-child {
		padding-left: 12px;
	}

	.num {
		text-align: right;
	}

	thead th.num {
		padding-right: 14px;
		text-align: right;
	}

	.month th,
	.month td {
		height: 38px;
		background: #f1f4f2;
		border-bottom: 1px solid var(--line);
		font-size: 15px;
	}

	.month th {
		padding-left: 12px;
		text-align: left;
	}

	.month-summary {
		padding-right: 12px;
		text-align: right;
		color: var(--muted);
	}

	.month-summary strong {
		color: var(--ink);
	}

	.reading {
		cursor: pointer;
	}

	.reading:hover td {
		background-color: #f7f9f8;
	}

	/* 44 px rows: the whole row is a tap target (N3). */
	.reading td {
		height: 44px;
		border-bottom: 1px solid #eef0ee;
	}

	.day {
		padding-left: 12px;
		font-weight: 700;
		white-space: nowrap;
	}

	.time a {
		color: var(--muted);
		text-decoration: none;
	}

	.value {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 3px;
		height: 34px;
		margin: 3px 4px;
		padding-right: 8px;
		border-radius: 8px;
		font-weight: 700;
	}

	.code {
		width: 10px;
		font-size: 12px;
	}

	.note {
		text-align: center;
		color: var(--muted);
	}

	.mild {
		background: #fbefd2;
		color: #6b4700;
	}

	.moderate {
		background: #fbe1d3;
		color: #8a2e0b;
	}

	.severe {
		background: #9f1239;
		color: #ffffff;
	}
</style>
