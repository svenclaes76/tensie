import type { Cell } from './cells';

/** Zero-based column indexes; `time` is null when the date column also holds the time. */
export interface ColumnMapping {
	/** Zero-based index of the header row; data starts on the next row. */
	headerRow: number;
	date: number;
	time: number | null;
	systolic: number;
	diastolic: number;
	note: number | null;
}

const HEADER_ALIASES = {
	date: ['datum', 'date', 'dag'],
	time: ['uur', 'tijd', 'tijdstip', 'time'],
	systolic: ['boven', 'bovendruk', 'systolisch', 'systole', 'systolic', 'sys'],
	diastolic: ['onder', 'onderdruk', 'diastolisch', 'diastole', 'diastolic', 'dia'],
	note: ['notitie', 'notities', 'opmerking', 'opmerkingen', 'commentaar', 'note', 'notes']
} as const;

type Field = keyof typeof HEADER_ALIASES;

/** "Boven (mmHg)" → "boven". */
function normalizeHeader(cell: Cell): string {
	return typeof cell === 'string'
		? cell
				.toLowerCase()
				.replace(/\(.*?\)/g, '')
				.replace(/[^a-z]/g, '')
		: '';
}

/**
 * Finds the header row and columns by their names (Dutch or English). The note column is the
 * one named as such or, failing that, an untitled column right after the mapped columns
 * (as in Bloeddruk.xlsx). Returns null when date, systolic and diastolic are not all found.
 */
export function detectColumns(rows: readonly Cell[][], maxHeaderRows = 20): ColumnMapping | null {
	for (let r = 0; r < Math.min(rows.length, maxHeaderRows); r++) {
		const found: Partial<Record<Field, number>> = {};
		rows[r].forEach((cell, c) => {
			const header = normalizeHeader(cell);
			for (const field of Object.keys(HEADER_ALIASES) as Field[]) {
				if (found[field] === undefined && (HEADER_ALIASES[field] as readonly string[]).includes(header))
					found[field] = c;
			}
		});
		if (found.date === undefined || found.systolic === undefined || found.diastolic === undefined)
			continue;

		let note = found.note ?? null;
		if (note === null) {
			const next =
				Math.max(found.date, found.time ?? -1, found.systolic, found.diastolic) + 1;
			const header = rows[r][next];
			if (header === undefined || header === null || String(header).trim() === '') note = next;
		}
		return {
			headerRow: r,
			date: found.date,
			time: found.time ?? null,
			systolic: found.systolic,
			diastolic: found.diastolic,
			note
		};
	}
	return null;
}
