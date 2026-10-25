import { summarize, type Summary } from './domain/averages';
import { classifyValue } from './domain/classification';
import { getDayPart, toLocal } from './domain/dayPart';
import type { Category, DayPartWindows, ReadingLike, Thresholds } from './domain/types';
import { formatMonth, formatShortDay, formatTime } from './format';

/** H1 filter: every reading, or only morning or evening ones. */
export type ListFilter = 'all' | 'morning' | 'evening';

export interface ListReading extends ReadingLike {
	id: string;
	note?: string;
}

export interface ReadingRow {
	id: string;
	/** "zo 25/10" on the first reading of a day, null on the others. */
	dayLabel: string | null;
	time: string;
	systolic: number;
	diastolic: number;
	systolicCategory: Category;
	diastolicCategory: Category;
	hasNote: boolean;
}

export interface MonthGroup {
	/** "2026-10" in each reading's own time zone. */
	month: string;
	/** "Oktober 2026". */
	label: string;
	/** Average and count of the readings shown in this month (after filtering). */
	summary: Summary;
	rows: ReadingRow[];
}

/**
 * The H1 table: readings newest first, grouped by month with a summary per month.
 * Deleted readings are left out; categories are calculated here, never stored (T4).
 */
export function buildList(
	readings: readonly ListReading[],
	options: { filter: ListFilter; thresholds: Thresholds; windows: DayPartWindows }
): MonthGroup[] {
	const shown = readings
		.filter((r) => !r.deleted)
		.filter(
			(r) =>
				options.filter === 'all' ||
				getDayPart(r.measuredAt, r.timeZone, options.windows) === options.filter
		)
		.sort((a, b) => b.measuredAt.localeCompare(a.measuredAt));

	const byMonth = new Map<string, ListReading[]>();
	for (const r of shown) {
		const { month } = toLocal(r.measuredAt, r.timeZone);
		const bucket = byMonth.get(month);
		if (bucket) bucket.push(r);
		else byMonth.set(month, [r]);
	}

	return [...byMonth.keys()]
		.sort((a, b) => b.localeCompare(a))
		.map((month) => {
			const monthReadings = byMonth.get(month)!;
			let previousDate: string | null = null;
			const rows = monthReadings.map((r): ReadingRow => {
				const local = toLocal(r.measuredAt, r.timeZone);
				const dayLabel = local.date === previousDate ? null : formatShortDay(local.date);
				previousDate = local.date;
				return {
					id: r.id,
					dayLabel,
					time: formatTime(local.minutes),
					systolic: r.systolic,
					diastolic: r.diastolic,
					systolicCategory: classifyValue(r.systolic, options.thresholds.systolic),
					diastolicCategory: classifyValue(r.diastolic, options.thresholds.diastolic),
					hasNote: Boolean(r.note?.trim())
				};
			});
			return {
				month,
				label: formatMonth(month),
				summary: summarize(monthReadings, options.thresholds),
				rows
			};
		});
}
