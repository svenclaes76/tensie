import { describe, expect, it } from 'vitest';
import { DEFAULT_THRESHOLDS } from './domain/thresholds';
import { BADGE_FROM, entryWarnings, liveCategory, parseMmHg, sanitizeDigits } from './entry';

describe('sanitizeDigits', () => {
	it.each([
		['146', '146'],
		['1462', '146'],
		['14a6', '146'],
		[' 88 ', '88'],
		['12,5', '125'],
		['', '']
	])('%j → %j', (text, expected) => {
		expect(sanitizeDigits(text)).toBe(expected);
	});
});

describe('parseMmHg', () => {
	it.each([
		['146', 146],
		['88', 88],
		['5', 5],
		['060', 60]
	])('%j → %i', (text, expected) => {
		expect(parseMmHg(text)).toBe(expected);
	});

	it.each(['', '0', '000', '1462', 'abc', '14.6'])('rejects %j', (text) => {
		expect(parseMmHg(text)).toBeNull();
	});
});

describe('liveCategory', () => {
	it(`shows no category below ${BADGE_FROM}, while the value is still being typed`, () => {
		expect(liveCategory('', DEFAULT_THRESHOLDS.systolic)).toBeNull();
		expect(liveCategory('1', DEFAULT_THRESHOLDS.systolic)).toBeNull();
		expect(liveCategory('14', DEFAULT_THRESHOLDS.systolic)).toBeNull();
		expect(liveCategory('29', DEFAULT_THRESHOLDS.diastolic)).toBeNull();
		expect(liveCategory('30', DEFAULT_THRESHOLDS.diastolic)).toBe('normal');
	});

	it('classifies at the inclusive limits, as the stored reading will be', () => {
		expect(liveCategory('134', DEFAULT_THRESHOLDS.systolic)).toBe('normal');
		expect(liveCategory('135', DEFAULT_THRESHOLDS.systolic)).toBe('mild');
		expect(liveCategory('146', DEFAULT_THRESHOLDS.systolic)).toBe('mild');
		expect(liveCategory('110', DEFAULT_THRESHOLDS.diastolic)).toBe('severe');
	});
});

describe('entryWarnings', () => {
	const now = new Date('2026-10-25T09:58:00Z');

	it('has nothing to say about a plausible reading taken now', () => {
		expect(entryWarnings({ systolic: 146, diastolic: 88 }, now.toISOString(), now)).toEqual([]);
	});

	it('passes on the C4 checks', () => {
		expect(entryWarnings({ systolic: 300, diastolic: 88 }, now.toISOString(), now)).toEqual([
			'systolic-out-of-range'
		]);
		expect(entryWarnings({ systolic: 88, diastolic: 146 }, now.toISOString(), now)).toEqual([
			'systolic-not-above-diastolic'
		]);
	});

	it('flags a time after now, not one at now', () => {
		expect(entryWarnings({ systolic: 146, diastolic: 88 }, '2026-10-25T09:58:00.000Z', now)).toEqual([]);
		expect(entryWarnings({ systolic: 146, diastolic: 88 }, '2026-10-25T09:59:00.000Z', now)).toEqual([
			'future'
		]);
	});
});
