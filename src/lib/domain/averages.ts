import { classifyReading, type ReadingClassification } from './classification';
import { DEFAULT_DAY_PART_WINDOWS, getDayPart, toLocal } from './dayPart';
import type { DayPart, DayPartWindows, ReadingLike, Thresholds } from './types';

/** T6: a month with fewer readings than this is marked "beperkte gegevens". */
export const MIN_READINGS_PER_MONTH = 6;

export type Summary =
	| { count: 0; systolic: null; diastolic: null; classification: null }
	| {
			count: number;
			/** Mean in mmHg, rounded half up to a whole number. */
			systolic: number;
			diastolic: number;
			/** Classification of the rounded means, so the shown number and its label always agree. */
			classification: ReadingClassification;
	  };

export type MonthlyAverage = Summary & {
	/** "YYYY-MM" in each reading's own time zone. */
	month: string;
	limitedData: boolean;
};

function live(readings: readonly ReadingLike[]): ReadingLike[] {
	return readings.filter((r) => !r.deleted);
}

/**
 * Average of every individual (non-deleted) reading given. Use it for any chosen period by
 * passing that period's readings.
 */
export function summarize(readings: readonly ReadingLike[], thresholds: Thresholds): Summary {
	const included = live(readings);
	if (included.length === 0) return { count: 0, systolic: null, diastolic: null, classification: null };
	let systolicSum = 0;
	let diastolicSum = 0;
	for (const r of included) {
		systolicSum += r.systolic;
		diastolicSum += r.diastolic;
	}
	// Values are positive, so Math.round rounds halves up.
	const systolic = Math.round(systolicSum / included.length);
	const diastolic = Math.round(diastolicSum / included.length);
	return {
		count: included.length,
		systolic,
		diastolic,
		classification: classifyReading({ systolic, diastolic }, thresholds)
	};
}

/** H3/T6: one entry per month that has readings, oldest first. */
export function monthlyAverages(
	readings: readonly ReadingLike[],
	thresholds: Thresholds
): MonthlyAverage[] {
	const byMonth = new Map<string, ReadingLike[]>();
	for (const r of live(readings)) {
		const { month } = toLocal(r.measuredAt, r.timeZone);
		const bucket = byMonth.get(month);
		if (bucket) bucket.push(r);
		else byMonth.set(month, [r]);
	}
	return [...byMonth.keys()].sort().map((month) => {
		const summary = summarize(byMonth.get(month)!, thresholds);
		return { ...summary, month, limitedData: summary.count < MIN_READINGS_PER_MONTH };
	});
}

/** H3: separate averages for morning, evening and other readings. */
export function dayPartAverages(
	readings: readonly ReadingLike[],
	thresholds: Thresholds,
	windows: DayPartWindows = DEFAULT_DAY_PART_WINDOWS
): Record<DayPart, Summary> {
	const groups: Record<DayPart, ReadingLike[]> = { morning: [], evening: [], other: [] };
	for (const r of live(readings)) groups[getDayPart(r.measuredAt, r.timeZone, windows)].push(r);
	return {
		morning: summarize(groups.morning, thresholds),
		evening: summarize(groups.evening, thresholds),
		other: summarize(groups.other, thresholds)
	};
}
