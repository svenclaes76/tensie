import { toLocal } from '../dayPart';
import type { ReadingLike } from '../types';
import { checkValues, type ValueWarning } from '../validation';
import { fromLocal } from '../zonedTime';
import {
	type Cell,
	isEmptyCell,
	parseDateCell,
	parseNumberCell,
	parseTimeCell
} from './cells';
import type { ColumnMapping } from './columns';

/** Values below this are taken as cmHg (e.g. 9.8 / 16.0) and multiplied by 10. */
export const CMHG_BELOW = 30;

export type Unit = 'mmHg' | 'cmHg';

export type RejectReason =
	| 'missing-date'
	| 'invalid-date'
	| 'missing-time'
	| 'invalid-time'
	| 'missing-value'
	| 'invalid-value'
	| 'unclear-unit';

export type ImportFlag = 'out-of-sequence' | 'future' | ValueWarning;

export interface ReadingDraft {
	measuredAt: string;
	timeZone: string;
	/** mmHg, integer. */
	systolic: number;
	/** mmHg, integer. */
	diastolic: number;
	note?: string;
}

export type RowStatus = 'ready' | 'needs-confirmation' | 'duplicate' | 'rejected';

export type ParsedRow =
	| { rowNumber: number; status: 'rejected'; reason: RejectReason }
	| {
			/** 1-based spreadsheet row number, as shown in Excel. */
			rowNumber: number;
			status: 'ready' | 'needs-confirmation' | 'duplicate';
			reading: ReadingDraft;
			unit: Unit;
			/** Why the row needs confirmation; empty for ready rows and duplicates. */
			flags: ImportFlag[];
	  };

export interface ImportOptions {
	/** Time zone the spreadsheet's dates and times are in (from settings). */
	timeZone: string;
	/** Rows after this instant are flagged as future. */
	now: Date;
	/** Readings already stored; rows with the same local date and time are duplicates. */
	existing?: readonly ReadingLike[];
	/** 'auto' decides per row: both values below 30 → cmHg, both 30 or more → mmHg. */
	unit?: Unit | 'auto';
	/** Workbook uses the 1904 date system (old Mac Excel files). */
	date1904?: boolean;
}

export interface ImportPreview {
	rows: ParsedRow[];
	counts: Record<RowStatus, number>;
}

interface Candidate {
	rowNumber: number;
	date: string;
	reading: ReadingDraft;
	unit: Unit;
	warnings: ValueWarning[];
}

function duplicateKey(date: string, minutes: number): string {
	return `${date} ${minutes}`;
}

function parseValue(cell: Cell): number | RejectReason {
	if (isEmptyCell(cell)) return 'missing-value';
	return parseNumberCell(cell) ?? 'invalid-value';
}

function resolveUnit(systolic: number, diastolic: number, unit: Unit | 'auto'): Unit | null {
	if (unit !== 'auto') return unit;
	const systolicCm = systolic < CMHG_BELOW;
	const diastolicCm = diastolic < CMHG_BELOW;
	if (systolicCm !== diastolicCm) return null;
	return systolicCm ? 'cmHg' : 'mmHg';
}

function parseRow(
	row: readonly Cell[],
	rowNumber: number,
	mapping: ColumnMapping,
	options: ImportOptions
): Candidate | { rowNumber: number; status: 'rejected'; reason: RejectReason } {
	const reject = (reason: RejectReason) => ({ rowNumber, status: 'rejected' as const, reason });
	const cell = (index: number | null): Cell => (index === null ? null : (row[index] ?? null));

	const dateCell = cell(mapping.date);
	if (isEmptyCell(dateCell)) return reject('missing-date');
	const parts = parseDateCell(dateCell, options.date1904);
	if (!parts) return reject('invalid-date');

	let minutes = parts.minutes;
	if (mapping.time !== null) {
		const timeCell = cell(mapping.time);
		if (isEmptyCell(timeCell)) return reject('missing-time');
		minutes = parseTimeCell(timeCell);
		if (minutes === null) return reject('invalid-time');
	} else if (minutes === null) {
		// A whole-number Excel date in a combined column is midnight; a text date needs a time.
		if (typeof dateCell !== 'number') return reject('missing-time');
		minutes = 0;
	}

	const systolicRaw = parseValue(cell(mapping.systolic));
	if (typeof systolicRaw === 'string') return reject(systolicRaw);
	const diastolicRaw = parseValue(cell(mapping.diastolic));
	if (typeof diastolicRaw === 'string') return reject(diastolicRaw);

	const unit = resolveUnit(systolicRaw, diastolicRaw, options.unit ?? 'auto');
	if (!unit) return reject('unclear-unit');
	const factor = unit === 'cmHg' ? 10 : 1;
	const systolic = Math.round(systolicRaw * factor);
	const diastolic = Math.round(diastolicRaw * factor);

	const noteCell = cell(mapping.note);
	const note = isEmptyCell(noteCell) ? undefined : String(noteCell).trim();

	return {
		rowNumber,
		date: parts.date,
		unit,
		warnings: checkValues({ systolic, diastolic }),
		reading: {
			measuredAt: fromLocal(parts.date, minutes, options.timeZone),
			timeZone: options.timeZone,
			systolic,
			diastolic,
			...(note === undefined ? {} : { note })
		}
	};
}

