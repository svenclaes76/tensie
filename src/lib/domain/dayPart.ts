import type { DayPart, DayPartWindows, TimeWindow } from './types';

/** T5 defaults. */
export const DEFAULT_DAY_PART_WINDOWS: DayPartWindows = {
	morning: { start: '04:00', end: '11:59' },
	evening: { start: '18:00', end: '23:59' }
};

export interface LocalDateTime {
	/** "YYYY-MM-DD" */
	date: string;
	/** "YYYY-MM" */
	month: string;
	/** Minutes since local midnight, 0–1439. */
	minutes: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
	let formatter = formatters.get(timeZone);
	if (!formatter) {
		formatter = new Intl.DateTimeFormat('en-US', {
			timeZone,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			hourCycle: 'h23'
		});
		formatters.set(timeZone, formatter);
	}
	return formatter;
}

/**
 * Wall-clock date and time of an instant in the time zone where the reading was taken,
 * so a reading taken abroad keeps its own local slot and day.
 */
export function toLocal(measuredAt: string, timeZone: string): LocalDateTime {
	const instant = new Date(measuredAt);
	if (Number.isNaN(instant.getTime())) throw new RangeError(`Invalid instant: ${measuredAt}`);
	const parts: Record<string, string> = {};
	for (const { type, value } of formatterFor(timeZone).formatToParts(instant)) parts[type] = value;
	const month = `${parts.year}-${parts.month}`;
	return {
		date: `${month}-${parts.day}`,
		month,
		minutes: Number(parts.hour) * 60 + Number(parts.minute)
	};
}

/**
 * Local date and time to the minute ("2026-01-18 510"). Two readings with the same key are the
 * same measurement for duplicate checks, even when stored in different time zones.
 */
export function localMinuteKey(measuredAt: string, timeZone: string): string {
	const { date, minutes } = toLocal(measuredAt, timeZone);
	return `${date} ${minutes}`;
}

/** Parses "HH:MM" (24-hour) to minutes since midnight; null when malformed. */
export function parseTime(time: string): number | null {
	const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
	return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function inWindow(minutes: number, window: TimeWindow): boolean {
	const start = parseTime(window.start);
	const end = parseTime(window.end);
	return start !== null && end !== null && minutes >= start && minutes <= end;
}

export function getDayPart(
	measuredAt: string,
	timeZone: string,
	windows: DayPartWindows = DEFAULT_DAY_PART_WINDOWS
): DayPart {
	const { minutes } = toLocal(measuredAt, timeZone);
	if (inWindow(minutes, windows.morning)) return 'morning';
	if (inWindow(minutes, windows.evening)) return 'evening';
	return 'other';
}

export type DayPartWindowError =
	| { kind: 'invalid-time'; part: keyof DayPartWindows; field: keyof TimeWindow }
	| { kind: 'end-before-start'; part: keyof DayPartWindows }
	| { kind: 'overlap' };

/**
 * Windows must be well-formed, may not cross midnight (start ≤ end) and may not overlap.
 * Returns an empty array when the windows are valid.
 */
export function validateDayPartWindows(windows: DayPartWindows): DayPartWindowError[] {
	const errors: DayPartWindowError[] = [];
	const ranges: [number, number][] = [];
	for (const part of ['morning', 'evening'] as const) {
		const start = parseTime(windows[part].start);
		const end = parseTime(windows[part].end);
		if (start === null) errors.push({ kind: 'invalid-time', part, field: 'start' });
		if (end === null) errors.push({ kind: 'invalid-time', part, field: 'end' });
		if (start === null || end === null) continue;
		if (end < start) errors.push({ kind: 'end-before-start', part });
		else ranges.push([start, end]);
	}
	if (ranges.length === 2) {
		const [[aStart, aEnd], [bStart, bEnd]] = ranges;
		if (aStart <= bEnd && bStart <= aEnd) errors.push({ kind: 'overlap' });
	}
	return errors;
}
