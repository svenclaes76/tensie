<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import ColumnMapping from '#lib/components/import/ColumnMapping.svelte';
	import ImportCheck from '#lib/components/import/ImportCheck.svelte';
	import ImportHistory from '#lib/components/import/ImportHistory.svelte';
	import StepBar from '#lib/components/import/StepBar.svelte';
	import UndoImport from '#lib/components/import/UndoImport.svelte';
	import { db, type ImportRecord, type Reading } from '#lib/data/db.js';
	import { listImports, saveImport, undoImport, type SaveImportResult } from '#lib/data/imports.js';
	import { deviceTimeZone, getSettings } from '#lib/data/settings.js';
	import { detectColumns } from '#lib/domain/import/columns.js';
	import { parseRows } from '#lib/domain/import/parse.js';
	import type { SheetData } from '#lib/domain/import/spreadsheet.js';
	import { countReadings } from '#lib/format.js';
	import { emptyDraft, toMapping, type MappingDraft } from '#lib/import/mapping.js';

	// The file's times are read in the home time zone from settings (the device's until set).
	let timeZone = $state(deviceTimeZone());

	let fileInput = $state<HTMLInputElement>();
	let resultHeading = $state<HTMLHeadingElement>();

	let fileName = $state<string | null>(null);
	let sheets = $state.raw<SheetData[]>([]);
	let sheetName = $state('');
	let draft = $state<MappingDraft>(emptyDraft([]));
	let detected = $state(true);
	let existing = $state.raw<Reading[]>([]);
	let loadedAt = $state.raw(new Date());
	const confirmed = new SvelteSet<number>();

	let reading = $state(false);
	let saving = $state(false);
	let error = $state<string | null>(null);
	let result = $state.raw<(SaveImportResult & { fileName: string }) | null>(null);
	let history = $state.raw<ImportRecord[]>([]);

	const sheet = $derived(sheets.find((s) => s.name === sheetName));
	const mapping = $derived(toMapping(draft));
	const preview = $derived(
		sheet && mapping
			? parseRows(sheet.rows, mapping, {
					timeZone,
					now: loadedAt,
					existing,
					date1904: sheet.date1904
				})
			: null
	);
	const confirmedCount = $derived(
		preview
			? preview.rows.filter((r) => r.status === 'needs-confirmation' && confirmed.has(r.rowNumber))
					.length
			: 0
	);
	const toImport = $derived(preview ? preview.counts.ready + confirmedCount : 0);
	const cmExample = $derived.by(() => {
		const row = preview?.rows.find((r) => r.status !== 'rejected' && r.unit === 'cmHg');
		return row && row.status !== 'rejected' ? row.reading : null;
	});
	const fileMeta = $derived(
		[
			sheet?.name,
			`titels op rij ${draft.headerRow + 1}`,
			preview ? countReadings(preview.rows.length) : null
		]
			.filter(Boolean)
			.join(' · ')
	);
	const step = $derived<1 | 2 | 3 | 4>(result ? 4 : !fileName ? 1 : !mapping ? 2 : 3);
	const resultRecord = $derived(
		result?.importId ? history.find((h) => h.id === result?.importId) : undefined
	);

	onMount(async () => {
		timeZone = (await getSettings(db)).timeZone;
		history = await listImports(db);
	});

	function chooseSheet(name: string) {
		const chosen = sheets.find((s) => s.name === name);
		if (!chosen) return;
		sheetName = name;
		const found = detectColumns(chosen.rows);
		detected = found !== null;
		draft = found ?? emptyDraft(chosen.rows);
		confirmed.clear();
	}

	async function onFileChosen(event: Event & { currentTarget: HTMLInputElement }) {
		const input = event.currentTarget;
		const file = input.files?.[0];
		input.value = ''; // so choosing the same file again still fires
		if (!file) return;
		reading = true;
		error = null;
		try {
			// SheetJS is large: load it only when a file is chosen.
			const { readSpreadsheet } = await import('#lib/domain/import/spreadsheet.js');
			const read = readSpreadsheet(await file.arrayBuffer());
			if (read.length === 0) throw new Error('No sheets');
			existing = await db.readings.toArray();
			loadedAt = new Date();
			sheets = read;
			fileName = file.name;
			result = null;
			chooseSheet((read.find((s) => detectColumns(s.rows)) ?? read[0]).name);
		} catch {
			error = 'Dit bestand kan niet gelezen worden. Kies een Excel- (.xlsx) of CSV-bestand.';
		} finally {
			reading = false;
		}
	}

	async function save() {
		if (!preview || !fileName) return;
		saving = true;
		error = null;
		try {
			const saved = await saveImport(db, preview, { fileName, confirmedRows: confirmed });
			result = { ...saved, fileName };
			fileName = null;
			sheets = [];
			confirmed.clear();
			history = await listImports(db);
			await tick();
			resultHeading?.focus();
		} catch {
			error = 'Importeren is mislukt. Er is niets opgeslagen; probeer het opnieuw.';
		} finally {
			saving = false;
		}
	}

	async function undo(importId: string) {
		await undoImport(db, importId);
		history = await listImports(db);
	}
