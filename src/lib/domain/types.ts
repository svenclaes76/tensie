/** Categories from low to high; the order is used to pick the higher of two (H4). */
export const CATEGORIES = [
	'normal',
	'mild',
	'moderate',
	'severe'
] as const;

export type Category = (typeof CATEGORIES)[number];

/** Inclusive lower limits in mmHg for the three raised categories (T1). */
export interface CategoryLimits {
	mild: number;
	moderate: number;
	severe: number;
}

export interface Thresholds {
	systolic: CategoryLimits;
	diastolic: CategoryLimits;
}

export type DayPart = 'morning' | 'evening' | 'other';

/** A time-of-day window, both ends inclusive, as "HH:MM" in the reading's local time. */
export interface TimeWindow {
	start: string;
	end: string;
}

export interface DayPartWindows {
	morning: TimeWindow;
	evening: TimeWindow;
}

/** The fields the domain logic needs from a stored reading. */
export interface ReadingLike {
	/** ISO 8601 instant, e.g. "2026-10-25T06:30:00.000Z". */
	measuredAt: string;
	/** IANA time zone where the reading was taken, e.g. "Europe/Brussels". */
	timeZone: string;
	/** mmHg, integer. */
	systolic: number;
	/** mmHg, integer. */
	diastolic: number;
	deleted?: boolean;
}
