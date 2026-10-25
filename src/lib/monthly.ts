import { dayPartAverages, monthlyAverages, type Summary } from './domain/averages';
import { toLocal } from './domain/dayPart';
import type { DayPartWindows, ReadingLike, Thresholds } from './domain/types';
import { formatMonth } from './format';

export interface MonthCard {
	/** "2026-10". */
	month: string;
	/** "Oktober 2026", with " (lopend)" for the current month. */
	label: string;
	summary: Summary;
	/** T6: fewer than 6 readings. */
	limitedData: boolean;
	/** H3: separate morning and evening averages. */
	morning: Summary;
	evening: Summary;
}

/**
 * The H3 overview: one card per month with readings, newest first. Every reading counts in its
 * own local month (T6); categories follow the current thresholds (T4).
 */
export function buildMonthly(
	readings: readonly ReadingLike[],
	options: { thresholds: Thresholds; windows: DayPartWindows; currentMonth: string }
): MonthCard[] {
	const live = readings.filter((r) => !r.deleted);
	const byMonth = new Map<string, ReadingLike[]>();
	for (const r of live) {
		const { month } = toLocal(r.measuredAt, r.timeZone);
		const bucket = byMonth.get(month);
		if (bucket) bucket.push(r);
		else byMonth.set(month, [r]);
	}

	return monthlyAverages(live, options.thresholds)
		.reverse()
		.map(({ month, limitedData, ...summary }) => {
			const parts = dayPartAverages(byMonth.get(month) ?? [], options.thresholds, options.windows);
			return {
				month,
				label: `${formatMonth(month)}${month === options.currentMonth ? ' (lopend)' : ''}`,
				summary,
				limitedData,
				morning: parts.morning,
				evening: parts.evening
			};
		});
}
