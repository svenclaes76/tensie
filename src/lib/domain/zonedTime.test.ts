import { describe, expect, it } from 'vitest';
import { toLocal } from './dayPart';
import { fromLocal } from './zonedTime';

const BRUSSELS = 'Europe/Brussels';

describe('fromLocal', () => {
	it('converts winter (UTC+1) and summer (UTC+2) wall-clock times in Brussels', () => {
		expect(fromLocal('2026-01-15', 8 * 60 + 30, BRUSSELS)).toBe('2026-01-15T07:30:00.000Z');
		expect(fromLocal('2025-07-18', 8 * 60 + 30, BRUSSELS)).toBe('2025-07-18T06:30:00.000Z');
	});

	it('handles midnight and the last minute of the day', () => {
		expect(fromLocal('2026-01-01', 0, BRUSSELS)).toBe('2025-12-31T23:00:00.000Z');
		expect(fromLocal('2026-01-01', 23 * 60 + 59, BRUSSELS)).toBe('2026-01-01T22:59:00.000Z');
	});

	it('works in other time zones', () => {
		expect(fromLocal('2026-01-15', 22 * 60, 'America/New_York')).toBe('2026-01-16T03:00:00.000Z');
		expect(fromLocal('2026-01-15', 0, 'UTC')).toBe('2026-01-15T00:00:00.000Z');
		expect(fromLocal('2026-01-15', 9 * 60, 'Asia/Kolkata')).toBe('2026-01-15T03:30:00.000Z');
	});

	it('moves a time in the spring-forward gap forward (02:30 does not exist on 29 March 2026)', () => {
		expect(fromLocal('2026-03-29', 2 * 60 + 30, BRUSSELS)).toBe('2026-03-29T01:30:00.000Z'); // 03:30 CEST
	});

	it('uses the earlier occurrence in the repeated autumn hour (25 October 2026)', () => {
		expect(fromLocal('2026-10-25', 2 * 60 + 30, BRUSSELS)).toBe('2026-10-25T00:30:00.000Z'); // CEST
	});

	it('is the inverse of toLocal on ordinary times', () => {
		for (const [date, minutes] of [
			['2026-03-28', 2 * 60 + 30],
			['2026-03-29', 3 * 60],
			['2026-10-25', 3 * 60],
			['2026-06-30', 23 * 60 + 59]
		] as const) {
			const local = toLocal(fromLocal(date, minutes, BRUSSELS), BRUSSELS);
			expect([local.date, local.minutes]).toEqual([date, minutes]);
		}
	});

	it('rejects an invalid date', () => {
		expect(() => fromLocal('not-a-date', 0, BRUSSELS)).toThrow(RangeError);
	});
});
