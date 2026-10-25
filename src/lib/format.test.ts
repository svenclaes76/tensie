import { describe, expect, it } from 'vitest';
import {
	columnLetter,
	addDays,
	countReadings,
	formatDate,
	formatDateRange,
	formatDateTime,
	formatDayLabel,
	formatMonth,
	formatShortDay,
	formatWeekdayDate,
	formatDecimal,
	formatTime
} from './format';

describe('format', () => {
	it('formats dates as dd/mm/jjjj', () => {
		expect(formatDate('2025-07-18')).toBe('18/07/2025');
		expect(formatDate('2026-01-05')).toBe('05/01/2026');
	});

	it('formats times as 24-hour HH:MM', () => {
		expect(formatTime(0)).toBe('00:00');
		expect(formatTime(510)).toBe('08:30');
		expect(formatTime(1439)).toBe('23:59');
	});

	it('formats an instant in the reading’s time zone', () => {
		expect(formatDateTime('2025-07-18T06:30:00.000Z', 'Europe/Brussels')).toBe('18/07/2025 08:30');
		expect(formatDateTime('2025-07-18T06:30:00.000Z', 'UTC')).toBe('18/07/2025 06:30');
	});

	it('uses a decimal comma', () => {
		expect(formatDecimal(9.8)).toBe('9,8');
		expect(formatDecimal(16)).toBe('16,0');
		expect(formatDecimal(135, 0)).toBe('135');
	});

	it.each([
		[0, 'A'],
		[6, 'G'],
		[25, 'Z'],
		[26, 'AA'],
		[51, 'AZ'],
		[52, 'BA'],
		[701, 'ZZ'],
		[702, 'AAA']
	] as const)('column %i is %s', (index, letters) => {
		expect(columnLetter(index)).toBe(letters);
	});

	it.each([
		['2026-10-25', 'Vandaag, 25 okt'],
		['2026-10-24', 'Gisteren, 24 okt'],
		['2026-10-22', 'do 22 okt'],
		['2026-01-01', 'do 1 jan'],
		['2025-12-31', '31 dec 2025'],
		['2027-03-01', '1 mrt 2027']
	])('labels %s as %j when today is 25 October 2026', (date, label) => {
		expect(formatDayLabel(date, '2026-10-25')).toBe(label);
	});

	it('knows yesterday across a month and year boundary', () => {
		expect(formatDayLabel('2026-02-28', '2026-03-01')).toBe('Gisteren, 28 feb');
		expect(formatDayLabel('2025-12-31', '2026-01-01')).toBe('Gisteren, 31 dec');
	});

	it('formats the list’s short day', () => {
		expect(formatShortDay('2026-10-25')).toBe('zo 25/10');
		expect(formatShortDay('2026-01-05')).toBe('ma 05/01');
	});

	it('formats months in full, capitalised', () => {
		expect(formatMonth('2026-10')).toBe('Oktober 2026');
		expect(formatMonth('2025-03')).toBe('Maart 2025');
	});

	it('counts readings in Dutch', () => {
		expect(countReadings(0)).toBe('0 metingen');
		expect(countReadings(1)).toBe('1 meting');
		expect(countReadings(96)).toBe('96 metingen');
	});
});

describe('formatDateRange', () => {
	it.each([
		['2026-10-19', '2026-10-25', '19–25 okt'],
		['2026-09-26', '2026-10-25', '26 sep–25 okt'],
		['2025-10-26', '2026-10-25', '26 okt 2025–25 okt 2026'],
		['2026-10-25', '2026-10-25', '25 okt']
	])('%s to %s is %j', (start, end, label) => {
		expect(formatDateRange(start, end)).toBe(label);
	});
});

describe('addDays', () => {
	it('moves across month, year and leap day', () => {
		expect(addDays('2026-10-25', -6)).toBe('2026-10-19');
		expect(addDays('2025-12-31', 1)).toBe('2026-01-01');
		expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
	});
});

describe('formatWeekdayDate', () => {
	it('gives weekday, day and month, and the year only when it differs', () => {
		expect(formatWeekdayDate('2026-10-25', '2026-10-25')).toBe('zo 25 okt');
		expect(formatWeekdayDate('2026-01-05', '2026-10-25')).toBe('ma 5 jan');
		expect(formatWeekdayDate('2025-10-10', '2026-10-25')).toBe('vr 10 okt 2025');
	});
});
