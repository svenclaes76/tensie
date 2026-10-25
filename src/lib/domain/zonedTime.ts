import { toLocal } from './dayPart';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

function wallClockMs(date: string, minutes: number): number {
	const [year, month, day] = date.split('-').map(Number);
	return Date.UTC(year, month - 1, day) + minutes * MINUTE;
}

/** Offset of `timeZone` from UTC at an instant (whole minutes), in ms. */
function offsetAt(instantMs: number, timeZone: string): number {
	const floored = Math.floor(instantMs / MINUTE) * MINUTE;
	const local = toLocal(new Date(floored).toISOString(), timeZone);
	return wallClockMs(local.date, local.minutes) - floored;
}

/**
 * Converts a wall-clock date and time in `timeZone` to an ISO instant.
 * During a daylight-saving gap (e.g. 02:30 on the spring-forward night) the time is moved
 * forward by the gap; during the repeated hour in autumn the earlier occurrence is used.
 */
export function fromLocal(date: string, minutes: number, timeZone: string): string {
	const wall = wallClockMs(date, minutes);
	if (Number.isNaN(wall)) throw new RangeError(`Invalid local date: ${date}`);
	// At most one transition lies within a day, so the offsets a day either side cover all cases.
	const before = offsetAt(wall - DAY, timeZone);
	const after = offsetAt(wall + DAY, timeZone);
	const valid = [...new Set([before, after])]
		.map((offset) => wall - offset)
		.filter((instant) => wall - offsetAt(instant, timeZone) === instant)
		.sort((a, b) => a - b);
	return new Date(valid.length > 0 ? valid[0] : wall - before).toISOString();
}
