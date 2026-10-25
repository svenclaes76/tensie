import { buildChart, type ChartData, type DateRange } from './chart';
import { dayPartAverages, summarize, type Summary } from './domain/averages';
import { classifyValue } from './domain/classification';
import { getDayPart, toLocal } from './domain/dayPart';
import type { Category, DayPart, DayPartWindows, Thresholds } from './domain/types';
import type { ExportReading } from './export/rows';
import { formatDate, formatTime } from './format';
import { buildMonthly, type MonthCard } from './monthly';

export interface ReportRow {
	/** "25/10/2026". */
	date: string;
	time: string;
	systolic: number;
	diastolic: number;
	systolicCategory: Category;
	diastolicCategory: Category;
	dayPart: DayPart;
	arm?: 'left' | 'right';
	note?: string;
}

export interface ReportData {
	range: DateRange;
	summary: Summary;
	morning: Summary;
	evening: Summary;
	months: MonthCard[];
	systolicChart: ChartData;
	diastolicChart: ChartData;
	/** Every reading in the period, oldest first, as a log. */
	rows: ReportRow[];
}

/**
 * E1: the report for a period. Built from the same calculations as the screens, so the doctor
 * sees exactly what the app shows; categories follow the current thresholds (T4).
 */
export function buildReport(
	readings: readonly ExportReading[],
	options: { range: DateRange; thresholds: Thresholds; windows: DayPartWindows; timeZone: string }
): ReportData {
	const { range, thresholds, windows, timeZone } = options;
	const inRange = readings
		.filter((r) => !r.deleted)
		.map((r) => ({ reading: r, local: toLocal(r.measuredAt, r.timeZone) }))
		.filter(({ local }) => local.date >= range.start && local.date <= range.end)
		.sort((a, b) => a.reading.measuredAt.localeCompare(b.reading.measuredAt));
	const plain = inRange.map(({ reading }) => reading);
	const parts = dayPartAverages(plain, thresholds, windows);

	return {
		range,
		summary: summarize(plain, thresholds),
		morning: parts.morning,
		evening: parts.evening,
		// No month is "running" in a report.
		months: buildMonthly(plain, { thresholds, windows, currentMonth: '' }),
		systolicChart: buildChart(plain, { series: 'systolic', range, thresholds, timeZone }),
		diastolicChart: buildChart(plain, { series: 'diastolic', range, thresholds, timeZone }),
		rows: inRange.map(({ reading, local }) => ({
			date: formatDate(local.date),
			time: formatTime(local.minutes),
			systolic: reading.systolic,
			diastolic: reading.diastolic,
			systolicCategory: classifyValue(reading.systolic, thresholds.systolic),
			diastolicCategory: classifyValue(reading.diastolic, thresholds.diastolic),
			dayPart: getDayPart(reading.measuredAt, reading.timeZone, windows),
			...(reading.arm ? { arm: reading.arm } : {}),
			...(reading.note?.trim() ? { note: reading.note.trim() } : {})
		}))
	};
}
