/** A raw cell value as read from a spreadsheet or CSV. */
export type Cell = string | number | boolean | null;

const MINUTES_PER_DAY = 24 * 60;
// Tolerates floating-point noise in Excel time fractions; seconds are dropped, as everywhere else.
const MINUTE_EPSILON = 1e-6;

export function isEmptyCell(cell: Cell): boolean {
	return cell === null || (typeof cell === 'string' && cell.trim() === '');
}

/**
 * Reads a number cell, or a number stored as text with a decimal point or comma ("9.8", "9,8").
 * Returns null for anything else, including negative numbers.
 */
export function parseNumberCell(cell: Cell): number | null {
	if (typeof cell === 'number') return Number.isFinite(cell) && cell >= 0 ? cell : null;
	if (typeof cell !== 'string') return null;
	const text = cell.trim();
	if (!/^\d+([.,]\d+)?$/.test(text)) return null;
	return Number(text.replace(',', '.'));
}

function isoDate(year: number, month: number, day: number): string | null {
	const date = new Date(Date.UTC(year, month - 1, day));
	if (
		year < 1900 ||
		year > 9999 ||
		date.getUTCFullYear() !== year ||
		date.getUTCMonth() !== month - 1 ||
		date.getUTCDate() !== day
	)
		return null;
	return date.toISOString().slice(0, 10);
}

/** Local date and time; `minutes` is null when the cell holds a date only. */
export interface DateTimeParts {
	date: string;
	minutes: number | null;
}

/**
 * Converts an Excel date serial (days since the workbook epoch, time as the fraction) to
 * a local date and time. Serials are wall-clock values, so no time zone is involved.
 */
export function excelSerialToParts(serial: number, date1904 = false): DateTimeParts | null {
	if (!Number.isFinite(serial) || serial < 1) return null;
	const totalMinutes = Math.floor(serial * MINUTES_PER_DAY + MINUTE_EPSILON);
	const days = Math.floor(totalMinutes / MINUTES_PER_DAY);
	const minutes = totalMinutes - days * MINUTES_PER_DAY;
	// The 1900 system counts from 30 Dec 1899 (absorbing Excel's fictitious 29 Feb 1900).
	const epoch = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
	const date = new Date(epoch + days * MINUTES_PER_DAY * 60_000);
	const iso = isoDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
	return iso ? { date: iso, minutes } : null;
}

/** Parses "08:30", "8:30", "8u30", "8h30", "08.30" or "08:30:15" (seconds dropped). */
export function parseTimeText(text: string): number | null {
	const match = /^(\d{1,2})[:.uUhH](\d{2})(?::\d{2})?$/.exec(text.trim());
	if (!match) return null;
	const hours = Number(match[1]);
	const minutes = Number(match[2]);
	return hours < 24 && minutes < 60 ? hours * 60 + minutes : null;
}

/**
 * Reads a date cell: an Excel date serial (with or without a time fraction), a Belgian
 * dd/mm/yyyy date (also with - or . and two-digit years), or an ISO yyyy-mm-dd date,
 * each optionally followed by a time.
 */
export function parseDateCell(cell: Cell, date1904 = false): DateTimeParts | null {
	if (typeof cell === 'number') {
		const parts = excelSerialToParts(cell, date1904);
		if (!parts) return null;
		return { date: parts.date, minutes: Number.isInteger(cell) ? null : parts.minutes };
	}
	if (typeof cell !== 'string') return null;
	const text = cell.trim();

	let date: string | null = null;
	let rest: string | undefined;
	const belgian = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})(?:[ T]+(.+))?$/.exec(text);
	const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[ T]+(.+))?$/.exec(text);
	if (belgian) {
		const year = belgian[3].length === 2 ? 2000 + Number(belgian[3]) : Number(belgian[3]);
		date = isoDate(year, Number(belgian[2]), Number(belgian[1]));
		rest = belgian[4];
	} else if (iso) {
		date = isoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
		rest = iso[4];
	}
	if (!date) return null;
	if (rest === undefined) return { date, minutes: null };
	const minutes = parseTimeText(rest);
	return minutes === null ? null : { date, minutes };
}

/** Reads a time cell: an Excel time fraction (below 1) or time text. */
export function parseTimeCell(cell: Cell): number | null {
	if (typeof cell === 'number') {
		if (!(cell >= 0 && cell < 1)) return null;
		const minutes = Math.floor(cell * MINUTES_PER_DAY + MINUTE_EPSILON);
		return minutes < MINUTES_PER_DAY ? minutes : null;
	}
	return typeof cell === 'string' ? parseTimeText(cell) : null;
}
