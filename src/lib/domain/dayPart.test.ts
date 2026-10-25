import { describe, expect, it } from 'vitest';
import {
	DEFAULT_DAY_PART_WINDOWS,
	getDayPart,
	parseTime,
	toLocal,
	validateDayPartWindows
} from './dayPart';
import type { DayPartWindows } from './types';

const BRUSSELS = 'Europe/Brussels';

/** A January wall-clock time in Brussels (UTC+1, no DST). */
function brusselsWinter(time: string, day = '2026-01-15'): string {
	return new Date(`${day}T${time}:00+01:00`).toISOString();
}

describe('getDayPart — default window boundaries (T5)', () => {
	it.each([
		['00:00', 'andere'],
		['03:59', 'andere'],
		['04:00', 'ochtend'],
		['11:59', 'ochtend'],
		['12:00', 'andere'],
		['17:59', 'andere'],
		['18:00', 'avond'],
		['23:59', 'avond']
	] as const)('%s local is %s', (time, expected) => {
		expect(getDayPart(brusselsWinter(time), BRUSSELS)).toBe(expected);
	});

	it('ignores seconds: 11:59:59 is still ochtend', () => {
		expect(getDayPart('2026-01-15T10:59:59.999Z', BRUSSELS)).toBe('ochtend');
	});
});

describe('getDayPart — time zones', () => {
	it('uses the time zone the reading was taken in, not a fixed one', () => {
		const instant = '2026-01-15T03:30:00.000Z';
		expect(getDayPart(instant, 'Europe/Brussels')).toBe('ochtend'); // 04:30
		expect(getDayPart(instant, 'America/New_York')).toBe('avond'); // 22:30 the day before
		expect(getDayPart(instant, 'Asia/Tokyo')).toBe('andere'); // 12:30
		expect(getDayPart(instant, 'UTC')).toBe('andere'); // 03:30
	});

	it('follows daylight saving time (Brussels switches to UTC+2 on 29 March 2026)', () => {
		expect(getDayPart('2026-03-29T01:59:00.000Z', BRUSSELS)).toBe('andere'); // 03:59 CEST
		expect(getDayPart('2026-03-29T02:00:00.000Z', BRUSSELS)).toBe('ochtend'); // 04:00 CEST
		expect(getDayPart('2026-10-25T02:59:00.000Z', BRUSSELS)).toBe('andere'); // 03:59 CET
		expect(getDayPart('2026-10-25T03:00:00.000Z', BRUSSELS)).toBe('ochtend'); // 04:00 CET
	});
});

describe('getDayPart — custom windows', () => {
	const windows: DayPartWindows = {
		ochtend: { start: '06:30', end: '09:00' },
		avond: { start: '20:00', end: '22:15' }
	};

	it.each([
		['06:29', 'andere'],
		['06:30', 'ochtend'],
		['09:00', 'ochtend'],
		['09:01', 'andere'],
		['19:59', 'andere'],
		['20:00', 'avond'],
		['22:15', 'avond'],
		['22:16', 'andere']
	] as const)('%s local is %s', (time, expected) => {
		expect(getDayPart(brusselsWinter(time), BRUSSELS, windows)).toBe(expected);
	});
});

describe('toLocal', () => {
	it('puts readings just before and after midnight on the right local day', () => {
		expect(toLocal(brusselsWinter('23:59'), BRUSSELS)).toEqual({
			date: '2026-01-15',
			month: '2026-01',
			minutes: 23 * 60 + 59
		});
		expect(toLocal(brusselsWinter('00:00', '2026-01-16'), BRUSSELS)).toEqual({
			date: '2026-01-16',
			month: '2026-01',
			minutes: 0
		});
	});

	it('uses the local month, not the UTC month', () => {
		// 00:30 on 1 February in Brussels is still 31 January in UTC.
		const instant = brusselsWinter('00:30', '2026-02-01');
		expect(instant).toBe('2026-01-31T23:30:00.000Z');
		expect(toLocal(instant, BRUSSELS).month).toBe('2026-02');
	});

	it('rejects an invalid instant', () => {
		expect(() => toLocal('not a date', BRUSSELS)).toThrow(RangeError);
	});

	it('rejects an unknown time zone', () => {
		expect(() => toLocal('2026-01-15T10:00:00.000Z', 'Mars/Olympus')).toThrow(RangeError);
	});
});

describe('parseTime', () => {
	it.each([
		['00:00', 0],
		['04:00', 240],
		['23:59', 1439]
	] as const)('%s is %i minutes', (time, minutes) => {
		expect(parseTime(time)).toBe(minutes);
	});

	it.each(['24:00', '4:00', '12:60', '12:5', '', 'noon'])('rejects %j', (time) => {
		expect(parseTime(time)).toBeNull();
	});
});

describe('validateDayPartWindows', () => {
	it('accepts the defaults', () => {
		expect(validateDayPartWindows(DEFAULT_DAY_PART_WINDOWS)).toEqual([]);
	});

	it('accepts windows that touch but do not overlap', () => {
		expect(
			validateDayPartWindows({
				ochtend: { start: '04:00', end: '11:59' },
				avond: { start: '12:00', end: '23:59' }
			})
		).toEqual([]);
	});

	it('rejects windows sharing a minute', () => {
		expect(
			validateDayPartWindows({
				ochtend: { start: '04:00', end: '12:00' },
				avond: { start: '12:00', end: '23:59' }
			})
		).toEqual([{ kind: 'overlap' }]);
	});

	it('rejects a window crossing midnight', () => {
		expect(
			validateDayPartWindows({
				ochtend: DEFAULT_DAY_PART_WINDOWS.ochtend,
				avond: { start: '22:00', end: '01:00' }
			})
		).toEqual([{ kind: 'end-before-start', part: 'avond' }]);
	});

	it('accepts a one-minute window', () => {
		expect(
			validateDayPartWindows({
				ochtend: { start: '07:00', end: '07:00' },
				avond: DEFAULT_DAY_PART_WINDOWS.avond
			})
		).toEqual([]);
	});

	it('rejects malformed times', () => {
		expect(
			validateDayPartWindows({
				ochtend: { start: '4:00', end: '11:59' },
				avond: DEFAULT_DAY_PART_WINDOWS.avond
			})
		).toEqual([{ kind: 'invalid-time', part: 'ochtend', field: 'start' }]);
	});
});
