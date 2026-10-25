import { describe, expect, it } from 'vitest';
import { checkValues, VALUE_RANGES } from './validation';

describe('checkValues (C4)', () => {
	it('uses systolic 60–260 and diastolic 30–160', () => {
		expect(VALUE_RANGES).toEqual({
			systolic: { min: 60, max: 260 },
			diastolic: { min: 30, max: 160 }
		});
	});

	it.each([
		[59, false],
		[60, true],
		[260, true],
		[261, false]
	])('systolic %i is in range: %s', (systolic, inRange) => {
		const warnings = checkValues({ systolic, diastolic: 40 });
		expect(warnings.includes('systolic-out-of-range')).toBe(!inRange);
	});

	it.each([
		[29, false],
		[30, true],
		[160, true],
		[161, false]
	])('diastolic %i is in range: %s', (diastolic, inRange) => {
		const warnings = checkValues({ systolic: 250, diastolic });
		expect(warnings.includes('diastolic-out-of-range')).toBe(!inRange);
	});

	it('requires systolic to be greater than diastolic', () => {
		expect(checkValues({ systolic: 81, diastolic: 80 })).toEqual([]);
		expect(checkValues({ systolic: 80, diastolic: 80 })).toEqual(['systolic-not-above-diastolic']);
		expect(checkValues({ systolic: 80, diastolic: 120 })).toEqual(['systolic-not-above-diastolic']);
	});

	it('reports every problem at once', () => {
		expect(checkValues({ systolic: 20, diastolic: 200 })).toEqual([
			'systolic-out-of-range',
			'diastolic-out-of-range',
			'systolic-not-above-diastolic'
		]);
	});
});