/**
 * Turns spreadsheet rows into an import preview (C9). Nothing is saved: rows that are ready can
 * be imported as is, rows that need confirmation are shown with their flags, duplicates are
 * skipped and rejected rows are listed with the reason.
 */
export function parseRows(
	rows: readonly Cell[][],
	mapping: ColumnMapping,
	options: ImportOptions
): ImportPreview {
	const existingKeys = new Set(
		(options.existing ?? [])
			.filter((r) => !r.deleted)
			.map((r) => {
				const local = toLocal(r.measuredAt, r.timeZone);
				return duplicateKey(local.date, local.minutes);
			})
	);
	const seenKeys = new Set<string>();
	// Rows in sheet order; candidates are resolved once the sequence check below has run.
	const ordered: (ParsedRow | Candidate)[] = [];
	const candidates: Candidate[] = [];

	for (let r = mapping.headerRow + 1; r < rows.length; r++) {
		const row = rows[r] ?? [];
		const used = [mapping.date, mapping.time, mapping.systolic, mapping.diastolic];
		if (used.every((index) => index === null || isEmptyCell(row[index] ?? null))) continue;

		const parsed = parseRow(row, r + 1, mapping, options);
		if ('status' in parsed) {
			ordered.push(parsed);
			continue;
		}
		const local = toLocal(parsed.reading.measuredAt, options.timeZone);
		const key = duplicateKey(local.date, local.minutes);
		if (existingKeys.has(key) || seenKeys.has(key)) {
			ordered.push({
				rowNumber: parsed.rowNumber,
				status: 'duplicate',
				reading: parsed.reading,
				unit: parsed.unit,
				flags: []
			});
			continue;
		}
		seenKeys.add(key);
		candidates.push(parsed);
		ordered.push(parsed);
	}

	// Most files run oldest first; a file that mostly runs newest first is checked the other way.
	let rising = 0;
	let falling = 0;
	for (let i = 1; i < candidates.length; i++) {
		if (candidates[i].date > candidates[i - 1].date) rising++;
		else if (candidates[i].date < candidates[i - 1].date) falling++;
	}
	const newestFirst = falling > rising;

	// A date is out of sequence when it goes back past the latest accepted date so far.
	// Flagged rows do not move that bound, so one wrong date flags only its own row.
	const nowMs = options.now.getTime();
	let bound: string | null = null;
	const resolved = new Map<Candidate, ParsedRow>();
	for (const candidate of candidates) {
		const flags: ImportFlag[] = [...candidate.warnings];
		if (new Date(candidate.reading.measuredAt).getTime() > nowMs) flags.push('future');
		else if (bound !== null && (newestFirst ? candidate.date > bound : candidate.date < bound))
			flags.push('out-of-sequence');
		else bound = candidate.date;
		resolved.set(candidate, {
			rowNumber: candidate.rowNumber,
			status: flags.length > 0 ? 'needs-confirmation' : 'ready',
			reading: candidate.reading,
			unit: candidate.unit,
			flags
		});
	}

	const rowsOut = ordered.map((row) => ('warnings' in row ? resolved.get(row)! : row));
	const counts: Record<RowStatus, number> = {
		ready: 0,
		'needs-confirmation': 0,
		duplicate: 0,
		rejected: 0
	};
	for (const row of rowsOut) counts[row.status]++;
	return { rows: rowsOut, counts };
}
