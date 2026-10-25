import { describe, expect, it } from 'vitest';
import {
	columnLetter,
	countReadings,
	formatDate,
	formatDateTime,
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

	it('counts readings in Dutch', () => {
		expect(countReadings(0)).toBe('0 metingen');
		expect(countReadings(1)).toBe('1 meting');
		expect(countReadings(96)).toBe('96 metingen');
	});
});
