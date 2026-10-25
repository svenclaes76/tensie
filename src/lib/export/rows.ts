import { toLocal } from '../domain/dayPart';
import { formatDate, formatTime } from '../format';

/** The fields an export needs from a stored reading. */
export interface ExportReading {
	measuredAt: string;
	timeZone: string;
	systolic: number;
	diastolic: number;
	arm?: 'left' | 'right';
	note?: string;
	deleted?: boolean;
}

/**
 * E2 columns. The importer recognises Datum, Uur, Boven, Onder and Notitie by name, so an export
 * reads straight back in; Arm is extra information the importer leaves aside.
 */
export const EXPORT_HEADERS = ['Datum', 'Uur', 'Boven', 'Onder', 'Notitie', 'Arm'] as const;

const ARM_LABEL = { left: 'links', right: 'rechts' } as const;

export interface ExportRow {
	/** "YYYY-MM-DD", local to the reading. */
	isoDate: string;
	/** Minutes since local midnight. */
	minutes: number;
	systolic: number;
	diastolic: number;
	note: string;
	arm: string;
}

/** Live readings, oldest first like the owner's own spreadsheet, in their own local time. */
export function exportRows(readings: readonly ExportReading[]): ExportRow[] {
	return readings
		.filter((r) => !r.deleted)
		.sort((a, b) => a.measuredAt.localeCompare(b.measuredAt))
		.map((r) => {
			const local = toLocal(r.measuredAt, r.timeZone);
			return {
				isoDate: local.date,
				minutes: local.minutes,
				systolic: r.systolic,
				diastolic: r.diastolic,
				note: r.note?.trim() ?? '',
				arm: r.arm ? ARM_LABEL[r.arm] : ''
			};
		});
}

function csvField(value: string | number): string {
	const text = String(value);
	return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * CSV as Belgian Excel expects it: semicolons, dd/mm/yyyy, 24-hour times, a byte-order mark so
 * accents survive, and CRLF line ends.
 */
export function buildCsv(readings: readonly ExportReading[]): string {
	const lines = [
		EXPORT_HEADERS.join(';'),
		...exportRows(readings).map((row) =>
			[
				formatDate(row.isoDate),
				formatTime(row.minutes),
				row.systolic,
				row.diastolic,
				row.note,
				row.arm
			]
				.map(csvField)
				.join(';')
		)
	];
	return `﻿${lines.join('\r\n')}\r\n`;
}
