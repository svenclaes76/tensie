<script lang="ts">
	import type { SheetData } from '#lib/domain/import/spreadsheet.js';
	import { formatDecimal } from '#lib/format.js';
	import { columnOptions, toMapping, type MappingDraft } from '#lib/import/mapping.js';

	let {
		sheet,
		sheetNames,
		draft = $bindable(),
		detected,
		cmExample,
		onsheetchange
	}: {
		sheet: SheetData;
		sheetNames: string[];
		draft: MappingDraft;
		/** Whether the columns were recognised automatically. */
		detected: boolean;
		/** A converted reading to explain the cmHg conversion, when the file uses cmHg. */
		cmExample: { systolic: number; diastolic: number } | null;
		onsheetchange: (name: string) => void;
	} = $props();

	const fields = [
		{ key: 'date', label: 'Datum', required: true },
		{ key: 'time', label: 'Tijd', required: false },
		{ key: 'systolic', label: 'Bovendruk', required: true },
		{ key: 'diastolic', label: 'Onderdruk', required: true },
		{ key: 'note', label: 'Notitie', required: false }
	] as const;

	const options = $derived(columnOptions(sheet.rows, draft.headerRow));
	const headerRows = $derived(Array.from({ length: Math.min(20, sheet.rows.length) }, (_, i) => i));
	const complete = $derived(toMapping(draft) !== null);
	const hint = $derived(
		[
			cmExample &&
				`Waarden in cmHg herkend (${formatDecimal(cmExample.systolic / 10)} / ${formatDecimal(cmExample.diastolic / 10)}) en omgezet naar mmHg (${cmExample.systolic} / ${cmExample.diastolic}).`,
			draft.time === null && 'Zonder tijdkolom moet de datumkolom ook de tijd bevatten.',
			'Andere kolommen en bladen worden niet ingelezen.'
		]
			.filter(Boolean)
			.join(' ')
	);
</script>

<section class="card" aria-labelledby="mapping-title">
	<h2 id="mapping-title">Welke kolom is wat?</h2>

	{#if !detected}
		<p class="notice">De kolommen zijn niet herkend. Kies hieronder welke kolom wat bevat.</p>
	{/if}

	{#if sheetNames.length > 1}
		<div class="field">
			<label for="map-sheet">Blad</label>
			<select
				id="map-sheet"
				value={sheet.name}
				onchange={(e) => onsheetchange(e.currentTarget.value)}
			>
				{#each sheetNames as name (name)}
					<option value={name}>{name}</option>
				{/each}
			</select>
		</div>
	{/if}

	<div class="field">
		<label for="map-header">Titels op</label>
		<select id="map-header" bind:value={draft.headerRow}>
			{#each headerRows as row (row)}
				<option value={row}>rij {row + 1}</option>
			{/each}
		</select>
	</div>

	{#each fields as field (field.key)}
		<div class="field">
			<label for="map-{field.key}">{field.label}</label>
			<select id="map-{field.key}" bind:value={draft[field.key]}>
				<option value={null}>{field.required ? 'Kies een kolom' : 'Geen'}</option>
				{#each options as option (option.index)}
					<option value={option.index}>{option.label}</option>
				{/each}
			</select>
		</div>
	{/each}

	{#if !complete}
		<p class="notice" role="status">
			Kies een kolom voor datum, bovendruk en onderdruk, elk een andere kolom.
		</p>
	{/if}

	<p class="hint">{hint}</p>
</section>

<style>
	section {
		display: flex;
		flex-direction: column;
		gap: 10px;
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

	select {
		width: 100%;
		height: var(--tap);
		border-radius: 12px;
		border: 1px solid var(--field-line);
		background: var(--card);
		padding: 0 10px;
	}

	.hint {
		margin: 0;
		font-size: 14px;
		color: var(--muted);
	}

	.notice {
		margin: 0;
		padding: 8px 12px;
		border-radius: 10px;
		background: var(--warn-bg);
		color: var(--warn-ink);
		font-size: 15px;
	}
</style>
