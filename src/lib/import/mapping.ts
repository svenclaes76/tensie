import { type Cell, isEmptyCell } from '#lib/domain/import/cells.js';
import type { ColumnMapping } from '#lib/domain/import/columns.js';
import { columnLetter } from '#lib/format.js';

/** The column choices on screen; null means "not chosen" (or "none" for time and note). */
export interface MappingDraft {
	headerRow: number;
	date: number | null;
	time: number | null;
	systolic: number | null;
	diastolic: number | null;
	note: number | null;
}

export interface ColumnOption {
	index: number;
	label: string;
}

/** A draft for a sheet whose headers were not recognised: titles on the first filled row. */
export function emptyDraft(rows: readonly Cell[][]): MappingDraft {
	const first = rows.findIndex((row) => row.some((cell) => !isEmptyCell(cell)));
	return {
		headerRow: Math.max(first, 0),
		date: null,
		time: null,
		systolic: null,
		diastolic: null,
		note: null
	};
}

/**
 * The mapping to parse with, or null while date, systolic or diastolic is missing or two
 * fields share a column.
 */
export function toMapping(draft: MappingDraft): ColumnMapping | null {
	const { date, systolic, diastolic, time, note } = draft;
	if (date === null || systolic === null || diastolic === null) return null;
	const used = [date, systolic, diastolic, time, note].filter((c) => c !== null);
	if (new Set(used).size !== used.length) return null;
	return { headerRow: draft.headerRow, date, time, systolic, diastolic, note };
}

/** Columns that hold anything, labelled like "C · Datum" or "G · (zonder titel)". */
export function columnOptions(rows: readonly Cell[][], headerRow: number): ColumnOption[] {
	const width = Math.max(0, ...rows.map((row) => row.length));
	const options: ColumnOption[] = [];
	for (let c = 0; c < width; c++) {
		if (!rows.some((row) => !isEmptyCell(row[c] ?? null))) continue;
		const header = rows[headerRow]?.[c] ?? null;
		const title = isEmptyCell(header) ? '(zonder titel)' : String(header).trim();
		options.push({ index: c, label: `${columnLetter(c)} · ${title}` });
	}
	return options;
}