</script>

<svelte:head>
	<title>Importeren · Tensie</title>
</svelte:head>

<div class="screen">
	<header>
		<a href="/list" class="back" aria-label="Terug">
			<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"></path></svg>
		</a>
		<h1>Importeren</h1>
	</header>

	<main>
		<StepBar current={step} />

		<input
			bind:this={fileInput}
			type="file"
			accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
			hidden
			onchange={onFileChosen}
		/>

		{#if error}
			<p class="error" role="alert">{error}</p>
		{/if}

		{#if result}
			<section class="card result" aria-labelledby="result-title">
				<h2 id="result-title" tabindex="-1" bind:this={resultHeading}>
					{#if result.saved === 0}
						Er is niets geïmporteerd
					{:else if resultRecord?.undoneAt}
						Import ongedaan gemaakt
					{:else}
						{countReadings(result.saved)} geïmporteerd
					{/if}
				</h2>
				<p>
					Uit {result.fileName}.
					{#if result.skippedDuplicates.length > 0}
						{countReadings(result.skippedDuplicates.length)} waren intussen al aanwezig en zijn overgeslagen.
					{/if}
					{#if result.unconfirmed.length > 0}
						{result.unconfirmed.length} te controleren {result.unconfirmed.length === 1 ? 'rij is' : 'rijen zijn'} niet geïmporteerd.
					{/if}
				</p>
				{#if result.importId && resultRecord && !resultRecord.undoneAt}
					<UndoImport count={result.saved} onconfirm={() => undo(result!.importId!)} />
				{/if}
			</section>
		{/if}

		{#if fileName && sheet}
			<div class="card file">
				<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h8l4 4v14H6z"></path><path d="M14 3v4h4M9 12l4 5M13 12l-4 5"></path></svg>
				<div class="file-text">
					<div class="file-name">{fileName}</div>
					<div class="file-meta">{fileMeta}</div>
				</div>
				<button type="button" class="button-text" onclick={() => fileInput?.click()}>
					Ander<span class="visually-hidden"> bestand kiezen</span>
				</button>
			</div>

			<ColumnMapping
				{sheet}
				sheetNames={sheets.map((s) => s.name)}
				bind:draft
				{detected}
				{cmExample}
				onsheetchange={chooseSheet}
			/>

			{#if preview}
				<ImportCheck {preview} {confirmed} />
			{/if}

			<button type="button" class="button-primary" disabled={!preview || toImport === 0 || saving} onclick={save}>
				{#if saving}
					Bezig met importeren…
				{:else if !preview || toImport === 0}
					Niets om te importeren
				{:else}
					{countReadings(toImport)} importeren
				{/if}
			</button>
		{:else}
			<section class="card intro">
				<p>
					Kies een Excel- of CSV-bestand met je metingen. Je ziet eerst wat er ingelezen wordt; er
					wordt niets opgeslagen voor je bevestigt.
				</p>
				<button type="button" class="button-primary" disabled={reading} onclick={() => fileInput?.click()}>
					{reading ? 'Bestand lezen…' : result ? 'Nog een bestand kiezen' : 'Kies een bestand'}
				</button>
			</section>
		{/if}

		{#if history.length > 0}
			<ImportHistory imports={history} {timeZone} onundo={undo} />
		{/if}
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
		color: var(--accent);
	}

	h1 {
		margin: 0;
		font-size: 22px;
	}

	main {
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: 4px 16px 24px;
	}

	.file {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.file svg {
		flex: none;
	}

	.file-text {
		flex: 1;
		min-width: 0;
	}

	.file-name {
		font-weight: 700;
		overflow-wrap: anywhere;
	}

	.file-meta {
		font-size: 15px;
		color: var(--muted);
	}

	.intro,
	.result {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.intro p,
	.result p {
		margin: 0;
	}

	.result h2 {
		margin: 0;
		font-size: 19px;
	}

	.error {
		margin: 0;
		padding: 10px 14px;
		border-radius: 12px;
		background: var(--error-bg);
		color: var(--error-ink);
	}
</style>
