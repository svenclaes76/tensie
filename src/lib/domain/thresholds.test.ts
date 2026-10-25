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

	it('rejects non-integer and non-positive limits', () => {
		expect(validateThresholds(withSystolic({ mild: 134.5 }))).toContainEqual({
			kind: 'not-integer',
			measure: 'systolic',
			limit: 'mild'
		});
		expect(validateThresholds(withSystolic({ mild: 0 }))).toContainEqual({
			kind: 'not-positive',
			measure: 'systolic',
			limit: 'mild'
		});
		expect(validateThresholds(withSystolic({ mild: Number.NaN }))).toContainEqual({
			kind: 'not-integer',
			measure: 'systolic',
			limit: 'mild'
		});
	});
});
