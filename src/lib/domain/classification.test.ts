import { describe, expect, it } from 'vitest';
import { classifyReading, classifyValue, maxCategory } from './classification';
import { DEFAULT_THRESHOLDS } from './thresholds';
import { CATEGORIES, type Thresholds } from './types';

describe('classifyValue — systolic boundaries (defaults 135/160/180)', () => {
	it.each([
		[134, 'normal'],
		[135, 'mild'],
		[159, 'mild'],
		[160, 'moderate'],
		[179, 'moderate'],
		[180, 'severe']
	] as const)('%i mmHg is %s', (value, expected) => {
		expect(classifyValue(value, DEFAULT_THRESHOLDS.systolic)).toBe(expected);
	});
});

describe('classifyValue — diastolic boundaries (defaults 85/100/110)', () => {
	it.each([
		[84, 'normal'],
		[85, 'mild'],
		[99, 'mild'],
		[100, 'moderate'],
		[109, 'moderate'],
		[110, 'severe']
	] as const)('%i mmHg is %s', (value, expected) => {
		expect(classifyValue(value, DEFAULT_THRESHOLDS.diastolic)).toBe(expected);
	});
});

describe('classifyReading', () => {
	it.each([
		// The boundary pairs from the QA checklist, both values on the same side.
		[134, 84, 'normal'],
		[135, 85, 'mild'],
		[159, 99, 'mild'],
		[160, 100, 'moderate'],
		[179, 109, 'moderate'],
		[180, 110, 'severe']
	] as const)('%i/%i is %s overall', (systolic, diastolic, expected) => {
		const result = classifyReading({ systolic, diastolic }, DEFAULT_THRESHOLDS);
		expect(result).toEqual({ systolic: expected, diastolic: expected, overall: expected });
	});

	it('classifies systolic and diastolic separately and takes the higher as overall', () => {
		expect(classifyReading({ systolic: 120, diastolic: 100 }, DEFAULT_THRESHOLDS)).toEqual({
			systolic: 'normal',
			diastolic: 'moderate',
			overall: 'moderate'
		});
		expect(classifyReading({ systolic: 185, diastolic: 80 }, DEFAULT_THRESHOLDS)).toEqual({
			systolic: 'severe',
			diastolic: 'normal',
			overall: 'severe'
		});
	});

	it('only one value crossing its limit raises the overall category', () => {
		expect(classifyReading({ systolic: 134, diastolic: 85 }, DEFAULT_THRESHOLDS).overall).toBe(
			'mild'
		);
		expect(classifyReading({ systolic: 135, diastolic: 84 }, DEFAULT_THRESHOLDS).overall).toBe(
			'mild'
		);
	});

	it('reclassifies the same reading when thresholds change (T4)', () => {
		const reading = { systolic: 140, diastolic: 88 };
		const stricter: Thresholds = {
			systolic: { mild: 130, moderate: 140, severe: 170 },
			diastolic: { mild: 80, moderate: 90, severe: 105 }
		};
		expect(classifyReading(reading, DEFAULT_THRESHOLDS).overall).toBe('mild');
		expect(classifyReading(reading, stricter)).toEqual({
			systolic: 'moderate',
			diastolic: 'mild',
			overall: 'moderate'
		});
	});

	it('applies custom limits inclusively', () => {
		const custom: Thresholds = {
			systolic: { mild: 130, moderate: 150, severe: 170 },
			diastolic: { mild: 80, moderate: 95, severe: 105 }
		};
		expect(classifyReading({ systolic: 129, diastolic: 79 }, custom).overall).toBe('normal');
		expect(classifyReading({ systolic: 130, diastolic: 79 }, custom).overall).toBe('mild');
		expect(classifyReading({ systolic: 129, diastolic: 105 }, custom).overall).toBe(
			'severe'
		);
	});
});

describe('maxCategory', () => {
	it('returns the higher category regardless of argument order', () => {
		for (const a of CATEGORIES) {
			for (const b of CATEGORIES) {
				const expected = CATEGORIES[Math.max(CATEGORIES.indexOf(a), CATEGORIES.indexOf(b))];
				expect(maxCategory(a, b)).toBe(expected);
			}
		}
	});
});
