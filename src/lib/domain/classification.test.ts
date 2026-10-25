import { describe, expect, it } from 'vitest';
import { classifyReading, classifyValue, maxCategory } from './classification';
import { DEFAULT_THRESHOLDS } from './thresholds';
import { CATEGORIES, type Thresholds } from './types';

describe('classifyValue — systolic boundaries (defaults 135/160/180)', () => {
	it.each([
		[134, 'normaal'],
		[135, 'licht verhoogd'],
		[159, 'licht verhoogd'],
		[160, 'gemiddeld verhoogd'],
		[179, 'gemiddeld verhoogd'],
		[180, 'ernstig verhoogd']
	] as const)('%i mmHg is %s', (value, expected) => {
		expect(classifyValue(value, DEFAULT_THRESHOLDS.systolic)).toBe(expected);
	});
});

describe('classifyValue — diastolic boundaries (defaults 85/100/110)', () => {
	it.each([
		[84, 'normaal'],
		[85, 'licht verhoogd'],
		[99, 'licht verhoogd'],
		[100, 'gemiddeld verhoogd'],
		[109, 'gemiddeld verhoogd'],
		[110, 'ernstig verhoogd']
	] as const)('%i mmHg is %s', (value, expected) => {
		expect(classifyValue(value, DEFAULT_THRESHOLDS.diastolic)).toBe(expected);
	});
});

describe('classifyReading', () => {
	it.each([
		// The boundary pairs from the QA checklist, both values on the same side.
		[134, 84, 'normaal'],
		[135, 85, 'licht verhoogd'],
		[159, 99, 'licht verhoogd'],
		[160, 100, 'gemiddeld verhoogd'],
		[179, 109, 'gemiddeld verhoogd'],
		[180, 110, 'ernstig verhoogd']
	] as const)('%i/%i is %s overall', (systolic, diastolic, expected) => {
		const result = classifyReading({ systolic, diastolic }, DEFAULT_THRESHOLDS);
		expect(result).toEqual({ systolic: expected, diastolic: expected, overall: expected });
	});

	it('classifies systolic and diastolic separately and takes the higher as overall', () => {
		expect(classifyReading({ systolic: 120, diastolic: 100 }, DEFAULT_THRESHOLDS)).toEqual({
			systolic: 'normaal',
			diastolic: 'gemiddeld verhoogd',
			overall: 'gemiddeld verhoogd'
		});
		expect(classifyReading({ systolic: 185, diastolic: 80 }, DEFAULT_THRESHOLDS)).toEqual({
			systolic: 'ernstig verhoogd',
			diastolic: 'normaal',
			overall: 'ernstig verhoogd'
		});
	});

	it('only one value crossing its limit raises the overall category', () => {
		expect(classifyReading({ systolic: 134, diastolic: 85 }, DEFAULT_THRESHOLDS).overall).toBe(
			'licht verhoogd'
		);
		expect(classifyReading({ systolic: 135, diastolic: 84 }, DEFAULT_THRESHOLDS).overall).toBe(
			'licht verhoogd'
		);
	});

	it('reclassifies the same reading when thresholds change (T4)', () => {
		const reading = { systolic: 140, diastolic: 88 };
		const stricter: Thresholds = {
			systolic: { licht: 130, gemiddeld: 140, ernstig: 170 },
			diastolic: { licht: 80, gemiddeld: 90, ernstig: 105 }
		};
		expect(classifyReading(reading, DEFAULT_THRESHOLDS).overall).toBe('licht verhoogd');
		expect(classifyReading(reading, stricter)).toEqual({
			systolic: 'gemiddeld verhoogd',
			diastolic: 'licht verhoogd',
			overall: 'gemiddeld verhoogd'
		});
	});

	it('applies custom limits inclusively', () => {
		const custom: Thresholds = {
			systolic: { licht: 130, gemiddeld: 150, ernstig: 170 },
			diastolic: { licht: 80, gemiddeld: 95, ernstig: 105 }
		};
		expect(classifyReading({ systolic: 129, diastolic: 79 }, custom).overall).toBe('normaal');
		expect(classifyReading({ systolic: 130, diastolic: 79 }, custom).overall).toBe('licht verhoogd');
		expect(classifyReading({ systolic: 129, diastolic: 105 }, custom).overall).toBe(
			'ernstig verhoogd'
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
