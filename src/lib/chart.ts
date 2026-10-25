import { summarize, type Summary } from './domain/averages';
import { classifyValue } from './domain/classification';
import { toLocal } from './domain/dayPart';
import type { Category, CategoryLimits, ReadingLike, Thresholds } from './domain/types';
import { fromLocal } from './domain/zonedTime';
import { addDays, formatShortDay, formatTime } from './format';

/** H2 periods; "custom" takes its own start and end date. */
export type Period = '7d' | '30d' | '90d' | '1y' | 'custom';
export type Series = 'systolic' | 'diastolic';

const PERIOD_DAYS: Record<Exclude<Period, 'custom'>, number> = {
	'7d': 7,
	'30d': 30,
	'90d': 90,
	'1y': 365
};

/** Up to this many days every reading is drawn; beyond it the chart shows weekly averages. */
export const READINGS_UP_TO_DAYS = 120;
/** Up to this many days every point gets a dot; beyond it only raised (moderate, severe) ones. */
export const ALL_DOTS_UP_TO_DAYS = 31;

export interface DateRange {
	/** "YYYY-MM-DD", inclusive. */
	start: string;
	/** "YYYY-MM-DD", inclusive. */
	end: string;
}

/** The dates a period covers, ending today. A custom range is put in order. */
export function periodRange(period: Period, today: string, custom?: DateRange): DateRange {
	if (period === 'custom') {
		if (!custom) return { start: today, end: today };
		return custom.start <= custom.end ? custom : { start: custom.end, end: custom.start };
	}
	return { start: addDays(today, -(PERIOD_DAYS[period] - 1)), end: today };
}

/** Number of days in a range, both ends included. */
export function rangeDays(range: DateRange): number {
	const ms = Date.parse(`${range.end}T00:00:00Z`) - Date.parse(`${range.start}T00:00:00Z`);
	return Math.round(ms / 86_400_000) + 1;
}

export interface ChartPoint {
	/** Epoch ms on the time axis. */
	t: number;
	value: number;
	category: Category;
	/** Whether the point gets a dot (H5); the line always passes through it. */
	dot: boolean;
	/** "zo 25/10 07:42", or "week van ma 06/10". */
	label: string;
	/** Readings behind the point: 1, or the number averaged in a week. */
	count: number;
}

export interface ChartData {
	series: Series;
	range: DateRange;
	granularity: 'reading' | 'week';
	points: ChartPoint[];
	limits: CategoryLimits;
	/** Value axis, always wide enough to show every category band. */
	yMin: number;
	yMax: number;
	/** Time axis: the start of the first day to the end of the last, in the device time zone. */
	xMin: number;
	xMax: number;
	/** Averages over both values, for the stats tiles. */
	summary: Summary;
	/** The readings with the highest and lowest value of the chosen series. */
	highest: { systolic: number; diastolic: number } | null;
	lowest: { systolic: number; diastolic: number } | null;
}

function mondayOf(isoDate: string): string {
	const [year, month, day] = isoDate.split('-').map(Number);
	const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
	return addDays(isoDate, -((weekday + 6) % 7));
}

/**
 * The H2/H5 chart for one series over a date range. Readings count by their own local date;
 * categories are calculated with the current thresholds (T4), never stored.
 */
export function buildChart(
	readings: readonly ReadingLike[],
	options: { series: Series; range: DateRange; thresholds: Thresholds; timeZone: string }
): ChartData {
	const { series, range, thresholds, timeZone } = options;
	const limits = thresholds[series];
	const inRange = readings
		.filter((r) => !r.deleted)
		.map((r) => ({ reading: r, local: toLocal(r.measuredAt, r.timeZone) }))
		.filter(({ local }) => local.date >= range.start && local.date <= range.end)
		.sort((a, b) => a.reading.measuredAt.localeCompare(b.reading.measuredAt));

	const days = rangeDays(range);
	const granularity = days <= READINGS_UP_TO_DAYS ? 'reading' : 'week';
	const allDots = days <= ALL_DOTS_UP_TO_DAYS;
	const raised = (category: Category) => category === 'moderate' || category === 'severe';

	let points: ChartPoint[];
	if (granularity === 'reading') {
		points = inRange.map(({ reading, local }) => {
			const value = reading[series];
			const category = classifyValue(value, limits);
			return {
				t: Date.parse(reading.measuredAt),
				value,
				category,
				dot: allDots || raised(category),
				label: `${formatShortDay(local.date)} ${formatTime(local.minutes)}`,
				count: 1
			};
		});
	} else {
		const weeks = new Map<string, ReadingLike[]>();
		for (const { reading, local } of inRange) {
			const week = mondayOf(local.date);
			const bucket = weeks.get(week);
			if (bucket) bucket.push(reading);
			else weeks.set(week, [reading]);
		}
		points = [...weeks.entries()].map(([week, group]) => {
			const value = Math.round(group.reduce((sum, r) => sum + r[series], 0) / group.length);
			const category = classifyValue(value, limits);
			return {
				// Mid-week, so a week sits in the middle of its seven days.
				t: Date.parse(fromLocal(addDays(week, 3), 12 * 60, timeZone)),
				value,
				category,
				dot: raised(category),
				label: `week van ${formatShortDay(week)}`,
				count: group.length
			};
		});
	}

	const values = inRange.map(({ reading }) => reading[series]);
	const yMin = Math.floor(Math.min(limits.mild - 25, ...values) / 10) * 10;
	const yMax = Math.ceil(Math.max(limits.severe + 15, ...values) / 10) * 10;

	const pick = (better: (a: number, b: number) => boolean) => {
		const best = inRange.reduce<ReadingLike | null>(
			(found, { reading }) => (!found || better(reading[series], found[series]) ? reading : found),
			null
		);
		return best ? { systolic: best.systolic, diastolic: best.diastolic } : null;
	};

	return {
		series,
		range,
		granularity,
		points,
		limits,
		yMin,
		yMax,
		xMin: Date.parse(fromLocal(range.start, 0, timeZone)),
		xMax: Date.parse(fromLocal(addDays(range.end, 1), 0, timeZone)),
		summary: summarize(
			inRange.map(({ reading }) => reading),
			thresholds
		),
		highest: pick((a, b) => a > b),
		lowest: pick((a, b) => a < b)
	};
}
