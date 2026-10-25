import { describe, expect, it } from 'vitest';
import { DEFAULT_THRESHOLDS, validateThresholds } from './thresholds';
import type { Thresholds } from './types';

function withSystolic(limits: Partial<Thresholds['systolic']>): Thresholds {
	return { ...DEFAULT_THRESHOLDS, systolic: { ...DEFAULT_THRESHOLDS.systolic, ...limits } };
}

describe('DEFAULT_THRESHOLDS (T3)', () => {
	it('are 135/85, 160/100 and 180/110', () => {
		expect(DEFAULT_THRESHOLDS).toEqual({
			systolic: { mild: 135, moderate: 160, severe: 180 },
			diastolic: { mild: 85, moderate: 100, severe: 110 }
		});
	});

	it('are valid', () => {
		expect(validateThresholds(DEFAULT_THRESHOLDS)).toEqual([]);
	});
});

describe('validateThresholds (T2)', () => {
	it('accepts limits exactly one apart', () => {
		expect(validateThresholds(withSystolic({ mild: 135, moderate: 136, severe: 137 }))).toEqual(
			[]
		);
	});

	it('rejects equal neighbouring limits', () => {
		expect(validateThresholds(withSystolic({ moderate: 135 }))).toEqual([
			{ kind: 'not-rising', measure: 'systolic', lower: 'mild', upper: 'moderate' }
		]);
	});

	it('rejects falling limits', () => {
		const errors = validateThresholds({
			...DEFAULT_THRESHOLDS,
			diastolic: { mild: 85, moderate: 110, severe: 100 }
		});
		expect(errors).toEqual([
			{ kind: 'not-rising', measure: 'diastolic', lower: 'moderate', upper: 'severe' }
		]);
	});

	it('rejects non-integer limits and limits outside the plausible range (C4)', () => {
		expect(validateThresholds(withSystolic({ mild: 134.5 }))).toContainEqual({
			kind: 'not-integer',
			measure: 'systolic',
			limit: 'mild'
		});
		expect(validateThresholds(withSystolic({ mild: 0 }))).toContainEqual({
			kind: 'out-of-range',
			measure: 'systolic',
			limit: 'mild'
		});
		expect(validateThresholds(withSystolic({ mild: Number.NaN }))).toContainEqual({
			kind: 'not-integer',
			measure: 'systolic',
			limit: 'mild'
		});
	});

	it.each([
		['systolic', 'mild', 59, false],
		['systolic', 'mild', 60, true],
		['systolic', 'severe', 260, true],
		['systolic', 'severe', 261, false],
		['diastolic', 'mild', 29, false],
		['diastolic', 'mild', 30, true],
		['diastolic', 'severe', 160, true],
		['diastolic', 'severe', 161, false]
	] as const)('%s %s limit %i is in range: %s', (measure, limit, value, ok) => {
		const base = {
			systolic: { mild: 60, moderate: 140, severe: 200 },
			diastolic: { mild: 30, moderate: 90, severe: 120 }
		};
		const thresholds = { ...base, [measure]: { ...base[measure], [limit]: value } };
		const errors = validateThresholds(thresholds).filter((e) => e.kind === 'out-of-range');
		expect(errors.length === 0).toBe(ok);
	});
});
