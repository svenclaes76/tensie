import { dayPartAverages, summarize, type Summary } from './domain/averages';
import { classifyReading, type ReadingClassification } from './domain/classification';
import { getDayPart, toLocal } from './domain/dayPart';
import type { DayPart, DayPartWindows, ReadingLike, Thresholds } from './domain/types';
import { addDays, formatTime, formatWeekdayDate } from './format';

export interface LastReading {
	systolic: number;
	diastolic: number;
	classification: ReadingClassification;
	/** "zo 25 okt · 07:42". */
	when: string;
	dayPart: DayPart;
}

/** H7: how this week's average compares with the week before. */
export type Trend =
	| { kind: 'none' }
	| { kind: 'same' }
	/** Both values went down (or one did and the other stayed). */
	| { kind: 'lower'; systolic: number; diastolic: number }
	| { kind: 'higher'; systolic: number; diastolic: number }
	/** One went down, the other up: signed differences. */
	| { kind: 'mixed'; systolic: number; diastolic: number };

export interface HomeData {
	last: LastReading | null;
	/** The last 7 days, today included. */
	week: Summary;
	morning: Summary;
	evening: Summary;
	trend: Trend;
}

function inDays(readings: readonly ReadingLike[], start: string, end: string) {
	return readings.filter((r) => {
		const { date } = toLocal(r.measuredAt, r.timeZone);
		return date >= start && date <= end;
	});
}

function trendBetween(current: Summary, previous: Summary): Trend {
	if (current.systolic === null || previous.systolic === null) return { kind: 'none' };
	const systolic = current.systolic - previous.systolic;
	const diastolic = current.diastolic - previous.diastolic;
	if (systolic === 0 && diastolic === 0) return { kind: 'same' };
	if (systolic <= 0 && diastolic <= 0)
		return { kind: 'lower', systolic: Math.abs(systolic), diastolic: Math.abs(diastolic) };
	if (systolic >= 0 && diastolic >= 0) return { kind: 'higher', systolic, diastolic };
	return { kind: 'mixed', systolic, diastolic };
}

/** The H7 home summary. Days count in each reading's own time zone; categories follow T4. */
export function buildHome(
	readings: readonly ReadingLike[],
	options: { thresholds: Thresholds; windows: DayPartWindows; today: string }
): HomeData {
	const live = readings.filter((r) => !r.deleted);
	const newest = live.reduce<ReadingLike | null>(
		(found, r) => (!found || r.measuredAt > found.measuredAt ? r : found),
		null
	);

	let last: LastReading | null = null;
	if (newest) {
		const local = toLocal(newest.measuredAt, newest.timeZone);
		last = {
			systolic: newest.systolic,
			diastolic: newest.diastolic,
			classification: classifyReading(newest, options.thresholds),
			when: `${formatWeekdayDate(local.date, options.today)} · ${formatTime(local.minutes)}`,
			dayPart: getDayPart(newest.measuredAt, newest.timeZone, options.windows)
		};
	}

	const thisWeek = inDays(live, addDays(options.today, -6), options.today);
	const lastWeek = inDays(live, addDays(options.today, -13), addDays(options.today, -7));
	const week = summarize(thisWeek, options.thresholds);
	const parts = dayPartAverages(thisWeek, options.thresholds, options.windows);

	return {
		last,
		week,
		morning: parts.morning,
		evening: parts.evening,
		trend: trendBetween(week, summarize(lastWeek, options.thresholds))
	};
}
